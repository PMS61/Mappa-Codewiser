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
import { getTasks, saveTask, saveBulkTasks, saveSchedule } from "@/app/actions/tasks";
import { priorityToNumber, taskTypeToSchedulerType } from "@/lib/scheduler";
import type { Task, ReasoningStep } from "@/lib/types";

function DashboardContent() {
  const { state, dispatch } = useApp();
  const [showReasoning, setShowReasoning] = useState(false);
  const [isLoadingTasks, setIsLoadingTasks] = useState(true);
  const [isScheduling, setIsScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Tracks the last-persisted snapshot of each task (by id → serialized state+slot)
  const prevTasksSnapRef = useRef<Map<string, string>>(new Map());
  const isInitializedRef = useRef(false);

  // ── Load tasks from DB on mount ────────────────────────
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    getTasks().then(({ tasks, error }) => {
      setIsLoadingTasks(false);
      if (error || !tasks) return; // fallback to sample data if not authed/error
      if (tasks.length > 0) {
        dispatch({ type: "INIT_TASKS", payload: tasks });
        // Seed the snapshot so we don't re-write everything immediately
        prevTasksSnapRef.current = new Map(
          tasks.map((t) => [t.id, `${t.state}::${t.scheduledSlot?.startSlot ?? ""}`]),
        );
      }
    });
  }, [dispatch]);

  // ── Persist tasks to DB (only changed/new tasks) ──────
  useEffect(() => {
    if (isLoadingTasks) return; // wait for initial load before persisting

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

    // Map app tasks → scheduler format
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
      // Fall back to the local scheduler for already-scheduled tasks
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

      // Build reasoning chain from schedule result
      const newReasoning: ReasoningStep[] = [
        ...state.reasoningChain,
        {
          number: state.reasoningChain.length + 1,
          text: `API SCHEDULER RUN: Energy model applied. ${schedulerTasks.filter(t => t.type === "work").length} work tasks, ${schedulerTasks.filter(t => t.type === "energy_gain").length} energy tasks.`,
          isRule: true,
        },
      ];

      // Map schedule result back to Task state updates
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
          if (entry.energyCost === 0) continue; // energy_gain entries don't update task state

          const taskIdx = updatedTasks.findIndex((t) => t.id === entry.id);
          if (taskIdx === -1) continue;

          // Convert date to slot (schedule API doesn't assign slots, we assign day-level)
          // We place tasks sequentially using the existing slot logic in the store
          const task = updatedTasks[taskIdx];
          const slotsNeeded = Math.ceil(task.duration / 15);
          const dayOffset = Math.max(
            0,
            Math.round(
              (new Date(date).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000,
            ),
          );

          // Assign to morning slot (slot 36 = 9:00 AM) + offset for ordering within day
          const baseSlot = 36;
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

        // Persist daily schedule to DB
        saveSchedule(
          date,
          updatedTasks.filter((t) => t.scheduledSlot?.day !== undefined),
          dayEnergy?.used ?? 0,
          dayEnergy?.remaining ?? 50,
        );
      }

      dispatch({ type: "BULK_UPDATE_TASKS", payload: updatedTasks });
      // Also update the reasoning chain via a local scheduler run to merge
      dispatch({ type: "SET_DAY_PHASE", payload: "active" });

      // Persist all updated tasks
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
    .filter((t) => t.scheduledSlot && t.state !== "unscheduled")
    .sort((a, b) => (a.scheduledSlot?.startSlot ?? 0) - (b.scheduledSlot?.startSlot ?? 0));

  const totalCL = state.tasks
    .filter((t) => t.cl > 0 && t.scheduledSlot)
    .reduce((s, t) => s + t.cl, 0);

  const recoveryCL = Math.abs(
    state.tasks
      .filter((t) => t.cl < 0 && t.scheduledSlot)
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

          {/* Bandwidth chart — landing SVG style */}
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
          <span className="meta-text">
            {state.tasks.filter((t) => t.state === "unscheduled").length} unscheduled
          </span>
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
                      <button className="btn" onClick={() => dispatch({ type: "TOGGLE_ADD_TASK" })}>
                        + Log Recreational Activity
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
                    onClick={() => dispatch({ type: "UPDATE_TASK_STATE", payload: { taskId: currentTask.id, state: "completed" } })}
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

        {/* Reasoning chain (matching trace-log from landing) */}
        {showReasoning && <ReasoningChain />}
      </section>

      <AddTaskModal />
      <ConflictPanel />
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
