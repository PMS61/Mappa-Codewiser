/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Application Store (React Context)
   Client-side state management for all scheduling data.
   ═══════════════════════════════════════════════════════════ */

"use client";

import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
} from "react";
import type {
  Task,
  TaskType,
  TaskPriority,
  TaskState,
  EnergyLevel,
  DayPhase,
  BurnoutRisk,
  BandwidthCurve,
  ReasoningStep,
  Workspace,
  DailyReport,
  ScheduleConflict,
} from "./types";
import {
  computeCL,
  generateDefaultBandwidthCurve,
  applyEnergyMultiplier,
  slotToTime,
  computeSlotFitness,
  generatePlacementReasoning,
  durationToSlots,
} from "./engine";

// ── State Shape ───────────────────────────────────────────

export interface AppState {
  // Core data
  tasks: Task[];
  workspaces: Workspace[];

  // Energy & bandwidth
  energyLevel: EnergyLevel;
  bandwidthCurve: BandwidthCurve;
  adjustedBandwidthCurve: BandwidthCurve;

  // Day state
  dayPhase: DayPhase;
  currentDate: Date;
  burnoutRisk: BurnoutRisk;

  // Reasoning
  reasoningChain: ReasoningStep[];
  highlightedTaskId: string | null;

  // Conflicts
  activeConflict: ScheduleConflict | null;

  // Report
  dailyReport: DailyReport | null;

  // UI state
  isAddTaskOpen: boolean;
  selectedView: "day" | "week" | "report";
}

// ── Actions ───────────────────────────────────────────────

type Action =
  | { type: "ADD_TASK"; payload: Omit<Task, "id" | "state" | "cl" | "clBreakdown" | "createdAt"> }
  | { type: "UPDATE_TASK_STATE"; payload: { taskId: string; state: TaskState } }
  | { type: "DELETE_TASK"; payload: string }
  | { type: "SET_ENERGY"; payload: EnergyLevel }
  | { type: "SET_DAY_PHASE"; payload: DayPhase }
  | { type: "HIGHLIGHT_TASK"; payload: string | null }
  | { type: "TOGGLE_ADD_TASK" }
  | { type: "SET_VIEW"; payload: "day" | "week" | "report" }
  | { type: "RUN_SCHEDULER" }
  | { type: "SET_CONFLICT"; payload: ScheduleConflict | null }
  | { type: "RESOLVE_CONFLICT"; payload: { taskId: string; resolution: string } }
  | { type: "GENERATE_REPORT" };

// ── ID Generator ──────────────────────────────────────────

let _idCounter = 100;
function nextId(): string {
  _idCounter += 1;
  return `task-${_idCounter}`;
}

// ── Reducer ───────────────────────────────────────────────

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "ADD_TASK": {
      const p = action.payload;
      const deadlineDays = p.deadline
        ? Math.max(0, (new Date(p.deadline).getTime() - Date.now()) / 86400000)
        : null;
      const clBreakdown = computeCL(
        p.difficulty,
        p.duration,
        deadlineDays,
        p.type,
        p.priority,
      );
      const newTask: Task = {
        ...p,
        id: nextId(),
        state: "unscheduled",
        cl: clBreakdown.total,
        clBreakdown,
        createdAt: new Date().toISOString(),
      };

      const newTasks = [...state.tasks, newTask];

      // Generate reasoning for the add
      const addReasoning: ReasoningStep = {
        number: state.reasoningChain.length + 1,
        text: `NEW TASK: "${newTask.name}" classified. CL=${newTask.cl}. Type=${newTask.type}. Pool=${newTask.deadline ? "deadline" : newTask.type === "recreational" ? "energy" : "floating"}.`,
      };

      return {
        ...state,
        tasks: newTasks,
        reasoningChain: [...state.reasoningChain, addReasoning],
        isAddTaskOpen: false,
      };
    }

    case "UPDATE_TASK_STATE": {
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.payload.taskId
            ? { ...t, state: action.payload.state }
            : t,
        ),
      };
    }

    case "DELETE_TASK": {
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.payload),
      };
    }

    case "SET_ENERGY": {
      const newCurve = applyEnergyMultiplier(
        state.bandwidthCurve,
        action.payload,
      );
      const energyReasoning: ReasoningStep = {
        number: state.reasoningChain.length + 1,
        text: `ENERGY UPDATE: Level set to ${action.payload}. Bandwidth curve recalculated with ×${action.payload >= 0 ? "+" : ""}${action.payload} multiplier.`,
      };
      return {
        ...state,
        energyLevel: action.payload,
        adjustedBandwidthCurve: newCurve,
        reasoningChain: [...state.reasoningChain, energyReasoning],
      };
    }

    case "SET_DAY_PHASE": {
      return { ...state, dayPhase: action.payload };
    }

    case "HIGHLIGHT_TASK": {
      return { ...state, highlightedTaskId: action.payload };
    }

    case "TOGGLE_ADD_TASK": {
      return { ...state, isAddTaskOpen: !state.isAddTaskOpen };
    }

    case "SET_VIEW": {
      return { ...state, selectedView: action.payload };
    }

    case "RUN_SCHEDULER": {
      // Schedule unscheduled tasks
      const unscheduled = state.tasks.filter((t) => t.state === "unscheduled");
      const scheduled = state.tasks.filter((t) => t.state !== "unscheduled");
      const bw = state.adjustedBandwidthCurve;

      // Track occupied slots
      const occupied = new Set<number>();
      for (const t of scheduled) {
        if (t.scheduledSlot) {
          for (let s = t.scheduledSlot.startSlot; s < t.scheduledSlot.endSlot; s++) {
            occupied.add(s);
          }
        }
      }

      // Sort by urgency, priority, CL
      const sorted = [...unscheduled].sort((a, b) => {
        const urgA = a.deadline
          ? (new Date(a.deadline).getTime() - Date.now()) / 3600000
          : 999;
        const urgB = b.deadline
          ? (new Date(b.deadline).getTime() - Date.now()) / 3600000
          : 999;
        if (urgA !== urgB) return urgA - urgB;
        const priOrder = { high: 0, normal: 1, low: 2 };
        if (priOrder[a.priority] !== priOrder[b.priority])
          return priOrder[a.priority] - priOrder[b.priority];
        return Math.abs(b.cl) - Math.abs(a.cl);
      });

      const newReasoning: ReasoningStep[] = [
        ...state.reasoningChain,
        {
          number: state.reasoningChain.length + 1,
          text: `SCHEDULER RUN: ${sorted.length} tasks in pool. Sorting by urgency > priority > CL.`,
          isRule: true,
        },
      ];

      const placedTasks: Task[] = [...scheduled];
      let conflict: ScheduleConflict | null = null;

      for (const task of sorted) {
        const slotsNeeded = durationToSlots(task.duration);
        const candidates: ReturnType<typeof computeSlotFitness>[] = [];

        // Scan available windows (6:00 - 22:00 = slots 24-88)
        for (let start = 24; start <= 88 - slotsNeeded; start++) {
          let slotFree = true;
          let minBW = Infinity;
          for (let s = start; s < start + slotsNeeded; s++) {
            if (occupied.has(s)) {
              slotFree = false;
              break;
            }
            minBW = Math.min(minBW, bw[s]);
          }
          if (!slotFree) continue;

          const hoursToDeadline = task.deadline
            ? (new Date(task.deadline).getTime() - Date.now()) / 3600000
            : null;

          const candidate = computeSlotFitness(
            start,
            Math.abs(task.cl),
            minBW,
            Math.random() > 0.6, // Simplified productive hour check
            0,
            hoursToDeadline,
          );
          candidates.push(candidate);
        }

        if (candidates.length === 0) {
          // Conflict detected
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
          newReasoning.push({
            number: newReasoning.length + 1,
            text: `[!] CONFLICT: Cannot place "${task.name}". No available slot found.`,
            isConflict: true,
          });
          placedTasks.push(task);
          continue;
        }

        // Pick best candidate
        candidates.sort((a, b) => b.fitnessScore - a.fitnessScore);
        candidates[0].isWinner = true;
        const winner = candidates[0];

        const placedTask: Task = {
          ...task,
          state: "scheduled",
          scheduledSlot: {
            startSlot: winner.slotIndex,
            endSlot: winner.slotIndex + slotsNeeded,
            day: 0,
            fitnessScore: winner.fitnessScore,
            reasoningSteps: generatePlacementReasoning(task, candidates, 0),
          },
        };

        // Mark slots occupied
        for (let s = winner.slotIndex; s < winner.slotIndex + slotsNeeded; s++) {
          occupied.add(s);
        }

        placedTasks.push(placedTask);

        // Add reasoning
        const steps = generatePlacementReasoning(task, candidates, 0);
        for (const step of steps) {
          newReasoning.push({
            ...step,
            number: newReasoning.length + 1,
          });
        }
      }

      return {
        ...state,
        tasks: placedTasks,
        reasoningChain: newReasoning,
        activeConflict: conflict,
        dayPhase: "active",
      };
    }

    case "SET_CONFLICT": {
      return { ...state, activeConflict: action.payload };
    }

    case "RESOLVE_CONFLICT": {
      return { ...state, activeConflict: null };
    }

    case "GENERATE_REPORT": {
      const tasks = state.tasks;
      const scheduled = tasks.filter((t) => t.state === "scheduled" || t.state === "completed" || t.state === "skipped");
      const completed = tasks.filter((t) => t.state === "completed");
      const adherence = scheduled.length > 0 ? (completed.length / scheduled.length) * 100 : 0;

      const report: DailyReport = {
        date: state.currentDate.toISOString(),
        scheduleAdherence: +adherence.toFixed(0),
        clBalance: 72,
        productiveHoursAccuracy: 68,
        contextSwitchingScore: 81,
        energyManagement: 75,
        deadlineHitRate: 90,
        burnoutRiskTrend: state.burnoutRisk,
        topInsight: scheduled.length === 0
          ? "No tasks scheduled. Add tasks and run the scheduler."
          : adherence > 80
            ? "Strong adherence today. Productive hours align with high-CL placement."
            : "Adherence below target. Consider reducing tomorrow's CL budget.",
      };

      return { ...state, dailyReport: report, dayPhase: "complete" };
    }

    default:
      return state;
  }
}

// ── Initial State ─────────────────────────────────────────

const baseCurve = generateDefaultBandwidthCurve();

const SAMPLE_TASKS: Task[] = [
  {
    id: "task-1",
    name: "Graph Theory — Dijkstra's Implementation",
    type: "problem_solving",
    difficulty: 8,
    duration: 90,
    priority: "high",
    state: "scheduled",
    subject: "Algorithms",
    deadline: new Date(Date.now() + 86400000 * 2).toISOString(),
    cl: 8.2,
    clBreakdown: {
      baseDifficulty: 8,
      durationWeight: 1.5,
      deadlineUrgency: 1.4,
      typeMultiplier: 1.3,
      priorityWeight: 1.5,
      total: 8.2,
    },
    scheduledSlot: {
      startSlot: 40, // 10:00
      endSlot: 46, // 11:30
      day: 0,
      fitnessScore: 4.2,
      reasoningSteps: [
        { number: 1, text: 'CL-demand("Graph Theory — Dijkstra\'s Implementation") = 8.2' },
        { number: 2, text: "Candidate 1: slot 10:00 (fitness=4.2, bw_remaining=1.8)" },
        { number: 3, text: "Candidate 2: slot 14:00 (fitness=3.1, bw_remaining=0.9)" },
        { number: 4, text: "Candidate 3: slot 15:30 (fitness=2.8, bw_remaining=0.8)" },
        { number: 5, text: "RULE: Productive hour bonus +1.2 applied to 10:00", isRule: true },
        { number: 6, text: "RULE: Deadline proximity bonus +1.0 — 48h remaining", isRule: true },
        { number: 7, text: 'ACTION: Schedule "Graph Theory" at 10:00. Fitness score: 4.2.', isAction: true, relatedTaskId: "task-1" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "task-2",
    name: "OS Lecture Notes — Process Scheduling",
    type: "reading",
    difficulty: 5,
    duration: 45,
    priority: "normal",
    state: "scheduled",
    subject: "Operating Systems",
    cl: 3.6,
    clBreakdown: {
      baseDifficulty: 5,
      durationWeight: 0.75,
      deadlineUrgency: 1.0,
      typeMultiplier: 0.8,
      priorityWeight: 1.0,
      total: 3.6,
    },
    scheduledSlot: {
      startSlot: 48, // 12:00
      endSlot: 51, // 12:45
      day: 0,
      fitnessScore: 3.4,
      reasoningSteps: [
        { number: 1, text: 'CL-demand("OS Lecture Notes") = 3.6' },
        { number: 2, text: "Candidate 1: slot 12:00 (fitness=3.4, bw_remaining=1.4)" },
        { number: 3, text: "Candidate 2: slot 16:00 (fitness=2.9, bw_remaining=1.4)" },
        { number: 4, text: 'ACTION: Schedule "OS Lecture Notes" at 12:00. Fitness score: 3.4.', isAction: true, relatedTaskId: "task-2" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "task-3",
    name: "Research Paper Draft — Section 3",
    type: "writing",
    difficulty: 7,
    duration: 60,
    priority: "high",
    state: "scheduled",
    subject: "Research",
    deadline: new Date(Date.now() + 86400000 * 1).toISOString(),
    cl: 6.9,
    clBreakdown: {
      baseDifficulty: 7,
      durationWeight: 1.0,
      deadlineUrgency: 1.8,
      typeMultiplier: 1.1,
      priorityWeight: 1.5,
      total: 6.9,
    },
    scheduledSlot: {
      startSlot: 56, // 14:00
      endSlot: 60, // 15:00
      day: 0,
      fitnessScore: 3.8,
      reasoningSteps: [
        { number: 1, text: 'CL-demand("Research Paper Draft — Section 3") = 6.9' },
        { number: 2, text: "Candidate 1: slot 14:00 (fitness=3.8, bw_remaining=2.1)" },
        { number: 3, text: "RULE: Deadline proximity bonus +2.0 — 24h remaining", isRule: true },
        { number: 4, text: 'ACTION: Schedule "Research Paper Draft" at 14:00. Fitness score: 3.8.', isAction: true, relatedTaskId: "task-3" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "task-4",
    name: "Walk — Campus Loop",
    type: "recreational",
    difficulty: 1,
    duration: 30,
    priority: "low",
    state: "scheduled",
    subject: "Recovery",
    energyRecovery: -2.0,
    cl: -2.0,
    clBreakdown: {
      baseDifficulty: 1,
      durationWeight: 0.5,
      deadlineUrgency: 1.0,
      typeMultiplier: -1.0,
      priorityWeight: 0.7,
      total: -2.0,
    },
    scheduledSlot: {
      startSlot: 52, // 13:00
      endSlot: 54, // 13:30
      day: 0,
      fitnessScore: 5.0,
      reasoningSteps: [
        { number: 1, text: 'CL-demand("Walk — Campus Loop") = -2.0 (recovery)' },
        { number: 2, text: "RULE: Energy trough detected at 13:00. Recovery block eligible.", isRule: true },
        { number: 3, text: 'ACTION: Schedule "Walk" at 13:00. Energy recovery: -2.0 CL.', isAction: true, relatedTaskId: "task-4" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "task-5",
    name: "Linear Algebra — Matrix Decomposition",
    type: "learning",
    difficulty: 9,
    duration: 75,
    priority: "high",
    state: "scheduled",
    subject: "Mathematics",
    deadline: new Date(Date.now() + 86400000 * 3).toISOString(),
    cl: 9.1,
    clBreakdown: {
      baseDifficulty: 9,
      durationWeight: 1.25,
      deadlineUrgency: 1.4,
      typeMultiplier: 1.4,
      priorityWeight: 1.5,
      total: 9.1,
    },
    scheduledSlot: {
      startSlot: 32, // 08:00
      endSlot: 37, // 09:15
      day: 0,
      fitnessScore: 3.5,
      reasoningSteps: [
        { number: 1, text: 'CL-demand("Linear Algebra — Matrix Decomposition") = 9.1' },
        { number: 2, text: "Current slot (08:00) bandwidth = 7.0" },
        { number: 3, text: "RULE: IF demand > remaining, scan for peak window", isRule: true },
        { number: 4, text: "Peak window 08:00-09:15: bandwidth rising to 10.0" },
        { number: 5, text: "RULE: Productive hour bonus +1.2 applied", isRule: true },
        { number: 6, text: 'ACTION: Schedule "Linear Algebra" at 08:00. Fitness: 3.5.', isAction: true, relatedTaskId: "task-5" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "task-6",
    name: "Email — Project Status Update",
    type: "administrative",
    difficulty: 2,
    duration: 15,
    priority: "normal",
    state: "scheduled",
    subject: "Admin",
    cl: 1.2,
    clBreakdown: {
      baseDifficulty: 2,
      durationWeight: 0.25,
      deadlineUrgency: 1.0,
      typeMultiplier: 0.6,
      priorityWeight: 1.0,
      total: 1.2,
    },
    scheduledSlot: {
      startSlot: 38, // 09:30
      endSlot: 39, // 09:45
      day: 0,
      fitnessScore: 6.8,
      reasoningSteps: [
        { number: 1, text: 'CL-demand("Email") = 1.2' },
        { number: 2, text: "RULE: Low CL task — fill recovery gap between high-CL blocks", isRule: true },
        { number: 3, text: 'ACTION: Schedule "Email" at 09:30. Fitness: 6.8.', isAction: true, relatedTaskId: "task-6" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "task-7",
    name: "Database Design — ER Diagrams",
    type: "problem_solving",
    difficulty: 6,
    duration: 60,
    priority: "normal",
    state: "scheduled",
    subject: "Databases",
    deadline: new Date(Date.now() + 86400000 * 5).toISOString(),
    cl: 4.7,
    clBreakdown: {
      baseDifficulty: 6,
      durationWeight: 1.0,
      deadlineUrgency: 1.0,
      typeMultiplier: 1.3,
      priorityWeight: 1.0,
      total: 4.7,
    },
    scheduledSlot: {
      startSlot: 62, // 15:30
      endSlot: 66, // 16:30
      day: 0,
      fitnessScore: 4.1,
      reasoningSteps: [
        { number: 1, text: 'CL-demand("Database Design") = 4.7' },
        { number: 2, text: "Candidate 1: slot 15:30 (fitness=4.1, bw_remaining=4.3)" },
        { number: 3, text: 'ACTION: Schedule "Database Design" at 15:30. Fitness: 4.1.', isAction: true, relatedTaskId: "task-7" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: "task-8",
    name: "Revision — Week 3 Algorithms",
    type: "revision",
    difficulty: 4,
    duration: 45,
    priority: "low",
    state: "scheduled",
    subject: "Algorithms",
    cl: 2.3,
    clBreakdown: {
      baseDifficulty: 4,
      durationWeight: 0.75,
      deadlineUrgency: 1.0,
      typeMultiplier: 0.9,
      priorityWeight: 0.7,
      total: 2.3,
    },
    scheduledSlot: {
      startSlot: 68, // 17:00
      endSlot: 71, // 17:45
      day: 0,
      fitnessScore: 3.7,
      reasoningSteps: [
        { number: 1, text: 'CL-demand("Revision — Week 3") = 2.3' },
        { number: 2, text: "RULE: Wind-down approaching. CL < 4.0 — permitted.", isRule: true },
        { number: 3, text: 'ACTION: Schedule "Revision" at 17:00. Fitness: 3.7.', isAction: true, relatedTaskId: "task-8" },
      ],
    },
    createdAt: new Date().toISOString(),
  },
];

const initialState: AppState = {
  tasks: SAMPLE_TASKS,
  workspaces: [
    { id: "ws-1", name: "Computer Science", type: "course", subjects: ["Algorithms", "Operating Systems", "Databases"] },
    { id: "ws-2", name: "Research Project", type: "project", subjects: ["Research", "Mathematics"] },
  ],
  energyLevel: 0,
  bandwidthCurve: baseCurve,
  adjustedBandwidthCurve: baseCurve,
  dayPhase: "active",
  currentDate: new Date(),
  burnoutRisk: "safe",
  reasoningChain: [
    { number: 1, text: "SCHEDULER INITIALIZED. 96×7 matrix loaded. Energy state: Baseline (0).", isRule: true },
    { number: 2, text: "Bandwidth curve: default ultradian — peaks at 10:00, 15:00." },
    { number: 3, text: `8 tasks in pool. Fixed blocks: 0. Sorting by urgency > priority > CL.` },
    { number: 4, text: 'CL-demand("Linear Algebra — Matrix Decomposition") = 9.1' },
    { number: 5, text: "Candidate 1: slot 08:00 (fitness=3.5, bw=7.0)" },
    { number: 6, text: "RULE: Highest CL task placed first in peak window.", isRule: true },
    { number: 7, text: 'ACTION: Schedule "Linear Algebra" at 08:00.', isAction: true, relatedTaskId: "task-5" },
    { number: 8, text: 'CL-demand("Graph Theory — Dijkstra\'s") = 8.2' },
    { number: 9, text: "Candidate 1: slot 10:00 (fitness=4.2, bw_remaining=1.8)" },
    { number: 10, text: "RULE: Productive hour bonus +1.2 applied to 10:00.", isRule: true },
    { number: 11, text: 'ACTION: Schedule "Graph Theory" at 10:00.', isAction: true, relatedTaskId: "task-1" },
    { number: 12, text: 'CL-demand("Research Paper Draft") = 6.9' },
    { number: 13, text: "RULE: Deadline 24h — proximity bonus +2.0.", isRule: true },
    { number: 14, text: 'ACTION: Schedule "Research Paper Draft" at 14:00.', isAction: true, relatedTaskId: "task-3" },
    { number: 15, text: "RULE: Cumulative CL in 08:00-11:30 window = 18.5. Threshold 18.0 breached.", isRule: true },
    { number: 16, text: "ACTION: Insert recovery block at 13:00.", isAction: true },
    { number: 17, text: 'CL-demand("Walk — Campus Loop") = -2.0 (recovery)' },
    { number: 18, text: "RULE: Energy trough at 13:00. Recreational task placed.", isRule: true },
    { number: 19, text: "Net CL for 12:00-14:00 window: 3.6 + (-2.0) = 1.6", },
    { number: 20, text: 'ACTION: Remaining tasks placed. Schedule complete. Total CL: 34.0.', isAction: true },
  ],
  highlightedTaskId: null,
  activeConflict: null,
  dailyReport: null,
  isAddTaskOpen: false,
  selectedView: "day",
};

// ── Context ───────────────────────────────────────────────

const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
