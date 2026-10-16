ALTER TYPE "public"."interest_status" ADD VALUE 'dormant';--> statement-breakpoint
ALTER TYPE "public"."subject" ADD VALUE 'break';--> statement-breakpoint
CREATE TABLE "child_pauses" (
	"child_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"reason" text,
	CONSTRAINT "child_pauses_child_id_week_start_pk" PRIMARY KEY("child_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "drc_entries" (
	"target_id" uuid NOT NULL,
	"child_id" uuid NOT NULL,
	"day" date NOT NULL,
	"met" boolean NOT NULL,
	"entered_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drc_entries_target_id_day_pk" PRIMARY KEY("target_id","day")
);
--> statement-breakpoint
CREATE TABLE "drc_rewards" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"threshold" integer NOT NULL,
	"reward_text" text NOT NULL,
	"qloo_ref" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drc_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"child_id" uuid NOT NULL,
	"text" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interests" ADD COLUMN "resurface_on" date;--> statement-breakpoint
ALTER TABLE "missions" ADD COLUMN "alt" jsonb;--> statement-breakpoint
ALTER TABLE "task_logs" ADD COLUMN "variant" text;--> statement-breakpoint
ALTER TABLE "child_pauses" ADD CONSTRAINT "child_pauses_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drc_entries" ADD CONSTRAINT "drc_entries_target_id_drc_targets_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."drc_targets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drc_entries" ADD CONSTRAINT "drc_entries_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drc_entries" ADD CONSTRAINT "drc_entries_entered_by_adults_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."adults"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drc_rewards" ADD CONSTRAINT "drc_rewards_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drc_targets" ADD CONSTRAINT "drc_targets_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;