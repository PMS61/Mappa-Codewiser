/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Interactive Scheduler View
   Landing-page aesthetic: clean tabular drag/drop UI, 
   RAG input field, and the 96x7 Matrix.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect } from "react";
import { AppProvider, useApp } from "@/lib/store";
import MatrixView from "./MatrixView";
import AddTaskModal from "@/components/AddTaskModal";
import { TASK_TYPE_LABELS } from "@/lib/types";

import { DndContext, DragEndEvent } from "@dnd-kit/core";

function SchedulerContent() {
  const { state, dispatch } = useApp();
  const [selectedTask, setSelectedTask] = useState<any>(null);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && over.id) {
      const dropId = String(over.id);
      if (dropId.startsWith("slot-")) {
        const parts = dropId.split("-");
        const day = parseInt(parts[1], 10);
        const slot = parseInt(parts[2], 10);
        dispatch({
          type: "SCHEDULE_TASK_MANUALLY",
          payload: { taskId: String(active.id), startSlot: slot, day }
        });
      }
    }
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Nav */}
      <header className="nav">
        <div className="nav-inner">
          <a href="/" className="logo">Axiom</a>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <a href="/dashboard" className="nav-link">Dashboard</a>
            <a href="/tasks" className="nav-link active">Tasks / Matrix</a>
            <a href="/report" className="nav-link">Report</a>
            <button
              className="btn btn-sm"
              style={{ marginLeft: 8 }}
              onClick={() => dispatch({ type: "TOGGLE_ADD_TASK" })}
            >
              + Task
            </button>
          </div>
        </div>
      </header>
      <div className="mobile-spacer" style={{ height: 60 }} />

      {/* RAG Input Section */}
      <section className="container section-rule" style={{ paddingTop: 40, paddingBottom: 40 }}>
        <div className="meta-text" style={{ marginBottom: 16 }}>RAG-Powered Extraction</div>
        <h2 style={{ marginBottom: 16 }}>Generate Tasks from Context</h2>
        
        <div style={{ background: "var(--card-bg)", border: "0.5px solid var(--rule)", padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
          <textarea 
            placeholder="Paste syllabus, email thread, or meeting notes here. Axiom will extract tasks and assign appropriate CL scores..."
            style={{ 
              width: "100%", 
              minHeight: 120, 
              border: "none", 
              background: "transparent",
              resize: "vertical",
              fontFamily: "var(--mono)",
              fontSize: 13,
              outline: "none"
            }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "0.5px solid var(--rule)", paddingTop: 16 }}>
            <span className="meta-text" style={{ color: "var(--muted)" }}>Model: Axiom-Extraction-v1 (Streaming)</span>
            <button className="btn btn-primary">Extract Tasks &gt;</button>
          </div>
        </div>
      </section>

      {/* Interactive Matrix Drag/Drop Panel */}
      <DndContext onDragEnd={handleDragEnd}>
        <main className="container" style={{ paddingTop: 40, paddingBottom: 80 }}>
          
          {/* Full Width Matrix */}
          <div>
            <div className="meta-text" style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>Global 96×7 Schedule Matrix</span>
              <button className="btn btn-sm btn-primary" onClick={() => dispatch({ type: "RUN_SCHEDULER" })}>Auto Schedule</button>
            </div>
            <MatrixView onTaskClick={setSelectedTask} />
          </div>

        </main>
      </DndContext>

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
        </div>
      )}
    </div>
  );
}

export default function TasksView() {
  return (
    <AppProvider>
      <SchedulerContent />
    </AppProvider>
  );
}
