// Planner agent tools (ARCHITECTURE.md §4). Every Qloo entity a tool returns
// is recorded in ctx.seen; the plan validator only accepts refs from there.
// Age-fit filtering happens inside the tools, so the model never sees
// unsuitable items at all.
import type Anthropic from "@anthropic-ai/sdk";
import { and, eq, gte } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { addWeeks } from "@/lib/dates";
import { discoverNextInterests } from "@/lib/discovery/next-interests";
import { getDrc } from "@/lib/drc";
import { getEngagement } from "@/lib/engagement/load";
import type { EngagementReport } from "@/lib/engagement/score";
import type { MemoryStore } from "@/lib/memory";
import type { QlooRef } from "@/lib/plan/schema";
import { filterAgeFit } from "@/lib/safety/age-fit";
import type { QlooSource } from "@/lib/qloo/source";
import { ENTITY_TYPES, type EntityTypeKey, type QlooEntity } from "@/lib/qloo/types";

export type ChildRow = typeof schema.children.$inferSelect;
export type InterestRow = typeof schema.interests.$inferSelect;

export type ToolContext = {
  child: ChildRow;
  interests: InterestRow[];
  qloo: QlooSource;
  memory: MemoryStore;
  now: Date;
  seen: Map<string, QlooRef>;
  engagement?: EngagementReport;
};

type ToolDef<S extends z.ZodType> = {
  name: string;
  description: string;
  input: S;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown>;
};

const tool = <S extends z.ZodType>(t: ToolDef<S>) => t;

const brief = (e: QlooEntity) => ({
  entityId: e.entityId,
  name: e.name,
  type: e.types[0]?.replace("urn:entity:", ""),
  year: e.year,
  tags: e.tags.slice(0, 4).map((t) => t.name),
});

function remember(ctx: ToolContext, entities: QlooEntity[]) {
  for (const e of entities) {
    if (!ctx.seen.has(e.entityId)) ctx.seen.set(e.entityId, { entityId: e.entityId, name: e.name, type: e.types[0] ?? "" });
  }
}

async function engagement(ctx: ToolContext) {
  ctx.engagement ??= await getEngagement(ctx.child.id, ctx.now);
  return ctx.engagement;
}

// Entities to keep out of suggestions: the child's interests and anything
// used in the last 8 weeks of plans.
async function triedEntityIds(ctx: ToolContext): Promise<string[]> {
  const db = await getDb();
  const since = addWeeks(ctx.now.toISOString().slice(0, 10), -8);
  const rows = await db
    .select({ refs: schema.missions.qlooRefs, json: schema.plans.json })
    .from(schema.missions)
    .innerJoin(schema.plans, eq(schema.missions.planId, schema.plans.id))
    .where(and(eq(schema.plans.childId, ctx.child.id), gte(schema.plans.weekStart, since)));
  const fromMissions = rows.flatMap((r) => r.refs.map((x) => x.entityId));
  const fromInterests = ctx.interests.flatMap((i) => (i.qlooEntityId ? [i.qlooEntityId] : []));
  return [...new Set([...fromMissions, ...fromInterests])];
}

async function entityIdFor(ctx: ToolContext, label: string): Promise<string | null> {
  const known = ctx.interests.find((i) => i.label.toLowerCase() === label.toLowerCase());
  if (known?.qlooEntityId) return known.qlooEntityId;
  const hit = await ctx.qloo.resolve(label);
  if (hit) remember(ctx, [hit]);
  return hit?.entityId ?? null;
}

const TypeKey = z.enum(["book", "tv_show", "video_game", "movie", "artist"]);

export const TOOLS = [
  tool({
    name: "get_child_profile",
    description:
      "The child's nickname, age, interests (with status and how long they've had each) and their school card results for the last 5 school days. A 'dormant' interest is resting after fading; when retryDue is true, include exactly one short probe mission for it. Call this first.",
    input: z.object({}),
    run: async (ctx) => {
      const thisWeek = ctx.now.toISOString().slice(0, 10);
      const card = await getDrc(ctx.child.id, ctx.now);
      return {
        nickname: ctx.child.nickname,
        age: ctx.child.ageYears,
        schoolCard: card.targets.length
          ? {
              last5SchoolDays: card.targets.map((t) => {
                const vals = card.days.map((d) => d.entries[t.id]).filter((v) => v !== undefined);
                return { target: t.text, met: vals.filter(Boolean).length, of: vals.length };
              }),
              homeReward: card.reward?.rewardText ?? null,
            }
          : null,
        interests: ctx.interests.map((i) => ({
          label: i.label,
          status: i.status,
          since: i.startedAt,
          hasTasteData: Boolean(i.qlooEntityId),
          ...(i.status === "dormant" && { restingUntil: i.resurfaceOn, retryDue: !!i.resurfaceOn && i.resurfaceOn <= thisWeek }),
        })),
      };
    },
  }),

  tool({
    name: "get_engagement",
    description:
      "Engagement from what the adult logged, up to 8 finished weeks (break weeks skipped): minutes per interest for the last 3 active weeks, % change, state (fading / holding / dipping / trial / insufficient) with the evidence behind it, and which mission formats work or should be avoided. Numbers are exact; quote them, don't recompute.",
    input: z.object({}),
    run: async (ctx) => {
      const r = await engagement(ctx);
      return {
        evaluatedWeek: r.weekStart,
        breakWeeks: r.pausedWeeks,
        interests: r.interests.map((i) => ({
          label: i.label,
          minutesByWeek: i.minutes.map((m) => m.minutes),
          changePct: i.changePct,
          state: i.state,
          confidence: i.confidence,
          evidence: {
            sustainedDropInTimePerMission: i.signals.sustainedDrop,
            completionDropProbability: i.signals.completionDropProb,
            negativeNote: i.signals.negativeNote,
            activeWeeks: i.activeWeeks,
          },
        })),
        restingInterests: r.dormant,
        formatsThatWork: r.formatsThatWork,
        formatsToAvoid: r.formatsToAvoid,
      };
    },
  }),

  tool({
    name: "recall_memory",
    description:
      "Search what the adult has logged and noted about this child (finished/skipped missions, hard moments, likes, dislikes). Ask focused questions, e.g. 'what caused frustration', 'which reading tasks got finished'.",
    input: z.object({ query: z.string().min(3).max(200) }),
    run: async (ctx, { query }) => ({ memories: await ctx.memory.recall(ctx.child.id, query, 10) }),
  }),

  tool({
    name: "resolve_interest",
    description: "Look up a new interest name in Qloo (e.g. a game, show, book or character the adult mentions).",
    input: z.object({ name: z.string().min(1).max(80) }),
    run: async (ctx, { name }) => {
      const hits = await ctx.qloo.search(name, 5);
      remember(ctx, hits);
      return { matches: hits.map(brief) };
    },
  }),

  tool({
    name: "expand_interests",
    description:
      "Ask Qloo's taste graph what fans of these interests also love, per type. Use 'book' for the reading list, 'artist' for the focus playlist, and games/shows/movies for mission hooks and the weekend activity. Results are already filtered for the child's age and exclude things already tried. Only items returned here (or by find_next_interests / resolve_interest) may be recommended.",
    input: z.object({
      interests: z.array(z.string()).min(1).max(4).describe("interest labels, e.g. ['cricket', 'LEGO']"),
      types: z.array(TypeKey).min(1).max(5),
      take: z.number().int().min(3).max(15).optional(),
    }),
    run: async (ctx, { interests, types, take }) => {
      const ids = (await Promise.all(interests.map((l) => entityIdFor(ctx, l)))).filter((x): x is string => !!x);
      if (!ids.length) return { error: "None of these interests could be found in Qloo. Try resolve_interest." };
      const exclude = await triedEntityIds(ctx);
      const out: Record<string, unknown> = {};
      for (const t of types as EntityTypeKey[]) {
        const raw = await ctx.qloo.insights({ filterType: ENTITY_TYPES[t], entityIds: ids, excludeEntityIds: exclude, take: take ?? 8 });
        const { kept, dropped } = await filterAgeFit(raw, ctx.child.ageYears);
        remember(ctx, kept);
        out[t] = { items: kept.map(brief), droppedForAge: dropped.length };
      }
      return out;
    },
  }),

  tool({
    name: "find_next_interests",
    description:
      "When an interest is fading, find adjacent interests to try next: Qloo groups what fans of the fading AND still-holding interests love by shared taste tags, filtered for age and novelty, scored by fit with formats that work. Returns up to 3 candidates, each with a tag, example entities and which current interests it bridges. Call after get_engagement.",
    input: z.object({}),
    run: async (ctx) => {
      const r = await engagement(ctx);
      const pick = (state: string) =>
        r.interests
          .filter((i) => i.state === state)
          .flatMap((i) => {
            const row = ctx.interests.find((x) => x.id === i.id);
            return row?.qlooEntityId ? [{ label: i.label, entityId: row.qlooEntityId }] : [];
          });
      const fading = pick("fading");
      if (!fading.length) return { candidates: [], note: "No interest is fading this week." };
      const res = await discoverNextInterests({
        qloo: ctx.qloo,
        age: ctx.child.ageYears,
        fading,
        holding: pick("holding"),
        excludeEntityIds: await triedEntityIds(ctx),
        formatsThatWork: r.formatsThatWork,
      });
      res.candidates.forEach((c) => remember(ctx, c.entities));
      return {
        fading: fading.map((f) => f.label),
        candidates: res.candidates.map((c) => ({
          tasteTag: c.tag.name,
          bridges: c.sharedWith,
          score: Number(c.score.toFixed(2)),
          examples: c.entities.map(brief),
        })),
        considered: res.considered,
        droppedForAge: res.droppedForAge,
      };
    },
  }),
] as const;

export type ToolName = (typeof TOOLS)[number]["name"];

// JSON Schema for the API, from the same Zod schemas we validate with.
export function toolParams(): Anthropic.Beta.BetaTool[] {
  return TOOLS.map((t) => {
    const schema = { ...(z.toJSONSchema(t.input) as Record<string, unknown>) };
    delete schema.$schema;
    return {
      name: t.name,
      description: t.description,
      input_schema: { ...schema, type: "object" } as Anthropic.Beta.BetaTool.InputSchema,
    };
  });
}

export async function runTool(ctx: ToolContext, name: string, input: unknown): Promise<{ ok: boolean; result: unknown }> {
  const t = TOOLS.find((x) => x.name === name);
  if (!t) return { ok: false, result: { error: `Unknown tool ${name}` } };
  const parsed = t.input.safeParse(input);
  if (!parsed.success) return { ok: false, result: { error: "Invalid input", issues: parsed.error.issues } };
  try {
    // Each tool's run matches its own schema; TS can't correlate the union.
    return { ok: true, result: await (t.run as (c: ToolContext, i: unknown) => Promise<unknown>)(ctx, parsed.data) };
  } catch (err) {
    return { ok: false, result: { error: err instanceof Error ? err.message : String(err) } };
  }
}
