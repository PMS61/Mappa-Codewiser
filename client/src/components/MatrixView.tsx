/* ═══════════════════════════════════════════════════════════
   THE AXIOM — 96x7 Matrix UI Component
   Represents the 96 15-minute slots across 7 days.
   Supports drag-and-drop scheduling.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { slotToTime, isSlotBlocked } from "@/lib/engine";
import { useApp } from "@/lib/store";

import { Task } from "@/lib/types";
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

function DroppableSlot({ dayIdx, actualDayOfWeek, slot, tasksStartingHere, isHour, onTaskClick }: { dayIdx: number, actualDayOfWeek: number, slot: number, tasksStartingHere: any[], isHour: boolean, onTaskClick?: (task: any) => void }) {
  const { state, dispatch } = useApp();
  const id = `slot-${dayIdx}-${slot}`;
  const { isOver, setNodeRef } = useDroppable({ id });

  const isConfirmed = state.confirmedSlots.includes(id);

  const profile = state.userProfile;
  const slotMinutes = slot * 15;

  const blocked = isSlotBlocked(slot, actualDayOfWeek, profile);
  let isSleep = false;
  let blockLabel = "";

  if (profile) {
    const { wakeTime, sleepTime } = profile;
    if (wakeTime !== null && sleepTime !== null) {
      if (sleepTime > wakeTime) {
        if (slotMinutes >= sleepTime || slotMinutes < wakeTime) isSleep = true;
      } else {
        if (slotMinutes >= sleepTime && slotMinutes < wakeTime) isSleep = true;
      }
    }

    if (blocked && !isSleep) {
       const commitment = profile.fixedCommitments?.find((c: any) => c.days.includes(actualDayOfWeek) && slotMinutes >= c.start_min && slotMinutes < c.end_min);
       if (commitment) blockLabel = commitment.title;
    }
  }

  let isPeak = false;
  let isLow = false;
  if (!blocked) {
    for (const w of (profile?.peakFocusWindows || [])) {
      if (slotMinutes >= w.start_min && slotMinutes < w.end_min) { isPeak = true; break; }
    }
    if (!isPeak) {
      for (const w of (profile?.lowEnergyWindows || [])) {
        if (slotMinutes >= w.start_min && slotMinutes < w.end_min) { isLow = true; break; }
      }
    }
  }

  // Visual state
  let bgColor = "transparent";
  let pattern = "none";

  if (isSleep) {
    pattern = "repeating-linear-gradient(45deg, transparent, transparent 6px, var(--rule) 6px, var(--rule) 7px)";
  } else if (blocked) {
    bgColor = "var(--blocked-bg)";
    pattern = `repeating-linear-gradient(-45deg, transparent, transparent 6px, var(--rule) 6px, var(--rule) 6.5px)`;
  } else if (isPeak) {
    bgColor = "var(--peak-bg)";
    // Dots pattern for peak focus windows
    pattern = "radial-gradient(var(--rule) 0.5px, transparent 0.5px)";
  } else if (isLow) {
    bgColor = "var(--low-bg)";
  }

  if (isConfirmed) {
    // Distinct cross-hatch pattern for confirmed slots
    pattern = "repeating-linear-gradient(0deg, transparent, transparent 1px, var(--rule) 1px, var(--rule) 2px), repeating-linear-gradient(90deg, transparent, transparent 1px, var(--rule) 1px, var(--rule) 2px)";
    bgColor = "var(--card-bg)";
  }

  if (isOver) {
    bgColor = blocked ? "var(--vermillion)" : "var(--bg-invert)";
    pattern = "none";
  }

  return (
    <div 
      ref={setNodeRef}
      className={`rule-left ${isHour ? "hour-line" : ""}`}
      style={{
        height: 30, // represents 15 mins
        backgroundColor: bgColor,
        backgroundImage: pattern !== "none" ? pattern : "none",
        backgroundSize: "12px 12px",
        position: "relative",
        transition: "background-color 0.2s, opacity 0.2s",
        cursor: blocked ? "not-allowed" : "crosshair",
        opacity: isSleep ? 0.6 : 1,
        borderBottom: isHour ? "0.5px solid var(--rule)" : "none",
      }}
      title={isConfirmed ? "Confirmed Productive Window" : isSleep ? "Sleep Wakeup/Windown Window" : blocked ? `Blocked: ${blockLabel}` : isPeak ? "Peak Focus Window" : isLow ? "Low Energy Window" : undefined}
      onClick={() => {
        if (!blocked && tasksStartingHere.length === 0) {
          dispatch({ type: "TOGGLE_CONFIRM_SLOT", payload: id });
        }
      }}
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
  
  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dayName = d.toLocaleDateString("en-US", { weekday: 'short' }).toUpperCase();
    const dateStr = `${d.getDate()}/${d.getMonth() + 1}`;
    return {
      label: `${dayName} ${dateStr}`,
      dayOfWeek: d.getDay()
    };
  });
  
  // Render hours 6:00 to 22:00 for the main view to keep it sane, but represent the full grid.
  const START_HOUR = 6;
  const END_HOUR = 23;

  return (
    <div style={{ border: "0.5px solid var(--rule)", background: "var(--card-bg)", overflowX: "auto" }}>
      <div style={{ minWidth: 800 }}>
        {/* Header */}
        <div style={{ 
          display: "grid", 
          gridTemplateColumns: "56px repeat(7, 1fr)",
          borderBottom: "0.5px solid var(--rule)",
          background: "var(--bg)"
        }}>
          <div /> {/* Time gutter corner */}
          {days.map(day => (
            <div key={day.label} className="meta-text rule-left" style={{ padding: "8px 12px", textAlign: "center" }}>
              {day.label}
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
                {days.map((dayInfo, dIdx) => {
                  const dayData = state.scheduledDays.find(d => d.dayOffset === dIdx);
                  const tasksStartingHere = dayData?.sections.flatMap(sec => 
                    sec.tasks.filter(st => st.startSlot === slot)
                      .map(st => {
                        const originalTask = state.tasks.find(t => t.id === st.taskId);
                        if (!originalTask) return null;
                        const durSlots = Math.max(1, Math.ceil(st.duration / 15));
                        // Return composite object with pseudo-slot for UI logic
                        return { 
                          ...originalTask, 
                          id: st.chunkId || st.taskId, // unique id for dnd and keys
                          name: st.taskName,
                          duration: st.duration,
                          scheduledSlot: {
                            startSlot: st.startSlot!,
                            endSlot: st.startSlot! + durSlots,
                            day: dIdx,
                            fitnessScore: 0,
                            reasoningSteps: []
                          }
                        };
                      })
                      .filter(Boolean) as Task[]
                  ) || [];

                  return (
                    <DroppableSlot 
                      key={`${dayInfo.label}-${slot}`} 
                      dayIdx={dIdx} 
                      actualDayOfWeek={dayInfo.dayOfWeek}
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
      
      </div>
      <div className="meta-text" style={{ padding: "8px 12px", borderTop: "0.5px solid var(--rule)", textAlign: "center" }}>
        96×7 Matrix View Active
      </div>
    </div>
  );
}
