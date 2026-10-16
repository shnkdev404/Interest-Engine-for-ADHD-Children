// Data model from docs/DESIGN.md §2. Deliberately no columns for diagnosis,
// school, location or photos (C3 in DECISIONS.md).
import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const adultRole = pgEnum("adult_role", ["parent", "teacher"]);
// dormant = resting after fading; retried once on resurfaceOn (Kapoor 2015).
export const interestStatus = pgEnum("interest_status", ["active", "fading", "paused", "trial", "dormant"]);
export const interestSource = pgEnum("interest_source", ["adult", "suggested"]);
// "break" = a movement break before focused work (RESEARCH.md Tier 1 #7).
export const subject = pgEnum("subject", ["maths", "reading", "writing", "chore", "routine", "other", "break"]);
export const format = pgEnum("format", [
  "short_mission",
  "build",
  "movement",
  "reading_short",
  "reading_long",
  "screen_free",
  "quiz",
]);
export const outcomeStatus = pgEnum("outcome_status", ["done", "partial", "skipped", "meltdown"]);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const adults = pgTable("adults", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  role: adultRole("role").notNull(),
  createdAt: createdAt(),
});

export const children = pgTable("children", {
  id: uuid("id").primaryKey().defaultRandom(),
  adultId: uuid("adult_id")
    .notNull()
    .references(() => adults.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  ageYears: integer("age_years").notNull(),
  // Verifiable parental consent (DPDP / COPPA): who agreed and when.
  consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
  consentBy: uuid("consent_by")
    .notNull()
    .references(() => adults.id),
  createdAt: createdAt(),
});

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  teacherId: uuid("teacher_id")
    .notNull()
    .references(() => adults.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const classChildren = pgTable(
  "class_children",
  {
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.classId, t.childId] })],
);

export const interests = pgTable("interests", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id")
    .notNull()
    .references(() => children.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  qlooEntityId: text("qloo_entity_id"),
  qlooType: text("qloo_type"),
  qlooTagId: text("qloo_tag_id"),
  status: interestStatus("status").notNull().default("active"),
  source: interestSource("source").notNull().default("adult"),
  startedAt: date("started_at").notNull(),
  pausedAt: date("paused_at"),
  resurfaceOn: date("resurface_on"),
});

// Weeks the adult marked as a break (holiday, illness): the scorer skips
// them so a pause never looks like an interest fading.
export const childPauses = pgTable(
  "child_pauses",
  {
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    weekStart: date("week_start").notNull(),
    reason: text("reason"),
  },
  (t) => [primaryKey({ columns: [t.childId, t.weekStart] })],
);

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id")
    .notNull()
    .references(() => children.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  json: jsonb("json").notNull(),
  model: text("model").notNull(),
  createdAt: createdAt(),
});

export const missions = pgTable("missions", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id")
    .notNull()
    .references(() => plans.id, { onDelete: "cascade" }),
  interestId: uuid("interest_id").references(() => interests.id, { onDelete: "set null" }),
  subject: subject("subject").notNull(),
  format: format("format").notNull(),
  title: text("title").notNull(),
  steps: jsonb("steps").$type<string[]>().notNull(),
  estMinutes: integer("est_minutes").notNull(),
  qlooRefs: jsonb("qloo_refs").$type<{ entityId: string; name: string; type: string }[]>().notNull().default([]),
  // Second version the child can choose instead (choice of two).
  alt: jsonb("alt").$type<{ title: string; steps: string[] } | null>(),
});

export const taskLogs = pgTable("task_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  missionId: uuid("mission_id")
    .notNull()
    .references(() => missions.id, { onDelete: "cascade" }),
  childId: uuid("child_id")
    .notNull()
    .references(() => children.id, { onDelete: "cascade" }),
  status: outcomeStatus("status").notNull(),
  // Entered by the adult with quick chips (D-16); never measured on a device.
  minutes: integer("minutes").notNull().default(0),
  note: text("note"),
  // Which version the child chose: "a" (main) or "b" (alt).
  variant: text("variant"),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull(),
});

// Daily Report Card (school-home note): 2–4 daily targets per child, met or
// not each school day, linked to a home reward (RESEARCH.md Tier 1 #2).
export const drcTargets = pgTable("drc_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id")
    .notNull()
    .references(() => children.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const drcEntries = pgTable(
  "drc_entries",
  {
    targetId: uuid("target_id")
      .notNull()
      .references(() => drcTargets.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => children.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    met: boolean("met").notNull(),
    enteredBy: uuid("entered_by").references(() => adults.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.targetId, t.day] })],
);

export const drcRewards = pgTable("drc_rewards", {
  childId: uuid("child_id")
    .primaryKey()
    .references(() => children.id, { onDelete: "cascade" }),
  threshold: integer("threshold").notNull(),
  rewardText: text("reward_text").notNull(),
  qlooRef: jsonb("qloo_ref").$type<{ entityId: string; name: string; type: string } | null>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Local fallback memory when Hindsight isn't configured (lib/memory). Same
// lifecycle as a Hindsight bank: deleted with the child.
export const memoryNotes = pgTable("memory_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id")
    .notNull()
    .references(() => children.id, { onDelete: "cascade" }),
  context: text("context").notNull(),
  content: text("content").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
});

// Server-side Qloo cache (D-09). Never exported to the repo.
export const qlooCache = pgTable("qloo_cache", {
  key: text("key").primaryKey(),
  path: text("path").notNull(),
  query: jsonb("query").notNull(),
  response: jsonb("response").notNull(),
  createdAt: createdAt(),
});

// A teacher's lesson and the per-child hooks generated for it (Phase 4).
export const lessons = pgTable("lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  classId: uuid("class_id")
    .notNull()
    .references(() => classes.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  minutes: integer("minutes").notNull(),
  hooks: jsonb("hooks").notNull(),
  model: text("model").notNull(),
  createdAt: createdAt(),
});

export const demoSessions = pgTable("demo_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  childId: uuid("child_id")
    .notNull()
    .references(() => children.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
