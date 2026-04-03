/* ═══════════════════════════════════════════════════════════
   THE AXIOM — GET /api/tasks  ·  POST /api/tasks
   REST endpoint for task CRUD (auth via JWT cookie).
   ═══════════════════════════════════════════════════════════ */

import type { NextRequest } from "next/server";
import { getTasks, saveTask, deleteTask } from "@/app/actions/tasks";
import type { Task } from "@/lib/types";

// GET /api/tasks — fetch all tasks for the authenticated user
export async function GET() {
  const result = await getTasks();
  if (result.error) {
    const status = result.error === "Not authenticated" ? 401 : 500;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ tasks: result.tasks }, { status: 200 });
}

// POST /api/tasks — upsert a task
export async function POST(request: NextRequest) {
  let task: unknown;
  try {
    task = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!task || typeof task !== "object" || !("id" in task)) {
    return Response.json({ error: "Task must have an id field" }, { status: 400 });
  }

  const result = await saveTask(task as Task);
  if (result.error) {
    const status = result.error === "Not authenticated" ? 401 : 500;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true }, { status: 200 });
}

// DELETE /api/tasks?id=<taskId>
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return Response.json({ error: "Missing id query parameter" }, { status: 400 });
  }

  const result = await deleteTask(id);
  if (result.error) {
    const status = result.error === "Not authenticated" ? 401 : 500;
    return Response.json({ error: result.error }, { status });
  }
  return Response.json({ ok: true }, { status: 200 });
}
