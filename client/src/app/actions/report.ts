"use server";

import { sql } from "@vercel/postgres";
import { cookies } from "next/headers";
import { verify } from "jsonwebtoken";
import { createTasksTables } from "@/app/actions/tasks";

export interface ReportBaseline {
  userId: number;
  version: number;
  source: string;
  wakeTime: number;
  sleepTime: number;
  peakFocusWindows: Array<{ start_min: number; end_min: number }>;
  lowEnergyWindows: Array<{ start_min: number; end_min: number }>;
  sessionStyle: number;
  switchBuffer: number;
  deadlineStyle: number;
  recoveryActivities: Array<{ name: string; duration_min: number; energy_value: number }>;
  createdAt: string;
}

export interface DailyObservation {
  metricDate: string;
  actualWakeMin: number;
  actualSleepMin: number;
  avgSleepDurationMin: number;
  peak1ActualStart: number;
  low1ActualStart: number;
  avgSessionDurationPct: number;
  recoveryAdherencePct: number;
  contextSwitchesPerDay: number;
  deadlineBufferDays: number;
  updatedAt: string;
}

export interface UpsertDailyObservationInput {
  metricDate?: string;
  actualWakeMin: number;
  actualSleepMin: number;
  avgSleepDurationMin: number;
  peak1ActualStart: number;
  low1ActualStart: number;
  avgSessionDurationPct: number;
  recoveryAdherencePct: number;
  contextSwitchesPerDay: number;
  deadlineBufferDays: number;
}

async function getUserId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token || !process.env.JWT_SECRET) return null;

  try {
    const decoded = verify(token, process.env.JWT_SECRET) as { userId: number };
    return decoded.userId;
  } catch {
    return null;
  }
}

function toDateKey(input?: string): string {
  if (!input) return new Date().toISOString().slice(0, 10);
  return input.slice(0, 10);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function minuteOfDayFromDate(ts: string): number {
  const date = new Date(ts);
  const mins = date.getUTCHours() * 60 + date.getUTCMinutes();
  return clamp(mins, 0, 1439);
}

function computeBaselineSleepDuration(wake: number, sleep: number): number {
  if (wake > sleep) return wake - sleep;
  return 1440 - sleep + wake;
}

async function ensureReportTables(): Promise<void> {
  await createTasksTables();

  await sql`
    CREATE TABLE IF NOT EXISTS report_baselines (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      version INT NOT NULL DEFAULT 1,
      source VARCHAR(50) NOT NULL DEFAULT 'onboarding',
      wake_time INT NOT NULL,
      sleep_time INT NOT NULL,
      peak_focus_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
      low_energy_windows JSONB NOT NULL DEFAULT '[]'::jsonb,
      session_style INT NOT NULL DEFAULT 1,
      switch_buffer INT NOT NULL DEFAULT 1,
      deadline_style INT NOT NULL DEFAULT 1,
      recovery_activities JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, version)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_observations (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      metric_date DATE NOT NULL,
      actual_wake_min INT NOT NULL,
      actual_sleep_min INT NOT NULL,
      avg_sleep_duration_min INT NOT NULL,
      peak1_actual_start INT NOT NULL,
      low1_actual_start INT NOT NULL,
      avg_session_duration_pct FLOAT NOT NULL,
      recovery_adherence_pct FLOAT NOT NULL,
      context_switches_per_day INT NOT NULL,
      deadline_buffer_days INT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, metric_date)
    )
  `;
}

function normalizeBaselineRow(row: any): ReportBaseline {
  return {
    userId: Number(row.user_id),
    version: Number(row.version),
    source: String(row.source ?? "onboarding"),
    wakeTime: Number(row.wake_time),
    sleepTime: Number(row.sleep_time),
    peakFocusWindows: Array.isArray(row.peak_focus_windows) ? row.peak_focus_windows : [],
    lowEnergyWindows: Array.isArray(row.low_energy_windows) ? row.low_energy_windows : [],
    sessionStyle: Number(row.session_style ?? 1),
    switchBuffer: Number(row.switch_buffer ?? 1),
    deadlineStyle: Number(row.deadline_style ?? 1),
    recoveryActivities: Array.isArray(row.recovery_activities) ? row.recovery_activities : [],
    createdAt: new Date(String(row.created_at)).toISOString(),
  };
}

function normalizeObservationRow(row: any): DailyObservation {
  return {
    metricDate: String(row.metric_date).slice(0, 10),
    actualWakeMin: Number(row.actual_wake_min),
    actualSleepMin: Number(row.actual_sleep_min),
    avgSleepDurationMin: Number(row.avg_sleep_duration_min),
    peak1ActualStart: Number(row.peak1_actual_start),
    low1ActualStart: Number(row.low1_actual_start),
    avgSessionDurationPct: Number(row.avg_session_duration_pct),
    recoveryAdherencePct: Number(row.recovery_adherence_pct),
    contextSwitchesPerDay: Number(row.context_switches_per_day),
    deadlineBufferDays: Number(row.deadline_buffer_days),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  };
}

async function getOrCreateBaseline(userId: number): Promise<ReportBaseline | null> {
  const existing = await sql`
    SELECT
      user_id,
      version,
      source,
      wake_time,
      sleep_time,
      peak_focus_windows,
      low_energy_windows,
      session_style,
      switch_buffer,
      deadline_style,
      recovery_activities,
      created_at
    FROM report_baselines
    WHERE user_id = ${userId}
    ORDER BY version DESC
    LIMIT 1
  `;

  if (existing.rows.length > 0) {
    return normalizeBaselineRow(existing.rows[0]);
  }

  const userResult = await sql`
    SELECT
      wake_time,
      sleep_time,
      peak_focus_windows,
      low_energy_windows,
      session_style,
      switch_buffer,
      deadline_style,
      recovery_activities
    FROM users
    WHERE id = ${userId}
    LIMIT 1
  `;

  if (userResult.rows.length === 0) return null;

  const row = userResult.rows[0] as any;
  const peak = Array.isArray(row.peak_focus_windows) ? row.peak_focus_windows : [];
  const low = Array.isArray(row.low_energy_windows) ? row.low_energy_windows : [];
  const recovery = Array.isArray(row.recovery_activities) ? row.recovery_activities : [];

  await sql`
    INSERT INTO report_baselines (
      user_id,
      version,
      source,
      wake_time,
      sleep_time,
      peak_focus_windows,
      low_energy_windows,
      session_style,
      switch_buffer,
      deadline_style,
      recovery_activities
    ) VALUES (
      ${userId},
      1,
      'onboarding',
      ${Number(row.wake_time ?? 420)},
      ${Number(row.sleep_time ?? 1380)},
      ${JSON.stringify(peak)}::jsonb,
      ${JSON.stringify(low)}::jsonb,
      ${Number(row.session_style ?? 1)},
      ${Number(row.switch_buffer ?? 1)},
      ${Number(row.deadline_style ?? 1)},
      ${JSON.stringify(recovery)}::jsonb
    )
  `;

  const created = await sql`
    SELECT
      user_id,
      version,
      source,
      wake_time,
      sleep_time,
      peak_focus_windows,
      low_energy_windows,
      session_style,
      switch_buffer,
      deadline_style,
      recovery_activities,
      created_at
    FROM report_baselines
    WHERE user_id = ${userId}
    ORDER BY version DESC
    LIMIT 1
  `;

  if (created.rows.length === 0) return null;
  return normalizeBaselineRow(created.rows[0]);
}

function buildAutoObservation(
  baseline: ReportBaseline,
  metricDate: string,
  taskSummary: {
    scheduledCount: number;
    completedCount: number;
    recoveryTotal: number;
    recoveryCompleted: number;
  },
  eventRows: any[],
): UpsertDailyObservationInput {
  const baselineSleepDuration = computeBaselineSleepDuration(
    baseline.wakeTime,
    baseline.sleepTime,
  );

  const firstEventMin = eventRows.length > 0
    ? minuteOfDayFromDate(String(eventRows[0].event_at))
    : baseline.wakeTime;

  const lastEventMin = eventRows.length > 0
    ? minuteOfDayFromDate(String(eventRows[eventRows.length - 1].event_at))
    : baseline.sleepTime;

  const uniqueTasksTouched = new Set(eventRows.map((r) => String(r.task_id))).size;

  return {
    metricDate,
    actualWakeMin: firstEventMin,
    actualSleepMin: lastEventMin,
    avgSleepDurationMin: baselineSleepDuration,
    peak1ActualStart: baseline.peakFocusWindows[0]?.start_min ?? 540,
    low1ActualStart: baseline.lowEnergyWindows[0]?.start_min ?? 840,
    avgSessionDurationPct:
      taskSummary.scheduledCount > 0
        ? +(taskSummary.completedCount / taskSummary.scheduledCount * 100).toFixed(2)
        : 100,
    recoveryAdherencePct:
      taskSummary.recoveryTotal > 0
        ? +(taskSummary.recoveryCompleted / taskSummary.recoveryTotal * 100).toFixed(2)
        : 100,
    contextSwitchesPerDay: Math.max(0, uniqueTasksTouched - 1),
    deadlineBufferDays: 0,
  };
}

async function upsertObservation(
  userId: number,
  input: UpsertDailyObservationInput,
): Promise<DailyObservation> {
  const metricDate = toDateKey(input.metricDate);
  const values = {
    actualWakeMin: clamp(Math.round(input.actualWakeMin), 0, 1439),
    actualSleepMin: clamp(Math.round(input.actualSleepMin), 0, 1439),
    avgSleepDurationMin: clamp(Math.round(input.avgSleepDurationMin), 0, 1440),
    peak1ActualStart: clamp(Math.round(input.peak1ActualStart), 0, 1439),
    low1ActualStart: clamp(Math.round(input.low1ActualStart), 0, 1439),
    avgSessionDurationPct: clamp(Number(input.avgSessionDurationPct), 0, 100),
    recoveryAdherencePct: clamp(Number(input.recoveryAdherencePct), 0, 100),
    contextSwitchesPerDay: Math.max(0, Math.round(input.contextSwitchesPerDay)),
    deadlineBufferDays: Math.round(input.deadlineBufferDays),
  };

  await sql`
    INSERT INTO daily_observations (
      user_id,
      metric_date,
      actual_wake_min,
      actual_sleep_min,
      avg_sleep_duration_min,
      peak1_actual_start,
      low1_actual_start,
      avg_session_duration_pct,
      recovery_adherence_pct,
      context_switches_per_day,
      deadline_buffer_days,
      updated_at
    ) VALUES (
      ${userId},
      ${metricDate}::date,
      ${values.actualWakeMin},
      ${values.actualSleepMin},
      ${values.avgSleepDurationMin},
      ${values.peak1ActualStart},
      ${values.low1ActualStart},
      ${values.avgSessionDurationPct},
      ${values.recoveryAdherencePct},
      ${values.contextSwitchesPerDay},
      ${values.deadlineBufferDays},
      NOW()
    )
    ON CONFLICT (user_id, metric_date)
    DO UPDATE SET
      actual_wake_min = EXCLUDED.actual_wake_min,
      actual_sleep_min = EXCLUDED.actual_sleep_min,
      avg_sleep_duration_min = EXCLUDED.avg_sleep_duration_min,
      peak1_actual_start = EXCLUDED.peak1_actual_start,
      low1_actual_start = EXCLUDED.low1_actual_start,
      avg_session_duration_pct = EXCLUDED.avg_session_duration_pct,
      recovery_adherence_pct = EXCLUDED.recovery_adherence_pct,
      context_switches_per_day = EXCLUDED.context_switches_per_day,
      deadline_buffer_days = EXCLUDED.deadline_buffer_days,
      updated_at = NOW()
  `;

  const result = await sql`
    SELECT
      metric_date,
      actual_wake_min,
      actual_sleep_min,
      avg_sleep_duration_min,
      peak1_actual_start,
      low1_actual_start,
      avg_session_duration_pct,
      recovery_adherence_pct,
      context_switches_per_day,
      deadline_buffer_days,
      updated_at
    FROM daily_observations
    WHERE user_id = ${userId}
      AND metric_date = ${metricDate}::date
    LIMIT 1
  `;

  return normalizeObservationRow(result.rows[0]);
}

export async function upsertDailyObservation(
  input: UpsertDailyObservationInput,
): Promise<{ observation?: DailyObservation; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await ensureReportTables();
    const baseline = await getOrCreateBaseline(userId);
    if (!baseline) return { error: "Baseline profile not found" };

    const observation = await upsertObservation(userId, input);
    return { observation };
  } catch (error) {
    console.error("upsertDailyObservation failed:", error);
    return { error: "Failed to save daily observation" };
  }
}

export async function getReportDataForDate(
  metricDate?: string,
): Promise<{
  baseline?: ReportBaseline;
  observation?: DailyObservation;
  autoGenerated?: boolean;
  error?: string;
}> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await ensureReportTables();
    const baseline = await getOrCreateBaseline(userId);
    if (!baseline) return { error: "Baseline profile not found" };

    const dateKey = toDateKey(metricDate);

    const existing = await sql`
      SELECT
        metric_date,
        actual_wake_min,
        actual_sleep_min,
        avg_sleep_duration_min,
        peak1_actual_start,
        low1_actual_start,
        avg_session_duration_pct,
        recovery_adherence_pct,
        context_switches_per_day,
        deadline_buffer_days,
        updated_at
      FROM daily_observations
      WHERE user_id = ${userId}
        AND metric_date = ${dateKey}::date
      LIMIT 1
    `;

    if (existing.rows.length > 0) {
      return {
        baseline,
        observation: normalizeObservationRow(existing.rows[0]),
        autoGenerated: false,
      };
    }

    const summaryResult = await sql`
      SELECT
        COUNT(*) FILTER (WHERE state IN ('scheduled', 'completed', 'skipped')) AS scheduled_count,
        COUNT(*) FILTER (WHERE state = 'completed') AS completed_count,
        COUNT(*) FILTER (WHERE type = 'recreational' AND state IN ('scheduled', 'completed', 'skipped')) AS recovery_total,
        COUNT(*) FILTER (WHERE type = 'recreational' AND state = 'completed') AS recovery_completed
      FROM tasks
      WHERE user_id = ${userId}
    `;

    const summaryRow = (summaryResult.rows[0] ?? {}) as any;
    const taskSummary = {
      scheduledCount: Number(summaryRow.scheduled_count ?? 0),
      completedCount: Number(summaryRow.completed_count ?? 0),
      recoveryTotal: Number(summaryRow.recovery_total ?? 0),
      recoveryCompleted: Number(summaryRow.recovery_completed ?? 0),
    };

    const eventsResult = await sql`
      SELECT task_id, event_at
      FROM task_events
      WHERE user_id = ${userId}
        AND event_at::date = ${dateKey}::date
      ORDER BY event_at ASC
    `;

    const generated = buildAutoObservation(
      baseline,
      dateKey,
      taskSummary,
      eventsResult.rows,
    );

    const observation = await upsertObservation(userId, generated);

    return {
      baseline,
      observation,
      autoGenerated: true,
    };
  } catch (error) {
    console.error("getReportDataForDate failed:", error);
    return { error: "Failed to load report data" };
  }
}
