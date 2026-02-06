CREATE TABLE IF NOT EXISTS "ai_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_name" varchar(100) DEFAULT 'Representative',
	"agent_role" text DEFAULT 'Personal Assistant',
	"personality_traits" text DEFAULT 'Professional, helpful, and efficient',
	"communication_style" text DEFAULT 'Friendly yet professional',
	"system_prompt" text,
	"greeting_message" text,
	"response_length" varchar(20) DEFAULT 'short',
	"use_emojis" boolean DEFAULT true,
	"formality_level" integer DEFAULT 5,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_credentials" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_info" text NOT NULL,
	"target_audience" text NOT NULL,
	"unique_selling_point" text NOT NULL,
	"brand_voice" text DEFAULT 'professional',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar(50) NOT NULL,
	"original_pushname" text,
	"confirmed_name" text,
	"is_verified" boolean DEFAULT false,
	"name" text,
	"context_summary" text,
	"summary" text,
	"trust_level" integer DEFAULT 0,
	"platform" varchar(20) DEFAULT 'whatsapp',
	"created_at" timestamp DEFAULT now(),
	"last_seen_at" timestamp DEFAULT now(),
	CONSTRAINT "contacts_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"structure" text NOT NULL,
	"examples" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_phone" varchar(50),
	"status" varchar(20) DEFAULT 'active',
	"urgency" varchar(10),
	"summary" text,
	"started_at" timestamp DEFAULT now(),
	"ended_at" timestamp,
	"unread_by_owner" boolean DEFAULT true
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "facts" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"category" varchar(50) NOT NULL,
	"tier" varchar(20) NOT NULL,
	"tags" jsonb,
	"source" text,
	"used_count" integer DEFAULT 0,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "marketing_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'active',
	"start_date" timestamp DEFAULT now(),
	"end_date" timestamp,
	"morning_time" varchar(5) DEFAULT '07:00',
	"afternoon_time" varchar(5) DEFAULT '13:00',
	"evening_time" varchar(5) DEFAULT '19:00',
	"target_groups" jsonb,
	"business_description" text,
	"product_info" text,
	"target_audience" text,
	"unique_selling_point" text,
	"brand_voice" text,
	"visual_style" text DEFAULT 'minimalist',
	"company_link" text,
	"content_source" varchar(20) DEFAULT 'ai',
	"selected_product_id" integer,
	"selected_shop_id" integer,
	"settings" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_phone" varchar(50),
	"role" varchar(10) NOT NULL,
	"content" text NOT NULL,
	"type" varchar(20) DEFAULT 'text',
	"platform" varchar(20) DEFAULT 'whatsapp',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "message_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"jid" varchar(255) NOT NULL,
	"message_data" jsonb NOT NULL,
	"priority" integer DEFAULT 2 NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"worker_id" varchar(100),
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "queue_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"timestamp" timestamp DEFAULT now(),
	"queue_depth" integer NOT NULL,
	"active_workers" integer NOT NULL,
	"messages_processed" integer NOT NULL,
	"avg_processing_time_ms" integer,
	"error_count" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "report_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_phone" varchar(50) NOT NULL,
	"contact_name" text,
	"conversation_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"retry_count" integer DEFAULT 0,
	"last_attempt" timestamp,
	"last_message_time" timestamp,
	"error" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session_lock" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_name" varchar(100) NOT NULL,
	"instance_id" text NOT NULL,
	"locked_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "session_lock_session_name_unique" UNIQUE("session_name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_profile" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" varchar(100),
	"preferred_name" varchar(50),
	"title" varchar(100),
	"company" varchar(200),
	"email" varchar(255),
	"phone" varchar(50),
	"location" varchar(200),
	"timezone" varchar(50),
	"industry" varchar(100),
	"role" text,
	"responsibilities" text,
	"working_hours" text,
	"availability" text,
	"priorities" text,
	"background_info" text,
	"communication_preferences" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
CREATE TABLE IF NOT EXISTS "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"shop_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"price" integer DEFAULT 0,
	"stock" integer DEFAULT 0,
	"image_url" text,
	"image_urls" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
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
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ad_engagements" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer,
	"group_jid" varchar(100),
	"user_phone" varchar(50),
	"message_id" varchar(100),
	"type" varchar(20) NOT NULL,
	"context" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "phone_idx" ON "contacts" ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_idx" ON "contacts" ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fact_category_idx" ON "facts" ("category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fact_tier_idx" ON "facts" ("tier");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contact_phone_idx" ON "message_logs" ("contact_phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "created_at_idx" ON "message_logs" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "message_platform_idx" ON "message_logs" ("platform");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "status_priority_idx" ON "message_queue" ("status","priority","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jid_idx" ON "message_queue" ("jid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_idx" ON "message_queue" ("worker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "timestamp_idx" ON "queue_metrics" ("timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "report_queue_status_idx" ON "report_queue" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sched_status_time_idx" ON "scheduled_posts" ("status","scheduled_time");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_shop_idx" ON "products" ("shop_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_member_pair_idx" ON "group_members" ("group_jid","phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "member_role_idx" ON "group_members" ("role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eng_camp_type_idx" ON "ad_engagements" ("campaign_id","type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "eng_msg_idx" ON "ad_engagements" ("message_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_phone_contacts_phone_fk" FOREIGN KEY ("contact_phone") REFERENCES "contacts"("phone") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "message_logs" ADD CONSTRAINT "message_logs_contact_phone_contacts_phone_fk" FOREIGN KEY ("contact_phone") REFERENCES "contacts"("phone") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "report_queue" ADD CONSTRAINT "report_queue_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_posts" ADD CONSTRAINT "scheduled_posts_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_jid_groups_jid_fk" FOREIGN KEY ("group_jid") REFERENCES "groups"("jid") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ad_engagements" ADD CONSTRAINT "ad_engagements_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "marketing_campaigns"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
