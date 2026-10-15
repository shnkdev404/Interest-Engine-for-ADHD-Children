# SparkPath

An interest engine for kids with ADHD. Parents and teachers turn a child's current obsessions into homework, reading, chores and routines the child wants to do, and SparkPath spots the next obsession before boredom sets in.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). Qloo's taste graph finds what fans of a child's interests also love; Hindsight remembers what held attention; a Claude agent writes the weekly plan.

> Engagement and learning support for adults to use with children. Not a medical product.

## Status

Phase 1 — data model, memory and the Arjun demo seed. Qloo runs on a hand-written mock until the hackathon key arrives. See [docs/PLAN.md](docs/PLAN.md).

## Docs

- [Plan](docs/PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Technical design](docs/DESIGN.md)
- [Decision log](docs/DECISIONS.md)
- [UI / UX spec](docs/UI_UX.md)

## Setup

Requires Node 22.9+.

```bash
npm install
cp .env.example .env.local   # keys are optional for local dev
npm run db:seed              # loads the Arjun demo persona
npm test
npm run dev
```

Everything runs locally with no keys: Postgres falls back to embedded PGlite (`.data/`), memory to a Postgres table, and Qloo to a mock catalog. Set `DATABASE_URL`, `HINDSIGHT_URL` and `QLOO_API_KEY` to use the real services.

| Script | What it does |
| --- | --- |
| `npm run db:seed` | Migrates the DB and loads Arjun (3 weeks of history); prints the engagement read-back |
| `npm run db:generate` | Generates a SQL migration after editing `db/schema.ts` |
| `npm test` | Unit tests (engagement scorer, mock Qloo) |
| `npm run qloo:coverage` | Phase 0 Qloo coverage test (needs a key) |

## Qloo coverage test (Phase 0)

Checks whether Qloo returns kid-relevant books, shows, games, movies and artists for typical children's interests.

```bash
npm run qloo:coverage
```

Options: `--interests "Minecraft,cricket"`, `--take 10`, `--types book,tv_show`, `--dry-run` (prints requests without calling Qloo).

Results are written to `reports/` (git-ignored). Qloo response data must never be committed to this public repo.

## Licence

[MIT](LICENSE)
