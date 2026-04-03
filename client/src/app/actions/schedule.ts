/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Schedule Server Action
   Orchestrates the full scheduling pipeline server-side.
   Auth → fetch weights → run scheduler → persist → return output
   ═══════════════════════════════════════════════════════════ */

"use server";

import { cookies } from "next/headers";
import { verify } from "jsonwebtoken";
import type { Task, DaySchedule, SchedulerOutput, SectionName } from "@/lib/types";
import { runScheduler } from "@/lib/scheduler";
import { computeUpdatedWeights } from "@/lib/feedback";
import {
  getSectionWeights,
  updateSectionWeightsDB,
  saveChunks,
  getRecentSectionPerformance,
  createTasksTables,
} from "./tasks";

// ── Auth Helper ───────────────────────────────────────────

async function getUserId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token || !process.env.JWT_SECRET) return null;
  try {
    const decoded = verify(token, process.env.JWT_SECRET) as { userId: number };
    return decoded.userId;
  } catch {
    return null;
  }
}

// ── Run Scheduler Action ──────────────────────────────────

export interface RunSchedulerResult {
  days?: DaySchedule[];
  unscheduled?: string[];
  reasoningLog?: string[];
  updatedWeights?: { morning: number; afternoon: number; evening: number };
  error?: string;
}

/**
 * Server action: runs the full deterministic scheduling pipeline.
 * - Fetches section weights from DB (falls back to defaults)
 * - Calls runScheduler() with all tasks
 * - Persists generated chunks to DB
 * - Optionally applies feedback to update section weights
 * - Returns DaySchedule[] for the client to render
 */
export async function runSchedulerAction(
  tasks: Task[],
  startDate?: string,
): Promise<RunSchedulerResult> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await createTasksTables();

    // ── Fetch section weights from DB ─────────────────────
    const weightsResult = await getSectionWeights();
    const sectionWeights = weightsResult.weights ?? {
      morning: 0.40,
      afternoon: 0.35,
      evening: 0.25,
    };

    // ── Run the scheduling pipeline ───────────────────────
    const output: SchedulerOutput = runScheduler({
      tasks,
      startDate,
      sectionWeights,
    });

    // ── Persist task chunks to DB ─────────────────────────
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
            allChunks.push({
              id: item.chunkId,
              parentTaskId: item.taskId,
              chunkIndex: parseInt(item.chunkId.split("_chunk_")[1] ?? "0"),
              totalChunks: day.sections.flatMap((s) =>
                s.tasks.filter((t) => t.taskId === item.taskId && t.chunkId),
              ).length || 1,
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

    if (allChunks.length > 0) {
      await saveChunks(allChunks);
    }

    // ── Apply feedback to update weights ──────────────────
    const perfResult = await getRecentSectionPerformance(14);
    let updatedWeights = sectionWeights;

    if (perfResult.records && perfResult.records.length > 0) {
      const perfRecords = perfResult.records.map((r) => ({
        sectionName: r.sectionName as SectionName,
        scheduledAxioms: 0, // not tracked in this light record
        actualAxioms: 0,
        efficiencyRatio: r.efficiencyRatio,
        recordedAt: new Date().toISOString(),
      }));

      updatedWeights = computeUpdatedWeights(
        sectionWeights as Record<SectionName, number>,
        perfRecords,
      );

      // Persist updated weights
      await updateSectionWeightsDB(updatedWeights);
    }

    return {
      days: output.days,
      unscheduled: output.unscheduled,
      reasoningLog: output.reasoningLog,
      updatedWeights,
    };
  } catch (err) {
    console.error("runSchedulerAction failed:", err);
    return { error: "Scheduling failed. Please try again." };
  }
}

// ── Mark Section Complete (feedback recording) ─────────────

export async function markSectionComplete(
  sectionName: SectionName,
  scheduledAxioms: number,
  actualAxioms: number,
): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  // Import inline to avoid circular dep
  const { recordSectionPerformance } = await import("./tasks");
  const efficiencyRatio = scheduledAxioms > 0
    ? actualAxioms / scheduledAxioms
    : 1;

  return recordSectionPerformance(
    sectionName,
    scheduledAxioms,
    actualAxioms,
    efficiencyRatio,
  );
}
