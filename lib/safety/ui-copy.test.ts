// UI copy follows the same no-medical-claims rule as generated text
// (DESIGN.md §8): scan every page and component source for banned words.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lintValue } from "./lint";

const ROOTS = ["app", "components"];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(tsx|ts)$/.test(name) ? [p] : [];
  });
}

describe("UI copy", () => {
  it("contains no medical or clinical wording", () => {
    const hits = ROOTS.flatMap((root) =>
      files(path.join(process.cwd(), root)).flatMap((f) =>
        lintValue(readFileSync(f, "utf8")).map((h) => `${path.relative(process.cwd(), f)}: "${h.word}"`),
      ),
    );
    expect(hits).toEqual([]);
  });
});
