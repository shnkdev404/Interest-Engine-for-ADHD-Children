import type { QlooEntity, QlooTag } from "./types";

type Raw = Record<string, unknown>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v : undefined;
const num = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
const obj = (v: unknown): Raw => (v && typeof v === "object" ? (v as Raw) : {});

// Qloo responses are verbose (akas, external ids…) and the API can't filter
// fields, so we keep only what the app reads. Shapes are read defensively
// because invalid params return 200 with partial or empty bodies.
export function trimEntity(raw: unknown): QlooEntity | null {
  const r = obj(raw);
  const entityId = str(r.entity_id) ?? str(r.id);
  const name = str(r.name);
  if (!entityId || !name) return null;

  const props = obj(r.properties);
  const query = obj(r.query);
  const types = Array.isArray(r.types)
    ? r.types.filter((t): t is string => typeof t === "string")
    : str(r.type)
      ? [r.type as string]
      : [];

  const image = obj(props.image);
  const tags: QlooTag[] = Array.isArray(r.tags)
    ? r.tags.flatMap((t) => {
        const tag = obj(t);
        const id = str(tag.tag_id) ?? str(tag.id);
        const tagName = str(tag.name);
        return id && tagName ? [{ id, name: tagName, type: str(tag.type) }] : [];
      })
    : [];

  return {
    entityId,
    name,
    types,
    popularity: num(r.popularity),
    affinity: num(query.affinity),
    description: str(props.short_description) ?? str(props.description),
    image: str(image.url) ?? str(props.image),
    year:
      num(props.release_year) ??
      num(props.publication_year) ??
      (str(props.release_date) ? Number(String(props.release_date).slice(0, 4)) : undefined),
    contentRating: str(props.content_rating),
    tags,
  };
}

// /v2/insights nests entities under results.entities; /search returns results[].
export function extractEntities(body: unknown): QlooEntity[] {
  const b = obj(body);
  const results = b.results;
  const list = Array.isArray(results)
    ? results
    : Array.isArray(obj(results).entities)
      ? (obj(results).entities as unknown[])
      : [];
  return list.map(trimEntity).filter((e): e is QlooEntity => e !== null);
}

export function extractTags(body: unknown): QlooTag[] {
  const b = obj(body);
  const results = b.results;
  const list = Array.isArray(results)
    ? results
    : Array.isArray(obj(results).tags)
      ? (obj(results).tags as unknown[])
      : [];
  return list.flatMap((t) => {
    const tag = obj(t);
    const id = str(tag.id) ?? str(tag.tag_id);
    const name = str(tag.name);
    return id && name ? [{ id, name, type: str(tag.type) }] : [];
  });
}
