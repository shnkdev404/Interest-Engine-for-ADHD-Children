// Age-fit filter (DESIGN.md §6, D-11): every Qloo item passes this before the
// agent sees it. Rules first; a batched Haiku check for whatever rules can't
// decide. Results are cached per (entity, age band).
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { CLASSIFIER_MODEL, getAnthropic, hasAnthropicCredentials } from "@/lib/llm/client";
import type { QlooEntity } from "@/lib/qloo/types";

export type AgeBand = "5-7" | "8-10" | "11-13";
export const ageBand = (age: number): AgeBand => (age <= 7 ? "5-7" : age <= 10 ? "8-10" : "11-13");

export type Fit = "yes" | "no" | "unsure";
export type FitResult = { entityId: string; fit: Fit; reason: string; by: "rules" | "model" | "curated" };

const ADULT_RATINGS = new Set(["R", "NC-17", "TV-MA", "M", "AO", "18", "18+", "X"]);
const ADULT_CUES =
  /\b(erotic|explicit|sexual|sex|nudity|gore|slasher|drugs?|serial killer|r-rated|mature audiences)\b/i;
const KID_CUES =
  /\b(children's|kids?|family|preschool|picture book|middle grade|juvenile|young readers?|animated|animation)\b/i;

export function ruleFit(e: QlooEntity): FitResult | null {
  const text = [e.name, e.description ?? "", ...e.tags.map((t) => t.name)].join(" ");
  if (e.contentRating && ADULT_RATINGS.has(e.contentRating.toUpperCase())) {
    return { entityId: e.entityId, fit: "no", reason: `rated ${e.contentRating}`, by: "rules" };
  }
  if (ADULT_CUES.test(text)) return { entityId: e.entityId, fit: "no", reason: "adult content cue", by: "rules" };
  if (KID_CUES.test(text)) return { entityId: e.entityId, fit: "yes", reason: "children's/family cue", by: "rules" };
  return null;
}

const cache = new Map<string, FitResult>();

const Verdicts = z.object({
  items: z.array(
    z.object({
      entityId: z.string(),
      fit: z.enum(["yes", "no", "unsure"]),
      reason: z.string(),
    }),
  ),
});

async function modelFit(items: QlooEntity[], age: number): Promise<FitResult[]> {
  const list = items
    .map((e) => `- ${e.entityId} | ${e.types.join(",")} | ${e.name}${e.year ? ` (${e.year})` : ""}${e.description ? ` — ${e.description.slice(0, 160)}` : ""}`)
    .join("\n");
  const res = await getAnthropic().messages.parse({
    model: CLASSIFIER_MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Verdicts) },
    system:
      "You check whether books, shows, games, films and music are suitable for a child of a given age, " +
      "for a parent choosing activities. Judge content (violence, sexual content, horror, language, themes), " +
      "not reading level. Answer 'unsure' if you don't recognise the item.",
    messages: [{ role: "user", content: `Child's age: ${age}.\nItems:\n${list}` }],
  });
  const verdicts = res.parsed_output?.items ?? [];
  return items.map((e) => {
    const v = verdicts.find((x) => x.entityId === e.entityId);
    return v
      ? { entityId: e.entityId, fit: v.fit, reason: v.reason, by: "model" as const }
      : { entityId: e.entityId, fit: "unsure" as const, reason: "not classified", by: "model" as const };
  });
}

export type AgeFitOutcome = { kept: QlooEntity[]; dropped: { entity: QlooEntity; reason: string }[] };

export async function filterAgeFit(entities: QlooEntity[], age: number): Promise<AgeFitOutcome> {
  const band = ageBand(age);
  const results = new Map<string, FitResult>();
  const pending: QlooEntity[] = [];

  for (const e of entities) {
    const key = `${e.entityId}:${band}`;
    const cached = cache.get(key);
    if (cached) results.set(e.entityId, cached);
    else if (e.entityId.startsWith("mock:")) {
      // The mock catalog is hand-picked children's/family titles.
      results.set(e.entityId, { entityId: e.entityId, fit: "yes", reason: "curated mock catalog", by: "curated" });
    } else {
      const r = ruleFit(e);
      if (r?.fit === "no") results.set(e.entityId, r);
      else pending.push(e); // rules can clear adult items but not vouch for kids' ones
    }
  }

  if (pending.length) {
    let verdicts: FitResult[];
    if (hasAnthropicCredentials()) {
      try {
        verdicts = await modelFit(pending, age);
      } catch {
        verdicts = pending.map((e) => ruleFit(e) ?? { entityId: e.entityId, fit: "unsure", reason: "classifier unavailable", by: "rules" });
      }
    } else {
      // Without the classifier, live artists still pass: they arrive through the
      // instrumental-only kid lens (lib/qloo/source.ts), so lyrics aren't a risk.
      verdicts = pending.map(
        (e) =>
          ruleFit(e) ??
          (e.types[0] === "urn:entity:artist"
            ? { entityId: e.entityId, fit: "yes", reason: "instrumental focus music (kid lens)", by: "rules" }
            : { entityId: e.entityId, fit: "unsure", reason: "no classifier configured", by: "rules" }),
      );
    }
    for (const v of verdicts) {
      results.set(v.entityId, v);
      cache.set(`${v.entityId}:${band}`, v);
    }
  }

  // 'unsure' is dropped for under-10s (DESIGN.md §6).
  const keep = (r: FitResult) => r.fit === "yes" || (r.fit === "unsure" && age >= 10);
  const kept: QlooEntity[] = [];
  const dropped: AgeFitOutcome["dropped"] = [];
  for (const e of entities) {
    const r = results.get(e.entityId)!;
    if (keep(r)) kept.push(e);
    else dropped.push({ entity: e, reason: r.reason });
  }
  return { kept, dropped };
}
