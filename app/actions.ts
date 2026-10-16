"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { DrcInputError, setEntry, setReward, setTargets } from "@/lib/drc";
import { QlooRef } from "@/lib/plan/schema";
import { chooseReward, createPlan, logOutcome, restInterest, setPauseWeek, tryInterest } from "@/lib/plan/service";
import { requireChild } from "@/lib/session";

const Outcome = z.object({
  status: z.enum(["done", "partial", "skipped", "meltdown"]),
  minutes: z.number().int().min(0).max(120),
  note: z.string().max(500).optional(),
  variant: z.enum(["a", "b"]).optional(),
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

export async function restInterestAction(childId: string, interestId: string) {
  await requireChild(childId);
  const res = await restInterest(childId, z.string().uuid().parse(interestId));
  revalidatePath(`/app/child/${childId}`, "layout");
  return res;
}

export async function setPauseWeekAction(childId: string, weekStart: string, paused: boolean) {
  await requireChild(childId);
  await setPauseWeek(childId, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(weekStart), paused);
  revalidatePath(`/app/child/${childId}`, "layout");
}

// Daily school-home card. Parents and teachers both use these; access is the
// same ownership check as everything else on the child.
const DayStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function setDrcTargetsAction(childId: string, targets: string[]) {
  await requireChild(childId);
  try {
    await setTargets(childId, z.array(z.string().max(80)).max(4).parse(targets));
  } catch (err) {
    if (err instanceof DrcInputError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/app/child/${childId}`, "layout");
  revalidatePath("/teach", "layout");
  return { ok: true };
}

export async function setDrcRewardAction(childId: string, threshold: number, rewardText: string, ref?: z.infer<typeof QlooRef>) {
  await requireChild(childId);
  try {
    await setReward(childId, z.number().int().min(1).max(4).parse(threshold), z.string().min(2).max(80).parse(rewardText), ref ? QlooRef.parse(ref) : null);
  } catch (err) {
    if (err instanceof DrcInputError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/app/child/${childId}`, "layout");
  revalidatePath("/teach", "layout");
  return { ok: true };
}

export async function setDrcEntryAction(childId: string, targetId: string, day: string, met: boolean) {
  const child = await requireChild(childId);
  await setEntry(childId, z.string().uuid().parse(targetId), DayStr.parse(day), met, child.adultId);
  revalidatePath(`/app/child/${childId}`, "layout");
  revalidatePath("/teach", "layout");
}

export async function chooseRewardAction(childId: string, missionId: string, reward: string) {
  await requireChild(childId);
  await chooseReward(childId, z.string().uuid().parse(missionId), z.string().min(1).max(60).parse(reward));
}
