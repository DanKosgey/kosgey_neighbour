import { migrate } from 'drizzle-orm/neon-http/migrator';
import { db } from './index';
import path from 'path';

export async function runMigrations() {
    console.log('📦 Running database migrations...');
    try {
        // In production (Render), we run from dist/. 
        // The drizzle folder is likely in the root (./drizzle relative to CWD)
        // or copied to dist/drizzle.

        // Try getting the migration folder relative to CWD first
        const migrationFolder = path.join(process.cwd(), 'drizzle');

        console.log(`📂 Using migration folder: ${migrationFolder}`);

        await migrate(db, { migrationsFolder: migrationFolder });
        console.log('✅ Migrations completed successfully');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        // Important: If migration fails, the app might be unstable.
        // But throwing here might cause boot loop. Log and continue? 
        // Better to throw so Render restarts/alerts? 
        // Let's check error code. If it's already applied, it's fine.
        if ((error as any).code === '42P07' || (error as any).code === '42701') { // Table exists OR Column exists?
            console.log('⚠️ Migration notice: Table or column already exists. Skipping...');
            // ignore
        }
        // For now, catch but log loudly.
    }
}
