import { qlooFromEnv, QlooError, type QlooClient } from "./client";
import { ENTITY_TYPES, type InsightsParams, type QlooEntity, type QlooTag } from "./types";

// What the agent and API routes depend on. Live = Qloo hackathon API (cached),
// mock = hand-written catalog in ./mock while the key is pending.
export type QlooSource = {
  mode: "live" | "mock";
  search(query: string, take?: number, types?: string[]): Promise<QlooEntity[]>;
  // Best entity to use as a *signal* for a child's interest (or null).
  resolve(label: string): Promise<QlooEntity | null>;
  insights(p: InsightsParams): Promise<QlooEntity[]>;
  audienceTags(entityIds: string[], take?: number, tagTypes?: string[]): Promise<QlooTag[]>;
  tags(query: string, take?: number): Promise<QlooTag[]>;
};

// Kid lens (found in the Phase 0 coverage test, D-10): entity signals reflect
// adult fan audiences — a cricket signal gives adult political books, a
// Minecraft signal gives explicit rap. These filter.tags keep each type to
// children's / family / wordless-focus material. Games have no such tag and
// rely on the age-fit filter.
export const KID_LENS: Partial<Record<string, string[]>> = {
  [ENTITY_TYPES.book]: ["urn:tag:genre:media:childrens"],
  [ENTITY_TYPES.tv_show]: ["urn:tag:genre:media:family"],
  [ENTITY_TYPES.movie]: ["urn:tag:genre:media:family"],
  [ENTITY_TYPES.artist]: ["urn:tag:genre:music:instrumental"],
};

// Entity types that work as interest signals, most useful first. Places,
// localities and people match by name only ("Cricket" the town).
const SIGNAL_TYPES = [
  "urn:entity:brand",
  ENTITY_TYPES.video_game,
  ENTITY_TYPES.tv_show,
  ENTITY_TYPES.movie,
  ENTITY_TYPES.book,
  ENTITY_TYPES.artist,
];
const NOT_SIGNALS = /urn:entity:(place|locality|destination|person|address|album|author)/;

function live(client: QlooClient): QlooSource {
  const resolved = new Map<string, Promise<QlooEntity | null>>();

  const insights: QlooSource["insights"] = (p) =>
    client.insights({ ...p, filterTags: p.filterTags ?? KID_LENS[p.filterType] });

  // Rank candidates by type, then keep the first Qloo accepts as a signal
  // (some entities, e.g. the Pokémon TV show, are rejected as signals).
  async function resolve(label: string): Promise<QlooEntity | null> {
    const cands = (await client.search(label, 10)).filter((c) => !c.types.some((t) => NOT_SIGNALS.test(t)));
    const rank = (c: QlooEntity) => {
      const i = SIGNAL_TYPES.findIndex((t) => c.types.includes(t));
      const exact = c.name.toLowerCase() === label.toLowerCase() ? 0 : 0.5;
      return (i < 0 ? SIGNAL_TYPES.length : i) + exact;
    };
    for (const c of cands.sort((a, b) => rank(a) - rank(b)).slice(0, 5)) {
      try {
        await client.insights({ filterType: ENTITY_TYPES.book, entityIds: [c.entityId], take: 1 });
        return c;
      } catch (err) {
        if (err instanceof QlooError && err.status === 400) continue;
        throw err;
      }
    }
    return null;
  }

  return {
    mode: "live",
    search: (q, take, types) => client.search(q, take, types),
    resolve: (label) => {
      const key = label.trim().toLowerCase();
      if (!resolved.has(key)) resolved.set(key, resolve(label));
      return resolved.get(key)!;
    },
    insights,
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
