"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { QlooRef } from "@/lib/plan/schema";
import { createPlan, logOutcome, tryInterest } from "@/lib/plan/service";
import { requireChild } from "@/lib/session";

const Outcome = z.object({
  status: z.enum(["done", "partial", "skipped", "meltdown"]),
  minutes: z.number().int().min(0).max(120),
  note: z.string().max(500).optional(),
});

export async function logOutcomeAction(childId: string, missionId: string, outcome: z.infer<typeof Outcome>) {
  await requireChild(childId);
  await logOutcome(childId, missionId, Outcome.parse(outcome));
  revalidatePath(`/app/child/${childId}`, "layout");
}

export async function regeneratePlanAction(childId: string, adultRequest?: string) {
  await requireChild(childId);
  const res = await createPlan(childId, { adultRequest: adultRequest?.slice(0, 300) || undefined });
  revalidatePath(`/app/child/${childId}`, "layout");
  return { source: res.source, notice: res.notice };
}

export async function tryInterestAction(childId: string, label: string, ref?: z.infer<typeof QlooRef>) {
  await requireChild(childId);
  await tryInterest(childId, z.string().min(1).max(40).parse(label), ref ? QlooRef.parse(ref) : undefined);
  revalidatePath(`/app/child/${childId}`, "layout");
}
