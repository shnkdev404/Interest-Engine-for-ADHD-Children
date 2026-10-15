// Prepares a deploy for judges (ARCHITECTURE.md §8):
// 1. Qloo self-test: one request per entity type must return results,
//    because Qloo silently ignores bad params (ARCHITECTURE.md §5).
// 2. Re-seed the template Arjun and make this week's plan with the agent
//    (offline if Claude isn't configured); every new demo copies it.
// 3. Warm the Qloo cache for the teacher demo's classmates.
// Run by `npm run demo:prewarm` and weekly by the Vercel cron.
import { CLASSMATES } from "@/db/seed/classroom";
import { seedArjun } from "@/db/seed/load";
import { createPlan } from "@/lib/plan/service";
import { getQloo } from "@/lib/qloo/source";
import { ENTITY_TYPES, type EntityTypeKey } from "@/lib/qloo/types";

export type PrewarmReport = {
  qlooMode: "live" | "mock";
  selfTest: Record<string, number | string>;
  templateChildId: string;
  plan: { source: "agent" | "offline"; notice?: string };
  warmedInterests: string[];
};

export async function prewarm(now = new Date()): Promise<PrewarmReport> {
  const qloo = await getQloo();

  // 1. Self-test against a known interest.
  const selfTest: PrewarmReport["selfTest"] = {};
  const [anchor] = await qloo.search("Minecraft", 1);
  if (!anchor) throw new Error("Qloo self-test: /search returned nothing for Minecraft");
  for (const t of Object.keys(ENTITY_TYPES) as EntityTypeKey[]) {
    try {
      selfTest[t] = (await qloo.insights({ filterType: ENTITY_TYPES[t], entityIds: [anchor.entityId], take: 5 })).length;
    } catch (err) {
      selfTest[t] = `error: ${err instanceof Error ? err.message.slice(0, 120) : err}`;
    }
  }

  // 2. Template persona + this week's plan (also warms Arjun's Qloo calls).
  const { child } = await seedArjun(now);
  const plan = await createPlan(child.id, { now });

  // 3. Classmates: same calls the classroom seed and hooks make, so the
  // cache keys match exactly.
  const warmed: string[] = [];
  for (const c of CLASSMATES) {
    for (const label of c.interests) {
      const [hit] = await qloo.search(label, 1);
      if (!hit) continue;
      await Promise.all(
        (["video_game", "tv_show", "book"] as const).map((t) =>
          qloo.insights({ filterType: ENTITY_TYPES[t], entityIds: [hit.entityId], take: 4 }).catch(() => []),
        ),
      );
      warmed.push(label);
    }
  }

  return {
    qlooMode: qloo.mode,
    selfTest,
    templateChildId: child.id,
    plan: { source: plan.source, notice: plan.notice },
    warmedInterests: warmed,
  };
}
