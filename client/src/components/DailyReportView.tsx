/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Daily Report View
   Every number traces to a specific data point.
   Nothing is inferred.
   ═══════════════════════════════════════════════════════════ */

"use client";

import { useApp } from "@/lib/store";

function ScoreBar({ value, label, maxValue = 100 }: { value: number; label: string; maxValue?: number }) {
  const pct = Math.min((value / maxValue) * 100, 100);
  const isLow = value < 50;

  return (
    <div className="rule-bottom" style={{ padding: "var(--sp-3) 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--sp-2)" }}>
        <span className="task-meta">{label}</span>
        <span
          className="font-mono"
          style={{
            fontWeight: 600,
            fontSize: "0.875rem",
            color: isLow ? "var(--vermillion)" : undefined,
          }}
        >
          {value}
        </span>
      </div>
      <div style={{ height: 4, background: "var(--rule)", width: "100%" }}>
        <div
          style={{
            height: 4,
            width: `${pct}%`,
            background: isLow ? "var(--vermillion)" : "var(--ink)",
          }}
        />
      </div>
    </div>
  );
}

export default function DailyReportView() {
  const { state, dispatch } = useApp();
  const report = state.dailyReport;

  if (!report) {
    return (
      <div style={{ padding: "var(--sp-8)", textAlign: "center" }}>
        <h2 className="font-display" style={{ marginBottom: "var(--sp-4)" }}>
          DAILY REPORT
        </h2>
        <p className="task-meta" style={{ marginBottom: "var(--sp-4)" }}>
          Report not yet generated. Complete your day or click below.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => dispatch({ type: "GENERATE_REPORT" })}
        >
          GENERATE REPORT
        </button>
      </div>
    );
  }

  const burnoutColors: Record<string, string> = {
    safe: "var(--burnout-safe)",
    watch: "var(--burnout-watch)",
    warning: "var(--burnout-warning)",
    critical: "var(--burnout-critical)",
  };

  return (
    <div style={{ padding: "var(--sp-6)", maxWidth: 640 }}>
      <h2
        className="font-display"
        style={{
          fontSize: "1.25rem",
          marginBottom: "var(--sp-6)",
          paddingBottom: "var(--sp-3)",
          borderBottom: "0.5px solid var(--rule)",
        }}
      >
        DAILY REPORT
      </h2>

      {/* Composite Score */}
      <div style={{ textAlign: "center", marginBottom: "var(--sp-8)" }}>
        <span className="score-label">SCHEDULE ADHERENCE</span>
        <div
          className="score-large"
          style={{
            fontSize: "4rem",
            color: report.scheduleAdherence >= 80 ? "var(--ink)" : "var(--vermillion)",
          }}
        >
          {report.scheduleAdherence}%
        </div>
      </div>

      {/* Dimension Scores */}
      <ScoreBar value={report.scheduleAdherence} label="SCHEDULE ADHERENCE" />
      <ScoreBar value={report.clBalance} label="CL BALANCE" />
      <ScoreBar value={report.productiveHoursAccuracy} label="PRODUCTIVE HOURS ACCURACY" />
      <ScoreBar value={report.contextSwitchingScore} label="CONTEXT SWITCHING SCORE" />
      <ScoreBar value={report.energyManagement} label="ENERGY MANAGEMENT" />
      <ScoreBar value={report.deadlineHitRate} label="DEADLINE HIT RATE" />

      {/* Burnout Risk */}
      <div
        className="rule-bottom"
        style={{
          padding: "var(--sp-3) 0",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span className="task-meta">BURNOUT RISK</span>
        <span
          className="font-mono"
          style={{
            fontWeight: 600,
            color: burnoutColors[report.burnoutRiskTrend],
          }}
        >
          {report.burnoutRiskTrend.toUpperCase()}
        </span>
      </div>

      {/* Top Insight */}
      <div
        style={{
          marginTop: "var(--sp-6)",
          padding: "var(--sp-4)",
          borderTop: "2px solid var(--ink)",
        }}
      >
        <span className="score-label">TOP INSIGHT</span>
        <p className="font-mono" style={{ fontSize: "0.8125rem", marginTop: "var(--sp-2)", lineHeight: 1.6 }}>
          {report.topInsight}
        </p>
      </div>

      {/* Back button */}
      <div style={{ marginTop: "var(--sp-6)" }}>
        <button
          className="btn"
          onClick={() => dispatch({ type: "SET_VIEW", payload: "day" })}
        >
          BACK TO SCHEDULE
        </button>
      </div>
    </div>
  );
}
