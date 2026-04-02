/* ═══════════════════════════════════════════════════════════
   THE AXIOM — 96x7 Matrix UI Component
   Represents the 96 15-minute slots across 7 days.
   Supports drag-and-drop scheduling.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { slotToTime } from "@/lib/engine";
import { useApp } from "@/lib/store";

import { useDroppable, useDraggable } from "@dnd-kit/core";

function DraggableMatrixTask({ task, durationSlots, onTaskClick }: { task: any, durationSlots: number, onTaskClick?: (task: any) => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    data: { task }
  });

  const style = {
    position: "absolute" as const,
    top: 0,
    left: 4,
    right: 4,
    height: 30 * durationSlots - 2,
    background: "var(--bg)",
    border: "0.5px solid var(--ink)",
    borderTop: `3px solid ${Math.abs(task.cl) > 7 ? 'var(--vermillion)' : 'var(--ink)'}`,
    zIndex: transform ? 999 : 10,
    padding: "8px",
    overflow: "hidden",
    cursor: "grab",
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
  };

  return (
    <div 
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
        <div style={{ fontWeight: 500, fontSize: 11, wordBreak: "break-word" }}>{task.name}</div>
        <button
          onPointerDown={(e) => {
            e.stopPropagation();
            if (onTaskClick) onTaskClick(task);
          }}
          style={{
            background: "var(--ink)",
            color: "var(--bg)",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
            fontSize: 9,
            fontWeight: 700,
            fontFamily: "var(--mono)",
            flexShrink: 0,
          }}
          title="Preview Task Details"
        >
          [i]
        </button>
      </div>
      <div className="meta-text" style={{ marginTop: 4 }}>CL {task.cl.toFixed(1)}</div>
    </div>
  );
}

function DroppableSlot({ dayIdx, slot, tasksStartingHere, isHour, onTaskClick }: { dayIdx: number, slot: number, tasksStartingHere: any[], isHour: boolean, onTaskClick?: (task: any) => void }) {
  const id = `slot-${dayIdx}-${slot}`;
  const { isOver, setNodeRef } = useDroppable({ id });

  // MOCK: Highlight Matrix grid blocks for statistically "Confirmed" productive focus hours.
  // In production, this pulls from the 96x7 DB array's "productiveHourScore".
  const isConfirmedPeak = (slot >= 40 && slot < 48) && (dayIdx === 1 || dayIdx === 3);

  return (
    <div 
      ref={setNodeRef}
      className={`rule-left ${isHour ? "hour-line" : ""}`}
      style={{
        height: 30, // represents 15 mins
        background: isOver 
          ? "var(--bg-invert)" 
          : isConfirmedPeak 
            ? "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(26,26,26,0.03) 4px, rgba(26,26,26,0.03) 5px)" 
            : "transparent",
        position: "relative",
        transition: "background 0.2s",
        cursor: "crosshair"
      }}
      onMouseEnter={(e) => !isOver && (e.currentTarget.style.background = "rgba(0,0,0,0.02)")}
      onMouseLeave={(e) => !isOver && (e.currentTarget.style.background = "transparent")}
    >
      {tasksStartingHere.map(task => {
        const durationSlots = task.scheduledSlot!.endSlot - task.scheduledSlot!.startSlot;
        return <DraggableMatrixTask key={task.id} task={task} durationSlots={durationSlots} onTaskClick={onTaskClick} />;
      })}
    </div>
  );
}

export default function MatrixView({ onTaskClick }: { onTaskClick?: (task: any) => void }) {
  const { state } = useApp();
  
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday...
  const startOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() + startOffset);

  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dayName = d.toLocaleDateString("en-US", { weekday: 'short' });
    const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
    return `${dayName} ${dateStr}`;
  });
  
  // Render hours 6:00 to 22:00 for the main view to keep it sane, but represent the full grid.
  const START_HOUR = 6;
  const END_HOUR = 23;

  return (
    <div style={{ border: "0.5px solid var(--rule)", background: "var(--card-bg)" }}>
      {/* Header */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "56px repeat(7, 1fr)",
        borderBottom: "0.5px solid var(--rule)",
        background: "var(--bg)"
      }}>
        <div /> {/* Time gutter corner */}
        {days.map(day => (
          <div key={day} className="meta-text rule-left" style={{ padding: "8px 12px", textAlign: "center" }}>
            {day}
          </div>
        ))}
      </div>

      {/* Grid container */}
      <div style={{ 
        height: "600px", 
        overflowY: "auto",
        position: "relative"
      }}>
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "56px repeat(7, 1fr)",
          gridAutoRows: "minmax(30px, auto)"
        }}>
          {Array.from({ length: (END_HOUR - START_HOUR) * 4 }).map((_, i) => {
            const slot = (START_HOUR * 4) + i;
            const isHour = slot % 4 === 0;
            
            return (
              <div key={slot} style={{ display: "contents" }}>
                {/* Time label */}
                <div 
                  className={isHour ? "hour-line" : ""}
                  style={{ 
                    padding: "4px 8px 0 0", 
                    textAlign: "right",
                    borderRight: "0.5px solid var(--rule)"
                  }}
                >
                  {isHour && (
                    <span className="time-label">{slotToTime(slot)}</span>
                  )}
                </div>

                {/* Day columns */}
                {days.map((day, dIdx) => {
                  const tasksStartingHere = state.tasks.filter(
                    t => t.state === "scheduled" && t.scheduledSlot?.startSlot === slot && t.scheduledSlot?.day === dIdx
                  );

                  return (
                    <DroppableSlot 
                      key={`${day}-${slot}`} 
                      dayIdx={dIdx} 
                      slot={slot} 
                      tasksStartingHere={tasksStartingHere} 
                      isHour={isHour} 
                      onTaskClick={onTaskClick}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      
      <div className="meta-text" style={{ padding: "8px 12px", borderTop: "0.5px solid var(--rule)", textAlign: "center" }}>
        96×7 Matrix View Active
      </div>
    </div>
  );
}
