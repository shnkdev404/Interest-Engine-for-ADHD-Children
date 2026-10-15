// Entity types SparkPath uses. Full list: docs.qloo.com hackathon developer guide.
export const ENTITY_TYPES = {
  book: "urn:entity:book",
  tv_show: "urn:entity:tv_show",
  video_game: "urn:entity:video_game",
  movie: "urn:entity:movie",
  artist: "urn:entity:artist",
} as const;

export type EntityTypeKey = keyof typeof ENTITY_TYPES;
export type EntityTypeUrn = (typeof ENTITY_TYPES)[EntityTypeKey];

export type QlooTag = {
  id: string;
  name: string;
  type?: string;
  // Present on tag insights: how strongly the tag fits the signal's audience.
  affinity?: number;
};

// Trimmed entity: only the fields SparkPath reads (see ARCHITECTURE.md §5).
export type QlooEntity = {
  entityId: string;
  name: string;
  types: string[];
  popularity?: number;
  affinity?: number;
  description?: string;
  image?: string;
  year?: number;
  contentRating?: string;
  tags: QlooTag[];
};

export type InsightsParams = {
  filterType: EntityTypeUrn;
  entityIds?: string[];
  tagIds?: string[];
  // Parallel to tagIds; higher pulls results harder toward that tag.
  tagWeights?: number[];
  excludeEntityIds?: string[];
  ageBand?: string;
  take?: number;
};
