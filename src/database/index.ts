import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { config } from '../config/env';
import * as schema from './schema';

if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not defined (check .env)');
}

// Connection pool
const sql = neon(config.databaseUrl);
export const db = drizzle(sql as any, { schema });

