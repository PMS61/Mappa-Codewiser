/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Deterministic Energy-Model Task Scheduler
   Pure math, greedy optimization. No AI. No randomness.
   ═══════════════════════════════════════════════════════════

   Energy Model:
     DAILY_ENERGY = 50
     E_task = 0.6 * difficulty² + 0.8 * priority
     E_gain  = 0.2 * duration
     score   = (2 * priority + difficulty) / E_task

   Scheduling Algorithm:
     1. Separate tasks → workTasks | energyTasks
     2. Sort workTasks: priority DESC → score DESC → id ASC (stable)
     3. Anti-starvation: after every 3 high-priority tasks (≥7), insert 1 lower
     4. For each task: if energy ≥ E_task → schedule; else insert energy task or defer
     5. Deferred tasks roll to the next day (multi-day support)
     6. Energy never goes below 0
   ═══════════════════════════════════════════════════════════ */

// ── Constants ─────────────────────────────────────────────

export const DAILY_ENERGY = 50;
const HIGH_PRIORITY_THRESHOLD = 7; // ≥ this is "high priority" for anti-starvation
const ANTI_STARVATION_STREAK = 3;  // every N high-priority tasks, insert 1 low
const MAX_SCHEDULING_DAYS = 30;    // safety ceiling to prevent infinite loops

// ── Public Types ──────────────────────────────────────────

export interface SchedulerTask {
  id: string;
  title: string;
  difficulty: number;              // 1-10
  priority: number;                // 1-10
  duration: number;                // minutes
  type: "work" | "energy_gain";
  date?: string;                   // optional preferred ISO date (YYYY-MM-DD)
}

export interface ScheduledEntry extends SchedulerTask {
  scheduledDate: string;
  energyCost: number;              // energy consumed (0 for energy_gain tasks)
  energyGain: number;              // energy restored (0 for work tasks)
  score: number;                   // priority score used for ranking
  insertedEnergyTaskId?: string;   // id of energy task inserted to unlock this task
}

export interface ScheduleResult {
  schedule: Record<string, ScheduledEntry[]>;  // date → ordered task list
  meta: {
    totalDays: number;
    totalTasksScheduled: number;
    energyByDay: Record<string, { used: number; remaining: number }>;
  };
}

// ── Internal enriched task (work only) ───────────────────

interface EnrichedTask extends SchedulerTask {
  eTask: number;   // pre-computed energy cost
  score: number;   // pre-computed priority score
}

// ── Energy Model Functions ────────────────────────────────

/** E_task = 0.6 * difficulty² + 0.8 * priority */
export function computeEnergyConsumption(difficulty: number, priority: number): number {
  return 0.6 * Math.pow(difficulty, 2) + 0.8 * priority;
}

/** E_gain = 0.2 * duration (minutes) */
export function computeEnergyGain(duration: number): number {
  return 0.2 * duration;
}

/** score = (2 * priority + difficulty) / E_task */
export function computeTaskScore(
  priority: number,
  difficulty: number,
  eTask: number,
): number {
  if (eTask <= 0) return 0;
  return (2 * priority + difficulty) / eTask;
}

// ── Date Utilities ────────────────────────────────────────

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

// ── Anti-Starvation Queue Builder ─────────────────────────

/**
 * Reorders task queue so that after every ANTI_STARVATION_STREAK high-priority
 * tasks, one low-priority task is inserted. This prevents starvation.
 * Both sub-lists are already sorted by their respective priority+score.
 */
function applyAntiStarvation(tasks: EnrichedTask[]): EnrichedTask[] {
  const high = tasks.filter((t) => t.priority >= HIGH_PRIORITY_THRESHOLD);
  const low = tasks.filter((t) => t.priority < HIGH_PRIORITY_THRESHOLD);

  const result: EnrichedTask[] = [];
  let hi = 0;
  let lo = 0;
  let streak = 0;

  while (hi < high.length || lo < low.length) {
    if (streak >= ANTI_STARVATION_STREAK && lo < low.length) {
      result.push(low[lo++]);
      streak = 0;
    } else if (hi < high.length) {
      result.push(high[hi++]);
      streak++;
    } else {
      result.push(low[lo++]);
    }
  }

  return result;
}

// ── Energy Task Picker ────────────────────────────────────

/**
 * Returns the best available energy task for the current day slot.
 * Strategy: pick the task with the highest E_gain (longest duration)
 * that has not yet been used in this day.
 */
function pickEnergyTask(
  energyTasks: SchedulerTask[],
  usedThisDay: Set<string>,
): SchedulerTask | null {
  const available = energyTasks.filter((t) => !usedThisDay.has(t.id));
  if (available.length === 0) return null;
  // Pick highest energy gain (longest duration)
  return available.reduce((best, t) =>
    computeEnergyGain(t.duration) > computeEnergyGain(best.duration) ? t : best,
  );
}

// ── Entry Builders ────────────────────────────────────────

function buildWorkEntry(task: EnrichedTask, date: string): ScheduledEntry {
  return {
    id: task.id,
    title: task.title,
    difficulty: task.difficulty,
    priority: task.priority,
    duration: task.duration,
    type: "work",
    date: task.date,
    scheduledDate: date,
    energyCost: +task.eTask.toFixed(2),
    energyGain: 0,
    score: +task.score.toFixed(3),
  };
}

function buildEnergyEntry(task: SchedulerTask, date: string): ScheduledEntry {
  return {
    id: task.id,
    title: task.title,
    difficulty: task.difficulty,
    priority: task.priority,
    duration: task.duration,
    type: "energy_gain",
    date: task.date,
    scheduledDate: date,
    energyCost: 0,
    energyGain: +computeEnergyGain(task.duration).toFixed(2),
    score: 0,
  };
}

// ── Main Scheduler ────────────────────────────────────────

/**
 * Deterministic greedy scheduler.
 *
 * @param tasks  - Input task list (mix of "work" and "energy_gain")
 * @param startDate - ISO date string (YYYY-MM-DD) for day 0, defaults to today
 * @returns ScheduleResult with per-day task lists and energy metadata
 */
export function runScheduler(
  tasks: SchedulerTask[],
  startDate?: string,
): ScheduleResult {
  const today = startDate ?? toDateString(new Date());

  // ── Separate task pools ──────────────────────────────
  const rawWorkTasks = tasks.filter((t) => t.type === "work");
  const energyTasks = tasks.filter((t) => t.type === "energy_gain");

  // ── Enrich work tasks with energy cost + score ───────
  const enriched: EnrichedTask[] = rawWorkTasks.map((t) => {
    const eTask = computeEnergyConsumption(t.difficulty, t.priority);
    const score = computeTaskScore(t.priority, t.difficulty, eTask);
    return { ...t, eTask, score };
  });

  // ── Sort: priority DESC → score DESC → id ASC (deterministic) ──
  enriched.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  // ── Sort energy tasks: highest gain first ────────────
  const sortedEnergyTasks = [...energyTasks].sort(
    (a, b) => computeEnergyGain(b.duration) - computeEnergyGain(a.duration),
  );

  // ── Multi-day scheduling loop ─────────────────────────
  const schedule: Record<string, ScheduledEntry[]> = {};
  const energyByDay: Record<string, { used: number; remaining: number }> = {};

  let pending: EnrichedTask[] = [...enriched];
  let currentDate = today;
  let dayIndex = 0;

  while (pending.length > 0 && dayIndex < MAX_SCHEDULING_DAYS) {
    // Reset energy for this day
    let currentEnergy = DAILY_ENERGY;
    const dayEntries: ScheduledEntry[] = [];
    const deferred: EnrichedTask[] = [];
    const usedEnergyTasksToday = new Set<string>();

    // Apply anti-starvation ordering for today's queue
    const dayQueue = applyAntiStarvation(pending);

    for (const task of dayQueue) {
      if (currentEnergy >= task.eTask) {
        // ── Schedule the task ──────────────────────────
        dayEntries.push(buildWorkEntry(task, currentDate));
        currentEnergy = Math.max(0, currentEnergy - task.eTask);
      } else {
        // ── Try inserting an energy task ───────────────
        const energyTask = pickEnergyTask(sortedEnergyTasks, usedEnergyTasksToday);

        if (energyTask !== null) {
          const eGain = computeEnergyGain(energyTask.duration);

          // Insert the energy task
          dayEntries.push(buildEnergyEntry(energyTask, currentDate));
          usedEnergyTasksToday.add(energyTask.id);
          currentEnergy = Math.min(DAILY_ENERGY, currentEnergy + eGain);

          // Retry the work task with restored energy
          if (currentEnergy >= task.eTask) {
            const entry = buildWorkEntry(task, currentDate);
            entry.insertedEnergyTaskId = energyTask.id;
            dayEntries.push(entry);
            currentEnergy = Math.max(0, currentEnergy - task.eTask);
          } else {
            // Still not enough energy — defer
            deferred.push(task);
          }
        } else {
          // No energy task available — defer to next day
          deferred.push(task);
        }
      }
    }

    schedule[currentDate] = dayEntries;
    energyByDay[currentDate] = {
      used: +(DAILY_ENERGY - currentEnergy).toFixed(2),
      remaining: +currentEnergy.toFixed(2),
    };

    pending = deferred;
    currentDate = addDays(currentDate, 1);
    dayIndex++;
  }

  // ── Compute totals ────────────────────────────────────
  const totalTasksScheduled = Object.values(schedule).reduce(
    (sum, day) => sum + day.filter((t) => t.type === "work").length,
    0,
  );

  return {
    schedule,
    meta: {
      totalDays: dayIndex,
      totalTasksScheduled,
      energyByDay,
    },
  };
}

// ── Priority Mapper (string → number) ─────────────────────

/**
 * Maps the app's string priority to a numeric value (1-10) for the scheduler.
 * high → 9, normal → 5, low → 2
 */
export function priorityToNumber(priority: "high" | "normal" | "low"): number {
  const map: Record<string, number> = { high: 9, normal: 5, low: 2 };
  return map[priority] ?? 5;
}

/**
 * Maps a task's TaskType to the scheduler's binary work/energy_gain type.
 * recreational → energy_gain, everything else → work
 */
export function taskTypeToSchedulerType(
  type: string,
): "work" | "energy_gain" {
  return type === "recreational" ? "energy_gain" : "work";
}
