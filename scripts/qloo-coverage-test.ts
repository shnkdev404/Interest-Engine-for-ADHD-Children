/**
 * Phase 0 go/no-go: does Qloo return kid-relevant results for kids' interests?
 * See docs/PLAN.md §5 and DECISIONS.md D-10.
 *
 *   npm run qloo:coverage
 *   npm run qloo:coverage -- --interests "Minecraft,cricket" --take 10
 *   npm run qloo:coverage -- --age 24_and_younger   # also compare an age-band variant
 *   npm run qloo:coverage -- --dry-run              # print requests, no API calls
 *
 * Writes reports/qloo-coverage-<timestamp>.{md,json}. reports/ is git-ignored:
 * Qloo data must never be committed to the public repo.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

import { QlooError, qlooFromEnv } from "../lib/qloo/client";
import {
  ENTITY_TYPES,
  type EntityTypeKey,
  type QlooEntity,
} from "../lib/qloo/types";

// Interest → the entity type we expect /search to resolve it to. Sports and
// topics have no natural type, so we take the best match and record it.
const DEFAULT_INTERESTS: { label: string; prefer?: EntityTypeKey }[] = [
  { label: "Minecraft", prefer: "video_game" },
  { label: "cricket" },
  { label: "dinosaurs" },
  { label: "Pokémon", prefer: "tv_show" },
  { label: "Bluey", prefer: "tv_show" },
  { label: "LEGO" },
  { label: "Roblox", prefer: "video_game" },
  { label: "Harry Potter", prefer: "book" },
  { label: "football" },
  { label: "space" },
];

const ADULT_RATINGS = new Set(["R", "NC-17", "TV-MA", "M", "AO", "18", "18+", "X"]);
const ADULT_CUES =
  /\b(erotic|explicit|sex|sexual|nudity|horror|gore|slasher|drugs?|mature|adult|serial killer|crime thriller|r-rated)\b/i;
const KID_CUES =
  /\b(child|children|children's|kids?|family|animated|animation|middle grade|picture book|preschool|young readers?|juvenile)\b/i;

type Flag = "adult" | "kid" | "none";

function flagEntity(e: QlooEntity): Flag {
  const text = [e.name, e.description ?? "", ...e.tags.map((t) => t.name)].join(" ");
  if ((e.contentRating && ADULT_RATINGS.has(e.contentRating.toUpperCase())) || ADULT_CUES.test(text)) {
    return "adult";
  }
  return KID_CUES.test(text) ? "kid" : "none";
}

type TypeResult = {
  type: EntityTypeKey;
  count: number;
  adult: number;
  kid: number;
  entities: (QlooEntity & { flag: Flag })[];
  error?: string;
  ageVariant?: { count: number; overlap: number; adult: number; kid: number };
};

type InterestResult = {
  label: string;
  resolved?: QlooEntity;
  candidates: QlooEntity[];
  error?: string;
  types: TypeResult[];
  autoVerdict: "likely-pass" | "check" | "fail";
};

const { values } = parseArgs({
  options: {
    interests: { type: "string" },
    types: { type: "string" },
    take: { type: "string", default: "10" },
    age: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
});

const take = Number(values.take);
const dryRun = values["dry-run"];
const typeKeys = (values.types?.split(",").map((s) => s.trim()) ??
  Object.keys(ENTITY_TYPES)) as EntityTypeKey[];
for (const t of typeKeys) {
  if (!(t in ENTITY_TYPES)) throw new Error(`Unknown type "${t}". Use: ${Object.keys(ENTITY_TYPES).join(", ")}`);
}
const interests = values.interests
  ? values.interests.split(",").map((label) => ({
      label: label.trim(),
      prefer: DEFAULT_INTERESTS.find((d) => d.label.toLowerCase() === label.trim().toLowerCase())?.prefer,
    }))
  : DEFAULT_INTERESTS;

const qloo = qlooFromEnv({
  dryRun,
  onRequest: dryRun ? (url) => console.log("GET", url) : undefined,
});

function pickCandidate(cands: QlooEntity[], prefer?: EntityTypeKey): QlooEntity | undefined {
  if (!prefer) return cands[0];
  const urn = ENTITY_TYPES[prefer];
  return cands.find((c) => c.types.includes(urn)) ?? cands[0];
}

async function runType(entityId: string, type: EntityTypeKey): Promise<TypeResult> {
  const base: TypeResult = { type, count: 0, adult: 0, kid: 0, entities: [] };
  try {
    const list = await qloo.insights({
      filterType: ENTITY_TYPES[type],
      entityIds: [entityId],
      excludeEntityIds: [entityId],
      take,
    });
    const entities = list.map((e) => ({ ...e, flag: flagEntity(e) }));
    const result: TypeResult = {
      ...base,
      count: entities.length,
      adult: entities.filter((e) => e.flag === "adult").length,
      kid: entities.filter((e) => e.flag === "kid").length,
      entities,
    };

    if (values.age) {
      const aged = await qloo.insights({
        filterType: ENTITY_TYPES[type],
        entityIds: [entityId],
        excludeEntityIds: [entityId],
        ageBand: values.age,
        take,
      });
      const ids = new Set(entities.map((e) => e.entityId));
      const flags = aged.map(flagEntity);
      result.ageVariant = {
        count: aged.length,
        overlap: aged.filter((e) => ids.has(e.entityId)).length,
        adult: flags.filter((f) => f === "adult").length,
        kid: flags.filter((f) => f === "kid").length,
      };
    }
    return result;
  } catch (err) {
    return { ...base, error: err instanceof Error ? err.message : String(err) };
  }
}

// Heuristic only. The real go/no-go is the hand-scored "Parent OK?" column.
function verdict(types: TypeResult[]): InterestResult["autoVerdict"] {
  const usable = types.filter((t) => t.count >= 5 && t.adult / Math.max(t.count, 1) <= 0.2);
  if (usable.length === types.length) return "likely-pass";
  if (usable.length === 0) return "fail";
  return "check";
}

async function runInterest(label: string, prefer?: EntityTypeKey): Promise<InterestResult> {
  try {
    const candidates = await qloo.search(label, 5);
    const resolved = dryRun ? ({ entityId: `<${label}-id>`, name: label, types: [], tags: [] } as QlooEntity) : pickCandidate(candidates, prefer);
    if (!resolved) return { label, candidates, types: [], autoVerdict: "fail", error: "No entity found by /search" };
    const types = await Promise.all(typeKeys.map((t) => runType(resolved.entityId, t)));
    return { label, resolved, candidates, types, autoVerdict: dryRun ? "check" : verdict(types) };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof QlooError && err.status === 401) {
      throw new Error(`${msg}\nCheck QLOO_BASE_URL is https://hackathon.api.qloo.com and the key is sent as X-Api-Key.`);
    }
    return { label, candidates: [], types: [], autoVerdict: "fail", error: msg };
  }
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function toMarkdown(results: InterestResult[], startedAt: Date): string {
  const lines: string[] = [];
  const passCount = results.filter((r) => r.autoVerdict === "likely-pass").length;
  lines.push(`# Qloo coverage test — ${startedAt.toISOString()}`, "");
  lines.push(
    `Settings: take=${take}, types=${typeKeys.join(", ")}${values.age ? `, age variant=${values.age}` : ""}.`,
    "",
    `**Auto verdict: ${passCount}/${results.length} interests likely pass** (≥5 results per type, ≤20% adult-flagged).`,
    "Go/no-go target (PLAN.md): ≥7/10 interests with 5+ age-appropriate results per type, confirmed by hand in the Parent OK? columns below.",
    "",
    "## Summary",
    "",
    `| Interest | Resolved to | Type | ${typeKeys.map((t) => `${t} (n / adult / kid)`).join(" | ")} | Auto verdict |`,
    `| --- | --- | --- | ${typeKeys.map(() => "---").join(" | ")} | --- |`,
  );
  for (const r of results) {
    const cells = typeKeys.map((t) => {
      const tr = r.types.find((x) => x.type === t);
      if (!tr) return "—";
      if (tr.error) return "error";
      return `${tr.count} / ${tr.adult} / ${tr.kid}`;
    });
    lines.push(
      `| ${esc(r.label)} | ${esc(r.resolved?.name ?? r.error ?? "—")} | ${esc(r.resolved?.types.join(", ") ?? "")} | ${cells.join(" | ")} | ${r.autoVerdict} |`,
    );
  }

  if (values.age) {
    lines.push("", `## Age variant (${values.age}) vs no age signal`, "", "| Interest | Type | n | Overlap with base | Adult | Kid |", "| --- | --- | --- | --- | --- | --- |");
    for (const r of results) for (const t of r.types) {
      if (t.ageVariant) lines.push(`| ${esc(r.label)} | ${t.type} | ${t.ageVariant.count} | ${t.ageVariant.overlap} | ${t.ageVariant.adult} | ${t.ageVariant.kid} |`);
    }
  }

  lines.push("", "## Detail (hand-score the Parent OK? column: y / n)", "");
  for (const r of results) {
    lines.push(`### ${r.label}`, "");
    if (r.error) lines.push(`Error: ${esc(r.error)}`, "");
    if (r.candidates.length) {
      lines.push(`Search candidates: ${r.candidates.map((c) => `${esc(c.name)} (${c.types.join(", ")})`).join("; ")}`, "");
    }
    for (const t of r.types) {
      lines.push(`**${t.type}**${t.error ? ` — error: ${esc(t.error)}` : ""}`, "");
      if (!t.entities.length) {
        if (!t.error) lines.push("_No results._", "");
        continue;
      }
      lines.push("| # | Name | Year | Rating | Flag | Top tags | Parent OK? |", "| --- | --- | --- | --- | --- | --- | --- |");
      t.entities.forEach((e, i) => {
        lines.push(
          `| ${i + 1} | ${esc(e.name)} | ${e.year ?? ""} | ${e.contentRating ?? ""} | ${e.flag === "none" ? "" : e.flag} | ${esc(e.tags.slice(0, 4).map((x) => x.name).join(", "))} | |`,
        );
      });
      lines.push("");
    }
  }
  return lines.join("\n");
}

async function main() {
  const startedAt = new Date();
  console.log(`Qloo coverage test: ${interests.length} interests × ${typeKeys.length} types, take=${take}${dryRun ? " (dry run)" : ""}`);

  const results: InterestResult[] = [];
  for (const { label, prefer } of interests) {
    process.stdout.write(`- ${label} … `);
    const r = await runInterest(label, prefer);
    results.push(r);
    const counts = r.types.map((t) => `${t.type}:${t.error ? "err" : t.count}`).join(" ");
    console.log(r.error ? `ERROR ${r.error}` : `${r.resolved?.name} → ${counts} [${r.autoVerdict}]`);
  }

  if (dryRun) return;

  const stamp = startedAt.toISOString().replace(/[:.]/g, "-");
  const dir = path.join(process.cwd(), "reports");
  await mkdir(dir, { recursive: true });
  const mdPath = path.join(dir, `qloo-coverage-${stamp}.md`);
  await writeFile(mdPath, toMarkdown(results, startedAt), "utf8");
  await writeFile(path.join(dir, `qloo-coverage-${stamp}.json`), JSON.stringify(results, null, 2), "utf8");

  const pass = results.filter((r) => r.autoVerdict === "likely-pass").length;
  console.log(`\nAuto verdict: ${pass}/${results.length} likely pass. Report: ${path.relative(process.cwd(), mdPath)}`);
  console.log("Next: hand-score the Parent OK? columns, then record the go/no-go in docs/DECISIONS.md (D-10).");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
