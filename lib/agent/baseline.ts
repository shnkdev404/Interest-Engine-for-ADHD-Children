// "AI alone" for the compare view (D-18): same model, same request, but only
// the interest names. No tools, no Qloo, no memory: the honest baseline.
import type Anthropic from "@anthropic-ai/sdk";

import { getAnthropic, hasAnthropicCredentials, PLANNER_MODEL } from "@/lib/llm/client";

export const baselineRequest = (o: { nickname: string; age: number; interests: string[] }) =>
  `Help me plan this week for ${o.nickname}, age ${o.age}, who loves ${o.interests.join(" and ")} and avoids reading. ` +
  "Suggest a few themed homework/chore missions, 3 books, some focus music, and a weekend activity.";

const cache = new Map<string, { text: string; at: number }>();

export async function aiAlone(
  key: string,
  o: { nickname: string; age: number; interests: string[] },
): Promise<string | null> {
  if (!hasAnthropicCredentials()) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.text;

  const res: Anthropic.Message = await getAnthropic().messages.create({
    model: PLANNER_MODEL,
    max_tokens: 2000,
    output_config: { effort: "low" },
    system: "You help parents plan engaging weeks for their children. Be concise: short bullet lists.",
    messages: [{ role: "user", content: baselineRequest(o) }],
  });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
  cache.set(key, { text, at: Date.now() });
  return text;
}
