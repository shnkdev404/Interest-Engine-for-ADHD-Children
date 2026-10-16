// Hand-written stand-in for Qloo while the hackathon key is pending.
// This is NOT Qloo data (Qloo responses must never be committed): titles are
// public, well-known works and the links between them are our own guesses.
// IDs are prefixed "mock:" so nothing downstream can mistake them for real
// Qloo entities. Remove once live coverage passes (PLAN.md Phase 0).
import { ENTITY_TYPES, type EntityTypeKey, type InsightsParams, type QlooEntity, type QlooTag } from "./types";
import type { QlooSource } from "./source";

type Row = { id: string; name: string; type: EntityTypeKey; year?: number; pop: number; tags: string[] };

const T = (k: string): QlooTag => ({ id: `mock:tag:${k}`, name: k.replace(/_/g, " ") });

// Anchors are what /search resolves a child's interest to.
const ANCHORS: Row[] = [
  { id: "mock:minecraft", name: "Minecraft", type: "video_game", year: 2011, pop: 0.99, tags: ["building", "survival", "sandbox", "adventure"] },
  { id: "mock:cricket", name: "Cricket (sport)", type: "tv_show", pop: 0.9, tags: ["sport", "cricket", "team"] },
  { id: "mock:lego", name: "LEGO", type: "video_game", pop: 0.95, tags: ["building", "creative", "comedy"] },
  { id: "mock:dinosaurs", name: "Dinosaurs", type: "book", pop: 0.85, tags: ["dinosaurs", "nature", "science"] },
  { id: "mock:space", name: "Space", type: "book", pop: 0.85, tags: ["space", "science", "adventure"] },
  { id: "mock:football", name: "Football (soccer)", type: "tv_show", pop: 0.92, tags: ["sport", "football", "team"] },
];

const CATALOG: Row[] = [
  // books
  { id: "mock:b:minecraft-island", name: "Minecraft: The Island", type: "book", year: 2017, pop: 0.8, tags: ["building", "survival", "adventure"] },
  { id: "mock:b:wild-robot", name: "The Wild Robot", type: "book", year: 2016, pop: 0.85, tags: ["survival", "nature", "adventure"] },
  { id: "mock:b:dog-man", name: "Dog Man", type: "book", year: 2016, pop: 0.9, tags: ["comics", "comedy", "short_read"] },
  { id: "mock:b:wimpy-kid", name: "Diary of a Wimpy Kid", type: "book", year: 2007, pop: 0.92, tags: ["comedy", "comics", "short_read", "sport"] },
  { id: "mock:b:lego-ideas", name: "The LEGO Ideas Book", type: "book", year: 2011, pop: 0.7, tags: ["building", "creative", "short_read"] },
  { id: "mock:b:football-school", name: "Football School: Where Football Explains the World", type: "book", year: 2016, pop: 0.65, tags: ["sport", "football", "cricket", "science", "short_read"] },
  { id: "mock:b:dinosaur-cove", name: "Dinosaur Cove", type: "book", year: 2008, pop: 0.6, tags: ["dinosaurs", "adventure", "short_read"] },
  { id: "mock:b:georges-key", name: "George's Secret Key to the Universe", type: "book", year: 2007, pop: 0.7, tags: ["space", "science", "adventure"] },
  { id: "mock:b:hilo", name: "Hilo: The Boy Who Crashed to Earth", type: "book", year: 2017, pop: 0.7, tags: ["comics", "space", "adventure", "short_read"] },
  // TV
  { id: "mock:t:lego-masters", name: "LEGO Masters", type: "tv_show", year: 2020, pop: 0.8, tags: ["building", "creative", "team"] },
  { id: "mock:t:camp-cretaceous", name: "Jurassic World: Camp Cretaceous", type: "tv_show", year: 2020, pop: 0.8, tags: ["dinosaurs", "survival", "adventure"] },
  { id: "mock:t:gigantosaurus", name: "Gigantosaurus", type: "tv_show", year: 2019, pop: 0.6, tags: ["dinosaurs", "comedy"] },
  { id: "mock:t:ready-jet-go", name: "Ready Jet Go!", type: "tv_show", year: 2016, pop: 0.5, tags: ["space", "science"] },
  { id: "mock:t:gumball", name: "The Amazing World of Gumball", type: "tv_show", year: 2011, pop: 0.85, tags: ["comedy"] },
  // games
  { id: "mock:g:terraria", name: "Terraria", type: "video_game", year: 2011, pop: 0.85, tags: ["building", "survival", "sandbox", "adventure"] },
  { id: "mock:g:lego-worlds", name: "LEGO Worlds", type: "video_game", year: 2017, pop: 0.7, tags: ["building", "sandbox", "creative"] },
  { id: "mock:g:stardew", name: "Stardew Valley", type: "video_game", year: 2016, pop: 0.88, tags: ["building", "nature", "creative"] },
  { id: "mock:g:mario-maker-2", name: "Super Mario Maker 2", type: "video_game", year: 2019, pop: 0.8, tags: ["building", "creative", "comedy"] },
  { id: "mock:g:cricket-24", name: "Cricket 24", type: "video_game", year: 2023, pop: 0.6, tags: ["sport", "cricket", "team"] },
  { id: "mock:g:rocket-league", name: "Rocket League", type: "video_game", year: 2015, pop: 0.85, tags: ["sport", "football", "team"] },
  { id: "mock:g:jwe2", name: "Jurassic World Evolution 2", type: "video_game", year: 2021, pop: 0.7, tags: ["dinosaurs", "building", "science"] },
  { id: "mock:g:kerbal", name: "Kerbal Space Program", type: "video_game", year: 2015, pop: 0.75, tags: ["space", "building", "science"] },
  // movies
  { id: "mock:m:lego-movie", name: "The LEGO Movie", type: "movie", year: 2014, pop: 0.88, tags: ["building", "creative", "comedy"] },
  { id: "mock:m:minecraft-movie", name: "A Minecraft Movie", type: "movie", year: 2025, pop: 0.85, tags: ["building", "survival", "adventure", "comedy"] },
  { id: "mock:m:lagaan", name: "Lagaan", type: "movie", year: 2001, pop: 0.8, tags: ["sport", "cricket", "team"] },
  { id: "mock:m:wall-e", name: "WALL-E", type: "movie", year: 2008, pop: 0.9, tags: ["space", "nature", "building"] },
  { id: "mock:m:land-before-time", name: "The Land Before Time", type: "movie", year: 1988, pop: 0.7, tags: ["dinosaurs", "adventure"] },
  { id: "mock:m:wild-robot", name: "The Wild Robot", type: "movie", year: 2024, pop: 0.85, tags: ["survival", "nature", "adventure"] },
  // artists (focus playlists)
  { id: "mock:a:c418", name: "C418", type: "artist", pop: 0.75, tags: ["building", "sandbox", "calm_instrumental"] },
  { id: "mock:a:lena-raine", name: "Lena Raine", type: "artist", pop: 0.6, tags: ["building", "adventure", "calm_instrumental"] },
  { id: "mock:a:ar-rahman", name: "A. R. Rahman", type: "artist", pop: 0.9, tags: ["cricket", "sport", "soundtrack"] },
  { id: "mock:a:hisaishi", name: "Joe Hisaishi", type: "artist", pop: 0.85, tags: ["nature", "adventure", "calm_instrumental"] },
  { id: "mock:a:john-williams", name: "John Williams", type: "artist", pop: 0.95, tags: ["dinosaurs", "space", "adventure", "soundtrack"] },
  { id: "mock:a:einaudi", name: "Ludovico Einaudi", type: "artist", pop: 0.85, tags: ["calm_instrumental"] },
];

const ALL = [...ANCHORS, ...CATALOG];
const byId = new Map(ALL.map((r) => [r.id, r]));

function toEntity(r: Row, affinity?: number): QlooEntity {
  return {
    entityId: r.id,
    name: r.name,
    types: [ENTITY_TYPES[r.type]],
    popularity: r.pop,
    affinity,
    year: r.year,
    tags: r.tags.map(T),
  };
}

// Score = tag overlap with the signal (entities and/or tags), then popularity.
function signalTags(p: { entityIds?: string[]; tagIds?: string[] }): Map<string, number> {
  const weights = new Map<string, number>();
  for (const id of p.entityIds ?? []) for (const t of byId.get(id)?.tags ?? []) weights.set(t, (weights.get(t) ?? 0) + 1);
  for (const id of p.tagIds ?? []) {
    const t = id.replace(/^mock:tag:/, "");
    weights.set(t, (weights.get(t) ?? 0) + 1);
  }
  return weights;
}

export const mockQloo: QlooSource = {
  mode: "mock",

  async resolve(label) {
    return (await this.search(label, 1))[0] ?? null;
  },

  async search(query, take = 5) {
    const q = query.toLowerCase();
    return ALL.filter((r) => r.name.toLowerCase().includes(q) || r.id.endsWith(`:${q}`))
      .sort((a, b) => (b.id.split(":").length === 2 ? 1 : 0) - (a.id.split(":").length === 2 ? 1 : 0) || b.pop - a.pop)
      .slice(0, take)
      .map((r) => toEntity(r));
  },

  async insights(p: InsightsParams) {
    const weights = signalTags(p);
    const exclude = new Set([...(p.excludeEntityIds ?? []), ...(p.entityIds ?? [])]);
    const max = Math.max(1, ...weights.values());
    return CATALOG.filter((r) => ENTITY_TYPES[r.type] === p.filterType && !exclude.has(r.id))
      .map((r) => ({ r, score: r.tags.reduce((s, t) => s + (weights.get(t) ?? 0), 0) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.r.pop - a.r.pop)
      .slice(0, p.take ?? 10)
      .map(({ r, score }) => toEntity(r, Math.min(1, score / (max * 3))));
  },

  async audienceTags(entityIds, take = 15) {
    // Tags common among items that share the anchors' tags: a rough stand-in
    // for "what else do fans of these things have in common".
    const weights = signalTags({ entityIds });
    const counts = new Map<string, number>();
    for (const r of CATALOG) {
      if (!r.tags.some((t) => weights.has(t))) continue;
      for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, take)
      .map(([t, n]) => ({ ...T(t), affinity: n / max }));
  },

  async tags(query, take = 10) {
    const q = query.toLowerCase();
    const all = new Set(ALL.flatMap((r) => r.tags));
    return [...all].filter((t) => t.includes(q)).slice(0, take).map(T);
  },
};
