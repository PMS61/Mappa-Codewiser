/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Feedback Learning & State Machine
   Deterministic weight updates from efficiency observations.
   Task lifecycle state machine.

   State Machine:
     PENDING → SCHEDULED → IN_PROGRESS → COMPLETED
                         ↘ RESCHEDULED (conflict)
                         ↘ SACRIFICED  (depth reduce)
   ═══════════════════════════════════════════════════════════ */

import type { SectionName, SectionPerformanceRecord, TaskState } from "./types";
import { updateSectionWeights } from "./energyModel";

// ── Efficiency Ratio ──────────────────────────────────────

/**
 * R = actualAxioms / scheduledAxioms
 * R > 1: section ran over budget (penalise weight next cycle)
 * R < 1: section ran under budget (reward weight next cycle)
 * R = 0 guard: if no axioms were scheduled, return 1 (neutral).
 */
export function computeEfficiencyRatio(
  scheduledAxioms: number,
  actualAxioms: number,
): number {
  if (scheduledAxioms <= 0) return 1;
  return +(actualAxioms / scheduledAxioms).toFixed(6);
}

// ── Weight Update Pipeline ────────────────────────────────

/**
 * Reads the latest performance records for each section and computes
 * updated weights using the feedback formula.
 * Returns new normalised weights.
 */
export function computeUpdatedWeights(
  currentWeights: Record<SectionName, number>,
  records: SectionPerformanceRecord[],
): Record<SectionName, number> {
  if (records.length === 0) return currentWeights;

  // Average efficiency per section from recent records
  const sums: Record<SectionName, { total: number; count: number }> = {
    morning: { total: 0, count: 0 },
    afternoon: { total: 0, count: 0 },
    evening: { total: 0, count: 0 },
  };

  for (const rec of records) {
    sums[rec.sectionName].total += rec.efficiencyRatio;
    sums[rec.sectionName].count += 1;
  }

  const avgRatios: Partial<Record<SectionName, number>> = {};
  for (const name of Object.keys(sums) as SectionName[]) {
    const { total, count } = sums[name];
    avgRatios[name] = count > 0 ? total / count : 1;
  }

  return updateSectionWeights(currentWeights, avgRatios);
}

// ── State Machine ─────────────────────────────────────────

/** Valid transitions for the task state machine. */
const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  unscheduled: ["scheduled"],
  scheduled: ["in_progress", "rescheduled", "skipped"],
  in_progress: ["completed", "rescheduled", "sacrificed"],
  completed: [],
  skipped: ["scheduled"],
  rescheduled: ["scheduled"],
  sacrificed: [],
  deadline_extended: ["scheduled"],
};

/**
 * Returns the next state if the transition is valid, or null if not allowed.
 */
export function nextTaskState(
  current: TaskState,
  requested: TaskState,
): TaskState | null {
  const allowed = VALID_TRANSITIONS[current] ?? [];
  return allowed.includes(requested) ? requested : null;
}

/**
 * Returns true if a task can transition to the requested state.
 */
export function canTransition(current: TaskState, requested: TaskState): boolean {
  return nextTaskState(current, requested) !== null;
}

// ── Performance Record Builder ─────────────────────────────

/**
 * Creates a SectionPerformanceRecord from observed data.
 */
export function buildPerformanceRecord(
  sectionName: SectionName,
  scheduledAxioms: number,
  actualAxioms: number,
): SectionPerformanceRecord {
  return {
    sectionName,
    scheduledAxioms,
    actualAxioms,
    efficiencyRatio: computeEfficiencyRatio(scheduledAxioms, actualAxioms),
    recordedAt: new Date().toISOString(),
  };
}
