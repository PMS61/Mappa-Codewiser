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
  DaySchedule,
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
  calculateBurnoutRisk,
} from "./engine";
import { generateDailyInsight } from "./templates";
import { runScheduler } from "./schedule";

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

  confirmedSlots: string[]; // keys like "dayIdx_slot"
  
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

  // Section schedule (output of runSchedulerAction)
  scheduledDays: DaySchedule[];

  // Section weights (from DB feedback)
  sectionWeights: { morning: number; afternoon: number; evening: number };

  // Scheduler reasoning log
  schedulerLog: string[];

  // Theme
  theme: "light" | "dark";
}

// ── Actions ───────────────────────────────────────────────

type Action =
  | { type: "ADD_TASK"; payload: Task }
  | { type: "UPDATE_TASK"; payload: Task }
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
  | { type: "SET_USER_PROFILE"; payload: any }
  | { type: "CLEAR_SCHEDULED" }
  | { type: "SET_SECTIONS"; payload: { days: DaySchedule[]; weights: { morning: number; afternoon: number; evening: number }; log: string[] } }
  | { type: "RECALIBRATE" }
  | { type: "TOGGLE_CONFIRM_SLOT"; payload: string }
  | { type: "SET_THEME"; payload: "light" | "dark" };

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
        burnoutRisk: calculateBurnoutRisk(newTasks),
        reasoningChain: [...state.reasoningChain, addReasoning],
        isAddTaskOpen: false,
      };
    }

    case "UPDATE_TASK": {
      const updatedTask = action.payload;
      const newTasks = state.tasks.map(t => t.id === updatedTask.id ? updatedTask : t);
      return {
        ...state,
        tasks: newTasks,
        burnoutRisk: calculateBurnoutRisk(newTasks),
      };
    }

    case "SET_TASKS": {
      const newTasks = action.payload;
      return {
        ...state,
        tasks: newTasks,
        burnoutRisk: calculateBurnoutRisk(newTasks),
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
      const output = runScheduler({
        tasks: state.tasks,
        startDate: state.currentDate.toISOString().split("T")[0],
        sectionWeights: state.sectionWeights,
        userProfile: state.userProfile,
      });

      // Update task states
      const scheduledIds = new Set<string>();
      for (const day of output.days) {
        for (const section of day.sections) {
          for (const item of section.tasks) {
            scheduledIds.add(item.taskId);
          }
        }
      }

      const updatedTasks = state.tasks.map((t) => {
        if (scheduledIds.has(t.id)) {
          return { ...t, state: "scheduled" as TaskState, scheduledSlot: undefined };
        } else if (output.unscheduled.includes(t.id)) {
          return { ...t, state: "unscheduled" as TaskState, scheduledSlot: undefined };
        }
        return t;
      });

      const newSteps = output.reasoningLog.map((text, i) => ({
        number: state.reasoningChain.length + i + 1,
        text,
        isRule: text.startsWith("RULE") || text.includes("Budget") || text.includes("Anti-starvation"),
        isAction: text.includes("placed") || text.includes("Schedule"),
      }));

      return {
        ...state,
        tasks: updatedTasks,
        scheduledDays: output.days,
        schedulerLog: output.reasoningLog,
        reasoningChain: [
          ...state.reasoningChain,
          ...newSteps
        ],
        burnoutRisk: calculateBurnoutRisk(updatedTasks, output.days),
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

      const updatedTasks = state.tasks.map(t => t.id === action.payload.taskId ? {
        ...t,
        state: "scheduled" as TaskState,
        scheduledSlot: {
          startSlot: action.payload.startSlot,
          endSlot: action.payload.startSlot + slotsNeeded,
          day: action.payload.day,
          fitnessScore: 5.0, // Arbitrary for manual override
          reasoningSteps: [newReasoning]
        }
      } : t);

      // Also update scheduledDays so it shows up in dashboards
      const newScheduledDays = [...state.scheduledDays];
      let dayData = newScheduledDays.find(d => d.dayOffset === action.payload.day);
      
      const sectionName = action.payload.startSlot < 48 ? "morning" : action.payload.startSlot < 72 ? "afternoon" : "evening";

      if (!dayData) {
        // Create a skeleton day if it doesn't exist
        dayData = {
          dayOffset: action.payload.day,
          date: state.currentDate.toISOString().split("T")[0],
          sections: [
            { section: "morning", tasks: [], axiomUsed: 0, axiomBudget: 20, axiomRemaining: 20 },
            { section: "afternoon", tasks: [], axiomUsed: 0, axiomBudget: 17.5, axiomRemaining: 17.5 },
            { section: "evening", tasks: [], axiomUsed: 0, axiomBudget: 12.5, axiomRemaining: 12.5 },
          ],
          totalAxiomsUsed: 0,
          totalAxiomsRemaining: 50,
          diversityEntropy: 0,
          loadAcceptable: true,
        };
        newScheduledDays.push(dayData);
      }

      const section = dayData.sections.find(s => s.section === sectionName);
      if (section) {
        const axiomResult = computeCL(task.difficulty, task.duration, 0, task.type, task.priority);
        const axiomCost = axiomResult.total;
        
        section.tasks.push({
          taskId: task.id,
          taskName: task.name,
          duration: task.duration,
          axiomCost: axiomCost,
          axiomGain: 0,
          isRecreational: task.type === "recreational",
          startSlot: action.payload.startSlot
        });
        
        section.axiomUsed = +(section.axiomUsed + axiomCost).toFixed(2);
        section.axiomRemaining = +(section.axiomRemaining - axiomCost).toFixed(2);
        dayData.totalAxiomsUsed = +(dayData.totalAxiomsUsed + axiomCost).toFixed(2);
        dayData.totalAxiomsRemaining = +(dayData.totalAxiomsRemaining - axiomCost).toFixed(2);
      }

      return {
        ...state,
        tasks: updatedTasks,
        scheduledDays: newScheduledDays,
        reasoningChain: [...state.reasoningChain, newReasoning],
        burnoutRisk: calculateBurnoutRisk(updatedTasks, newScheduledDays),
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

    case "CLEAR_SCHEDULED": {
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.state === "scheduled" ? { ...t, state: "unscheduled" as TaskState } : t,
        ),
        scheduledDays: [],
        schedulerLog: [],
      };
    }

    case "SET_SECTIONS": {
      const { days, weights, log } = action.payload;
      // Mark tasks that appear in the schedule as scheduled
      const scheduledIds = new Set<string>();
      for (const day of days) {
        for (const section of day.sections) {
          for (const item of section.tasks) {
            scheduledIds.add(item.taskId);
          }
        }
      }
      return {
        ...state,
        scheduledDays: days,
        sectionWeights: weights,
        schedulerLog: log,
        tasks: state.tasks.map((t) =>
          scheduledIds.has(t.id) && t.state === "unscheduled"
            ? { ...t, state: "scheduled" as TaskState }
            : t,
        ),
        reasoningChain: [
          ...state.reasoningChain,
          {
            number: state.reasoningChain.length + 1,
            text: `SCHEDULER RUN: ${days.length} days planned. ${log[log.length - 1] ?? ""}`,
            isRule: true,
          },
        ],
      };
    }

    case "RECALIBRATE": {
      // Find tasks with CL > 8 and ensure they are followed by recovery
      const highCLTasks = state.tasks.filter(t => Math.abs(t.cl) > 8 && t.state === "scheduled");
      const newRecoveryTasks: Task[] = [];
      
      highCLTasks.forEach(task => {
        // Create a recovery block for this task
        const recoveryTask: Task = {
          id: `recovery-${task.id}-${Date.now()}`,
          name: `Focus Reset (Ref: ${task.name})`,
          type: "recreational",
          duration: 30,
          priority: "normal",
          difficulty: 1,
          subject: task.subject,
          cl: -5, // Restorative
          clBreakdown: {
            baseDifficulty: 1,
            durationWeight: 0.5,
            deadlineUrgency: 1,
            typeMultiplier: -1,
            priorityWeight: 1,
            total: -5,
          },
          state: "unscheduled",
          order: (task.order ?? 0) + 0.5,
          createdAt: new Date().toISOString(),
        };
        newRecoveryTasks.push(recoveryTask);
      });

      if (newRecoveryTasks.length === 0) return state;

      const updatedTasks = [...state.tasks, ...newRecoveryTasks];
      const output = runScheduler({
        tasks: updatedTasks,
        startDate: state.currentDate.toISOString().split("T")[0],
        sectionWeights: state.sectionWeights,
      });

      // Update task states
      const scheduledIds = new Set<string>();
      for (const day of output.days) {
        for (const section of day.sections) {
          for (const item of section.tasks) {
            scheduledIds.add(item.taskId);
          }
        }
      }

      const tasksWithNewStatus = updatedTasks.map((t) => {
        if (scheduledIds.has(t.id)) {
          return { ...t, state: "scheduled" as TaskState, scheduledSlot: undefined };
        } else if (output.unscheduled.includes(t.id)) {
          return { ...t, state: "unscheduled" as TaskState, scheduledSlot: undefined };
        }
        return t;
      });

      const newSteps = output.reasoningLog.map((text, i) => ({
        number: state.reasoningChain.length + i + 1,
        text,
        isRule: text.startsWith("RULE") || text.includes("Budget") || text.includes("Anti-starvation"),
        isAction: text.includes("placed") || text.includes("Schedule"),
      }));

      return {
        ...state,
        tasks: tasksWithNewStatus,
        scheduledDays: output.days,
        schedulerLog: output.reasoningLog,
        reasoningChain: [
          ...state.reasoningChain,
          ...newSteps
        ],
        burnoutRisk: calculateBurnoutRisk(tasksWithNewStatus, output.days),
      };
    }

    case "TOGGLE_CONFIRM_SLOT": {
      const key = action.payload;
      const isConfirmed = state.confirmedSlots.includes(key);
      const newSlots = isConfirmed 
        ? state.confirmedSlots.filter(s => s !== key)
        : [...state.confirmedSlots, key];
      
      return {
        ...state,
        confirmedSlots: newSlots
      };
    }

    case "SET_THEME":
      return { ...state, theme: action.payload };

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
  confirmedSlots: [],
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
  scheduledDays: [],
  sectionWeights: { morning: 0.40, afternoon: 0.35, evening: 0.25 },
  schedulerLog: [],
  theme: "light",
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
