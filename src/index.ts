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

const app = express();
app.use(cors());
app.use(express.json());

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

app.post('/api/settings', (req, res) => {
    // Placeholder for future settings updates (e.g. system prompt, auto-reply toggle)
    // Currently settings are handled via environment variables or client-side storage.
    res.json({ success: true, message: 'Settings endpoint is currently a placeholder.' });
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

        res.json(profile);
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

app.post('/api/marketing/campaign', async (req, res) => {
    try {
        const { marketingService } = await import('./services/marketing/marketingService');
        const { name, morningTime, afternoonTime, eveningTime } = req.body;
        const result = await marketingService.createCampaign(name, morningTime, afternoonTime, eveningTime);
        res.json({ success: true, message: result });
    } catch (error) {
        console.error('Failed to create campaign:', error);
        res.status(500).json({ error: 'Failed to create campaign' });
    }
});

app.get('/api/marketing/groups', async (req, res) => {
    try {
        if (!whatsappClient) {
            return res.json({ success: false, error: 'WhatsApp client not initialized' });
        }

        const groupJids = await whatsappClient.getAllGroups();

        // Get active campaign to check selected groups
        const activeCampaign = await db.query.marketingCampaigns.findFirst({
            where: eq(marketingCampaigns.status, 'active')
        });

        const selectedGroups = (activeCampaign?.targetGroups as any as string[]) || [];
        // If no targetGroups defined (legacy), defaulting to ALL being selected is safer logic-wise for now, 
        // OR we can make the UI handle it. 
        // Let's assume: empty targetGroups = broadcast to all (legacy behavior) 
        // BUT for UI, if it's null, we might want to check all by default.
        const isLegacy = !(activeCampaign?.targetGroups as any);

        // Fetch group metadata for each group
        const groups = await Promise.all(groupJids.map(async (jid: string) => {
            try {
                const metadata = await whatsappClient['sock']?.groupMetadata(jid);
                return {
                    id: jid,
                    name: metadata?.subject || 'Unknown Group',
                    participants: metadata?.participants?.length || 0,
                    selected: isLegacy ? true : selectedGroups.includes(jid)
                };
            } catch (error) {
                console.error(`Failed to fetch metadata for ${jid}:`, error);
                return {
                    id: jid,
                    name: 'Unknown Group',
                    participants: 0,
                    selected: isLegacy ? true : selectedGroups.includes(jid)
                };
            }
        }));

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

// Catch-all route: Serve index.html for all non-API routes (SPA support)
app.get('*', (req, res) => {
    // Don't intercept API routes
    if (req.path.startsWith('/api/') || req.path.startsWith('/health') || req.path.startsWith('/ready')) {
        return res.status(404).json({ error: 'Not Found' });
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

const start = async () => {
    try {
        console.log('🚀 Starting Autonomous Representative Agent...');

        // 1. Start API Server FIRST (so health checks pass immediately)
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
