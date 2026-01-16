import { WhatsAppClient } from './core/whatsapp';

const start = async () => {
    try {
        console.log('🚀 Starting Autonomous Representative Agent...');

        // 1. Database connection is handled automatically by Drizzle config in ./database/index.ts

        // 2. Initialize WhatsApp Client (The Body)
        const client = new WhatsAppClient();
        await client.initialize();

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
