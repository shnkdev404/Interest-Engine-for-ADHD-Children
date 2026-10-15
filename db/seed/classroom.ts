// Teacher demo (Phase 4): "Ms. Rao" with class 4B — Arjun (with his full
// history) plus four classmates who each have one clear interest. Names are
// fictional. In a real school, each child's parent opts in; here the demo
// teacher stands in as the consenting adult.
import { getDb, schema } from "@/db";
import { addWeeks, lastCompletedWeek } from "@/lib/dates";
import { getMemory } from "@/lib/memory";
import { getQloo } from "@/lib/qloo/source";

import { seedArjun } from "./load";

export const CLASSMATES = [
  { nickname: "Meera", ageYears: 9, interests: ["dinosaurs"] },
  { nickname: "Kabir", ageYears: 10, interests: ["football"] },
  { nickname: "Zoya", ageYears: 9, interests: ["space"] },
  { nickname: "Ishan", ageYears: 8, interests: ["LEGO"] },
] as const;

export const CLASS_NAME = "4B";

export async function seedClassroom(now: Date, teacherEmail: string) {
  const { child: arjun } = await seedArjun(now, teacherEmail, { role: "teacher", displayName: "Ms. Rao" });
  const teacherId = arjun.adultId;
  const db = await getDb();
  const [qloo, memory] = await Promise.all([getQloo(), getMemory()]);
  const since = addWeeks(lastCompletedWeek(now), -6);

  const childIds = [arjun.id];
  for (const c of CLASSMATES) {
    const [row] = await db
      .insert(schema.children)
      .values({ adultId: teacherId, nickname: c.nickname, ageYears: c.ageYears, consentAt: now, consentBy: teacherId })
      .returning();
    await memory.ensureBank(row.id, row.nickname);
    for (const label of c.interests) {
      const [match] = await qloo.search(label, 1).catch(() => []);
      await db.insert(schema.interests).values({
        childId: row.id,
        label,
        qlooEntityId: match?.entityId ?? null,
        qlooType: match?.types[0] ?? null,
        status: "active",
        source: "adult",
        startedAt: since,
      });
    }
    childIds.push(row.id);
  }

  const [cls] = await db.insert(schema.classes).values({ teacherId, name: CLASS_NAME }).returning();
  await db.insert(schema.classChildren).values(childIds.map((childId) => ({ classId: cls.id, childId })));
  return { teacherId, classId: cls.id, childIds };
}
