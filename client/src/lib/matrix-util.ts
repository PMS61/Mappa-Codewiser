import { getTasks } from "@/app/actions/tasks";
import { getUserProfile } from "@/app/actions/auth";

export interface MatrixSlot {
  cl: number;
  taskId?: string;
  isPeak: boolean;
  isLow: boolean;
  isSleep: boolean;
  isFixedCommitment: boolean;
  isHardExclusion: boolean;
  isAvailable: boolean;
  actualCompletion: boolean;
}

/**
 * Utility to fetch user data and generate a standardized 96 x 7 matrix
 * starting from Today (index 0) to Today + 6 (index 6).
 */
export async function getUserMatrix(): Promise<MatrixSlot[][] | { error: string }> {
  try {
    const tasksRes = await getTasks();
    const profileRes = await getUserProfile();

    if ("error" in tasksRes) return { error: tasksRes.error as string };
    if ("error" in profileRes) return { error: profileRes.error as string };

    const tasks = tasksRes.tasks || [];
    const profile = profileRes.user;

    // Initialize 7 days x 96 slots
    const matrix: MatrixSlot[][] = Array.from({ length: 7 }, () =>
      Array.from({ length: 96 }, () => ({
        cl: 0,
        isPeak: false,
        isLow: false,
        isSleep: false,
        isFixedCommitment: false,
        isHardExclusion: false,
        isAvailable: true,
        actualCompletion: false,
      }))
    );

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Apply Profile Overlays
    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      const currentDay = new Date(today);
      currentDay.setDate(today.getDate() + dayIdx);
      const actualDayOfWeek = currentDay.getDay();
      
      for (let slot = 0; slot < 96; slot++) {
        const slotMins = slot * 15;
        const currentSlot = matrix[dayIdx][slot];
        
        // 1. Peaks
        if (profile.peak_focus_windows?.some((w: any) => slotMins >= w.start_min && slotMins < w.end_min)) {
          currentSlot.isPeak = true;
        }
        
        // 2. Lows
        if (profile.low_energy_windows?.some((w: any) => slotMins >= w.start_min && slotMins < w.end_min)) {
          currentSlot.isLow = true;
        }
        
        // 3. Sleep
        const { wake_time, sleep_time } = profile;
        if (wake_time !== null && sleep_time !== null) {
          if (sleep_time > wake_time) {
            if (slotMins >= sleep_time || slotMins < wake_time) currentSlot.isSleep = true;
          } else {
            if (slotMins >= sleep_time && slotMins < wake_time) currentSlot.isSleep = true;
          }
        }
        
        // 4. Fixed Commitments
        if (profile.fixed_commitments?.some((c: any) => c.days.includes(actualDayOfWeek) && slotMins >= c.start_min && slotMins < c.end_min)) {
          currentSlot.isFixedCommitment = true;
        }

        // 5. Hard Exclusions
        if (profile.hard_exclusions?.some((c: any) => c.days.includes(actualDayOfWeek) && slotMins >= c.start_min && slotMins < c.end_min)) {
          currentSlot.isHardExclusion = true;
        }

        // 6. Availability Calculation (Logical Inverse of any blocking state)
        if (currentSlot.isSleep || currentSlot.isFixedCommitment || currentSlot.isHardExclusion) {
          currentSlot.isAvailable = false;
        }
      }
    }

    // 5. Map Scheduled Tasks to Matrix
    for (const task of tasks) {
      if (task.scheduledSlot && task.state !== "unscheduled") {
        const { day, startSlot, endSlot } = task.scheduledSlot;
        if (day >= 0 && day < 7) {
          for (let s = startSlot; s < endSlot; s++) {
            if (s >= 0 && s < 96) {
              matrix[day][s].cl = task.cl;
              matrix[day][s].taskId = task.id;
              matrix[day][s].actualCompletion = task.state === "completed" || task.state === "skipped";
            }
          }
        }
      }
    }

    return matrix;
  } catch (err) {
    console.error("Matrix extraction failed:", err);
    return { error: "Matrix generation failed: " + (err as Error).message };
  }
}
