import { db } from '../../database';
import { businessProfile, marketingCampaigns, scheduledPosts } from '../../database/schema';
import { eq, desc } from 'drizzle-orm';


export class MarketingService {
    private static instance: MarketingService;
    // Simple in-memory state for onboarding. 
    // In production, this should be in the DB (conversations table) or Redis.
    private onboardingSessions: Map<string, { step: number, data: any }> = new Map();

    // Global Cooldown Map to prevent double-posting to the same group (e.g. from multiple campaigns triggering at once)
    private lastGroupPostTime: Map<string, number> = new Map();
    private readonly GROUP_COOLDOWN_MS = 15 * 60 * 1000; // 15 Minutes

    private constructor() { }

    public static getInstance(): MarketingService {
        if (!MarketingService.instance) {
            MarketingService.instance = new MarketingService();
        }
        return MarketingService.instance;
    }

    /**
     * Start the onboarding interview for a user
     */
    public async startOnboarding(contactId: string): Promise<string> {
        this.onboardingSessions.set(contactId, { step: 1, data: {} });
        return "👋 Welcome to AutoAdsPro! I'm your new AI Marketing Manager.\n\nLet's get your business profile set up so I can start creating ads.\n\nFirst question: **What specifically do you sell?** (Products/Services)";
    }

    /**
     * Handle user response during onboarding
     */
    public async handleOnboardingResponse(contactId: string, message: string): Promise<string | null> {
        const session = this.onboardingSessions.get(contactId);
        if (!session) return null; // Not in onboarding

        switch (session.step) {
            case 1:
                session.data.productInfo = message;
                session.step++;
                this.onboardingSessions.set(contactId, session);
                return "Got it. Next: **Who is your ideal target audience?** (e.g., Young professionals, Stay-at-home moms, Tech enthusiasts)";

            case 2:
                session.data.targetAudience = message;
                session.step++;
                this.onboardingSessions.set(contactId, session);
                return "Understood. Last key question: **What is your Unique Selling Point (USP)?** Why should people buy from YOU instead of competitors?";

            case 3:
                session.data.uniqueSellingPoint = message;
                // Finish Onboarding
                await this.saveBusinessProfile(session.data);
                this.onboardingSessions.delete(contactId);
                return "🎉 Awesome! Your business profile is saved.\n\nI will now start analyzing your brand and creating your first campaign schedule.\n\nYou can say 'create campaign' to verify.";

            default:
                return null;
        }
    }

    private async saveBusinessProfile(data: any) {
        // Upsert logic (simplified: delete all and insert new, since we assume single tenant for now)
        // In multi-user, we'd check ID. Here simply assume one profile.
        const existing = await db.query.businessProfile.findFirst();
        if (existing) {
            await db.update(businessProfile)
                .set({
                    productInfo: data.productInfo,
                    targetAudience: data.targetAudience,
                    uniqueSellingPoint: data.uniqueSellingPoint,
                    updatedAt: new Date()
                })
                .where(eq(businessProfile.id, existing.id));
        } else {
            await db.insert(businessProfile).values({
                productInfo: data.productInfo,
                targetAudience: data.targetAudience,
                uniqueSellingPoint: data.uniqueSellingPoint,
                brandVoice: 'professional' // Default
            });
        }
    }

    /**
     * Check if a valid profile exists
     */
    public async hasProfile(): Promise<boolean> {
        const profile = await db.query.businessProfile.findFirst();
        return !!profile;
    }

    /**
     * Create a basic weekly campaign
     */
    /**
     * Create a basic weekly campaign
     */
    public async createCampaign(
        name: string = "AutoAds Weekly",
        morningTime: string = "07:00",
        afternoonTime: string = "13:00",
        eveningTime: string = "19:00",
        businessContext?: {
            productInfo?: string,
            targetAudience?: string,
            uniqueSellingPoint?: string,
            brandVoice?: string
        }
    ): Promise<string> {
        if (!await this.hasProfile() && (!businessContext || !businessContext.productInfo)) {
            return "❌ Please complete the onboarding first or provide campaign details."
        }

        // Check for duplicates
        const existingCampaign = await db.query.marketingCampaigns.findFirst({
            where: (campaigns, { eq, and, or }) => and(
                eq(campaigns.name, name),
                or(eq(campaigns.status, 'active'), eq(campaigns.status, 'paused'))
            )
        });

        if (existingCampaign) {
            throw new Error(`A campaign with the name '${name}' already exists. Please choose a different name.`);
        }

        if (existingCampaign) {
            throw new Error(`A campaign with the name '${name}' already exists. Please choose a different name.`);
        }

        // Validate Schedule (Anti-Spam Rule: 15 min gap)
        await this.validateScheduleConflicts(morningTime, afternoonTime, eveningTime);

        // Create Campaign Entry
        const [campaign] = await db.insert(marketingCampaigns).values({
            name,
            status: 'active',
            startDate: new Date(),
            morningTime,
            afternoonTime,
            eveningTime,
            // Save Business Context (if provided)
            productInfo: businessContext?.productInfo,
            targetAudience: businessContext?.targetAudience,
            uniqueSellingPoint: businessContext?.uniqueSellingPoint,
            brandVoice: businessContext?.brandVoice
        }).returning();

        return `✅ Campaign '${name}' created! ID: ${campaign.id}. Use 'view schedule' to see upcoming posts.`;
    }

    /**
     * Update an existing campaign
     */
    public async updateCampaign(id: number, updates: {
        name?: string,
        startDate?: Date,
        morningTime?: string,
        afternoonTime?: string,
        eveningTime?: string,
        status?: string,
        productInfo?: string,
        targetAudience?: string,
        uniqueSellingPoint?: string,
        brandVoice?: string,
        targetGroups?: any
    }): Promise<void> {
        // If name is being updated, check for duplicates
        if (updates.name) {
            const existingCampaign = await db.query.marketingCampaigns.findFirst({
                where: (campaigns, { eq, and, or, ne }) => and(
                    eq(campaigns.name, updates.name!),
                    or(eq(campaigns.status, 'active'), eq(campaigns.status, 'paused')),
                    ne(campaigns.id, id) // Exclude self
                )
            });

            if (existingCampaign) {
                throw new Error(`A campaign with the name '${updates.name}' already exists.`);
            }
        }

        // If times are being updated, validate them against conflicts
        if (updates.morningTime || updates.afternoonTime || updates.eveningTime) {
            const current = await db.query.marketingCampaigns.findFirst({
                where: eq(marketingCampaigns.id, id)
            });

            if (current) {
                await this.validateScheduleConflicts(
                    updates.morningTime || current.morningTime || undefined,
                    updates.afternoonTime || current.afternoonTime || undefined,
                    updates.eveningTime || current.eveningTime || undefined,
                    id
                );
            }
        }

        await db.update(marketingCampaigns)
            .set(updates)
            .where(eq(marketingCampaigns.id, id));
    }

    /**
     * Delete a campaign
     */
    public async deleteCampaign(id: number): Promise<void> {
        await db.delete(marketingCampaigns)
            .where(eq(marketingCampaigns.id, id));
    }



    /**
     * Prevents spam by ensuring campaigns are at least 15 minutes apart
     */
    private async validateScheduleConflicts(
        newMorning: string | undefined,
        newAfternoon: string | undefined,
        newEvening: string | undefined,
        excludeId?: number
    ) {
        // Fetch all active/paused campaigns
        const existingCampaigns = await db.query.marketingCampaigns.findMany({
            where: (campaigns, { ne, and, or, eq }) => and(
                or(eq(campaigns.status, 'active'), eq(campaigns.status, 'paused')),
                excludeId ? ne(campaigns.id, excludeId) : undefined
            )
        });

        const timeToMinutes = (timeStr: string) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const checkConflict = (newTime: string | undefined, slotName: string) => {
            if (!newTime) return;
            const newMin = timeToMinutes(newTime);

            for (const c of existingCampaigns) {
                // Check against ALL slots of other campaigns to ensure global separation
                const check = (existingTime: string | null, existingSlot: string) => {
                    if (!existingTime) return;
                    const existingMin = timeToMinutes(existingTime);
                    const diff = Math.abs(newMin - existingMin);
                    if (diff < 15) {
                        throw new Error(`⏳ Schedule Conflict: Your ${slotName} time (${newTime}) is too close to '${c.name}'s ${existingSlot} time (${existingTime}).\n\nTo prevent spam, please ensure a minimum 15-minute gap between all campaign activities.`);
                    }
                };

                check(c.morningTime, 'Morning');
                check(c.afternoonTime, 'Afternoon');
                check(c.eveningTime, 'Evening');
            }
        };

        checkConflict(newMorning, 'Morning');
        checkConflict(newAfternoon, 'Afternoon');
        checkConflict(newEvening, 'Evening');
    }

    /**
     * Execute a specific marketing slot for a SINGLE campaign
     * Called by Dynamic Scheduler
     */
    public async executeSingleCampaignSlot(client: any, campaign: any, slotType: string, customInstructions?: string) {
        console.log(`🚀 Executing Single Campaign Slot: ${slotType} for '${campaign.name}'`);
        try {
            if (slotType.startsWith('ad')) {
                await this.handleAdSlot(client, campaign, slotType, customInstructions);
            } else {
                await this.handleFactSlot(client, slotType, campaign);
            }
        } catch (e) {
            console.error(`❌ Failed to execute campaign ${campaign.name}:`, e);
        }
    }

    /**
     * Execute a specific marketing slot (Ad or Fact) - LEGACY / MASS TRIGGER
     * Kept for backward compatibility or manual triggers
     */
    public async executeMarketingSlot(client: any, slotType: 'ad_morning' | 'ad_afternoon' | 'ad_evening' | 'fact_morning' | 'fact_afternoon' | 'fact_evening', customInstructions?: string) {
        console.log(`🚀 Executing Marketing Slot (Mass): ${slotType}`);

        // 1. Check for Active Campaigns (Fetch ALL active)
        const campaigns = await db.query.marketingCampaigns.findMany({
            where: eq(marketingCampaigns.status, 'active')
        });

        if (!campaigns || campaigns.length === 0) {
            console.log("⚠️ No active marketing campaigns found. Skipping slot.");
            return;
        }

        console.log(`📢 Found ${campaigns.length} active campaigns.`);

        // 2. MANUAL OVERRIDE: If custom instructions exist, run ONCE with merged audience
        if (customInstructions) {
            console.log(`✨ Manual Post Detected ('${customInstructions.substring(0, 20)}...'). Merging audiences to prevent duplicates.`);

            // A. Aggregate Target Groups
            const uniqueTargetIds = new Set<string>();
            let targetsAll = false;

            for (const c of campaigns) {
                const targets = c.targetGroups as string[] | null;
                if (!targets || targets.length === 0) {
                    targetsAll = true; // One campaign targets ALL, so the manual post should target ALL
                    break;
                }
                targets.forEach(t => uniqueTargetIds.add(t));
            }

            // B. Construct 'Merged' Campaign
            // Use the first campaign as a template for other props, but override targets
            const mergedCampaign = {
                ...campaigns[0],
                name: "Manual Broadcast (Merged)",
                targetGroups: targetsAll ? [] : Array.from(uniqueTargetIds) // Empty array triggers "ALL" logic in getBroadcastGroups
            };

            // C. Execute Once
            await this.executeSingleCampaignSlot(client, mergedCampaign, slotType, customInstructions);
            return;
        }

        // 3. STANDARD SCHEDULE: Execute based on slot type for EACH campaign
        console.log(`🗓️ Scheduled Run: Executing ${campaigns.length} campaigns individually.`);
        const executions = campaigns.map(async (campaign) => {
            await this.executeSingleCampaignSlot(client, campaign, slotType, customInstructions);
        });

        await Promise.all(executions);
    }

    private async getBroadcastGroups(client: any, campaign: any): Promise<string[]> {
        // Fetch all WhatsApp groups the bot is a member of
        const allGroups = await client.getAllGroups();

        // 1. Use the passed campaign's target groups
        // If campaign has specific target groups designated, filter list
        const targetGroups = campaign?.targetGroups as string[] | null;

        if (targetGroups && Array.isArray(targetGroups) && targetGroups.length > 0) {
            // Filter: only include groups that are in the target list AND bot is still a member of
            const filtered = allGroups.filter((gid: string) => targetGroups.includes(gid));
            console.log(`🎯 Targeted Broadcasting for '${campaign.name}': ${filtered.length} groups selected out of ${allGroups.length} total.`);
            return filtered;
        }

        // 2. Fallback: Broadcast to all groups IF and ONLY IF checks pass?
        // Actually, if a campaign has NO targets, does it go to ALL?
        // Yes, legacy behavior.
        console.log(`📢 Broadcasting '${campaign?.name || 'Global'}' to ALL ${allGroups.length} groups (No specific targets set).`);
        return allGroups;
    }

    private async handleAdSlot(client: any, campaign: any, slot: string, customInstructions?: string) {
        const { adContentService } = await import('./adContentService');

        // Determine style based on slot
        let style = 'balanced';
        if (slot.includes('morning')) style = 'energetic, morning, fresh start';
        else if (slot.includes('afternoon')) style = 'practical, solution-focused, afternoon';
        else if (slot.includes('evening')) style = 'relaxed, aspirational, cozy, evening';

        // Check if forced text-only mode
        const forceTextOnly = process.env.FORCE_TEXT_ONLY_ADS === 'true';

        // Pass customInstructions if available
        const ad = await adContentService.generateAd(campaign.id, style, customInstructions);

        // LOG CONTENT FOR USER VERIFICATION
        console.log('\n📜 [GENERATED AD CONTENT]:');
        console.log('----------------------------------------');
        console.log(ad.text);
        console.log('----------------------------------------\n');

        // Get all groups to broadcast to
        const groups = await this.getBroadcastGroups(client, campaign);

        if (groups.length === 0) {
            console.log('⚠️ No groups found to broadcast to');
            return;
        }

        console.log(`📢 Broadcasting ad to ${groups.length} groups...`);
        if (forceTextOnly) {
            console.log('📝 Text-only mode enabled');
        }

        // Send to each group with delay
        for (const groupJid of groups) {
            // GLOBAL COOLDOWN CHECK
            const lastPost = this.lastGroupPostTime.get(groupJid) || 0;
            const now = Date.now();
            if (now - lastPost < this.GROUP_COOLDOWN_MS) {
                console.log(`⏳ Skipping Group ${groupJid} (Cooldown active). Last post was ${(now - lastPost) / 1000}s ago.`);
                continue;
            }

            try {
                // Update Timestamp immediately to block other concurrent campaigns
                this.lastGroupPostTime.set(groupJid, now);

                if (ad.imagePath && !forceTextOnly) {
                    console.log(`📸 Sending image ad to ${groupJid}...`);
                    try {
                        const fs = require('fs');
                        const buffer = fs.readFileSync(ad.imagePath);

                        await client.sendImage(groupJid, buffer, ad.text);
                        console.log(`✅ Image ad sent to ${groupJid}`);
                    } catch (imgError: any) {
                        console.error(`⚠️ Failed to send image to ${groupJid}, sending text fallback. Error:`, imgError.message);
                        // Only fallback if image send specifically failed (e.g., file error, upload error)
                        // Note: If timeout occurs in client.sendImage, it throws.
                        await client.sendText(groupJid, `(Image unavailable)\n\n${ad.text}`);
                        console.log(`✅ Fallback text ad sent to ${groupJid}`);
                    }
                } else {
                    console.log(`📝 Sending text ad to ${groupJid}...`);
                    await client.sendText(groupJid, ad.text);
                    console.log(`✅ Text ad sent to ${groupJid}`);
                }

                // Increased delay between groups for reliability and to avoid WhatsApp rate limits
                if (groups.indexOf(groupJid) < groups.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
                }
            } catch (error) {
                console.error(`❌ Failed to send to group ${groupJid}:`, error);
                // Continue to next group instead of failing completely
            }
        }

        // Cleanup image after all sends
        if (ad.imagePath) {
            const fs = require('fs');
            try {
                fs.unlinkSync(ad.imagePath);
                console.log('🗑️ Cleaned up temporary image file');
            } catch (e) {
                console.error('⚠️ Failed to cleanup image:', e);
            }
        }
    }

    private async handleFactSlot(client: any, slot: string, campaign?: any) {
        const { factService } = await import('./factService');

        let timeOfDay: 'morning' | 'afternoon' | 'evening' = 'morning';
        if (slot.includes('afternoon')) timeOfDay = 'afternoon';
        else if (slot.includes('evening')) timeOfDay = 'evening';

        const fact = await factService.getSmartFact(timeOfDay);
        if (!fact) return;

        const message = `🎲 *Random Fact*\n\n${fact}`;

        // Get groups based on the campaign (if provided), or global fallback
        const groups = await this.getBroadcastGroups(client, campaign);

        if (groups.length === 0) {
            console.log('⚠️ No groups found to broadcast fact to');
            return;
        }

        console.log(`📢 Broadcasting fact to ${groups.length} groups...`);

        // Send to each group with delay
        for (const groupJid of groups) {
            try {
                await client.sendText(groupJid, message);
                console.log(`✅ Sent fact to group: ${groupJid}`);

                // Delay between groups to avoid rate limits (consistent with ad broadcasts)
                if (groups.indexOf(groupJid) < groups.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 10000)); // 10 seconds
                }
            } catch (error) {
                console.error(`❌ Failed to send fact to group ${groupJid}:`, error);
            }
        }
    }
}

export const marketingService = MarketingService.getInstance();
