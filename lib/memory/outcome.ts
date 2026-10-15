import type { MemoryItem } from "./index";

const STATUS_WORDS = {
  done: "finished",
  partial: "partly finished",
  skipped: "skipped",
  meltdown: "had a hard moment during",
} as const;

// Turns a logged outcome into the sentence Hindsight retains. Kept factual so
// recall can surface patterns ("short missions finished, long reading skipped").
export function outcomeMemory(o: {
  nickname: string;
  title: string;
  interest: string | null;
  subject: string;
  format: string;
  status: keyof typeof STATUS_WORDS;
  minutes: number;
  occurredAt: Date;
}): MemoryItem {
  const theme = o.interest ? `${o.interest}-themed ` : "";
  const time = o.minutes > 0 ? `, about ${o.minutes} minutes` : "";
  return {
    context: "task_outcome",
    occurredAt: o.occurredAt,
    content: `${o.nickname} ${STATUS_WORDS[o.status]} the ${theme}${o.subject} mission "${o.title}" (format: ${o.format.replace(/_/g, " ")}${time}).`,
  };
}

export function noteMemory(o: { nickname: string; title: string; note: string; occurredAt: Date }): MemoryItem {
  return {
    context: "adult_note",
    occurredAt: o.occurredAt,
    content: `Parent note after "${o.title}": ${o.note}`,
  };
}
