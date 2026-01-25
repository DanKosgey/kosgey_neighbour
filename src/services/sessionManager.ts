/**
 * Session Manager Service
 * Prevents multiple instances from connecting to WhatsApp simultaneously
 */
import { db, withRetry } from '../database';
import { sessionLock } from '../database/schema';
import { eq, and, lt } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export class SessionManager {
    private instanceId: string;
    private sessionName: string;
    private lockRefreshInterval: NodeJS.Timeout | null = null;
    private isLocked: boolean = false;

    constructor(sessionName: string = 'whatsapp_session') {
        this.sessionName = sessionName;
        this.instanceId = randomUUID();
        console.log(`🔐 Session Manager initialized with Instance ID: ${this.instanceId}`);
    }

    /**
     * Attempt to acquire the session lock
     * Returns true if lock acquired, false otherwise
     */
    async acquireLock(): Promise<boolean> {
        try {
            const now = new Date();
            const expiresAt = new Date(now.getTime() + 2 * 60 * 1000); // 2 minutes

            // First, clean up any expired locks
            await withRetry(async () => {
                await db.delete(sessionLock)
                    .where(lt(sessionLock.expiresAt, now));
            });

            // Try to acquire lock
            const existing = await withRetry(async () => {
                return await db.select()
                    .from(sessionLock)
                    .where(eq(sessionLock.sessionName, this.sessionName));
            });

            if (existing.length > 0) {
                const lock = existing[0];

                // Check if it's our own lock
                if (lock.instanceId === this.instanceId) {
                    console.log('✅ Lock already owned by this instance');
                    this.isLocked = true;
                    this.startLockRefresh();
                    return true;
                }

                // Check if lock is expired
                if (new Date(lock.expiresAt) < now) {
                    console.log('🔓 Existing lock expired, taking over...');
                    await withRetry(async () => {
                        await db.update(sessionLock)
                            .set({
                                instanceId: this.instanceId,
                                lockedAt: now,
                                expiresAt: expiresAt
                            })
                            .where(eq(sessionLock.sessionName, this.sessionName));
                    });

                    this.isLocked = true;
                    this.startLockRefresh();
                    return true;
                }

                console.log('❌ Session locked by another instance');
                console.log(`   Instance: ${lock.instanceId}`);
                console.log(`   Expires: ${lock.expiresAt}`);
                return false;
            }

            // No existing lock, create new one
            await withRetry(async () => {
                await db.insert(sessionLock).values({
                    sessionName: this.sessionName,
                    instanceId: this.instanceId,
                    lockedAt: now,
                    expiresAt: expiresAt
                });
            });

            console.log('✅ Session lock acquired');
            this.isLocked = true;
            this.startLockRefresh();
            return true;

        } catch (error: any) {
            console.error('Error acquiring session lock:', error.message);
            return false;
        }
    }

    /**
     * Release the session lock
     */
    async releaseLock(): Promise<void> {
        try {
            if (this.lockRefreshInterval) {
                clearInterval(this.lockRefreshInterval);
                this.lockRefreshInterval = null;
            }

            await withRetry(async () => {
                await db.delete(sessionLock)
                    .where(and(
                        eq(sessionLock.sessionName, this.sessionName),
                        eq(sessionLock.instanceId, this.instanceId)
                    ));
            });

            this.isLocked = false;
            console.log('🔓 Session lock released');
        } catch (error: any) {
            console.error('Error releasing session lock:', error.message);
        }
    }

    /**
     * Refresh the lock expiration time every 2 minutes
     */
    private startLockRefresh(): void {
        if (this.lockRefreshInterval) {
            clearInterval(this.lockRefreshInterval);
        }

        // Refresh every 1 minute
        this.lockRefreshInterval = setInterval(async () => {
            try {
                // Use withRetry to prevent timeouts from crashing the refresher
                await withRetry(async () => {
                    const expiresAt = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes

                    await db.update(sessionLock)
                        .set({ expiresAt })
                        .where(and(
                            eq(sessionLock.sessionName, this.sessionName),
                            eq(sessionLock.instanceId, this.instanceId)
                        ));
                }, 3, 2000); // 3 retries, 2s delay

            } catch (error: any) {
                console.error('Error refreshing session lock:', error.message);
                // Don't crash, just log and retry next interval
            }
        }, 60000);
    }

    /**
     * Check if this instance has the lock
     */
    hasLock(): boolean {
        return this.isLocked;
    }

    /**
     * Wait for lock to become available (with timeout)
     */
    async waitForLock(timeoutMs: number = 60000): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeoutMs) {
            if (await this.acquireLock()) {
                return true;
            }

            // Wait 5 seconds before trying again
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.log('⏱️ Timeout waiting for session lock');
        return false;
    }
}

export const sessionManager = new SessionManager();
