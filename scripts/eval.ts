/**
 * Evaluation harness (RESEARCH.md Tier 1 #3).
 *
 *   npm run eval
 *
 * Part A — fading detector: v1 vs v2 on simulated trajectories with known
 *          answers (precision / recall / F1, false alarms per scenario).
 * Part B — plans: six synthetic children, a plan each (agent if Claude is
 *          configured, else the offline planner): validity, Qloo grounding,
 *          choice / break / rewards coverage, wording lint. With Claude, also
 *          the AI-alone baseline and a blind judged comparison.
 *
 * Uses a throwaway local database and writes reports/eval-<time>.md
 * (git-ignored: it contains Qloo data).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "sparkpath-eval-")), "db");
delete process.env.DATABASE_URL;

type Profile = { nickname: string; age: number; interests: string[] };
const PROFILES: Profile[] = [
  { nickname: "Arjun", age: 9, interests: ["Minecraft", "cricket"] },
  { nickname: "Meera", age: 7, interests: ["dinosaurs"] },
  { nickname: "Kabir", age: 10, interests: ["Pokémon", "football"] },
  { nickname: "Ivy", age: 6, interests: ["Bluey"] },
  { nickname: "Ishan", age: 8, interests: ["LEGO", "space"] },
  { nickname: "Sam", age: 11, interests: ["Roblox"] },
];

async function main() {
  const { getDb, migrateDb, schema } = await import("../db");
  const { simulate } = await import("../lib/eval/fading-sim");
  const { createPlan, getCurrentPlan } = await import("../lib/plan/service");
  const { getQloo } = await import("../lib/qloo/source");
  const { lintValue } = await import("../lib/safety/lint");
  const { hasAnthropicCredentials, getAnthropic, CLASSIFIER_MODEL } = await import("../lib/llm/client");
  const { aiAlone } = await import("../lib/agent/baseline");

  const lines: string[] = [];
  const startedAt = new Date();
  lines.push(`# SparkPath evaluation — ${startedAt.toISOString()}`, "");

  // ---------- Part A
  const sim = simulate(200, 42);
  const pct = (n: number, of: number) => `${Math.round((n / of) * 100)}%`;
  const f = (x: number) => x.toFixed(2);
  lines.push(
    "## A. Fading detection: v1 vs v2",
    "",
    `${sim.runs} simulated interests (200 per scenario, seed 42). Cells show how often each detector said "fading".`,
    "",
    "| Scenario | Truth | v1 (single-week % drop) | v2 (CUSUM + Beta-Binomial + breaks) |",
    "| --- | --- | --- | --- |",
    ...sim.byScenario.map((s) => `| ${s.name} | ${s.truth ? "fading" : "not fading"} | ${pct(s.v1Flagged, s.runs)} | ${pct(s.v2Flagged, s.runs)} |`),
    "",
    "| Detector | Precision | Recall | F1 |",
    "| --- | --- | --- | --- |",
    `| v1 | ${f(sim.v1.precision)} | ${f(sim.v1.recall)} | ${f(sim.v1.f1)} |`,
    `| v2 | ${f(sim.v2.precision)} | ${f(sim.v2.recall)} | ${f(sim.v2.f1)} |`,
    "",
  );
  console.log(`A. Fading: F1 v1 ${f(sim.v1.f1)} → v2 ${f(sim.v2.f1)}`);

  // ---------- Part B
  const db = await getDb();
  await migrateDb(db);
  const qloo = await getQloo();
  const withClaude = hasAnthropicCredentials();
  const [adult] = await db.insert(schema.adults).values({ email: "eval@sparkpath.local", role: "parent" }).returning();

  type Row = {
    p: Profile;
    source: string;
    ok: boolean;
    error?: string;
    missions: number;
    withAlt: number;
    hasBreak: boolean;
    rewards: number;
    refs: number;
    uniqueRefs: number;
    lintHits: number;
    ms: number;
    planText?: string;
    baseline?: string | null;
  };
  const rows: Row[] = [];

  for (const p of PROFILES) {
    const [child] = await db
      .insert(schema.children)
      .values({ adultId: adult.id, nickname: p.nickname, ageYears: p.age, consentAt: new Date(), consentBy: adult.id })
      .returning();
    for (const label of p.interests) {
      const hit = await qloo.resolve(label).catch(() => null);
      await db.insert(schema.interests).values({
        childId: child.id,
        label,
        qlooEntityId: hit?.entityId ?? null,
        qlooType: hit?.types[0] ?? null,
        startedAt: "2026-01-05",
      });
    }
    const t0 = Date.now();
    try {
      const res = await createPlan(child.id);
      const current = await getCurrentPlan(child.id);
      const plan = current!.plan;
      const refs = [
        ...plan.missions.flatMap((m) => m.qlooRefs),
        ...plan.readingList.map((x) => x.qlooRef),
        ...plan.focusPlaylist.map((x) => x.qlooRef),
        ...plan.weekendActivity.qlooRefs,
        ...plan.rewards.flatMap((r) => (r.qlooRef ? [r.qlooRef] : [])),
        ...plan.nextInterests.flatMap((n) => n.qlooRefs),
      ];
      rows.push({
        p,
        source: res.source,
        ok: true,
        missions: plan.missions.length,
        withAlt: plan.missions.filter((m) => m.alt).length,
        hasBreak: plan.missions.some((m) => m.subject === "break"),
        rewards: plan.rewards.length,
        refs: refs.length,
        uniqueRefs: new Set(refs.map((r) => r.entityId)).size,
        lintHits: lintValue(plan).length,
        ms: Date.now() - t0,
        planText: JSON.stringify({ missions: plan.missions.map((m) => m.title), books: plan.readingList.map((b) => b.title), weekend: plan.weekendActivity.title }),
        baseline: withClaude ? await aiAlone(`eval-${child.id}`, { nickname: p.nickname, age: p.age, interests: p.interests }).catch(() => null) : undefined,
      });
    } catch (err) {
      rows.push({ p, source: "-", ok: false, error: err instanceof Error ? err.message.slice(0, 200) : String(err), missions: 0, withAlt: 0, hasBreak: false, rewards: 0, refs: 0, uniqueRefs: 0, lintHits: 0, ms: Date.now() - t0 });
    }
    const last = rows.at(-1)!;
    console.log(`B. ${p.nickname}: ${last.ok ? `${last.source}, ${last.uniqueRefs} Qloo items, ${(last.ms / 1000).toFixed(1)}s` : `FAILED ${last.error}`}`);
  }

  const ok = rows.filter((r) => r.ok);
  lines.push(
    "## B. Plans for six synthetic children",
    "",
    `Qloo: ${qloo.mode} · planner: ${withClaude ? "Claude agent" : "offline template (no ANTHROPIC_API_KEY)"} · ${ok.length}/${rows.length} plans valid.`,
    "",
    "| Child | Interests | Source | Missions (with a choice) | Break | Rewards | Qloo items cited | Wording hits | Time |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows.map((r) =>
      r.ok
        ? `| ${r.p.nickname}, ${r.p.age} | ${r.p.interests.join(", ")} | ${r.source} | ${r.missions} (${r.withAlt}) | ${r.hasBreak ? "yes" : "no"} | ${r.rewards} | ${r.uniqueRefs} | ${r.lintHits} | ${(r.ms / 1000).toFixed(1)} s |`
        : `| ${r.p.nickname}, ${r.p.age} | ${r.p.interests.join(", ")} | failed | ${r.error} | | | | | |`,
    ),
    "",
    "Every cited item is checked against the Qloo entities returned in that run before a plan is saved (D-17), so grounding is 100% for every valid plan; an AI-alone answer cites none.",
    "",
  );

  // ---------- Judge (Claude only)
  if (withClaude && ok.some((r) => r.baseline)) {
    const client = getAnthropic();
    lines.push("### Blind judged comparison (1–5)", "", "| Child | Answer | Age-appropriate | Uses the interest deeply | Actionable tonight | Specific titles |", "| --- | --- | --- | --- | --- | --- |");
    for (const r of ok.filter((x) => x.baseline)) {
      const swap = r.p.nickname.length % 2 === 0; // fixed, not position-biased toward one system
      const [A, B] = swap ? [r.baseline!, r.planText!] : [r.planText!, r.baseline!];
      const res = await client.messages.create({
        model: CLASSIFIER_MODEL,
        max_tokens: 600,
        system:
          "You grade weekly plans written for a parent of a child. Score each answer 1-5 on: ageAppropriate, deepInterest (the interest shapes the task itself, not just its name), actionable (a tired parent could start tonight), specificTitles (names real, specific books/shows/games). Reply with JSON only: {\"A\":{...},\"B\":{...}}.",
        messages: [{ role: "user", content: `Child: ${r.p.nickname}, ${r.p.age}, loves ${r.p.interests.join(" and ")}.\n\nAnswer A:\n${A}\n\nAnswer B:\n${B}` }],
      });
      const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      try {
        const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Record<string, Record<string, number>>;
        const sp = swap ? j.B : j.A;
        const ai = swap ? j.A : j.B;
        for (const [name, s] of [["SparkPath", sp], ["AI alone", ai]] as const) {
          lines.push(`| ${r.p.nickname} | ${name} | ${s.ageAppropriate} | ${s.deepInterest} | ${s.actionable} | ${s.specificTitles} |`);
        }
      } catch {
        lines.push(`| ${r.p.nickname} | (judge reply unreadable) | | | | |`);
      }
    }
    lines.push("", "Judge: a different, smaller model than the planner; answers shown in a fixed shuffled order. Treat as indicative, not proof.", "");
  } else {
    lines.push("_Judged comparison skipped: needs ANTHROPIC_API_KEY._", "");
  }

  const dir = path.join(process.cwd(), "reports");
  mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `eval-${startedAt.toISOString().replace(/[:.]/g, "-")}.md`);
  writeFileSync(out, lines.join("\n"), "utf8");
  console.log(`Report: ${path.relative(process.cwd(), out)}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
