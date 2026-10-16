# SparkPath — Decision Log

Every major decision, the options compared, what we chose, why, and why not the others. Newest decisions are appended at the bottom with the next ID. Status: **Accepted**, **Proposed** (needs a check), or **Superseded by D-xx**.

As of 2026-10-16. Constraints that drive most choices:

- **C1 Deadline:** Oct 31, 2026, ~15 days, small team.
- **C2 Hackathon rules:** hosted live app, public repo, OSS licence, agentic, Qloo must be the differentiator, judges use the app themselves (no video).
- **C3 Children's data:** adult-only use, minimal data, verifiable parental consent (India DPDP Act, US COPPA), deletable.
- **C4 No medical claims.**
- **C5 Keys we have:** Qloo, Hindsight, Claude.

## Index

| ID | Decision | Status |
| --- | --- | --- |
| D-01 | Product name: SparkPath | Accepted |
| D-02 | Framework: Next.js (TypeScript, App Router) | Accepted |
| D-03 | Users: parent primary, teacher secondary, child never | Accepted |
| D-04 | Agent: Claude tool-use loop with deterministic guardrails | Accepted |
| D-05 | Models: Sonnet 5.5 planner, Haiku 5.5 classifier | Accepted |
| D-06 | Database: Neon Postgres + Drizzle | Accepted |
| D-07 | Memory: Hindsight, one bank per child | Accepted (hosting Proposed) |
| D-08 | Numbers in Postgres, meaning in Hindsight; deterministic fading score | Accepted |
| D-09 | Qloo cache in Postgres, never in git | Accepted |
| D-10 | Qloo signal strategy: entities first, kid lens via filter.tags, age-fit filter | Accepted (Phase 0 test, 2026-10-16) |
| D-11 | Safety: age-fit filter + wording lint + adult approval | Accepted |
| D-12 | UI kit: Tailwind + shadcn/ui | Accepted |
| D-13 | Hosting: Vercel | Accepted |
| D-14 | Auth: magic link + no-signup demo mode | Accepted |
| D-15 | Licence: MIT | Accepted |
| D-16 | Engagement data: adult-logged quick chips | Accepted |
| D-17 | Plan output: validated JSON with mandatory Qloo refs | Accepted |
| D-18 | Built-in "AI alone vs SparkPath" compare view | Accepted |
| D-19 | Manual tool-use loop instead of the SDK tool runner | Accepted |
| D-20 | Next interests must leave the fading franchise | Accepted |
| D-21 | Offline template planner as fallback and for instant demos | Accepted |
| D-22 | Lesson hooks: one structured call per class, not an agent per child | Accepted |
| D-23 | Self-hosted fonts instead of next/font/google | Accepted |
| D-24 | Fading v2: sustained signals, tuned on a simulator | Accepted |
| D-25 | School card: per school day, shared by parent and teacher | Accepted |

---

## D-01 · Product name

**Decision:** SparkPath.

| Option | Clear meaning | Avoids clinical tone (C4) | Distinct / searchable | Fits parent + teacher |
| --- | --- | --- | --- | --- |
| **SparkPath** | Interest sparks → a path through tasks | Yes | Reasonably distinct | Yes |
| Hyperfocus | Strong for ADHD insiders | No: it's a term from ADHD discussion, reads as a condition feature | Crowded (books, apps, podcasts) | Parent yes, school less so |
| InterestEngine | Literal | Yes | Generic | Feels technical |
| Obsessio / similar | Playful | Yes | Distinct | "Obsession" sounds negative to parents |

**Why:** it describes the product's two jobs (find the spark, build the path) without naming a condition, which keeps marketing and school sales clear of medical framing.
**Why not Hyperfocus:** strongest emotional pull for ADHD parents, but it ties the brand to a symptom-like term and is already widely used.
**Revisit if:** a trademark or domain check fails.

## D-02 · Application framework

**Decision:** Next.js (App Router) in TypeScript, one repo for UI and API.

| Option | Speed to ship (C1) | Hosted easily (C2) | Streaming agent UI | One language | Team familiarity (typical) |
| --- | --- | --- | --- | --- | --- |
| **Next.js** | High | Vercel one-click | Built-in (RSC, route handlers) | Yes | High |
| Remix / React Router 7 | High | Good | Good | Yes | Medium |
| SvelteKit | High | Good | Good | Yes | Lower |
| FastAPI + React SPA | Medium (two apps, two deploys) | Two hosts | Manual (SSE) | No | High for Python |
| Streamlit / Gradio | Very high | Easy | OK | Python | High |

**Why:** one deploy, first-class streaming for the plan generation, and the Anthropic, Hindsight (`@vectorize-io/hindsight-client`) and Zod ecosystems are all strong in TypeScript.
**Why not Streamlit/Gradio:** fastest prototype, but judges score **Design** as a complete product; these look like PoCs and can't do a polished parent flow.
**Why not FastAPI + React:** fine tech, but two services and two deploys cost days we don't have.
**Why not SvelteKit/Remix:** comparable, but smaller component ecosystem (shadcn/ui) and less common team familiarity.

## D-03 · Who the user is

**Decision:** parents are the primary user and drive the demo; teachers get one dedicated view; children never use the app directly.

| Option | Demo story strength | Privacy / consent (C3) | Build cost | Business path |
| --- | --- | --- | --- | --- |
| **Parent primary + teacher view** | Strong (Arjun's week) + shows B2B upside | Parent gives consent directly | Medium | B2C first, B2B later |
| Parent only | Strong | Simple | Low | B2C only, weaker impact story |
| Teacher only | Medium (class is abstract in 3 min) | Harder: consent flows through school | Medium | B2B, slow sales |
| Child-facing chat app | Flashy | Poor: open-ended AI talking to kids, COPPA/DPDP heavy | High | Risky |

**Why:** the parent is the buyer, holds consent, and the single-child story is what makes the "41% drop" moment land. A small teacher view shows the same engine scales to classrooms, which helps **Potential Impact** at little extra cost.
**Why not child-facing:** kids shouldn't chat with an open-ended model; it also multiplies safety and legal work.

## D-04 · Agent approach

**Decision:** a Claude tool-use loop (Anthropic SDK tool runner) with seven tools, wrapped in deterministic guardrails (scorer, validator, lint).

| Option | Counts as "agentic" (C2) | Control / predictability | Build time | Debuggability |
| --- | --- | --- | --- | --- |
| **Claude tool use + guardrails** | Yes: model chooses tools and order | High: tools are ours, output validated | Low | High (plain code) |
| Fixed pipeline (no tool choice) | Weak: judges may see a script | Highest | Lowest | Highest |
| LangGraph | Yes | High | Medium (framework learning) | Medium |
| CrewAI / multi-agent | Yes | Low for this task | Medium | Low |
| OpenAI Agents SDK | Yes | High | Low | High — but we're using Claude (D-05) |

**Why:** the hackathon requires an agentic tool; a tool-use loop is genuinely agentic (it decides whether to call `find_next_interests` only when something is fading), while our deterministic pieces keep the numbers and safety exact.
**Why not a fixed pipeline:** most predictable, but fails the "agentic" bar and can't adapt (e.g. skipping memory recall for a brand-new child).
**Why not LangGraph/CrewAI:** extra abstraction and learning time for a single-agent, seven-tool problem; multi-agent adds latency and failure modes with no gain here.

## D-05 · Models

**Decision:** `claude-sonnet-5-5` for planning and lesson hooks; `claude-haiku-5-5` for the batched age-fit classifier and lint repair. Same Sonnet model for the "AI alone" baseline.

| Option | Plan quality | Latency in a live demo | Cost | Notes |
| --- | --- | --- | --- | --- |
| **Sonnet 5.5 planner + Haiku 5.5 classifier** | High | Good | Medium | Right tool per job |
| Opus 5.5 everywhere | Highest | Slowest | Highest | Overkill for a 7-tool plan; risks timeouts on Vercel |
| Haiku 5.5 everywhere | Medium | Fastest | Lowest | Weaker multi-step tool use and writing |
| Mixed providers | Varies | Varies | Varies | More keys, more failure points |

**Why:** planning needs strong tool use and writing; classification is high-volume and simple. Using the **same** model for the baseline keeps the compare view honest: the only difference is Qloo + memory.
**Revisit if:** Phase 2 evals show plan quality issues → try Opus 5.5 for the planner only.

## D-06 · Database

**Decision:** Neon serverless Postgres with Drizzle ORM.

| Option | Relational fit (children → plans → logs) | Vercel fit | Free tier | Extras |
| --- | --- | --- | --- | --- |
| **Neon Postgres** | Strong | Native integration, preview branches | Yes | pgvector if ever needed |
| Supabase | Strong | Good | Yes | Auth, storage — we don't need them |
| SQLite / Turso | Good | OK | Yes | Weaker for concurrent judge traffic (Turso fine) |
| Firebase / Firestore | Weak (document model for relational data) | OK | Yes | Different query model for the scorer |

**Why:** the data is relational and the scorer is a few SQL aggregates; Neon's per-preview branches make the demo reset and seeding easy.
**Why not Supabase:** equally good Postgres; we'd pay for features we won't use. Swap is trivial if the team already knows it.

## D-07 · Memory layer

**Decision:** Hindsight, with **one memory bank per child**. Hosting: Hindsight Cloud if our access covers it; otherwise self-host the Docker image on Railway/Fly. *(Hosting is Proposed until day 1.)*

| Option | Learns patterns from free text | Time-aware recall | Per-child isolation + delete | Effort |
| --- | --- | --- | --- | --- |
| **Hindsight** | Yes: retain extracts facts/entities; reflect synthesises | Yes (temporal retrieval) | Bank per child | Low (SDK) |
| Postgres notes + our own embeddings | Only what we build | Manual | Easy | Medium-high |
| mem0 | Yes | Partial | Per-user | Low |
| Zep | Yes | Yes | Per-user | Low-medium |
| Long-context stuffing (all notes in the prompt) | Model does it each time | Weak at scale | Easy | Lowest |

**Why:** the concept depends on memory that turns scattered adult notes ("melted down at the long one", "said Minecraft is boring") into patterns; Hindsight does that with retain/recall/reflect, and we already have access.
**One bank per child vs one bank + tags:** Hindsight's FAQ suggests a single bank with user tags. We choose per-child banks because deleting a child's data must be one clean operation (C3) and cross-child leakage must be impossible.
**Why not stuffing:** works for 3 weeks of demo data but doesn't scale and doesn't show a real memory system to judges.

## D-08 · Where engagement numbers live

**Decision:** numbers (minutes, completions) in Postgres, scored by deterministic TypeScript; meaning (notes, patterns) in Hindsight. The agent reads both.

| Option | "41% drop" exact and reproducible | Explains *why* | Testable |
| --- | --- | --- | --- |
| **Split: Postgres numbers + Hindsight meaning** | Yes | Yes | Yes (unit tests) |
| Everything in Hindsight, LLM judges fading | No: an LLM estimate can change per run | Yes | Weak |
| Everything in Postgres, no memory system | Yes | Only keyword-level | Yes |

**Why:** the payoff screen must be true every time a judge loads it; arithmetic belongs in code. Memory is for what code can't parse well.

## D-09 · Qloo caching

**Decision:** server-side cache in a Postgres `qloo_cache` table keyed by request hash, no expiry during the hackathon; pre-warm the demo persona at deploy. Never commit Qloo data.

| Option | Survives serverless cold starts | Allowed by Qloo rules | Cost |
| --- | --- | --- | --- |
| **Postgres table** | Yes | Yes (private server-side caching allowed) | Free (same DB) |
| Upstash Redis | Yes | Yes | Another service |
| Next.js fetch cache | Partly; tied to deploys | Yes | Free |
| Fixtures committed to the repo | Yes | **No** — Qloo data must not be in a public repo | Free |
| No cache | n/a | Yes | Slow demo, burns quota |

**Why:** fast demo, quota-safe, compliant, no extra service.

## D-10 · Qloo signal strategy for kids

**Decision (Proposed, confirmed by Phase 0 test):** drive recommendations from the child's **interest entities** (Minecraft, cricket…), add **tag signals** when entity results are thin, and treat age as a **filter** (our age-fit layer), not the main signal.

| Option | Kid relevance (expected) | Precision | Risk |
| --- | --- | --- | --- |
| **Entities first + tags + our age filter** | High | High | Depends on entity coverage |
| `signal.demographics.age` as main signal | Low: Qloo's age bands target adults | Low | Adult-skewed results |
| Tags only | Medium | Medium | Broad, generic results |
| LLM guesses (no Qloo) | n/a | Low | Fails the hackathon's core test |

**Why:** Qloo's strength is "fans of X also love Y"; kids' interests are concrete entities (games, shows, characters), which is exactly where that works. Age bands in Qloo are aimed at adults.
**Revisit if:** the coverage test shows <7/10 interests returning usable kid results.

**Phase 0 result (2026-10-16, live hackathon API):** GO — 7/10 interests usable for a 9-year-old (Minecraft, cricket, dinosaurs, Pokémon, Bluey, LEGO, Roblox); Harry Potter and space weak; football failed on resolution. What the test found and what changed:

| Finding | Fix |
| --- | --- |
| `filter.type=urn:entity:video_game` returns 400; the live API uses `urn:entity:videogame` | `ENTITY_TYPES.video_game` now maps to `urn:entity:videogame` |
| "cricket" resolved to a town called Cricket (`urn:entity:locality`), rejected as a signal; Pokémon's TV entity is rejected too | `resolve()`: skip places/localities/people, prefer brands then media, keep the first candidate Qloo accepts (cached) |
| Entity signals reflect **adult** fan audiences: cricket → adult political books, Minecraft → explicit rap | **Kid lens**: `filter.tags` per type — books `urn:tag:genre:media:childrens`, TV/films `urn:tag:genre:media:family`, artists `urn:tag:genre:music:instrumental` (wordless focus music) |
| Games have no working kid tag; shooters (Apex, PUBG) and mature RPGs appear | Age-fit filter (Claude Haiku) is required for games; without a key, unknown games are dropped for under-10s |
| Generic topics (football, space) resolve to arbitrary entities | Next: resolve topics to tags (`/v2/tags`, e.g. `urn:tag:genre:media:cricket`) and signal with `signal.interests.tags` |
| The coverage script's keyword "adult" flag is noisy (flags Gravity Falls) | Hand-scoring is the real check; flags are a hint only |

## D-11 · Safety approach

**Decision:** three layers: (1) age-fit filter on every Qloo item (rules + Haiku classifier), (2) wording lint on all generated text, (3) adult reviews the plan before the child sees anything.

| Option | Catches adult content | Prevents medical claims (C4) | Cost / latency |
| --- | --- | --- | --- |
| **Filter + lint + adult approval** | Yes | Yes | Low (batched, cached) |
| Trust Qloo + prompt instructions only | Partly | Partly (prompts drift) | None |
| Hand-curated allow-lists | Yes | n/a | High effort; kills discovery |
| Human moderation queue | Yes | Yes | Too slow for the product |

**Why:** prompts alone are not a guarantee; cheap deterministic checks plus the adult in the loop give defence in depth without slowing the demo.

## D-12 · UI kit

**Decision:** Tailwind CSS + shadcn/ui (Radix primitives), lucide icons.

| Option | Polish out of the box | Accessibility | Customisable to a warm, non-clinical look | Speed |
| --- | --- | --- | --- | --- |
| **Tailwind + shadcn/ui** | High | Radix = strong | Full control (code is ours) | High |
| MUI | High | Good | Looks "enterprise" unless heavily themed | High |
| Chakra | Medium-high | Good | Good | High |
| Hand-rolled CSS | Depends | Manual | Full | Low |

**Why:** accessible primitives, our own design tokens, and fast iteration; avoids the default-Material look that reads as a back-office tool.

## D-13 · Hosting

**Decision:** Vercel for the app; Neon for Postgres; Hindsight per D-07.

| Option | Next.js support | Long agent requests | Preview deploys | Effort |
| --- | --- | --- | --- | --- |
| **Vercel** | Native | 60 s `maxDuration` on Node functions; streaming | Yes | Lowest |
| Render / Railway | Good (container) | No hard limit | Partial | Low |
| Fly.io | Good (container) | No hard limit | Manual | Medium |
| Cloudflare | Partial (adapter) | Workers limits | Yes | Medium |

**Why:** fastest path to a public URL (C2). Streaming keeps a 20–40 s agent run feeling responsive.
**Revisit if:** agent runs exceed 60 s regularly → move the agent route to Railway.

## D-14 · Authentication and judge access

**Decision:** email magic link (Auth.js) for real adults; a no-signup **demo mode** that clones the Arjun seed into a sandbox session.

| Option | Judge friction (C2) | Real-user safety | Effort |
| --- | --- | --- | --- |
| **Magic link + demo mode** | None for judges | Good | Low-medium |
| Shared test credentials | Medium; judges may collide on shared state | Poor | Low |
| No auth at all | None | Unsafe with children's data | Lowest |
| Clerk | None in demo | Good | Low, but a paid dependency |

**Why:** judges must be able to try the product in seconds, and each judge must see the same clean story.

## D-15 · Licence

**Decision:** MIT.

| Option | Required by hackathon | Simplicity | Reuse by schools/others |
| --- | --- | --- | --- |
| **MIT** | Satisfies "OSS licence" | Highest | Easiest |
| Apache-2.0 | Yes | High | Easy, adds patent grant |
| GPL-3.0 | Yes | Medium | Copyleft limits commercial path |

**Why:** simplest, widely understood, keeps a commercial future open. Apache-2.0 is equally valid if the team prefers a patent grant.

## D-16 · How engagement is measured

**Decision:** the adult logs each mission with one tap (done / partial / skipped / meltdown) and a minutes chip (5/10/15/20/30+), plus an optional note.

| Option | Accuracy | Privacy (C3) | Adult effort | Build |
| --- | --- | --- | --- | --- |
| **Adult quick log** | Good enough for trends | Strong: nothing on the child's device | ~5 s per task | Low |
| Timers / device tracking | High | Weak: monitoring a child | None | High |
| Child self-report | Low | Child becomes a user | Child effort | Medium |
| Weekly survey only | Low | Strong | Low | Low |

**Why:** trends need consistent, not precise, data; this keeps the child out of the system and the adult in control.

## D-17 · Plan output format

**Decision:** strict JSON (`WeeklyPlan`, Zod-validated) where every book, song, show, game and next interest must cite a Qloo entity returned in that run.

| Option | Renders into a real UI | Prevents invented items | Testable |
| --- | --- | --- | --- |
| **Validated JSON + mandatory Qloo refs** | Yes | Yes | Yes |
| Free-text markdown | Only as a blob | No | No |
| JSON without ref check | Yes | No | Partly |

**Why:** it's both the design requirement (cards, checkboxes, "why this") and the proof that Qloo, not the LLM, is the source.

## D-18 · Built-in compare view

**Decision:** ship an in-app "AI alone vs SparkPath" view for the same child.

| Option | Shows Qloo is the differentiator (C2) | Effort |
| --- | --- | --- |
| **In-app live compare** | Yes, judges see it themselves | Low (two calls) |
| Claim it in the Devpost text | Weak | None |
| Screenshot in README | Static, easy to doubt | Very low |

**Why:** the hackathon says "if it works the same without Qloo, you're building the wrong thing"; this view lets judges verify it in one click.

## D-19 · Agent loop implementation

**Decision:** a hand-written tool-use loop over `client.beta.messages.create` (`lib/agent/planner.ts`), not the SDK's beta tool runner.

| Option | Repair turn with full history | Hard tool-call cap | Per-run grounding set | Code to own |
| --- | --- | --- | --- | --- |
| **Manual loop** | Yes: we hold `messages` | Yes, reserved before each parallel batch | Yes (tool context) | ~100 lines |
| SDK tool runner (`toolRunner` + `betaZodTool`) | Awkward: history lives in the runner | `max_iterations` counts turns, not calls | Possible via closures | Least |
| Agent framework (LangGraph etc.) | Yes | Yes | Yes | Framework + learning time |

**Why:** validation-then-repair is central (D-17), and it needs the exact conversation, thinking blocks included, to continue. The loop is small and fully unit-tested with a scripted fake client.
**Why not the tool runner:** it's the recommended default for simple agents, but our control points (repair turns, call budget, grounding) sit outside what its hooks expose cleanly.
**Revisit if:** we add streaming to the UI and the runner's `stream: true` mode would save significant code.

## D-20 · Next interests must leave the fading franchise

**Decision:** discovery drops any item whose name contains a fading interest's label (e.g. *Minecraft: The Island* when Minecraft is fading).

| Option | Suggestions feel new | Risk |
| --- | --- | --- |
| **Drop same-franchise items** | Yes | Misses a spin-off the child might like (acceptable: the reading list can still use it) |
| Keep them, rely on scoring | No: franchise items score highest because they share every tag | The "next obsession" is the old one |
| Ask Claude to avoid them | Usually | Not guaranteed; not testable |

**Why:** found in the first tool run on the seed. The fading interest's own products dominated the candidates, which defeats the feature's purpose.

## D-21 · Offline template planner

**Decision:** keep a deterministic planner (`lib/plan/fallback.ts`) that composes a grounded plan from the agent's own tools plus fixed mission templates. It's used when Claude is unavailable or fails, and to give new demos a plan instantly. Plans are labelled in the UI.

| Option | Demo loads fast | Works without Claude | Plan quality | Honest to judges |
| --- | --- | --- | --- | --- |
| **Offline planner + label** | Yes | Yes | Template missions; Qloo picks and memory still real | Yes, labelled |
| Always call the agent on demo start | No: 20–40 s wait | No | Best | Yes |
| Commit a pre-written demo plan | Yes | Yes | Good | No: live Qloo data can't be committed (D-09), and it wouldn't react to logging |
| Show an error when Claude is down | n/a | No | n/a | Yes, but the product breaks |

**Why:** the first screen must load in seconds (PLAN.md definition of done), and the product shouldn't break when the model is slow or a key is missing. Grounding and the scorer are shared, so the offline plan still proves the Qloo + memory story.
**Revisit if:** the prewarmed agent plan covers every demo week reliably; then the offline planner is only a failure fallback.

## D-22 · Lesson hooks as a workflow

**Decision:** gather each child's context in code, then make **one** structured-output Claude call for the whole class (`messages.parse` + Zod).

| Option | Latency for 5 children | Cost | Consistency across the class | Grounding |
| --- | --- | --- | --- | --- |
| **Code gathers context, one structured call** | One model call (~10 s) | Lowest | High: one pass sees every child | Checked per child in code |
| Planner agent per child | 5 agent runs | ~5× | Varies per run | Same, but more to check |
| One call per child, no agent | 5 calls in parallel | ~2× | Varies | Same |

**Why:** the steps are fixed (interest → picks → hook), so a model choosing tools adds nothing. The weekly planner stays agentic because there the model decides whether discovery is needed. One pass over the class also keeps hooks parallel in shape, matching UI_UX.md §4.4 (one lesson, the same content, a different theme per child).

## D-23 · Self-hosted fonts

**Decision:** Inter and Nunito come from `@fontsource-variable/*` npm packages instead of `next/font/google`.

| Option | Build depends on network | Privacy | Effort |
| --- | --- | --- | --- |
| **@fontsource-variable packages** | No | No third-party font requests | Two imports |
| next/font/google | Yes: downloads at build/dev time | Self-hosted after build | Built in |
| System fonts only | No | Best | None, but loses the friendly display face |

**Why:** two dev/build runs failed when Google Fonts couldn't be reached. A deploy shouldn't depend on that.

## D-24 · Fading detection v2

**Decision:** replace the single-week % rule with CUSUM + Beta-Binomial signals that must hold in both recent weeks, skip adult-marked break weeks, and add rest → probe instead of treating a faded interest as gone.

| Option | One bad week | Break week | Real decline caught | Explainable |
| --- | --- | --- | --- | --- |
| **v2 (built)** | flagged 11% | 0% | 91% / 85% | Signals in plain words + confidence |
| v1 single-week % drop | flagged 100% | 100% | 83% / 61% | A number only |
| Bayesian changepoint (Adams & MacKay) | likely good | needs priors | likely good | Hard to explain in 3–8 points |

Numbers: `lib/eval/fading-sim.ts`, 200 runs per scenario, seed 42; overall F1 0.52 → 0.91.
**Why:** the payoff screen must be right *and* trustworthy; a false "fading" for a holiday or one bad day erodes parent trust fast. Rest-then-retry follows Kapoor et al. (2015): interest often recovers after a break.
**Revisit if:** real logs show different patterns than the simulator; re-tune with real data.

## D-25 · School card design

**Decision:** one card per child: 1–4 targets, yes / not yet per school day, a home reward at a threshold. Parent and teacher use the same component and data; a summary goes to memory once per completed day.

| Option | Evidence fit | Effort for adults | Notes |
| --- | --- | --- | --- |
| **Per day, 1–4 targets, shared** | DRC literature (Iznardo 2020; Fabiano 2025) | ~10 seconds a day | Works when the teacher isn't on SparkPath: the parent ticks from a paper note |
| Per lesson period | Closer to classic DRCs | Higher for teachers | Later, if schools ask |
| Points / behaviour feed (ClassDojo-style) | Weaker; public points criticised | Low | Not built: no public scores, no deductions |

**Why:** the strongest-evidence intervention we found, and it links home and school through the same memory. Colours are never red; "Not yet" instead of "No".

---

## Template for new decisions

```
## D-xx · Title
**Decision:** …
| Option | criterion 1 | criterion 2 | … |
**Why:** …
**Why not <option>:** …
**Revisit if:** …
```
