/**
 * Message Queue Service
 * 
 * Core queue implementation with:
 * - Per-user queue isolation
 * - Priority-based processing
 * - Queue persistence to database
 * - Metrics tracking
 */

import { db, withRetry } from '../../database';
import { messageQueue, queueMetrics } from '../../database/schema';
import { eq, and, asc, desc, sql, lt, gt } from 'drizzle-orm';

export enum Priority {
    CRITICAL = 0,  // Owner messages
    HIGH = 1,      // Verified contacts
    NORMAL = 2,    // Regular messages
    LOW = 3        // Low priority/bulk
}

export interface QueuedMessage {
    id?: number;
    jid: string;
    messages: string[];
    priority: Priority;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    retryCount: number;
    workerId?: string;
    errorMessage?: string;
    createdAt?: Date;
    processedAt?: Date;
}

export interface QueueMetrics {
    queueDepth: number;
    activeWorkers: number;
    messagesProcessed: number;
    avgProcessingTimeMs: number;
    errorCount: number;
    pendingByPriority: Record<Priority, number>;
}

export class MessageQueue {
    private metricsInterval: NodeJS.Timeout | null = null;
    private cleanupInterval: NodeJS.Timeout | null = null;
    private readonly MAX_RETRY_COUNT = 3;
    private readonly STALE_MESSAGE_HOURS = 1; // REDUCED from 24 to 1 hour for memory efficiency

    constructor(
        private readonly persistenceEnabled: boolean = true,
        private readonly maxQueueDepth: number = 1000
    ) {
        if (this.persistenceEnabled) {
            this.startMetricsCollection();
        }
    }

    /**
     * Add a message to the queue
     */
    async enqueue(jid: string, messages: string[], priority: Priority = Priority.NORMAL): Promise<number> {
        // Check queue depth limit
        const currentDepth = await this.getQueueDepth();
        if (currentDepth >= this.maxQueueDepth) {
            throw new Error(`Queue full: ${currentDepth}/${this.maxQueueDepth}`);
        }

        const queuedMessage: QueuedMessage = {
            jid,
            messages,
            priority,
            status: 'pending',
            retryCount: 0
        };

        if (this.persistenceEnabled) {
            const result = await withRetry(async () => {
                return await db.insert(messageQueue).values({
                    jid,
                    messageData: messages as any,
                    priority,
                    status: 'pending',
                    retryCount: 0
                }).returning();
            });

            console.log(`📥 Enqueued message for ${jid} (Priority: ${Priority[priority]}, ID: ${result[0].id})`);
            return result[0].id;
        }

        return 0;
    }

    /**
     * Get next message from queue for processing
     * Prioritizes by: priority (lower number = higher priority), then creation time
     */
    async dequeue(workerId: string): Promise<QueuedMessage | null> {
        if (!this.persistenceEnabled) return null;

        try {
            // Attempt to dequeue multiple times to handle race conditions
            for (let i = 0; i < 3; i++) {
                // 1. Find the highest priority pending message
                const candidates = await withRetry(async () => {
                    return await db.select({ id: messageQueue.id })
                        .from(messageQueue)
                        .where(eq(messageQueue.status, 'pending'))
                        .orderBy(asc(messageQueue.priority), asc(messageQueue.createdAt))
                        .limit(1);
                });

                if (candidates.length === 0) {
                    return null;
                }

                const candidateId = candidates[0].id;

                // 2. Try to lock it (Optimistic Locking)
                const result = await withRetry(async () => {
                    return await db.update(messageQueue)
                        .set({
                            status: 'processing',
                            workerId
                        })
                        .where(and(
                            eq(messageQueue.id, candidateId),
                            eq(messageQueue.status, 'pending') // Critical: Ensure it's still pending
                        ))
                        .returning();
                });

                // If we successfully locked the row (result has data), return it
                if (result.length > 0) {
                    const message = result[0];
                    console.log(`📤 Dequeued message ${message.id} for ${message.jid} (Worker: ${workerId})`);

                    return {
                        id: message.id,
                        jid: message.jid,
                        messages: message.messageData as string[],
                        priority: message.priority as Priority,
                        status: 'processing',
                        retryCount: message.retryCount,
                        workerId,
                        createdAt: message.createdAt || undefined,
                    };
                }

                // If result is empty, another worker beat us to it. 
                // Loop again to get the next message.
            }

            return null; // Could not lock a message after retries
        } catch (error) {
            console.error('Error dequeuing message:', error);
            return null;
        }
    }

    /**
     * Mark message as completed
     */
    async markCompleted(messageId: number): Promise<void> {
        if (!this.persistenceEnabled) return;

        await withRetry(async () => {
            await db.update(messageQueue)
                .set({
                    status: 'completed',
                    processedAt: new Date()
                })
                .where(eq(messageQueue.id, messageId));
        });

        console.log(`✅ Message ${messageId} completed`);

        // Trigger cleanup periodically (every 10th completion) to prevent memory bloat
        if (messageId % 10 === 0) {
            this.cleanup().catch(err => console.error('Cleanup error:', err));
        }
    }

    /**
     * Mark message as failed and retry if possible
     */
    async markFailed(messageId: number, errorMessage: string): Promise<boolean> {
        if (!this.persistenceEnabled) return false;

        const message = await withRetry(async () => {
            return await db.select()
                .from(messageQueue)
                .where(eq(messageQueue.id, messageId))
                .then(rows => rows[0]);
        });

        if (!message) return false;

        const shouldRetry = message.retryCount < this.MAX_RETRY_COUNT;

        await withRetry(async () => {
            await db.update(messageQueue)
                .set({
                    status: shouldRetry ? 'pending' : 'failed',
                    retryCount: message.retryCount + 1,
                    errorMessage,
                    workerId: null // Release worker
                })
                .where(eq(messageQueue.id, messageId));
        });

        if (shouldRetry) {
            console.log(`🔄 Message ${messageId} failed, retrying (${message.retryCount + 1}/${this.MAX_RETRY_COUNT})`);
        } else {
            console.log(`❌ Message ${messageId} failed permanently: ${errorMessage}`);
        }

        return shouldRetry;
    }

    /**
     * Get current queue depth
     */
    async getQueueDepth(): Promise<number> {
        if (!this.persistenceEnabled) return 0;

        const result = await withRetry(async () => {
            return await db.select({ count: sql<number>`count(*)` })
                .from(messageQueue)
                .where(eq(messageQueue.status, 'pending'));
        });

        return result[0]?.count || 0;
    }

    /**
     * Get queue statistics
     */
    async getQueueStats(): Promise<QueueMetrics> {
        if (!this.persistenceEnabled) {
            return {
                queueDepth: 0,
                activeWorkers: 0,
                messagesProcessed: 0,
                avgProcessingTimeMs: 0,
                errorCount: 0,
                pendingByPriority: { 0: 0, 1: 0, 2: 0, 3: 0 }
            };
        }

        // Get pending count by priority
        const pendingByPriority = await withRetry(async () => {
            return await db.select({
                priority: messageQueue.priority,
                count: sql<number>`count(*)`
            })
                .from(messageQueue)
                .where(eq(messageQueue.status, 'pending'))
                .groupBy(messageQueue.priority);
        });

        const priorityMap: Record<Priority, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
        pendingByPriority.forEach(row => {
            priorityMap[row.priority as Priority] = row.count;
        });

        // Get active workers count
        const activeWorkersResult = await withRetry(async () => {
            return await db.select({ count: sql<number>`count(DISTINCT worker_id)` })
                .from(messageQueue)
                .where(eq(messageQueue.status, 'processing'));
        });

        // Get total processed today
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const processedResult = await withRetry(async () => {
            return await db.select({ count: sql<number>`count(*)` })
                .from(messageQueue)
                .where(and(
                    eq(messageQueue.status, 'completed'),
                    gt(messageQueue.processedAt, twentyFourHoursAgo)
                ));
        });

        // Get average processing time
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const avgTimeResult = await withRetry(async () => {
            return await db.select({
                avgMs: sql<number>`AVG(EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000)`
            })
                .from(messageQueue)
                .where(and(
                    eq(messageQueue.status, 'completed'),
                    gt(messageQueue.processedAt, oneHourAgo)
                ));
        });

        // Get error count
        const errorResult = await withRetry(async () => {
            return await db.select({ count: sql<number>`count(*)` })
                .from(messageQueue)
                .where(and(
                    eq(messageQueue.status, 'failed'),
                    gt(messageQueue.createdAt, twentyFourHoursAgo)
                ));
        });

        return {
            queueDepth: Object.values(priorityMap).reduce((a, b) => a + b, 0),
            activeWorkers: activeWorkersResult[0]?.count || 0,
            messagesProcessed: processedResult[0]?.count || 0,
            avgProcessingTimeMs: Math.round(avgTimeResult[0]?.avgMs || 0),
            errorCount: errorResult[0]?.count || 0,
            pendingByPriority: priorityMap
        };
    }

    /**
     * Clean up old completed/failed messages
     */
    async cleanup(): Promise<number> {
        if (!this.persistenceEnabled) return 0;

        const cutoffDate = new Date(Date.now() - this.STALE_MESSAGE_HOURS * 60 * 60 * 1000);

        const result = await withRetry(async () => {
            return await db.delete(messageQueue)
                .where(and(
                    sql`${messageQueue.status} IN ('completed', 'failed')`,
                    lt(messageQueue.createdAt, cutoffDate)
                ))
                .returning();
        });

        const deletedCount = result.length;
        if (deletedCount > 0) {
            console.log(`🧹 Cleaned up ${deletedCount} old queue messages`);
        }

        return deletedCount;
    }

    /**
     * Restore stuck messages (processing for too long)
     */
    async restoreStuckMessages(timeoutMinutes: number = 5): Promise<number> {
        if (!this.persistenceEnabled) return 0;

        const cutoffDate = new Date(Date.now() - timeoutMinutes * 60 * 1000);

        const result = await withRetry(async () => {
            return await db.update(messageQueue)
                .set({
                    status: 'pending',
                    workerId: null
                })
                .where(and(
                    eq(messageQueue.status, 'processing'),
                    lt(messageQueue.createdAt, cutoffDate)
                ))
                .returning();
        });

        const restoredCount = result.length;
        if (restoredCount > 0) {
            console.log(`🔄 Restored ${restoredCount} stuck messages to pending`);
        }

        return restoredCount;
    }

    /**
     * Start periodic metrics collection
     */
    private startMetricsCollection(): void {
        // Collect metrics every 60 seconds
        this.metricsInterval = setInterval(async () => {
            try {
                const stats = await this.getQueueStats();

                await withRetry(async () => {
                    await db.insert(queueMetrics).values({
                        queueDepth: stats.queueDepth,
                        activeWorkers: stats.activeWorkers,
                        messagesProcessed: stats.messagesProcessed,
                        avgProcessingTimeMs: stats.avgProcessingTimeMs,
                        errorCount: stats.errorCount
                    });
                });
            } catch (error) {
                console.error('Error collecting queue metrics:', error);
            }
        }, 60000);

        // Run cleanup every 5 minutes to prevent memory bloat
        this.cleanupInterval = setInterval(async () => {
            try {
                await this.cleanup();
                await this.restoreStuckMessages();
            } catch (error) {
                console.error('Error during periodic cleanup:', error);
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    /**
     * Stop metrics collection
     */
    stopMetricsCollection(): void {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
        }
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Restore queue from database on startup
     */
    async restoreQueue(): Promise<void> {
        if (!this.persistenceEnabled) return;

        console.log('🔄 Restoring queue from database...');

        // Restore stuck messages
        const restored = await this.restoreStuckMessages();

        // Get current queue depth
        const depth = await this.getQueueDepth();

        console.log(`✅ Queue restored: ${depth} pending messages${restored > 0 ? `, ${restored} restored from stuck state` : ''}`);
    }
}

// Singleton instance
export const messageQueueService = new MessageQueue(
    process.env.QUEUE_PERSISTENCE_ENABLED !== 'false',
    parseInt(process.env.QUEUE_MAX_DEPTH || '1000')
);
