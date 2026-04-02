/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Tutorial & Documentation
   Brutalist, rule-based manual matching the project aesthetics.
   ═══════════════════════════════════════════════════════════ */

import Header from "@/components/Header";
import { AppProvider } from "@/lib/store";

function TutorialContent() {
  return (
    <div style={{ minHeight: "100vh", paddingBottom: 100 }}>
      <Header />
      
      <main className="container section-rule" style={{ paddingTop: 60, maxWidth: 640, margin: "0 auto" }}>
        <div className="meta-text" style={{ marginBottom: 16 }}>SYSTEM REFERENCE MANUAL.</div>
        <h1 style={{ fontSize: 42, marginBottom: 40, lineHeight: 1.1 }}>
          Axiom User Manual <br />
          <em style={{ fontWeight: 400, color: "var(--muted)", fontSize: 32 }}>v0.1 Alpha</em>
        </h1>

        <div style={{ padding: "24px", background: "var(--card-bg)", border: "0.5px solid var(--ink)", marginBottom: 60 }}>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.5, fontWeight: 500 }}>
            Standard schedulers ask "When do you have time?". Axiom asks "When do you have the cognitive capacity?". 
            Time is fixed; capacity is variable. This system computes schedule fitness based purely on tracked mental bandwidth.
          </p>
        </div>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, marginBottom: 16, borderBottom: "0.5px solid var(--rule)", paddingBottom: 8 }}>1. The Scoring System</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>Every task placed inside Axiom undergoes deterministic Cognitive Load (CL) computation rather than just measuring duration.</p>
          
          <div className="trace-log" style={{ padding: "20px", marginBottom: 24 }}>
            <div className="log-line rule" style={{ fontSize: 13, textTransform: "none", marginBottom: 8 }}>
              Engine Formula:
            </div>
            <div style={{ fontFamily: "var(--mono)", fontSize: 14, fontWeight: 600 }}>
              CL = base_difficulty × duration_weight × deadline_urgency × type_multiplier × priority_weight
            </div>
          </div>
          <ul style={{ paddingLeft: 24, lineHeight: 1.6, color: "var(--ink)" }}>
            <li style={{ marginBottom: 8 }}><strong>Recreational tasks</strong> (e.g. going for a walk, rendering 3D art) inherently contain a negative CL value. Completing them restores your bandwidth budget mathematically.</li>
            <li><strong>Task Multipliers:</strong> "Learning a New Concept" commands a 1.4x tax on CL, while "Administrative Tasks" only consume 0.6x.</li>
          </ul>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, marginBottom: 16, borderBottom: "0.5px solid var(--rule)", paddingBottom: 8 }}>2. The 96 x 7 Master Matrix</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>The physical database architecture relies strictly on chunking your week into absolute 15-minute segments resulting in 672 active cells. The "Today's Schedule" components visually render exact proportional scaling mapped onto these variables.</p>
          
          <ul style={{ paddingLeft: 24, lineHeight: 1.6, color: "var(--ink)" }}>
            <li style={{ marginBottom: 8 }}><strong>Bandwidth Curve Calibration:</strong> Upon Onboarding, the system generated exactly 96 points establishing your biological peaks and valleys.</li>
            <li><strong>Productive Focus Tracking:</strong> As you consistently interact and trace execution over multiple days, Matrix slots upgrade from "Unknown" to "Tracked" and "Confirmed". Axiom automatically hatches peak confirmed hours and violently preferences them natively using bin-packing matrix placements!</li>
          </ul>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, marginBottom: 16, borderBottom: "0.5px solid var(--rule)", paddingBottom: 8 }}>3. Energy Management & Burnout</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>You are required to physically calibrate your scalar energy multiplier via the Navigation top-bar toggle continuously.</p>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 32, fontFamily: "var(--mono)", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "0.5px solid var(--ink)", textAlign: "left" }}>
                <th style={{ padding: "8px 0" }}>State Marker</th>
                <th>Energy Input Range</th>
                <th>System Output Override</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: "0.5px dotted var(--rule)" }}>
                <td style={{ padding: "8px 0" }}><strong>Safe</strong></td>
                <td>0 to +2</td>
                <td>Standard scheduling logic runs unrestricted.</td>
              </tr>
              <tr style={{ borderBottom: "0.5px dotted var(--rule)" }}>
                <td style={{ padding: "8px 0" }}><strong>Warning</strong></td>
                <td>-1 to 0</td>
                <td>Warning rendered. Acknowledges rolling aggregate load overload over 72hrs.</td>
              </tr>
              <tr>
                <td style={{ padding: "8px 0", color: "var(--vermillion)" }}><strong>Critical</strong></td>
                <td>-2</td>
                <td>Hard limiter. Axiom disables all High CL logic mappings. Forces a light load constraint immediately.</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 24, marginBottom: 16, borderBottom: "0.5px solid var(--rule)", paddingBottom: 8 }}>4. Resolving Conflicts & Reason Chains</h2>
          <p style={{ marginBottom: 16, lineHeight: 1.6 }}>When bin-packing encounters hard spatial paradoxes (e.g. deadline expires before requisite free capacity exists), the scheduling algorithm halts executing completely & invokes the Conflict Resolver interface.</p>
          <div className="trace-log" style={{ padding: "20px" }}>
            <div className="log-line conflict" style={{ fontSize: 13, textTransform: "none", margin: 0 }}>
              Resolution Vector Options:
            </div>
            <ul style={{ marginTop: 12, paddingLeft: 16, marginBottom: 0 }}>
              <li style={{ paddingBottom: 6 }}><strong>DEFER:</strong> Simply shifts to tomorrow given flexible deadlines.</li>
              <li style={{ paddingBottom: 6 }}><strong>SACRIFICE DEPTH:</strong> Mutates task `CL × 0.7`. Allows you to fit it, knowingly accepting a lower-quality result output mathematically.</li>
              <li><strong>EXTEND DEADLINE:</strong> Mutates deadline constraint if priority is `Low` or `Normal`. High-priority drops to escalated manual user override.</li>
            </ul>
          </div>
        </section>

        <div style={{ marginTop: 80, borderTop: "0.5px solid var(--rule)", paddingTop: 32, display: "flex", justifyContent: "space-between" }}>
          <div className="meta-text">Axiom v0.1</div>
          <a href="/dashboard" className="btn btn-sm">Return to Dashboard</a>
        </div>
      </main>
    </div>
  );
}

export default function TutorialPage() {
  return (
    <AppProvider>
      <TutorialContent />
    </AppProvider>
  );
}
