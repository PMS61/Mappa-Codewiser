/* Deprecated — use server action runSchedulerAction() instead. */
import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Use runSchedulerAction server action." }, { status: 410 });
}
