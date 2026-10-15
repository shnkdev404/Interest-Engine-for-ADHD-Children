CREATE TYPE "public"."adult_role" AS ENUM('parent', 'teacher');--> statement-breakpoint
CREATE TYPE "public"."format" AS ENUM('short_mission', 'build', 'movement', 'reading_short', 'reading_long', 'screen_free', 'quiz');--> statement-breakpoint
CREATE TYPE "public"."interest_source" AS ENUM('adult', 'suggested');--> statement-breakpoint
CREATE TYPE "public"."interest_status" AS ENUM('active', 'fading', 'paused', 'trial');--> statement-breakpoint
CREATE TYPE "public"."outcome_status" AS ENUM('done', 'partial', 'skipped', 'meltdown');--> statement-breakpoint
CREATE TYPE "public"."subject" AS ENUM('maths', 'reading', 'writing', 'chore', 'routine', 'other');--> statement-breakpoint
CREATE TABLE "adults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"role" "adult_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adults_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"adult_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"age_years" integer NOT NULL,
	"consent_at" timestamp with time zone NOT NULL,
	"consent_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_children" (
	"class_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	CONSTRAINT "class_children_class_id_child_id_pk" PRIMARY KEY("class_id","child_id")
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demo_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"label" text NOT NULL,
	"qloo_entity_id" text,
	"qloo_type" text,
	"qloo_tag_id" text,
	"status" "interest_status" DEFAULT 'active' NOT NULL,
	"source" "interest_source" DEFAULT 'adult' NOT NULL,
	"started_at" date NOT NULL,
	"paused_at" date
);
--> statement-breakpoint
CREATE TABLE "memory_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"context" text NOT NULL,
	"content" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "missions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"interest_id" uuid,
	"subject" "subject" NOT NULL,
	"format" "format" NOT NULL,
	"title" text NOT NULL,
	"steps" jsonb NOT NULL,
	"est_minutes" integer NOT NULL,
	"qloo_refs" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"json" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qloo_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"query" jsonb NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mission_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"status" "outcome_status" NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"note" text,
	"logged_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_adult_id_adults_id_fk" FOREIGN KEY ("adult_id") REFERENCES "public"."adults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_consent_by_adults_id_fk" FOREIGN KEY ("consent_by") REFERENCES "public"."adults"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_children" ADD CONSTRAINT "class_children_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_children" ADD CONSTRAINT "class_children_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_adults_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."adults"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demo_sessions" ADD CONSTRAINT "demo_sessions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interests" ADD CONSTRAINT "interests_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_notes" ADD CONSTRAINT "memory_notes_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "missions" ADD CONSTRAINT "missions_interest_id_interests_id_fk" FOREIGN KEY ("interest_id") REFERENCES "public"."interests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_mission_id_missions_id_fk" FOREIGN KEY ("mission_id") REFERENCES "public"."missions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;