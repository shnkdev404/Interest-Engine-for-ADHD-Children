import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";

import type { WeeklyPlan } from "./schema";

// Saves a generated plan and its missions; missions link to the interest
// they're themed on (by label) so outcomes feed the engagement scorer.
export async function savePlan(childId: string, plan: WeeklyPlan, model: string) {
  const db = await getDb();
  const interests = await db.select().from(schema.interests).where(eq(schema.interests.childId, childId));
  const interestId = (label: string) =>
    interests.find((i) => i.label.toLowerCase() === label.toLowerCase())?.id ?? null;

  const [row] = await db.insert(schema.plans).values({ childId, weekStart: plan.weekStart, json: plan, model }).returning();
  if (plan.missions.length) {
    await db.insert(schema.missions).values(
      plan.missions.map((m) => ({
        planId: row.id,
        interestId: interestId(m.interest),
        subject: m.subject,
        format: m.format,
        title: m.title,
        steps: m.steps,
        estMinutes: m.estMinutes,
        qlooRefs: m.qlooRefs,
      })),
    );
  }
  return row;
}
