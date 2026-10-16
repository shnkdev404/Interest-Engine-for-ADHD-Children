// Next-interest discovery (DESIGN.md §5): find what sits between a fading
// interest and what still works, using Qloo's taste graph. Deterministic
// apart from Qloo's own results; Claude only names and phrases the picks.
import type { Format } from "@/lib/engagement/score";
import { filterAgeFit } from "@/lib/safety/age-fit";
import type { QlooSource } from "@/lib/qloo/source";
import { ENTITY_TYPES, type EntityTypeKey, type QlooEntity, type QlooTag } from "@/lib/qloo/types";

export const DISCOVERY_TYPES: EntityTypeKey[] = ["video_game", "tv_show", "book", "movie"];

export type Candidate = {
  tag: QlooTag;
  entities: QlooEntity[]; // best first, age-fit, untried
  score: number;
  parts: { affinity: number; ageFit: number; novelty: number; formatFit: number };
  sharedWith: string[]; // which signal interests carry this tag
};

export type DiscoveryInput = {
  qloo: QlooSource;
  age: number;
  fading: { label: string; entityId: string }[];
  holding: { label: string; entityId: string }[];
  excludeEntityIds: string[]; // interests and everything used in recent plans
  formatsThatWork: Format[];
  take?: number;
};

// Which tags suggest activities in a format that already works for the child.
const TAG_FORMATS: [RegExp, Format][] = [
  [/build|construct|sandbox|creative|craft|lego/i, "build"],
  [/sport|football|cricket|dance|outdoor|active/i, "movement"],
  [/comic|graphic|short|picture/i, "reading_short"],
  [/puzzle|quiz|trivia/i, "quiz"],
];

const tagFormats = (t: QlooTag): Format[] => TAG_FORMATS.filter(([re]) => re.test(t.name)).map(([, f]) => f);

const hasTag = (e: QlooEntity, t: QlooTag) =>
  e.tags.some((x) => x.id === t.id || x.name.toLowerCase() === t.name.toLowerCase());

export async function discoverNextInterests(input: DiscoveryInput): Promise<{
  candidates: Candidate[];
  considered: number;
  droppedForAge: number;
}> {
  const { qloo, age } = input;
  const signal = [...input.fading, ...input.holding].map((s) => s.entityId);
  if (!signal.length) return { candidates: [], considered: 0, droppedForAge: 0 };
  const exclude = [...new Set([...input.excludeEntityIds, ...signal])];

  // 1–2. Breadth across types, signalled by fading + holding together.
  const [audience, ...byType] = await Promise.all([
    qloo.audienceTags(signal, 20),
    ...DISCOVERY_TYPES.map((t) =>
      qloo.insights({ filterType: ENTITY_TYPES[t], entityIds: signal, excludeEntityIds: exclude, take: 15 }),
    ),
  ]);

  // Rank-based affinity within each type list (Qloo order = relevance).
  const rankScore = new Map<string, number>();
  for (const list of byType) list.forEach((e, i) => rankScore.set(e.entityId, 1 - i / Math.max(list.length, 1)));
  // A "next interest" must be new: drop same-franchise items of a fading
  // interest (e.g. a Minecraft novel when Minecraft is what's fading).
  const fadingNames = input.fading.map((f) => f.label.toLowerCase());
  const all = byType.flat().filter((e) => !fadingNames.some((n) => e.name.toLowerCase().includes(n)));
  const { kept, dropped } = await filterAgeFit(all, age);
  const keptIds = new Set(kept.map((e) => e.entityId));

  // Tags of the signal entities themselves, to say which interest a tag bridges.
  const signalEntities = await Promise.all(
    [...input.fading, ...input.holding].map(async (s) => ({
      label: s.label,
      tags: (await qloo.search(s.label, 3)).find((e) => e.entityId === s.entityId)?.tags ?? [],
    })),
  );

  // 3. Group by the audience's top taste tags; each group is a candidate.
  const candidates: Candidate[] = [];
  for (const tag of audience) {
    const group = all.filter((e) => hasTag(e, tag));
    if (group.length < 2) continue;
    const fit = group.filter((e) => keptIds.has(e.entityId));
    if (fit.length < 2) continue;


    const affinity = fit.reduce((s, e) => s + (rankScore.get(e.entityId) ?? 0), 0) / fit.length;
    const ageFit = fit.length / group.length;
    const novelty = fit.some((e) => input.excludeEntityIds.includes(e.entityId)) ? 0 : 1;
    const formatFit = tagFormats(tag).some((f) => input.formatsThatWork.includes(f)) ? 1.2 : 1;
    const tagAffinity = tag.affinity ?? 1;

    // Same title across types (a book and its film) counts once.
    const top = fit
      .sort((a, b) => (rankScore.get(b.entityId) ?? 0) - (rankScore.get(a.entityId) ?? 0))
      .filter((e, i, arr) => arr.findIndex((x) => x.name.toLowerCase() === e.name.toLowerCase()) === i)
      .slice(0, 5);

    // Skip a group whose top picks mostly repeat one we already took: the
    // parent would see the same titles under two names (found on live data).
    const topIds = new Set(top.map((e) => e.entityId));
    const dup = candidates.some((c) => c.entities.filter((e) => topIds.has(e.entityId)).length / topIds.size >= 0.5);
    if (dup) continue;

    candidates.push({
      tag,
      entities: top,
      score: affinity * ageFit * novelty * formatFit * tagAffinity,
      parts: { affinity, ageFit, novelty, formatFit },
      sharedWith: signalEntities.filter((s) => s.tags.some((t) => t.id === tag.id || t.name === tag.name)).map((s) => s.label),
    });
  }

  return {
    // 4–5. Top picks; Claude names them and writes the bridge + starter mission.
    candidates: candidates.sort((a, b) => b.score - a.score).slice(0, input.take ?? 3),
    considered: all.length,
    droppedForAge: dropped.length,
  };
}
