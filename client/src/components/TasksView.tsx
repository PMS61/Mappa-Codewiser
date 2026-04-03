/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Interactive Scheduler View
   Landing-page aesthetic: clean tabular drag/drop UI, 
   RAG input field, and the 96x7 Matrix.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect, useRef } from "react";
import { useApp } from "@/lib/store";
import MatrixView from "./MatrixView";
import AddTaskModal from "@/components/AddTaskModal";
import Header from "@/components/Header";
import { TASK_TYPE_LABELS } from "@/lib/types";
import { getTasks, deleteTask, updateTaskStateAndSlot, syncTasks, addTask } from "@/app/actions/tasks";
import { getUserProfile } from "@/app/actions/auth";
import { isSlotBlocked, runSchedulingAlgorithm } from "@/lib/engine";
import { chunkText, topK, buildTasksFromRAG, extractTextFromFile } from "@/lib/rag-engine";
import { getEmbeddingPipeline } from "@/lib/transformers-pipeline";
import { DndContext, DragEndEvent } from "@dnd-kit/core";


function SchedulerContent() {
  const { state, dispatch } = useApp();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [isUnscheduledModalOpen, setIsUnscheduledModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // ── RAG Extraction State ──
  const [ragInput, setRagInput] = useState("");
  const [ragTopic, setRagTopic] = useState("");
  const [ragDeadline, setRagDeadline] = useState("in 2 weeks");
  const [ragStatus, setRagStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [ragProgress, setRagProgress] = useState("");
  const [ragError, setRagError] = useState("");


  useEffect(() => {
    async function load() {
      const { tasks, error } = await getTasks();
      if (!error && tasks) {
        dispatch({ type: "SET_TASKS", payload: tasks });
      }

      const { user, error: profileErr } = await getUserProfile();
      if (!profileErr && user) {
        dispatch({ type: "SET_USER_PROFILE", payload: user });
      }
    }
    load();
  }, [dispatch]);

  const handleAutoSchedule = async () => {
    const result = runSchedulingAlgorithm(
      state.tasks,
      state.adjustedBandwidthCurve,
      state.userProfile,
      state.reasoningChain
    );
    
    dispatch({ type: "SET_TASKS", payload: result.tasks });
    if (result.conflict) {
      dispatch({ type: "SET_CONFLICT", payload: result.conflict });
    }
    
    await syncTasks(result.tasks);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setRagStatus("loading");
    setRagProgress(`Reading ${file.name}...`);
    try {
      const text = await extractTextFromFile(file, (msg) => setRagProgress(msg));
      setRagInput(text);
      setRagStatus("idle");
    } catch (err: any) {
      setRagError(err.message || "Failed to read file.");
      setRagStatus("error");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleExtractTasks = async () => {
    if (!ragInput.trim()) return setRagError("Please provide some context text first.");
    if (!ragTopic.trim()) return setRagError("Please enter a topic or learning goal.");
    
    setRagStatus("loading");
    setRagError("");
    setRagProgress("Initialising embedding model...");
    
    try {
      const pipe = await getEmbeddingPipeline((msg) => setRagProgress(msg));
      
      setRagProgress("Chunking text...");
      const chunks = chunkText(ragInput);
      if (chunks.length === 0) throw new Error("No extractable content found in provided text.");
      
      const cEmbs: number[][] = [];
      for (let i = 0; i < chunks.length; i++) {
        setRagProgress(`Embedding chunk ${i + 1} / ${chunks.length}`);
        const out = await pipe([chunks[i]], { pooling: "mean", normalize: true });
        cEmbs.push(out.data ? Array.from(out.data as any) : (out as any).tolist()[0]);
      }
      
      setRagProgress("Embedding topic query...");
      const qOut = await pipe([`Learning topics for ${ragTopic}`], { pooling: "mean", normalize: true });
      const qEmb = Array.from(qOut.data as Float32Array);
      
      setRagProgress("Retrieving relevant chunks...");
      const retrieved = topK(qEmb, cEmbs, chunks, Math.min(12, chunks.length));
      
      setRagProgress("Generating tasks via rules engine...");
      const generated = buildTasksFromRAG(retrieved, ragTopic, ragDeadline);
      
      setRagProgress("Syncing with database...");
      for (const t of generated) {
        const id = crypto.randomUUID();
        const { error } = await addTask({
          id,
          name: t.name,
          subject: t.subject,
          type: t.type as any,
          difficulty: t.difficulty,
          duration: t.duration,
          priority: t.priority as any,
          state: "unscheduled",
          deadline: t.deadline,
          cl: t.cl,
          order: t.order,
          clBreakdown: {
            baseDifficulty: t.difficulty,
            durationWeight: t.duration / 30, // example weighting
            deadlineUrgency: 1.0,
            typeMultiplier: (t as any).multiplier || 1.0,
            priorityWeight: t.priority === "high" ? 1.5 : 1.0,
            total: t.cl
          },
          createdAt: new Date().toISOString()
        });
        if (error) console.error("Failed to sync task:", t.name, error);
      }

      // Refresh tasks from server
      const { tasks, error: fetchErr } = await getTasks();
      if (!fetchErr && tasks) {
        dispatch({ type: "SET_TASKS", payload: tasks });
      }

      setRagStatus("done");
      setRagProgress("Extraction complete!");
      setRagInput(""); // Clear on success
    } catch (err: any) {
      console.error("Extraction error:", err);
      setRagError(err.message || "Failed to extract tasks.");
      setRagStatus("error");
    }
  };


  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && over.id) {
      const dropId = String(over.id);
      if (dropId.startsWith("slot-")) {
        const parts = dropId.split("-");
        const day = parseInt(parts[1], 10);
        const slot = parseInt(parts[2], 10);
        
        const taskId = String(active.id);
        const task = state.tasks.find((t) => t.id === taskId);
        
        // Correctly map the day index (0-6) into the actual day of the week (Sun-Sat)
        const today = new Date();
        const dropDate = new Date(today);
        dropDate.setDate(today.getDate() + day);
        const actualDayOfWeek = dropDate.getDay();
        
        // ── Validation: Check if slot is blocked ──
        if (isSlotBlocked(slot, actualDayOfWeek, state.userProfile)) {
          console.warn("[Matrix] Drop rejected: Slot is blocked by availability/sleep constraints.");
          return;
        }
        
        dispatch({
          type: "SCHEDULE_TASK_MANUALLY",
          payload: { taskId, startSlot: slot, day }
        });

        if (task) {
           const slotsNeeded = Math.ceil(task.duration / 15);
           const newSlot = {
             startSlot: slot,
             endSlot: slot + slotsNeeded,
             day,
             fitnessScore: 5.0,
             reasoningSteps: []
           };
           await updateTaskStateAndSlot(taskId, "scheduled", newSlot);
        }
      }
    }
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Nav */}
      <Header />

      {/* RAG Input Section */}
      <section className="container section-rule" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <div className="meta-text" style={{ marginBottom: 16 }}>RAG-Powered Extraction</div>
        <h2 style={{ marginBottom: 16 }}>Generate Tasks from Context</h2>
        
        {ragStatus === "loading" ? (
          <div style={{ background: "var(--card-bg)", border: "0.5px solid var(--rule)", padding: "48px 24px", textAlign: "center", display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, color: "var(--vermillion)" }}>
              {ragProgress}...
            </div>
            <div style={{ width: "100%", height: 1, background: "var(--rule)", position: "relative", overflow: "hidden" }}>
              <div style={{ 
                position: "absolute", 
                height: "100%", 
                background: "var(--vermillion)", 
                width: "60%", 
                left: "-60%",
                animation: "pgbar 2s ease-in-out infinite"
              }} />
            </div>
            <style jsx>{`
              @keyframes pgbar {
                0% { left: -60%; width: 30%; }
                50% { left: 40%; width: 60%; }
                100% { left: 100%; width: 30%; }
              }
            `}</style>
          </div>
        ) : (
          <div style={{ background: "var(--card-bg)", border: "0.5px solid var(--rule)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            {ragError && (
              <div style={{ padding: "8px 12px", background: "rgba(255,100,100,0.1)", color: "var(--vermillion)", fontSize: 13, border: "0.5px solid var(--vermillion)", marginBottom: 8 }}>
                {ragError}
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label className="meta-text" style={{ marginBottom: 8, display: "block" }}>Topic/Goal</label>
                <input 
                  type="text"
                  placeholder="Graph Algorithms, Midterm Review, etc."
                  value={ragTopic}
                  onChange={(e) => setRagTopic(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", background: "var(--bg)", border: "0.5px solid var(--rule)", color: "var(--fg)", fontFamily: "var(--mono)", fontSize: 13, outline: "none" }}
                />
              </div>
              <div>
                <label className="meta-text" style={{ marginBottom: 8, display: "block" }}>Final Deadline</label>
                <input 
                  type="text"
                  placeholder="in 2 weeks, in 3 days, etc."
                  value={ragDeadline}
                  onChange={(e) => setRagDeadline(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", background: "var(--bg)", border: "0.5px solid var(--rule)", color: "var(--fg)", fontFamily: "var(--mono)", fontSize: 13, outline: "none" }}
                />
              </div>
            </div>
            <textarea 
              placeholder="Paste syllabus, email thread, or meeting notes here. Axiom will extract tasks and assign appropriate CL scores..."
              value={ragInput}
              onChange={(e) => setRagInput(e.target.value)}
              style={{ 
                width: "100%", 
                minHeight: 120, 
                border: "none", 
                background: "transparent",
                resize: "vertical",
                fontFamily: "var(--mono)",
                fontSize: 13,
                outline: "none",
                padding: "12px 0"
              }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span className="meta-text" style={{ color: "var(--muted)" }}>Model: Axiom-Extraction-v1 (Streaming)</span>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: "4px 8px", fontSize: 11 }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Upload Source (PDF/IMG)
                </button>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  style={{ display: "none" }} 
                  accept=".pdf,image/*,.txt"
                  onChange={handleFileUpload}
                />
              </div>
              <button 
                className="btn btn-primary"
                onClick={handleExtractTasks}
              >
                Extract Tasks &gt;
              </button>
            </div>
          </div>
        )}
      </section>


      {/* Interactive Matrix Drag/Drop Panel */}
      <DndContext onDragEnd={handleDragEnd}>
        <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
          
          {/* Full Width Matrix */}
          <div>
            <div className="meta-text" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Global 96×7 Schedule Matrix</span>
              <div style={{ display: "flex", gap: 12 }}>
                <button 
                  className="btn btn-sm" 
                  style={{ background: "var(--card-bg)" }} 
                  onClick={() => setIsUnscheduledModalOpen(true)}
                >
                  Unscheduled Pool ({state.tasks.filter((t) => t.state === "unscheduled").length})
                </button>
                <button className="btn btn-sm btn-primary" onClick={handleAutoSchedule}>Auto Schedule</button>
              </div>
            </div>
            <MatrixView onTaskClick={setSelectedTask} />
          </div>

        </main>
      </DndContext>

      {/* Unscheduled Modal */}
      {isUnscheduledModalOpen && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: "rgba(10,10,12,0.8)",
          backdropFilter: "blur(4px)",
          display: "flex",
          justifyContent: "flex-end", // Slide from right
          zIndex: 99999
        }}>
          <div style={{
            background: "var(--card-bg)",
            width: "100%",
            maxWidth: 400,
            borderLeft: "0.5px solid var(--rule)",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            padding: "32px 24px",
            overflowY: "auto"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>Unscheduled Pool</h2>
              <button 
                style={{ background: "transparent", border: "none", color: "var(--fg)", fontSize: 24, cursor: "pointer" }}
                onClick={() => setIsUnscheduledModalOpen(false)}
              >
                ✕
              </button>
            </div>
            {state.tasks.filter(t => t.state === "unscheduled").length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No tasks in the unscheduled pool. They've all been assigned to the matrix!</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {state.tasks.filter(t => t.state === "unscheduled").map(task => (
                  <div key={task.id} style={{ 
                    padding: 16, border: "0.5px solid var(--rule)", cursor: "pointer", background: "var(--bg)" 
                  }} onClick={() => {
                    setSelectedTask(task);
                    setIsUnscheduledModalOpen(false);
                  }}>
                    <div className="meta-text" style={{ marginBottom: 8, color: "var(--muted)" }}>
                      {TASK_TYPE_LABELS[task.type] || task.type.toUpperCase()}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>{task.name}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", display: "flex", justifyContent: "space-between" }}>
                      <span>CL: {task.cl.toFixed(1)}</span>
                      <span>{task.duration}m</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task Preview Modal Right Panel */}
      <AddTaskModal />

      {selectedTask && (
        <div style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: "100%",
          maxWidth: 400,
          background: "var(--card-bg)",
          borderLeft: "0.5px solid var(--rule)",
          zIndex: 100000,
          padding: "32px 24px",
          boxShadow: "-10px 0 40px rgba(0,0,0,0.1)",
          overflowY: "auto"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 32 }}>
            <h2 style={{ fontSize: 24, margin: 0, fontWeight: 700 }}>Task Details</h2>
            <button 
              style={{ cursor: "pointer", background: "transparent", border: "none", fontSize: 20 }}
              onClick={() => setSelectedTask(null)}
            >
              ✕
            </button>
          </div>

          <div className="meta-text" style={{ marginBottom: 12 }}>Task Name</div>
          <h3 style={{ fontSize: 18, marginBottom: 32, fontWeight: 500 }}>{selectedTask.name}</h3>

          <div className="meta-text" style={{ marginBottom: 16 }}>Properties</div>
          <div className="trace-log" style={{ padding: 24, marginBottom: 32 }}>
            <div className="log-line rule">State: {selectedTask.state.toUpperCase()}</div>
            <div className="log-line rule">Type: {selectedTask.type}</div>
            <div className="log-line rule">Duration: {selectedTask.duration}m</div>
            <div className="log-line rule">Priority: {selectedTask.priority}</div>
            <div className="log-line rule">Difficulty: {selectedTask.difficulty}/10</div>
          </div>

          <div className="meta-text" style={{ marginBottom: 16 }}>Cognitive Load Score</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 24 }}>
            <span style={{ fontSize: 32, fontWeight: 700, color: Math.abs(selectedTask.cl) > 7 ? 'var(--vermillion)' : 'var(--ink)' }}>
              {selectedTask.cl.toFixed(2)}
            </span>
            <span className="meta-text">Base CL</span>
          </div>

          {selectedTask.clBreakdown && (
            <>
              <div className="meta-text" style={{ marginBottom: 12 }}>Load Breakdown</div>
              <div style={{ border: "0.5px solid var(--rule)", padding: "16px", background: "var(--bg)" }}>
                <pre style={{ margin: 0, fontFamily: "var(--mono)", fontSize: 11, color: "var(--muted)", whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(selectedTask.clBreakdown, null, 2)}
                </pre>
              </div>
            </>
          )}

          <div style={{ marginTop: 32, display: "flex", justifyContent: "space-between", gap: 12 }}>
            {selectedTask.state === "scheduled" && (
              <button 
                className="btn btn-primary"
                style={{ flex: 1 }}
                onClick={async () => {
                  dispatch({ type: "UPDATE_TASK_STATE", payload: { taskId: selectedTask.id, state: "completed" } });
                  await updateTaskStateAndSlot(selectedTask.id, "completed", selectedTask.scheduledSlot);
                  setSelectedTask(null);
                }}
              >
                Mark as Complete ✓
              </button>
            )}
            <button 
              className="btn text-vermillion" 
              style={{ flex: selectedTask.state === "scheduled" ? 0 : 1, borderColor: "var(--vermillion)" }}
              onClick={async () => {
                dispatch({ type: "DELETE_TASK", payload: selectedTask.id });
                setSelectedTask(null);
                await deleteTask(selectedTask.id);
              }}
            >
              Delete Task
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TasksView() {
  return <SchedulerContent />;
}
