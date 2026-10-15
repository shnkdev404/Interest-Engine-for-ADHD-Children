import { describe, expect, it } from "vitest";

import { lintValue } from "./lint";

describe("wording lint", () => {
  it("finds banned words anywhere in a nested value, with a path", () => {
    const hits = lintValue({ a: "Fun times", b: [{ c: "Not a Therapy session" }] });
    expect(hits).toEqual([{ path: "$.b[0].c", word: "therapy", text: "Not a Therapy session" }]);
  });

  it("allows 'treat' as a reward but not 'treatment'", () => {
    expect(lintValue("Earn a treat after the mission")).toHaveLength(0);
    expect(lintValue("A treatment plan")).toHaveLength(1);
  });

  it("matches whole words only", () => {
    expect(lintValue("Secure the curtains")).toHaveLength(0); // contains "cure" inside a word
  });

  it("keeps ADHD out of plan output", () => {
    expect(lintValue("Great for ADHD kids").map((h) => h.word)).toEqual(["adhd"]);
  });
});
