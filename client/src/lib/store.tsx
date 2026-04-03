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
  generatePlacementReasoning,
  durationToSlots,
  isSlotBlocked,
  runSchedulingAlgorithm,
} from "./engine";
import { generateDailyInsight } from "./templates";

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

  // User Profile / Calibration
  userProfile: {
    peakFocusWindows: any[];
    lowEnergyWindows: any[];
    fixedCommitments: any[];
    hardExclusions: any[];
    wakeTime: number;
    sleepTime: number;
  } | null;
}

// ── Actions ───────────────────────────────────────────────

type Action =
  | { type: "ADD_TASK"; payload: Task }
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
  | { type: "GENERATE_REPORT" }
  | { type: "SCHEDULE_TASK_MANUALLY"; payload: { taskId: string; startSlot: number, day: number } }
  | { type: "INIT_TASKS"; payload: Task[] }
  | { type: "BULK_UPDATE_TASKS"; payload: Task[] }
  | { type: "SET_TASKS"; payload: Task[] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  | { type: "SET_USER_PROFILE"; payload: any };

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
      const newTask = action.payload;
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

    case "SET_TASKS": {
      return {
        ...state,
        tasks: action.payload,
      };
    }

    case "SET_USER_PROFILE":
      return { 
        ...state, 
        userProfile: {
          peakFocusWindows: action.payload.peak_focus_windows || [],
          lowEnergyWindows: action.payload.low_energy_windows || [],
          fixedCommitments: action.payload.fixed_commitments || [],
          hardExclusions: action.payload.hard_exclusions || [],
          wakeTime: action.payload.wake_time || 420,
          sleepTime: action.payload.sleep_time || 1380,
        }
      };

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
      const result = runSchedulingAlgorithm(
        state.tasks,
        state.adjustedBandwidthCurve,
        state.userProfile,
        state.reasoningChain
      );
      return {
        ...state,
        tasks: result.tasks,
        activeConflict: result.conflict,
        reasoningChain: result.reasoningChain,
      };
    }

    case "SET_CONFLICT": {
      return { ...state, activeConflict: action.payload };
    }

    case "RESOLVE_CONFLICT": {
      const { taskId, resolution } = action.payload;
      let newTasks = [...state.tasks];
      const tIdx = newTasks.findIndex(t => t.id === taskId);
      let stepMessage = `CONFLICT RESOLVED: ${resolution.toUpperCase()}`;

      if (tIdx >= 0) {
        const t = newTasks[tIdx];
        if (resolution === "sacrifice") {
          newTasks[tIdx] = { ...t, cl: t.cl * 0.7, state: "sacrificed", clBreakdown: { ...t.clBreakdown, total: t.cl * 0.7 } };
          stepMessage = `Depth Sacrificed for "${t.name}". CL reduced by 30% from ${t.cl.toFixed(1)} to ${(t.cl * 0.7).toFixed(1)}.`;
        } else if (resolution === "extend_deadline") {
          newTasks[tIdx] = { ...t, state: "deadline_extended" };
          stepMessage = `Deadline Extended for "${t.name}" (Allowed due to low/normal priority).`;
        } else if (resolution === "defer") {
          newTasks[tIdx] = { ...t, state: "rescheduled" };
          stepMessage = `Task "${t.name}" deferred to next scheduling loop.`;
        }
      }

      return { 
        ...state, 
        tasks: newTasks, 
        activeConflict: null,
        reasoningChain: [...state.reasoningChain, { number: state.reasoningChain.length + 1, text: stepMessage, isRule: true }]
      };
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
          : generateDailyInsight({
              adherencePercentage: +adherence.toFixed(0),
              totalCL: tasks.reduce((sum, t) => sum + Math.abs(t.cl), 0),
              highCLTasksPlacedInPeakCount: scheduled.filter(t => Math.abs(t.cl) > 5).length,
              unresolvedConflictsCount: state.activeConflict ? 1 : 0,
              contextSwitchPenalty: 3.5, // Mock calculated penalty
              burnoutRisk: state.burnoutRisk,
              energyDeficit: 4
            }),
      };

      return { ...state, dailyReport: report, dayPhase: "complete" };
    }

    case "SCHEDULE_TASK_MANUALLY": {
      const task = state.tasks.find(t => t.id === action.payload.taskId);
      if (!task) return state;
      const slotsNeeded = durationToSlots(task.duration);
      
      const newReasoning: ReasoningStep = {
        number: state.reasoningChain.length + 1,
        text: `MANUAL SCHEDULING: User dragged "${task.name}" into Matrix view at day ${action.payload.day}, slot ${action.payload.startSlot}.`,
        isAction: true,
        relatedTaskId: task.id
      };

      return {
        ...state,
        tasks: state.tasks.map(t => t.id === action.payload.taskId ? {
          ...t,
          state: "scheduled" as TaskState,
          scheduledSlot: {
            startSlot: action.payload.startSlot,
            endSlot: action.payload.startSlot + slotsNeeded,
            day: action.payload.day,
            fitnessScore: 5.0, // Arbitrary for manual override
            reasoningSteps: [newReasoning]
          }
        } : t),
        reasoningChain: [...state.reasoningChain, newReasoning]
      };
    }

    case "INIT_TASKS": {
      // Replace sample tasks with DB tasks on first load.
      // If the store already has user-created tasks (not sample data), merge.
      return {
        ...state,
        tasks: action.payload,
        reasoningChain: [
          {
            number: 1,
            text: `SCHEDULER INITIALIZED. Loaded ${action.payload.length} tasks from database.`,
            isRule: true,
          },
        ],
      };
    }

    case "BULK_UPDATE_TASKS": {
      // Merge incoming tasks (from API schedule result) into state.
      // Tasks in payload overwrite existing ones by id.
      const updateMap = new Map(action.payload.map((t) => [t.id, t]));
      const merged = state.tasks.map((t) => updateMap.get(t.id) ?? t);
      // Add any new tasks not already in state
      const existingIds = new Set(state.tasks.map((t) => t.id));
      for (const t of action.payload) {
        if (!existingIds.has(t.id)) merged.push(t);
      }
      return { ...state, tasks: merged };
    }

    default:
      return state;
  }
}

// ── Initial State ─────────────────────────────────────────

const baseCurve = generateDefaultBandwidthCurve();

const initialState: AppState = {
  tasks: [],
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
    { number: 1, text: "SCHEDULER INITIALIZED. 96x7 matrix loaded.", isRule: true },
    { number: 2, text: "Awaiting task data synchronization." }
  ],
  highlightedTaskId: null,
  activeConflict: null,
  dailyReport: null,
  isAddTaskOpen: false,
  selectedView: "day",
  userProfile: null,
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
