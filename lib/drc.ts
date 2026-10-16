// Daily school-home card (Daily Report Card; RESEARCH.md Tier 1 #2): a few
// specific daily targets, a yes/no each school day, and a home reward when
// enough are met. Strongest-evidence addition (Iznardo 2020; Fabiano 2025).
// Plain wording only: targets describe what the child did, never conditions.
import { and, asc, eq, gte, inArray } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { getMemory } from "@/lib/memory";
import type { QlooRef } from "@/lib/plan/schema";
import { lintValue } from "@/lib/safety/lint";

export const TARGET_SUGGESTIONS = [
  "Started work within 2 minutes of being asked",
  "Stayed with the group during carpet time",
  "Handed in homework",
  "Kind hands and kind words",
  "Asked for help when stuck",
  "Packed bag before home time",
];

export type DrcDay = { day: string; entries: Record<string, boolean> };
export type DrcView = {
  targets: { id: string; text: string }[];
  days: DrcDay[]; // last 5 school days, oldest first, today last if a school day
  today: string;
  reward: { threshold: number; rewardText: string; qlooRef: QlooRef | null } | null;
  todayMet: number;
  earnedToday: boolean;
  last5: { met: number; entered: number };
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function lastSchoolDays(today: Date, n = 5): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  while (out.length < n) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.unshift(iso(d));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}

export async function getDrc(childId: string, now = new Date()): Promise<DrcView> {
  const db = await getDb();
  const days = lastSchoolDays(now);
  const [targets, reward] = await Promise.all([
    db
      .select()
      .from(schema.drcTargets)
      .where(and(eq(schema.drcTargets.childId, childId), eq(schema.drcTargets.active, true)))
      .orderBy(asc(schema.drcTargets.sortOrder)),
    db.query.drcRewards.findFirst({ where: eq(schema.drcRewards.childId, childId) }),
  ]);
  const entries = targets.length
    ? await db
        .select()
        .from(schema.drcEntries)
        .where(
          and(
            inArray(schema.drcEntries.targetId, targets.map((t) => t.id)),
            gte(schema.drcEntries.day, days[0]),
          ),
        )
    : [];

  const view: DrcDay[] = days.map((day) => ({
    day,
    entries: Object.fromEntries(entries.filter((e) => e.day === day).map((e) => [e.targetId, e.met])),
  }));
  const today = iso(now);
  const todayEntries = view.find((d) => d.day === today)?.entries ?? {};
  const todayMet = Object.values(todayEntries).filter(Boolean).length;
  const all = view.flatMap((d) => Object.values(d.entries));
  return {
    targets: targets.map((t) => ({ id: t.id, text: t.text })),
    days: view,
    today,
    reward: reward ? { threshold: reward.threshold, rewardText: reward.rewardText, qlooRef: reward.qlooRef ?? null } : null,
    todayMet,
    earnedToday: !!reward && todayMet >= reward.threshold,
    last5: { met: all.filter(Boolean).length, entered: all.length },
  };
}

export class DrcInputError extends Error {}

function checkWording(texts: string[]) {
  const hits = lintValue(texts);
  if (hits.length) throw new DrcInputError(`Please avoid the word "${hits[0].word}".`);
}

// Replace the active targets (2–4). Old targets are kept inactive so past
// days still have their history.
export async function setTargets(childId: string, texts: string[]) {
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (clean.length < 1 || clean.length > 4) throw new DrcInputError("Pick 1 to 4 targets.");
  checkWording(clean);
  const db = await getDb();
  await db.update(schema.drcTargets).set({ active: false }).where(eq(schema.drcTargets.childId, childId));
  await db.insert(schema.drcTargets).values(clean.map((text, i) => ({ childId, text, sortOrder: i })));
}

export async function setReward(childId: string, threshold: number, rewardText: string, qlooRef: QlooRef | null = null) {
  checkWording([rewardText]);
  const db = await getDb();
  await db
    .insert(schema.drcRewards)
    .values({ childId, threshold, rewardText: rewardText.trim(), qlooRef })
    .onConflictDoUpdate({
      target: schema.drcRewards.childId,
      set: { threshold, rewardText: rewardText.trim(), qlooRef, updatedAt: new Date() },
    });
}

// Tick one target for one day. When the day becomes complete for the first
// time, a one-line summary goes to memory so the planner can use it.
export async function setEntry(childId: string, targetId: string, day: string, met: boolean, enteredBy: string | null) {
  const db = await getDb();
  const target = await db.query.drcTargets.findFirst({ where: eq(schema.drcTargets.id, targetId) });
  if (!target || target.childId !== childId) throw new DrcInputError("Target not found");

  const active = await db
    .select()
    .from(schema.drcTargets)
    .where(and(eq(schema.drcTargets.childId, childId), eq(schema.drcTargets.active, true)));
  const before = await db
    .select()
    .from(schema.drcEntries)
    .where(and(inArray(schema.drcEntries.targetId, active.map((t) => t.id)), eq(schema.drcEntries.day, day)));

  await db
    .insert(schema.drcEntries)
    .values({ targetId, childId, day, met, enteredBy })
    .onConflictDoUpdate({
      target: [schema.drcEntries.targetId, schema.drcEntries.day],
      set: { met, enteredBy, updatedAt: new Date() },
    });

  const wasNew = !before.some((e) => e.targetId === targetId);
  if (wasNew && before.length === active.length - 1) {
    const results = new Map(before.map((e) => [e.targetId, e.met]));
    results.set(targetId, met);
    const metCount = [...results.values()].filter(Boolean).length;
    const reward = await db.query.drcRewards.findFirst({ where: eq(schema.drcRewards.childId, childId) });
    const child = await db.query.children.findFirst({ where: eq(schema.children.id, childId) });
    const detail = active.map((t) => `${t.text}: ${results.get(t.id) ? "yes" : "not yet"}`).join("; ");
    await (await getMemory()).retain(childId, {
      context: "adult_note",
      occurredAt: new Date(`${day}T15:30:00Z`),
      content:
        `School card for ${child?.nickname ?? "the child"} on ${day}: met ${metCount} of ${active.length} targets (${detail}).` +
        (reward ? (metCount >= reward.threshold ? ` Earned the home reward: ${reward.rewardText}.` : " Home reward not earned today.") : ""),
    });
  }
}
