/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Navigation
   Matches landing.html fixed header: logo left, links right.
   60px height, 0.5px ink border, nothing else.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useApp } from "@/lib/store";
import { ENERGY_LABELS } from "@/lib/types";
import type { EnergyLevel } from "@/lib/types";

export default function Header() {
  const { state, dispatch } = useApp();

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <a href="/" className="logo">Axiom</a>

          <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
            {/* Energy indicator — compact */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="meta-text">{ENERGY_LABELS[state.energyLevel]}</span>
              <div style={{ display: "flex", gap: 2 }}>
                {([-2, -1, 0, 1, 2] as EnergyLevel[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => dispatch({ type: "SET_ENERGY", payload: level })}
                    style={{
                      width: 14,
                      height: 6,
                      background: state.energyLevel >= level ? "var(--ink)" : "var(--rule)",
                      border: "none",
                      cursor: "pointer",
                      display: "block",
                    }}
                    title={ENERGY_LABELS[level]}
                  />
                ))}
              </div>
            </div>

            {/* Nav links */}
            <a href="/tasks" className="nav-link">Tasks</a>
            <a href="/report" className="nav-link">Report</a>
            <a href="/tutorial" className="nav-link">Guide</a>
            <a href="/profile" className="nav-link">Profile</a>

            <button
              className="btn btn-sm"
              style={{ marginLeft: 8 }}
              onClick={() => dispatch({ type: "TOGGLE_ADD_TASK" })}
            >
              + Task
            </button>
          </div>
        </div>
      </header>
      {/* Spacer for fixed nav */}
      <div className="mobile-spacer" style={{ height: 60 }} />
    </>
  );
}
