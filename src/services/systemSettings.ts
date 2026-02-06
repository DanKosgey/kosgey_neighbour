
import { db } from '../database';
import { systemSettings } from '../database/schema';
import { eq } from 'drizzle-orm';

export class SystemSettingsService {
    private cache: Map<string, string> = new Map();
    private loaded = false;

    constructor() {
        // Optimistically start loading
        this.loadSettings().catch(err => {
            // Ignore initial failure, will retry on access
            // Tables might not exist yet if migration hasn't run
        });
    }

    /**
     * Load all settings into cache
     */
    async loadSettings() {
        try {
            const settings = await db.select().from(systemSettings);
            for (const setting of settings) {
                this.cache.set(setting.key, setting.value);
            }
            this.loaded = true;
            console.log(`✅ Loaded ${settings.length} system settings`);
        } catch (error) {
            // Be silent about "relation does not exist" which happens before migration
            if ((error as any).code === '42P01') {
                // Table doesn't exist yet
                return;
            }
            console.error('❌ Failed to load system settings:', error);
        }
    }

    /**
     * Get a setting value, with optional default
     */
    async get(key: string, defaultValue?: string): Promise<string | undefined> {
        if (!this.loaded) await this.loadSettings();
        return this.cache.get(key) || defaultValue;
    }

    /**
     * Get setting as number
     */
    async getNumber(key: string, defaultValue?: number): Promise<number | undefined> {
        const val = await this.get(key);
        if (val === undefined) return defaultValue;
        const num = Number(val);
        return isNaN(num) ? defaultValue : num;
    }

    /**
     * Set a setting value
     */
    async set(key: string, value: string, description?: string): Promise<void> {
        try {
            await db
                .insert(systemSettings)
                .values({ key, value, description, updatedAt: new Date() })
                .onConflictDoUpdate({
                    target: systemSettings.key,
                    set: { value, description, updatedAt: new Date() },
                });

            this.cache.set(key, value);
            console.log(`✅ Updated setting [${key}] = ${value}`);
        } catch (error) {
            console.error(`❌ Failed to update setting [${key}]:`, error);
            throw error;
        }
    }

    /**
     * Get all settings
     */
    async getAll(): Promise<Record<string, string>> {
        if (!this.loaded) await this.loadSettings();
        return Object.fromEntries(this.cache);
    }

    /**
     * Get calendar access permission status
     */
    async isCalendarAccessEnabled(): Promise<boolean> {
        const val = await this.get('calendar_access_enabled', 'true');
        return (val ?? 'true').toLowerCase() === 'true';
    }

    /**
     * Enable calendar access
     */
    async enableCalendarAccess(): Promise<void> {
        await this.set(
            'calendar_access_enabled',
            'true',
            'Global toggle for calendar scheduling tools'
        );
        console.log('✅ Calendar access ENABLED');
    }

    /**
     * Disable calendar access
     */
    async disableCalendarAccess(): Promise<void> {
        await this.set(
            'calendar_access_enabled',
            'false',
            'Global toggle for calendar scheduling tools'
        );
        console.log('✅ Calendar access DISABLED');
    }
}

export const systemSettingsService = new SystemSettingsService();
