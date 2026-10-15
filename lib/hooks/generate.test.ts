import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type Anthropic from "@anthropic-ai/sdk";
import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "sparkpath-hooks-")), "db");
process.env.QLOO_MODE = "mock";
delete process.env.DATABASE_URL;
delete process.env.HINDSIGHT_URL;
delete process.env.ANTHROPIC_API_KEY;

const NOW = new Date("2026-10-16T10:00:00Z");
let classId: string;
let childIds: string[];

beforeAll(async () => {
  const { seedClassroom } = await import("@/db/seed/classroom");
  ({ classId, childIds } = await seedClassroom(NOW, "teacher-test@demo.sparkpath.local"));
}, 60_000);

describe("lesson hooks", () => {
  it("offline: one hook per child, on each child's own interest, citing only their picks", async () => {
    const { generateLessonHooks } = await import("./generate");
    const { hooks, model } = await generateLessonHooks(classId, "Fractions", 40);
    expect(model).toBe("offline-template");
    expect(hooks.map((h) => h.childId).sort()).toEqual([...childIds].sort());

    const byName = Object.fromEntries(hooks.map((h) => [h.nickname, h]));
    expect(byName.Arjun.interest).toBe("cricket"); // Minecraft is fading
    expect(byName.Meera.interest).toBe("dinosaurs");
    expect(new Set(hooks.map((h) => h.interest)).size).toBe(5);
    expect(hooks.every((h) => h.qlooRef === null || h.qlooRef.entityId.startsWith("mock:"))).toBe(true);
  }, 60_000);

  it("agent: drops a pick that belongs to a different child", async () => {
    const { generateLessonHooks } = await import("./generate");
    const fake = {
      messages: {
        parse: async (params: { messages: { content: string }[] }) => {
          const kids = JSON.parse(params.messages[0].content.split("Children:\n")[1]) as {
            childId: string;
            name: string;
            picks: { entityId: string }[];
          }[];
          const meeraPicks = new Set(kids.find((k) => k.name === "Meera")!.picks.map((p) => p.entityId));
          const other = kids.find((k) => k.name === "Zoya")!.picks.find((p) => !meeraPicks.has(p.entityId))!.entityId;
          return {
            stop_reason: "end_turn",
            parsed_output: {
              hooks: kids.map((k) => ({
                childId: k.childId,
                title: `Fractions for ${k.name}`,
                opener: "Let's start with a question.",
                activity: "Split the set into equal parts.",
                // Meera's hook wrongly cites one of Zoya's picks.
                qlooEntityId: k.name === "Meera" ? other : (k.picks[0]?.entityId ?? null),
              })),
            },
          };
        },
      },
    } as unknown as Pick<Anthropic, "messages">;

    const { hooks, model } = await generateLessonHooks(classId, "Fractions", 40, { client: fake });
    expect(model).not.toBe("offline-template");
    const meera = hooks.find((h) => h.nickname === "Meera")!;
    expect(meera.source).toBe("agent");
    expect(meera.qlooRef).toBeNull();
    expect(hooks.find((h) => h.nickname === "Zoya")!.qlooRef).not.toBeNull();
  }, 60_000);
});
