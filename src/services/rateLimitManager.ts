/**
 * Rate Limit Manager
 * Handles Gemini API rate limits gracefully by queueing requests
 */

interface QueuedRequest {
    jid: string;
    messages: string[];
    timestamp: number;
}

export class RateLimitManager {
    private queue: QueuedRequest[] = [];
    private isRateLimited = false;
    private rateLimitUntil: number = 0;
    private processing = false;

    /**
     * Check if we're currently rate limited
     */
    isLimited(): boolean {
        if (this.isRateLimited && Date.now() < this.rateLimitUntil) {
            return true;
        }
        if (this.isRateLimited && Date.now() >= this.rateLimitUntil) {
            console.log('✅ Rate limit expired. Resuming operations...');
            this.isRateLimited = false;
        }
        return false;
    }

    /**
     * Mark as rate limited (called when 429 error occurs)
     */
    setRateLimited(retryAfterSeconds: number = 60) {
        this.isRateLimited = true;
        this.rateLimitUntil = Date.now() + (retryAfterSeconds * 1000);
        console.log(`⏸️ Rate limited. Queueing messages until ${new Date(this.rateLimitUntil).toLocaleTimeString()}`);
    }

    /**
     * Add request to queue
     */
    enqueue(jid: string, messages: string[]) {
        this.queue.push({ jid, messages, timestamp: Date.now() });
        console.log(`📥 Queued message from ${jid}. Queue size: ${this.queue.length}`);
    }

    /**
     * Get next request from queue
     */
    dequeue(): QueuedRequest | undefined {
        return this.queue.shift();
    }

    /**
     * Get queue size
     */
    size(): number {
        return this.queue.length;
    }

    /**
     * Process queue when rate limit clears
     */
    async processQueue(processFn: (jid: string, messages: string[]) => Promise<void>) {
        if (this.processing) return;

        this.processing = true;

        while (this.queue.length > 0 && !this.isLimited()) {
            const request = this.dequeue();
            if (request) {
                console.log(`🔄 Processing queued message from ${request.jid}`);
                await processFn(request.jid, request.messages);
                // Small delay between processing queued items
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        this.processing = false;
    }
}

export const rateLimitManager = new RateLimitManager();
