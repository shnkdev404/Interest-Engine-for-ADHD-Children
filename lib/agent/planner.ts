// Planner agent: a manual Claude tool-use loop (D-04). Manual rather than the
// SDK tool runner because we need the full history for repair turns, a hard
// cap on tool calls, and the per-run set of Qloo entities for grounding.
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";

import { getDb, schema } from "@/db";
import { mondayOf } from "@/lib/dates";
import { getAnthropic, PLANNER_MODEL } from "@/lib/llm/client";
import { getMemory } from "@/lib/memory";
import { checkGrounding, extractJson, WeeklyPlan, type QlooRef } from "@/lib/plan/schema";
import { getQloo } from "@/lib/qloo/source";
import { lintValue } from "@/lib/safety/lint";

import { PLANNER_SYSTEM, plannerRequest } from "./prompts";
import { runTool, toolParams, type ToolContext } from "./tools";

export const LIMITS = { maxToolCalls: 12, maxRepairs: 1, deadlineMs: 45_000 /* + offline fallback fits Vercel's 60 s */ } as const;

export type ToolCallLog = { name: string; ms: number; ok: boolean };

export type PlannerResult = {
  plan: WeeklyPlan;
  model: string;
  toolCalls: ToolCallLog[];
  repairs: number;
  usage: { input: number; output: number; cacheRead: number };
  qlooMode: "live" | "mock";
  memoryMode: "hindsight" | "local";
};

export class PlannerError extends Error {}

// Server-side fallback on safety declines: Claude API only, "default" form
// for Sonnet 5.5 (see claude-api skill). Disable with PLANNER_FALLBACKS=off
// on platforms that don't support it.
const fallbackParams = (): Pick<Anthropic.Beta.MessageCreateParamsNonStreaming, "betas" | "fallbacks"> =>
  process.env.PLANNER_FALLBACKS === "off" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

export async function generatePlan(o: {
  childId: string;
  adultRequest?: string;
  now?: Date;
  signal?: AbortSignal;
  // Injected in tests; defaults to the real client.
  client?: Pick<Anthropic, "beta">;
}): Promise<PlannerResult> {
  const db = await getDb();
  const child = await db.query.children.findFirst({ where: eq(schema.children.id, o.childId) });
  if (!child) throw new PlannerError(`Child ${o.childId} not found`);
  const interests = await db.select().from(schema.interests).where(eq(schema.interests.childId, child.id));

  const now = o.now ?? new Date();
  const weekStart = mondayOf(now);
  const [qloo, memory] = await Promise.all([getQloo(), getMemory()]);
  const ctx: ToolContext = { child, interests, qloo, memory, now, seen: new Map<string, QlooRef>() };

  const client = o.client ?? getAnthropic();
  const tools = toolParams();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: plannerRequest({ nickname: child.nickname, age: child.ageYears, weekStart, adultRequest: o.adultRequest }) },
  ];
  const toolCalls: ToolCallLog[] = [];
  const usage = { input: 0, output: 0, cacheRead: 0 };
  let repairs = 0;

  const deadline = AbortSignal.timeout(LIMITS.deadlineMs);
  const signal = o.signal ? AbortSignal.any([o.signal, deadline]) : deadline;

  for (;;) {
    const response = await client.beta.messages.create(
      {
        model: PLANNER_MODEL,
        max_tokens: 16000,
        system: PLANNER_SYSTEM,
        tools,
        messages,
        cache_control: { type: "ephemeral" },
        output_config: { effort: "medium" },
        ...fallbackParams(),
      },
      { signal },
    );
    usage.input += response.usage.input_tokens;
    usage.output += response.usage.output_tokens;
    usage.cacheRead += response.usage.cache_read_input_tokens ?? 0;

    if (response.stop_reason === "refusal") {
      throw new PlannerError(`The model declined to plan (${response.stop_details?.category ?? "no category"}).`);
    }
    if (response.stop_reason === "max_tokens") throw new PlannerError("Plan was cut off at max_tokens.");

    // Always append the full content: thinking blocks must go back unchanged.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "pause_turn") continue;

    if (response.stop_reason === "tool_use") {
      const uses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      // Reserve budget before running in parallel; a counter bumped on
      // completion would let a whole parallel batch through.
      const allowed = Math.max(0, LIMITS.maxToolCalls - toolCalls.length);
      const ran = await Promise.all(
        uses.map(async (u, i) => {
          if (i >= allowed) return null;
          const started = Date.now();
          const { ok, result } = await runTool(ctx, u.name, u.input);
          return { log: { name: u.name, ms: Date.now() - started, ok }, result };
        }),
      );
      const results = uses.map((u, i): Anthropic.Beta.BetaToolResultBlockParam => {
        const r = ran[i];
        if (!r) {
          return {
            type: "tool_result",
            tool_use_id: u.id,
            is_error: true,
            content: "Tool budget used up. Write the plan now from what you have.",
          };
        }
        toolCalls.push(r.log); // in call order
        return { type: "tool_result", tool_use_id: u.id, is_error: !r.log.ok, content: JSON.stringify(r.result) };
      });
      // All results for one turn go back in a single user message.
      messages.push({ role: "user", content: results });
      continue;
    }

    // end_turn: validate the plan.
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const problems = validate(text, ctx);
    if (problems.ok) {
      return {
        plan: problems.plan,
        model: response.model,
        toolCalls,
        repairs,
        usage,
        qlooMode: qloo.mode,
        memoryMode: memory.mode,
      };
    }
    if (repairs >= LIMITS.maxRepairs) {
      throw new PlannerError(`Plan failed validation after ${repairs} repair(s):\n- ${problems.errors.join("\n- ")}`);
    }
    repairs++;
    messages.push({
      role: "user",
      content: `The plan didn't pass validation. Fix these and return the full JSON again (use tools if you need more Qloo results):\n- ${problems.errors.join("\n- ")}`,
    });
  }
}

type Validation = { ok: true; plan: WeeklyPlan } | { ok: false; errors: string[] };

function validate(text: string, ctx: ToolContext): Validation {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch (err) {
    return { ok: false, errors: [`Response was not valid JSON: ${err instanceof Error ? err.message : err}`] };
  }
  const parsed = WeeklyPlan.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "$"}: ${i.message}`) };
  }
  const fading = ctx.engagement?.interests.some((i) => i.state === "fading") ?? false;
  const errors = [
    ...checkGrounding(parsed.data, ctx.seen, { requireNextInterests: fading }),
    ...lintValue(parsed.data).map((h) => `${h.path}: remove the word "${h.word}"`),
  ];
  return errors.length ? { ok: false, errors } : { ok: true, plan: parsed.data };
}
