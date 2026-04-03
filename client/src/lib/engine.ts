/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Scheduling Engine Utilities
   All computations are deterministic. No inference.
   ═══════════════════════════════════════════════════════════ */

import type {
  Task,
  TaskType,
  TaskPriority,
  BandwidthCurve,
  EnergyLevel,
  ReasoningStep,
  SlotCandidate,
  ScheduleConflict,
  ConflictResolution,
} from "./types";

import type { CLBreakdown } from "./types";

// ── Slot / Time Helpers ───────────────────────────────────

/** Convert slot index (0-95) to time string "HH:MM" */
export function slotToTime(slot: number): string {
  const hours = Math.floor(slot / 4);
  const minutes = (slot % 4) * 15;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/** Convert time string "HH:MM" to slot index */
export function timeToSlot(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 4 + Math.floor(m / 15);
}

/** Duration in minutes to number of slots */
export function durationToSlots(minutes: number): number {
  return Math.ceil(minutes / 15);
}

/** Check if a slot is blocked by sleep or fixed commitments */
export function isSlotBlocked(slot: number, dayIdx: number, profile: any): boolean {
  if (!profile) return false;
  const slotMinutes = slot * 15;
  
  // 1. Sleep
  const { wakeTime, sleepTime } = profile;
  if (wakeTime !== null && sleepTime !== null) {
    if (sleepTime > wakeTime) {
      if (slotMinutes >= sleepTime || slotMinutes < wakeTime) return true;
    } else {
      if (slotMinutes >= sleepTime && slotMinutes < wakeTime) return true;
    }
  }
  
  // 2. Fixed Commitments
  for (const block of (profile.fixedCommitments || [])) {
    if (block.days.includes(dayIdx)) {
      if (slotMinutes >= block.start_min && slotMinutes < block.end_min) return true;
    }
  }
  
  // 3. Hard Exclusions
  for (const block of (profile.hardExclusions || [])) {
    if (block.days.includes(dayIdx)) {
      if (slotMinutes >= block.start_min && slotMinutes < block.end_min) return true;
    }
  }
  
  return false;
}

/** Format duration for display */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

// ── Cognitive Load Calculator ─────────────────────────────

const TYPE_MULTIPLIERS: Record<TaskType, number> = {
  learning: 1.4,
  problem_solving: 1.3,
  writing: 1.1,
  revision: 0.9,
  reading: 0.8,
  administrative: 0.6,
  recreational: -1.0,
};

const PRIO_WEIGHTS: Record<TaskPriority, number> = {
  high: 1.5,
  normal: 1.0,
  low: 0.7,
};

export function computeCL(
  difficulty: number,
  durationMinutes: number,
  deadlineDays: number | null,
  taskType: TaskType,
  priority: TaskPriority,
): CLBreakdown {
  const baseDifficulty = difficulty;
  const durationWeight = Math.min(durationMinutes / 60, 2.0);
  const deadlineUrgency =
    deadlineDays !== null
      ? deadlineDays <= 1
        ? 1.8
        : deadlineDays <= 3
          ? 1.4
          : deadlineDays <= 7
            ? 1.1
            : 1.0
      : 1.0;
  const typeMultiplier = TYPE_MULTIPLIERS[taskType];
  const priorityWeight = PRIO_WEIGHTS[priority];

  const total = +(
    baseDifficulty *
    durationWeight *
    deadlineUrgency *
    Math.abs(typeMultiplier) *
    priorityWeight *
    (typeMultiplier < 0 ? -1 : 1)
  ).toFixed(1);

  return {
    baseDifficulty,
    durationWeight: +durationWeight.toFixed(2),
    deadlineUrgency: +deadlineUrgency.toFixed(2),
    typeMultiplier,
    priorityWeight,
    total,
  };
}

// ── Default Bandwidth Curve ───────────────────────────────
// Ultradian rhythm: peaks at ~10:00, ~15:00; troughs at ~13:00, ~20:00

export function generateDefaultBandwidthCurve(): BandwidthCurve {
  const curve: number[] = [];
  for (let slot = 0; slot < 96; slot++) {
    const hour = slot / 4;
    let bw: number;
    if (hour < 6) bw = 1.0;
    else if (hour < 8) bw = 3.0 + (hour - 6) * 2.0;
    else if (hour < 10) bw = 7.0 + (hour - 8) * 1.5;
    else if (hour < 11) bw = 10.0;
    else if (hour < 13) bw = 10.0 - (hour - 11) * 2.5;
    else if (hour < 14) bw = 5.0;
    else if (hour < 16) bw = 5.0 + (hour - 14) * 2.0;
    else if (hour < 17) bw = 9.0;
    else if (hour < 20) bw = 9.0 - (hour - 17) * 2.0;
    else if (hour < 22) bw = 3.0 - (hour - 20) * 1.0;
    else bw = 1.0;
    curve.push(+Math.max(bw, 0.5).toFixed(1));
  }
  return curve;
}

export function applyEnergyMultiplier(
  curve: BandwidthCurve,
  energy: EnergyLevel,
): BandwidthCurve {
  const multipliers: Record<EnergyLevel, number> = {
    [-2]: 0.5,
    [-1]: 0.7,
    [0]: 1.0,
    [1]: 1.2,
    [2]: 1.4,
  };
  const mul = multipliers[energy];
  return curve.map((v) => +(v * mul).toFixed(1));
}

// ── Slot Fitness Scoring ──────────────────────────────────

export function computeSlotFitness(
  slotIndex: number,
  taskCL: number,
  bandwidth: number,
  isProductiveHour: boolean,
  contextSwitchCount: number,
  dayIdx: number,
  hoursToDeadline: number | null,
): SlotCandidate {
  const productiveHourBonus = isProductiveHour ? 1.2 : 0;
  const contextSwitchPenalty = contextSwitchCount >= 3 ? -2.0 : contextSwitchCount >= 2 ? -0.8 : 0;
  const deadlineProximityBonus =
    hoursToDeadline !== null
      ? hoursToDeadline <= 6
        ? 2.0
        : hoursToDeadline <= 24
          ? 1.0
          : 0
      : 0;

  const fitnessScore = +(
    bandwidth -
    taskCL +
    productiveHourBonus +
    contextSwitchPenalty +
    deadlineProximityBonus
  ).toFixed(1);

  return {
    slotIndex,
    startSlot: slotIndex,
    dayIdx,
    fitnessScore,
    bandwidthRemaining: +(bandwidth - taskCL).toFixed(1),
    productiveHourBonus,
    contextSwitchPenalty,
    deadlineProximityBonus,
    isWinner: false,
  };
}

// ── Sacrifice Impact Calculator ───────────────────────────

export function computeSacrificeImpact(
  originalCL: number,
  sacrificeFactor: number = 0.7,
): { reducedCL: number; impactPercent: number } {
  const reducedCL = +(originalCL * sacrificeFactor).toFixed(1);
  const impactPercent = +((1 - sacrificeFactor) * 100).toFixed(0);
  return { reducedCL, impactPercent };
}

// ── CL Border Weight ──────────────────────────────────────

export function clToBorderClass(cl: number): string {
  const clamped = Math.max(1, Math.min(10, Math.ceil(Math.abs(cl))));
  return `task-block-border-${clamped}`;
}

// ── Core Scheduling Algorithm ──────────────────────────────

export function runSchedulingAlgorithm(
  tasks: Task[],
  bandwidthCurve: BandwidthCurve,
  userProfile: any,
  existingReasoningChain: ReasoningStep[]
): { tasks: Task[]; conflict: ScheduleConflict | null; reasoningChain: ReasoningStep[] } {
  const unscheduled = tasks.filter((t) => t.state === "unscheduled");
  const scheduled = tasks.filter((t) => t.state !== "unscheduled");
  const bw = bandwidthCurve;

  const occupied = new Set<string>();
  for (const t of scheduled) {
    if (t.scheduledSlot) {
      for (let s = t.scheduledSlot.startSlot; s < t.scheduledSlot.endSlot; s++) {
        occupied.add(`${t.scheduledSlot.day}_${s}`);
      }
    }
  }

  const sorted = [...unscheduled].sort((a, b) => {
    const urgA = a.deadline ? (new Date(a.deadline).getTime() - Date.now()) / 3600000 : 999;
    const urgB = b.deadline ? (new Date(b.deadline).getTime() - Date.now()) / 3600000 : 999;
    if (urgA !== urgB) return urgA - urgB;
    const priOrder = { high: 0, normal: 1, low: 2 };
    if (priOrder[a.priority] !== priOrder[b.priority])
      return priOrder[a.priority] - priOrder[b.priority];
    
    // Syllabus-First: use original document order as final tie-breaker
    if (a.order !== undefined && b.order !== undefined && a.order !== b.order) {
      return a.order - b.order;
    }
    
    return Math.abs(b.cl) - Math.abs(a.cl);
  });

  const reasoningChain: ReasoningStep[] = [
    ...existingReasoningChain,
    {
      number: existingReasoningChain.length + 1,
      text: `SCHEDULER RUN: ${sorted.length} tasks in pool. Scanning 7-day window.`,
      isRule: true,
    },
  ];

  const today = new Date();

  const placedTasks: Task[] = [...scheduled];
  let conflict: ScheduleConflict | null = null;

  for (const task of sorted) {
    const slotsNeeded = durationToSlots(task.duration);
    const candidates: any[] = [];

    // Scan days 0-6 relative to today
    for (let dIdx = 0; dIdx < 7; dIdx++) {
      const d = new Date(today);
      d.setDate(today.getDate() + dIdx);
      const actualDayOfWeek = d.getDay();

      // Scan available windows (6:00 - 22:00 = slots 24-88)
      for (let start = 24; start <= 88 - slotsNeeded; start++) {
        let slotFree = true;
        let minBW = Infinity;
        let energyBonus = 0;

        for (let s = start; s < start + slotsNeeded; s++) {
          if (occupied.has(`${dIdx}_${s}`) || isSlotBlocked(s, actualDayOfWeek, userProfile)) {
            slotFree = false;
            break;
          }
          minBW = Math.min(minBW, bw[s]);
          if (userProfile) {
            const slotMins = s * 15;
            const isPeak = userProfile.peakFocusWindows?.some((w: any) => slotMins >= w.start_min && slotMins < w.end_min);
            if (isPeak) energyBonus += 0.5;
          }
        }
        if (!slotFree) continue;

        const hoursToDeadline = task.deadline ? (new Date(task.deadline).getTime() - Date.now()) / 3600000 : null;
        const candidate = computeSlotFitness(start, Math.abs(task.cl), minBW, energyBonus > 0, 0, dIdx, hoursToDeadline);
        candidate.fitnessScore += energyBonus;
        candidate.fitnessScore -= dIdx * 2.0; // Preference for earlier days
        candidate.startSlot = start;
        candidate.dayIdx = dIdx;
        candidates.push(candidate);
      }
    }

    if (candidates.length === 0) {
      conflict = {
        taskId: task.id,
        reason: `No available slot for "${task.name}" (CL=${task.cl}, duration=${task.duration}min)`,
        availableResolutions: task.cl > 5 ? ["defer", "sacrifice"] : ["defer", "extend_deadline"],
        reasoningSteps: [
          {
            number: 1,
            text: `CONFLICT: No valid slot for "${task.name}" before deadline.`,
            isConflict: true,
          },
        ],
      };
      reasoningChain.push({
        number: reasoningChain.length + 1,
        text: `[!] CONFLICT: Cannot place "${task.name}". No available slot found.`,
        isConflict: true,
      });
      placedTasks.push(task);
      continue;
    }

    candidates.sort((a, b) => b.fitnessScore - a.fitnessScore);
    const winner = candidates[0];

    const placedTask: Task = {
      ...task,
      state: "scheduled",
      scheduledSlot: {
        startSlot: winner.startSlot,
        endSlot: winner.startSlot + slotsNeeded,
        day: winner.dayIdx,
        fitnessScore: winner.fitnessScore,
        reasoningSteps: generatePlacementReasoning(task, candidates, winner.dayIdx),
      },
    };

    placedTasks.push(placedTask);
    for (let s = winner.startSlot; s < winner.startSlot + slotsNeeded; s++) {
      occupied.add(`${winner.dayIdx}_${s}`);
    }

    reasoningChain.push({
      number: reasoningChain.length + 1,
      text: `SUCCESS: Placed "${task.name}" at day ${winner.dayIdx}, ${slotToTime(winner.startSlot)} (Fitness: ${winner.fitnessScore.toFixed(1)})`,
    });
  }

  return { tasks: placedTasks, conflict, reasoningChain };
}

// ── Date Formatting ───────────────────────────────────────

export function formatDateHeading(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatShortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ── Generate Reasoning Steps ──────────────────────────────

export function generatePlacementReasoning(
  task: Task,
  candidates: SlotCandidate[],
  winnerIndex: number,
): ReasoningStep[] {
  const winner = candidates[winnerIndex];
  const steps: ReasoningStep[] = [
    {
      number: 1,
      text: `CL-demand("${task.name}") = ${task.cl}`,
      relatedTaskId: task.id,
    },
  ];

  // Show top candidates
  const sorted = [...candidates].sort((a, b) => b.fitnessScore - a.fitnessScore);
  const topCandidates = sorted.slice(0, 4);

  topCandidates.forEach((c) => {
    const isWinner = c.slotIndex === winner.slotIndex;
    
    // Add evaluation details as separate rules/steps to simulate branching
    if (c.productiveHourBonus > 0 && isWinner) {
      steps.push({
        number: steps.length + 1,
        text: `RULE: Productive hour bonus +${c.productiveHourBonus} applied to ${slotToTime(c.slotIndex)}`,
        isRule: true,
        relatedTaskId: task.id,
      });
    }

    if (c.contextSwitchPenalty < 0 && isWinner) {
      steps.push({
        number: steps.length + 1,
        text: `RULE: Context switch penalty ${c.contextSwitchPenalty} — excessive subject transitions in window`,
        isRule: true,
        relatedTaskId: task.id,
      });
    }

    if (!isWinner) {
      steps.push({
        number: steps.length + 1,
        text: `EVALUATE: slot ${slotToTime(c.slotIndex)} -> REJECTED (fitness=${c.fitnessScore}, lower than winner)`,
        isConflict: true,
        relatedTaskId: task.id,
      });
    } else {
       steps.push({
        number: steps.length + 1,
        text: `EVALUATE: slot ${slotToTime(c.slotIndex)} -> ACCEPTED (fitness=${c.fitnessScore}, highest available)`,
        isAction: false,
        relatedTaskId: task.id,
      });   
    }
  });

  steps.push({
    number: steps.length + 1,
    text: `ACTION: Schedule "${task.name}" at ${slotToTime(winner.slotIndex)}`,
    isAction: true,
    relatedTaskId: task.id,
  });

  return steps;
}
