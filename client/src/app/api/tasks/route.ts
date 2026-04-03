/* Deprecated — use server actions in app/actions/tasks.ts instead. */
import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({ error: "Use getTasks server action." }, { status: 410 });
}
export async function POST() {
  return NextResponse.json({ error: "Use saveTask server action." }, { status: 410 });
}
export async function DELETE() {
  return NextResponse.json({ error: "Use deleteTask server action." }, { status: 410 });
}
