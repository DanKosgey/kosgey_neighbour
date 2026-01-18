
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const key = process.env.GEMINI_API_KEY1;
const modelName = 'gemini-2.5-flash'; // trying 2.5

async function test() {
    console.log(`Testing ${modelName} with key 1...`);
    const genAI = new GoogleGenerativeAI(key!);
    const model = genAI.getGenerativeModel({ model: modelName });
    try {
        const result = await model.generateContent('Hi');
        console.log('Response:', result.response.text());
        console.log('SUCCESS');
    } catch (e: any) {
        console.error('ERROR:', e.message);
    }
}
test();
