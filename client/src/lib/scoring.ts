/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Task Scoring Engine
   Deterministic priority scoring with deadline urgency.

   Formulas:
     U     = priority_num / (D + 1)        [urgency; D = days remaining]
     Score = (2 × priority + difficulty + 3 × U) / E_task
   ═══════════════════════════════════════════════════════════ */

import { computeAxiomCost, priorityToNum } from "./energyModel";
import type { Task } from "./types";

// ── Urgency ───────────────────────────────────────────────

/**
 * U = priority_num / (D + 1)
 * D = days remaining until deadline (0 if overdue/no deadline → high urgency).
 */
export function computeUrgency(priorityNum: number, daysRemaining: number): number {
  const D = Math.max(0, daysRemaining);
  return +(priorityNum / (D + 1)).toFixed(6);
}

// ── Task Score ────────────────────────────────────────────

/**
 * Score = (2 × priority_num + difficulty + 3 × U) / E_task
 * Higher score = schedule earlier.
 * Returns 0 if E_task ≤ 0 (safety guard).
 */
export function computeTaskScore(
  priorityNum: number,
  difficulty: number,
  urgency: number,
  eTask: number,
): number {
  if (eTask <= 0) return 0;
  return +((2 * priorityNum + difficulty + 3 * urgency) / eTask).toFixed(6);
}

// ── Full Task Enrichment ───────────────────────────────────

export interface ScoredTask {
  task: Task;
  priorityNum: number;
  eTask: number;       // axiom cost
  daysRemaining: number;
  urgency: number;
  score: number;
}

/**
 * Enriches a Task with all scheduling scores.
 * @param task     — raw task
 * @param today    — reference date string YYYY-MM-DD
 */
export function enrichTask(task: Task, today: string): ScoredTask {
  const priorityNum = priorityToNum(task.priority);
  const eTask = computeAxiomCost(task.difficulty, priorityNum);

  let daysRemaining = 365; // default: no deadline pressure
  if (task.deadline) {
    const deadlineMs = new Date(task.deadline).getTime();
    const todayMs = new Date(today).getTime();
    daysRemaining = Math.max(0, Math.floor((deadlineMs - todayMs) / 86_400_000));
  }

  const urgency = computeUrgency(priorityNum, daysRemaining);
  const score = computeTaskScore(priorityNum, task.difficulty, urgency, eTask);

  return { task, priorityNum, eTask, daysRemaining, urgency, score };
}

// ── Sorting ───────────────────────────────────────────────

/**
 * Comparator for ScoredTask[].
 * Primary: score DESC. Tie-break: id ASC (deterministic).
 */
export function compareByScore(a: ScoredTask, b: ScoredTask): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.task.id.localeCompare(b.task.id);
}
