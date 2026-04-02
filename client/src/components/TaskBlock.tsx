/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Task Block
   Matches landing page trace-log aesthetic: left-border
   coded lines, clean hover states, generous padding.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect } from "react";
import { useApp } from "@/lib/store";
import { slotToTime, formatDuration, clToBorderClass } from "@/lib/engine";
import type { Task } from "@/lib/types";

interface TaskBlockProps {
  task: Task;
  isCompact?: boolean;
}

export default function TaskBlock({ task, isCompact = false }: TaskBlockProps) {
  const { state, dispatch } = useApp();
  const isHighlighted = state.highlightedTaskId === task.id;
  const isRecreational = task.type === "recreational";
  const borderClass = clToBorderClass(task.cl);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    let interval: any;
    if (task.state === "in_progress") {
      interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [task.state]);

  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`;
  };

  const timeRange = task.scheduledSlot
    ? `${slotToTime(task.scheduledSlot.startSlot)}–${slotToTime(task.scheduledSlot.endSlot)}`
    : "—";

  return (
    <div
      className={`task-block ${borderClass}`}
      onMouseEnter={() => dispatch({ type: "HIGHLIGHT_TASK", payload: task.id })}
      onMouseLeave={() => dispatch({ type: "HIGHLIGHT_TASK", payload: null })}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        {/* Left: CL + Name */}
        <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 24,
              fontWeight: 700,
              lineHeight: 1,
              minWidth: 48,
              color: isRecreational
                ? "var(--safe)"
                : Math.abs(task.cl) > 7
                  ? "var(--vermillion)"
                  : "var(--ink)",
            }}
          >
            {task.cl.toFixed(1)}
          </span>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>
              {task.name}
            </div>
            {!isCompact && (
              <div className="meta-text">
                {timeRange} · {formatDuration(task.duration)}
                {task.subject && ` · ${task.subject}`}
              </div>
            )}
          </div>
        </div>

        {/* Right: State tag & Timer */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <span className={`status-tag status-${task.state === "in_progress" ? "inprogress" : task.state}`}>
            {task.state === "in_progress"
              ? "Active"
              : task.state.replace(/_/g, " ")}
          </span>
          {(task.state === "in_progress" || elapsedSeconds > 0) && (
            <div style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 700, color: task.state === "in_progress" ? "var(--vermillion)" : "var(--ink)" }}>
              {formatTime(elapsedSeconds)}
            </div>
          )}
        </div>
      </div>

      {/* Expanded detail on hover */}
      {isHighlighted && !isCompact && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "0.5px solid var(--rule)" }}>
          {/* CL breakdown as a trace-log line */}
          <div className="log-line" style={{ fontSize: 11, padding: "0 0 0 16px", marginLeft: 8, lineHeight: 2 }}>
            CL = {task.clBreakdown.baseDifficulty} × {task.clBreakdown.durationWeight} × {task.clBreakdown.deadlineUrgency} × {task.clBreakdown.typeMultiplier} × {task.clBreakdown.priorityWeight} = {task.cl}
          </div>

          {/* Actions */}
          {(task.state === "scheduled" || task.state === "in_progress") && (
            <div style={{ display: "flex", gap: 8, marginTop: 12, marginLeft: 24 }}>
              {task.state === "scheduled" && (
                <button
                  className="btn btn-sm"
                  onClick={() => dispatch({ type: "UPDATE_TASK_STATE", payload: { taskId: task.id, state: "in_progress" } })}
                >
                  START
                </button>
              )}
              <button
                className="btn btn-sm"
                onClick={() => dispatch({ type: "UPDATE_TASK_STATE", payload: { taskId: task.id, state: "completed" } })}
              >
                COMPLETE
              </button>
              {task.state === "scheduled" && (
                <button
                  className="btn btn-sm"
                  onClick={() => dispatch({ type: "UPDATE_TASK_STATE", payload: { taskId: task.id, state: "skipped" } })}
                >
                  SKIP
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
