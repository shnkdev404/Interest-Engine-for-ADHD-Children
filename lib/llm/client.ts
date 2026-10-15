import Anthropic from "@anthropic-ai/sdk";

// Models per D-05; override with env to test alternatives.
export const PLANNER_MODEL = process.env.PLANNER_MODEL ?? "claude-sonnet-5-5";
export const CLASSIFIER_MODEL = process.env.CLASSIFIER_MODEL ?? "claude-haiku-5-5";

export function hasAnthropicCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | undefined;

export function getAnthropic(): Anthropic {
  if (!hasAnthropicCredentials()) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local.");
  }
  client ??= new Anthropic();
  return client;
}
