
import { db } from '../src/database';
import { authCredentials } from '../src/database/schema';
import { like } from 'drizzle-orm';
import { config } from '../src/config/env';

const clearAuth = async () => {
    console.log('🧹 Clearing WhatsApp session credentials...');
    if (!config.databaseUrl) {
        console.error('❌ DATABASE_URL is not defined in .env');
        process.exit(1);
    }

    try {
        // First, let's see what's in the database
        const allCreds = await db.select().from(authCredentials);
        console.log(`📊 Found ${allCreds.length} credential entries in database`);

        if (allCreds.length > 0) {
            console.log('🔍 Keys found:');
            allCreds.forEach(cred => console.log(`   - ${cred.key}`));
        }

        // Delete ALL auth credentials (not just whatsapp_session)
        const deleted = await db.delete(authCredentials).returning();

        console.log(`✅ Successfully cleared ${deleted.length} authentication entries!`);
        console.log('🔄 Please restart the agent to generate a new QR code.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error clearing auth:', error);
        process.exit(1);
    }
};

clearAuth();
