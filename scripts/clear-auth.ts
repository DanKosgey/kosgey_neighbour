/**
 * Clear Auth Script
 * Clears corrupted authentication data and session locks
 * Run this when you get decryption errors or session conflicts
 */

import { db } from '../src/database';
import { authCredentials, sessionLock } from '../src/database/schema';
import { sql } from 'drizzle-orm';

async function clearAuth() {
    try {
        console.log('🧹 Clearing authentication data...');

        // 1. Clear all auth credentials
        const deletedCreds = await db.delete(authCredentials);
        console.log('✅ Cleared auth_credentials table');

        // 2. Clear session locks
        const deletedLocks = await db.delete(sessionLock);
        console.log('✅ Cleared session_lock table');

        console.log('\n✨ Authentication data cleared successfully!');
        console.log('📌 Next steps:');
        console.log('   1. Restart your application');
        console.log('   2. Scan the new QR code with WhatsApp');
        console.log('   3. Your agent will be connected with fresh credentials\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error clearing auth data:', error);
        process.exit(1);
    }
}

clearAuth();
