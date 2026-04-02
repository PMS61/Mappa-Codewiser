/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Dashboard
   Landing-page aesthetic: generous whitespace, two-column
   layout, trace-log reasoning panel, chart-style bandwidth.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useState } from "react";
import { AppProvider, useApp } from "@/lib/store";
import { formatDateHeading, slotToTime, formatDuration } from "@/lib/engine";
import Header from "@/components/Header";
import BandwidthCurve from "@/components/BandwidthCurve";
import TaskBlock from "@/components/TaskBlock";
import ReasoningChain from "@/components/ReasoningChain";
import AddTaskModal from "@/components/AddTaskModal";
import ConflictPanel from "@/components/ConflictPanel";

function DashboardContent() {
  const { state, dispatch } = useApp();
  const [showReasoning, setShowReasoning] = useState(false);

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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 60, alignItems: "start" }}>
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
              className="meta-text"
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
          <button className="btn btn-sm btn-primary" onClick={() => dispatch({ type: "RUN_SCHEDULER" })}>
            Run Scheduler
          </button>
          <button
            className="btn btn-sm"
            onClick={() => setShowReasoning(!showReasoning)}
          >
            {showReasoning ? "Hide Reasoning" : `Reasoning Chain (${state.reasoningChain.length})`}
          </button>
        </div>
        <span className="meta-text">
          {state.tasks.filter((t) => t.state === "unscheduled").length} unscheduled
        </span>
      </section>

      {/* ── Main content ── */}
      <section
        className="container"
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
