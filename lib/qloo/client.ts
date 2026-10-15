import { extractEntities, extractTags } from "./trim";
import type { InsightsParams, QlooEntity, QlooTag } from "./types";

export class QlooError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | undefined>;

export type QlooClientOptions = {
  apiKey: string;
  baseUrl?: string;
  // Called with every request URL; used by --dry-run and logging.
  onRequest?: (url: string) => void;
  dryRun?: boolean;
  maxRetries?: number;
};

const DEFAULT_BASE_URL = "https://hackathon.api.qloo.com";

export class QlooClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly opts: QlooClientOptions;

  constructor(opts: QlooClientOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.opts = opts;
  }

  buildUrl(path: string, query: Query): string {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
    }
    return url.toString();
  }

  // All Qloo calls are GET with params in the query string; key in X-Api-Key.
  async get(path: string, query: Query): Promise<unknown> {
    const url = this.buildUrl(path, query);
    this.opts.onRequest?.(url);
    if (this.opts.dryRun) return {};

    const maxRetries = this.opts.maxRetries ?? 3;
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
      });
      if (res.ok) return res.json();

      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        continue;
      }
      const body = await res.text().catch(() => "");
      throw new QlooError(
        `Qloo ${res.status} on ${path}: ${body.slice(0, 300)}`,
        res.status,
        url,
      );
    }
  }

  async search(query: string, take = 5, types?: string[]): Promise<QlooEntity[]> {
    return extractEntities(
      await this.get("/search", { query, take, types: types?.join(",") }),
    );
  }

  // Taste tags that describe the audience of the given entities (recipe:
  // "Get the taste tags that describe an entity's audience"). Used to find
  // what a fading interest's fans have in common.
  async audienceTags(entityIds: string[], take = 15, tagTypes?: string[]): Promise<QlooTag[]> {
    return extractTags(
      await this.get("/v2/insights", {
        "filter.type": "urn:tag",
        "filter.tag.types": tagTypes?.join(","),
        "signal.interests.entities": entityIds.join(","),
        take,
      }),
    );
  }

  async tags(query: string, take = 10): Promise<QlooTag[]> {
    return extractTags(
      await this.get("/v2/tags", { "filter.query": query, take }),
    );
  }

  async insights(p: InsightsParams): Promise<QlooEntity[]> {
    const body = await this.get("/v2/insights", {
      "filter.type": p.filterType,
      "signal.interests.entities": p.entityIds?.join(","),
      "signal.interests.tags": p.tagIds?.join(","),
      "signal.interests.tags.weights": p.tagWeights?.join(","),
      "filter.exclude.entities": p.excludeEntityIds?.join(","),
      "signal.demographics.age": p.ageBand,
      take: p.take ?? 10,
    });
    return extractEntities(body);
  }
}

export function qlooFromEnv(
  extra: Partial<QlooClientOptions> = {},
): QlooClient {
  const apiKey = process.env.QLOO_API_KEY ?? "";
  if (!apiKey && !extra.dryRun) {
    throw new Error(
      "QLOO_API_KEY is not set. Copy .env.example to .env.local and add your key.",
    );
  }
  return new QlooClient({
    apiKey,
    baseUrl: process.env.QLOO_BASE_URL,
    ...extra,
  });
}
