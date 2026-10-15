# SparkPath — Technical Design

As of 2026-10-16. This file is the **how**: data model, schemas, algorithms, prompts and tests. System shape is in [ARCHITECTURE.md](ARCHITECTURE.md); screens and flows are in [UI_UX.md](UI_UX.md); reasons are in [DECISIONS.md](DECISIONS.md).

## 1. Domain concepts

| Concept | Meaning |
| --- | --- |
| Adult | The user: a parent or a teacher. Owns children or a class. |
| Child | A profile managed by an adult. Never logs in. |
| Interest | Something the child loves, linked to a Qloo entity (or tag). Status: `active`, `fading`, `paused`, `trial`. |
| Mission | A themed task: a real job (homework, chore, routine, reading) wrapped in an interest. |
| Format | How a mission is shaped: `short_mission` (≤15 min), `build`, `movement`, `reading_short`, `reading_long`, `screen_free`, `quiz`. |
| Outcome | What happened: `done`, `partial`, `skipped`, `meltdown`, plus minutes and an optional note. |
| Weekly plan | Missions + reading list + focus playlist + weekend activity + next-interest suggestions for one ISO week. |

## 2. Data model (Postgres, Drizzle)

```
adults           id, email, role('parent'|'teacher'), created_at
children         id, adult_id→adults, nickname, age_years, consent_at, consent_by, created_at
classes          id, teacher_id→adults, name
class_children   class_id→classes, child_id→children
interests        id, child_id→children, label, qloo_entity_id NULL, qloo_type NULL,
                 qloo_tag_id NULL, status, source('adult'|'suggested'), started_at, paused_at
plans            id, child_id, week_start (date), json (WeeklyPlan), model, created_at
missions         id, plan_id, interest_id NULL, subject('maths'|'reading'|'writing'|'chore'|'routine'|'other'),
                 format, title, steps (json), est_minutes, qloo_refs (json)
task_logs        id, mission_id, child_id, status, minutes, note NULL, logged_at
qloo_cache       key (sha256) PK, path, query (json), response (json, trimmed), created_at
demo_sessions    id, child_id, created_at, expires_at
```

Rules:

- Deleting a child cascades to interests, plans, missions, task_logs, and triggers Hindsight bank deletion.
- `task_logs.minutes` is entered by the adult with quick chips (5/10/15/20/30+), never measured from the child's device.
- No column for diagnosis, school, location or photo — by design.

## 3. Weekly plan schema

Validated with Zod on the agent's final output; invalid output triggers one repair turn, then a safe fallback.

```ts
type WeeklyPlan = {
  weekStart: string;                 // ISO date, Monday
  headline: string;                  // "Cricket week, with a dash of dinosaurs"
  insight?: {
    fading: { interestId: string; label: string; changePct: number }[]; // e.g. -41
    holding: { interestId: string; label: string; changePct: number }[];
    formatsThatWork: string[];       // from scorer + memory, e.g. ["short_mission"]
    summary: string;                 // ≤ 2 sentences, from Hindsight reflect
  };
  missions: {
    title: string;                   // "Build a cricket stadium, then measure the pitch"
    subject: "maths" | "reading" | "writing" | "chore" | "routine" | "other";
    interest: string;                // label of the hook interest
    format: Format;
    estMinutes: number;              // 5–30
    steps: string[];                 // 2–5 short steps, adult reads aloud
    qlooRefs: QlooRef[];             // entities that inspired it (may be empty)
  }[];                               // 5–7 per week
  readingList: { title: string; why: string; qlooRef: QlooRef }[];   // 3–5, all from Qloo books
  focusPlaylist: { title: string; why: string; qlooRef: QlooRef }[]; // 5–8, from Qloo artists
  weekendActivity: { title: string; why: string; qlooRefs: QlooRef[] };
  nextInterests: {
    label: string;                   // "LEGO building games"
    bridge: string;                  // "Fans of Minecraft and cricket also love…"
    starterMission: string;
    qlooRefs: QlooRef[];
  }[];                               // exactly 3 when any interest is fading, else 0–1
};

type QlooRef = { entityId: string; name: string; type: string };
```

Hard rule: every item in `readingList`, `focusPlaylist` and `nextInterests` must carry a `qlooRef` that exists in the tool results of this run. The validator rejects invented items. This is what makes the output provably Qloo-grounded.

## 4. Engagement scoring (deterministic)

Pure TypeScript, unit-tested; the agent reads its output, never computes it.

For each interest `i` and completed ISO week `w`:

```
minutes(i, w)    = Σ task_logs.minutes where mission.interest = i and status ∈ {done, partial}
completion(i, w) = count(done) / count(missions assigned)
baseline(i, w)   = mean(minutes(i, w-1), minutes(i, w-2))      // needs both weeks
change(i, w)     = (minutes(i, w) − baseline) / baseline
```

An interest is **fading** when all hold:

- `baseline ≥ 30` minutes (enough signal),
- `change ≤ −30%`,
- and either `completion(i, w) < completion(i, w-1)` or a negative note was retained this week ("boring", "didn't want to").

It is **holding** when `change > −15%`. It is **trial** for its first two weeks and is never flagged.

Arjun seed check: Minecraft weeks = 125, 80, 60 min → baseline 102.5 → change −41% → fading. Cricket steady → holding.

Format preference uses the same maths per `format` over the last 3 weeks: a format "works" when completion ≥ 70% and it's in the top two by minutes per mission.

## 5. Next-interest discovery (the Qloo core)

Triggered for each fading interest `F`, with the child's holding interests `H`:

1. **Signals.** `signal.interests.entities = F + H` (so suggestions sit between the old love and what still works).
2. **Breadth.** Call `/v2/insights` for `video_game`, `tv_show`, `book`, `movie` with `take=15` and `filter.exclude.entities` = every entity already in the child's interests or past plans.
3. **Tags.** Collect tags across results; group results by their most-shared tags (e.g. building, sport, animals, space). Each group is a candidate interest.
4. **Score** each candidate:
   `score = qloo_affinity_mean × age_fit × novelty × format_fit`
   - `qloo_affinity_mean`: mean rank-based score of its entities (Qloo order).
   - `age_fit`: share of its entities the age-fit filter kept.
   - `novelty`: 0 if any entity was tried in the last 8 weeks, else 1.
   - `format_fit`: 1.2 if its natural activities match a format that works, else 1.
5. **Pick top 3**; Claude names each one and writes the bridge sentence and a starter mission, only from the group's entities.

If Qloo returns too little (< 5 kept entities), fall back to tag-based discovery via `/v2/tags` with the fading interest's own tags.

## 6. Age-fit filter

- Input: trimmed Qloo entities + child age.
- Fast path: drop known adult signals (tags or descriptions with mature/explicit cues; TV/movie `filter.content_rating` where supported).
- Model path: `claude-haiku-5-5` classifies the rest in one batched call → `{entityId, fit: "yes"|"no"|"unsure", reason}`. `unsure` is dropped for children under 10.
- Results cached per `(entityId, ageBand)` where `ageBand ∈ {5–7, 8–10, 11–13}`.

## 7. Prompts (summary)

**Planner system prompt** (key rules):

1. You help a parent or teacher plan engaging tasks for a child. You never speak to the child.
2. Use tools to gather engagement, memory and Qloo data before writing.
3. Every book, song, show, game or next-interest you mention must come from a Qloo tool result in this conversation, with its entity id.
4. Shape missions to formats that work for this child; avoid formats linked to meltdowns.
5. Keep missions 5–30 minutes, 2–5 steps, doable at home with common items.
6. Prefer screen-free missions even when the hook is a video game.
7. Never use medical or clinical words (list in §8). Do not guess at conditions.
8. Return only `WeeklyPlan` JSON.

**AI-alone prompt** (compare view): same task, child's interest names only, no tools — deliberately the honest baseline.

## 8. Wording lint

Banned in any generated or UI text (case-insensitive, whole words): `treat`, `treatment`, `therapy`, `therapeutic`, `diagnose`, `diagnosis`, `symptom`, `cure`, `clinical`, `disorder`, `medication`, `prescribe`.
On a hit: one regeneration with the hit named; if it repeats, the offending sentence is dropped and logged. "ADHD" is allowed only in marketing copy, never in plan output.

## 9. API surface

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/demo` | Start a demo session (clone Arjun) |
| POST | `/api/children` | Create child (requires consent flag) |
| PATCH | `/api/children/:id/interests` | Add/pause interests (resolves via Qloo search) |
| POST | `/api/children/:id/plans` | Generate weekly plan (streamed) |
| GET | `/api/children/:id/insights?week=` | Engagement + memory summary |
| POST | `/api/missions/:id/outcome` | Log outcome |
| POST | `/api/children/:id/compare` | AI-alone vs SparkPath |
| POST | `/api/classes/:id/hooks` | Teacher lesson hooks |
| DELETE | `/api/children/:id` | Forget child (DB + Hindsight) |

## 10. Error handling and fallbacks

| Failure | Behaviour |
| --- | --- |
| Qloo 401/403 | Fail fast, alert in logs; demo still runs from cache |
| Qloo 200 with empty `entities` | Retry once with tag signal; then mark interest "low data" in UI |
| Hindsight down | Plan generates without memory; banner "memory unavailable this time" |
| Claude timeout / invalid JSON | One repair turn; then return last week's plan with a notice |
| Lint hit | See §8 |

## 11. Testing

- **Unit:** engagement scorer (Arjun numbers, edge cases: zero baseline, trial weeks), plan validator (rejects invented items), wording lint, Qloo response trimmer.
- **Contract:** recorded Qloo responses kept **outside git** (`.gitignore`d fixtures folder) for local tests only.
- **Agent evals:** 5 seeded children; check every plan validates, cites only real Qloo refs, uses no banned words, and respects formats that failed.
- **E2E (Playwright):** demo mode → plan → log meltdown → regenerate → plan changes.

## 12. Seed persona: Arjun

| Week | Minecraft | Cricket | Notes retained to memory |
| --- | --- | --- | --- |
| W-3 | 5/5 done, 125 min | 3/3, 75 min | "Asked for another fort mission" |
| W-2 | 4/5 done, 80 min | 3/3, 75 min | "Short missions beat the long reading one" |
| W-1 | 4/5 done, 60 min | 3/3, 80 min | "Said Minecraft is boring now"; "melted down at the long-division one" |

Reading missions: `reading_long` skipped twice, `reading_short` done twice → reading list leans short and comic-format.
