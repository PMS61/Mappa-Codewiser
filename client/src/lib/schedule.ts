/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Full Mathematical Scheduling Pipeline
   Pure deterministic. No AI. No randomness.

   Pipeline stages (per scheduling run):
     1. Score   — compute urgency + priority score for every task
     2. Sort    — order by score DESC (deadline-aware)
     3. Anti-starvation — interleave low-priority tasks
     4. Chunk   — fragment tasks > 60 min across days
     5. Allocate — distribute chunks across sections, check constraints
     6. Diversity — enforce Shannon entropy > 0.5 per day
     7. Output  — produce DaySchedule[] + reasoning log
   ═══════════════════════════════════════════════════════════ */

import type {
  Task,
  TaskChunk,
  SectionName,
  SectionSchedule,
  DaySchedule,
  SchedulerOutput,
  TimeSection,
  UserProfile,
} from "./types";

import {
  BASE_AXIOMS,
  buildSections,
  computeAxiomCost,
  computeAxiomGain,
  priorityToNum,
} from "./energyModel";

import { enrichTask, compareByScore, type ScoredTask } from "./scoring";

import {
  fragmentTask,
  shouldChunk,
  computeChunkSize,
} from "./chunking";

import {
  computeDiversityEntropy,
  applyAntiStarvation,
  computeDailyLoad,
} from "./constraints";

// ── Constants ─────────────────────────────────────────────

const MAX_DAYS = 30;

// ── Date Utilities ────────────────────────────────────────

function todayString(): string {
  return new Date().toISOString().split("T")[0];
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split("T")[0];
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

// ── Slot Map Key ──────────────────────────────────────────

/** Unique key for (dayOffset, sectionName) — prevents double-booking */
function slotKey(day: number, section: SectionName): string {
  return `${day}:${section}`;
}

/** Check if a slot is blocked by user profile (sleep, fixed, hard exclusions) */
function isSlotBlockedManual(slot: number, dayOffset: number, profile: UserProfile | null): boolean {
  if (!profile) return false;
  const slotMins = slot * 15;
  
  // 1. Calculate actual day of week based on a reference (Sunday = 0)
  // We'll use the relative dayOffset from today.
  const today = new Date().getDay();
  const dayOfWeek = (today + dayOffset) % 7;

  // 2. Sleep
  const { wakeTime, sleepTime } = profile;
  if (wakeTime !== null && sleepTime !== null) {
     if (sleepTime > wakeTime) {
       // Normal sleep (e.g. 10pm - 7am)
       if (slotMins >= sleepTime || slotMins < wakeTime) return true;
     } else {
       // Inverted sleep (e.g. 7am - 2pm?)
       if (slotMins >= sleepTime && slotMins < wakeTime) return true;
     }
  }

  // 3. Fixed Commitments (e.g. classes)
  if (profile.fixedCommitments?.some((c: any) => c.days.includes(dayOfWeek) && slotMins >= c.start_min && slotMins < c.end_min)) {
    return true;
  }

  // 4. Hard Exclusions (e.g. chores)
  if (profile.hardExclusions?.some((c: any) => c.days.includes(dayOfWeek) && slotMins >= c.start_min && slotMins < c.end_min)) {
    return true;
  }

  return false;
}

/** Recursively find the next available slot block of N size starting from currentSlot */
function findAvailableSlotBlock(start: number, size: number, day: number, profile: UserProfile | null): number {
  let curr = start;
  while (curr < 96) {
    let blocked = false;
    for (let s = curr; s < curr + size; s++) {
      if (s >= 96 || isSlotBlockedManual(s, day, profile)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) return curr;
    curr++;
  }
  return start; // Fallback to avoid infinite loop
}

// ── Empty Section Schedule ─────────────────────────────────

function emptySection(
  section: TimeSection,
): SectionSchedule {
  return {
    section: section.name,
    tasks: [],
    axiomBudget: section.axiomBudget,
    axiomUsed: 0,
    axiomRemaining: section.axiomBudget,
  };
}

// ── Main Scheduler ────────────────────────────────────────

export interface SchedulerInput {
  tasks: Task[];
  /** ISO YYYY-MM-DD reference date, defaults to today */
  startDate?: string;
  /** Section weights — from DB feedback or defaults */
  sectionWeights?: Partial<Record<SectionName, number>>;
  /** User profile for blocked zones */
  userProfile?: UserProfile | null;
}

/**
 * Full multi-day, multi-section, chunk-aware deterministic scheduler.
 */
export function runScheduler(input: SchedulerInput): SchedulerOutput {
  const today = input.startDate ?? todayString();
  const sections = buildSections(input.sectionWeights ?? {});
  const reasoningLog: string[] = [];
  const unscheduled: string[] = [];

  // ── 1. Separate recreational from work tasks ─────────────
  const workTasks = input.tasks.filter((t) => t.type !== "recreational");
  const recTasks = input.tasks.filter((t) => t.type === "recreational");

  reasoningLog.push(
    `INIT: ${workTasks.length} work tasks, ${recTasks.length} recreational tasks. BASE_AXIOMS=${BASE_AXIOMS}.`,
  );

  // ── 2. Score all work tasks ───────────────────────────────
  const scored: ScoredTask[] = workTasks.map((t) => enrichTask(t, today));
  scored.sort(compareByScore);

  reasoningLog.push(
    `SCORING: Top task = "${scored[0]?.task.name ?? "—"}" score=${scored[0]?.score.toFixed(3) ?? 0}.`,
  );

  // ── 3. Anti-starvation interleave ─────────────────────────
  const orderedScored = applyAntiStarvation(
    scored.map((s) => ({ ...s, priorityNum: s.priorityNum })),
  );
  reasoningLog.push(`ANTI-STARVATION: Queue reordered for fairness.`);

  // ── 4. Build chunk list ────────────────────────────────────
  interface SchedulableUnit {
    taskId: string;
    taskName: string;
    chunkId?: string;
    duration: number;
    eTask: number;      // axiom cost for this unit
    daysRemaining: number;
    preferredDay: number;
    preferredSection: SectionName;
    isRecreational: false;
    priorityNum: number;
  }

  const units: SchedulableUnit[] = [];

  for (const st of orderedScored) {
    const { task, eTask, daysRemaining } = st;
    const pNum = priorityToNum(task.priority);

    if (shouldChunk(task, daysRemaining)) {
      // Compute per-minute axiom rate and generate chunks
      const axiomPerMin = eTask / task.duration;
      const chunks = fragmentTask(task, daysRemaining, axiomPerMin);

      reasoningLog.push(
        `CHUNK: "${task.name}" → ${chunks.length} fragments (${computeChunkSize(task.duration)} min each, gap=${Math.floor(daysRemaining / chunks.length)} days).`,
      );

      for (const chunk of chunks) {
        units.push({
          taskId: task.id,
          taskName: task.name,
          chunkId: chunk.id,
          duration: chunk.duration,
          eTask: chunk.axiomCost,
          daysRemaining,
          preferredDay: chunk.scheduledDay,
          preferredSection: chunk.section,
          isRecreational: false,
          priorityNum: pNum,
        });
      }
    } else {
      // Pick section: morning for high-priority, afternoon for normal, evening for low
      const section: SectionName =
        pNum >= 9 ? "morning" : pNum >= 5 ? "afternoon" : "evening";

      units.push({
        taskId: task.id,
        taskName: task.name,
        duration: task.duration,
        eTask,
        daysRemaining,
        preferredDay: 0,
        preferredSection: section,
        isRecreational: false,
        priorityNum: pNum,
      });
    }
  }

  // ── 5. Allocate into days/sections ────────────────────────

  // daySchedules: dayOffset → section name → SectionSchedule
  const dayMap = new Map<number, Map<SectionName, SectionSchedule>>();

  function getDaySection(day: number, sectionName: SectionName): SectionSchedule {
    if (!dayMap.has(day)) {
      const secMap = new Map<SectionName, SectionSchedule>();
      for (const sec of sections) {
        secMap.set(sec.name, emptySection(sec));
      }
      dayMap.set(day, secMap);
    }
    return dayMap.get(day)!.get(sectionName)!;
  }

  function tryAllocate(
    unit: SchedulableUnit,
    day: number,
    section: SectionName,
  ): boolean {
    const sec = getDaySection(day, section);
    if (sec.axiomRemaining >= unit.eTask) {
      sec.tasks.push({
        taskId: unit.taskId,
        taskName: unit.taskName,
        chunkId: unit.chunkId,
        duration: unit.duration,
        axiomCost: unit.eTask,
        axiomGain: 0,
        isRecreational: false,
      });
      sec.axiomUsed = +(sec.axiomUsed + unit.eTask).toFixed(4);
      sec.axiomRemaining = +(sec.axiomRemaining - unit.eTask).toFixed(4);
      return true;
    }
    return false;
  }

  const SECTION_ORDER: SectionName[] = ["morning", "afternoon", "evening"];

  for (const unit of units) {
    let placed = false;

    // Try preferred day + section first
    for (
      let dayOffset = unit.preferredDay;
      dayOffset < Math.min(unit.daysRemaining + 1, MAX_DAYS);
      dayOffset++
    ) {
      // Try preferred section first, then others
      const order = [
        unit.preferredSection,
        ...SECTION_ORDER.filter((s) => s !== unit.preferredSection),
      ];

      for (const section of order) {
        if (tryAllocate(unit, dayOffset, section)) {
          reasoningLog.push(
            `PLACE: "${unit.taskName}"${unit.chunkId ? ` [${unit.chunkId}]` : ""} → Day+${dayOffset} ${section} (cost=${unit.eTask.toFixed(2)})`,
          );
          placed = true;
          break;
        }
      }

      if (placed) break;
    }

    if (!placed) {
      // Last resort: search all days for any available slot
      for (let dayOffset = 0; dayOffset < MAX_DAYS; dayOffset++) {
        for (const section of SECTION_ORDER) {
          if (tryAllocate(unit, dayOffset, section)) {
            reasoningLog.push(
              `FALLBACK: "${unit.taskName}" placed at Day+${dayOffset} ${section}`,
            );
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }

    if (!placed) {
      reasoningLog.push(`UNSCHEDULED: "${unit.taskName}" (${unit.taskId}) — no axiom budget available.`);
      if (!unscheduled.includes(unit.taskId)) {
        unscheduled.push(unit.taskId);
      }
    }
  }

  // ── 6. Insert recreational tasks as axiom restores ─────────
  for (const rec of recTasks) {
    const gain = computeAxiomGain(rec.duration);
    // Find the section with most deficit first
    for (const [day, secMap] of dayMap) {
      for (const [secName, sec] of secMap) {
        // Only add rec if axiom used > 70% of budget
        if (sec.axiomUsed / sec.axiomBudget > 0.7) {
          sec.tasks.push({
            taskId: rec.id,
            taskName: rec.name,
            duration: rec.duration,
            axiomCost: 0,
            axiomGain: gain,
            isRecreational: true,
          });
          sec.axiomRemaining = +(sec.axiomRemaining + gain).toFixed(4);
          reasoningLog.push(
            `REC: "${rec.name}" inserted in Day+${day} ${secName} (+${gain.toFixed(2)} axioms).`,
          );
          break;
        }
      }
    }
  }

  // ── 7. Build DaySchedule output ───────────────────────────
  const days: DaySchedule[] = [];

  for (const [dayOffset, secMap] of [...dayMap.entries()].sort(
    ([a], [b]) => a - b,
  )) {
    // Determine the actual day of week for this offset
    const refDate = input.startDate ? new Date(`${input.startDate}T12:00:00Z`) : new Date();
    const currentDayOfWeek = (refDate.getDay() + dayOffset) % 7;

    const sectionSchedules: SectionSchedule[] = SECTION_ORDER.map((name) => {
      const sec = secMap.get(name)!;
      let currentSlot = name === "morning" ? 24 : name === "afternoon" ? 48 : 72;
      
      for (const item of sec.tasks) {
        const slotsNeeded = Math.max(1, Math.ceil(item.duration / 15));
        // Find next spot in the section (or subsequent) that isn't blocked
        currentSlot = findAvailableSlotBlock(currentSlot, slotsNeeded, currentDayOfWeek, input.userProfile || null);
        
        item.startSlot = currentSlot;
        currentSlot += slotsNeeded;
      }
      return sec;
    });

    const totalUsed = sectionSchedules.reduce(
      (sum, s) => sum + s.axiomUsed,
      0,
    );
    const totalRemaining = BASE_AXIOMS - totalUsed;

    // Collect flat task list for diversity calc
    const dayTasks = sectionSchedules.flatMap((s) =>
      s.tasks
        .filter((t) => !t.isRecreational)
        .map((t) => input.tasks.find((task) => task.id === t.taskId))
        .filter(Boolean) as Task[],
    );

    const entropy = computeDiversityEntropy(dayTasks);
    const load = computeDailyLoad(dayTasks);

    days.push({
      dayOffset,
      date: addDays(today, dayOffset),
      sections: sectionSchedules,
      totalAxiomsUsed: +totalUsed.toFixed(2),
      totalAxiomsRemaining: +Math.max(0, totalRemaining).toFixed(2),
      diversityEntropy: +entropy.toFixed(4),
      loadAcceptable: load < 10000, // rough guard
    });
  }

  reasoningLog.push(
    `COMPLETE: ${days.length} days scheduled. ${unscheduled.length} tasks unscheduled.`,
  );

  return { days, unscheduled, reasoningLog };
}

/**
 * Extracts a flattened list of task chunks from the scheduler output,
 * suitable for database persistence.
 */
export function extractScheduleChunks(output: SchedulerOutput) {
  const allChunks: Array<{
    id: string;
    parentTaskId: string;
    chunkIndex: number;
    totalChunks: number;
    duration: number;
    scheduledDay: number;
    section: string;
    axiomCost: number;
    state: string;
  }> = [];

  for (const day of output.days) {
    for (const section of day.sections) {
      for (const item of section.tasks) {
        if (item.chunkId) {
          // Identify siblings to count total chunks for this task
          const siblings = day.sections.flatMap(s => 
            s.tasks.filter(t => t.taskId === item.taskId && t.chunkId)
          );
          
          allChunks.push({
            id: item.chunkId,
            parentTaskId: item.taskId,
            chunkIndex: parseInt(item.chunkId.split("_chunk_")[1] ?? "0"),
            totalChunks: siblings.length || 1,
            duration: item.duration,
            scheduledDay: day.dayOffset,
            section: section.section,
            axiomCost: item.axiomCost,
            state: "scheduled",
          });
        }
      }
    }
  }
  return allChunks;
}

// ── Re-exports for backward compat ────────────────────────

export { priorityToNum as priorityToNumber } from "./energyModel";
export { computeAxiomCost as computeEnergyConsumption } from "./energyModel";
export { computeAxiomGain as computeEnergyGain } from "./energyModel";
export const DAILY_ENERGY = BASE_AXIOMS;
export { BASE_AXIOMS };
