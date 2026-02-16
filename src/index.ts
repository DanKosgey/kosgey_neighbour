import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { WhatsAppClient } from './core/whatsapp';
import { TelegramClient } from './core/telegram';
import { db, testConnection } from './database';
import { contacts, messageLogs, authCredentials, aiProfile, userProfile, businessProfile, marketingCampaigns } from './database/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { sessionManager } from './services/sessionManager';
import { groupMetadataLimiter } from './utils/rateLimiter';
import { initializeDatabase } from './database/initialize';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from public directory
// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Clients
const whatsappClient = new WhatsAppClient();
const telegramClient = new TelegramClient();

// Health Check Endpoints (for Render)
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.get('/ready', async (req, res) => {
    const dbHealthy = await testConnection();
    if (dbHealthy) {
        res.json({ status: 'ready', database: 'connected' });
    } else {
        res.status(503).json({ status: 'not ready', database: 'disconnected' });
    }
});

// API Endpoints
app.get('/api/status', (req, res) => {
    res.json({
        whatsapp: whatsappClient.getStatus(),
        telegram: { connected: !!config.telegramBotToken }
    });
});

app.get('/api/contacts', async (req, res) => {
    try {
        const allContacts = await db.select().from(contacts).orderBy(desc(contacts.lastSeenAt));
        res.json(allContacts);
    } catch (error) {
        console.error('Failed to fetch contacts:', error);
        res.status(500).json({ error: 'Failed to fetch contacts' });
    }
});

app.get('/api/contacts/:phone', async (req, res) => {
    try {
        const contact = await db.select()
            .from(contacts)
            .where(eq(contacts.phone, req.params.phone))
            .then(rows => rows[0]);

        if (!contact) {
            return res.status(404).json({ error: 'Contact not found' });
        }

        res.json(contact);
    } catch (error) {
        console.error('Failed to fetch contact:', error);
        res.status(500).json({ error: 'Failed to fetch contact' });
    }
});

app.get('/api/chats', async (req, res) => {
    try {
        // Get all contacts with their last message
        const chatsData = await db.select({
            phone: contacts.phone,
            name: contacts.name,
            trustLevel: contacts.trustLevel,
            lastMessage: sql<string>`(
                SELECT content 
                FROM ${messageLogs} 
                WHERE contact_phone = ${contacts.phone} 
                ORDER BY created_at DESC 
                LIMIT 1
            )`,
            lastMessageTime: sql<Date>`(
                SELECT created_at 
                FROM ${messageLogs} 
                WHERE contact_phone = ${contacts.phone} 
                ORDER BY created_at DESC 
                LIMIT 1
            )`
        })
            .from(contacts)
            .orderBy(desc(sql`(
            SELECT created_at 
            FROM ${messageLogs} 
            WHERE contact_phone = ${contacts.phone} 
            ORDER BY created_at DESC 
            LIMIT 1
        )`));

        res.json(chatsData.filter(chat => chat.lastMessage));
    } catch (error) {
        console.error('Failed to fetch chats:', error);
        res.status(500).json({ error: 'Failed to fetch chats' });
    }
});

app.get('/api/chats/:phone/messages', async (req, res) => {
    try {
        const messages = await db.select()
            .from(messageLogs)
            .where(eq(messageLogs.contactPhone, req.params.phone))
            .orderBy(desc(messageLogs.createdAt))
            .limit(100);

        res.json(messages.reverse());
    } catch (error) {
        console.error('Failed to fetch messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

app.get('/api/stats', async (req, res) => {
    try {
        const totalContacts = await db.select({ count: sql<number>`count(*)` })
            .from(contacts)
            .then(rows => rows[0]?.count || 0);

        const totalMessages = await db.select({ count: sql<number>`count(*)` })
            .from(messageLogs)
            .then(rows => rows[0]?.count || 0);

        res.json({
            totalContacts,
            totalMessages,
            responseRate: 98,
            avgResponseTime: '12s'
        });
    } catch (error) {
        console.error('Failed to fetch stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});



app.get('/api/activity', async (req, res) => {
    try {
        const recentActivity = await db.select({
            id: messageLogs.id,
            type: messageLogs.role,
            content: messageLogs.content,
            timestamp: messageLogs.createdAt,
            contactName: contacts.name,
            contactPhone: contacts.phone
        })
            .from(messageLogs)
            .leftJoin(contacts, eq(messageLogs.contactPhone, contacts.phone))
            .orderBy(desc(messageLogs.createdAt))
            .limit(20);

        res.json(recentActivity.map(activity => ({
            id: activity.id,
            type: activity.type === 'agent' ? 'outgoing' : 'incoming',
            description: activity.type === 'agent'
                ? `Sent message to ${activity.contactName || activity.contactPhone}`
                : `Received message from ${activity.contactName || activity.contactPhone}`,
            detail: activity.content,
            time: activity.timestamp,
            icon: activity.type === 'agent' ? 'message-out' : 'message-in'
        })));
    } catch (error) {
        console.error('Failed to fetch activity:', error);
        res.status(500).json({ error: 'Failed to fetch activity' });
    }
});

app.post('/api/disconnect', async (req, res) => {
    try {
        console.log('🔌 Disconnect requested via API');

        // 1. Logout from WhatsApp gracefully
        await whatsappClient.logout();

        // 2. Release Session Lock
        await sessionManager.releaseLock();

        // 3. Clear Auth Credentials
        await db.delete(authCredentials);

        console.log('✅ Disconnected successfully. Ready for new QR scan.');

        // 4. Send success response (NO process.exit!)
        res.json({
            success: true,
            message: 'Disconnected successfully. Scan QR code to reconnect.',
            requiresRestart: false
        });

    } catch (error) {
        console.error('Disconnect failed:', error);
        res.status(500).json({ error: 'Failed to disconnect' });
    }
});

import { systemSettingsService } from './services/systemSettings';

app.get('/api/settings/system', async (req, res) => {
    try {
        const settings = await systemSettingsService.getAll();
        res.json({ success: true, settings });
    } catch (error) {
        console.error('Failed to fetch system settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});

app.post('/api/settings/system', async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key || value === undefined) {
            return res.status(400).json({ error: 'Key and value are required' });
        }
        await systemSettingsService.set(key, String(value));

        // If updating owner_phone, also update the ownerService cache
        if (key === 'owner_phone') {
            const { ownerService } = await import('./services/ownerService');
            await ownerService.getOwnerPhoneFromDB();
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Failed to update system setting:', error);
        res.status(500).json({ error: 'Failed to update setting' });
    }
});

app.post('/api/admin/migrate', async (req, res) => {
    try {
        console.log('🚀 Manual migration triggered via API');
        const { runMigrations } = await import('./database/migrate');
        await runMigrations();
        res.json({ success: true, message: 'Migrations executed successfully' });
    } catch (error) {
        console.error('Migration failed:', error);
        res.status(500).json({ error: 'Migration failed: ' + (error as Error).message });
    }
});

// AI Profile Endpoints
app.get('/api/ai-profile', async (req, res) => {
    try {
        const profile = await db.select().from(aiProfile).then(rows => rows[0]);

        // If no profile exists, return defaults
        if (!profile) {
            return res.json({
                id: null,
                agentName: 'Representative',
                agentRole: 'Personal Assistant',
                personalityTraits: 'Professional, helpful, and efficient',
                communicationStyle: 'Friendly yet professional',
                systemPrompt: null,
                greetingMessage: null,
                responseLength: 'medium',
                useEmojis: true,
                formalityLevel: 5
            });
        }

        res.json(profile);
    } catch (error) {
        console.error('Failed to fetch AI profile:', error);
        res.status(500).json({ error: 'Failed to fetch AI profile' });
    }
});

app.put('/api/ai-profile', async (req, res) => {
    try {
        const {
            agentName,
            agentRole,
            personalityTraits,
            communicationStyle,
            systemPrompt,
            greetingMessage,
            responseLength,
            useEmojis,
            formalityLevel
        } = req.body;

        // Check if profile exists
        const existing = await db.select().from(aiProfile).then(rows => rows[0]);

        let result;
        if (existing) {
            // Update existing profile
            result = await db.update(aiProfile)
                .set({
                    agentName,
                    agentRole,
                    personalityTraits,
                    communicationStyle,
                    systemPrompt,
                    greetingMessage,
                    responseLength,
                    useEmojis,
                    formalityLevel,
                    updatedAt: new Date()
                })
                .where(eq(aiProfile.id, existing.id))
                .returning();
        } else {
            // Create new profile
            result = await db.insert(aiProfile)
                .values({
                    agentName,
                    agentRole,
                    personalityTraits,
                    communicationStyle,
                    systemPrompt,
                    greetingMessage,
                    responseLength,
                    useEmojis,
                    formalityLevel
                })
                .returning();
        }

        res.json({ success: true, profile: result[0] });
    } catch (error) {
        console.error('Failed to update AI profile:', error);
        res.status(500).json({ error: 'Failed to update AI profile' });
    }
});

// User Profile Endpoints
app.get('/api/user-profile', async (req, res) => {
    try {
        const profile = await db.select().from(userProfile).then(rows => rows[0]);

        // If no profile exists, return empty profile
        if (!profile) {
            return res.json({
                id: null,
                fullName: null,
                preferredName: null,
                title: null,
                company: null,
                email: null,
                phone: null,
                location: null,
                timezone: null,
                industry: null,
                role: null,
                responsibilities: null,
                workingHours: null,
                availability: null,
                priorities: null,
                backgroundInfo: null,
                communicationPreferences: null
            });
        }

        // Get owner phone from database or config
        let ownerPhone = config.ownerPhone || 'Not configured';
        try {
            const dbOwnerPhone = await systemSettingsService.get('owner_phone');
            if (dbOwnerPhone) ownerPhone = dbOwnerPhone;
        } catch (e) {
            // ignore
        }

        const response = {
            ...profile,
            configOwnerPhone: ownerPhone
        };

        res.json(response);
    } catch (error) {
        console.error('Failed to fetch user profile:', error);
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

app.put('/api/user-profile', async (req, res) => {
    try {
        const {
            fullName,
            preferredName,
            title,
            company,
            email,
            phone,
            location,
            timezone,
            industry,
            role,
            responsibilities,
            workingHours,
            availability,
            priorities,
            backgroundInfo,
            communicationPreferences
        } = req.body;

        // Check if profile exists
        const existing = await db.select().from(userProfile).then(rows => rows[0]);

        let result;
        if (existing) {
            // Update existing profile
            result = await db.update(userProfile)
                .set({
                    fullName,
                    preferredName,
                    title,
                    company,
                    email,
                    phone,
                    location,
                    timezone,
                    industry,
                    role,
                    responsibilities,
                    workingHours,
                    availability,
                    priorities,
                    backgroundInfo,
                    communicationPreferences,
                    updatedAt: new Date()
                })
                .where(eq(userProfile.id, existing.id))
                .returning();
        } else {
            // Create new profile
            result = await db.insert(userProfile)
                .values({
                    fullName,
                    preferredName,
                    title,
                    company,
                    email,
                    phone,
                    location,
                    timezone,
                    industry,
                    role,
                    responsibilities,
                    workingHours,
                    availability,
                    priorities,
                    backgroundInfo,
                    communicationPreferences
                })
                .returning();
        }

        res.json({ success: true, profile: result[0] });
    } catch (error) {
        console.error('Failed to update user profile:', error);
        res.status(500).json({ error: 'Failed to update user profile' });
    }
});

// Marketing Endpoints
app.get('/api/marketing/profile', async (req, res) => {
    try {
        const profile = await db.select().from(businessProfile).then(rows => rows[0]);

        if (!profile) {
            return res.json({
                productInfo: '',
                targetAudience: '',
                uniqueSellingPoint: '',
                brandVoice: 'professional'
            });
        }
        res.json(profile);
    } catch (error) {
        console.error('Failed to fetch marketing profile:', error);
        res.status(500).json({ error: 'Failed to fetch marketing profile' });
    }
});

app.put('/api/marketing/profile', async (req, res) => {
    try {
        const { productInfo, targetAudience, uniqueSellingPoint, brandVoice } = req.body;
        const existing = await db.select().from(businessProfile).then(rows => rows[0]);

        let result;
        if (existing) {
            result = await db.update(businessProfile)
                .set({
                    productInfo,
                    targetAudience,
                    uniqueSellingPoint,
                    brandVoice,
                    updatedAt: new Date()
                })
                .where(eq(businessProfile.id, existing.id))
                .returning();
        } else {
            result = await db.insert(businessProfile)
                .values({
                    productInfo,
                    targetAudience,
                    uniqueSellingPoint,
                    brandVoice
                })
                .returning();
        }
        res.json({ success: true, profile: result[0] });
    } catch (error) {
        console.error('Failed to update marketing profile:', error);
        res.status(500).json({ error: 'Failed to update marketing profile' });
    }
});

// AI-Powered Business Description Enhancement
app.post('/api/marketing/enhance-description', async (req, res) => {
    try {
        const { rawDescription } = req.body;

        if (!rawDescription || rawDescription.trim().length === 0) {
            return res.status(400).json({ error: 'Description is required' });
        }

        const { geminiService } = await import('./services/ai/gemini');

        const enhancementPrompt = `You are a business analyst helping to create a comprehensive business profile.

USER'S BRIEF DESCRIPTION:
"${rawDescription}"

Your task: Transform this into a detailed, professional business description that will help AI models generate highly relevant marketing content.

Include:
1. **Industry & Market**: What industry/sector is this business in?
2. **Core Offering**: What exactly do they sell/provide? Be specific.
3. **Target Customers**: Who are the ideal customers? Demographics, needs, pain points.
4. **Unique Value**: What makes this business different/better than competitors?
5. **Brand Personality**: What tone/voice should marketing have? (Professional, friendly, luxury, etc.)
6. **Key Benefits**: Top 3-5 benefits customers get from this business.

Format as a cohesive paragraph (150-250 words). Be specific and actionable. Avoid generic fluff.`;

        const enhanced = await geminiService.generateText(enhancementPrompt);

        res.json({
            success: true,
            enhancedDescription: enhanced.trim()
        });
    } catch (error) {
        console.error('Failed to enhance description:', error);
        res.status(500).json({ error: 'Failed to enhance description' });
    }
});



// Manual Campaign Trigger Endpoint
app.post('/api/marketing/trigger-now', async (req, res) => {
    try {
        const { campaignId, slotType } = req.body;

        if (!campaignId) {
            return res.status(400).json({ error: 'campaignId is required' });
        }

        const { marketingService } = await import('./services/marketing/marketingService');

        // Fetch campaign details
        const campaign = await db.query.marketingCampaigns.findFirst({
            where: eq(marketingCampaigns.id, campaignId)
        });

        if (!campaign) {
            return res.status(404).json({ error: 'Campaign not found' });
        }

        const type = slotType || 'ad_manual_trigger';

        if (!whatsappClient || whatsappClient.getStatus().status !== 'CONNECTED') {
            console.error('❌ WhatsApp client not available/connected for manual trigger');
            return res.status(503).json({ error: 'WhatsApp client not ready' });
        }

        console.log(`🚀 Manually triggering campaign: ${campaign.name} (${type})`);

        // Execute asynchronously
        marketingService.executeSingleCampaignSlot(whatsappClient, campaign, type, "Manual trigger by user")
            .then(() => console.log(`✅ Manual trigger for ${campaign.name} completed`))
            .catch(err => console.error(`❌ Manual trigger for ${campaign.name} failed:`, err));

        res.json({ success: true, message: 'Campaign triggered successfully' });
    } catch (error) {
        console.error('Failed to trigger campaign:', error);
        res.status(500).json({ error: 'Failed to trigger campaign' });
    }
});

app.post('/api/marketing/campaign', async (req, res) => {
    try {
        const { marketingService } = await import('./services/marketing/marketingService');
        const { name, morningTime, afternoonTime, eveningTime, productInfo, targetAudience, uniqueSellingPoint, brandVoice, businessDescription, companyLink, contentSource, selectedProductId, selectedShopId } = req.body;

        const businessContext = (productInfo || contentSource || selectedProductId || selectedShopId) ? {
            productInfo,
            targetAudience,
            uniqueSellingPoint,
            brandVoice,
            businessDescription,
            companyLink,
            contentSource: contentSource || 'ai',
            selectedProductId: selectedProductId ?? null,
            selectedShopId: selectedShopId ?? null
        } : undefined;

        const result = await marketingService.createCampaign(
            name,
            morningTime,
            afternoonTime,
            eveningTime,
            businessContext
        );
        res.json({ success: true, message: result });
    } catch (error) {
        console.error('Failed to create campaign:', error);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
});

app.put('/api/marketing/campaign/:id', async (req, res) => {
    try {
        const { marketingService } = await import('./services/marketing/marketingService');
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid campaign ID' });
        }
        await marketingService.updateCampaign(id, req.body);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to update campaign:', error);
        res.status(500).json({ error: 'Failed to update campaign' });
    }
});

app.delete('/api/marketing/campaign/:id', async (req, res) => {
    try {
        const { marketingService } = await import('./services/marketing/marketingService');
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            return res.status(400).json({ error: 'Invalid campaign ID' });
        }
        await marketingService.deleteCampaign(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to delete campaign:', error);
        res.status(500).json({ error: 'Failed to delete campaign' });
    }
});

app.get('/api/marketing/campaigns', async (req, res) => {
    try {
        const campaigns = await db.select().from(marketingCampaigns).orderBy(desc(marketingCampaigns.createdAt));
        res.json({ success: true, campaigns });
    } catch (error) {
        console.error('Failed to fetch campaigns:', error);
        res.status(500).json({ error: 'Failed to fetch campaigns' });
    }
});

app.get('/api/marketing/groups', async (req, res) => {
    try {
        console.log('🔍 API Hit: /api/marketing/groups');

        if (!whatsappClient) {
            console.error('❌ WhatsApp client is undefined');
            return res.json({ success: false, error: 'WhatsApp client not initialized' });
        }

        const status = whatsappClient.getStatus();
        console.log('📊 WhatsApp Status:', status);

        const groupJids = await whatsappClient.getAllGroups();
        console.log(`📦 Fetched ${groupJids.length} group JIDs`);

        const campaignId = req.query.campaignId ? parseInt(req.query.campaignId as string) : null;

        let selectedGroups: string[] = [];

        if (campaignId) {
            // Fetch specific campaign
            const campaign = await db.query.marketingCampaigns.findFirst({
                where: eq(marketingCampaigns.id, campaignId)
            });
            selectedGroups = (campaign?.targetGroups as any as string[]) || [];
        } else {
            selectedGroups = [];
        }

        // Fetch group metadata using cache - much faster!
        // Cache is checked first, API is only hit for stale/missing entries
        const groups = [];
        for (const jid of groupJids) {
            try {
                const isSelected = selectedGroups.includes(jid);
                // Use cached version for ~10x speed improvement on subsequent requests
                const metadata = await (whatsappClient as any).getCachedGroupMetadata(jid);
                groups.push({
                    id: jid,
                    name: metadata?.subject || 'Unknown Group',
                    participants: metadata?.totalMembers || 0,
                    selected: isSelected,
                    cached: metadata?.cached
                });
            } catch (error) {
                console.error(`Failed to fetch metadata for ${jid}:`, error);
                groups.push({
                    id: jid,
                    name: 'Unknown Group (Load Error)',
                    participants: 0,
                    selected: selectedGroups.includes(jid),
                    cached: false
                });
            }
        }

        res.json({ success: true, groups });
    } catch (error) {
        console.error('Failed to fetch groups:', error);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

app.put('/api/marketing/campaign/targets', async (req, res) => {
    try {
        const { targetGroups } = req.body;

        if (!Array.isArray(targetGroups)) {
            return res.status(400).json({ success: false, error: 'targetGroups must be an array' });
        }

        // Update active campaign
        const activeCampaign = await db.query.marketingCampaigns.findFirst({
            where: eq(marketingCampaigns.status, 'active')
        });

        if (!activeCampaign) {
            return res.status(404).json({ success: false, error: 'No active campaign found' });
        }

        await db.update(marketingCampaigns)
            .set({ targetGroups: targetGroups as any }) // Cast targetGroups to any for jsonb field
            .where(eq(marketingCampaigns.id, activeCampaign.id));

        res.json({ success: true, message: 'Target groups updated' });
    } catch (error) {
        console.error('Failed to update target groups:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});


// ShopFlow Endpoints
app.get('/api/shops', async (req, res) => {
    try {
        const { shopService } = await import('./services/shopService');
        const shops = await shopService.getAllShops();
        // Ensure we always return an array
        res.json(Array.isArray(shops) ? shops : []);
    } catch (error: any) {
        console.error('Failed to fetch shops:', error.message);
        // Return empty array instead of error to prevent client-side .map() errors
        // Client will show "No shops" instead of crashing
        if (error.code === '42P01' || error.message?.includes('does not exist')) {
            console.warn('⚠️ Shops table does not exist yet - returning empty array');
            res.json([]);
        } else {
            res.status(500).json({ error: 'Failed to fetch shops' });
        }
    }
});

app.post('/api/shops', async (req, res) => {
    try {
        const { shopService } = await import('./services/shopService');
        const { name, description, emoji, type } = req.body;
        if (!name) return res.status(400).json({ error: 'Shop name is required' });

        const newShop = await shopService.createShop(name, description, emoji, type);
        res.json({ success: true, shop: newShop });
    } catch (error) {
        console.error('Failed to create shop:', error);
        res.status(500).json({ error: 'Failed to create shop' });
    }
});

app.get('/api/shops/:id', async (req, res) => {
    try {
        const { shopService } = await import('./services/shopService');
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid shop ID' });

        const shop = await shopService.getShopById(id);
        if (!shop) return res.status(404).json({ error: 'Shop not found' });

        res.json(shop);
    } catch (error) {
        console.error('Failed to fetch shop:', error);
        res.status(500).json({ error: 'Failed to fetch shop' });
    }
});

app.delete('/api/shops/:id', async (req, res) => {
    try {
        const { shopService } = await import('./services/shopService');
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid shop ID' });

        await shopService.deleteShop(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to delete shop:', error);
        res.status(500).json({ error: 'Failed to delete shop' });
    }
});

app.post('/api/shops/:id/products', async (req, res) => {
    try {
        const { shopService } = await import('./services/shopService');
        const shopId = parseInt(req.params.id);
        if (isNaN(shopId)) return res.status(400).json({ error: 'Invalid shop ID' });

        const { name, price, stock, description, image, imageUrls } = req.body;
        const productData = {
            name,
            description,
            price: parseFloat(price),
            stock: parseInt(stock),
            imageUrl: image,
            imageUrls: Array.isArray(imageUrls) ? imageUrls : undefined
        };

        const product = await shopService.addProduct(shopId, productData);
        res.json({ success: true, product });
    } catch (error) {
        console.error('Failed to add product:', error);
        res.status(500).json({ error: 'Failed to add product' });
    }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const { shopService } = await import('./services/shopService');
        const id = parseInt(req.params.id);
        if (isNaN(id)) return res.status(400).json({ error: 'Invalid product ID' });

        await shopService.deleteProduct(id);
        res.json({ success: true });
    } catch (error) {
        console.error('Failed to delete product:', error);
        res.status(500).json({ error: 'Failed to delete product' });
    }
});

// Analytics API Endpoints
app.get('/api/analytics/groups/details/:jid', async (req, res) => {
    try {
        const { groupService } = await import('./services/groupService');
        const jid = req.params.jid;
        const details = await groupService.getGroupDetails(jid);

        if (!details) {
            return res.status(404).json({ error: 'Group not found' });
        }

        res.json(details);
    } catch (error) {
        console.error('Failed to fetch group details:', error);
        res.status(500).json({ error: 'Failed to fetch group details' });
    }
});

app.get('/api/analytics/groups', async (req, res) => {
    console.log('📊 API Request: GET /api/analytics/groups');
    try {
        const { groupService } = await import('./services/groupService');
        const stats = await groupService.getGroupStats();
        console.log('✅ Group Stats calculated:', JSON.stringify(stats, null, 2));

        // Also fetch list of top groups
        // We'll just return the stats object which includes largestGroups
        res.json(stats);
    } catch (error) {
        console.error('❌ Failed to fetch group analytics:', error);
        console.error('Failed to fetch group analytics:', error);
        res.status(500).json({ error: 'Failed to fetch group analytics' });
    }
});

app.get('/api/analytics/engagement', async (req, res) => {
    try {
        const { analyticsService } = await import('./services/analyticsService');
        const stats = await analyticsService.getDashboardStats();
        res.json(stats);
    } catch (error) {
        console.error('Failed to fetch engagement analytics:', error);
        res.status(500).json({ error: 'Failed to fetch engagement analytics' });
    }
});

app.get('/api/analytics/dashboard', async (req, res) => {
    try {
        const { analyticsService } = await import('./services/analyticsService');
        const { groupService } = await import('./services/groupService');
        const timeframe = (req.query.timeframe as string) || 'weekly';
        const [dashboard, groupStats] = await Promise.all([
            analyticsService.getAnalyticsByTimeframe(timeframe as any),
            groupService.getGroupStats()
        ]);
        res.json({ ...dashboard, groupStats });
    } catch (error) {
        console.error('Failed to fetch analytics dashboard:', error);
        res.status(500).json({ error: 'Failed to fetch analytics dashboard' });
    }
});

// SPA fallback: Serve index.html for all non-API routes
// This must be AFTER all API routes
app.use((req, res, next) => {
    // Only handle GET requests that aren't for API endpoints
    if (req.method === 'GET' && !req.path.startsWith('/api/') && !req.path.startsWith('/health') && !req.path.startsWith('/ready')) {
        res.sendFile(path.join(__dirname, '../public/index.html'));
    } else {
        next();
    }
});


const start = async () => {
    try {
        console.log('🚀 Starting Autonomous Representative Agent...');

        // 0. Initialize Database FIRST - Wait for migrations to complete
        console.log('🗄️ Initializing database and running migrations...');
        const dbInitialized = await initializeDatabase();
        if (!dbInitialized) {
            console.warn('⚠️ Database initialization completed with warnings, continuing startup...');
        } else {
            console.log('✅ Database initialization successful');
        }

        // 1. Start API Server
        const PORT = config.port;
        const server = app.listen(PORT, () => {
            console.log(`🌍 API Server running on port ${PORT}`);
        });

        // 2. Initialize Clients (Async)
        console.log('🔌 Initializing Clients in background...');
        whatsappClient.initialize().catch(err => {
            console.error('❌ Failed to initialize WhatsApp Client:', err);
        });

        telegramClient.initialize().catch(err => {
            console.error('❌ Failed to initialize Telegram Client:', err);
        });

        // 3. Start Background Worker for Queue Processing
        console.log('🔄 Starting Background Worker for queue processing...');
        const { backgroundWorker } = await import('./services/backgroundWorker');
        backgroundWorker.start();

        console.log('✨ System Operational. Waiting for messages...');

        // Graceful Shutdown
        const shutdown = async (signal: string) => {
            console.log(`🛑 Received ${signal}. Shutting down gracefully...`);

            try {
                // Stop background worker first
                const { backgroundWorker } = await import('./services/backgroundWorker');
                backgroundWorker.stop();

                // Stop server
                server.close();

                // Give pending operations a moment to complete
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Release session lock
                await sessionManager.releaseLock();
                console.log('✅ Session lock released');

                // Gracefully shutdown queue system and clients
                console.log('👋 Shutting down clients and queues...');
                await whatsappClient.shutdown();
                await telegramClient.shutdown();

                process.exit(0);
            } catch (error) {
                console.error('Error during shutdown:', error);
                process.exit(1);
            }
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));

        // Global Error Handlers
        process.on('uncaughtException', (err) => {
            console.error('🔥 Uncaught Exception:', err);
            // Ideally log to external service
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
        });

    } catch (error) {
        console.error('❌ Fatal Error:', error);
        await sessionManager.releaseLock();
        process.exit(1);
    }
};

start();
