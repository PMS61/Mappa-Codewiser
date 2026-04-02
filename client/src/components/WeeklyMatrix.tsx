/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Weekly Matrix View
   Visualizes the 96 (15-min blocks) * 7 (days) matrix
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useApp } from "@/lib/store";

export default function WeeklyMatrix() {
  const { state } = useApp();

  const days = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
  const currentDayIndex = new Date().getDay() - 1 < 0 ? 6 : new Date().getDay() - 1; // 0=Mon, 6=Sun

  // A helper to quickly check if a slot in the current day is occupied by a scheduled task
  const isSlotOccupied = (slot: number) => {
    return state.tasks.some(
      (t) =>
        t.scheduledSlot &&
        slot >= t.scheduledSlot.startSlot &&
        slot < t.scheduledSlot.endSlot
    );
  };

  return (
    <div className="section-rule" style={{ padding: "40px 24px", overflowX: "auto" }}>
      <div className="meta-text" style={{ marginBottom: 24 }}>System Matrix / 96×7</div>
      
      <div style={{ minWidth: 800 }}>
        {/* Time Header (every 4 slots = 1 hour) */}
        <div style={{ display: "flex", paddingLeft: 40, marginBottom: 8 }}>
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              className="meta-text"
              style={{ flex: 4, width: 4 * 10, textAlign: "left" }}
            >
              {String(h).padStart(2, "0")}
            </div>
          ))}
        </div>

        {/* Matrix Rows (7 days) */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {days.map((day, dIdx) => {
            const isToday = dIdx === currentDayIndex;
            return (
              <div key={day} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  className="meta-text"
                  style={{ width: 28, textAlign: "right", color: isToday ? "var(--ink)" : "var(--muted)", fontWeight: isToday ? 700 : 400 }}
                >
                  {day}
                </div>
                <div style={{ display: "flex", gap: 2, flex: 1 }}>
                  {Array.from({ length: 96 }).map((_, slot) => {
                    const occupied = isToday && isSlotOccupied(slot);
                    // Approximate baseline active hours (8am - 10pm) for visual texture
                    const isBaseline = slot >= 32 && slot <= 88;
                    
                    return (
                      <div
                        key={slot}
                        style={{
                          width: 8,
                          height: 16,
                          background: occupied ? "var(--ink)" : (isBaseline ? "var(--rule)" : "#E8E0D4"),
                          opacity: occupied ? 1 : 0.5,
                        }}
                        title={`${day} - ${Math.floor(slot / 4)}:${String((slot % 4) * 15).padStart(2, "0")}`}
                      />
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
