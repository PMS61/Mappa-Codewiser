/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Report View
   Landing-page aesthetic: hero score, methodology-style
   dimension grid, trace-log insight.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useState } from "react";
import { AppProvider, useApp } from "@/lib/store";
import { formatDateHeading } from "@/lib/engine";
import { generateWeeklyInsight } from "@/lib/templates";
import WeeklyMatrix from "@/components/WeeklyMatrix";
import Header from "@/components/Header";

type Tab = "daily" | "weekly";

function ScoreRow({ label, value }: { label: string; value: number }) {
  const pct = Math.min(value, 100);
  const isLow = value < 50;
  return (
    <div className="section-rule" style={{ padding: "16px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <span className="meta-text">{label}</span>
        <span style={{ fontWeight: 700, fontSize: 18, color: isLow ? "var(--vermillion)" : "var(--ink)" }}>{value}</span>
      </div>
      <div style={{ height: 3, background: "var(--rule)" }}>
        <div style={{ height: 3, width: `${pct}%`, background: isLow ? "var(--vermillion)" : "var(--ink)" }} />
      </div>
    </div>
  );
}

function ReportContent() {
  const { state, dispatch } = useApp();
  const [tab, setTab] = useState<Tab>("daily");
  const report = state.dailyReport;

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Nav */}
      <Header />

      {/* Hero */}
      <section className="container section-rule" style={{ paddingTop: 60, paddingBottom: 40 }}>
        <div className="meta-text" style={{ marginBottom: 16 }}>Productivity Analysis</div>
        <h1 style={{ marginBottom: 16 }}>Report</h1>
        <p style={{ color: "var(--muted)", maxWidth: 400 }}>
          {formatDateHeading(state.currentDate)}
        </p>
      </section>

      {/* Tab toggle */}
      <section className="container section-rule" style={{ padding: "0 24px", display: "flex", gap: 0 }}>
        {(["daily", "weekly"] as Tab[]).map((t) => (
          <button
            key={t}
            className="btn btn-sm"
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "var(--ink)" : "transparent",
              color: tab === t ? "var(--bg)" : "var(--ink)",
              border: "1px solid var(--ink)",
              borderRight: t === "daily" ? "none" : undefined,
            }}
          >
            {t}
          </button>
        ))}
      </section>

      <main className="container" style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 640 }}>
        {tab === "daily" && (
          <>
            {!report ? (
              <div style={{ textAlign: "center", padding: "60px 0" }}>
                <p style={{ color: "var(--muted)", marginBottom: 24 }}>
                  Daily report has not been generated yet.
                </p>
                <button className="btn btn-primary" onClick={() => dispatch({ type: "GENERATE_REPORT" })}>
                  Generate Report &gt;
                </button>
              </div>
            ) : (
              <>
                {/* Hero score */}
                <div style={{ textAlign: "center", padding: "40px 0 48px" }}>
                  <div className="score-large" style={{
                    color: report.scheduleAdherence >= 80 ? "var(--ink)" : "var(--vermillion)",
                  }}>
                    {report.scheduleAdherence}%
                  </div>
                  <div className="meta-text" style={{ marginTop: 8 }}>Schedule Adherence</div>
                </div>

                {/* Dimensions */}
                <ScoreRow label="CL Balance" value={report.clBalance} />
                <ScoreRow label="Productive Hours Accuracy" value={report.productiveHoursAccuracy} />
                <ScoreRow label="Context Switching Score" value={report.contextSwitchingScore} />
                <ScoreRow label="Energy Management" value={report.energyManagement} />
                <ScoreRow label="Deadline Hit Rate" value={report.deadlineHitRate} />

                {/* Burnout */}
                <div className="section-rule" style={{ padding: "16px 0", display: "flex", justifyContent: "space-between" }}>
                  <span className="meta-text">Burnout Risk</span>
                  <span style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: report.burnoutRiskTrend === "safe" ? "var(--safe)" : "var(--vermillion)",
                  }}>
                    {report.burnoutRiskTrend.toUpperCase()}
                  </span>
                </div>

                {/* Insight — trace-log style */}
                <div className="trace-log" style={{ marginTop: 32, padding: 24 }}>
                  <div className="meta-text" style={{ marginBottom: 12 }}>Top Insight</div>
                  <div className="log-line rule" style={{ lineHeight: 1.8 }}>
                    {report.topInsight}
                  </div>
                </div>
              </>
            )}
          </>
        )}

        {tab === "weekly" && (
          <>
            {/* Hero score */}
            <div style={{ textAlign: "center", padding: "40px 0 48px" }}>
              <div className="score-large">74</div>
              <div className="meta-text" style={{ marginTop: 8 }}>Composite Score</div>
            </div>

            <ScoreRow label="Schedule Adherence" value={72} />
            <ScoreRow label="CL Balance" value={68} />
            <ScoreRow label="Context Switching Rate" value={81} />
            <ScoreRow label="Deadline Hit Rate" value={85} />
            <ScoreRow label="Energy Consistency" value={65} />

            {/* 7-day chart */}
            <div style={{ marginTop: 32, borderTop: "0.5px solid var(--rule)", paddingTop: 24 }}>
              <div className="meta-text" style={{ marginBottom: 16 }}>7-Day Rolling CL</div>
              <div style={{ display: "flex", gap: 3, height: 80, alignItems: "end" }}>
                {[28, 34, 31, 38, 34, 18, 22].map((cl, i) => {
                  const days = ["M", "T", "W", "T", "F", "S", "S"];
                  return (
                    <div key={i} style={{ flex: 1, textAlign: "center" }}>
                      <div className="meta-text" style={{
                        marginBottom: 4,
                        color: cl > 35 ? "var(--vermillion)" : undefined,
                        fontWeight: cl > 35 ? 700 : 400,
                      }}>
                        {cl}
                      </div>
                      <div style={{
                        height: `${(cl / 40) * 60}px`,
                        background: cl > 35 ? "var(--vermillion)" : "#E8E0D4",
                      }} />
                      <div className="meta-text" style={{ marginTop: 6 }}>{days[i]}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Insight */}
            <div className="trace-log" style={{ marginTop: 32, padding: 24 }}>
              <div className="meta-text" style={{ marginBottom: 12 }}>Weekly Insight</div>
              <div className="log-line rule" style={{ lineHeight: 1.8 }}>
                {generateWeeklyInsight({
                  compositeScore: 74,
                  deadlineHitRate: 85,
                  averageCLBalance: 29.2,
                  maxCLSpikeDay: "Wednesday",
                  maxCLSpikeValue: 38,
                  lowEnergyDaysCount: 1,
                  recommendedFocusShift: "Monday/Tuesday"
                })}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default function ReportView() {
  return (
    <AppProvider>
      <ReportContent />
    </AppProvider>
  );
}
