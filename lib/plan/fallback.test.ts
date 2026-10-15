import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "sparkpath-fallback-")), "db");
process.env.QLOO_MODE = "mock";
delete process.env.DATABASE_URL;
delete process.env.HINDSIGHT_URL;
delete process.env.ANTHROPIC_API_KEY;

const NOW = new Date("2026-10-16T10:00:00Z");
let childId: string;

beforeAll(async () => {
  const { seedArjun } = await import("@/db/seed/load");
  ({ child: { id: childId } } = await seedArjun(NOW));
}, 60_000);

describe("offline plan", () => {
  it("builds a valid, grounded plan from the tools alone", async () => {
    const { buildOfflinePlan } = await import("./fallback");
    const { toolContext } = await import("./service");
    const plan = await buildOfflinePlan(await toolContext(childId, NOW));

    expect(plan.weekStart).toBe("2026-10-12");
    expect(plan.missions).toHaveLength(5);
    expect(plan.missions.some((m) => m.format === "reading_long" || m.format === "quiz")).toBe(false);
    expect(plan.missions.filter((m) => m.interest === "cricket").length).toBeGreaterThanOrEqual(3);
    expect(plan.insight?.fading).toEqual([{ label: "Minecraft", changePct: -41 }]);
    expect(plan.nextInterests).toHaveLength(3);
    expect(plan.nextInterests.flatMap((n) => n.qlooRefs).every((r) => !/minecraft/i.test(r.name))).toBe(true);
  });

  it("demo mode gives each visitor a private child with this week's plan", async () => {
    const { createDemo } = await import("@/lib/demo");
    const { getCurrentPlan, logOutcome } = await import("./service");
    const a = await createDemo(NOW);
    const b = await createDemo(NOW);
    expect(a.childId).not.toBe(b.childId);

    const current = await getCurrentPlan(a.childId, NOW);
    expect(current?.missions).toHaveLength(5);

    await logOutcome(a.childId, current!.missions[0].id, { status: "meltdown", minutes: 0, note: "too long" });
    const after = await getCurrentPlan(a.childId, NOW);
    expect(after?.missions[0].log?.status).toBe("meltdown");
    expect((await getCurrentPlan(b.childId, NOW))?.missions[0].log).toBeNull();

    await expect(logOutcome(b.childId, current!.missions[0].id, { status: "done", minutes: 5 })).rejects.toThrow();
  }, 60_000);
});
