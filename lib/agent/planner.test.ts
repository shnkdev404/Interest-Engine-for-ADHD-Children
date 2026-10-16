// End-to-end planner loop with a scripted fake Claude: real tools, real
// scorer, mock Qloo, local memory, throwaway PGlite database.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type Anthropic from "@anthropic-ai/sdk";
import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "sparkpath-test-")), "db");
process.env.QLOO_MODE = "mock";
delete process.env.DATABASE_URL;
delete process.env.HINDSIGHT_URL;

type Turn = Partial<Anthropic.Beta.BetaMessage> & { content: Anthropic.Beta.BetaContentBlock[] };

const NOW = new Date("2026-10-16T10:00:00Z");
const ref = (entityId: string, name: string, type: string) => ({ entityId, name, type: `urn:entity:${type}` });

function plan(overrides: Record<string, unknown> = {}) {
  const mission = (title: string, interest: string, format: string) => ({
    title, subject: "maths", interest, format, estMinutes: 15,
    steps: ["Set up", "Do it", "Stamp the card"], qlooRefs: [],
  });
  return {
    weekStart: "2026-10-12",
    headline: "Cricket week, with a dash of building",
    missions: [
      mission("Stadium seating maths", "cricket", "build"),
      mission("Run-rate relay", "cricket", "movement"),
      mission("Kit check before bed", "cricket", "short_mission"),
      mission("Build a block bridge, count the bricks", "Minecraft", "build"),
      mission("Scoreboard sums", "cricket", "short_mission"),
      { ...mission("Bowling-action warm-up", "cricket", "movement"), subject: "break", estMinutes: 10 },
    ],
    readingList: [
      { title: "The Wild Robot", why: "Survival and building, short chapters", qlooRef: ref("mock:b:wild-robot", "The Wild Robot", "book") },
      { title: "Football School", why: "Sport facts in short bursts", qlooRef: ref("mock:b:football-school", "Football School: Where Football Explains the World", "book") },
      { title: "Diary of a Wimpy Kid", why: "Comic-style, quick to read", qlooRef: ref("mock:b:wimpy-kid", "Diary of a Wimpy Kid", "book") },
    ],
    focusPlaylist: [
      { title: "A. R. Rahman", why: "Cricket film scores", qlooRef: ref("mock:a:ar-rahman", "A. R. Rahman", "artist") },
      { title: "C418", why: "Calm building music", qlooRef: ref("mock:a:c418", "C418", "artist") },
      { title: "Joe Hisaishi", why: "Calm instrumental", qlooRef: ref("mock:a:hisaishi", "Joe Hisaishi", "artist") },
    ],
    weekendActivity: { title: "Backyard test match", why: "Cricket is holding strong", qlooRefs: [] },
    rewards: [
      { title: "A Lagaan scene", why: "Cricket film night, ten minutes", qlooRef: ref("mock:m:lagaan", "Lagaan", "movie") },
      { title: "15 minutes of cricket", why: "Still a favourite", qlooRef: null },
    ],
    nextInterests: [
      { label: "Building games", bridge: "Fans of Minecraft and cricket also love building sims", starterMission: "Plan a farm on graph paper", qlooRefs: [ref("mock:g:terraria", "Terraria", "video_game")] },
      { label: "Survival stories", bridge: "Adventure fans love The Wild Robot", starterMission: "Draw the robot's island map", qlooRefs: [ref("mock:b:wild-robot", "The Wild Robot", "book")] },
      { label: "Other team sports", bridge: "Cricket fans also like football games", starterMission: "Penalty shoot-out maths", qlooRefs: [ref("mock:g:rocket-league", "Rocket League", "video_game")] },
    ],
    ...overrides,
  };
}

const toolUse = (id: string, name: string, input: unknown): Anthropic.Beta.BetaContentBlock =>
  ({ type: "tool_use", id, name, input }) as Anthropic.Beta.BetaContentBlock;
const text = (t: string): Anthropic.Beta.BetaContentBlock => ({ type: "text", text: t, citations: null }) as Anthropic.Beta.BetaContentBlock;

function fakeClient(turns: Turn[]) {
  const requests: Anthropic.Beta.MessageCreateParamsNonStreaming[] = [];
  const client = {
    beta: {
      messages: {
        create: async (params: Anthropic.Beta.MessageCreateParamsNonStreaming) => {
          requests.push(structuredClone(params));
          const t = turns.shift();
          if (!t) throw new Error("fake client: no more turns");
          return {
            model: "fake-model",
            stop_reason: "end_turn",
            stop_details: null,
            usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0 },
            ...t,
          };
        },
      },
    },
  };
  return { client: client as unknown as Pick<Anthropic, "beta">, requests };
}

let childId: string;

beforeAll(async () => {
  const { seedArjun } = await import("@/db/seed/load");
  ({ child: { id: childId } } = await seedArjun(NOW));
}, 60_000);

describe("generatePlan", () => {
  it("runs tools, rejects an invented book, repairs, and returns a grounded plan", async () => {
    const { generatePlan } = await import("./planner");
    const invented = plan({
      readingList: [
        ...plan().readingList.slice(0, 2),
        { title: "Made-up Book", why: "Sounds plausible", qlooRef: ref("qloo:fake", "Made-up Book", "book") },
      ],
    });
    const { client, requests } = fakeClient([
      {
        stop_reason: "tool_use",
        content: [
          toolUse("t1", "get_engagement", {}),
          toolUse("t2", "find_next_interests", {}),
          toolUse("t3", "expand_interests", { interests: ["cricket", "Minecraft"], types: ["book", "artist", "video_game"], take: 8 }),
        ],
      },
      { content: [text(JSON.stringify(invented))] },
      { content: [text("```json\n" + JSON.stringify(plan()) + "\n```")] },
    ]);

    const res = await generatePlan({ childId, now: NOW, client });

    expect(res.toolCalls.map((t) => t.name)).toEqual(["get_engagement", "find_next_interests", "expand_interests"]);
    expect(res.toolCalls.every((t) => t.ok)).toBe(true);
    expect(res.repairs).toBe(1);
    expect(res.plan.readingList).toHaveLength(3);

    // All three tool results went back in one user message.
    const second = requests[1].messages.at(-1)!;
    expect(Array.isArray(second.content) && second.content.filter((b) => b.type === "tool_result")).toHaveLength(3);

    // The repair message named the invented item.
    const repair = requests[2].messages.at(-1)!;
    expect(String(repair.content)).toContain("Made-up Book");
  }, 60_000);

  it("requires three next interests when one is fading", async () => {
    const { generatePlan, PlannerError } = await import("./planner");
    const { client } = fakeClient([
      { stop_reason: "tool_use", content: [toolUse("a", "get_engagement", {}), toolUse("b", "expand_interests", { interests: ["cricket"], types: ["book", "artist", "video_game"] })] },
      { content: [text(JSON.stringify(plan({ nextInterests: [] })))] },
      { content: [text(JSON.stringify(plan({ nextInterests: [] })))] },
    ]);
    await expect(generatePlan({ childId, now: NOW, client })).rejects.toBeInstanceOf(PlannerError);
  }, 60_000);

  it("rejects clinical wording", async () => {
    const { generatePlan } = await import("./planner");
    const clinical = plan({ headline: "A week of therapy through cricket" });
    const { client } = fakeClient([
      { stop_reason: "tool_use", content: [toolUse("a", "find_next_interests", {}), toolUse("b", "expand_interests", { interests: ["cricket", "Minecraft"], types: ["book", "artist", "video_game"] })] },
      { content: [text(JSON.stringify(clinical))] },
      { content: [text(JSON.stringify(clinical))] },
    ]);
    await expect(generatePlan({ childId, now: NOW, client })).rejects.toThrow(/therapy/);
  }, 60_000);

  it("stops granting tools after the budget", async () => {
    const { generatePlan, LIMITS } = await import("./planner");
    const many = Array.from({ length: LIMITS.maxToolCalls + 2 }, (_, i) => toolUse(`x${i}`, "get_child_profile", {}));
    const { client, requests } = fakeClient([
      { stop_reason: "tool_use", content: many },
      { stop_reason: "tool_use", content: [toolUse("y", "find_next_interests", {}), toolUse("z", "expand_interests", { interests: ["cricket", "Minecraft"], types: ["book", "artist", "video_game"] })] },
      { content: [text(JSON.stringify(plan()))] },
    ]);
    await expect(generatePlan({ childId, now: NOW, client })).rejects.toThrow();
    const results = requests[1].messages.at(-1)!.content as Anthropic.Beta.BetaToolResultBlockParam[];
    expect(results.filter((r) => r.is_error)).toHaveLength(2);
  }, 60_000);
});
