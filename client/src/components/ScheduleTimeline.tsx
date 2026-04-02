/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Schedule Timeline
   Daily schedule view with time gutter on the left and
   task blocks placed at proportional positions.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useApp } from "@/lib/store";
import { slotToTime } from "@/lib/engine";
import TaskBlock from "./TaskBlock";

export default function ScheduleTimeline() {
  const { state } = useApp();

  // Only show 06:00 - 23:00 (slots 24-92)
  const START_SLOT = 24;
  const END_SLOT = 92;
  const SLOT_HEIGHT = 20; // px per 15-min slot
  const totalHeight = (END_SLOT - START_SLOT) * SLOT_HEIGHT;

  // Get scheduled tasks sorted by start time
  const scheduledTasks = state.tasks
    .filter((t) => t.scheduledSlot && t.state !== "unscheduled")
    .sort((a, b) => (a.scheduledSlot?.startSlot ?? 0) - (b.scheduledSlot?.startSlot ?? 0));

  // Generate hour lines
  const hourLines: { slot: number; label: string }[] = [];
  for (let slot = START_SLOT; slot <= END_SLOT; slot += 4) {
    hourLines.push({ slot, label: slotToTime(slot) });
  }

  return (
    <div style={{ position: "relative", display: "flex" }}>
      {/* Time gutter */}
      <div
        className="time-gutter rule-right"
        style={{ position: "relative", height: totalHeight }}
      >
        {hourLines.map((h) => (
          <div
            key={h.slot}
            className="time-label"
            style={{
              position: "absolute",
              top: (h.slot - START_SLOT) * SLOT_HEIGHT - 6,
              right: "var(--sp-3)",
              width: "100%",
            }}
          >
            {h.label}
          </div>
        ))}
      </div>

      {/* Schedule content */}
      <div style={{ flex: 1, position: "relative", height: totalHeight }}>
        {/* Hour grid lines */}
        {hourLines.map((h) => (
          <div
            key={`line-${h.slot}`}
            className="hour-line"
            style={{
              position: "absolute",
              top: (h.slot - START_SLOT) * SLOT_HEIGHT,
              left: 0,
              right: 0,
            }}
          />
        ))}

        {/* Current time indicator */}
        {(() => {
          const now = new Date();
          const currentSlot = now.getHours() * 4 + Math.floor(now.getMinutes() / 15);
          if (currentSlot >= START_SLOT && currentSlot <= END_SLOT) {
            return (
              <div
                style={{
                  position: "absolute",
                  top: (currentSlot - START_SLOT) * SLOT_HEIGHT,
                  left: 0,
                  right: 0,
                  height: 1,
                  background: "var(--vermillion)",
                  zIndex: 10,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    left: -2,
                    top: -3,
                    width: 6,
                    height: 6,
                    background: "var(--vermillion)",
                    display: "block",
                  }}
                />
              </div>
            );
          }
          return null;
        })()}

        {/* Task blocks */}
        {scheduledTasks.map((task) => {
          if (!task.scheduledSlot) return null;
          const top = (task.scheduledSlot.startSlot - START_SLOT) * SLOT_HEIGHT;
          const height =
            (task.scheduledSlot.endSlot - task.scheduledSlot.startSlot) *
            SLOT_HEIGHT;

          return (
            <div
              key={task.id}
              style={{
                position: "absolute",
                top,
                left: 0,
                right: 0,
                height: Math.max(height, 48),
                zIndex: 5,
              }}
            >
              <TaskBlock task={task} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
