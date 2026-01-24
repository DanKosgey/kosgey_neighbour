import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { config } from '../config/env';
import * as schema from './schema';

if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not defined (check .env)');
}

// Configure Neon client with optimized settings for Render
const sql = neon(config.databaseUrl, {
    fetchOptions: {
        // Increase timeout for serverless environments
        // @ts-ignore - fetchOptions typing may not include signal
        signal: AbortSignal.timeout(30000), // 30 second timeout
    },
});

export const db = drizzle(sql as any, { schema });

/**
 * Test database connection health
 * Used by health check endpoints
 */
export async function testConnection(): Promise<boolean> {
    try {
        await sql`SELECT 1`;
        return true;
    } catch (error) {
        console.error('Database health check failed:', error);
        return false;
    }
}

/**
 * Execute a database operation with retry logic
 * Useful for critical operations that need resilience
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delayMs: number = 1000
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;

            if (attempt < maxRetries) {
                const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
                console.warn(`⚠️ Database operation failed (Attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('Database operation failed after retries');
}

