/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Conflict Resolution Panel
   Landing aesthetic: trace-log reasoning, clean buttons.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useApp } from "@/lib/store";
import { updateTaskStateAndSlot } from "@/app/actions/tasks";

export default function ConflictPanel() {
  const { state, dispatch } = useApp();
  const conflict = state.activeConflict;
  if (!conflict) return null;

  const resolutions: Record<string, { label: string; desc: string }> = {
    defer: { label: "Defer", desc: "Move to tomorrow if deadline allows" },
    sacrifice: { label: "Sacrifice Depth", desc: "Reduce CL by 30% — accepting quality trade-off" },
    extend_deadline: { label: "Extend Deadline", desc: "Only for Normal/Low priority tasks" },
    manual_escalate: { label: "Manual Escalate", desc: "Requires user decision" },
  };

  return (
    <div className="modal-overlay" onClick={() => dispatch({ type: "SET_CONFLICT", payload: null })}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="meta-text" style={{ marginBottom: 16, color: "var(--vermillion)" }}>Scheduling Conflict</div>
        <h2 style={{ marginBottom: 24 }}>Cannot Place Task</h2>

        <p style={{ color: "var(--muted)", marginBottom: 24 }}>{conflict.reason}</p>

        {/* Reasoning trace-log */}
        <div className="trace-log" style={{ marginBottom: 32, padding: 24 }}>
          {conflict.reasoningSteps.map((step) => (
            <div key={step.number} className={`log-line ${step.isConflict ? "conflict" : ""}`}>
              {step.number}. {step.text}
            </div>
          ))}
        </div>

        {/* Resolution options */}
        <div className="meta-text" style={{ marginBottom: 16 }}>Resolution Options</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {conflict.availableResolutions.map((res) => {
            const info = resolutions[res];
            return (
              <button
                key={res}
                className="btn"
                style={{ width: "100%", textAlign: "left", display: "flex", justifyContent: "space-between", padding: "12px 20px" }}
                onClick={async () => {
                   const newState = res === "sacrifice" ? "sacrificed" : res === "extend_deadline" ? "deadline_extended" : "rescheduled";
                   dispatch({ type: "RESOLVE_CONFLICT", payload: { taskId: conflict.taskId, resolution: res } });
                   await updateTaskStateAndSlot(conflict.taskId, newState, undefined);
                }}
              >
                <span>{info.label}</span>
                <span className="meta-text">{info.desc}</span>
              </button>
            );
          })}
        </div>

        <button className="btn btn-sm" onClick={() => dispatch({ type: "SET_CONFLICT", payload: null })}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
