// Offline planner: builds a WeeklyPlan from the same tools the agent uses,
// with fixed mission templates instead of Claude. Used when Claude isn't
// configured or fails, and to make demo mode load instantly. Plans made this
// way are labelled in the UI; they still only cite Qloo entities.
import { runTool, type ToolContext } from "@/lib/agent/tools";
import { mondayOf } from "@/lib/dates";
import type { Format } from "@/lib/engagement/score";

import { checkGrounding, WeeklyPlan, type Mission, type QlooRef } from "./schema";

export const OFFLINE_MODEL = "offline-template";

type Brief = { entityId: string; name: string; type?: string; tags: string[] };

const TEMPLATES: Record<Format, { subject: Mission["subject"]; title: string; steps: string[] }[]> = {
  build: [
    { subject: "maths", title: "Build a {i} scoreboard from blocks and add up the totals", steps: ["Build the scoreboard", "Make up three scores", "Add them up and check together"] },
    { subject: "chore", title: "{i} builder's tidy-up: sort toys into labelled 'chests'", steps: ["Make three labels", "Sort everything into the right chest", "Count what's in each one"] },
  ],
  movement: [
    { subject: "maths", title: "{i} relay: one lap for every times-table answer", steps: ["Pick a times table", "Answer, then run a lap", "Keep score of laps"] },
  ],
  short_mission: [
    { subject: "writing", title: "Write 3 sentences about your best {i} moment", steps: ["Talk about the moment first", "Write three sentences", "Read them out loud"] },
    { subject: "routine", title: "{i} bedtime countdown: pyjamas, teeth, book in 15 minutes", steps: ["Set a 15-minute timer", "Pyjamas, teeth, book", "Beat the timer for a stamp"] },
  ],
  reading_short: [
    { subject: "reading", title: "Read 3 pages about {i} and share one fact", steps: ["Pick 3 pages", "Read them together", "Say one fact you learned"] },
  ],
  screen_free: [
    { subject: "other", title: "Draw a {i} poster for the fridge", steps: ["Plan the poster", "Draw and colour it", "Stick it up"] },
  ],
  quiz: [{ subject: "maths", title: "{i} quiz: 5 quick questions", steps: ["Ask five questions", "Check the answers", "Celebrate the score"] }],
  reading_long: [{ subject: "reading", title: "Read a chapter about {i}", steps: ["Find a quiet spot", "Read the chapter", "Talk about what happened"] }],
};

const MINUTES: Record<Format, number> = {
  build: 20, movement: 20, short_mission: 15, reading_short: 10, screen_free: 20, quiz: 10, reading_long: 25,
};

const TYPE_WORD: Record<string, string> = { videogame: "games", tv_show: "shows", book: "stories", movie: "films" };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

export async function buildOfflinePlan(ctx: ToolContext): Promise<WeeklyPlan> {
  const call = async <T>(name: string, input: unknown = {}) => {
    const r = await runTool(ctx, name, input);
    if (!r.ok) throw new Error(`${name} failed: ${JSON.stringify(r.result)}`);
    return r.result as T;
  };
  const toRef = (b: Brief): QlooRef => ctx.seen.get(b.entityId)!;

  const eng = await call<{
    interests: { label: string; changePct: number | null; state: string }[];
    formatsThatWork: Format[];
    formatsToAvoid: Format[];
  }>("get_engagement");

  const holding = eng.interests.filter((i) => i.state !== "fading").map((i) => i.label);
  const fading = eng.interests.filter((i) => i.state === "fading").map((i) => i.label);
  const hooks = holding.length ? holding : fading;

  const expanded = await call<Record<string, { items: Brief[] }>>("expand_interests", {
    interests: [...hooks, ...fading].slice(0, 4),
    types: ["book", "artist", "movie", "tv_show"],
    take: 8,
  });
  const next = fading.length
    ? await call<{ candidates: { tasteTag: string; bridges: string[]; examples: Brief[] }[] }>("find_next_interests")
    : { candidates: [] };

  // A movement break comes first, before focused work.
  const missions: Mission[] = [
    {
      title: `Active warm-up: 10 minutes of ${hooks[0]} moves before homework`,
      subject: "break",
      interest: hooks[0],
      format: "movement",
      estMinutes: 10,
      steps: [`Pick three moves from ${hooks[0]} or anything active`, "Do each one for about 3 minutes", "Drink some water, then start the next mission"],
      qlooRefs: [],
    },
  ];

  // Missions: formats that work first, nothing to avoid; mostly holding hooks.
  const avoid = new Set(eng.formatsToAvoid);
  const formats = [...eng.formatsThatWork, "short_mission", "build", "movement", "screen_free"].filter(
    (f, i, a) => !avoid.has(f as Format) && a.indexOf(f) === i,
  ) as Format[];
  const used = new Set<string>();
  const fill = (title: string, i: string) => title.replace("{i}", i).replace(/^./, (c) => c.toUpperCase());
  for (let n = 0; missions.length < 5 && n < 20; n++) {
    const format = formats[n % formats.length];
    const interest = n === 3 && fading.length ? fading[0] : hooks[n % hooks.length];
    const t = TEMPLATES[format].find((x) => !used.has(x.title + interest)) ?? TEMPLATES[format][0];
    if (used.has(t.title + interest)) continue;
    used.add(t.title + interest);
    // Choice of two: the same job wrapped in the other hook, or another format.
    const otherHook = hooks.find((h) => h !== interest);
    const altFormat = formats.find((f) => f !== format && TEMPLATES[f].some((x) => x.subject === t.subject));
    const altTemplate = otherHook ? t : altFormat ? TEMPLATES[altFormat].find((x) => x.subject === t.subject) : undefined;
    missions.push({
      title: fill(t.title, interest),
      subject: t.subject,
      interest,
      format,
      estMinutes: MINUTES[format],
      steps: t.steps,
      qlooRefs: [],
      ...(altTemplate && { alt: { title: fill(altTemplate.title, otherHook ?? interest), steps: altTemplate.steps } }),
    });
  }

  // A choice must be a real alternative, not another mission already in the plan.
  const titles = new Set(missions.map((m) => m.title));
  for (const m of missions) if (m.alt && titles.has(m.alt.title)) delete m.alt;

  // A resting interest that's due gets one short, easy retry.
  const thisWeek = ctx.now.toISOString().slice(0, 10);
  const due = ctx.interests.filter((i) => i.status === "dormant" && !!i.resurfaceOn && i.resurfaceOn <= thisWeek);
  for (const d of due.slice(0, 1)) {
    missions.push({
      title: `Quick retry: 10 minutes of ${d.label}, your way`,
      subject: "other",
      interest: d.label,
      format: "short_mission",
      estMinutes: 10,
      steps: [`Choose any small ${d.label} thing to do`, "Do it for 10 minutes", "Tell us if you'd like more of it"],
      qlooRefs: [],
      probe: true,
    });
  }

  const shortReads = eng.formatsThatWork.includes("reading_short");
  const books = [...(expanded.book?.items ?? [])].sort(
    (a, b) => Number(shortReads && b.tags.some((t) => /short|comic/.test(t))) - Number(shortReads && a.tags.some((t) => /short|comic/.test(t))),
  );
  const artists = expanded.artist?.items ?? [];
  // Weekend pick: something new, not the fading interest's own franchise.
  const isFading = (name: string) => fading.some((f) => name.toLowerCase().includes(f.toLowerCase()));
  const watch = [...(expanded.movie?.items ?? []), ...(expanded.tv_show?.items ?? [])].find((e) => !isFading(e.name));
  const fans = list(hooks);

  const nextInterests = next.candidates.slice(0, 3).map((c) => {
    const types = c.examples.map((e) => e.type ?? "");
    const typeWord = TYPE_WORD[["videogame", "tv_show", "book", "movie"].find((t) => types.includes(t)) ?? ""] ?? "picks";
    const ex = c.examples.slice(0, 2).map((e) => e.name);
    return {
      label: `${cap(c.tasteTag)} ${typeWord}`.slice(0, 40),
      bridge: `Fans of ${list([...fading, ...c.bridges.filter((b) => !fading.includes(b))])} also love ${list(ex)}.`.slice(0, 240),
      starterMission: `Look at ${ex[0]} together, then turn your favourite part into a 10-minute mission.`.slice(0, 160),
      qlooRefs: c.examples.slice(0, 3).map(toRef),
    };
  });

  const fadingInsight = eng.interests.filter((i) => i.state === "fading");
  const plan = {
    weekStart: mondayOf(ctx.now),
    headline: `${cap(hooks[0])} week${nextInterests[0] ? `, plus ${nextInterests[0].label.toLowerCase()}` : ""}`.slice(0, 80),
    insight: {
      fading: fadingInsight.map((i) => ({ label: i.label, changePct: i.changePct ?? 0 })),
      holding: eng.interests.filter((i) => i.state === "holding").map((i) => ({ label: i.label, changePct: i.changePct ?? 0 })),
      formatsThatWork: eng.formatsThatWork,
      summary: [
        ...fadingInsight.map((i) => `${i.label} dropped ${Math.abs(i.changePct ?? 0)}% against the two weeks before.`),
        eng.formatsThatWork.length ? `Finished most often: ${eng.formatsThatWork.map((f) => f.replace(/_/g, " ")).join(", ")}.` : "",
      ].join(" ").trim().slice(0, 320),
    },
    missions,
    readingList: books.slice(0, 4).map((b) => ({
      title: b.name,
      why: `Fans of ${fans} also love it${shortReads && b.tags.some((t) => /short|comic/.test(t)) ? " — short and quick to finish" : ""}.`,
      qlooRef: toRef(b),
    })),
    focusPlaylist: artists.slice(0, 6).map((a) => ({
      title: a.name,
      why: a.tags.some((t) => /calm|instrumental/.test(t)) ? "Calm, mostly wordless music for focus." : `Popular with fans of ${fans}.`,
      qlooRef: toRef(a),
    })),
    weekendActivity: watch
      ? { title: `Watch ${watch.name} together, then act out a favourite scene`, why: `Fans of ${fans} also love it, and acting it out keeps it active.`, qlooRefs: [toRef(watch)] }
      : { title: `A ${hooks[0]} afternoon outdoors`, why: `${cap(hooks[0])} is holding strong.`, qlooRefs: [] },
    rewards: [
      ...(expanded.tv_show?.items ?? []).filter((e) => !isFading(e.name)).slice(0, 1).map((e) => ({
        title: `An episode of ${e.name}`.slice(0, 60),
        why: `Fans of ${fans} also love it.`,
        qlooRef: toRef(e),
      })),
      ...books.slice(0, 1).map((b) => ({ title: `A chapter of ${b.name}`.slice(0, 60), why: "Read together, on the sofa.", qlooRef: toRef(b) })),
      ...artists.slice(0, 1).map((a) => ({ title: `Dance break to ${a.name}`.slice(0, 60), why: "Two songs, loud.", qlooRef: toRef(a) })),
      { title: `15 minutes of ${hooks[0]}`.slice(0, 60), why: `${cap(hooks[0])} is still a favourite.`, qlooRef: null },
    ].slice(0, 4),
    nextInterests,
  };

  const parsed = WeeklyPlan.parse(plan);
  const errors = checkGrounding(parsed, ctx.seen, { requireNextInterests: false, probeDue: due.slice(0, 1).map((d) => d.label) });
  if (errors.length) throw new Error(`Offline plan failed grounding: ${errors.join("; ")}`);
  return parsed;
}
