/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Onboarding Flow
   Landing-page aesthetic: hero-style intro, methodology
   step numbers, generous vertical rhythm.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = 0 | 1 | 2 | 3;

export default function OnboardingFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(0);

  const [wakeTime, setWakeTime] = useState("07:00");
  const [sleepTime, setSleepTime] = useState("23:00");
  const [peakStart, setPeakStart] = useState("09:00");
  const [peakEnd, setPeakEnd] = useState("12:00");
  const [peakStart2, setPeakStart2] = useState("14:00");
  const [peakEnd2, setPeakEnd2] = useState("17:00");

  const [workspaces, setWorkspaces] = useState<{ name: string; type: "course" | "project"; subjects: string }[]>([]);
  const [wsName, setWsName] = useState("");
  const [wsType, setWsType] = useState<"course" | "project">("course");
  const [wsSubjects, setWsSubjects] = useState("");

  function addWorkspace() {
    if (!wsName.trim()) return;
    setWorkspaces((prev) => [...prev, { name: wsName.trim(), type: wsType, subjects: wsSubjects.trim() }]);
    setWsName("");
    setWsSubjects("");
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <header className="nav">
        <div className="nav-inner">
          <a href="/" className="logo">Axiom</a>
          <span className="meta-text">Setup · Step {step + 1} of 4</span>
        </div>
      </header>
      <div style={{ height: 60 }} />

      <main className="container" style={{ flex: 1, paddingTop: 60, paddingBottom: 80 }}>
        {/* Progress */}
        <div style={{ display: "flex", gap: 4, marginBottom: 60 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ width: i === step ? 48 : 24, height: 3, background: i <= step ? "var(--ink)" : "var(--rule)" }} />
          ))}
        </div>

        <div style={{ maxWidth: 520 }}>
          {/* ── Step 0: Welcome ── */}
          {step === 0 && (
            <>
              <div className="meta-text" style={{ marginBottom: 16 }}>A New Approach to Scheduling</div>
              <h1 style={{ fontSize: 42, marginBottom: 24 }}>
                Time is fixed.<br /><em style={{ fontWeight: 400, color: "var(--muted)" }}>Capacity is variable.</em>
              </h1>
              <p style={{ color: "var(--muted)", maxWidth: 400, marginBottom: 32 }}>
                Axiom measures your actual mental focus throughout the day and builds your schedule
                strictly around those limits. No guesswork. No hidden algorithms.
              </p>

              <div style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 24, marginBottom: 32 }}>
                <div style={{ marginBottom: 20 }}>
                  <label htmlFor="ob-name">Your Name</label>
                  <input id="ob-name" type="text" placeholder="e.g., Prathamesh" />
                </div>
                <div>
                  <label htmlFor="ob-email">Email</label>
                  <input id="ob-email" type="email" placeholder="you@university.edu" />
                </div>
              </div>

              <button className="btn btn-primary" onClick={() => setStep(1)}>
                Begin Calibration &gt;
              </button>
            </>
          )}

          {/* ── Step 1: Bandwidth Calibration ── */}
          {step === 1 && (
            <>
              <div className="step-num">01</div>
              <div className="step-title">Bandwidth Calibration</div>
              <p style={{ color: "var(--muted)", marginBottom: 32 }}>
                Define your daily rhythm. The system generates a 96-point bandwidth array
                based on your active hours and peak focus windows.
              </p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 32 }}>
                <div>
                  <label htmlFor="cal-wake">Wake Time</label>
                  <input id="cal-wake" type="time" value={wakeTime} onChange={(e) => setWakeTime(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="cal-sleep">Sleep Time</label>
                  <input id="cal-sleep" type="time" value={sleepTime} onChange={(e) => setSleepTime(e.target.value)} />
                </div>
              </div>

              <div style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 24, marginBottom: 24 }}>
                <div className="meta-text" style={{ marginBottom: 12 }}>Peak Window 1 (Morning)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  <div><label>From</label><input type="time" value={peakStart} onChange={(e) => setPeakStart(e.target.value)} /></div>
                  <div><label>To</label><input type="time" value={peakEnd} onChange={(e) => setPeakEnd(e.target.value)} /></div>
                </div>
              </div>

              <div style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 24, marginBottom: 32 }}>
                <div className="meta-text" style={{ marginBottom: 12 }}>Peak Window 2 (Afternoon)</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                  <div><label>From</label><input type="time" value={peakStart2} onChange={(e) => setPeakStart2(e.target.value)} /></div>
                  <div><label>To</label><input type="time" value={peakEnd2} onChange={(e) => setPeakEnd2(e.target.value)} /></div>
                </div>
              </div>

              {/* Bandwidth preview histogram */}
              <div style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 16, marginBottom: 32 }}>
                <div className="meta-text" style={{ marginBottom: 8 }}>Bandwidth Preview (96 Slots)</div>
                <div style={{ display: "flex", gap: 1, height: 40, alignItems: "end" }}>
                  {Array.from({ length: 48 }, (_, i) => {
                    const hour = (i * 0.5) + 6;
                    const wH = Number.parseInt(wakeTime.split(":")[0]);
                    const sH = Number.parseInt(sleepTime.split(":")[0]);
                    const p1s = Number.parseInt(peakStart.split(":")[0]);
                    const p1e = Number.parseInt(peakEnd.split(":")[0]);
                    const p2s = Number.parseInt(peakStart2.split(":")[0]);
                    const p2e = Number.parseInt(peakEnd2.split(":")[0]);
                    let bw = 0;
                    if (hour >= wH && hour < sH) {
                      bw = 4;
                      if (hour >= p1s && hour < p1e) bw = 10;
                      else if (hour >= p2s && hour < p2e) bw = 9;
                      else if (hour >= p1e && hour < p2s) bw = 5;
                    }
                    const isPeak = (hour >= p1s && hour < p1e) || (hour >= p2s && hour < p2e);
                    return (
                      <div key={i} style={{ flex: 1, height: `${(bw / 10) * 100}%`, minHeight: bw > 0 ? 2 : 0, background: isPeak ? "var(--ink)" : "#E8E0D4" }} />
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn" onClick={() => setStep(0)}>Back</button>
                <button className="btn btn-primary" onClick={() => setStep(2)}>Confirm &gt;</button>
              </div>
            </>
          )}

          {/* ── Step 2: Workspaces ── */}
          {step === 2 && (
            <>
              <div className="step-num">02</div>
              <div className="step-title">Workspace Creation</div>
              <p style={{ color: "var(--muted)", marginBottom: 32 }}>
                Create workspaces for your courses and projects. Subjects within workspaces
                are used for context-switch penalty computation.
              </p>

              {workspaces.length > 0 && (
                <div style={{ marginBottom: 32 }}>
                  {workspaces.map((ws, i) => (
                    <div key={i} className="section-rule" style={{ display: "flex", justifyContent: "space-between", padding: "12px 0" }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{ws.name}</div>
                        <div className="meta-text">{ws.type} · {ws.subjects || "No subjects"}</div>
                      </div>
                      <button className="btn btn-sm btn-danger" onClick={() => setWorkspaces((p) => p.filter((_, j) => j !== i))}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ borderTop: "0.5px solid var(--rule)", paddingTop: 24 }}>
                <div style={{ marginBottom: 16 }}>
                  <label>Workspace Name</label>
                  <input type="text" value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="e.g., Computer Science" />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 16 }}>
                  <div>
                    <label>Type</label>
                    <select value={wsType} onChange={(e) => setWsType(e.target.value as "course" | "project")}>
                      <option value="course">Course</option>
                      <option value="project">Project</option>
                    </select>
                  </div>
                  <div>
                    <label>Subjects (comma-separated)</label>
                    <input type="text" value={wsSubjects} onChange={(e) => setWsSubjects(e.target.value)} placeholder="e.g., Algorithms, OS" />
                  </div>
                </div>
                <button className="btn btn-sm" onClick={addWorkspace}>+ Add Workspace</button>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
                <button className="btn" onClick={() => setStep(1)}>Back</button>
                <button className="btn btn-primary" onClick={() => setStep(3)}>Continue &gt;</button>
              </div>
            </>
          )}

          {/* ── Step 3: Ready ── */}
          {step === 3 && (
            <>
              <div className="step-num">03</div>
              <div className="step-title">System Ready</div>
              <p style={{ color: "var(--muted)", marginBottom: 32 }}>
                96×7 matrix initialised. Energy state set to Baseline (0). {workspaces.length} workspace{workspaces.length !== 1 ? "s" : ""} loaded.
              </p>

              <div
                className="meta-text"
                style={{
                  borderTop: "0.5px solid var(--rule)",
                  paddingTop: 24,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 16,
                  marginBottom: 40,
                }}
              >
                <div>
                  <div>Matrix</div>
                  <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4, color: "var(--ink)" }}>96 × 7</div>
                </div>
                <div>
                  <div>Energy</div>
                  <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4, color: "var(--ink)" }}>Baseline</div>
                </div>
                <div>
                  <div>Workspaces</div>
                  <div style={{ fontWeight: 700, fontSize: 20, marginTop: 4, color: "var(--ink)" }}>{workspaces.length}</div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn" onClick={() => setStep(2)}>Back</button>
                <button className="btn btn-primary" onClick={() => router.push("/dashboard")}>
                  Enter Dashboard &gt;
                </button>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
