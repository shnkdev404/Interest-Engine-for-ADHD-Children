// Loads the Arjun demo persona into Postgres and memory. Used by
// scripts/seed.ts, demo mode (one private copy per visitor), and tests.
// Safe to re-run: an existing parent with the same email (and, by cascade,
// their child and memory) is removed first.
import { eq } from "drizzle-orm";

import { getDb, migrateDb, schema } from "@/db";
import { addDays, addWeeks, lastCompletedWeek } from "@/lib/dates";
import { getMemory } from "@/lib/memory";
import { noteMemory, outcomeMemory } from "@/lib/memory/outcome";
import { getQloo } from "@/lib/qloo/source";

import { ARJUN, ARJUN_MISSIONS, type InterestKey } from "./arjun";

export async function seedArjun(
  now = new Date(),
  parentEmail: string = ARJUN.parent.email,
  adult: { role: "parent" | "teacher"; displayName: string } = { role: "parent", displayName: ARJUN.parent.displayName },
) {
  const db = await getDb();
  await migrateDb(db);
  const memory = await getMemory();
  const qloo = await getQloo();

  const evaluated = lastCompletedWeek(now);
  const weekStart = (w: 0 | 1 | 2) => addWeeks(evaluated, w - 2);

  // Reset: removing the parent cascades to the child and all their rows.
  const old = await db.query.adults.findFirst({
    where: eq(schema.adults.email, parentEmail),
  });
  if (old) {
    const kids = await db.select({ id: schema.children.id }).from(schema.children).where(eq(schema.children.adultId, old.id));
    for (const k of kids) await memory.forget(k.id).catch(() => {});
    await db.delete(schema.adults).where(eq(schema.adults.id, old.id));
  }

  const [parent] = await db
    .insert(schema.adults)
    .values({ email: parentEmail, displayName: adult.displayName, role: adult.role })
    .returning();
  const [child] = await db
    .insert(schema.children)
    .values({
      adultId: parent.id,
      nickname: ARJUN.nickname,
      ageYears: ARJUN.ageYears,
      consentAt: new Date(`${addWeeks(evaluated, -31)}T09:00:00Z`),
      consentBy: parent.id,
    })
    .returning();
  await memory.ensureBank(child.id, child.nickname);

  const interestIds = {} as Record<InterestKey, string>;
  for (const i of ARJUN.interests) {
    const [match] = await qloo.search(i.label, 3).catch(() => []);
    const [row] = await db
      .insert(schema.interests)
      .values({
        childId: child.id,
        label: i.label,
        qlooEntityId: match?.entityId ?? null,
        qlooType: match?.types[0] ?? i.qlooType,
        status: "active",
        source: "adult",
        startedAt: addWeeks(evaluated, -i.weeksAgoStarted),
      })
      .returning();
    interestIds[i.key] = row.id;
  }

  let logs = 0;
  for (const w of [0, 1, 2] as const) {
    const [plan] = await db
      .insert(schema.plans)
      .values({
        childId: child.id,
        weekStart: weekStart(w),
        json: { seeded: true, headline: `Seeded week ${w + 1} of 3` },
        model: "seed",
      })
      .returning();

    for (const m of ARJUN_MISSIONS.filter((x) => x.week === w)) {
      const [mission] = await db
        .insert(schema.missions)
        .values({
          planId: plan.id,
          interestId: m.interest ? interestIds[m.interest] : null,
          subject: m.subject,
          format: m.format,
          title: m.title,
          steps: m.steps,
          estMinutes: m.estMinutes,
        })
        .returning();

      const occurredAt = new Date(`${addDays(weekStart(w), m.day)}T18:00:00Z`);
      await db.insert(schema.taskLogs).values({
        missionId: mission.id,
        childId: child.id,
        status: m.outcome.status,
        minutes: m.outcome.minutes,
        note: m.outcome.note ?? null,
        loggedAt: occurredAt,
      });
      logs++;

      const interestLabel = m.interest ? ARJUN.interests.find((i) => i.key === m.interest)!.label : null;
      await memory.retain(
        child.id,
        outcomeMemory({
          nickname: child.nickname,
          title: m.title,
          interest: interestLabel,
          subject: m.subject,
          format: m.format,
          status: m.outcome.status,
          minutes: m.outcome.minutes,
          occurredAt,
        }),
      );
      if (m.outcome.note) {
        await memory.retain(child.id, noteMemory({ nickname: child.nickname, title: m.title, note: m.outcome.note, occurredAt }));
      }
    }
  }

  return { child, logs, evaluated, memoryMode: memory.mode, qlooMode: qloo.mode };
}
