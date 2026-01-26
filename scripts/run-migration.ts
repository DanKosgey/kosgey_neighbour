/**
 * Run Migration Script
 * Executes the session_lock table migration and clears corrupted auth data
 */

import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
    try {
        console.log('🔧 Starting database migration...\n');

        if (!process.env.DATABASE_URL) {
            throw new Error('DATABASE_URL not found in environment variables');
        }

        const sql = neon(process.env.DATABASE_URL);

        // Step 1: Create session_lock table
        console.log('📋 Step 1: Creating session_lock table...');
        await sql`
            CREATE TABLE IF NOT EXISTS session_lock (
                id SERIAL PRIMARY KEY,
                session_name VARCHAR(100) NOT NULL UNIQUE,
                instance_id TEXT NOT NULL,
                locked_at TIMESTAMP DEFAULT NOW(),
                expires_at TIMESTAMP NOT NULL
            )
        `;
        console.log('✅ session_lock table created\n');

        // Step 2: Create indexes
        console.log('📋 Step 2: Creating indexes...');
        await sql`CREATE INDEX IF NOT EXISTS idx_session_lock_name ON session_lock(session_name)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_session_lock_expires ON session_lock(expires_at)`;
        console.log('✅ Indexes created\n');

        // Step 3: Create message_queue table
        console.log('📋 Step 3: Creating message_queue table...');
        await sql`
            CREATE TABLE IF NOT EXISTS message_queue (
                id SERIAL PRIMARY KEY,
                jid VARCHAR(255) NOT NULL,
                message_data JSONB NOT NULL,
                priority INTEGER DEFAULT 2 NOT NULL,
                status VARCHAR(50) DEFAULT 'pending' NOT NULL,
                retry_count INTEGER DEFAULT 0 NOT NULL,
                worker_id VARCHAR(100),
                error_message TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                processed_at TIMESTAMP
            )
        `;
        // Create indexes for queue
        await sql`CREATE INDEX IF NOT EXISTS idx_queue_status_priority ON message_queue(status, priority DESC, created_at)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_queue_jid ON message_queue(jid)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_queue_worker ON message_queue(worker_id)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_queue_processed ON message_queue(processed_at)`;
        console.log('✅ message_queue table created\n');

        // Step 4: Create queue_metrics table
        console.log('📋 Step 4: Creating queue_metrics table...');
        await sql`
            CREATE TABLE IF NOT EXISTS queue_metrics (
                id SERIAL PRIMARY KEY,
                timestamp TIMESTAMP DEFAULT NOW(),
                queue_depth INTEGER NOT NULL,
                active_workers INTEGER NOT NULL,
                messages_processed INTEGER NOT NULL,
                avg_processing_time_ms INTEGER,
                error_count INTEGER DEFAULT 0
            )
        `;
        await sql`CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON queue_metrics(timestamp DESC)`;
        console.log('✅ queue_metrics table created\n');

        // Step 5: Optimize existing tables
        console.log('📋 Step 5: Adding performance indexes...');
        await sql`CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone)`;
        await sql`CREATE INDEX IF NOT EXISTS idx_message_logs_contact_time ON message_logs(contact_phone, created_at DESC)`;
        console.log('✅ Performance indexes created\n');

        // Step 6: Clear existing session locks (optional cleanup)
        console.log('📋 Step 6: Clearing existing session locks...');
        const deletedLocks = await sql`DELETE FROM session_lock`;
        console.log(`✅ Cleared ${deletedLocks.length} session locks\n`);

        console.log('🎉 Migration completed successfully!\n');
        console.log('📌 Next steps:');
        console.log('   1. Deploy your code to Render (git push)');
        console.log('   2. Watch Render logs for the QR code');
        console.log('   3. Scan the QR code with WhatsApp');
        console.log('   4. Verify "Representative Online!" message\n');

        process.exit(0);
    } catch (error: any) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nDetails:', error);
        process.exit(1);
    }
}

runMigration();
