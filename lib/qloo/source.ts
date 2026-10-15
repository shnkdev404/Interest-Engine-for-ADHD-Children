import { qlooFromEnv, type QlooClient } from "./client";
import type { InsightsParams, QlooEntity, QlooTag } from "./types";

// What the agent and API routes depend on. Live = Qloo hackathon API (cached),
// mock = hand-written catalog in ./mock while the key is pending.
export type QlooSource = {
  mode: "live" | "mock";
  search(query: string, take?: number, types?: string[]): Promise<QlooEntity[]>;
  insights(p: InsightsParams): Promise<QlooEntity[]>;
  audienceTags(entityIds: string[], take?: number, tagTypes?: string[]): Promise<QlooTag[]>;
  tags(query: string, take?: number): Promise<QlooTag[]>;
};

function live(client: QlooClient): QlooSource {
  return {
    mode: "live",
    search: (q, take, types) => client.search(q, take, types),
    insights: (p) => client.insights(p),
    audienceTags: (ids, take, tagTypes) => client.audienceTags(ids, take, tagTypes),
    tags: (q, take) => client.tags(q, take),
  };
}

let cached: Promise<QlooSource> | undefined;

// QLOO_MODE=live|mock forces a mode; otherwise live when a key is present.
export function getQloo(): Promise<QlooSource> {
  cached ??= (async () => {
    const mode = process.env.QLOO_MODE ?? (process.env.QLOO_API_KEY ? "live" : "mock");
    if (mode === "mock") return (await import("./mock")).mockQloo;
    const { dbCache } = await import("./cache");
    return live(qlooFromEnv({ cache: dbCache }));
  })();
  return cached;
}
