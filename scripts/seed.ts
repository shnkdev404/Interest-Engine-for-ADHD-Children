/**
 * Loads the Arjun demo persona (db/seed/arjun.ts) into Postgres and memory.
 *
 *   npm run db:seed
 *
 * Uses DATABASE_URL if set, else local PGlite in .data/; Hindsight if
 * HINDSIGHT_URL is set, else the local memory fallback; mock Qloo unless a
 * key is present (only for resolving interest entity ids).
 */
import { usingLocalDb } from "../db";
import { ARJUN } from "../db/seed/arjun";
import { seedArjun } from "../db/seed/load";
import { getEngagement } from "../lib/engagement/load";
import { getMemory } from "../lib/memory";

async function main() {
  const { child, logs, evaluated, memoryMode, qlooMode } = await seedArjun();
  const memory = await getMemory();

  // Read back through the same path the app uses, to prove the story holds.
  const report = await getEngagement(child.id);
  for (const i of report.interests) {
    console.log(`  ${i.label}: ${i.minutes.map((m) => m.minutes).join(" → ")} min, ${i.changePct ?? "n/a"}% → ${i.state}`);
  }
  console.log(`  formats that work: ${report.formatsThatWork.join(", ")}; avoid: ${report.formatsToAvoid.join(", ")}`);
  const recalled = await memory.recall(child.id, "what made Arjun bored or upset", 3);
  console.log(`  memory recall: ${recalled.map((r) => JSON.stringify(r.text)).join(" | ")}`);

  console.log(
    `Seeded ${child.nickname} (${child.id}): ${ARJUN.interests.length} interests, 3 weeks, ${logs} logged missions.\n` +
      `DB: ${usingLocalDb() ? "local PGlite (.data/pglite)" : "DATABASE_URL"} · memory: ${memoryMode} · Qloo: ${qlooMode} · evaluated week: ${evaluated}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
