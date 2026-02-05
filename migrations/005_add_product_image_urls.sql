-- Add imageUrls for career multi-photo support
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls JSONB;
