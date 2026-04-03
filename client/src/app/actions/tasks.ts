/* ═══════════════════════════════════════════════════════════
   THE AXIOM — Task Server Actions
   Cleaned & Standardized. DB persistence for tasks and schedules.
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

  await sql`
    CREATE TABLE IF NOT EXISTS task_chunks (
      id VARCHAR(255) PRIMARY KEY,
      parent_task_id VARCHAR(255) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      chunk_index INT NOT NULL,
      total_chunks INT NOT NULL,
      duration INT NOT NULL,
      scheduled_day INT NOT NULL DEFAULT 0,
      section VARCHAR(20) NOT NULL,
      axiom_cost FLOAT NOT NULL,
      state VARCHAR(50) NOT NULL DEFAULT 'unscheduled',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS section_performance (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      section_name VARCHAR(20) NOT NULL,
      scheduled_axioms FLOAT NOT NULL,
      actual_axioms FLOAT NOT NULL,
      efficiency_ratio FLOAT NOT NULL,
      recorded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS section_weights (
      user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      morning FLOAT NOT NULL DEFAULT 0.40,
      afternoon FLOAT NOT NULL DEFAULT 0.35,
      evening FLOAT NOT NULL DEFAULT 0.25,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

// ── Section Weight Actions ─────────────────────────────────

export async function getSectionWeights(): Promise<{
  weights?: { morning: number; afternoon: number; evening: number };
  error?: string;
}> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await createTasksTables();
    const result = await sql`
      SELECT morning, afternoon, evening FROM section_weights WHERE user_id = ${userId} LIMIT 1
    `;
    if (result.rows.length === 0) {
      return { weights: { morning: 0.40, afternoon: 0.35, evening: 0.25 } };
    }
    const row = result.rows[0] as any;
    return { weights: { morning: row.morning, afternoon: row.afternoon, evening: row.evening } };
  } catch (err) {
    console.error("getSectionWeights failed:", err);
    return { weights: { morning: 0.40, afternoon: 0.35, evening: 0.25 } };
  }
}

export async function updateSectionWeightsDB(weights: {
  morning: number;
  afternoon: number;
  evening: number;
}): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await sql`
      INSERT INTO section_weights (user_id, morning, afternoon, evening, updated_at)
      VALUES (${userId}, ${weights.morning}, ${weights.afternoon}, ${weights.evening}, NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        morning    = EXCLUDED.morning,
        afternoon  = EXCLUDED.afternoon,
        evening    = EXCLUDED.evening,
        updated_at = NOW()
    `;
    return {};
  } catch (err) {
    console.error("updateSectionWeightsDB failed:", err);
    return { error: "Failed to update section weights" };
  }
}

export async function recordSectionPerformance(
  sectionName: string,
  scheduledAxioms: number,
  actualAxioms: number,
  efficiencyRatio: number,
): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await sql`
      INSERT INTO section_performance (user_id, section_name, scheduled_axioms, actual_axioms, efficiency_ratio)
      VALUES (${userId}, ${sectionName}, ${scheduledAxioms}, ${actualAxioms}, ${efficiencyRatio})
    `;
    return {};
  } catch (err) {
    console.error("recordSectionPerformance failed:", err);
    return { error: "Failed to record performance" };
  }
}

export async function getRecentSectionPerformance(limit = 14): Promise<{
  records?: Array<{ sectionName: string; efficiencyRatio: number }>;
  error?: string;
}> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    const result = await sql`
      SELECT section_name, efficiency_ratio
      FROM section_performance
      WHERE user_id = ${userId}
      ORDER BY recorded_at DESC
      LIMIT ${limit}
    `;
    return {
      records: result.rows.map((r: any) => ({
        sectionName: r.section_name,
        efficiencyRatio: r.efficiency_ratio,
      })),
    };
  } catch (err) {
    return { records: [] };
  }
}

// ── Chunk Actions ─────────────────────────────────────────

export async function saveChunks(
  chunks: Array<{
    id: string;
    parentTaskId: string;
    chunkIndex: number;
    totalChunks: number;
    duration: number;
    scheduledDay: number;
    section: string;
    axiomCost: number;
    state: string;
  }>,
): Promise<{ error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await createTasksTables();
    for (const chunk of chunks) {
      await sql`
        INSERT INTO task_chunks (
          id, parent_task_id, user_id, chunk_index, total_chunks,
          duration, scheduled_day, section, axiom_cost, state
        ) VALUES (
          ${chunk.id}, ${chunk.parentTaskId}, ${userId}, ${chunk.chunkIndex},
          ${chunk.totalChunks}, ${chunk.duration}, ${chunk.scheduledDay},
          ${chunk.section}, ${chunk.axiomCost}, ${chunk.state}
        )
        ON CONFLICT (id) DO UPDATE SET
          state         = EXCLUDED.state,
          scheduled_day = EXCLUDED.scheduled_day,
          section       = EXCLUDED.section
      `;
    }
    return {};
  } catch (err) {
    console.error("saveChunks failed:", err);
    return { error: "Failed to save chunks" };
  }

  await sql`
    CREATE TABLE IF NOT EXISTS sources (
      subject VARCHAR(255),
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
      embeddings JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (subject, user_id)
    )
  `;
}

// ── Row → Task mapper ─────────────────────────────────────

function rowToTask(row: any): Task {
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

// ── Task Actions ──────────────────────────────────────────

export async function getTasks(): Promise<{ tasks?: Task[]; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    let result;
    try {
      result = await sql`
        SELECT * FROM tasks WHERE user_id = ${userId} ORDER BY "order" ASC, created_at ASC;
      `;
    } catch (dbError: any) {
      if (dbError.message?.includes('column "order" does not exist')) {
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

    return { tasks: result.rows.map(rowToTask) };
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
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await sql`
      INSERT INTO tasks (
        id, user_id, name, type, difficulty, duration, priority, state, subject, 
        deadline, energy_recovery, cl, cl_breakdown, scheduled_slot, "order"
      ) VALUES (
        ${task.id}, ${userId}, ${task.name}, ${task.type}, ${task.difficulty}, ${task.duration}, 
        ${task.priority}, ${task.state}, ${task.subject || null}, 
        ${task.deadline || null}, ${task.energyRecovery || null}, ${task.cl}, 
        ${JSON.stringify(task.clBreakdown)}, 
        ${task.scheduledSlot ? JSON.stringify(task.scheduledSlot) : null}, 
        ${task.order || 0}
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
        "order" = EXCLUDED."order";
    `;

    return { success: true };
  } catch (error) {
    console.error("addTask failed:", error);
    return { error: "Failed to save task" };
  }
}

export async function deleteTask(taskId: string): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await sql`DELETE FROM tasks WHERE id = ${taskId} AND user_id = ${userId}`;
    return { success: true };
  } catch (err) {
    console.error("deleteTask failed:", err);
    return { error: "Failed to delete task" };
  }
}

export async function updateTaskState(
  taskId: string,
  state: Task["state"],
  scheduledSlot?: Task["scheduledSlot"],
): Promise<{ success?: boolean; error?: string }> {
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
    return { success: true };
  } catch (err) {
    console.error("updateTaskState failed:", err);
    return { error: "Failed to update task" };
  }
}

/** Combined alias for dashboard compat */
export async function updateTaskStateAndSlot(
  taskId: string,
  state: string,
  scheduledSlot: Task["scheduledSlot"],
): Promise<{ success?: boolean; error?: string }> {
  return updateTaskState(taskId, state as Task["state"], scheduledSlot);
}

export async function saveBulkTasks(tasks: Task[]): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    for (const task of tasks) {
      await addTask(task);
    }
    return { success: true };
  } catch (err: any) {
    console.error("saveBulkTasks failed:", err);
    return { error: "Failed to save tasks" };
  }
}

export async function syncTasks(tasks: Task[]): Promise<{ success?: boolean; error?: string }> {
  return saveBulkTasks(tasks);
}

// ── Schedule Actions ──────────────────────────────────────

export async function saveSchedule(
  date: string,
  tasks: Task[],
  energyUsed: number,
  energyRemaining: number,
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    const tasksJson = JSON.stringify(tasks);
    await sql`
      INSERT INTO schedules (user_id, schedule_date, scheduled_tasks, energy_used, energy_remaining)
      VALUES (${userId}, ${date}, ${tasksJson}::jsonb, ${energyUsed}, ${energyRemaining})
      ON CONFLICT (user_id, schedule_date) DO UPDATE SET
        scheduled_tasks  = EXCLUDED.scheduled_tasks,
        energy_used      = EXCLUDED.energy_used,
        energy_remaining = EXCLUDED.energy_remaining
    `;
    return { success: true };
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
    const result = await sql`
      SELECT scheduled_tasks, energy_used, energy_remaining
      FROM schedules
      WHERE user_id = ${userId} AND schedule_date = ${date}
      LIMIT 1
    `;

    if (result.rows.length === 0) return { tasks: [], energyUsed: 0, energyRemaining: 50 };

    const row = result.rows[0];
    return {
      tasks: row.scheduled_tasks as Task[],
      energyUsed: row.energy_used as number,
      energyRemaining: row.energy_remaining as number,
    };
  } catch (err: any) {
    if (err.message && err.message.includes('relation "schedules" does not exist')) {
      await createTasksTables();
      return { tasks: [], energyUsed: 0, energyRemaining: 50 };
    }
    console.error("getSchedule failed:", err);
    return { error: "Failed to fetch schedule" };
  }
}

// ── Source Persistence ────────────────────────────────────

export async function saveSource(
  subject: string,
  content: string,
  chunks: string[],
  embeddings: number[][],
): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await createTasksTables();
    await sql`
      INSERT INTO sources (subject, user_id, content, chunks, embeddings)
      VALUES (${subject}, ${userId}, ${content}, ${JSON.stringify(chunks)}, ${JSON.stringify(embeddings)})
      ON CONFLICT (subject, user_id) DO UPDATE SET
        content = EXCLUDED.content,
        chunks = EXCLUDED.chunks,
        embeddings = EXCLUDED.embeddings;
    `;
    return { success: true };
  } catch (err) {
    console.error("saveSource failed:", err);
    return { error: "Failed to save source data" };
  }
}

export async function getSource(
  subject: string,
): Promise<{ content?: string; chunks?: string[]; embeddings?: number[][]; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    const result = await sql`
      SELECT content, chunks, embeddings FROM sources
      WHERE subject = ${subject} AND user_id = ${userId}
      LIMIT 1;
    `;

    if (result.rows.length === 0) return {};

    const row = result.rows[0];
    return {
      content: row.content as string,
      chunks: row.chunks as string[],
      embeddings: row.embeddings as number[][],
    };
  } catch (err: any) {
    if (err.message && err.message.includes('relation "sources" does not exist')) {
      await createTasksTables();
      return {};
    }
    console.error("getSource failed:", err);
    return { error: "Failed to fetch source data" };
  }
}

export async function clearSources(): Promise<{ success?: boolean; error?: string }> {
  try {
    await sql`DELETE FROM sources`;
    return { success: true };
  } catch (err) {
    console.error("clearSources failed:", err);
    return { error: "Failed to clear sources" };
  }
}

export async function clearUnscheduledTasks(): Promise<{ success?: boolean; error?: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Unauthorized" };

  try {
    await sql`DELETE FROM tasks WHERE user_id = ${userId} AND state = 'unscheduled'`;
    return { success: true };
  } catch (err) {
    console.error("clearUnscheduledTasks failed:", err);
    return { error: "Failed to clear unscheduled tasks" };
  }
}
