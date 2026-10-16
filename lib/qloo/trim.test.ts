import { describe, expect, it } from "vitest";

import { extractEntities } from "./trim";

// Shapes seen on the live hackathon API (Phase 0, 2026-10-16).
describe("trim", () => {
  it("insights: the real type is in subtype, not type", () => {
    const [e] = extractEntities({
      results: { entities: [{ name: "Coraline", entity_id: "abc", type: "urn:entity", subtype: "urn:entity:book", properties: {} }] },
    });
    expect(e.types[0]).toBe("urn:entity:book");
  });

  it("search: types list, most specific first", () => {
    const [e] = extractEntities({ results: [{ name: "Minecraft", entity_id: "m", types: ["urn:entity", "urn:entity:brand"] }] });
    expect(e.types[0]).toBe("urn:entity:brand");
  });
});
