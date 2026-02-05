-- Add content source fields for campaign creation
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS content_source VARCHAR(20) DEFAULT 'ai';
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS selected_product_id INTEGER;
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS selected_shop_id INTEGER;
