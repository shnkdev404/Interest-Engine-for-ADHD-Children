// What the UI calls. Pages and actions check access first (lib/session).
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { generatePlan, PlannerError } from "@/lib/agent/planner";
import type { ToolContext } from "@/lib/agent/tools";
import { mondayOf } from "@/lib/dates";
import { hasAnthropicCredentials } from "@/lib/llm/client";
import { getMemory } from "@/lib/memory";
import { noteMemory, outcomeMemory } from "@/lib/memory/outcome";
import { getQloo } from "@/lib/qloo/source";

import { buildOfflinePlan, OFFLINE_MODEL } from "./fallback";
import { WeeklyPlan, type QlooRef } from "./schema";
import { savePlan } from "./store";

export type PlanSource = "agent" | "offline";

export async function toolContext(childId: string, now = new Date()): Promise<ToolContext> {
  const db = await getDb();
  const child = await db.query.children.findFirst({ where: eq(schema.children.id, childId) });
  if (!child) throw new Error("Child not found");
  const interests = await db.select().from(schema.interests).where(eq(schema.interests.childId, childId));
  const [qloo, memory] = await Promise.all([getQloo(), getMemory()]);
  return { child, interests, qloo, memory, now, seen: new Map<string, QlooRef>() };
}

// Agent when Claude is configured; offline template otherwise or on failure.
export async function createPlan(
  childId: string,
  o: { adultRequest?: string; now?: Date; preferOffline?: boolean } = {},
): Promise<{ planId: string; source: PlanSource; notice?: string }> {
  const now = o.now ?? new Date();
  if (!o.preferOffline && hasAnthropicCredentials()) {
    try {
      const res = await generatePlan({ childId, adultRequest: o.adultRequest, now });
      const row = await savePlan(childId, res.plan, res.model);
      return { planId: row.id, source: "agent" };
    } catch (err) {
      const why = err instanceof PlannerError ? err.message : "the planner was unavailable";
      const plan = await buildOfflinePlan(await toolContext(childId, now));
      const row = await savePlan(childId, plan, OFFLINE_MODEL);
      return { planId: row.id, source: "offline", notice: `Made a quick plan instead: ${why}` };
    }
  }
  const plan = await buildOfflinePlan(await toolContext(childId, now));
  const row = await savePlan(childId, plan, OFFLINE_MODEL);
  return { planId: row.id, source: "offline" };
}

export type MissionView = typeof schema.missions.$inferSelect & {
  log: { status: (typeof schema.taskLogs.$inferSelect)["status"]; minutes: number; note: string | null } | null;
};

export async function getCurrentPlan(childId: string, now = new Date()) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.childId, childId), eq(schema.plans.weekStart, mondayOf(now))))
    .orderBy(desc(schema.plans.createdAt))
    .limit(1);
  if (!row) return null;

  const missions = await db.select().from(schema.missions).where(eq(schema.missions.planId, row.id));
  const logs = missions.length
    ? await db
        .select()
        .from(schema.taskLogs)
        .where(inArray(schema.taskLogs.missionId, missions.map((m) => m.id)))
        .orderBy(desc(schema.taskLogs.loggedAt))
    : [];
  const latest = (id: string) => logs.find((l) => l.missionId === id);

  // Keep the plan's mission order.
  const plan = WeeklyPlan.parse(row.json);
  const ordered = plan.missions
    .map((pm) => missions.find((m) => m.title === pm.title))
    .filter((m): m is (typeof missions)[number] => !!m);

  return {
    id: row.id,
    plan,
    source: (row.model === OFFLINE_MODEL ? "offline" : "agent") as PlanSource,
    createdAt: row.createdAt,
    missions: ordered.map((m): MissionView => {
      const l = latest(m.id);
      return { ...m, log: l ? { status: l.status, minutes: l.minutes, note: l.note } : null };
    }),
  };
}

export async function logOutcome(
  childId: string,
  missionId: string,
  o: { status: "done" | "partial" | "skipped" | "meltdown"; minutes: number; note?: string },
) {
  const db = await getDb();
  const [row] = await db
    .select({ mission: schema.missions, plan: schema.plans, interest: schema.interests })
    .from(schema.missions)
    .innerJoin(schema.plans, eq(schema.missions.planId, schema.plans.id))
    .leftJoin(schema.interests, eq(schema.missions.interestId, schema.interests.id))
    .where(eq(schema.missions.id, missionId));
  if (!row || row.plan.childId !== childId) throw new Error("Mission not found");
  const child = await db.query.children.findFirst({ where: eq(schema.children.id, childId) });

  const note = o.note?.trim() || null;
  const now = new Date();
  // Numbers to Postgres (scorer), words to memory (D-08).
  await db.insert(schema.taskLogs).values({ missionId, childId, status: o.status, minutes: o.minutes, note, loggedAt: now });
  const memory = await getMemory();
  const nickname = child?.nickname ?? "The child";
  await memory.retain(
    childId,
    outcomeMemory({
      nickname,
      title: row.mission.title,
      interest: row.interest?.label ?? null,
      subject: row.mission.subject,
      format: row.mission.format,
      status: o.status,
      minutes: o.minutes,
      occurredAt: now,
    }),
  );
  if (note) await memory.retain(childId, noteMemory({ nickname, title: row.mission.title, note, occurredAt: now }));
}

// "Try it" on a suggested next interest: add it as a trial interest.
export async function tryInterest(childId: string, label: string, ref?: QlooRef) {
  const db = await getDb();
  const existing = await db
    .select()
    .from(schema.interests)
    .where(and(eq(schema.interests.childId, childId), eq(schema.interests.label, label)));
  if (existing.length) return existing[0];
  const [row] = await db
    .insert(schema.interests)
    .values({
      childId,
      label,
      qlooEntityId: ref?.entityId ?? null,
      qlooType: ref?.type ?? null,
      status: "trial",
      source: "suggested",
      startedAt: new Date().toISOString().slice(0, 10),
    })
    .returning();
  return row;
}
