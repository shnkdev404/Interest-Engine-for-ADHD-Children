/**
 * Runs the planner agent for a child (default: the seeded Arjun).
 *
 *   npm run plan                       # full agent run (needs ANTHROPIC_API_KEY)
 *   npm run plan -- --save             # also store the plan + missions
 *   npm run plan -- --ask "more outdoor time this week"
 *   npm run plan -- --tools-only       # run every tool once, no LLM; shows what the agent sees
 */
import { eq } from "drizzle-orm";
import { parseArgs } from "node:util";

import { getDb, migrateDb, schema } from "../db";
import { generatePlan, PlannerError } from "../lib/agent/planner";
import { runTool, TOOLS, type ToolContext } from "../lib/agent/tools";
import { hasAnthropicCredentials, PLANNER_MODEL } from "../lib/llm/client";
import { getMemory } from "../lib/memory";
import type { QlooRef } from "../lib/plan/schema";
import { savePlan } from "../lib/plan/store";
import { getQloo } from "../lib/qloo/source";

const { values } = parseArgs({
  options: {
    child: { type: "string", default: "Arjun" },
    ask: { type: "string" },
    save: { type: "boolean", default: false },
    "tools-only": { type: "boolean", default: false },
  },
});

async function main() {
  const db = await getDb();
  await migrateDb(db);
  const child = await db.query.children.findFirst({ where: eq(schema.children.nickname, values.child!) });
  if (!child) throw new Error(`No child named ${values.child}. Run npm run db:seed first.`);

  if (values["tools-only"]) {
    const interests = await db.select().from(schema.interests).where(eq(schema.interests.childId, child.id));
    const ctx: ToolContext = {
      child, interests, qloo: await getQloo(), memory: await getMemory(), now: new Date(), seen: new Map<string, QlooRef>(),
    };
    const inputs: Record<string, unknown> = {
      recall_memory: { query: "what caused frustration or boredom" },
      resolve_interest: { name: "LEGO" },
      expand_interests: { interests: interests.map((i) => i.label), types: ["book", "artist", "video_game"], take: 5 },
    };
    for (const t of TOOLS) {
      const { ok, result } = await runTool(ctx, t.name, inputs[t.name] ?? {});
      console.log(`\n## ${t.name} ${ok ? "" : "(error)"}\n${JSON.stringify(result, null, 2)}`);
    }
    console.log(`\nQloo: ${ctx.qloo.mode} · memory: ${ctx.memory.mode} · entities the plan may cite: ${ctx.seen.size}`);
    return;
  }

  if (!hasAnthropicCredentials()) {
    throw new Error("ANTHROPIC_API_KEY is not set in .env.local. Use --tools-only to check the tools without the model.");
  }
  console.log(`Planning for ${child.nickname} with ${PLANNER_MODEL}…`);
  const started = Date.now();
  const res = await generatePlan({ childId: child.id, adultRequest: values.ask });
  console.log(JSON.stringify(res.plan, null, 2));
  console.log(
    `\n${((Date.now() - started) / 1000).toFixed(1)}s · ${res.model} · tools: ${res.toolCalls.map((t) => `${t.name}${t.ok ? "" : "!"}`).join(", ")}` +
      ` · repairs: ${res.repairs} · tokens in/out/cached: ${res.usage.input}/${res.usage.output}/${res.usage.cacheRead}` +
      ` · Qloo: ${res.qlooMode} · memory: ${res.memoryMode}`,
  );
  if (values.save) {
    const row = await savePlan(child.id, res.plan, res.model);
    console.log(`Saved plan ${row.id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof PlannerError ? `Planner: ${err.message}` : err);
    process.exit(1);
  });
