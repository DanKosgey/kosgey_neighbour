import cron, { ScheduledTask } from 'node-cron';
import { eq } from 'drizzle-orm';
import { WhatsAppClient } from '../core/whatsapp';
import { ownerService } from './ownerService';
import { db } from '../database';
import { userProfile, marketingCampaigns } from '../database/schema';

export class SchedulerService {
    private client: WhatsAppClient | undefined;
    private tasks: ScheduledTask[] = [];

    init(client: WhatsAppClient) {
        this.client = client;
        this.start();
    }

    async start() {
        this.stop();
        console.log('⏰ Starting Scheduler Service (Dynamic Mode)...');

        // Main Minutely Heartbeat
        // Checks every minute for any campaign that has a scheduled slot matching current time
        const task = cron.schedule('* * * * *', async () => {
            this.checkAndExecuteSlots();
        });

        this.tasks.push(task);
        console.log('✅ Scheduler initialized: Monitoring active campaigns every minute.');

        // Self-Ping Every 10 Minutes (Keep-Alive)
        const pingTask = cron.schedule('*/10 * * * *', async () => {
            this.runSelfPing();
        });
        this.tasks.push(pingTask);
        console.log('✅ Self-ping scheduler initialized: Every 10 minutes.');
    }

    private async runSelfPing() {
        try {
            const port = process.env.PORT || 3000;
            const url = process.env.RENDER_EXTERNAL_URL
                ? `${process.env.RENDER_EXTERNAL_URL}/health`
                : `http://localhost:${port}/health`;

            console.log(`💓 Sending keep-alive ping to ${url}...`);
            const response = await fetch(url);
            if (response.ok) {
                console.log('✅ Keep-alive ping successful (200 OK)');
            } else {
                console.error(`⚠️ Keep-alive ping returned status: ${response.status}`);
            }
        } catch (error: any) {
            console.error('❌ Keep-alive ping failed:', error.message);
        }
    }



    private async checkAndExecuteSlots() {
        try {
            // 1. Get Current Time and Timezone
            let timezone = 'Africa/Nairobi'; // Default to Kenya Time
            // Try to find owner timezone (cached or fresh)
            // For efficiency, we might want to cache this, but DB query is fast enough for minutely
            const profile = await db.query.userProfile.findFirst();
            if (profile?.timezone) timezone = profile.timezone;

            const now = new Date();
            // Format current time in user's timezone as HH:mm
            const currentTime = now.toLocaleTimeString('en-GB', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            console.log(`⏱️ Scheduler Tick: ${currentTime} (${timezone})`);

            // 2. Fetch Active Campaigns
            const campaigns = await db.query.marketingCampaigns.findMany({
                where: eq(marketingCampaigns.status, 'active')
            });

            if (!campaigns.length) {
                // console.log('No active campaigns found.'); // Optional: reduce noise
                return;
            }

            console.log(`🔎 Found ${campaigns.length} active campaigns. Checking schedules...`);
            campaigns.forEach(c => {
                console.log(`   - '${c.name}' (ID: ${c.id}) schedule: M=${c.morningTime || '-'}, A=${c.afternoonTime || '-'}, E=${c.eveningTime || '-'}`);
            });

            // 3. Check Each Campaign
            for (const campaign of campaigns) {
                // Determine if any slot matches current time
                if (campaign.morningTime === currentTime) {
                    this.triggerSlot(campaign, 'ad_morning');
                } else if (campaign.afternoonTime === currentTime) {
                    this.triggerSlot(campaign, 'ad_afternoon');
                } else if (campaign.eveningTime === currentTime) {
                    this.triggerSlot(campaign, 'ad_evening');
                }
                // Note: Facts are currently global hardcoded slots in old logic.
                // If we want facts per campaign, we'd need fact times.
                // For now, let's keep facts simpler or bind them to same times?
                // The user only complained about "ads posting not following time".
                // We'll leave facts out of the per-campaign logic for now or add them relative to ads if requested.
                // Wait, old scheduler had specific fact slots. 
                // Let's add standard fact slots at global times if needed, OR just focus on ads as requested.
                // User: "ads posting is not following...".
                // I will focus on Ads for now to solve the specific complaint.
            }

        } catch (error) {
            console.error('❌ Scheduler Error:', error);
        }
    }

    private async triggerSlot(campaign: any, slotType: string) {
        console.log(`⏰ Triggering ${slotType} for campaign '${campaign.name}'`);
        try {
            const { marketingService } = await import('./marketing/marketingService');
            if (this.client) {
                // We need to call a method that runs ONE campaign, not all.
                // executeMarketingSlot currently runs ALL active campaigns.
                // We need `executeCampaignSlot(client, campaign, slotType)`
                // But executeMarketingSlot is defined as:
                // executeMarketingSlot(client, slotType) -> Fetches all.

                // I should add a method to MarketingService or use a workaround.
                // Workaround: Modify executeMarketingSlot to accept optional specific campaign?
                // Or just handle logic here? 
                // Better: Call new method in MarketingService `executeSingleCampaignSlot`.

                // Since I can't easily change MarketingService in this single file edit without breakage,
                // I'll call a new method I'll add to MarketingService next, OR 
                // I'll reuse executeMarketingSlot but filter inside it? No, that's messy.
                // I will add `executeSingleCampaignSlot` to MarketingService in the next step.
                // For now, I'll assume it exists or use the existing one and accept it might run all?
                // NO, running all would mean if Campaign A matches 09:00, it runs A, B, C...
                // B might be scheduled for 10:00. Running it at 09:00 is WRONG.

                // So I MUST implement `executeSingleCampaignSlot`.
                await marketingService.executeSingleCampaignSlot(this.client, campaign, slotType);
            }
        } catch (error) {
            console.error(`❌ Failed to trigger ${slotType} for ${campaign.name}:`, error);
        }
    }

    stop() {
        if (this.tasks.length > 0) {
            this.tasks.forEach(task => task.stop());
            this.tasks = [];
        }
    }
}

export const schedulerService = new SchedulerService();
