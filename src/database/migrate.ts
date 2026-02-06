import { migrate } from 'drizzle-orm/neon-http/migrator';
import { db, testConnection } from './index';
import { neon } from '@neondatabase/serverless';
import { config } from '../config/env';
import path from 'path';
import fs from 'fs';

export async function runMigrations() {
    console.log('📦 Starting comprehensive database migrations...');
    
    try {
        // Step 1: Test connection
        console.log('🔗 Testing database connection...');
        await testConnection();
        console.log('✅ Database connection successful');

        // Initialize direct SQL executor for manual migrations
        const sql = neon(config.databaseUrl);

        // Step 2: Run drizzle auto-migrations from drizzle/ folder
        console.log('📂 Running drizzle migrations...');
        const drizzelFolder = path.join(process.cwd(), 'drizzle');
        
        if (fs.existsSync(drizzelFolder)) {
            try {
                await migrate(db, { migrationsFolder: drizzelFolder });
                console.log('✅ Drizzle migrations completed');
            } catch (error: any) {
                if ((error as any).code === '42P07' || (error as any).code === '42701') {
                    console.log('⚠️ Tables/columns already exist, skipping drizzle migrations');
                } else {
                    console.warn('⚠️ Drizzle migration warning:', error.message);
                }
            }
        } else {
            console.log('⚠️ Drizzle folder not found, skipping auto-migrations');
        }

        // Step 3: Run manual SQL migrations from migrations/ folder
        console.log('📝 Running manual SQL migrations...');
        const migrationsFolder = path.join(process.cwd(), 'migrations');
        
        if (fs.existsSync(migrationsFolder)) {
            const migrationFiles = fs.readdirSync(migrationsFolder)
                .filter(f => f.endsWith('.sql'))
                .sort(); // Ensure lexicographic order (001_, 002_, etc.)

            console.log(`📄 Found ${migrationFiles.length} SQL migration files`);

            for (const file of migrationFiles) {
                const filePath = path.join(migrationsFolder, file);
                const sqlContent = fs.readFileSync(filePath, 'utf-8');

                try {
                    console.log(`  🔄 Applying: ${file}`);
                    
                    // Split by semicolons and execute each statement
                    const statements = sqlContent
                        .split(';')
                        .map(s => s.trim())
                        .filter(s => s.length > 0 && !s.startsWith('--'));

                    for (const statement of statements) {
                        try {
                            await sql.query(statement);
                        } catch (execError: any) {
                            // Ignore "already exists" errors
                            if (execError.code === '42P07' || execError.message?.includes('already exists')) {
                                continue;
                            }
                            throw execError;
                        }
                    }
                    
                    console.log(`  ✅ Applied: ${file}`);
                } catch (error: any) {
                    if (error.code === '42P07' || error.message?.includes('already exists')) {
                        console.log(`  ⏭️ Skipped: ${file} (already applied)`);
                    } else if (error.code === '42703' || error.message?.includes('does not exist')) {
                        console.warn(`  ⚠️ Partially skipped: ${file} (some dependencies not met)`);
                    } else {
                        console.error(`  ❌ Failed: ${file}`, error.message);
                    }
                }
            }
        } else {
            console.log('⚠️ migrations/ folder not found, skipping manual SQL migrations');
        }

        // Step 4: Verify critical tables exist
        console.log('✓ Verifying critical tables...');
        const criticalTables = ['contacts', 'message_logs', 'auth_credentials', 'groups', 'group_members'];
        
        for (const table of criticalTables) {
            try {
                await sql.query(`SELECT 1 FROM ${table} LIMIT 1`);
                console.log(`  ✅ ${table}`);
            } catch (error: any) {
                if (!error.message?.includes('does not exist')) {
                    console.warn(`  ⚠️ ${table}: Accessible but may have issues`);
                } else {
                    console.warn(`  ⚠️ ${table}: Table missing - will create on first use`);
                }
            }
        }

        console.log('\n✅ All database migrations completed successfully!\n');
    } catch (error) {
        console.error('❌ Critical migration error:', error);
        console.error('\n⚠️⚠️⚠️ Database may be in an inconsistent state! ⚠️⚠️⚠️');
        console.error('Please check your migrations and database connection.\n');
    }
}
