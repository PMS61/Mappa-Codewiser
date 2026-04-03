/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Dashboard
   Landing-page aesthetic: generous whitespace, two-column
   layout, trace-log reasoning panel, chart-style bandwidth.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { AppProvider, useApp } from "@/lib/store";
import { formatDateHeading, slotToTime, formatDuration } from "@/lib/engine";
import Header from "@/components/Header";
import BandwidthCurve from "@/components/BandwidthCurve";
import TaskBlock from "@/components/TaskBlock";
import ReasoningChain from "@/components/ReasoningChain";
import AddTaskModal from "@/components/AddTaskModal";
import ConflictPanel from "@/components/ConflictPanel";
import {
  getTasks,
  saveTask,
  saveBulkTasks,
  saveSchedule,
  deleteTask,
  updateTaskStateAndSlot,
} from "@/app/actions/tasks";
import { priorityToNumber, taskTypeToSchedulerType } from "@/lib/scheduler";
import { TASK_TYPE_LABELS } from "@/lib/types";
import type { Task, ReasoningStep } from "@/lib/types";

function DashboardContent() {
  const { state, dispatch } = useApp();
  const [showReasoning, setShowReasoning] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isUnscheduledModalOpen, setIsUnscheduledModalOpen] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Tracks the last-persisted snapshot of each task (id → serialized state+slot)
  const prevTasksSnapRef = useRef<Map<string, string>>(new Map());
  const isInitializedRef = useRef(false);

  // ── Load tasks from DB on mount ────────────────────────
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    getTasks().then(({ tasks, error }) => {
      setIsLoadingTasks(false);
      if (error || !tasks) return; // fallback to sample data
      if (tasks.length > 0) {
        dispatch({ type: "INIT_TASKS", payload: tasks });
        prevTasksSnapRef.current = new Map(
          tasks.map((t) => [t.id, `${t.state}::${t.scheduledSlot?.startSlot ?? ""}::${t.scheduledSlot?.day ?? ""}`]),
        );
      }
    });
  }, [dispatch]);

  // ── Persist changed tasks to DB ────────────────────────
  useEffect(() => {
    if (isLoadingTasks) return;

    const snap = prevTasksSnapRef.current;
    const toSave: Task[] = [];

    for (const task of state.tasks) {
      const key = `${task.state}::${task.scheduledSlot?.startSlot ?? ""}::${task.scheduledSlot?.day ?? ""}`;
      if (snap.get(task.id) !== key) {
        toSave.push(task);
        snap.set(task.id, key);
      }
    }

    for (const task of toSave) {
      saveTask(task); // fire-and-forget; UI already updated
    }
  }, [state.tasks, isLoadingTasks]);

  // ── API-driven scheduler ───────────────────────────────
  const runApiScheduler = useCallback(async () => {
    setIsScheduling(true);
    setScheduleError(null);

    const schedulerTasks = state.tasks
      .filter((t) => t.state === "unscheduled" || t.state === "rescheduled")
      .map((t) => ({
        id: t.id,
        title: t.name,
        difficulty: t.difficulty,
        priority: priorityToNumber(t.priority),
        duration: t.duration,
        type: taskTypeToSchedulerType(t.type),
        date: t.deadline?.split("T")[0],
      }));

    if (schedulerTasks.length === 0) {
      dispatch({ type: "RUN_SCHEDULER" });
      setIsScheduling(false);
      return;
    }

    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: schedulerTasks,
          startDate: new Date().toISOString().split("T")[0],
        }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        setScheduleError(error ?? "Schedule API failed");
        setIsScheduling(false);
        return;
      }

      const result = await res.json();
      const { schedule, meta } = result as {
        schedule: Record<string, Array<{
          id: string; scheduledDate: string; energyCost: number; score: number;
        }>>;
        meta: { energyByDay: Record<string, { used: number; remaining: number }> };
      };

      const newReasoning: ReasoningStep[] = [
        ...state.reasoningChain,
        {
          number: state.reasoningChain.length + 1,
          text: `API SCHEDULER RUN: Energy model applied. ${schedulerTasks.filter(t => t.type === "work").length} work tasks, ${schedulerTasks.filter(t => t.type === "energy_gain").length} energy tasks.`,
          isRule: true,
        },
      ];

      const updatedTasks: Task[] = [...state.tasks];
      let reasoningNum = newReasoning.length + 1;

      for (const [date, dayEntries] of Object.entries(schedule)) {
        const dayEnergy = meta.energyByDay[date];
        newReasoning.push({
          number: reasoningNum++,
          text: `DAY ${date}: ${dayEntries.filter((e) => e.energyCost > 0).length} tasks scheduled. Energy used: ${dayEnergy?.used ?? "?"} / 50. Remaining: ${dayEnergy?.remaining ?? "?"}`,
          isRule: true,
        });

        for (const entry of dayEntries) {
          if (entry.energyCost === 0) continue;

          const taskIdx = updatedTasks.findIndex((t) => t.id === entry.id);
          if (taskIdx === -1) continue;

          const task = updatedTasks[taskIdx];
          const slotsNeeded = Math.ceil(task.duration / 15);
          const dayOffset = Math.max(
            0,
            Math.round(
              (new Date(date).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
            ),
          );

          const baseSlot = 36; // 9:00 AM
          const posInDay = dayEntries.filter(e => e.energyCost > 0).findIndex(e => e.id === entry.id);
          const startSlot = baseSlot + posInDay * (slotsNeeded + 1);

          updatedTasks[taskIdx] = {
            ...task,
            state: "scheduled",
            scheduledSlot: {
              startSlot,
              endSlot: startSlot + slotsNeeded,
              day: dayOffset,
              fitnessScore: entry.score,
              reasoningSteps: [
                {
                  number: 1,
                  text: `Energy cost: ${entry.energyCost.toFixed(2)} / Score: ${entry.score.toFixed(3)}`,
                  isRule: true,
                  relatedTaskId: entry.id,
                },
                {
                  number: 2,
                  text: `ACTION: Scheduled on ${date} (Day +${dayOffset})`,
                  isAction: true,
                  relatedTaskId: entry.id,
                },
              ],
            },
          };

          newReasoning.push({
            number: reasoningNum++,
            text: `SCHEDULED: "${task.name}" → ${date}. E_task=${entry.energyCost.toFixed(2)}, score=${entry.score.toFixed(3)}`,
            isAction: true,
            relatedTaskId: entry.id,
          });
        }

        saveSchedule(
          date,
          updatedTasks.filter((t) => t.scheduledSlot?.day !== undefined),
          dayEnergy?.used ?? 0,
          dayEnergy?.remaining ?? 50,
        );
      }

      dispatch({ type: "BULK_UPDATE_TASKS", payload: updatedTasks });
      dispatch({ type: "SET_DAY_PHASE", payload: "active" });
      saveBulkTasks(updatedTasks);
    } catch (err) {
      console.error("Schedule API error:", err);
      setScheduleError("Network error. Falling back to local scheduler.");
      dispatch({ type: "RUN_SCHEDULER" });
    } finally {
      setIsScheduling(false);
    }
  }, [state.tasks, state.reasoningChain, dispatch]);

  const scheduled = state.tasks
    .filter((t) => t.scheduledSlot && t.scheduledSlot.day === 0 && t.state !== "unscheduled")
    .sort((a, b) => (a.scheduledSlot?.startSlot ?? 0) - (b.scheduledSlot?.startSlot ?? 0));

  const totalCL = state.tasks
    .filter((t) => t.cl > 0 && t.scheduledSlot && t.scheduledSlot.day === 0)
    .reduce((s, t) => s + t.cl, 0);

  const recoveryCL = Math.abs(
    state.tasks
      .filter((t) => t.cl < 0 && t.scheduledSlot && t.scheduledSlot.day === 0)
      .reduce((s, t) => s + t.cl, 0),
  );

  return (
    <div style={{ minHeight: "100vh" }}>
      <Header />

      {state.burnoutRisk !== "safe" && (
        <div style={{
          background: state.burnoutRisk === "critical" ? "var(--vermillion)" : "var(--card-bg)",
          color: state.burnoutRisk === "critical" ? "var(--bg)" : "var(--vermillion)",
          padding: "12px 24px",
          textAlign: "center",
          borderBottom: "0.5px solid var(--rule)",
          fontFamily: "var(--mono)",
          fontSize: 13,
          fontWeight: 600
        }}>
          [!] BURNOUT RISK STATE: {state.burnoutRisk.toUpperCase()} — {
            state.burnoutRisk === "critical"
              ? "Critical overload detected. High CL tasks are now blocked from scheduling."
              : state.burnoutRisk === "warning"
                ? "Elevated continuous load. Forced light day recommended within 72 hours."
                : "Watch state active. Monitoring aggregate duration."
          }
        </div>
      )}

      {/* ── Hero Section: Date + Stats ── */}
      <section className="container section-rule" style={{ paddingTop: 60, paddingBottom: 40 }}>
        <div className="responsive-grid-hero" style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 60, alignItems: "start" }}>
          <div>
            <div className="meta-text" style={{ marginBottom: 16 }}>
              {state.dayPhase.toUpperCase()} PHASE
            </div>
            <h1 style={{ fontSize: 42, marginBottom: 24 }}>
              {formatDateHeading(state.currentDate)}
            </h1>
            <p style={{ color: "var(--muted)", maxWidth: 380, marginBottom: 24 }}>
              {scheduled.length} tasks scheduled · {state.tasks.filter((t) => t.state === "completed").length} completed
            </p>

            <div
              className="meta-text responsive-grid-stats"
              style={{
                borderTop: "0.5px solid var(--rule)",
                paddingTop: 16,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>Total CL</div>
                <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4, color: "var(--ink)" }}>
                  {totalCL.toFixed(1)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>Recovery</div>
                <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4, color: "var(--safe)" }}>
                  -{recoveryCL.toFixed(1)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>Net</div>
                <div style={{
                  fontWeight: 700,
                  fontSize: 20,
                  marginTop: 4,
                  color: (totalCL - recoveryCL) > 35 ? "var(--vermillion)" : "var(--ink)",
                }}>
                  {(totalCL - recoveryCL).toFixed(1)}
                </div>
              </div>
            </div>
          </div>

          {/* Bandwidth chart */}
          <div>
            <div className="meta-text" style={{ marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
              <span>Mental Energy / Today</span>
              <span style={{ color: "var(--vermillion)" }}>CL Demand</span>
            </div>
            <BandwidthCurve />
          </div>
        </div>
      </section>

      {/* ── Scheduler Controls ── */}
      <section className="container section-rule" style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <button
            className="btn btn-sm btn-primary"
            onClick={runApiScheduler}
            disabled={isScheduling}
            style={{ opacity: isScheduling ? 0.6 : 1, cursor: isScheduling ? "not-allowed" : "pointer" }}
          >
            {isScheduling ? "Scheduling…" : "Run Scheduler"}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setShowReasoning(!showReasoning)}
          >
            {showReasoning ? "Hide Reasoning" : `Reasoning Chain (${state.reasoningChain.length})`}
          </button>
          {isLoadingTasks && (
            <span className="meta-text" style={{ color: "var(--muted)" }}>Loading tasks…</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {scheduleError && (
            <span className="meta-text" style={{ color: "var(--vermillion)", fontSize: 11 }}>
              [!] {scheduleError}
            </span>
          )}
          <button
            className="btn btn-sm"
            style={{ background: "var(--card-bg)" }}
            onClick={() => setIsUnscheduledModalOpen(true)}
          >
            Unscheduled Pool ({state.tasks.filter((t) => t.state === "unscheduled").length})
          </button>
        </div>
      </section>

      {/* ── Main content ── */}
      <section
        className={`container ${showReasoning ? 'responsive-grid-split' : ''}`}
        style={{
          paddingTop: 40,
          paddingBottom: 80,
          display: "grid",
          gridTemplateColumns: showReasoning ? "1fr 1fr" : "1fr",
          gap: 60,
        }}
      >
        {/* Schedule List */}
        <div>
          {/* Current Task Box */}
          {(() => {
            const now = new Date();
            const currentSlot = Math.floor((now.getHours() * 60 + now.getMinutes()) / 15);

            const taskInCurrentSlot = scheduled.find(t =>
              currentSlot >= (t.scheduledSlot?.startSlot ?? 0) &&
              currentSlot < (t.scheduledSlot?.endSlot ?? 0)
            );

            const currentTask = taskInCurrentSlot && taskInCurrentSlot.state !== "completed" ? taskInCurrentSlot : null;

            if (!currentTask) {
              return (
                <div style={{ marginBottom: 48 }}>
                  <div className="meta-text" style={{ marginBottom: 16 }}>Current Focus</div>
                  <div style={{
                    background: "var(--bg)",
                    border: "0.5px dashed var(--muted)",
                    padding: "32px 24px",
                    textAlign: "center"
                  }}>
                    <div className="meta-text" style={{ marginBottom: 24, color: "var(--muted)" }}>
                      Slot {currentSlot} Active · No tasks scheduled for current time blocks.
                    </div>
                    <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                      <button className="btn btn-primary" onClick={() => dispatch({ type: "TOGGLE_ADD_TASK" })}>
                        + Add Task
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div style={{ marginBottom: 48 }}>
                <div className="meta-text" style={{ marginBottom: 16 }}>Current Focus</div>
                <div style={{
                  background: "var(--card-bg)",
                  border: "0.5px solid var(--rule)",
                  borderLeft: `4px solid ${Math.abs(currentTask.cl) > 7 ? 'var(--vermillion)' : 'var(--ink)'}`,
                  padding: "24px",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{currentTask.name}</h3>
                    <span className="meta-text">
                      {slotToTime(currentTask.scheduledSlot!.startSlot)} – {slotToTime(currentTask.scheduledSlot!.endSlot)}
                    </span>
                  </div>
                  <div className="meta-text" style={{ marginBottom: 24, display: "flex", gap: 12 }}>
                    <span style={{ fontWeight: 700, color: "var(--ink)" }}>CL {currentTask.cl.toFixed(1)}</span>
                    <span>·</span>
                    <span>{formatDuration(currentTask.duration)}</span>
                  </div>
                  <button
                    className="btn btn-primary"
                    style={{ width: "100%" }}
                    onClick={async () => {
                      dispatch({ type: "UPDATE_TASK_STATE", payload: { taskId: currentTask.id, state: "completed" } });
                      await updateTaskStateAndSlot(currentTask.id, "completed", currentTask.scheduledSlot);
                    }}
                  >
                    Mark as Complete ✓
                  </button>
                </div>
              </div>
            );
          })()}

          <div className="meta-text" style={{ marginBottom: 16 }}>Today&apos;s Schedule</div>

          {scheduled.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center" }}>
              <p style={{ color: "var(--muted)", marginBottom: 16 }}>
                No tasks scheduled yet. Add tasks and run the scheduler.
              </p>
              <button className="btn" onClick={() => dispatch({ type: "TOGGLE_ADD_TASK" })}>
                + Add First Task
              </button>
            </div>
          ) : (
            scheduled.map((task) => (
              <TaskBlock key={task.id} task={task} />
            ))
          )}
        </div>

        {/* Reasoning chain */}
        {showReasoning && <ReasoningChain />}
      </section>

      <AddTaskModal />
      <ConflictPanel />

      {/* ── Unscheduled Pool Modal ── */}
      {isUnscheduledModalOpen && (
        <div style={{
          position: "fixed",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "rgba(10,10,12,0.8)",
          backdropFilter: "blur(4px)",
          display: "flex",
          justifyContent: "flex-end",
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
                style={{ background: "transparent", border: "none", color: "var(--ink)", fontSize: 24, cursor: "pointer" }}
                onClick={() => setIsUnscheduledModalOpen(false)}
              >
                ✕
              </button>
            </div>
            {state.tasks.filter(t => t.state === "unscheduled").length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No tasks in the unscheduled pool.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {state.tasks.filter(t => t.state === "unscheduled").map(task => (
                  <div
                    key={task.id}
                    style={{ padding: 16, border: "0.5px solid var(--rule)", cursor: "pointer", background: "var(--bg)" }}
                    onClick={() => {
                      setSelectedTask(task);
                      setIsUnscheduledModalOpen(false);
                    }}
                  >
                    <div className="meta-text" style={{ marginBottom: 8, color: "var(--muted)" }}>
                      {TASK_TYPE_LABELS[task.type] ?? task.type.toUpperCase()}
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

      {/* ── Task Detail Panel ── */}
      {selectedTask && (
        <div style={{
          position: "fixed",
          top: 0, right: 0, bottom: 0,
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

          <div style={{ marginTop: 32, display: "flex", justifyContent: "flex-end" }}>
            <button
              className="btn"
              style={{ color: "var(--vermillion)", borderColor: "var(--vermillion)" }}
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

export default function Dashboard() {
  return (
    <AppProvider>
      <DashboardContent />
    </AppProvider>
  );
}
