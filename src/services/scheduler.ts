import cron, { ScheduledTask } from 'node-cron';
import { eq } from 'drizzle-orm';
import { WhatsAppClient } from '../core/whatsapp';
import { db } from '../database';
import { userProfile, marketingCampaigns } from '../database/schema';

export class SchedulerService {
    private client: WhatsAppClient | undefined;
    private tasks: ScheduledTask[] = [];

    // Guard: prevent two simultaneous tick executions from colliding
    private isCheckingSlots: boolean = false;

    // Cache timezone so we don't hit the DB every single minute
    private cachedTimezone: string | null = null;
    private timezoneLastFetched: number = 0;
    private readonly TIMEZONE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

    init(client: WhatsAppClient) {
        this.client = client;
        this.start();
    }

    async start() {
        this.stop(); // Ensure no stale tasks from previous connection
        console.log('⏰ Starting Scheduler Service (Dynamic Mode)...');

        // --- Main per-minute heartbeat ---
        // Checks every minute whether any campaign has a slot matching now
        const task = cron.schedule('* * * * *', async () => {
            await this.checkAndExecuteSlots();
        });
        this.tasks.push(task);
        console.log('✅ Scheduler initialized: Monitoring active campaigns every minute.');

        // --- Random content every 2 hours ---
        const randomContentTask = cron.schedule('0 */2 * * *', async () => {
            await this.broadcastRandomContent();
        });
        this.tasks.push(randomContentTask);
        console.log('✅ Random content scheduler initialized: Every 2 hours.');

        // --- Self-ping every 10 minutes (keep-alive for Render free tier) ---
        const pingTask = cron.schedule('*/10 * * * *', async () => {
            await this.runSelfPing();
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

            const response = await fetch(url);
            if (response.ok) {
                console.log('💓 Keep-alive ping OK');
            } else {
                console.error(`⚠️ Keep-alive ping returned status: ${response.status}`);
            }
        } catch (error: any) {
            console.error('❌ Keep-alive ping failed:', error.message);
        }
    }

    private async broadcastRandomContent() {
        try {
            console.log('🎲 Generating random content for broadcast...');
            // Optional dependency import inside the logic so it doesn't break if unused
            const { randomContentService } = await import('./marketing/randomContentService');

            const randomContent = await randomContentService.generateRandomContent();
            const message = randomContentService.formatForWhatsApp(randomContent);

            if (!this.client) {
                console.error('❌ WhatsApp client not available for random content broadcast');
                return;
            }

            const groups = await this.client.getAllGroups();

            if (groups.length === 0) {
                console.log('⚠️ No groups found for random content broadcast');
                return;
            }

            console.log(`📢 Broadcasting random ${randomContent.type} to ${groups.length} groups...`);

            for (const groupJid of groups) {
                try {
                    await this.client.sendText(groupJid, message);
                    console.log(`✅ Random content sent to ${groupJid}`);

                    if (groups.indexOf(groupJid) < groups.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                } catch (error) {
                    console.error(`❌ Failed to send random content to ${groupJid}:`, error);
                }
            }

            console.log('✅ Random content broadcast complete');
        } catch (error) {
            console.error('❌ Random content broadcast failed:', error);
        }
    }

    private async getTimezone(): Promise<string> {
        const now = Date.now();
        // Return cached value if still fresh
        if (this.cachedTimezone && (now - this.timezoneLastFetched) < this.TIMEZONE_CACHE_TTL_MS) {
            return this.cachedTimezone;
        }

        try {
            const profile = await db.query.userProfile.findFirst();
            const tz = profile?.timezone || 'Africa/Nairobi'; // Default to Kenya Time
            this.cachedTimezone = tz;
            this.timezoneLastFetched = now;
            return tz;
        } catch (e) {
            // If DB is unavailable just use cached or fallback
            if (this.cachedTimezone) return this.cachedTimezone;
            return 'Africa/Nairobi';
        }
    }

    private async checkAndExecuteSlots() {
        // --- Execution guard: skip if previous tick is still running ---
        if (this.isCheckingSlots) {
            console.log('⚠️ Scheduler: previous tick still running, skipping this minute.');
            return;
        }

        this.isCheckingSlots = true;
        try {
            // 1. Resolve user timezone (cached)
            const timezone = await this.getTimezone();

            // 2. Format current time in user's timezone as HH:mm
            const now = new Date();
            const currentTime = now.toLocaleTimeString('en-GB', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            console.log(`⏱️ Scheduler Tick: ${currentTime} (${timezone})`);

            // 3. Fetch all active campaigns
            let campaigns: any[] = [];
            try {
                campaigns = await db.query.marketingCampaigns.findMany({
                    where: eq(marketingCampaigns.status, 'active')
                });
            } catch (dbErr: any) {
                console.error('❌ Scheduler: DB error fetching campaigns:', dbErr.message || dbErr);
                return; // Will retry next minute
            }

            if (!campaigns.length) {
                console.log('📭 Scheduler: No active campaigns found. Nothing to do.');
                return;
            }

            console.log(`📋 Scheduler: Found ${campaigns.length} active campaign(s). Checking slots...`);

            // 4. Check each campaign for a time match — run matched slots in parallel
            const triggers: Promise<void>[] = [];

            for (const campaign of campaigns) {
                const morning = campaign.morningTime;
                const afternoon = campaign.afternoonTime;
                const evening = campaign.eveningTime;

                console.log(
                    `  📌 "${campaign.name}" — ` +
                    `morning=${morning || 'none'} | ` +
                    `afternoon=${afternoon || 'none'} | ` +
                    `evening=${evening || 'none'}`
                );

                if (morning && morning === currentTime) {
                    console.log(`  ✅ MATCH: morning slot for "${campaign.name}"`);
                    triggers.push(this.triggerSlot(campaign, 'ad_morning'));
                } else if (afternoon && afternoon === currentTime) {
                    console.log(`  ✅ MATCH: afternoon slot for "${campaign.name}"`);
                    triggers.push(this.triggerSlot(campaign, 'ad_afternoon'));
                } else if (evening && evening === currentTime) {
                    console.log(`  ✅ MATCH: evening slot for "${campaign.name}"`);
                    triggers.push(this.triggerSlot(campaign, 'ad_evening'));
                }
            }

            if (triggers.length === 0) {
                console.log('⏭️ Scheduler: No slots matched current time. Waiting...');
            } else {
                console.log(`🚀 Scheduler: Firing ${triggers.length} slot(s)...`);
                // Run all matched triggers concurrently — each has its own error handling
                await Promise.allSettled(triggers);
            }

        } catch (error) {
            console.error('❌ Scheduler Error:', error);
        } finally {
            this.isCheckingSlots = false;
        }
    }

    private async triggerSlot(campaign: any, slotType: string): Promise<void> {
        console.log(`⏰ Triggering ${slotType} for campaign "${campaign.name}" (id=${campaign.id})`);
        try {
            if (!this.client) {
                console.error(`❌ Cannot trigger ${slotType} for "${campaign.name}": WhatsApp client is not ready.`);
                return;
            }
            const { marketingService } = await import('./marketing/marketingService');
            await marketingService.executeSingleCampaignSlot(this.client, campaign, slotType);
            console.log(`✅ Slot ${slotType} completed for "${campaign.name}"`);
        } catch (error) {
            console.error(`❌ Failed to trigger ${slotType} for "${campaign.name}":`, error);
        }
    }

    stop() {
        if (this.tasks.length > 0) {
            this.tasks.forEach(task => task.stop());
            this.tasks = [];
            console.log('🛑 Scheduler Service stopped.');
        }
    }
}

export const schedulerService = new SchedulerService();
