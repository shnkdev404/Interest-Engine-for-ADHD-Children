import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { getDb, schema } from "@/db";

// Demo sessions: a signed cookie holding the visitor's private parent id
// (D-14). Real magic-link auth replaces this for non-demo users later.
const COOKIE = "sp_session";
const MAX_AGE = 60 * 60 * 24; // 1 day, matches demo cleanup

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production");
  return "dev-only-session-secret";
}

const sign = (value: string) => createHmac("sha256", secret()).update(value).digest("base64url");

export async function setSession(parentId: string) {
  (await cookies()).set(COOKIE, `${parentId}.${sign(parentId)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function getSessionParentId(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  const id = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1));
  const expected = Buffer.from(sign(id));
  return given.length === expected.length && timingSafeEqual(given, expected) ? id : null;
}

export class AccessError extends Error {}

// Every child page and action goes through this: the child must belong to
// the signed-in adult.
export async function requireChild(childId: string) {
  const parentId = await getSessionParentId();
  if (!parentId) throw new AccessError("Not signed in");
  const db = await getDb();
  const child = await db.query.children.findFirst({ where: eq(schema.children.id, childId) });
  if (!child || child.adultId !== parentId) throw new AccessError("Not your child profile");
  return child;
}
