// Wording lint (DESIGN.md §8, C4 "no medical claims"). Applied to every
// generated string and, in CI, to UI copy.
// Bare "treat" is deliberately absent: "earn a treat" is normal reward language.
export const BANNED_WORDS = [
  "treatment",
  "treatments",
  "therapy",
  "therapeutic",
  "diagnose",
  "diagnosis",
  "symptom",
  "symptoms",
  "cure",
  "clinical",
  "disorder",
  "medication",
  "prescribe",
  "adhd",
] as const;

const PATTERN = new RegExp(`\\b(${BANNED_WORDS.join("|")})\\b`, "gi");

export type LintHit = { path: string; word: string; text: string };

// Walks any JSON value and reports banned words with where they occur.
// "ADHD" is banned in plan output (allowed only in marketing copy).
export function lintValue(value: unknown, path = "$"): LintHit[] {
  if (typeof value === "string") {
    return [...value.matchAll(PATTERN)].map((m) => ({ path, word: m[0].toLowerCase(), text: value }));
  }
  if (Array.isArray(value)) return value.flatMap((v, i) => lintValue(v, `${path}[${i}]`));
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => lintValue(v, `${path}.${k}`));
  }
  return [];
}
