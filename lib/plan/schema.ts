// WeeklyPlan (DESIGN.md §3) and the grounding check that makes every
// recommendation provably come from Qloo (D-17).
import { z } from "zod";

export const FORMATS = [
  "short_mission",
  "build",
  "movement",
  "reading_short",
  "reading_long",
  "screen_free",
  "quiz",
] as const;
// "break" = a movement break before focused work (Pontifex 2013; RESEARCH.md Tier 1 #7).
export const SUBJECTS = ["maths", "reading", "writing", "chore", "routine", "other", "break"] as const;

export const QlooRef = z.object({
  entityId: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
});
export type QlooRef = z.infer<typeof QlooRef>;

const InterestDelta = z.object({ label: z.string(), changePct: z.number() });

export const Mission = z.object({
  title: z.string().min(3).max(90),
  subject: z.enum(SUBJECTS),
  interest: z.string().min(1).describe("label of the interest used as the hook"),
  format: z.enum(FORMATS),
  estMinutes: z.number().int().min(5).max(30),
  steps: z.array(z.string().min(2).max(160)).min(2).max(5),
  qlooRefs: z.array(QlooRef).max(3),
  // Choice of two (Dunlap 1994): same job, a different interest-wrapped version.
  alt: z
    .object({ title: z.string().min(3).max(90), steps: z.array(z.string().min(2).max(160)).min(2).max(5) })
    .optional(),
  // Set on the one retry mission for a resting interest.
  probe: z.boolean().optional(),
});
export type Mission = z.infer<typeof Mission>;

const Pick = z.object({ title: z.string().min(1), why: z.string().min(5).max(200), qlooRef: QlooRef });

export const WeeklyPlan = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  headline: z.string().min(5).max(80),
  insight: z
    .object({
      fading: z.array(InterestDelta),
      holding: z.array(InterestDelta),
      formatsThatWork: z.array(z.enum(FORMATS)),
      summary: z.string().max(320),
    })
    .optional(),
  missions: z.array(Mission).min(5).max(7),
  // Aim for 3–5 and 5–8, but fewer is fine when Qloo has fewer: never invent.
  readingList: z.array(Pick).max(5),
  focusPlaylist: z.array(Pick).max(8),
  weekendActivity: z.object({
    title: z.string().min(3),
    why: z.string().min(5).max(240),
    qlooRefs: z.array(QlooRef).max(3),
  }),
  // Immediate rewards, picked by the child right after a mission (Luman 2005).
  // From Qloo where possible; never point deductions.
  rewards: z
    .array(z.object({ title: z.string().min(2).max(60), why: z.string().min(5).max(160), qlooRef: QlooRef.nullable() }))
    .max(4)
    .default([]), // plans saved before rewards existed read as []; new plans need 2+ (checkGrounding)
  nextInterests: z
    .array(
      z.object({
        label: z.string().min(2).max(40),
        bridge: z.string().min(10).max(240),
        starterMission: z.string().min(5).max(160),
        qlooRefs: z.array(QlooRef).min(1).max(4),
      }),
    )
    .max(3),
});
export type WeeklyPlan = z.infer<typeof WeeklyPlan>;

const BOOK = "urn:entity:book";
const ARTIST = "urn:entity:artist";

// Every ref must be an entity a Qloo tool returned in this run, with the same
// id; reading list items must be books and playlist items artists.
export function checkGrounding(
  plan: WeeklyPlan,
  seen: ReadonlyMap<string, QlooRef>,
  opts: { requireNextInterests: boolean; probeDue?: string[] },
): string[] {
  const errors: string[] = [];
  const check = (ref: QlooRef, where: string, type?: string) => {
    const known = seen.get(ref.entityId);
    if (!known) errors.push(`${where}: "${ref.name}" (${ref.entityId}) was not returned by a Qloo tool in this run`);
    else if (type && known.type !== type) errors.push(`${where}: "${ref.name}" is a ${known.type}, expected ${type}`);
  };

  plan.missions.forEach((m, i) => m.qlooRefs.forEach((r) => check(r, `missions[${i}]`)));
  plan.readingList.forEach((p, i) => check(p.qlooRef, `readingList[${i}]`, BOOK));
  plan.focusPlaylist.forEach((p, i) => check(p.qlooRef, `focusPlaylist[${i}]`, ARTIST));
  plan.weekendActivity.qlooRefs.forEach((r) => check(r, "weekendActivity"));
  plan.rewards.forEach((r, i) => r.qlooRef && check(r.qlooRef, `rewards[${i}]`));
  plan.nextInterests.forEach((n, i) => n.qlooRefs.forEach((r) => check(r, `nextInterests[${i}]`)));

  if (plan.rewards.length < 2) errors.push("rewards: offer 2-4 small rewards the child can pick after a mission");
  if (!plan.missions.some((m) => m.subject === "break")) {
    errors.push('missions: include one movement break (subject "break", format "movement") before a focused mission');
  }
  for (const label of opts.probeDue ?? []) {
    if (!plan.missions.some((m) => m.probe && m.interest.toLowerCase() === label.toLowerCase())) {
      errors.push(`missions: "${label}" is due a retry; include exactly one short probe mission for it (probe: true)`);
    }
  }
  if (opts.requireNextInterests && plan.nextInterests.length !== 3) {
    errors.push(`nextInterests: an interest is fading, so exactly 3 next interests are required (got ${plan.nextInterests.length})`);
  }
  return errors;
}

// Pulls the JSON object out of the model's final text (tolerates a code fence).
export function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("No JSON object found in the response");
  return JSON.parse(text.slice(start, end + 1));
}
