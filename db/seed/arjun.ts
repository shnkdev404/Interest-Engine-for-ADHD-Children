// Demo persona (DESIGN.md §12): Arjun, 9, loves Minecraft and cricket, avoids
// long reading. Three finished weeks of history, relative to the week being
// evaluated, so the story stays the same whenever the demo is loaded:
//   Minecraft 125 → 80 → 60 min (−41% vs baseline 102.5, "boring" note) → fading
//   Cricket    75 → 75 → 80 min → holding
// Mission titles are our own; nothing here comes from Qloo.
import type { Format, OutcomeStatus } from "@/lib/engagement/score";

export type InterestKey = "minecraft" | "cricket";
type Subject = "maths" | "reading" | "writing" | "chore" | "routine" | "other";

export type SeedMission = {
  week: 0 | 1 | 2; // 0 = oldest (W-3), 2 = evaluated week (W-1)
  day: number; // 0 = Monday
  interest: InterestKey | null;
  subject: Subject;
  format: Format;
  title: string;
  steps: string[];
  estMinutes: number;
  outcome: { status: OutcomeStatus; minutes: number; note?: string };
};

export const ARJUN = {
  nickname: "Arjun",
  ageYears: 9,
  parent: { email: "priya.demo@sparkpath.local", displayName: "Priya" },
  interests: [
    { key: "minecraft" as const, label: "Minecraft", qlooType: "urn:entity:videogame", weeksAgoStarted: 20 },
    { key: "cricket" as const, label: "cricket", qlooType: null, weeksAgoStarted: 30 },
  ],
};

const done = (minutes: number, note?: string) => ({ status: "done" as const, minutes, note });
const skipped = (note?: string) => ({ status: "skipped" as const, minutes: 0, note });

const mc = (
  week: SeedMission["week"],
  day: number,
  subject: Subject,
  format: Format,
  title: string,
  outcome: SeedMission["outcome"],
  estMinutes = 20,
): SeedMission => ({
  week, day, interest: "minecraft", subject, format, title, estMinutes, outcome,
  steps: ["Read the mission card together", "Do the building or puzzle part", "Check the answer and stamp the card"],
});

const ck = (
  week: SeedMission["week"],
  day: number,
  subject: Subject,
  format: Format,
  title: string,
  outcome: SeedMission["outcome"],
): SeedMission => ({
  week, day, interest: "cricket", subject, format, title, estMinutes: 25, outcome,
  steps: ["Set up the 'pitch' (hallway or garden)", "Play the round", "Write down the score"],
});

const reading = (
  week: SeedMission["week"],
  day: number,
  format: "reading_long" | "reading_short",
  title: string,
  outcome: SeedMission["outcome"],
): SeedMission => ({
  week, day, interest: null, subject: "reading", format, title,
  estMinutes: format === "reading_long" ? 30 : 10, outcome,
  steps: ["Pick a comfy spot", "Read together", "Tell me one thing that happened"],
});

export const ARJUN_MISSIONS: SeedMission[] = [
  // W-3: Minecraft 5 × 25 = 125 min
  mc(0, 0, "maths", "build", "Fort maths: count the blocks in your fort wall", done(25, "Asked for another fort mission")),
  mc(0, 1, "chore", "build", "Inventory sort: tidy your toy shelf like a chest", done(25)),
  mc(0, 2, "writing", "short_mission", "Write 3 sentences about your best Minecraft build", done(25), 15),
  mc(0, 3, "maths", "build", "Redstone patterns: continue the number pattern", done(25)),
  mc(0, 5, "routine", "short_mission", "Creeper-proof bedtime: pyjamas, teeth, book in 15", done(25), 15),
  ck(0, 1, "maths", "movement", "Run-rate maths: score 30 runs in 5 overs", done(25)),
  ck(0, 3, "chore", "short_mission", "Kit check: pack your school bag like a cricket kit", done(25)),
  ck(0, 6, "maths", "build", "Build a scoreboard and add up the innings", done(25)),
  reading(0, 4, "reading_long", "Read chapter 1 of a chapter book", skipped()),

  // W-2: Minecraft 4 × 20 = 80 min, 1 skipped (long reading)
  mc(1, 0, "maths", "build", "Village trade: buy and sell with emerald counters", done(20)),
  mc(1, 1, "chore", "short_mission", "Mine the laundry: sort socks into pairs", done(20), 15),
  mc(1, 2, "maths", "build", "Area of your house: count squares on graph paper", done(20)),
  mc(1, 3, "writing", "short_mission", "Write a 4-line sign for your Minecraft base", done(20), 15),
  mc(1, 4, "reading", "reading_long", "Read chapter 2 of Minecraft: The Island", skipped("Short missions beat the long reading one"), 30),
  ck(1, 1, "maths", "movement", "Run-rate maths: chase 40 in 6 overs", done(25)),
  ck(1, 3, "chore", "short_mission", "Groundskeeper: water the plants before the match", done(25)),
  ck(1, 6, "maths", "build", "Make a fielding chart and count the catches", done(25)),
  reading(1, 5, "reading_short", "Read a 2-page cricket comic", done(10)),

  // W-1 (evaluated): Minecraft 4 × 15 = 60 min, 1 hard moment (long division)
  mc(2, 0, "maths", "build", "Fort maths: how many blocks for a 6 × 4 floor", done(15)),
  mc(2, 1, "chore", "short_mission", "Mine the laundry: fold and stack", done(15, "Said Minecraft is boring now"), 15),
  mc(2, 2, "maths", "quiz", "Long division: share diamonds between 7 players", { status: "meltdown", minutes: 0, note: "Melted down at the long-division one" }, 25),
  mc(2, 3, "writing", "short_mission", "Write a mob's diary entry (3 sentences)", done(15), 15),
  mc(2, 4, "maths", "build", "Measure your bed in blocks and in cm", done(15)),
  ck(2, 1, "maths", "movement", "Run-rate maths: 50 in 7 overs", done(25)),
  ck(2, 3, "chore", "short_mission", "Kit check: polish your shoes for the match", done(25)),
  ck(2, 6, "maths", "build", "Design a stadium seating plan and count seats", done(30, "Wants to do the stadium one again")),
  reading(2, 5, "reading_short", "Read 3 pages of a cricket comic", done(10)),
];

// School card: started work and kind words go well; homework hand-in is the
// sticking point, which the planner can pick up from memory.
export const ARJUN_DRC = {
  targets: ["Started work within 2 minutes of being asked", "Handed in homework", "Kind hands and kind words"],
  threshold: 2,
  reward: "20 minutes of LEGO Masters",
  // Five school days, oldest first: [started, homework, kind]
  pattern: [
    [true, false, true],
    [true, true, true],
    [false, false, true],
    [true, false, true],
    [true, true, true],
  ] as boolean[][],
};
