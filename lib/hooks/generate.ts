// Teacher lesson hooks (UI_UX.md §4.4): one lesson, one hook per child, each
// built on that child's own interest and Qloo picks. A workflow, not an
// agent: context per child is gathered in code, then one structured Claude
// call writes all hooks. Offline templates cover a missing key or failure.
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { getEngagement } from "@/lib/engagement/load";
import type { Format } from "@/lib/engagement/score";
import { getAnthropic, hasAnthropicCredentials, PLANNER_MODEL } from "@/lib/llm/client";
import { getMemory } from "@/lib/memory";
import type { QlooRef } from "@/lib/plan/schema";
import { getQloo } from "@/lib/qloo/source";
import { ENTITY_TYPES } from "@/lib/qloo/types";
import { filterAgeFit } from "@/lib/safety/age-fit";
import { lintValue } from "@/lib/safety/lint";

export type Hook = {
  childId: string;
  nickname: string;
  interest: string;
  title: string;
  opener: string;
  activity: string;
  qlooRef: QlooRef | null;
  source: "agent" | "offline";
};

type ChildContext = {
  childId: string;
  nickname: string;
  age: number;
  interest: string;
  otherInterests: string[];
  formatsThatWork: Format[];
  formatsToAvoid: Format[];
  notes: string[];
  picks: QlooRef[];
};

const FORMAT_HINT: Partial<Record<Format, string>> = {
  short_mission: "in short 5-minute rounds",
  build: "by building or drawing it first",
  movement: "with a quick movement break between problems",
  reading_short: "using a short comic-style text",
};

async function gather(childIds: string[]): Promise<ChildContext[]> {
  const db = await getDb();
  const [qloo, memory] = await Promise.all([getQloo(), getMemory()]);
  const children = await db.select().from(schema.children).where(inArray(schema.children.id, childIds));
  const interests = await db.select().from(schema.interests).where(inArray(schema.interests.childId, childIds));

  return Promise.all(
    childIds.map(async (id) => {
      const child = children.find((c) => c.id === id)!;
      const mine = interests.filter((i) => i.childId === id && i.status !== "paused");
      const report = await getEngagement(id);
      const state = (iid: string) => report.interests.find((r) => r.id === iid)?.state;
      // Prefer an interest that isn't fading.
      const hook = mine.find((i) => state(i.id) !== "fading") ?? mine[0];

      let picks: QlooRef[] = [];
      if (hook?.qlooEntityId) {
        const lists = await Promise.all(
          (["video_game", "tv_show", "book"] as const).map((t) =>
            qloo.insights({ filterType: ENTITY_TYPES[t], entityIds: [hook.qlooEntityId!], take: 4 }).catch(() => []),
          ),
        );
        const { kept } = await filterAgeFit(lists.flat(), child.ageYears);
        picks = kept.slice(0, 6).map((e) => ({ entityId: e.entityId, name: e.name, type: e.types[0] ?? "" }));
      }
      const notes = (await memory.recall(id, "what caused frustration or hard moments, and what they liked", 6))
        .filter((m) => m.context === "adult_note")
        .slice(0, 3)
        .map((m) => m.text);

      return {
        childId: id,
        nickname: child.nickname,
        age: child.ageYears,
        interest: hook?.label ?? "their favourite things",
        otherInterests: mine.filter((i) => i !== hook).map((i) => i.label),
        formatsThatWork: report.formatsThatWork,
        formatsToAvoid: report.formatsToAvoid,
        notes,
        picks,
      };
    }),
  );
}

function offlineHook(c: ChildContext, topic: string): Hook {
  const t = topic.toLowerCase();
  const pick = c.picks[0] ?? null;
  const hint = c.formatsThatWork.map((f) => FORMAT_HINT[f]).find(Boolean);
  return {
    childId: c.childId,
    nickname: c.nickname,
    interest: c.interest,
    title: `${topic} with ${c.interest}`.slice(0, 60),
    opener: `Ask ${c.nickname}: "Where could you spot ${t} in ${pick?.name ?? c.interest}?"`,
    activity: `Turn the first three ${t} problems into ${c.interest}-themed challenges${hint ? `, ${hint}` : ""}.`,
    qlooRef: pick,
    source: "offline",
  };
}

const HooksOut = z.object({
  hooks: z.array(
    z.object({
      childId: z.string(),
      title: z.string().describe("max 60 characters"),
      opener: z.string().describe("one or two sentences the teacher says to start"),
      activity: z.string().describe("one or two sentences: the first task, themed"),
      qlooEntityId: z.string().nullable().describe("entityId of one listed pick it uses, or null"),
    }),
  ),
});

const SYSTEM = `You help a teacher hook each child into the same lesson through that child's own interest.
For every child listed, write one hook: a short title, an opener the teacher can say, and a first activity, all themed on the child's main interest.
- Keep the lesson content the same for everyone; only the theme changes.
- Use a pick from the child's list when it fits, and give its entityId; never mention a book, show or game that isn't in that child's list.
- Shape the activity around formats that work for the child and avoid the ones listed to avoid.
- Plain, kind classroom language. Never use medical or clinical words, and never guess at conditions.`;

async function agentHooks(
  ctx: ChildContext[],
  topic: string,
  minutes: number,
  client: Pick<Anthropic, "messages">,
): Promise<Hook[]> {
  const brief = ctx.map((c) => ({
    childId: c.childId,
    name: c.nickname,
    age: c.age,
    mainInterest: c.interest,
    otherInterests: c.otherInterests,
    formatsThatWork: c.formatsThatWork,
    formatsToAvoid: c.formatsToAvoid,
    notesFromHome: c.notes,
    picks: c.picks.map((p) => ({ entityId: p.entityId, name: p.name, type: p.type.replace("urn:entity:", "") })),
  }));
  const res = await client.messages.parse({
    model: PLANNER_MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(HooksOut) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Lesson: ${topic} (${minutes} minutes).\nChildren:\n${JSON.stringify(brief)}` }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("No hooks returned");

  return ctx.map((c) => {
    const h = res.parsed_output!.hooks.find((x) => x.childId === c.childId);
    if (!h) return offlineHook(c, topic);
    // Grounding: only this child's own picks may be cited.
    const ref = c.picks.find((p) => p.entityId === h.qlooEntityId) ?? null;
    const hook: Hook = {
      childId: c.childId,
      nickname: c.nickname,
      interest: c.interest,
      title: h.title.slice(0, 60),
      opener: h.opener.slice(0, 300),
      activity: h.activity.slice(0, 300),
      qlooRef: ref,
      source: "agent",
    };
    return lintValue([hook.title, hook.opener, hook.activity]).length ? offlineHook(c, topic) : hook;
  });
}

export async function generateLessonHooks(
  classId: string,
  topic: string,
  minutes: number,
  // client is injected in tests
  o: { preferOffline?: boolean; client?: Pick<Anthropic, "messages"> } = {},
) {
  const db = await getDb();
  const members = await db.select().from(schema.classChildren).where(eq(schema.classChildren.classId, classId));
  const ctx = await gather(members.map((m) => m.childId));

  let hooks: Hook[];
  let model = "offline-template";
  if (!o.preferOffline && (o.client || hasAnthropicCredentials())) {
    try {
      hooks = await agentHooks(ctx, topic, minutes, o.client ?? getAnthropic());
      model = PLANNER_MODEL;
    } catch {
      hooks = ctx.map((c) => offlineHook(c, topic));
    }
  } else {
    hooks = ctx.map((c) => offlineHook(c, topic));
  }

  const [row] = await db.insert(schema.lessons).values({ classId, topic, minutes, hooks, model }).returning();
  return { lessonId: row.id, hooks, model };
}
