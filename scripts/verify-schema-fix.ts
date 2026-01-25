
import { db } from '../src/database';
import { contacts } from '../src/database/schema';
import { eq } from 'drizzle-orm';

async function testLongJid() {
    console.log('🧪 Testing Database Schema with Long JID...');

    // A sample long JID (like the one seen in logs: 128724850720810@lid)
    const longJid = '128724850720810@lid';
    console.log(`String length: ${longJid.length}`);

    try {
        // 1. Try to insert
        console.log('Attempting insert...');
        await db.insert(contacts).values({
            phone: longJid,
            originalPushname: 'Test Long JID',
            name: 'Test User',
            summary: 'Test entry for schema validation',
            trustLevel: 1,
            isVerified: true
        }).onConflictDoUpdate({
            target: contacts.phone,
            set: { lastSeenAt: new Date() }
        });

        console.log('✅ Insert successful!');

        // 2. Verified we can read it back
        const result = await db.select().from(contacts).where(eq(contacts.phone, longJid));
        console.log('Read result:', result[0]);

        // 3. Cleanup
        await db.delete(contacts).where(eq(contacts.phone, longJid));
        console.log('✅ Cleanup successful.');

        console.log('\n🎉 Schema verification: PASSED. The database now accepts long JIDs.');
        process.exit(0);
    } catch (error: any) {
        console.error('❌ detailed error:', error);
        console.error('❌ Verification FAILED.');
        process.exit(1);
    }
}

testLongJid();
