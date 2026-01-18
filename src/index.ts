import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import { WhatsAppClient } from './core/whatsapp';
import { db } from './database';
import { contacts, messageLogs, authCredentials } from './database/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { sessionManager } from './services/sessionManager';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Initialize Client
const client = new WhatsAppClient();

// API Endpoints
app.get('/api/status', (req, res) => {
    res.json(client.getStatus());
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

        // 1. Release Session Lock
        await sessionManager.releaseLock();

        // 2. Clear Auth Credentials to force logout
        await db.delete(authCredentials);

        console.log('✅ Auth credentials cleared and lock released.');

        // 3. Send success response before exiting
        res.json({ success: true, message: 'Disconnected. Service will restart and wait for new QR.' });

        // 4. Force exit to restart service (Render will restart it)
        // Give it a moment to send the response
        setTimeout(() => {
            console.log('👋 Exiting process to trigger restart...');
            process.exit(0);
        }, 1000);

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

const start = async () => {
    try {
        console.log('🚀 Starting Autonomous Representative Agent...');

        // 1. Initialize WhatsApp Client
        await client.initialize();

        // 2. Start API Server
        const PORT = config.port;
        app.listen(PORT, () => {
            console.log(`🌍 API Server running on port ${PORT}`);
        });

        console.log('✨ System Operational. Waiting for messages...');

        // Graceful Shutdown
        const shutdown = async () => {
            console.log('🛑 Shutting down gracefully...');

            // Release session lock
            await sessionManager.releaseLock();
            console.log('✅ Session lock released');

            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (error) {
        console.error('❌ Fatal Error:', error);
        await sessionManager.releaseLock();
        process.exit(1);
    }
};

start();
