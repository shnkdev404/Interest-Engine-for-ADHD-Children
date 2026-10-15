// Demo mode (ARCHITECTURE.md §8): every visitor gets a private copy of the
// Arjun persona with a ready-made plan for this week, so the first screen
// loads in seconds and judges never see each other's changes.
import { randomUUID } from "node:crypto";

import { and, desc, eq, like, lt } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { ARJUN } from "@/db/seed/arjun";
import { seedClassroom } from "@/db/seed/classroom";
import { seedArjun } from "@/db/seed/load";
import { mondayOf } from "@/lib/dates";
import { getMemory } from "@/lib/memory";

import { buildOfflinePlan, OFFLINE_MODEL } from "./plan/fallback";
import { WeeklyPlan } from "./plan/schema";
import { toolContext } from "./plan/service";
import { savePlan } from "./plan/store";

const DEMO_DOMAIN = "@demo.sparkpath.local";

// The template is the plain seeded Arjun (npm run db:seed / demo:prewarm).
// A plan it has for this week (agent-made at prewarm) is copied to visitors.
async function templatePlan(now: Date) {
  const db = await getDb();
  const parent = await db.query.adults.findFirst({ where: eq(schema.adults.email, ARJUN.parent.email) });
  if (!parent) return null;
  const child = await db.query.children.findFirst({ where: eq(schema.children.adultId, parent.id) });
  if (!child) return null;
  const [row] = await db
    .select()
    .from(schema.plans)
    .where(and(eq(schema.plans.childId, child.id), eq(schema.plans.weekStart, mondayOf(now))))
    .orderBy(desc(schema.plans.createdAt))
    .limit(1);
  return row ? { plan: WeeklyPlan.parse(row.json), model: row.model } : null;
}

async function cleanupOldDemos() {
  const db = await getDb();
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const old = await db
    .select({ id: schema.adults.id })
    .from(schema.adults)
    .where(and(like(schema.adults.email, `%${DEMO_DOMAIN}`), lt(schema.adults.createdAt, cutoff)));
  if (!old.length) return;
  const memory = await getMemory();
  for (const a of old) {
    const kids = await db.select({ id: schema.children.id }).from(schema.children).where(eq(schema.children.adultId, a.id));
    for (const k of kids) await memory.forget(k.id).catch(() => {});
    await db.delete(schema.adults).where(eq(schema.adults.id, a.id));
  }
}

// Teacher demo: a private class of five (Arjun + four classmates).
export async function createTeacherDemo(now = new Date()) {
  await cleanupOldDemos().catch(() => {});
  return seedClassroom(now, `teacher-${randomUUID()}${DEMO_DOMAIN}`);
}

export async function createDemo(now = new Date()) {
  await cleanupOldDemos().catch(() => {});
  const { child } = await seedArjun(now, `demo-${randomUUID()}${DEMO_DOMAIN}`);
  const template = await templatePlan(now);
  if (template) await savePlan(child.id, template.plan, template.model);
  else await savePlan(child.id, await buildOfflinePlan(await toolContext(child.id, now)), OFFLINE_MODEL);
  return { parentId: child.adultId, childId: child.id };
}
