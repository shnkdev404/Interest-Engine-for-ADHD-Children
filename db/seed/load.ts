// Loads the Arjun demo persona into Postgres and memory. Used by
// scripts/seed.ts, demo mode (one private copy per visitor), and tests.
// Safe to re-run: an existing parent with the same email (and, by cascade,
// their child and memory) is removed first.
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { lastSchoolDays } from "@/lib/drc";
import { addDays, addWeeks, lastCompletedWeek } from "@/lib/dates";
import { getMemory } from "@/lib/memory";
import { noteMemory, outcomeMemory } from "@/lib/memory/outcome";
import { getQloo } from "@/lib/qloo/source";

import { ARJUN, ARJUN_DRC, ARJUN_MISSIONS, type InterestKey } from "./arjun";

export async function seedArjun(
  now = new Date(),
  parentEmail: string = ARJUN.parent.email,
  adult: { role: "parent" | "teacher"; displayName: string } = { role: "parent", displayName: ARJUN.parent.displayName },
) {
  const db = await getDb();
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
    const match = await qloo.resolve(i.label).catch(() => null);
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

  // School card: three targets and the five school days before today.
  const targets = await db
    .insert(schema.drcTargets)
    .values(ARJUN_DRC.targets.map((text, i) => ({ childId: child.id, text, sortOrder: i })))
    .returning();
  await db.insert(schema.drcRewards).values({ childId: child.id, threshold: ARJUN_DRC.threshold, rewardText: ARJUN_DRC.reward });
  const today = now.toISOString().slice(0, 10);
  const schoolDays = lastSchoolDays(now, 6).filter((d) => d !== today).slice(-5);
  await db.insert(schema.drcEntries).values(
    schoolDays.flatMap((day, i) =>
      targets.map((t, k) => ({ targetId: t.id, childId: child.id, day, met: ARJUN_DRC.pattern[i][k], enteredBy: parent.id })),
    ),
  );
  await memory.retain(child.id, {
    context: "adult_note",
    occurredAt: new Date(`${schoolDays.at(-1)}T15:30:00Z`),
    content: `School card for ${child.nickname}, last five school days: ${ARJUN_DRC.targets
      .map((t, k) => `${t} ${ARJUN_DRC.pattern.filter((d) => d[k]).length} of 5`)
      .join("; ")}. Homework hand-in is the hardest one.`,
  });

  return { child, logs, evaluated, memoryMode: memory.mode, qlooMode: qloo.mode };
}
