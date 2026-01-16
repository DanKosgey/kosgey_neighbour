const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listModels() {
    try {
        const response = await fetch(
            'https://generativelanguage.googleapis.com/v1beta/models',
            {
                headers: {
                    'x-goog-api-key': process.env.GEMINI_API_KEY
                }
            }
        );

        const data = await response.json();

        console.log('\n📋 Available Models:\n');

        if (data.models) {
            const supportedModels = data.models.filter(m =>
                m.supportedGenerationMethods?.includes('generateContent')
            );

            supportedModels.forEach(model => {
                console.log(`✓ ${model.name}`);
                console.log(`  Display Name: ${model.displayName}`);
                console.log(`  Description: ${model.description || 'N/A'}`);
                console.log('');
            });

            console.log('\n🎯 Recommended for your use case:');
            const recommended = supportedModels.find(m =>
                m.name.includes('gemini-1.5-pro') || m.name.includes('gemini-pro')
            );

            if (recommended) {
                console.log(`Model: ${recommended.name}`);
            } else if (supportedModels.length > 0) {
                console.log(`Model: ${supportedModels[0].name}`);
            }
        }
    } catch (error) {
        console.error('Error listing models:', error.message);
    }
}

listModels();
