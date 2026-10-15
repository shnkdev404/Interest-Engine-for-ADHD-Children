import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, usingLocalDb } from "@/db";
import { hasAnthropicCredentials, PLANNER_MODEL } from "@/lib/llm/client";
import { getMemory } from "@/lib/memory";
import { getQloo } from "@/lib/qloo/source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Which services this deploy is using. Modes only, never secrets.
export async function GET() {
  const checks: Record<string, unknown> = {};
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    checks.db = usingLocalDb() ? "pglite (local)" : "postgres";
  } catch (err) {
    checks.db = `error: ${err instanceof Error ? err.message : "unknown"}`;
  }
  checks.qloo = (await getQloo()).mode;
  checks.memory = (await getMemory()).mode;
  checks.claude = hasAnthropicCredentials() ? PLANNER_MODEL : "not configured (offline plans)";
  checks.sessionSecret = Boolean(process.env.SESSION_SECRET);
  const ok = typeof checks.db === "string" && !checks.db.startsWith("error");
  return NextResponse.json({ ok, ...checks }, { status: ok ? 200 : 503 });
}
