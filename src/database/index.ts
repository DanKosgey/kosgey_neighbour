import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { config } from '../config/env';
import * as schema from './schema';

if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not defined (check .env)');
}

// Configure Neon client with optimized settings for Render
const sql = neon(config.databaseUrl);

export const db = drizzle(sql as any, { schema });

/**
 * Test database connection health
 * Used by health check endpoints
 */
export async function testConnection(): Promise<boolean> {
    try {
        const start = Date.now();
        await sql`SELECT 1`;
        const duration = Date.now() - start;
        console.log(`✅ Database connection healthy (${duration}ms)`);
        return true;
    } catch (error) {
        console.error('❌ Database health check failed:', error);
        return false;
    }
}

/**
 * Execute a database operation with retry logic
 * Useful for critical operations that need resilience
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 5,
    delayMs: number = 1000
): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error: any) {
            lastError = error;
            console.warn(`⚠️ Database operation failed (Attempt ${attempt}/${maxRetries}): ${error.message}`);

            if (attempt < maxRetries) {
                const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    throw lastError || new Error('Database operation failed after retries');
}

