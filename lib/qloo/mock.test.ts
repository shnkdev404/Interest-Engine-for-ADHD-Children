import { describe, expect, it } from "vitest";

import { mockQloo } from "./mock";
import { ENTITY_TYPES } from "./types";

describe("mock Qloo", () => {
  it("resolves interests to mock anchors first", async () => {
    const [m] = await mockQloo.search("Minecraft");
    expect(m.entityId).toBe("mock:minecraft");
  });

  it("returns only the requested type, never the signal itself", async () => {
    const books = await mockQloo.insights({
      filterType: ENTITY_TYPES.book,
      entityIds: ["mock:minecraft", "mock:cricket"],
      take: 5,
    });
    expect(books.length).toBeGreaterThan(0);
    expect(books.every((b) => b.types.includes(ENTITY_TYPES.book))).toBe(true);
    expect(books.some((b) => b.entityId === "mock:minecraft")).toBe(false);
  });

  it("honours exclusions", async () => {
    const all = await mockQloo.insights({ filterType: ENTITY_TYPES.video_game, entityIds: ["mock:minecraft"] });
    const first = all[0].entityId;
    const rest = await mockQloo.insights({
      filterType: ENTITY_TYPES.video_game,
      entityIds: ["mock:minecraft"],
      excludeEntityIds: [first],
    });
    expect(rest.some((e) => e.entityId === first)).toBe(false);
  });

  it("all ids are clearly marked as mock", async () => {
    const tags = await mockQloo.audienceTags(["mock:minecraft"]);
    expect(tags.every((t) => t.id.startsWith("mock:"))).toBe(true);
  });
});
