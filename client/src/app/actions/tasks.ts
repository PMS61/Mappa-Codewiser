"use server";

import { cookies } from "next/headers";
import { sql } from "@vercel/postgres";
import { verify } from "jsonwebtoken";
import { revalidatePath } from "next/cache";
import type { Task } from "@/lib/types";

// Helper to get authenticated user ID
async function getUserId(): Promise<number | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  if (!token) return null;
  try {
    const decoded = verify(token, process.env.JWT_SECRET || "default_secret") as { userId: number };
    return decoded.userId;
  } catch (err) {
    return null;
  }
}

export async function createTasksTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id VARCHAR(255) PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        difficulty INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        priority VARCHAR(20) NOT NULL,
        state VARCHAR(50) NOT NULL,
        subject VARCHAR(255),
        deadline TIMESTAMPTZ,
        energy_recovery FLOAT,
        cl FLOAT NOT NULL,
        cl_breakdown JSONB NOT NULL,
        scheduled_slot JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `;
    return { success: true };
  } catch (error) {
    console.error("Create tasks table failed:", error);
    return { error: "Failed to create tasks table." };
  }
}

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
        SELECT * FROM tasks WHERE user_id = ${userId} ORDER BY created_at ASC;
      `;
    } catch (dbError: any) {
      if (dbError.message && dbError.message.includes('relation "tasks" does not exist')) {
        await createTasksTable();
        result = await sql`
          SELECT * FROM tasks WHERE user_id = ${userId} ORDER BY created_at ASC;
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
      scheduledSlot: row.scheduled_slot || undefined,
      createdAt: new Date(row.created_at).toISOString(),
    })) as Task[];

    return { tasks };
  } catch (error) {
    console.error("Fetch tasks failed:", error);
    return { error: "Failed to fetch tasks." };
  }
}

export async function addTask(task: Task): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) {
    console.warn("addTask: Unauthorized. Cookie might be missing.");
    return { error: "Unauthorized" };
  }

  try {
    try {
      await sql`
        INSERT INTO tasks (
          id, user_id, name, type, difficulty, duration, priority, state, subject, 
          deadline, energy_recovery, cl, cl_breakdown, scheduled_slot, created_at
        ) VALUES (
          ${task.id}, ${userId}, ${task.name}, ${task.type}, ${task.difficulty}, ${task.duration}, 
          ${task.priority}, ${task.state}, ${task.subject || null}, 
          ${task.deadline || null}, ${task.energyRecovery || null}, ${task.cl}, 
          ${JSON.stringify(task.clBreakdown)}, 
          ${task.scheduledSlot ? JSON.stringify(task.scheduledSlot) : null}, 
          ${task.createdAt}
        )
        ON CONFLICT (id) DO NOTHING;
      `;
    } catch (dbError: any) {
      if (dbError.message && dbError.message.includes('relation "tasks" does not exist')) {
        await createTasksTable();
        await sql`
          INSERT INTO tasks (
            id, user_id, name, type, difficulty, duration, priority, state, subject, 
            deadline, energy_recovery, cl, cl_breakdown, scheduled_slot, created_at
          ) VALUES (
            ${task.id}, ${userId}, ${task.name}, ${task.type}, ${task.difficulty}, ${task.duration}, 
            ${task.priority}, ${task.state}, ${task.subject || null}, 
            ${task.deadline || null}, ${task.energyRecovery || null}, ${task.cl}, 
            ${JSON.stringify(task.clBreakdown)}, 
            ${task.scheduledSlot ? JSON.stringify(task.scheduledSlot) : null}, 
            ${task.createdAt}
          )
          ON CONFLICT (id) DO NOTHING;
        `;
      } else {
        throw dbError;
      }
    }
    console.log(`[DB] Added task: ${task.id} for user ${userId}`);
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/tasks");
    return { success: true };
  } catch (error) {
    console.error("Add task failed:", error);
    return { error: "Failed to add task." };
  }
}

export async function updateTaskStateAndSlot(
  taskId: string, 
  state: string, 
  scheduledSlot: any
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) {
    console.warn("updateTaskStateAndSlot: Unauthorized. Cookie might be missing.");
    return { error: "Unauthorized" };
  }

  try {
    await sql`
      UPDATE tasks 
      SET state = ${state}, scheduled_slot = ${scheduledSlot ? JSON.stringify(scheduledSlot) : null}
      WHERE id = ${taskId} AND user_id = ${userId};
    `;
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/tasks");
    return { success: true };
  } catch (error) {
    console.error("Update task failed:", error);
    return { error: "Failed to update task." };
  }
}

export async function deleteTask(taskId: string): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) {
    console.warn("deleteTask: Unauthorized. Cookie might be missing.");
    return { error: "Unauthorized" };
  }

  try {
    const result = await sql`
      DELETE FROM tasks WHERE id = ${taskId} AND user_id = ${userId};
    `;
    
    if (result.rowCount === 0) {
      console.warn(`[DB] Delete task ${taskId} target not found for user ${userId}`);
    } else {
      console.log(`[DB] Deleted task: ${taskId} for user ${userId} (rows: ${result.rowCount})`);
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/tasks");
    return { success: true };
  } catch (error) {
    console.error("Delete task failed:", error);
    return { error: "Failed to delete task." };
  }
}

export async function syncTasks(tasks: Task[]): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    for (const task of tasks) {
      await sql`
        UPDATE tasks 
        SET state = ${task.state}, 
            scheduled_slot = ${task.scheduledSlot ? JSON.stringify(task.scheduledSlot) : null}
        WHERE id = ${task.id} AND user_id = ${userId};
      `;
    }
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/tasks");
    return { success: true };
  } catch (error) {
    console.error("Sync tasks failed:", error);
    return { error: "Failed to sync tasks." };
  }
}
