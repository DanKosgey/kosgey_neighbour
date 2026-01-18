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

        // Step 3: Clear corrupted auth data
        console.log('📋 Step 3: Clearing corrupted auth data...');
        const deletedCreds = await sql`DELETE FROM auth_credentials`;
        console.log(`✅ Cleared ${deletedCreds.length} auth credentials\n`);

        // Step 4: Clear any existing session locks
        console.log('📋 Step 4: Clearing existing session locks...');
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
