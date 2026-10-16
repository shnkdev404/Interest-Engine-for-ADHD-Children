import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

process.env.PGLITE_DIR = path.join(mkdtempSync(path.join(tmpdir(), "sparkpath-drc-")), "db");
process.env.QLOO_MODE = "mock";
delete process.env.DATABASE_URL;
delete process.env.HINDSIGHT_URL;
delete process.env.ANTHROPIC_API_KEY;

const NOW = new Date("2026-10-16T10:00:00Z"); // a Friday
let childId: string;

beforeAll(async () => {
  const { seedArjun } = await import("@/db/seed/load");
  ({ child: { id: childId } } = await seedArjun(NOW));
}, 60_000);

describe("school card", () => {
  it("shows the seeded week: 3 targets, 5 school days, today not yet entered", async () => {
    const { getDrc, lastSchoolDays } = await import("./drc");
    expect(lastSchoolDays(NOW)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    const v = await getDrc(childId, NOW);
    expect(v.targets).toHaveLength(3);
    expect(v.reward?.threshold).toBe(2);
    expect(v.days.at(-1)?.day).toBe("2026-10-16");
    expect(Object.keys(v.days.at(-1)!.entries)).toHaveLength(0);
    expect(v.last5.entered).toBe(12); // 4 seeded days before today × 3 targets
  });

  it("ticking every target earns the reward and writes one memory note", async () => {
    const { getDrc, setEntry } = await import("./drc");
    const { getMemory } = await import("@/lib/memory");
    const v = await getDrc(childId, NOW);
    for (const [i, t] of v.targets.entries()) await setEntry(childId, t.id, v.today, i !== 1, null);
    await setEntry(childId, v.targets[0].id, v.today, true, null); // an edit, not a new day

    const after = await getDrc(childId, NOW);
    expect(after.todayMet).toBe(2);
    expect(after.earnedToday).toBe(true);
    const notes = (await (await getMemory()).recall(childId, "school card targets reward", 20)).filter((m) =>
      m.text.includes("on 2026-10-16"),
    );
    expect(notes).toHaveLength(1);
  });

  it("rejects clinical wording in targets", async () => {
    const { setTargets } = await import("./drc");
    await expect(setTargets(childId, ["Took medication on time"])).rejects.toThrow(/medication/);
  });
});

describe("rest and retry", () => {
  it("a rested interest leaves scoring, returns as a probe when due, and reactivates when it goes well", async () => {
    const { restInterest, logOutcome, getCurrentPlan, toolContext } = await import("@/lib/plan/service");
    const { getEngagement } = await import("@/lib/engagement/load");
    const { buildOfflinePlan, OFFLINE_MODEL } = await import("@/lib/plan/fallback");
    const { savePlan } = await import("@/lib/plan/store");
    const { getDb, schema } = await import("@/db");
    const { eq } = await import("drizzle-orm");

    const db = await getDb();
    const mc = (await db.select().from(schema.interests).where(eq(schema.interests.childId, childId))).find(
      (i) => i.label === "Minecraft",
    )!;
    const { resurfaceOn } = await restInterest(childId, mc.id);

    const report = await getEngagement(childId, NOW);
    expect(report.interests.some((i) => i.label === "Minecraft")).toBe(false);
    expect(report.dormant).toEqual([expect.objectContaining({ label: "Minecraft", due: false })]);

    // Three weeks later the offline plan includes exactly one probe.
    const later = new Date(`${resurfaceOn}T10:00:00Z`);
    const plan = await buildOfflinePlan(await toolContext(childId, later));
    expect(plan.missions.filter((m) => m.probe && m.interest === "Minecraft")).toHaveLength(1);
    expect(plan.missions.some((m) => m.subject === "break")).toBe(true);
    expect(plan.rewards.length).toBeGreaterThanOrEqual(2);

    await savePlan(childId, plan, OFFLINE_MODEL);
    const current = await getCurrentPlan(childId, later);
    const probe = current!.missions.find((m) => m.title.startsWith("Quick retry"))!;
    await logOutcome(childId, probe.id, { status: "done", minutes: 10 });
    const row = await db.query.interests.findFirst({ where: eq(schema.interests.id, mc.id) });
    expect(row?.status).toBe("active");
  }, 60_000);
});
