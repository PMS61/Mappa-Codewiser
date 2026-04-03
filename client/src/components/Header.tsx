/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Navigation
   Matches landing.html fixed header: logo left, links right.
   60px height, 0.5px ink border, nothing else.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/store";
import { ENERGY_LABELS } from "@/lib/types";
import type { EnergyLevel } from "@/lib/types";
import { logoutUser } from "@/app/actions/auth";

export default function Header() {
  const pathname = usePathname();
  const { state, dispatch } = useApp();
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");

  useEffect(() => {
    const saved = localStorage.getItem("axiom-theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
    }
  }, []);

  useEffect(() => {
    // Sync theme to root element on mount and change
    if (theme !== "system") {
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("axiom-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem("axiom-theme");
    }
  }, [theme]);

  const toggleTheme = () => {
    if (theme === "system") {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
    } else if (theme === "dark") {
      setTheme("light");
    } else {
      setTheme("system"); // cycle back
    }
  };

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <a href="/" className="logo">Axiom</a>

          <div className="nav-links-container" style={{ display: "flex", alignItems: "center", gap: 32 }}>
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
            <a href="/dashboard" className={`nav-link ${pathname === '/dashboard' ? 'active' : ''}`}>Dashboard</a>
            <a href="/dashboard/tasks" className={`nav-link ${pathname === '/dashboard/tasks' ? 'active' : ''}`}>Tasks & Matrix</a>
            <a href="/dashboard/report" className={`nav-link ${pathname === '/dashboard/report' ? 'active' : ''}`}>Report</a>
            <a href="/dashboard/feedback" className={`nav-link ${pathname === '/dashboard/feedback' ? 'active' : ''}`}>Feedback</a>
            <a href="/dashboard/tutorial" className={`nav-link ${pathname === '/dashboard/tutorial' ? 'active' : ''}`}>Guide</a>
            <a href="/dashboard/profile" className={`nav-link ${pathname === '/dashboard/profile' ? 'active' : ''}`}>Profile</a>
            <button
              className="btn btn-sm"
              style={{ marginLeft: 8 }}
              onClick={() => dispatch({ type: "TOGGLE_ADD_TASK" })}
            >
              + Task
            </button>
            <button 
              onClick={toggleTheme}
              className="nav-link"
              style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", marginLeft: 8 }}
              title="Toggle Theme"
            >
              {theme === "system" ? "🌓" : theme === "dark" ? "🌙" : "☀️"}
            </button>
            <button
              onClick={() => logoutUser()}
              className="nav-link"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--vermillion)", marginLeft: 16 }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>
      {/* Spacer for fixed nav */}
      <div className="mobile-spacer" style={{ height: 60 }} />
    </>
  );
}
