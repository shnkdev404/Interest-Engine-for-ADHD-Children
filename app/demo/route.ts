import { NextResponse } from "next/server";

import { createDemo } from "@/lib/demo";
import { setSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Explore as Arjun's parent": a fresh private copy every visit (D-14).
// POST from a form, so link prefetching can never create demos.
export async function POST(request: Request) {
  const { parentId, childId } = await createDemo();
  await setSession(parentId);
  return NextResponse.redirect(new URL(`/app/child/${childId}?tour=1`, request.url), 303);
}

export async function GET(request: Request) {
  return NextResponse.redirect(new URL("/", request.url));
}
