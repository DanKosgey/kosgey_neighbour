import { db } from '../src/database';
import { marketingCampaigns } from '../src/database/schema';
import { eq } from 'drizzle-orm';
import * as readline from 'readline';
import axios from 'axios'; // Using axios for simplicity

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function triggerSpecificCampaign() {
    try {
        console.log('\n🎯 Manual Campaign Trigger Tool');
        console.log('==================================\n');

        // Get active campaigns from DB directly
        const campaigns = await db.select()
            .from(marketingCampaigns)
            .where(eq(marketingCampaigns.status, 'active'));

        if (campaigns.length === 0) {
            console.log('❌ No active campaigns found. Please create one first.');
            process.exit(1);
        }

        console.log('📋 Active Campaigns:\n');
        campaigns.forEach((c, i) => {
            console.log(`${i + 1}. [ID: ${c.id}] ${c.name}`);
            console.log(`   Times: ${c.morningTime} / ${c.afternoonTime} / ${c.eveningTime}`);
            console.log(`   Source: ${c.contentSource || 'ai'}`);
            console.log('');
        });

        rl.question('👉 Enter the number of the campaign to trigger: ', async (answer) => {
            const index = parseInt(answer) - 1;

            if (isNaN(index) || index < 0 || index >= campaigns.length) {
                console.log('❌ Invalid selection. Exiting.');
                rl.close();
                process.exit(1);
            }

            const selectedCampaign = campaigns[index];
            console.log(`\n🚀 Triggering campaign: "${selectedCampaign.name}" (ID: ${selectedCampaign.id})...\n`);

            try {
                // Make API call to trigger the specific campaign
                const response = await axios.post('http://localhost:3000/api/marketing/trigger-now', {
                    campaignId: selectedCampaign.id,
                    slotType: 'ad_manual_trigger' // Default type for manual triggers
                });

                if (response.status === 200) {
                    console.log('✅ Success! Campaign Triggered.');
                    console.log(`📤 Message sent to WhatsApp queue for "${selectedCampaign.name}"`);
                } else {
                    console.error('❌ API Error:', response.data);
                }
            } catch (err: any) {
                console.error('❌ Connection Error: Is the app running? (npm start)');
                console.error(err.message);
                if (err.response) {
                    console.error('API Response:', err.response.data);
                }
            }

            rl.close();
        });

    } catch (error) {
        console.error('❌ Error:', error);
        rl.close();
        process.exit(1);
    }
}

triggerSpecificCampaign();
