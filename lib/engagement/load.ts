import { and, eq, gte } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { addWeeks, lastCompletedWeek } from "@/lib/dates";

import { scoreEngagement, THRESHOLDS, type EngagementReport, type MissionOutcome } from "./score";

// Reads up to 8 weeks of missions + logs and the adult's break weeks for a
// child, then scores them. Used by the agent's get_engagement tool, the
// Insights screen and the planners.
export async function getEngagement(childId: string, now = new Date()): Promise<EngagementReport> {
  const db = await getDb();
  const weekStart = lastCompletedWeek(now);
  const from = addWeeks(weekStart, 1 - THRESHOLDS.horizonWeeks);

  const rows = await db
    .select({
      missionId: schema.missions.id,
      weekStart: schema.plans.weekStart,
      interestId: schema.missions.interestId,
      format: schema.missions.format,
      status: schema.taskLogs.status,
      minutes: schema.taskLogs.minutes,
      note: schema.taskLogs.note,
      loggedAt: schema.taskLogs.loggedAt,
    })
    .from(schema.missions)
    .innerJoin(schema.plans, eq(schema.missions.planId, schema.plans.id))
    .leftJoin(schema.taskLogs, eq(schema.taskLogs.missionId, schema.missions.id))
    .where(and(eq(schema.plans.childId, childId), gte(schema.plans.weekStart, from)));

  // One outcome per mission: the latest log wins (a parent refining minutes
  // after a one-tap "Done" must not count the mission twice). Notes from
  // earlier logs of the same mission are kept.
  const byMission = new Map<string, (typeof rows)[number] & { notes: string[] }>();
  for (const r of rows) {
    const cur = byMission.get(r.missionId);
    const notes = [...(cur?.notes ?? []), ...(r.note ? [r.note] : [])];
    if (!cur || (r.loggedAt && (!cur.loggedAt || r.loggedAt > cur.loggedAt))) byMission.set(r.missionId, { ...r, notes });
    else cur.notes = notes;
  }
  const outcomes: MissionOutcome[] = [...byMission.values()].map((r) => ({
    weekStart: r.weekStart,
    interestId: r.interestId,
    format: r.format,
    status: r.status,
    minutes: r.minutes ?? 0,
    note: r.notes.join(" · ") || null,
  }));

  const [interests, pauses] = await Promise.all([
    db.select().from(schema.interests).where(eq(schema.interests.childId, childId)),
    db.select().from(schema.childPauses).where(eq(schema.childPauses.childId, childId)),
  ]);
  return scoreEngagement(
    interests.map((i) => ({ id: i.id, label: i.label, status: i.status, startedAt: i.startedAt, resurfaceOn: i.resurfaceOn })),
    outcomes,
    weekStart,
    pauses.map((p) => p.weekStart),
  );
}
