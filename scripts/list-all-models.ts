
import dotenv from 'dotenv';
// @ts-ignore
import fetch from 'node-fetch';

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

async function listModelsForKey(key: string, index: number) {
    const preview = `${key.substring(0, 5)}...${key.substring(key.length - 4)}`;
    console.log(`\n🔑 Key #${index} (${preview}):`);

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);

        if (!response.ok) {
            console.error(`   ❌ API Error: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(`   Details: ${text}`);
            return;
        }

        const data: any = await response.json();

        if (!data.models || data.models.length === 0) {
            console.log('   ⚠️  No models found for this key.');
            return;
        }

        console.log(`   ✅ Found ${data.models.length} models:`);
        data.models.forEach((m: any) => {
            // Filter only likely "generateContent" models to reduce noise
            if (m.supportedGenerationMethods?.includes('generateContent')) {
                console.log(`      - ${m.name} (${m.displayName})`);
            }
        });

    } catch (error: any) {
        console.error(`   ❌ Network/Script Error: ${error.message}`);
    }
}

async function main() {
    const keys = collectApiKeys();

    if (keys.length === 0) {
        console.error('No API keys found in .env');
        return;
    }

    for (let i = 0; i < keys.length; i++) {
        await listModelsForKey(keys[i], i + 1);
    }
}

main();
