/**
 * Prepares the demo: Qloo self-test, template Arjun with this week's plan,
 * Qloo cache for the teacher demo. Run after deploy and at the start of
 * each week (a Vercel cron also does this on Mondays).
 *
 *   npm run demo:prewarm
 */
import { migrateDb, usingLocalDb } from "../db";
import { hasAnthropicCredentials } from "../lib/llm/client";
import { getMemory } from "../lib/memory";
import { prewarm } from "../lib/prewarm";

async function main() {
  await migrateDb();
  console.log(
    `DB: ${usingLocalDb() ? "local PGlite" : "DATABASE_URL"} · memory: ${(await getMemory()).mode} · Claude: ${hasAnthropicCredentials() ? "yes" : "no (offline plans)"}`,
  );
  const r = await prewarm();
  console.log(`Qloo (${r.qlooMode}) self-test, results per type:`, r.selfTest);
  const empty = Object.entries(r.selfTest).filter(([, v]) => v === 0 || typeof v === "string");
  if (empty.length) console.warn(`  ⚠ empty or failing types: ${empty.map(([k]) => k).join(", ")}`);
  console.log(`Template plan: ${r.plan.source}${r.plan.notice ? ` (${r.plan.notice})` : ""}`);
  console.log(`Warmed classmates: ${r.warmedInterests.join(", ") || "none"}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
