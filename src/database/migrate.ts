import { migrate } from 'drizzle-orm/neon-http/migrator';
import { db, testConnection } from './index';
import path from 'path';
import fs from 'fs';

export async function runMigrations() {
    console.log('📦 Starting database migrations...');
    
    try {
        // Step 1: Test connection
        console.log('🔗 Testing database connection...');
        const connected = await testConnection();
        if (!connected) {
            console.error('❌ Database connection failed');
            return;
        }
        console.log('✅ Database connection successful');

        // Step 2: Run drizzle auto-migrations from drizzle/ folder
        // This is the most reliable way to run migrations with Neon
        console.log('📂 Running drizzle migrations...');
        const migrationFolder = path.join(process.cwd(), 'drizzle');
        
        if (fs.existsSync(migrationFolder)) {
            try {
                console.log(`📁 Migration folder found: ${migrationFolder}`);
                await migrate(db, { migrationsFolder: migrationFolder });
                console.log('✅ Drizzle migrations completed');
            } catch (error: any) {
                // Check for specific error codes that indicate success
                if (
                    error.code === '42P07' || 
                    error.code === '42701' ||
                    error.message?.includes('already exists')
                ) {
                    console.log('✅ Tables/columns already exist (migration state maintained)');
                } else {
                    console.error('❌ Drizzle migration error:', error.message);
                    throw error;
                }
            }
        } else {
            console.error('❌ Drizzle migration folder not found:', migrationFolder);
            throw new Error('Missing drizzle migration folder');
        }

        // Step 3: Verify critical tables exist
        console.log('✓ Verifying critical tables...');
        const criticalTables = ['contacts', 'message_logs', 'auth_credentials', 'groups', 'group_members'];
        const missingTables: string[] = [];
        
        for (const table of criticalTables) {
            try {
                // Use drizzle's query builder to check table exists
                await db.execute(`SELECT 1 FROM ${table} LIMIT 1` as any);
                console.log(`  ✅ ${table}`);
            } catch (error: any) {
                if (error.message?.includes('does not exist')) {
                    missingTables.push(table);
                    console.warn(`  ⚠️ ${table}: Missing`);
                } else {
                    console.warn(`  ⚠️ ${table}: ${error.message}`);
                }
            }
        }

        if (missingTables.length > 0) {
            console.error(`\n❌ Missing critical tables: ${missingTables.join(', ')}`);
            console.error('This usually means drizzle migrations did not apply.');
            console.error('Check that drizzle/ folder contains migration files.');
            throw new Error(`Missing tables: ${missingTables.join(', ')}`);
        }

        console.log('\n✅ All database migrations completed successfully!\n');
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        console.error('Attempting to continue with reduced functionality...\n');
        // Don't throw - allow app to start but with warnings
    }
}
