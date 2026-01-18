import express from 'express';
import cors from 'cors';
import { config } from './config/env';
import { WhatsAppClient } from './core/whatsapp';

const app = express();
app.use(cors());

// Initialize Client
const client = new WhatsAppClient();

// API Endpoints
app.get('/api/status', (req, res) => {
    res.json(client.getStatus());
});

app.post('/api/settings', (req, res) => {
    // TODO: Implement settings update
    res.json({ success: true });
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
        const shutdown = () => {
            console.log('🛑 Shutting down...');
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (error) {
        console.error('❌ Fatal Error:', error);
        process.exit(1);
    }
};

start();
