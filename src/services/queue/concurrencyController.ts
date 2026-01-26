/**
 * Concurrency Controller
 * 
 * Intelligent throttling and backpressure management:
 * - Dynamic worker scaling based on load
 * - API rate limit awareness
 * - System resource monitoring
 */

import { MessageQueue } from './messageQueue';
import { WorkerPool } from './workerPool';
import { rateLimitManager } from '../rateLimitManager';

export interface ConcurrencyMetrics {
    currentWorkers: number;
    recommendedWorkers: number;
    queueDepth: number;
    errorRate: number;
    isBackpressure: boolean;
    reason: string;
}

export class ConcurrencyController {
    private metricsHistory: Array<{
        timestamp: number;
        queueDepth: number;
        errorCount: number;
        processedCount: number;
    }> = [];

    private readonly HISTORY_SIZE = 10; // Keep last 10 data points
    private readonly BACKPRESSURE_THRESHOLD: number;
    private readonly MIN_WORKERS = 1;
    private readonly MAX_WORKERS: number;

    private checkInterval: NodeJS.Timeout | null = null;

    constructor(
        private readonly queue: MessageQueue,
        private readonly workerPool: WorkerPool,
        config?: {
            backpressureThreshold?: number;
            maxWorkers?: number;
        }
    ) {
        this.BACKPRESSURE_THRESHOLD = config?.backpressureThreshold ||
            parseInt(process.env.BACKPRESSURE_THRESHOLD || '50');
        this.MAX_WORKERS = config?.maxWorkers ||
            parseInt(process.env.QUEUE_MAX_WORKERS || '5');
    }

    /**
     * Start monitoring and auto-scaling
     */
    start(): void {
        console.log('🎛️ Concurrency Controller started');

        // Check every 30 seconds
        this.checkInterval = setInterval(() => {
            this.evaluateAndAdjust().catch(err =>
                console.error('Error in concurrency evaluation:', err)
            );
        }, 30000);

        // Initial evaluation
        this.evaluateAndAdjust().catch(err =>
            console.error('Error in initial concurrency evaluation:', err)
        );
    }

    /**
     * Stop monitoring
     */
    stop(): void {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
        console.log('🎛️ Concurrency Controller stopped');
    }

    /**
     * Evaluate current state and adjust workers if needed
     */
    private async evaluateAndAdjust(): Promise<void> {
        const metrics = await this.getMetrics();

        // Record metrics
        this.recordMetrics(metrics);

        // Determine if we should scale
        const decision = this.makeScalingDecision(metrics);

        if (decision.shouldScale && decision.targetWorkers !== metrics.currentWorkers) {
            console.log(`📊 Scaling workers: ${metrics.currentWorkers} → ${decision.targetWorkers} (${decision.reason})`);
            await this.workerPool.scale(decision.targetWorkers);
        }
    }

    /**
     * Get current metrics
     */
    private async getMetrics(): Promise<ConcurrencyMetrics> {
        const queueStats = await this.queue.getQueueStats();
        const workerStats = this.workerPool.getStats();

        // Calculate error rate from recent history
        const errorRate = this.calculateErrorRate();

        // Check if we're in backpressure state
        const isBackpressure = queueStats.queueDepth > this.BACKPRESSURE_THRESHOLD;

        // Determine recommended workers
        const recommendedWorkers = this.calculateRecommendedWorkers(
            queueStats.queueDepth,
            errorRate,
            rateLimitManager.isLimited()
        );

        return {
            currentWorkers: workerStats.totalWorkers,
            recommendedWorkers,
            queueDepth: queueStats.queueDepth,
            errorRate,
            isBackpressure,
            reason: this.getReasonForRecommendation(
                queueStats.queueDepth,
                errorRate,
                rateLimitManager.isLimited()
            )
        };
    }

    /**
     * Calculate recommended number of workers
     */
    private calculateRecommendedWorkers(
        queueDepth: number,
        errorRate: number,
        isRateLimited: boolean
    ): number {
        // If rate limited, scale down to minimum
        if (isRateLimited) {
            return this.MIN_WORKERS;
        }

        // If high error rate, scale down
        if (errorRate > 0.1) { // 10% error rate
            return Math.max(this.MIN_WORKERS, Math.floor(this.MAX_WORKERS * 0.5));
        }

        // Scale based on queue depth
        if (queueDepth === 0) {
            return this.MIN_WORKERS;
        } else if (queueDepth < 5) {
            return Math.min(2, this.MAX_WORKERS);
        } else if (queueDepth < 20) {
            return Math.min(3, this.MAX_WORKERS);
        } else if (queueDepth < 50) {
            return Math.min(4, this.MAX_WORKERS);
        } else {
            return this.MAX_WORKERS;
        }
    }

    /**
     * Make scaling decision
     */
    private makeScalingDecision(metrics: ConcurrencyMetrics): {
        shouldScale: boolean;
        targetWorkers: number;
        reason: string;
    } {
        const { currentWorkers, recommendedWorkers, queueDepth, errorRate } = metrics;

        // Don't scale if difference is minimal
        if (Math.abs(currentWorkers - recommendedWorkers) === 0) {
            return {
                shouldScale: false,
                targetWorkers: currentWorkers,
                reason: 'No change needed'
            };
        }

        // Scale up gradually (add 1 worker at a time)
        if (recommendedWorkers > currentWorkers) {
            return {
                shouldScale: true,
                targetWorkers: currentWorkers + 1,
                reason: `Queue depth: ${queueDepth}`
            };
        }

        // Scale down gradually (remove 1 worker at a time)
        if (recommendedWorkers < currentWorkers) {
            return {
                shouldScale: true,
                targetWorkers: currentWorkers - 1,
                reason: errorRate > 0.1 ? 'High error rate' : 'Low queue depth'
            };
        }

        return {
            shouldScale: false,
            targetWorkers: currentWorkers,
            reason: 'Stable'
        };
    }

    /**
     * Get reason for recommendation
     */
    private getReasonForRecommendation(
        queueDepth: number,
        errorRate: number,
        isRateLimited: boolean
    ): string {
        if (isRateLimited) return 'Rate limited - scaling down';
        if (errorRate > 0.1) return `High error rate (${(errorRate * 100).toFixed(1)}%)`;
        if (queueDepth > this.BACKPRESSURE_THRESHOLD) return 'Backpressure - queue overload';
        if (queueDepth > 20) return 'High queue depth - scaling up';
        if (queueDepth < 5) return 'Low queue depth - scaling down';
        return 'Optimal';
    }

    /**
     * Record metrics for history
     */
    private recordMetrics(metrics: ConcurrencyMetrics): void {
        const queueStats = this.queue.getQueueStats();

        queueStats.then(stats => {
            this.metricsHistory.push({
                timestamp: Date.now(),
                queueDepth: stats.queueDepth,
                errorCount: stats.errorCount,
                processedCount: stats.messagesProcessed
            });

            // Keep only recent history
            if (this.metricsHistory.length > this.HISTORY_SIZE) {
                this.metricsHistory.shift();
            }
        });
    }

    /**
     * Calculate error rate from recent history
     */
    private calculateErrorRate(): number {
        if (this.metricsHistory.length < 2) return 0;

        const recent = this.metricsHistory[this.metricsHistory.length - 1];
        const previous = this.metricsHistory[this.metricsHistory.length - 2];

        const errorDelta = recent.errorCount - previous.errorCount;
        const processedDelta = recent.processedCount - previous.processedCount;

        if (processedDelta === 0) return 0;

        return errorDelta / (processedDelta + errorDelta);
    }

    /**
     * Get current concurrency metrics
     */
    async getCurrentMetrics(): Promise<ConcurrencyMetrics> {
        return this.getMetrics();
    }

    /**
     * Check if system is in backpressure state
     */
    async isBackpressure(): Promise<boolean> {
        const queueStats = await this.queue.getQueueStats();
        return queueStats.queueDepth > this.BACKPRESSURE_THRESHOLD;
    }
}
