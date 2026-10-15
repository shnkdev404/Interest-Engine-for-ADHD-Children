"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDb, schema } from "@/db";
import { generateLessonHooks, type Hook } from "@/lib/hooks/generate";
import { lintValue } from "@/lib/safety/lint";
import { requireClass } from "@/lib/session";

const Lesson = z.object({ topic: z.string().trim().min(2).max(80), minutes: z.number().int().min(10).max(120) });

export async function generateHooksAction(classId: string, input: z.infer<typeof Lesson>) {
  await requireClass(classId);
  const { topic, minutes } = Lesson.parse(input);
  const res = await generateLessonHooks(classId, topic, minutes);
  revalidatePath(`/teach/class/${classId}`);
  return { model: res.model };
}

const Edit = z.object({
  title: z.string().trim().min(1).max(60),
  opener: z.string().trim().min(1).max(300),
  activity: z.string().trim().min(1).max(300),
});

// Teachers edit hooks inline; the same wording rules apply to their edits.
export async function updateHookAction(classId: string, lessonId: string, childId: string, input: z.infer<typeof Edit>) {
  await requireClass(classId);
  const edit = Edit.parse(input);
  const hits = lintValue(edit);
  if (hits.length) return { error: `Please avoid the word "${hits[0].word}".` };

  const db = await getDb();
  const lesson = await db.query.lessons.findFirst({
    where: and(eq(schema.lessons.id, lessonId), eq(schema.lessons.classId, classId)),
  });
  if (!lesson) return { error: "Lesson not found" };
  const hooks = (lesson.hooks as Hook[]).map((h) => (h.childId === childId ? { ...h, ...edit } : h));
  await db.update(schema.lessons).set({ hooks }).where(eq(schema.lessons.id, lessonId));
  revalidatePath(`/teach/class/${classId}`);
  return { ok: true };
}
