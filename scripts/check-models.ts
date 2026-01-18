
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

function collectApiKeys(): string[] {
    const keys: string[] = [];
    const keysSet = new Set<string>();

    if (process.env.GEMINI_API_KEY) keysSet.add(process.env.GEMINI_API_KEY.trim());

    for (let i = 1; i <= 100; i++) {
        const key = process.env[`GEMINI_API_KEY${i}`];
        if (key) keysSet.add(key.trim());
    }

    if (process.env.GEMINI_API_KEYS) {
        process.env.GEMINI_API_KEYS.split(',').forEach(k => {
            const trimmed = k.trim();
            if (trimmed) keysSet.add(trimmed);
        });
    }

    return Array.from(keysSet).filter(key => key.length > 0);
}

async function checkModels() {
    console.log('🔍 Checking Availability of Standard Models...\n');
    const keys = collectApiKeys();

    if (keys.length === 0) {
        console.error('❌ No API keys found.');
        return;
    }

    const modelsToTest = [
        'gemini-2.0-flash-exp',
        'gemini-1.5-flash',
        'gemini-1.5-flash-001',
        'gemini-1.5-pro',
        'gemini-1.5-pro-001',
        'gemini-1.0-pro'
    ];

    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const preview = `${key.substring(0, 5)}...${key.substring(key.length - 4)}`;
        console.log(`🔑 Key #${i + 1} (${preview}):`);

        const genAI = new GoogleGenerativeAI(key);

        for (const modelName of modelsToTest) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                // Simple fast generation attempt
                const result = await model.generateContent('Hi');
                await result.response;
                console.log(`   ✅ ${modelName}: WORKING`);
            } catch (e: any) {
                if (e.message && (e.message.includes('429') || e.message.includes('Quota'))) {
                    console.log(`   ⏸️  ${modelName}: Rate Limited (429)`);
                } else if (e.message && (e.message.includes('404') || e.message.includes('not found'))) {
                    console.log(`   ❌ ${modelName}: Not Found / No Access`);
                } else {
                    console.log(`   ⚠️  ${modelName}: Error (${e.message.substring(0, 50)}...)`);
                }
            }
        }
        console.log('');
    }
}

checkModels().catch(console.error);
