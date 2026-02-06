CREATE TABLE IF NOT EXISTS "groups" (
	"jid" varchar(100) PRIMARY KEY NOT NULL,
	"subject" text,
	"description" text,
	"creation_time" timestamp,
	"owner_jid" varchar(50),
	"total_members" integer DEFAULT 0,
	"admins_count" integer DEFAULT 0,
	"is_announce" boolean DEFAULT false,
	"is_restricted" boolean DEFAULT false,
	"metadata" jsonb,
	"bot_joined_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_jid" varchar(100) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"role" varchar(20) DEFAULT 'participant',
	"is_admin" boolean DEFAULT false,
	"joined_at" timestamp,
	"last_seen" timestamp,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "group_members_group_jid_groups_jid_fk" FOREIGN KEY ("group_jid") REFERENCES "groups"("jid") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_member_pair_idx" on "group_members" ("group_jid","phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_role_idx" on "group_members" ("role");
