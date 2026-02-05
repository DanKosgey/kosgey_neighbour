
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function runSqlMigrations() {
    try {
        console.log('🔧 Starting SQL migrations...\n');

        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL not found in environment variables');
        }

        const sql = neon(process.env.DATABASE_URL);

        // Migration 002: Add Business Description
        console.log('📋 Running Migration 002 (Business Description)...');
        try {
            await sql`
                ALTER TABLE marketing_campaigns 
                ADD COLUMN IF NOT EXISTS business_description TEXT;
            `;
            console.log('✅ Migration 002 applied or already exists');
        } catch (e: any) {
            console.error('⚠️ Migration 002 warning:', e.message);
        }

        // Migration 003: Add Company Link
        console.log('📋 Running Migration 003 (Company Link)...');
        try {
            // Using raw SQL with IF NOT EXISTS to be safe
            await sql`
                ALTER TABLE marketing_campaigns 
                ADD COLUMN IF NOT EXISTS company_link TEXT;
            `;
            console.log('✅ Migration 003 applied or already exists');
        } catch (e: any) {
            console.error('⚠️ Migration 003 warning:', e.message);
        }

        // Migration 004: Add Content Source (existing vs AI)
        console.log('📋 Running Migration 004 (Content Source)...');
        try {
            await sql`
                ALTER TABLE marketing_campaigns 
                ADD COLUMN IF NOT EXISTS content_source VARCHAR(20) DEFAULT 'ai';
            `;
            await sql`
                ALTER TABLE marketing_campaigns 
                ADD COLUMN IF NOT EXISTS selected_product_id INTEGER;
            `;
            await sql`
                ALTER TABLE marketing_campaigns 
                ADD COLUMN IF NOT EXISTS selected_shop_id INTEGER;
            `;
            console.log('✅ Migration 004 applied or already exists');
        } catch (e: any) {
            console.error('⚠️ Migration 004 warning:', e.message);
        }

        // Migration 005: Add imageUrls for career multi-photo
        console.log('📋 Running Migration 005 (Product imageUrls)...');
        try {
            await sql`
                ALTER TABLE products 
                ADD COLUMN IF NOT EXISTS image_urls JSONB;
            `;
            console.log('✅ Migration 005 applied or already exists');
        } catch (e: any) {
            console.error('⚠️ Migration 005 warning:', e.message);
        }

        console.log('\n🎉 SQL Migrations completed successfully!\n');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

runSqlMigrations();
