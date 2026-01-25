import { db } from '../src/database';
import { sql } from 'drizzle-orm';

async function fixSchema() {
    try {
        console.log('🔄 Starting manual schema fix...');

        // 1. Fix varchar lengths
        console.log('1. Altering contacts table...');
        await db.execute(sql`ALTER TABLE contacts ALTER COLUMN phone TYPE varchar(50)`);

        console.log('2. Altering message_logs table...');
        await db.execute(sql`ALTER TABLE message_logs ALTER COLUMN contact_phone TYPE varchar(50)`);

        console.log('3. Altering conversations table...');
        await db.execute(sql`ALTER TABLE conversations ALTER COLUMN contact_phone TYPE varchar(50)`);

        console.log('✅ Columns resized to varchar(50).');

        // 2. Fix session_lock unique constraint issue (optional but helpful)
        // If the constraint exists but drizzle doesn't see it, we can leave it.
        // If we want to be clean for drizzle-kit, we could drop it and let drizzle-kit recreate it, 
        // but that requires knowing the constraint name exactly.
        // The error said `relation "session_lock_session_name_unique" already exists`.

        console.log('✅ Schema fix applied successfully!');
        process.exit(0);

    } catch (error: any) {
        console.error('❌ Error fixing schema:', error);
        // If error is "column ... cannot be cast automatically", we might need USING clause, but varchar(20) -> varchar(50) is usually auto-castable.
        process.exit(1);
    }
}

fixSchema();
