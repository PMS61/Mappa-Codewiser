/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Landing Page
   Converted from landing.html. Swiss editorial aesthetic,
   energy chart, methodology steps, trace log, CTA.
   ═══════════════════════════════════════════════════════════ */

"use client";
 
import Link from "next/link";
import { useEffect } from "react";
import { useApp } from "@/lib/store";
 
export default function LandingPage() {
  const { state, dispatch } = useApp();

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as "light" | "dark" | null;
    if (savedTheme) {
      dispatch({ type: "SET_THEME", payload: savedTheme });
      document.documentElement.setAttribute("data-theme", savedTheme);
    } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
       dispatch({ type: "SET_THEME", payload: "dark" });
       document.documentElement.setAttribute("data-theme", "dark");
    }
  }, [dispatch]);

  const toggleTheme = () => {
    const nextTheme = state.theme === "light" ? "dark" : "light";
    dispatch({ type: "SET_THEME", payload: nextTheme });
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
  };

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* ── Navigation ── */}
      <header className="nav">
        <div className="nav-inner">
          <Link href="/" className="logo">
            Axiom
          </Link>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <button 
              onClick={toggleTheme}
              className="btn btn-sm"
              style={{ padding: "4px 8px", fontSize: 9, border: '0.5px solid var(--rule)' }}
            >
              {state.theme === "light" ? "Dark" : "Light"}
            </button>
            <Link
              href="/login"
              className="nav-link"
              style={{ paddingBottom: 2 }}
            >
              Login
            </Link>
            <Link
              href="/onboarding"
              className="nav-link"
              style={{ borderBottom: "0.5px solid var(--ink)", paddingBottom: 2 }}
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>
      <div className="mobile-spacer" style={{ height: 60 }} />

      <main>
        {/* ── HERO ── */}
        <section
          className="container section-rule landing-hero-grid"
          style={{
            paddingTop: 60,
            paddingBottom: 60,
            display: "grid",
            gridTemplateColumns: "1fr 1.5fr",
            gap: 60,
            alignItems: "start",
          }}
        >
          <div>
            <div className="meta-text" style={{ marginBottom: 24 }}>
              A New Approach to Scheduling
            </div>
            <h1 style={{ fontSize: 58, lineHeight: 1.1, marginBottom: 32 }}>
              Time is fixed.
              <br />
              <em style={{ fontWeight: 400, color: "var(--muted)" }}>
                Capacity is variable.
              </em>
            </h1>
            <p
              style={{
                maxWidth: 400,
                color: "var(--muted)",
                marginBottom: 32,
              }}
            >
              Normal calendars assume you have the same energy at 9 AM as you do
              at 4 PM. Axiom measures your actual mental focus throughout the day
              and builds your schedule strictly around those limits.
            </p>
            <div
              className="meta-text"
              style={{
                borderTop: "0.5px solid var(--rule)",
                paddingTop: 16,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>
                  Precision
                </div>
                <div
                  style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}
                >
                  15-Minute Blocks
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: "var(--muted)" }}>Logic</div>
                <div
                  style={{ fontWeight: 700, fontSize: 14, marginTop: 4 }}
                >
                  Rule-Based
                </div>
              </div>
            </div>
          </div>

          {/* Energy Chart */}
          <div style={{ paddingTop: 20 }}>
            <div
              className="meta-text"
              style={{
                marginBottom: 12,
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>Your Mental Energy / 24-Hour Cycle</span>
              <span style={{ color: "var(--vermillion)" }}>Burnout Limit</span>
            </div>

            <div className="chart-wrapper" style={{ height: 160 }}>
              <svg
                style={{ width: "100%", height: "100%", overflow: "visible" }}
                viewBox="0 0 1000 140"
                preserveAspectRatio="none"
              >
                {/* Background Grid */}
                <line
                  x1="333" y1="0" x2="333" y2="120"
                  className="chart-grid"
                />
                <line
                  x1="666" y1="0" x2="666" y2="120"
                  className="chart-grid"
                />

                {/* Burnout Limit */}
                <line
                  x1="0" y1="15" x2="1000" y2="15"
                  stroke="#C0392B" strokeWidth="1" strokeDasharray="6 4"
                />

                {/* Normal Energy Area */}
                <path
                  d="M0,120 L0,120 L166,120 L250,100 L333,80 L375,50 L416,25 L437,15 L458,25 L500,60 L541,70 L583,40 L604,15 L625,50 L666,80 L708,100 L750,110 L1000,120 Z"
                  className="chart-fill"
                />

                {/* Overload Areas */}
                <path
                  d="M416,25 L437,0 L458,0 L458,25 Z"
                  className="chart-fill-danger"
                />
                <path
                  d="M583,40 L604,0 L625,0 L625,50 Z"
                  className="chart-fill-danger"
                />

                {/* Data Line */}
                <path
                  d="M0,120 L166,120 L250,100 L333,80 L375,50 L416,25 L437,0 L458,25 L500,60 L541,70 L583,40 L604,0 L625,50 L666,80 L708,100 L750,110 L1000,120"
                  className="chart-line"
                />

                {/* Labels */}
                <text
                  x="430" y="-5"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    fill: "var(--vermillion)",
                    fontWeight: 700,
                  }}
                >
                  [!] OVERLOADED
                </text>
                <text
                  x="597" y="-5"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    fill: "var(--vermillion)",
                    fontWeight: 700,
                  }}
                >
                  [!] OVERLOADED
                </text>
                <text
                  x="335" y="75"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    fill: "var(--muted)",
                  }}
                >
                  HIGH FOCUS
                </text>
                <text
                  x="500" y="55"
                  style={{
                    fontFamily: "var(--mono)",
                    fontSize: 9,
                    fill: "var(--muted)",
                  }}
                >
                  SLUMP
                </text>
              </svg>
            </div>

            <div className="chart-legend">
              <span>00:00</span>
              <span>LOW ENERGY</span>
              <span style={{ color: "var(--vermillion)" }}>
                OVERLOADED (Tasks Blocked)
              </span>
              <span>24:00</span>
            </div>
          </div>
        </section>

        {/* ── METHODOLOGY ── */}
        <section
          className="container section-rule landing-method-grid"
          style={{
            paddingTop: 60,
            paddingBottom: 60,
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 0,
          }}
        >
          {[
            {
              num: "01",
              title: "Measure",
              desc: 'Every task is given a simple "energy cost" from 1 to 10 based on how much focus it actually requires.',
            },
            {
              num: "02",
              title: "Track",
              desc: "Your day is broken into 96 fifteen-minute blocks. Your natural morning or evening rhythm sets the baseline energy for each block.",
            },
            {
              num: "03",
              title: "Schedule",
              desc: "A rule-based engine compares the task's energy cost against your available energy. Hard tasks are blocked from low-energy times.",
            },
            {
              num: "04",
              title: "Explain",
              desc: "You never have to guess why a task was moved. Axiom prints out the exact step-by-step logic behind every schedule change.",
            },
          ].map((step, i) => (
            <div
              key={step.num}
              style={{
                padding: "0 24px",
                borderRight:
                  i < 3 ? "0.5px solid var(--rule)" : "none",
              }}
            >
              <div className="step-num">{step.num}</div>
              <div className="step-title">{step.title}</div>
              <div className="step-desc">{step.desc}</div>
            </div>
          ))}
        </section>

        {/* ── TRACE EVIDENCE ── */}
        <section
          className="container landing-trace-grid"
          style={{
            paddingTop: 80,
            paddingBottom: 80,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 80,
          }}
        >
          <div style={{ paddingTop: 20 }}>
            <div className="meta-text" style={{ marginBottom: 16 }}>
              Complete Transparency
            </div>
            <h2 style={{ fontSize: 36, marginBottom: 24 }}>
              No hidden algorithms.
              <br />
              No black boxes.
            </h2>
            <p style={{ color: "var(--muted)", maxWidth: 400 }}>
              Axiom doesn&apos;t &quot;suggest&quot; or &quot;optimize&quot;
              behind the scenes. When two things need to happen at once, it uses
              strict rules to figure out what goes where, and shows you exactly
              how it made that choice.
            </p>
          </div>

          <div className="trace-log">
            <div
              className="meta-text"
              style={{ marginBottom: 16, display: "block" }}
            >
              How Axiom handled a conflict at 2:00 PM
            </div>
            <div className="log-line">
              1. Energy cost of &quot;Write Report&quot;: Very High (9/10)
            </div>
            <div className="log-line">
              2. Available energy at 1:00 PM: Low
            </div>
            <div className="log-line rule">
              3. RULE: Do not place high-focus tasks in low-energy slots.
            </div>
            <div className="log-line">
              4. Next available high-energy slot: 2:00 PM
            </div>
            <div className="log-line conflict">
              5. CONFLICT: &quot;Team Sync&quot; is already at 2:00 PM
            </div>
            <div className="log-line rule">
              6. RULE: If two tasks clash, the one requiring more focus gets the
              slot.
            </div>
            <div className="log-line action">
              7. → ACTION: Place &quot;Write Report&quot; at 2:00 PM.
            </div>
            <div className="log-line action">
              8. → ACTION: Move &quot;Team Sync&quot; to 3:30 PM.
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section
          id="initialize"
          className="container"
          style={{
            padding: "60px 0",
            textAlign: "center",
            borderTop: "0.5px solid var(--ink)",
          }}
        >
          <div className="meta-text">Ready to begin</div>
          <h1 style={{ fontSize: 32, marginTop: 16 }}>
            Set Up Your Schedule
          </h1>
          <p
            style={{
              color: "var(--muted)",
              maxWidth: 500,
              margin: "16px auto 0",
            }}
          >
            We&apos;ll ask a few quick questions about when you focus best and
            how long you can work without burning out. Takes about 60 seconds.
          </p>
          <Link
            href="/onboarding"
            className="btn"
            style={{
              display: "inline-block",
              marginTop: 24,
              padding: "20px 40px",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Start Setup &gt;
          </Link>
          <p style={{ marginTop: 12, color: "var(--muted)" }}>
            Already onboarded? <Link href="/login">Login</Link>
          </p>
        </section>
      </main>
    </div>
  );
}
