/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Tasks View
   Landing-page aesthetic: clean table with generous spacing,
   meta-text labels, hover reveals.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useState } from "react";
import { AppProvider, useApp } from "@/lib/store";
import { formatDuration, slotToTime } from "@/lib/engine";
import { TASK_TYPE_LABELS } from "@/lib/types";
import type { TaskState, TaskType } from "@/lib/types";
import AddTaskModal from "./AddTaskModal";

type SortField = "cl" | "time" | "priority" | "name";
type FilterState = "all" | TaskState;

function TasksContent() {
  const { state, dispatch } = useApp();
  const [sortBy, setSortBy] = useState<SortField>("time");
  const [filterState, setFilterState] = useState<FilterState>("all");

  let filtered = state.tasks;
  if (filterState !== "all") filtered = filtered.filter((t) => t.state === filterState);

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "cl": return Math.abs(b.cl) - Math.abs(a.cl);
      case "time": return (a.scheduledSlot?.startSlot ?? 999) - (b.scheduledSlot?.startSlot ?? 999);
      case "priority": return ({ high: 0, normal: 1, low: 2 }[a.priority]) - ({ high: 0, normal: 1, low: 2 }[b.priority]);
      case "name": return a.name.localeCompare(b.name);
      default: return 0;
    }
  });

  const totalCL = state.tasks.filter((t) => t.cl > 0).reduce((s, t) => s + t.cl, 0);

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Nav */}
      <header className="nav">
        <div className="nav-inner">
          <a href="/" className="logo">Axiom</a>
          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            <a href="/" className="nav-link">Schedule</a>
            <a href="/tasks" className="nav-link active">Tasks</a>
            <a href="/report" className="nav-link">Report</a>
            <button className="btn btn-sm" onClick={() => dispatch({ type: "TOGGLE_ADD_TASK" })}>+ Task</button>
          </div>
        </div>
      </header>
      <div style={{ height: 60 }} />

      {/* Hero */}
      <section className="container section-rule" style={{ paddingTop: 60, paddingBottom: 40 }}>
        <div className="meta-text" style={{ marginBottom: 16 }}>Task Management</div>
        <h1 style={{ marginBottom: 16 }}>All Tasks</h1>
        <p style={{ color: "var(--muted)", maxWidth: 400 }}>
          {state.tasks.length} tasks in pool · Total CL {totalCL.toFixed(1)}
        </p>
      </section>

      {/* Filters */}
      <section className="container section-rule" style={{ padding: "12px 24px", display: "flex", gap: 24, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ marginBottom: 0, whiteSpace: "nowrap" }}>State</label>
          <select value={filterState} onChange={(e) => setFilterState(e.target.value as FilterState)} style={{ width: "auto", borderBottom: "none" }}>
            <option value="all">All</option>
            <option value="unscheduled">Unscheduled</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="skipped">Skipped</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ marginBottom: 0, whiteSpace: "nowrap" }}>Sort</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortField)} style={{ width: "auto", borderBottom: "none" }}>
            <option value="time">Time</option>
            <option value="cl">CL (High First)</option>
            <option value="priority">Priority</option>
            <option value="name">Name</option>
          </select>
        </div>
      </section>

      {/* Task table */}
      <main className="container" style={{ paddingTop: 24, paddingBottom: 80 }}>
        {/* Header row */}
        <div className="section-rule" style={{
          display: "grid", gridTemplateColumns: "48px 1fr 100px 80px 80px 80px",
          gap: 8, padding: "8px 0",
        }}>
          <span className="meta-text">CL</span>
          <span className="meta-text">Task</span>
          <span className="meta-text">Time</span>
          <span className="meta-text">Duration</span>
          <span className="meta-text">Type</span>
          <span className="meta-text">State</span>
        </div>

        {sorted.map((task) => {
          const timeRange = task.scheduledSlot
            ? `${slotToTime(task.scheduledSlot.startSlot)}–${slotToTime(task.scheduledSlot.endSlot)}`
            : "—";
          const isHovered = state.highlightedTaskId === task.id;

          return (
            <div
              key={task.id}
              className="section-rule"
              style={{
                display: "grid",
                gridTemplateColumns: "48px 1fr 100px 80px 80px 80px",
                gap: 8,
                padding: "12px 0",
                alignItems: "center",
                background: isHovered ? "var(--card-bg)" : undefined,
                cursor: "default",
              }}
              onMouseEnter={() => dispatch({ type: "HIGHLIGHT_TASK", payload: task.id })}
              onMouseLeave={() => dispatch({ type: "HIGHLIGHT_TASK", payload: null })}
            >
              <span style={{
                fontWeight: 700,
                fontSize: 16,
                color: task.type === "recreational"
                  ? "var(--safe)"
                  : Math.abs(task.cl) > 7 ? "var(--vermillion)" : "var(--ink)",
              }}>
                {task.cl.toFixed(1)}
              </span>

              <div>
                <div style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {task.name}
                </div>
                {isHovered && (
                  <div className="meta-text" style={{ marginTop: 2 }}>
                    {task.clBreakdown.baseDifficulty} × {task.clBreakdown.durationWeight} × {task.clBreakdown.deadlineUrgency} × {task.clBreakdown.typeMultiplier} × {task.clBreakdown.priorityWeight}
                  </div>
                )}
              </div>

              <span className="meta-text">{timeRange}</span>
              <span className="meta-text">{formatDuration(task.duration)}</span>
              <span className="meta-text">{TASK_TYPE_LABELS[task.type]}</span>
              <span className={`status-tag status-${task.state === "in_progress" ? "inprogress" : task.state}`}>
                {task.state.replace(/_/g, " ")}
              </span>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted)" }}>
            No tasks match current filters.
          </div>
        )}
      </main>

      <AddTaskModal />
    </div>
  );
}

export default function TasksView() {
  return (
    <AppProvider>
      <TasksContent />
    </AppProvider>
  );
}
