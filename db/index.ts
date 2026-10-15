import path from "node:path";

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import * as schema from "./schema";

export { schema };

// Both drivers expose the same query API. We type the handle as the
// postgres-js flavour so call sites don't fight a union of overloads.
export type DB = PostgresJsDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "db", "migrations");
// Local dev/test DB when DATABASE_URL is unset: embedded Postgres (PGlite).
const LOCAL_DIR = path.join(process.cwd(), ".data", "pglite");

let cached: Promise<DB> | undefined;

export function getDb(): Promise<DB> {
  cached ??= connect();
  return cached;
}

async function connect(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const postgres = (await import("postgres")).default;
    return drizzle(postgres(url, { max: 5, prepare: false }), { schema });
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = process.env.PGLITE_DIR ?? LOCAL_DIR;
  // PGlite creates the leaf folder but not its parents.
  (await import("node:fs")).mkdirSync(path.dirname(dir), { recursive: true });
  const client = new PGlite(dir);
  return drizzle(client, { schema }) as unknown as DB;
}

export async function migrateDb(db?: DB): Promise<void> {
  const handle = db ?? (await getDb());
  if (process.env.DATABASE_URL) {
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    await migrate(handle, { migrationsFolder: MIGRATIONS });
  } else {
    const { migrate } = await import("drizzle-orm/pglite/migrator");
    // Runtime handle is a PGlite drizzle instance (see connect()).
    await migrate(handle as unknown as Parameters<typeof migrate>[0], {
      migrationsFolder: MIGRATIONS,
    });
  }
}

export function usingLocalDb(): boolean {
  return !process.env.DATABASE_URL;
}
