-- Add missing columns to marketing_campaigns
ALTER TABLE IF EXISTS "marketing_campaigns" ADD COLUMN IF NOT EXISTS "content_source" varchar(20) DEFAULT 'ai';
--> statement-breakpoint
ALTER TABLE IF EXISTS "marketing_campaigns" ADD COLUMN IF NOT EXISTS "selected_product_id" integer;
--> statement-breakpoint
ALTER TABLE IF EXISTS "marketing_campaigns" ADD COLUMN IF NOT EXISTS "selected_shop_id" integer;
--> statement-breakpoint

-- Add missing columns to products
ALTER TABLE IF EXISTS "products" ADD COLUMN IF NOT EXISTS "image_urls" jsonb;
--> statement-breakpoint

-- Create shops table if missing
CREATE TABLE IF NOT EXISTS "shops" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"emoji" varchar(10) DEFAULT '🏪',
	"type" varchar(20) DEFAULT 'shop',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint

-- Create groups table
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

-- Create group_members table
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

-- Create ad_engagements table (for tracking ad interactions)
CREATE TABLE IF NOT EXISTS "ad_engagements" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"group_jid" varchar(100),
	"user_phone" varchar(50),
	"message_id" varchar(100),
	"type" varchar(20) NOT NULL,
	"context" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "ad_engagements_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id")
);
--> statement-breakpoint

-- Create scheduled_posts table (for campaign scheduling)
CREATE TABLE IF NOT EXISTS "scheduled_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"type" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"media_url" text,
	"scheduled_time" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"platform" varchar(20) DEFAULT 'whatsapp',
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "scheduled_posts_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id")
);
--> statement-breakpoint

-- Create content_templates table (for ad frameworks)
CREATE TABLE IF NOT EXISTS "content_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"structure" text NOT NULL,
	"examples" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint

-- Create all indexes
CREATE INDEX IF NOT EXISTS "group_member_pair_idx" on "group_members" ("group_jid","phone");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_role_idx" on "group_members" ("role");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eng_camp_type_idx" on "ad_engagements" ("campaign_id","type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eng_msg_idx" on "ad_engagements" ("message_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sched_status_time_idx" on "scheduled_posts" ("status","scheduled_time");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_shop_idx" on "products" ("shop_id");
