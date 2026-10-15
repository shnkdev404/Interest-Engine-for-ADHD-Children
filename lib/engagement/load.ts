import { and, eq, gte } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { addWeeks, lastCompletedWeek } from "@/lib/dates";

import { scoreEngagement, type EngagementReport, type MissionOutcome } from "./score";

// Reads three weeks of missions + logs for a child and scores them. This is
// what the agent's get_engagement tool and the Insights screen call.
export async function getEngagement(childId: string, now = new Date()): Promise<EngagementReport> {
  const db = await getDb();
  const weekStart = lastCompletedWeek(now);
  const from = addWeeks(weekStart, -2);

  const rows = await db
    .select({
      weekStart: schema.plans.weekStart,
      interestId: schema.missions.interestId,
      format: schema.missions.format,
      status: schema.taskLogs.status,
      minutes: schema.taskLogs.minutes,
      note: schema.taskLogs.note,
    })
    .from(schema.missions)
    .innerJoin(schema.plans, eq(schema.missions.planId, schema.plans.id))
    .leftJoin(schema.taskLogs, eq(schema.taskLogs.missionId, schema.missions.id))
    .where(and(eq(schema.plans.childId, childId), gte(schema.plans.weekStart, from)));

  const outcomes: MissionOutcome[] = rows.map((r) => ({
    weekStart: r.weekStart,
    interestId: r.interestId,
    format: r.format,
    status: r.status,
    minutes: r.minutes ?? 0,
    note: r.note,
  }));

  const interests = await db.select().from(schema.interests).where(eq(schema.interests.childId, childId));
  return scoreEngagement(
    interests.map((i) => ({ id: i.id, label: i.label, status: i.status, startedAt: i.startedAt })),
    outcomes,
    weekStart,
  );
}
