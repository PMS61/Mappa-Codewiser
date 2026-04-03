/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Task Server Actions
   DB persistence for tasks and schedules.
   Tables: tasks, schedules
   ═══════════════════════════════════════════════════════════ */

"use server";

import { sql } from "@vercel/postgres";
import { cookies } from "next/headers";
import { verify } from "jsonwebtoken";
import type { Task } from "@/lib/types";

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

// ── Schema Bootstrap ──────────────────────────────────────

export async function createTasksTables(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id VARCHAR(255) PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      difficulty INT NOT NULL,
      duration INT NOT NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'normal',
      state VARCHAR(50) NOT NULL DEFAULT 'unscheduled',
      subject VARCHAR(255),
      deadline TIMESTAMPTZ,
      energy_recovery FLOAT,
      cl FLOAT NOT NULL DEFAULT 0,
      cl_breakdown JSONB DEFAULT '{}'::jsonb,
      scheduled_slot JSONB,
        "order" INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      schedule_date DATE NOT NULL,
      scheduled_tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
      energy_used FLOAT DEFAULT 0,
      energy_remaining FLOAT DEFAULT 50,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, schedule_date)
    )
  `;
}

// ── Row → Task mapper ─────────────────────────────────────

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as Task["type"],
    difficulty: row.difficulty as number,
    duration: row.duration as number,
    priority: row.priority as Task["priority"],
    state: row.state as Task["state"],
    subject: (row.subject as string | null) ?? undefined,
    deadline: row.deadline
      ? new Date(row.deadline as string).toISOString()
      : undefined,
    energyRecovery: (row.energy_recovery as number | null) ?? undefined,
    cl: row.cl as number,
    clBreakdown: row.cl_breakdown as Task["clBreakdown"],
    order: (row.order as number | null) ?? 0,
    scheduledSlot: (row.scheduled_slot as Task["scheduledSlot"]) ?? undefined,
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

// ── CRUD Actions ──────────────────────────────────────────

export async function getTasks(): Promise<{ tasks?: Task[]; error?: string }> {
  const userId = await getUserId();
  if (!userId) {
    console.warn("getTasks: Unauthorized. Cookie might be missing.");
    return { error: "Unauthorized" };
  }

  try {
    let result;
    try {
      result = await sql`
        SELECT * FROM tasks WHERE user_id = ${userId} ORDER BY "order" ASC, created_at ASC;
      `;
    } catch (dbError: any) {
      if (dbError.message && dbError.message.includes('column "order" does not exist')) {
        await sql`ALTER TABLE tasks ADD COLUMN "order" INTEGER DEFAULT 0;`;
        result = await sql`
          SELECT * FROM tasks WHERE user_id = ${userId} ORDER BY "order" ASC, created_at ASC;
        `;
      } else if (dbError.message && dbError.message.includes('relation "tasks" does not exist')) {
        await createTasksTables();
        result = await sql`
          SELECT * FROM tasks WHERE user_id = ${userId} ORDER BY "order" ASC, created_at ASC
        `;
      } else {
        throw dbError;
      }
    }
    
    const tasks = result.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      difficulty: row.difficulty,
      duration: row.duration,
      priority: row.priority,
      state: row.state,
      subject: row.subject || undefined,
      deadline: row.deadline ? new Date(row.deadline).toISOString() : undefined,
      energyRecovery: row.energy_recovery || undefined,
      cl: row.cl,
      clBreakdown: row.cl_breakdown,
      order: row.order || 0,
      scheduledSlot: row.scheduled_slot || undefined,
      createdAt: new Date(row.created_at).toISOString(),
    })) as Task[];

    return { tasks };
  } catch (error) {
    console.error("Fetch tasks failed:", error);
    return { error: "Failed to fetch tasks." };
  }
}

export async function saveTask(task: Task): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await createTasksTables();
    await sql`
      INSERT INTO tasks (
        id, user_id, name, type, difficulty, duration, priority, state, subject,
        deadline, energy_recovery, cl, cl_breakdown, scheduled_slot, "order", created_at
      ) VALUES (
        ${task.id},
        ${userId},
        ${task.name},
        ${task.type},
        ${task.difficulty},
        ${task.duration},
        ${task.priority},
        ${task.state},
        ${task.subject ?? null},
        ${task.deadline ?? null},
        ${task.energyRecovery ?? null},
        ${task.cl},
        ${JSON.stringify(task.clBreakdown)}::jsonb,
        ${task.scheduledSlot ? JSON.stringify(task.scheduledSlot) : null}::jsonb,
        ${task.order ?? 0},
        ${task.createdAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        difficulty = EXCLUDED.difficulty,
        duration = EXCLUDED.duration,
        priority = EXCLUDED.priority,
        state = EXCLUDED.state,
        subject = EXCLUDED.subject,
        deadline = EXCLUDED.deadline,
        energy_recovery = EXCLUDED.energy_recovery,
        cl = EXCLUDED.cl,
        cl_breakdown = EXCLUDED.cl_breakdown,
        scheduled_slot = EXCLUDED.scheduled_slot,
        "order" = EXCLUDED."order"
      WHERE tasks.user_id = EXCLUDED.user_id
    `;

    return { success: true };
  } catch (err) {
    console.error("saveTask failed:", err);
    return { error: "Failed to save task" };
  }
}

/** Alias kept for backward compatibility — same as saveTask (upserts). */
export async function addTask(task: Task): Promise<{ success?: boolean; error?: string }> {
  const result = await saveTask(task);
  return result.error ? { error: result.error } : { success: true };
}

export async function updateTaskState(
  taskId: string,
  state: Task["state"],
  scheduledSlot?: Task["scheduledSlot"],
): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    if (scheduledSlot !== undefined) {
      const slotJson = JSON.stringify(scheduledSlot);
      await sql`
        UPDATE tasks
        SET state = ${state}, scheduled_slot = ${slotJson}::jsonb
        WHERE id = ${taskId} AND user_id = ${userId}
      `;
    } else {
      await sql`
        UPDATE tasks
        SET state = ${state}, scheduled_slot = NULL
        WHERE id = ${taskId} AND user_id = ${userId}
      `;
    }
    return {};
  } catch (err) {
    console.error("updateTaskState failed:", err);
    return { error: "Failed to update task" };
  }
}

/** Alias matching the name used in Dashboard's "Mark as Complete" handler. */
export async function updateTaskStateAndSlot(
  taskId: string,
  state: string,
  scheduledSlot: Task["scheduledSlot"],
): Promise<{ success?: boolean; error?: string }> {
  const result = await updateTaskState(taskId, state as Task["state"], scheduledSlot);
  return result.error ? { error: result.error } : { success: true };
}

export async function deleteTask(taskId: string): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) {
    console.warn("deleteTask: Unauthorized. Cookie might be missing.");
    return { error: "Unauthorized" };
  }

  try {
    const result = await sql`
      DELETE FROM tasks WHERE id = ${taskId} AND user_id = ${userId}
    `;
    if (result.rowCount === 0) {
      console.warn(`[DB] Delete task ${taskId} not found for user ${userId}`);
    } else {
      console.log(`[DB] Deleted task: ${taskId} for user ${userId}`);
    }
    return { success: true };
  } catch (err) {
    console.error("deleteTask failed:", err);
    return { error: "Failed to delete task" };
  }
}

export async function saveBulkTasks(tasks: Task[]): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await createTasksTables();
    for (const task of tasks) {
      await saveTask(task);
    }
    return {};
  } catch (err) {
    console.error("saveBulkTasks failed:", err);
    return { error: "Failed to save tasks" };
  }
}

/** Alias matching syncTasks used in master branch. */
export async function syncTasks(tasks: Task[]): Promise<{ success?: boolean; error?: string }> {
  const result = await saveBulkTasks(tasks);
  return result.error ? { error: result.error } : { success: true };
}

// ── Schedule Persistence ──────────────────────────────────

export async function saveSchedule(
  date: string,
  tasks: Task[],
  energyUsed: number,
  energyRemaining: number,
): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await createTasksTables();
    const tasksJson = JSON.stringify(tasks);
    await sql`
      INSERT INTO schedules (user_id, schedule_date, scheduled_tasks, energy_used, energy_remaining)
      VALUES (${userId}, ${date}, ${tasksJson}::jsonb, ${energyUsed}, ${energyRemaining})
      ON CONFLICT (user_id, schedule_date) DO UPDATE SET
        scheduled_tasks  = EXCLUDED.scheduled_tasks,
        energy_used      = EXCLUDED.energy_used,
        energy_remaining = EXCLUDED.energy_remaining
    `;
    return {};
  } catch (err) {
    console.error("saveSchedule failed:", err);
    return { error: "Failed to save schedule" };
  }
}

export async function getSchedule(
  date: string,
): Promise<{ tasks?: Task[]; energyUsed?: number; energyRemaining?: number; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await createTasksTables();
    const result = await sql`
      SELECT scheduled_tasks, energy_used, energy_remaining
      FROM schedules
      WHERE user_id = ${userId} AND schedule_date = ${date}
      LIMIT 1
    `;

    if (result.rows.length === 0) return { tasks: [], energyUsed: 0, energyRemaining: 50 };

    const row = result.rows[0] as Record<string, unknown>;
    return {
      tasks: row.scheduled_tasks as Task[],
      energyUsed: row.energy_used as number,
      energyRemaining: row.energy_remaining as number,
    };
  } catch (err) {
    console.error("getSchedule failed:", err);
    return { error: "Failed to fetch schedule" };
  }
}
