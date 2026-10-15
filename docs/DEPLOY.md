# SparkPath — Deploy Guide

How to get a public URL for judges: Vercel (app) + Neon (Postgres) + Hindsight (memory). As of 2026-10-16. Deadline: Oct 31, 2026, 9:15 am; aim to be live by **Oct 28** and submit by **Oct 30**.

## 1. What you need to provide

| # | Item | Where to get it | Required? | Goes into |
| --- | --- | --- | --- | --- |
| 1 | **Vercel account** connected to GitHub | vercel.com, "Continue with GitHub" | Yes | Import the repo |
| 2 | **Neon account + project** | neon.tech → New project (region near your users) → *Connection string*, **pooled** | Yes | `DATABASE_URL` |
| 3 | **Anthropic API key** | console.anthropic.com → API keys | Yes for AI plans (without it the app makes offline plans) | `ANTHROPIC_API_KEY` |
| 4 | **Qloo hackathon key** | [request form](https://forms.gle/zz12orkLHTAneLGz6), arrives by email (check spam) | Yes (without it the app uses the mock catalog) | `QLOO_API_KEY` |
| 5 | **Hindsight URL (+ key)** | Hindsight Cloud, or self-host with Docker ([docs](https://hindsight.vectorize.io)) | Optional (without it memory falls back to Postgres) | `HINDSIGHT_URL`, `HINDSIGHT_API_KEY` |
| 6 | **Session secret** | Generate locally (command below) | Yes in production | `SESSION_SECRET` |
| 7 | **Cron secret** | Generate locally (same command) | Yes for the weekly prewarm | `CRON_SECRET` |

Generate a secret (run it twice, once each for 6 and 7):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Never paste keys into chat or commit them. They go only in `.env.local` (local) and Vercel → Project → Settings → Environment Variables (production).

## 2. Local check with real keys (before deploying)

Put your keys in `.env.local`, then:

```bash
npm run qloo:coverage
```

Phase 0 go/no-go. Open the report in `reports/` and hand-score the "Parent OK?" columns. Target: 7 of 10 interests usable.

```bash
npm run demo:prewarm
```

Runs the Qloo self-test (one request per type must return results), re-seeds the template Arjun, and makes this week's plan with the agent.

```bash
npm run plan
```

One full agent run for Arjun: prints the plan, tool calls, tokens and time. It should finish in under 45 s with no repairs.

## 3. Neon

1. Create a project; copy the **pooled** connection string (host contains `-pooler`).
2. Nothing else: tables are created by `npm run vercel-build` on every deploy (`scripts/migrate.ts`).
3. Optional, to load data from your machine: put the same `DATABASE_URL` in `.env.local` and run `npm run db:migrate` then `npm run demo:prewarm`.

## 4. Vercel

1. **Add New → Project →** import `shnkdev404/Interest-Engine-for-ADHD-Children`. Framework: Next.js (auto). Build command is set by `vercel.json` (`npm run vercel-build`: migrate, then build).
2. **Environment variables** (Production and Preview): `DATABASE_URL`, `ANTHROPIC_API_KEY`, `QLOO_API_KEY`, `QLOO_BASE_URL=https://hackathon.api.qloo.com`, `SESSION_SECRET`, `CRON_SECRET`, and `HINDSIGHT_URL` / `HINDSIGHT_API_KEY` if you have them.
3. Deploy. Then open `https://<your-app>.vercel.app/api/health`. Expect:
   `{"ok":true,"db":"postgres","qloo":"live","memory":"hindsight" or "local","claude":"claude-sonnet-5-5","sessionSecret":true}`
4. Prewarm the live deploy, once now and then weekly via the cron (Mondays 00:15 UTC, `vercel.json`). To trigger it by hand:

   ```bash
   curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://YOUR-APP.vercel.app/api/cron/prewarm
   ```

   Or run `npm run demo:prewarm` locally with the production `DATABASE_URL` in `.env.local`.
5. Function limits: agent routes use `maxDuration = 60`, the cron route 300. This assumes Fluid compute (the default for new projects). If Vercel rejects 300 on your plan, lower it to 60 in `app/api/cron/prewarm/route.ts` and run prewarm from your machine instead.

## 5. Hindsight

Choose one:

- **Hindsight Cloud:** use the URL and API key from your Hindsight account.
- **Self-host:** run the Hindsight Docker image on Railway, Fly or Render with its own Postgres + pgvector, following [hindsight.vectorize.io](https://hindsight.vectorize.io). The API listens on port 8888. Hindsight uses an LLM to extract memories on `retain`, so configure a model provider as its docs describe (Models / Configuration pages).

Then set `HINDSIGHT_URL` (and `HINDSIGHT_API_KEY` if your instance requires one) and redeploy. `/api/health` should show `"memory":"hindsight"`. Each demo child gets its own bank, `child_<uuid>`.

## 6. Smoke test on the live URL (5 minutes)

- [ ] Landing → **Explore as Arjun's parent** → This week loads in under 5 s, with the fading banner and tour.
- [ ] Log a mission as **Hard moment** with a note → **Plan again** → the plan changes (shorter or different theme). "Quick plan" label absent (agent ran).
- [ ] Insights: chart shows Minecraft 125 → 80 → 60, "dropped 41%", three Try next cards with Qloo picks.
- [ ] Compare: the left column has Claude's answer, the right has Qloo-cited picks.
- [ ] Landing → **Teacher? Explore a sample class** → Generate hooks for "Fractions" → five different hooks.
- [ ] Phone (375 px): no sideways scroll; bottom tabs work.
- [ ] Second browser / incognito gets its own Arjun (changes don't leak).

## 7. Submission checklist (Devpost)

- [ ] Live URL works in a fresh browser (above).
- [ ] Repo is public; `LICENSE` (MIT) shows in the GitHub About section.
- [ ] README explains setup and the demo path.
- [ ] Project description: what it does, why it's Qloo-powered (Compare view, grounding, next-interest discovery from audience taste tags), Hindsight memory, safety approach.
- [ ] No Qloo response data in the repo (`reports/`, `.data/` are git-ignored).
