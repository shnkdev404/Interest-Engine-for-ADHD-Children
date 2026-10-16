// What the UI calls. Pages and actions check access first (lib/session).
import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { generatePlan, PlannerError } from "@/lib/agent/planner";
import type { ToolContext } from "@/lib/agent/tools";
import { addWeeks, mondayOf } from "@/lib/dates";
import { THRESHOLDS } from "@/lib/engagement/score";
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
  log: { status: (typeof schema.taskLogs.$inferSelect)["status"]; minutes: number; note: string | null; variant: string | null } | null;
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
      return { ...m, log: l ? { status: l.status, minutes: l.minutes, note: l.note, variant: l.variant } : null };
    }),
  };
}

export async function logOutcome(
  childId: string,
  missionId: string,
  o: { status: "done" | "partial" | "skipped" | "meltdown"; minutes: number; note?: string; variant?: "a" | "b" },
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
  const [previous] = await db
    .select()
    .from(schema.taskLogs)
    .where(eq(schema.taskLogs.missionId, missionId))
    .orderBy(desc(schema.taskLogs.loggedAt))
    .limit(1);
  const variant = o.variant ?? previous?.variant ?? null;
  // Numbers to Postgres (scorer), words to memory (D-08).
  await db.insert(schema.taskLogs).values({ missionId, childId, status: o.status, minutes: o.minutes, note, variant, loggedAt: now });

  const memory = await getMemory();
  const nickname = child?.nickname ?? "The child";
  // Refining minutes after a one-tap log isn't a new event for memory.
  if (!previous || previous.status !== o.status || previous.variant !== variant) {
    const alt = row.mission.alt;
    const chosen = variant === "b" && alt ? alt.title : row.mission.title;
    await memory.retain(
      childId,
      outcomeMemory({
        nickname,
        title: chosen,
        interest: row.interest?.label ?? null,
        subject: row.mission.subject,
        format: row.mission.format,
        status: o.status,
        minutes: o.minutes,
        occurredAt: now,
        choseAlternative: alt ? (variant === "b" ? alt.title : null) : undefined,
      }),
    );
  }
  if (note) await memory.retain(childId, noteMemory({ nickname, title: row.mission.title, note, occurredAt: now }));

  // A resting interest's probe mission went well: bring it back.
  if (row.interest?.status === "dormant" && (o.status === "done" || o.status === "partial")) {
    await db
      .update(schema.interests)
      .set({ status: "active", resurfaceOn: null, pausedAt: null, startedAt: now.toISOString().slice(0, 10) })
      .where(eq(schema.interests.id, row.interest.id));
  }
}

// Rest a fading interest for a few weeks; the planner retries it once as a
// probe mission when it's due (interest often recovers after a break).
export async function restInterest(childId: string, interestId: string, weeks: number = THRESHOLDS.restWeeks) {
  const db = await getDb();
  const today = new Date().toISOString().slice(0, 10);
  const resurfaceOn = addWeeks(mondayOf(new Date()), weeks);
  await db
    .update(schema.interests)
    .set({ status: "dormant", pausedAt: today, resurfaceOn })
    .where(and(eq(schema.interests.id, interestId), eq(schema.interests.childId, childId)));
  return { resurfaceOn };
}

// Mark (or unmark) a week as a break: holiday, illness, exams.
export async function setPauseWeek(childId: string, weekStart: string, paused: boolean, reason?: string) {
  const db = await getDb();
  if (paused) {
    await db
      .insert(schema.childPauses)
      .values({ childId, weekStart, reason: reason ?? null })
      .onConflictDoUpdate({ target: [schema.childPauses.childId, schema.childPauses.weekStart], set: { reason: reason ?? null } });
  } else {
    await db
      .delete(schema.childPauses)
      .where(and(eq(schema.childPauses.childId, childId), eq(schema.childPauses.weekStart, weekStart)));
  }
}

export async function getPauseWeeks(childId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.childPauses).where(eq(schema.childPauses.childId, childId));
  return rows.map((r) => r.weekStart);
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

// The child picked a reward after a mission; memory learns what motivates.
export async function chooseReward(childId: string, missionId: string, reward: string) {
  const db = await getDb();
  const [row] = await db
    .select({ mission: schema.missions, plan: schema.plans })
    .from(schema.missions)
    .innerJoin(schema.plans, eq(schema.missions.planId, schema.plans.id))
    .where(eq(schema.missions.id, missionId));
  if (!row || row.plan.childId !== childId) throw new Error("Mission not found");
  const child = await db.query.children.findFirst({ where: eq(schema.children.id, childId) });
  await (await getMemory()).retain(childId, {
    context: "task_outcome",
    occurredAt: new Date(),
    content: `${child?.nickname ?? "The child"} chose the reward "${reward}" after "${row.mission.title}".`,
  });
}
