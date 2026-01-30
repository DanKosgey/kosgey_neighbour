/**
 * Worker Pool Service
 * 
 * Manages concurrent message processing workers:
 * - Configurable worker count
 * - Load balancing
 * - Worker health monitoring
 * - Graceful shutdown
 */

import { MessageQueue, QueuedMessage, Priority } from './messageQueue';
import { randomUUID } from 'crypto';

export interface WorkerStats {
    id: string;
    status: 'idle' | 'busy' | 'error';
    messagesProcessed: number;
    currentMessage?: string;
    lastActivityAt: Date;
    errors: number;
}

export interface WorkerPoolConfig {
    maxWorkers: number;
    workerTimeoutMs: number;
    healthCheckIntervalMs: number;
}

type ProcessFunction = (jid: string, messages: string[]) => Promise<void>;

export class WorkerPool {
    private workers: Map<string, WorkerStats> = new Map();
    private processingMessages: Map<string, QueuedMessage> = new Map();
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private isShuttingDown = false;

    private readonly config: WorkerPoolConfig;

    constructor(
        private readonly queue: MessageQueue,
        private readonly processFunction: ProcessFunction,
        config?: Partial<WorkerPoolConfig>
    ) {
        this.config = {
            maxWorkers: parseInt(process.env.QUEUE_MAX_WORKERS || '5'),
            workerTimeoutMs: parseInt(process.env.WORKER_TIMEOUT_MS || '300000'), // 5 minutes (for broadcasts)
            healthCheckIntervalMs: 10000, // 10 seconds
            ...config
        };

        this.initializeWorkers();
        this.startHealthCheck();

        console.log(`👷 Worker Pool initialized with ${this.config.maxWorkers} workers`);
    }

    /**
     * Initialize worker slots
     */
    private initializeWorkers(): void {
        for (let i = 0; i < this.config.maxWorkers; i++) {
            const workerId = `worker-${i + 1}-${randomUUID().substring(0, 8)}`;
            this.workers.set(workerId, {
                id: workerId,
                status: 'idle',
                messagesProcessed: 0,
                lastActivityAt: new Date(),
                errors: 0
            });
        }
    }

    /**
     * Start processing messages from the queue
     */
    async start(): Promise<void> {
        console.log('🚀 Worker Pool starting...');

        // Start all workers
        const workerPromises = Array.from(this.workers.keys()).map(workerId =>
            this.runWorker(workerId)
        );

        // Wait for all workers (they run indefinitely until shutdown)
        await Promise.all(workerPromises);

        console.log('✅ Worker Pool stopped');
    }

    /**
     * Main worker loop
     */
    private async runWorker(workerId: string): Promise<void> {
        const worker = this.workers.get(workerId)!;

        console.log(`👷 ${workerId} started`);

        while (!this.isShuttingDown) {
            try {
                // Update worker status
                worker.status = 'idle';
                worker.lastActivityAt = new Date();

                // Get next message from queue
                const message = await this.queue.dequeue(workerId);

                if (!message) {
                    // No messages available, wait a bit
                    await this.sleep(1000);
                    continue;
                }

                // Process message
                worker.status = 'busy';
                worker.currentMessage = message.jid;
                this.processingMessages.set(workerId, message);

                const startTime = Date.now();

                try {
                    // Execute the processing function with timeout
                    await this.withTimeout(
                        this.processFunction(message.jid, message.messages),
                        this.config.workerTimeoutMs
                    );

                    const processingTime = Date.now() - startTime;

                    // Mark as completed
                    if (message.id) {
                        await this.queue.markCompleted(message.id);
                    }

                    worker.messagesProcessed++;
                    worker.status = 'idle';
                    worker.currentMessage = undefined;
                    this.processingMessages.delete(workerId);

                    console.log(`✅ ${workerId} processed message for ${message.jid} in ${processingTime}ms`);

                } catch (error: any) {
                    // Processing failed
                    worker.status = 'error';
                    worker.errors++;

                    const errorMsg = error.message || 'Unknown error';
                    console.error(`❌ ${workerId} failed to process message for ${message.jid}:`, errorMsg);

                    if (message.id) {
                        await this.queue.markFailed(message.id, errorMsg);
                    }

                    this.processingMessages.delete(workerId);

                    // Small delay before retrying to avoid rapid failure loops
                    await this.sleep(2000);
                }

            } catch (error) {
                console.error(`❌ ${workerId} encountered unexpected error:`, error);
                worker.status = 'error';
                worker.errors++;
                await this.sleep(5000); // Longer delay for unexpected errors
            }
        }

        console.log(`👷 ${workerId} stopped`);
    }

    /**
     * Execute a promise with timeout
     */
    private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) =>
                setTimeout(() => reject(new Error(`Worker timeout after ${timeoutMs}ms`)), timeoutMs)
            )
        ]);
    }

    /**
     * Health check for workers
     */
    private startHealthCheck(): void {
        this.healthCheckInterval = setInterval(() => {
            const now = Date.now();

            for (const [workerId, worker] of this.workers.entries()) {
                const inactiveMs = now - worker.lastActivityAt.getTime();

                // Check if worker is stuck (busy for too long)
                if (worker.status === 'busy' && inactiveMs > this.config.workerTimeoutMs * 2) {
                    console.warn(`⚠️ ${workerId} appears stuck (inactive for ${Math.round(inactiveMs / 1000)}s)`);

                    // Force reset worker
                    worker.status = 'error';
                    worker.currentMessage = undefined;

                    const stuckMessage = this.processingMessages.get(workerId);
                    if (stuckMessage?.id) {
                        this.queue.markFailed(stuckMessage.id, 'Worker timeout/stuck').catch(err =>
                            console.error('Error marking stuck message as failed:', err)
                        );
                    }
                    this.processingMessages.delete(workerId);
                }

                // Auto-recover from error state after a cooldown
                if (worker.status === 'error' && inactiveMs > 10000) {
                    console.log(`🔄 ${workerId} recovering from error state`);
                    worker.status = 'idle';
                    worker.errors = 0;
                }
            }
        }, this.config.healthCheckIntervalMs);
    }

    /**
     * Get worker pool statistics
     */
    getStats(): {
        totalWorkers: number;
        idleWorkers: number;
        busyWorkers: number;
        errorWorkers: number;
        totalProcessed: number;
        totalErrors: number;
        workers: WorkerStats[];
    } {
        const workers = Array.from(this.workers.values());

        return {
            totalWorkers: workers.length,
            idleWorkers: workers.filter(w => w.status === 'idle').length,
            busyWorkers: workers.filter(w => w.status === 'busy').length,
            errorWorkers: workers.filter(w => w.status === 'error').length,
            totalProcessed: workers.reduce((sum, w) => sum + w.messagesProcessed, 0),
            totalErrors: workers.reduce((sum, w) => sum + w.errors, 0),
            workers: workers.map(w => ({ ...w }))
        };
    }

    /**
     * Graceful shutdown
     */
    async shutdown(): Promise<void> {
        console.log('🛑 Worker Pool shutting down...');
        this.isShuttingDown = true;

        // Stop health check
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        // Wait for in-flight messages to complete (with timeout)
        const shutdownTimeout = 30000; // 30 seconds
        const startTime = Date.now();

        while (this.processingMessages.size > 0 && (Date.now() - startTime) < shutdownTimeout) {
            console.log(`⏳ Waiting for ${this.processingMessages.size} in-flight messages...`);
            await this.sleep(1000);
        }

        if (this.processingMessages.size > 0) {
            console.warn(`⚠️ Shutdown timeout: ${this.processingMessages.size} messages still processing`);
            // Mark remaining messages as failed
            for (const [workerId, message] of this.processingMessages.entries()) {
                if (message.id) {
                    await this.queue.markFailed(message.id, 'Shutdown interrupted processing');
                }
            }
        }

        console.log('✅ Worker Pool shutdown complete');
    }

    /**
     * Scale worker pool (add or remove workers)
     */
    async scale(newWorkerCount: number): Promise<void> {
        if (newWorkerCount < 1 || newWorkerCount > 20) {
            throw new Error('Worker count must be between 1 and 20');
        }

        const currentCount = this.workers.size;

        if (newWorkerCount > currentCount) {
            // Add workers
            const toAdd = newWorkerCount - currentCount;
            console.log(`📈 Scaling up: adding ${toAdd} workers`);

            for (let i = 0; i < toAdd; i++) {
                const workerId = `worker-${currentCount + i + 1}-${randomUUID().substring(0, 8)}`;
                this.workers.set(workerId, {
                    id: workerId,
                    status: 'idle',
                    messagesProcessed: 0,
                    lastActivityAt: new Date(),
                    errors: 0
                });

                // Start the new worker
                this.runWorker(workerId).catch(err =>
                    console.error(`Error starting worker ${workerId}:`, err)
                );
            }
        } else if (newWorkerCount < currentCount) {
            // Remove workers (gracefully)
            const toRemove = currentCount - newWorkerCount;
            console.log(`📉 Scaling down: removing ${toRemove} workers`);

            // Remove idle workers first
            let removed = 0;
            for (const [workerId, worker] of this.workers.entries()) {
                if (removed >= toRemove) break;
                if (worker.status === 'idle') {
                    this.workers.delete(workerId);
                    removed++;
                }
            }

            // If we still need to remove more, mark them for removal
            // (they'll stop after current task)
            if (removed < toRemove) {
                console.warn(`⚠️ Could only remove ${removed}/${toRemove} workers (others are busy)`);
            }
        }

        this.config.maxWorkers = newWorkerCount;
    }

    /**
     * Helper: Sleep function
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
