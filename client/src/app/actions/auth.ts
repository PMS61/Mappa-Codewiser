"use server";

import bcrypt from "bcrypt";
import { sign } from "jsonwebtoken";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "@vercel/postgres";

type RegisterUserInput = {
  name: string;
  email: string;
  password: string;
  timezone: string;
  role: number;
  wake_sleep: {
    wake: number;
    sleep: number;
  };
  session_config: {
    session_style: number;
    switch_buffer: number;
  };
  deadline_style: number;
};

type LoginUserInput = {
  email: string;
  password: string;
};

type ActionResult = {
  error?: string;
};

async function authenticateAndSetSession(
  credentials: LoginUserInput,
): Promise<ActionResult> {
  const { email, password } = credentials;

  try {
    const result = await sql`
      SELECT id, password FROM users WHERE email = ${email} LIMIT 1;
    `;

    if (result.rows.length === 0) {
      return { error: "User not found." };
    }

    const user = result.rows[0] as { id: number; password: string };
    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return { error: "Invalid password." };
    }

    if (!process.env.JWT_SECRET) {
      return { error: "Server is missing JWT_SECRET." };
    }

    const token = sign({ userId: user.id }, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    const cookieStore = await cookies();
    cookieStore.set("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60,
    });

    return {};
  } catch (error) {
    console.error("Login failed:", error);
    return { error: "Login failed. Please try again." };
  }
}

export async function createUsersTable(): Promise<ActionResult> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        timezone VARCHAR(255),
        role INT,
        wake_time INT,
        sleep_time INT,
        session_style INT,
        switch_buffer INT,
        deadline_style INT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `;
    return {};
  } catch (error) {
    console.error("Create users table failed:", error);
    return { error: "Failed to create users table." };
  }
}

export async function registerUser(userData: RegisterUserInput): Promise<ActionResult> {
  const {
    name,
    email,
    password,
    timezone,
    role,
    wake_sleep,
    session_config,
    deadline_style,
  } = userData;

  try {
    const existing = await sql`
      SELECT id FROM users WHERE email = ${email} LIMIT 1;
    `;

    if (existing.rows.length > 0) {
      return { error: "Email is already registered." };
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await sql`
      INSERT INTO users (
        name,
        email,
        password,
        timezone,
        role,
        wake_time,
        sleep_time,
        session_style,
        switch_buffer,
        deadline_style
      )
      VALUES (
        ${name},
        ${email},
        ${hashedPassword},
        ${timezone},
        ${role},
        ${wake_sleep.wake},
        ${wake_sleep.sleep},
        ${session_config.session_style},
        ${session_config.switch_buffer},
        ${deadline_style}
      );
    `;

  } catch (error) {
    console.error("Registration failed:", error);
    return { error: "Registration failed. Please try again." };
  }

  return authenticateAndSetSession({ email, password });
}

export async function loginUser(credentials: LoginUserInput): Promise<ActionResult | void> {
  const authResult = await authenticateAndSetSession(credentials);
  if (authResult.error) {
    return authResult;
  }

  redirect("/dashboard");
}
