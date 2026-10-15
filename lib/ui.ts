// Small presentation helpers shared by server and client components.
import { Blocks, BookOpen, Bot, Dumbbell, Gamepad2, Music, Rocket, Trophy, Tv, type LucideIcon } from "lucide-react";

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

// Labels stay as the adult typed them ("cricket"); capitalise only where a
// label starts a sentence or stands alone as a name.
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Stable colour per interest: by its position in the child's interest list.
export function interestColor(labels: string[], label: string): string {
  const i = labels.findIndex((l) => l.toLowerCase() === label.toLowerCase());
  return `var(--i${((i < 0 ? labels.length : i) % 8) + 1})`;
}

const ICONS: [RegExp, LucideIcon][] = [
  [/cricket|football|soccer|sport|tennis|team/i, Trophy],
  [/minecraft|roblox|game|terraria/i, Gamepad2],
  [/lego|build|block/i, Blocks],
  [/space|rocket|planet/i, Rocket],
  [/robot/i, Bot],
  [/book|read|story|stories/i, BookOpen],
  [/music|song|artist/i, Music],
  [/show|film|movie|tv/i, Tv],
  [/run|move|dance/i, Dumbbell],
];

export function interestIcon(label: string): LucideIcon {
  return ICONS.find(([re]) => re.test(label))?.[1] ?? Gamepad2;
}

export const FORMAT_LABEL: Record<string, string> = {
  short_mission: "Short",
  build: "Build",
  movement: "Movement",
  reading_short: "Short read",
  reading_long: "Long read",
  screen_free: "Screen-free",
  quiz: "Quiz",
};

export const SUBJECT_LABEL: Record<string, string> = {
  maths: "Maths",
  reading: "Reading",
  writing: "Writing",
  chore: "Chore",
  routine: "Routine",
  other: "Activity",
};

// "Hard moment" is the UI word for the `meltdown` status (UI_UX.md §5.3).
export const STATUS_LABEL = { done: "Done", partial: "Partly", skipped: "Skipped", meltdown: "Hard moment" } as const;

export function weekLabel(isoMonday: string): string {
  const d = new Date(`${isoMonday}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
