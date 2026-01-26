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
import { eq, and, asc, desc, sql } from 'drizzle-orm';

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
    private readonly MAX_RETRY_COUNT = 3;
    private readonly STALE_MESSAGE_HOURS = 24;

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
            // Find the highest priority pending message
            const messages = await withRetry(async () => {
                return await db.select()
                    .from(messageQueue)
                    .where(eq(messageQueue.status, 'pending'))
                    .orderBy(asc(messageQueue.priority), asc(messageQueue.createdAt))
                    .limit(1);
            });

            if (messages.length === 0) {
                return null;
            }

            const message = messages[0];

            // Mark as processing
            await withRetry(async () => {
                await db.update(messageQueue)
                    .set({
                        status: 'processing',
                        workerId
                    })
                    .where(eq(messageQueue.id, message.id));
            });

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
        const processedResult = await withRetry(async () => {
            return await db.select({ count: sql<number>`count(*)` })
                .from(messageQueue)
                .where(and(
                    eq(messageQueue.status, 'completed'),
                    sql`${messageQueue.processedAt} > NOW() - INTERVAL '24 hours'`
                ));
        });

        // Get average processing time
        const avgTimeResult = await withRetry(async () => {
            return await db.select({
                avgMs: sql<number>`AVG(EXTRACT(EPOCH FROM (processed_at - created_at)) * 1000)`
            })
                .from(messageQueue)
                .where(and(
                    eq(messageQueue.status, 'completed'),
                    sql`${messageQueue.processedAt} > NOW() - INTERVAL '1 hour'`
                ));
        });

        // Get error count
        const errorResult = await withRetry(async () => {
            return await db.select({ count: sql<number>`count(*)` })
                .from(messageQueue)
                .where(and(
                    eq(messageQueue.status, 'failed'),
                    sql`${messageQueue.createdAt} > NOW() - INTERVAL '24 hours'`
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

        const result = await withRetry(async () => {
            return await db.delete(messageQueue)
                .where(and(
                    sql`${messageQueue.status} IN ('completed', 'failed')`,
                    sql`${messageQueue.createdAt} < NOW() - INTERVAL '${this.STALE_MESSAGE_HOURS} hours'`
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

        const result = await withRetry(async () => {
            return await db.update(messageQueue)
                .set({
                    status: 'pending',
                    workerId: null
                })
                .where(and(
                    eq(messageQueue.status, 'processing'),
                    sql`${messageQueue.createdAt} < NOW() - INTERVAL '${timeoutMinutes} minutes'`
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
    }

    /**
     * Stop metrics collection
     */
    stopMetricsCollection(): void {
        if (this.metricsInterval) {
            clearInterval(this.metricsInterval);
            this.metricsInterval = null;
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
