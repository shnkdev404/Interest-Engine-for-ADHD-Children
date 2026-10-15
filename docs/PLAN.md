# SparkPath — Project Plan

> An interest engine for kids with ADHD. Adults (parents, teachers) use it to turn a child's current obsessions into homework, reading, chores and routines the child wants to do, and to find the next obsession before the current one burns out.

As of: 2026-10-16 · Hackathon: **Qloo Agentic Hackathon** ("Agents, but with taste") · Deadline: **Oct 31, 2026, 9:15 am** (time shown on Devpost; confirm timezone on the dates page)

Related docs: [ARCHITECTURE.md](ARCHITECTURE.md) · [DESIGN.md](DESIGN.md) · [DECISIONS.md](DECISIONS.md) · [UI_UX.md](UI_UX.md)

---

## 1. Goal

Ship a **hosted, working, agentic web app** that judges can use end-to-end without signing up, where Qloo's taste graph and Hindsight memory make the output clearly better than an LLM alone.

The one screen the whole project builds toward:

> "Minecraft engagement dropped 41% this week. Cricket is holding. Here are 3 related interests to try next."

## 2. What the hackathon requires (from Devpost)

| Requirement | How we meet it |
| --- | --- |
| Working app that integrates the Qloo API and is agentic / uses an agent framework | Claude tool-use agent with Qloo, memory and engagement tools ([ARCHITECTURE.md](ARCHITECTURE.md)) |
| "If it works the same without Qloo, you're building the wrong thing" | Side-by-side "AI alone vs SparkPath" view built into the app |
| Link to a live, externally hosted demo (no local-only) | Vercel deploy + hosted Postgres + hosted Hindsight |
| Public repo with all code and run instructions | GitHub, README with setup |
| Open-source licence visible in repo About | MIT `LICENSE` file |
| Text description | Devpost write-up (draft in phase 5) |
| No demo video required; judges use the app | One-click **"Explore as Arjun's parent"** demo mode, no signup |

Judging criteria and where we score:

| Criterion | Our answer |
| --- | --- |
| Technological implementation (depth of Qloo use) | Search → entity resolution → multi-type Insights → tag discovery → exclusion of already-tried items → cached, filtered, explained results |
| Design (complete product, not a PoC) | Full parent flow: onboarding, weekly plan, logging, insights; plus teacher class view |
| Potential impact | Real, specific audience (parents/teachers of kids with ADHD), real pain (interest burnout), credible business model |
| Quality of idea (non-obvious Qloo use) | Taste graph used to predict a *child's next obsession*, not to recommend a movie |

## 3. Qloo API facts we build on

From the [hackathon developer guide](https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide):

- Key: request via the [hackathon key form](https://forms.gle/zz12orkLHTAneLGz6); issued by email within a few business days (check spam).
- Base URL `https://hackathon.api.qloo.com`, header `X-Api-Key`. Hackathon keys fail on other URLs; the [recipes](https://docs.qloo.com/recipes) use `api.qloo.com`, so swap the base URL when copying them.
- Response shapes: `/search` → flat `results[]`; `/v2/insights` → `results.entities[]`; `/v2/tags` and tag insights → `results.tags[]`.
- `signal.demographics.age` takes adult bands such as `25_to_29`; kid ages aren't a band, which is why age is our own filter (D-10).
- `GET /v2/insights` with required `filter.type`; signals via `signal.interests.entities` / `signal.interests.tags`.
- Resolve names with `/search`; find tags with `/v2/tags`.
- Entity types we use: `urn:entity:book`, `urn:entity:tv_show`, `urn:entity:video_game`, `urn:entity:movie`, `urn:entity:artist`.
- Invalid params are **silently ignored**; empty `entities` usually means a bad param for that type.
- Server-side caching allowed with no time limit. **Qloo response data must not be committed to the public repo.**
- Keys are deactivated after the hackathon closes.

## 4. Scope

**In v1 (hackathon):**

- Parent flow: child profile → interests → agent-generated weekly plan → one-tap outcome logging → weekly insight with fading detection and next-interest suggestions.
- Plan contents: themed missions (homework/chores/routines), reluctant-reader list, focus playlist, weekend activity.
- "AI alone vs SparkPath" comparison view.
- Teacher flow: class roster (5 seeded children), one lesson → one hook per child.
- Demo mode with seeded persona Arjun (9, Minecraft + cricket, avoids reading) and 3 weeks of history.
- Safety: adult-only use, age-fit filter, banned medical wording, delete-child-data.

**Out of v1:** child-facing UI, native apps, payments, real school SSO, multi-language, push notifications.

## 5. Milestones (15 days)

| Dates | Phase | Exit criteria |
| --- | --- | --- |
| Oct 16–17 | **0. Foundations + Qloo go/no-go** | Coverage script run on 10 kid interests; ≥7/10 return 5+ age-fit results per type. Repo, licence, Vercel "hello" deploy live. |
| Oct 18–20 | **1. Data + integrations** | Postgres schema migrated; Qloo client with cache; Hindsight bank per child; Arjun seed loads. |
| Oct 21–24 | **2. Agent** | Tool-use agent produces a valid weekly plan JSON; engagement scorer flags Minecraft fading from seed; next-interest step works. |
| Oct 22–27 | **3. Parent UI** | Onboarding, plan, logging, insights, compare view all wired to real APIs. |
| Oct 27–28 | **4. Teacher view** | Class of 5, one lesson → 5 hooks. |
| Oct 29–30 | **5. Polish + submit** | Copy review (no medical words), judge test pass by someone outside the team, Devpost text, **submit by Oct 30** (one day buffer). |

### Phase 0 detail — Qloo coverage test (do first)

Interests: Minecraft, cricket, dinosaurs, Pokémon, Bluey, LEGO, Roblox, Harry Potter, football, space.

For each: `/search` → best entity → `/v2/insights` for book, tv_show, video_game, movie, artist with `take=10`. Record:

| Field | Meaning |
| --- | --- |
| entity_found | Did `/search` return a sensible entity |
| results_per_type | Count of entities per type |
| kid_relevant_pct | Hand-scored share a parent of a 9-year-old would accept |
| junk | Notable adult or off-topic results |

Also test `signal.demographics.age` (lowest band) and tag-based signals (via `/v2/tags`, e.g. "children's", "middle grade") to see which raises kid relevance.

**Fail plan:** if coverage is weak, lean on tag signals and the Claude age-fit filter; restrict the demo to interests that pass.

## 6. Team split (suggested for 3)

| Owner | Area |
| --- | --- |
| A | Qloo client, coverage test, caching, age-fit filter |
| B | Agent, tools, Hindsight, engagement scorer, seed data |
| C | Next.js UI from day 1 against mocked JSON, then real APIs; deploy |

Solo builder: follow the phase order; build UI against mocks while waiting on nothing.

## 7. Definition of done (demo)

- [ ] Live URL works in a fresh browser, no signup, in under 5 seconds to first screen.
- [ ] Compare view shows LLM-alone vs SparkPath for Arjun, live.
- [ ] Weekly insight computes the 41% drop from logged data, not hard-coded text.
- [ ] Logging a "meltdown" on a task visibly changes the regenerated plan.
- [ ] Every recommended item is traceable to a Qloo entity (hover/"why this").
- [ ] Teacher view generates 5 different hooks for one lesson.
- [ ] No banned words anywhere in UI or generated text (automated check).
- [ ] Public repo, MIT licence, README, no Qloo data committed.

## 8. Risks

| Risk | Mitigation |
| --- | --- |
| Qloo results skew adult | Phase 0 test; tag signals; age-fit filter |
| Qloo/LLM latency during judging | Server-side cache; pre-warm Arjun; streamed UI |
| Hindsight hosting is fiddly | Decide hosted vs self-hosted on day 1; fallback: Postgres-only notes store behind the same interface |
| Judges see empty memory | Demo mode always resets to seeded state |
| Key revoked or quota hit near deadline | Cache everything for demo persona; ask in Discord `#api-help` early |

## 9. Open questions

- [ ] Hindsight: Cloud (early access) or self-hosted Docker on Railway/Fly? (see [DECISIONS.md](DECISIONS.md) D-07)
- [ ] Confirm deadline timezone on Devpost dates page.
- [ ] Final name check: SparkPath vs Hyperfocus (D-01).
