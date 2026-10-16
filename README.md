# SparkPath

An interest engine for kids with ADHD. Parents and teachers turn a child's current obsessions into homework, reading, chores and routines the child wants to do, and SparkPath spots the next obsession before boredom sets in.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). Qloo's taste graph finds what fans of a child's interests also love; Hindsight remembers what held attention; a Claude agent writes the weekly plan.

> Engagement and learning support for adults to use with children. Not a medical product.

## Status

Phases 0–4 built: parent UI (demo mode, This week, logging, Insights, Interests, Compare) and the teacher class view (one lesson, a hook per child). Next: deploy and submit (Phase 5). Qloo runs on a hand-written mock until the hackathon key arrives. See [docs/PLAN.md](docs/PLAN.md).

## Docs

- [Plan](docs/PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Technical design](docs/DESIGN.md)
- [Decision log](docs/DECISIONS.md)
- [UI / UX spec](docs/UI_UX.md)
- [Deploy guide](docs/DEPLOY.md)

## Setup

Requires Node 22.9+.

```bash
npm install
cp .env.example .env.local   # keys are optional for local dev
npm run db:seed              # loads the Arjun demo persona
npm test
npm run dev                  # open http://localhost:3000 and click "Explore as Arjun's parent"
```

Don't run `db:seed` while `npm run dev` is running on the local PGlite database: embedded Postgres allows one process at a time.

Everything runs locally with no keys: Postgres falls back to embedded PGlite (`.data/`), memory to a Postgres table, and Qloo to a mock catalog. Set `DATABASE_URL`, `HINDSIGHT_URL` and `QLOO_API_KEY` to use the real services.

| Script | What it does |
| --- | --- |
| `npm run db:seed` | Migrates the DB and loads Arjun (3 weeks of history); prints the engagement read-back |
| `npm run db:generate` | Generates a SQL migration after editing `db/schema.ts` |
| `npm run plan` | Runs the planner agent for Arjun (needs `ANTHROPIC_API_KEY`); `--save` stores it, `--ask "…"` adds an adult request |
| `npm run plan -- --tools-only` | Runs every agent tool once without the model: shows exactly what the agent sees |
| `npm run eval` | Evaluation report: fading v1 vs v2 on simulated data, plan quality for six synthetic children (plus a judged AI-alone comparison with a Claude key) |
| `npm run demo:prewarm` | Qloo self-test, template Arjun with this week's plan, Qloo cache for the teacher demo |
| `npm run db:migrate` | Applies migrations to `DATABASE_URL` (also runs on every Vercel build) |
| `npm test` | Unit tests (scorer, mock Qloo, lint, planner loop with a scripted fake model) |
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
