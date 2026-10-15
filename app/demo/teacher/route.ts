import { NextResponse } from "next/server";

import { createTeacherDemo } from "@/lib/demo";
import { setSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// "Explore as a teacher": a private class of five, fresh every visit.
export async function POST(request: Request) {
  const { teacherId, classId } = await createTeacherDemo();
  await setSession(teacherId);
  return NextResponse.redirect(new URL(`/teach/class/${classId}`, request.url), 303);
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/", request.url));
}
