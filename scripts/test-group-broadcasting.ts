/**
 * Test Autonomous Group Broadcasting
 * Sends a real ad about the agent testing its autonomous posting feature
 */

import { WhatsAppClient } from '../src/core/whatsapp';
import { marketingService } from '../src/services/marketing/marketingService';
import { db } from '../src/database';
import { businessProfile, marketingCampaigns } from '../src/database/schema';
import { eq } from 'drizzle-orm';

async function testGroupBroadcasting() {
    console.log('🧪 Testing Autonomous Group Broadcasting...\n');

    // 1. Ensure business profile exists (for the agent itself)
    console.log('--- 1. Setting up Business Profile ---');
    console.log('Updating business profile to "Autonomous Marketing Agent"...');

    // UPSERT proper profile
    const profileData = {
        productInfo: 'AI-Powered Autonomous Marketing Agent',
        targetAudience: 'Business owners who want automated WhatsApp marketing',
        uniqueSellingPoint: 'Fully autonomous ad posting with AI-generated content and images',
        brandVoice: 'professional, innovative, reliable'
    };

    // Check if exists, if so update, else insert
    let profile = await db.query.businessProfile.findFirst();
    if (profile) {
        await db.update(businessProfile).set(profileData).where(eq(businessProfile.id, profile.id));
    } else {
        await db.insert(businessProfile).values(profileData);
    }

    // Verify
    profile = await db.query.businessProfile.findFirst();
    console.log('✅ Profile ready:', profile?.productInfo);

    // 2. Create test campaign with custom times
    console.log('\n--- 2. Creating Test Campaign ---');
    const [campaign] = await db.insert(marketingCampaigns).values({
        name: 'Autonomous Broadcasting Test',
        status: 'active',
        startDate: new Date(),
        morningTime: '07:00',
        afternoonTime: '13:00',
        eveningTime: '19:00'
    }).returning();

    console.log(`✅ Campaign created: ${campaign.name} (ID: ${campaign.id})`);
    console.log(`   Posting times: Morning ${campaign.morningTime}, Afternoon ${campaign.afternoonTime}, Evening ${campaign.eveningTime}`);

    // 3. Initialize WhatsApp client
    console.log('\n--- 3. Initializing WhatsApp Client ---');
    const client = new WhatsAppClient();
    await client.initialize();

    // Wait for connection - INCREASED TIMEOUT
    console.log('⏳ Waiting for WhatsApp connection...');
    await new Promise(resolve => setTimeout(resolve, 15000)); // 15 seconds for stable connection

    // 4. Check groups
    console.log('\n--- 4. Detecting Groups ---');
    const groups = await client.getAllGroups();

    if (groups.length === 0) {
        console.log('❌ No groups found! Please add the bot to at least one WhatsApp group first.');
        await client.shutdown();
        process.exit(1);
    }

    console.log(`✅ Found ${groups.length} groups to broadcast to`);

    console.log('\n--- 5. Broadcasting Test Ad ---');
    console.log('📢 Sending autonomous marketing agent test ad to all groups...');

    // Images enabled
    delete process.env.FORCE_TEXT_ONLY_ADS;

    try {
        await marketingService.executeMarketingSlot(client, 'ad_morning');

        console.log('\n✅ Test completed! Check your WhatsApp groups for the ad.');
        console.log('   The ad should include:');
        console.log('   - Professional marketing copy');
        console.log('   - Sent to all groups with 2-second delays');
        console.log('\n💡 To enable images: Remove FORCE_TEXT_ONLY_ADS env var');
    } catch (error) {
        console.error('❌ Broadcasting failed:', error);
    }

    // Cleanup
    console.log('\n🛑 Shutting down WhatsApp client...');
    await client.shutdown();

    // Give time for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 2000));

    process.exit(0);
}

testGroupBroadcasting().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
});
