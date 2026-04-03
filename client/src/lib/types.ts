/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Core Type Definitions
   ═══════════════════════════════════════════════════════════ */

// ── Task Types ────────────────────────────────────────────
export type TaskType =
  | "learning"
  | "problem_solving"
  | "writing"
  | "revision"
  | "reading"
  | "administrative"
  | "recreational";

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  learning: "Learning New Concept",
  problem_solving: "Problem Solving",
  writing: "Writing / Drafting",
  revision: "Revision",
  reading: "Reading",
  administrative: "Administrative",
  recreational: "Recreational",
};

export const TASK_TYPE_MULTIPLIERS: Record<TaskType, number> = {
  learning: 1.4,
  problem_solving: 1.3,
  writing: 1.1,
  revision: 0.9,
  reading: 0.8,
  administrative: 0.6,
  recreational: -1.0,
};

// ── Task Priority ─────────────────────────────────────────
export type TaskPriority = "high" | "normal" | "low";

export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  high: 1.5,
  normal: 1.0,
  low: 0.7,
};

// ── Task Lifecycle States ─────────────────────────────────
export type TaskState =
  | "unscheduled"
  | "scheduled"
  | "in_progress"
  | "completed"
  | "skipped"
  | "rescheduled"
  | "sacrificed"
  | "deadline_extended";

// ── Energy Level States ───────────────────────────────────
export type EnergyLevel = -2 | -1 | 0 | 1 | 2;

export const ENERGY_LABELS: Record<EnergyLevel, string> = {
  [-2]: "Exhausted",
  [-1]: "Depleted",
  [0]: "Baseline",
  [1]: "Energised",
  [2]: "Peak",
};

export const ENERGY_MULTIPLIERS: Record<EnergyLevel, number> = {
  [-2]: 0.5,
  [-1]: 0.7,
  [0]: 1.0,
  [1]: 1.2,
  [2]: 1.4,
};

// ── Day Phase ─────────────────────────────────────────────
export type DayPhase = "planning" | "active" | "wind_down" | "complete";

// ── Burnout Risk ──────────────────────────────────────────
export type BurnoutRisk = "safe" | "watch" | "warning" | "critical";

// ── Productive Hour Learning State ────────────────────────
export type ProductiveHourState =
  | "unknown"
  | "observed"
  | "tracked"
  | "confirmed";

// ── Core Task Interface ───────────────────────────────────
export interface Task {
  id: string;
  name: string;
  type: TaskType;
  difficulty: number; // 1-10
  duration: number; // minutes
  priority: TaskPriority;
  state: TaskState;
  subject?: string;
  deadline?: string; // ISO date string
  energyRecovery?: number; // negative CL for recreational
  cl: number; // computed cognitive load
  clBreakdown: CLBreakdown;
  order: number; // preserved sequence for subtasks
  scheduledSlot?: ScheduledSlot;
  createdAt: string;
}

export interface CLBreakdown {
  baseDifficulty: number;
  durationWeight: number;
  deadlineUrgency: number;
  typeMultiplier: number;
  priorityWeight: number;
  total: number;
}

// ── User Profiling & Calibration ───────────────────────────
export interface UserProfile {
  peakFocusWindows: Array<{ start_min: number; end_min: number }>;
  lowEnergyWindows: Array<{ start_min: number; end_min: number }>;
  fixedCommitments: Array<{ name: string; days: number[]; start_min: number; end_min: number }>;
  hardExclusions: Array<{ name: string; days: number[]; start_min: number; end_min: number }>;
  wakeTime: number; // minutes from midnight
  sleepTime: number; // minutes from midnight
}

export interface ScheduledSlot {
  startSlot: number; // 0-95 (15-min increments)
  endSlot: number;
  day: number; // 0-6
  fitnessScore: number;
  reasoningSteps: ReasoningStep[];
}

// ── Reasoning Chain ───────────────────────────────────────
export interface ReasoningStep {
  number: number;
  text: string;
  isRule?: boolean;
  isAction?: boolean;
  isConflict?: boolean;
  relatedTaskId?: string;
}

// ── Schedule Slot ─────────────────────────────────────────
export interface SlotData {
  scheduledCL: number;
  actualCompletion: boolean;
  energyState: EnergyLevel;
  productiveHourScore: number;
  taskId?: string;
}

// ── Bandwidth Curve ───────────────────────────────────────
export type BandwidthCurve = number[]; // 96 values

// ── Productive Hour Matrix ────────────────────────────────
export type ProductiveHourMatrix = SlotData[][];

// ── Daily Report ──────────────────────────────────────────
export interface DailyReport {
  date: string;
  scheduleAdherence: number;
  clBalance: number;
  productiveHoursAccuracy: number;
  contextSwitchingScore: number;
  energyManagement: number;
  deadlineHitRate: number;
  burnoutRiskTrend: BurnoutRisk;
  topInsight: string;
}

// ── Weekly Report ─────────────────────────────────────────
export interface WeeklyReport {
  weekStart: string;
  dimensions: {
    adherence: number;
    clBalance: number;
    contextSwitching: number;
    deadlineHitRate: number;
    energyConsistency: number;
  };
  composite: number;
  insight: string;
}

// ── Workspace ─────────────────────────────────────────────
export interface Workspace {
  id: string;
  name: string;
  type: "course" | "project";
  subjects: string[];
}

// ── Conflict Resolution ───────────────────────────────────
export type ConflictResolution =
  | "defer"
  | "sacrifice"
  | "extend_deadline"
  | "manual_escalate";

export interface ScheduleConflict {
  taskId: string;
  reason: string;
  availableResolutions: ConflictResolution[];
  reasoningSteps: ReasoningStep[];
}

// ── Slot Fitness Candidate ────────────────────────────────
export interface SlotCandidate {
  slotIndex: number; // Single-day relative
  startSlot: number; // Multi-day aware
  dayIdx: number;
  fitnessScore: number;
  bandwidthRemaining: number;
  productiveHourBonus: number;
  contextSwitchPenalty: number;
  deadlineProximityBonus: number;
  isWinner: boolean;
}

// ── Section / Axiom System ─────────────────────────────────

/** Named time sections within a day */
export type SectionName = "morning" | "afternoon" | "evening";

export interface TimeSection {
  name: SectionName;
  label: string;
  startHour: number; // inclusive
  endHour: number;   // exclusive
  axiomBudget: number; // fraction of BASE_AXIOMS allocated
  weight: number;    // dynamic weight [0,1], sums to 1 across sections
}

/** A single fragment (chunk) of a large task */
export interface TaskChunk {
  id: string;          // e.g. "task-101_chunk_0"
  parentTaskId: string;
  chunkIndex: number;
  totalChunks: number;
  duration: number;    // minutes for this chunk
  scheduledDay: number; // 0-based offset from today
  section: SectionName;
  axiomCost: number;
  state: TaskState;
}

/** Per-section schedule for one day */
export interface SectionSchedule {
  section: SectionName;
  tasks: Array<{
    taskId: string;
    taskName: string;
    chunkId?: string;
    duration: number;
    axiomCost: number;
    axiomGain: number; // for recreational
    isRecreational: boolean;
    startSlot?: number; // 0-95, for UI grid placement
  }>;
  axiomBudget: number;
  axiomUsed: number;
  axiomRemaining: number;
}

/** Full schedule for one day */
export interface DaySchedule {
  dayOffset: number; // 0 = today
  date: string;      // ISO YYYY-MM-DD
  sections: SectionSchedule[];
  totalAxiomsUsed: number;
  totalAxiomsRemaining: number;
  diversityEntropy: number;
  loadAcceptable: boolean;
}

/** Output of the full scheduling pipeline */
export interface SchedulerOutput {
  days: DaySchedule[];
  unscheduled: string[]; // taskIds that could not be placed
  reasoningLog: string[];
}

/** Result of the schedule server action */
export interface RunSchedulerResult {
  days?: DaySchedule[];
  unscheduled?: string[];
  reasoningLog?: string[];
  updatedWeights?: { morning: number; afternoon: number; evening: number };
  error?: string;
}

/** DB record for section performance feedback */
export interface SectionPerformanceRecord {
  sectionName: SectionName;
  scheduledAxioms: number;
  actualAxioms: number;
  efficiencyRatio: number; // actualAxioms / scheduledAxioms
  recordedAt: string;
}
