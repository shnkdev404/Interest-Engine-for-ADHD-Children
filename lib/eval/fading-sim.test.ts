import { describe, expect, it } from "vitest";

import { simulate } from "./fading-sim";

describe("fading detector simulation", () => {
  const r = simulate(200, 42);
  const by = Object.fromEntries(r.byScenario.map((s) => [s.name, s]));
  const rate = (n: number, of: number) => n / of;

  it("prints the comparison", () => {
    console.table(
      r.byScenario.map((s) => ({
        scenario: s.name,
        truth: s.truth ? "fading" : "not fading",
        v1: `${Math.round(rate(s.v1Flagged, s.runs) * 100)}%`,
        v2: `${Math.round(rate(s.v2Flagged, s.runs) * 100)}%`,
      })),
    );
    console.log("v1", r.v1, "\nv2", r.v2);
  });

  it("v2 has a better F1 than v1", () => {
    expect(r.v2.f1).toBeGreaterThan(r.v1.f1);
  });

  it("v2 almost never flags a week the adult marked as a break", () => {
    expect(rate(by["sick week marked as break"].v2Flagged, 200)).toBeLessThan(0.02);
  });

  // ~11% at seed 42: the rest are runs where the week before was also noisy.
  it("v2 rarely flags a single bad week", () => {
    expect(rate(by["one bad week"].v2Flagged, by["one bad week"].runs)).toBeLessThan(0.15);
  });

  it("v2 catches most real declines", () => {
    expect(rate(by["gradual decline"].v2Flagged, 200)).toBeGreaterThan(0.6);
    expect(rate(by["sharp sustained drop"].v2Flagged, 200)).toBeGreaterThan(0.6);
  });
});
