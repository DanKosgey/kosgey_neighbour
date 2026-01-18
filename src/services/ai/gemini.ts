import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { config } from '../../config/env';
import { SYSTEM_PROMPTS } from './prompts';
import { AI_TOOLS } from './tools';
import { keyManager } from '../keyManager';

// Global request queue to prevent simultaneous API calls
let requestQueue: Promise<any> = Promise.resolve();
const MIN_REQUEST_SPACING_MS = 3000; // 3 seconds between requests (Gemini free tier: 2 RPM = 30s/request)

export class GeminiService {

  constructor() { }

  /**
   * Helper to execute Gemini operations with Key Rotation & Retries
   * Now includes global queueing to prevent simultaneous requests
   */
  private async executeWithRetry<T>(operation: (model: GenerativeModel) => Promise<T>): Promise<T> {
    // Queue this request to ensure sequential execution
    return new Promise((resolve, reject) => {
      requestQueue = requestQueue.then(async () => {
        const startTime = Date.now();

        try {
          const result = await this._executeWithRetryInternal(operation);

          // Ensure minimum spacing between requests
          const elapsed = Date.now() - startTime;
          if (elapsed < MIN_REQUEST_SPACING_MS) {
            await new Promise(r => setTimeout(r, MIN_REQUEST_SPACING_MS - elapsed));
          }

          resolve(result);
        } catch (error) {
          reject(error);
        }
      }).catch(reject);
    });
  }

  private async _executeWithRetryInternal<T>(operation: (model: GenerativeModel) => Promise<T>): Promise<T> {
    let lasterror: any;

    // Try up to the number of available keys + some buffer, or until exhausted
    // We loop "indefinitely" because getNextKey() handles the exhaustion logic
    for (let i = 0; i < 50; i++) {
      let key: string;
      try {
        key = keyManager.getNextKey();
      } catch (e: any) {
        if (e.message === 'ALL_KEYS_EXHAUSTED') {
          // Propagate this specific error so the Queue Manager knows to wait
          throw e;
        }
        throw e;
      }

      try {
        const genAI = new GoogleGenerativeAI(key);
        const model = genAI.getGenerativeModel({ model: config.geminiModel }); // Using reliable model
        return await operation(model);

      } catch (error: any) {
        lasterror = error;
        // Check for 429 (Rate Limit)
        if (error.status === 429 || error.code === 429 || error.message?.includes('429')) {
          const retryDelay = error.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
          const seconds = retryDelay ? parseInt(retryDelay) : 60;

          console.warn(`⚠️ Key ending in ...${key.slice(-4)} hit Rate Limit (429). Switching keys...`);
          keyManager.markRateLimited(key, seconds);

          // Add delay before trying next key to avoid exhausting all keys rapidly
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        // Check for 400 (Invalid/Expired Key)
        if (error.status === 400 || error.message?.includes('API_KEY_INVALID') || error.message?.includes('API key expired')) {
          console.warn(`❌ Key ending in ...${key.slice(-4)} is INVALID/EXPIRED. Skipping...`);
          // Ideally we remove it from the pool, but for now just skipping this turn is enough to save the request
          continue;
        }

        // If it's another error, throw immediately
        throw error;
      }
    }
    throw lasterror;
  }

  async generateReply(history: string[], userContext: string, customPrompt?: string): Promise<{ type: 'text' | 'tool_call', content?: string, functionCall?: { name: string, args: any } }> {
    try {
      const systemPrompt = customPrompt || SYSTEM_PROMPTS.REPRESENTATIVE(userContext);

      const prompt = `${systemPrompt}
      
      **CONVERSATION HISTORY:**
      ${history.join('\n')}
      
      **YOUR REPLY:**`;

      return await this.executeWithRetry(async (model) => {
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          tools: AI_TOOLS as any
        });

        const response = result.response;
        const functionCalls = response.functionCalls();

        if (functionCalls && functionCalls.length > 0) {
          const call = functionCalls[0];
          console.log('🤖 Gemini wants to call tool:', call.name);
          return {
            type: 'tool_call',
            functionCall: {
              name: call.name,
              args: call.args
            }
          };
        }

        return { type: 'text', content: response.text().trim() };
      });
    } catch (error: any) {
      if (error.message === 'ALL_KEYS_EXHAUSTED') throw error; // Handle in caller
      console.error('Gemini Generate Error:', error);
      return { type: 'text', content: "I'm having a bit of trouble connecting right now. One moment." };
    }
  }

  async updateProfile(history: string[], currentSummary: string): Promise<any> {
    try {
      const prompt = `${SYSTEM_PROMPTS.PROFILER}
      
      **CURRENT SUMMARY:**
      ${currentSummary || "None"}

      **RECENT HISTORY:**
      ${history.join('\n')}
      
      **OUTPUT JSON:**`;

      return await this.executeWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
      });
    } catch (error) {
      // Silent fail for profiling
      // console.error('Gemini Profiling Error:', error); 
      return null;
    }
  }

  async analyzeConversation(history: string[]): Promise<any> {
    try {
      const prompt = `${SYSTEM_PROMPTS.ANALYSIS}
      
      **HISTORY:**
      ${history.join('\n')}
      
      **OUTPUT JSON:**`;

      return await this.executeWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);
      });
    } catch (error) {
      console.error('Gemini Analysis Error:', error);
      return { urgency: 5, status: 'active', summary_for_owner: 'Error analyzing' };
    }
  }

  async generateReport(history: string[], contactName: string): Promise<string> {
    try {
      const prompt = `${SYSTEM_PROMPTS.REPORT_GENERATOR}
      
      **CONTACT NAME:** ${contactName}

      **CONVERSATION HISTORY:**
      ${history.join('\n')}
      
      **YOUR REPORT:**`;

      return await this.executeWithRetry(async (model) => {
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
      });
    } catch (error) {
      console.error('Gemini Report Error:', error);
      return `⚠️ Error generating report for ${contactName}. Check logs.`;
    }
  }
}

export const geminiService = new GeminiService();
