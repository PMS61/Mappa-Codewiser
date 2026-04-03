/* ═══════════════════════════════════════════════════════════
   THE AXIOM — POST /api/schedule
   Accepts a task list and returns a deterministic multi-day
   schedule produced by the energy-model greedy scheduler.
   ═══════════════════════════════════════════════════════════ */

import type { NextRequest } from "next/server";
import { runScheduler } from "@/lib/scheduler";
import type { SchedulerTask } from "@/lib/scheduler";

// ── Input validation ──────────────────────────────────────

function validateTask(task: unknown): task is SchedulerTask {
  if (!task || typeof task !== "object") return false;
  const t = task as Record<string, unknown>;
  return (
    typeof t.id === "string" &&
    t.id.length > 0 &&
    typeof t.title === "string" &&
    t.title.length > 0 &&
    typeof t.difficulty === "number" &&
    t.difficulty >= 1 &&
    t.difficulty <= 10 &&
    typeof t.priority === "number" &&
    t.priority >= 1 &&
    t.priority <= 10 &&
    typeof t.duration === "number" &&
    t.duration > 0 &&
    (t.type === "work" || t.type === "energy_gain") &&
    (t.date === undefined || typeof t.date === "string")
  );
}

// ── Handler ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Body must be a JSON object" }, { status: 400 });
  }

  const { tasks, startDate } = body as Record<string, unknown>;

  if (!Array.isArray(tasks)) {
    return Response.json({ error: "tasks must be an array" }, { status: 400 });
  }

  if (tasks.length === 0) {
    return Response.json(
      { schedule: {}, meta: { totalDays: 0, totalTasksScheduled: 0, energyByDay: {} } },
      { status: 200 },
    );
  }

  // Validate every task
  const invalidIdx = tasks.findIndex((t) => !validateTask(t));
  if (invalidIdx !== -1) {
    return Response.json(
      {
        error: `Invalid task at index ${invalidIdx}. Required: id (string), title (string), difficulty (1-10), priority (1-10), duration (number > 0), type ("work" | "energy_gain")`,
      },
      { status: 400 },
    );
  }

  if (startDate !== undefined && typeof startDate !== "string") {
    return Response.json({ error: "startDate must be a string (YYYY-MM-DD)" }, { status: 400 });
  }

  try {
    const result = runScheduler(tasks as SchedulerTask[], startDate as string | undefined);
    return Response.json(result, { status: 200 });
  } catch (err) {
    console.error("[/api/schedule] Scheduler error:", err);
    return Response.json({ error: "Scheduling failed" }, { status: 500 });
  }
}
