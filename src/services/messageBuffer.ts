/**
 * Message Buffer Service
 * Collects multiple rapid-fire messages from a user and processes them as a single batch.
 * Enhanced with smart batching, deduplication, and queue integration.
 */

import { messageQueueService, Priority } from './queue/messageQueue';
import { ownerService } from './ownerService';

interface BufferedMessage {
    text: string;
    timestamp: number;
    fingerprint: string;
}

export class MessageBuffer {
    private buffers: Map<string, BufferedMessage[]> = new Map();
    private timers: Map<string, NodeJS.Timeout> = new Map();

    // Adaptive Config: Base 60 seconds to allow users to complete their thoughts
    // Increases when multiple people message at once
    private readonly BASE_DEBOUNCE_MS = 60000; // 60 seconds base (1 minute)
    private readonly MAX_DEBOUNCE_MS = 120000; // 120 seconds max (2 minutes)
    private readonly QUICK_DEBOUNCE_MS = 5000; // 5 seconds for owner messages

    constructor(private processBatchCallback: (jid: string, messages: string[]) => Promise<void>) { }

    /**
     * Calculate adaptive debounce time based on active conversations
     * Minimum 60 seconds to allow users to complete their thoughts
     */
    private getAdaptiveDebounce(jid: string): number {
        // Owner gets quick response
        if (ownerService.isOwner(jid)) {
            return this.QUICK_DEBOUNCE_MS;
        }

        const activeConversations = this.buffers.size;

        // Allow time for users to complete their thoughts
        if (activeConversations === 1) return this.BASE_DEBOUNCE_MS; // 60s
        if (activeConversations <= 3) return 75000; // 75s for 2-3 people
        if (activeConversations <= 10) return 90000; // 90s for 4-10 people
        return this.MAX_DEBOUNCE_MS; // 120s for 10+ people
    }

    /**
     * Generate message fingerprint for deduplication
     */
    private generateFingerprint(text: string): string {
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < text.length; i++) {
            const char = text.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(36);
    }

    /**
     * Check if messages are related (similar content or continuation)
     */
    private areMessagesRelated(msg1: string, msg2: string): boolean {
        // Simple heuristic: messages are related if they share significant words
        const words1 = new Set(msg1.toLowerCase().split(/\s+/).filter(w => w.length > 3));
        const words2 = new Set(msg2.toLowerCase().split(/\s+/).filter(w => w.length > 3));

        if (words1.size === 0 || words2.size === 0) return false;

        // Calculate Jaccard similarity
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);

        const similarity = intersection.size / union.size;
        return similarity > 0.3; // 30% similarity threshold
    }

    /**
     * Deduplicate messages
     */
    private deduplicateMessages(messages: BufferedMessage[]): string[] {
        const seen = new Set<string>();
        const deduplicated: string[] = [];

        for (const msg of messages) {
            if (!seen.has(msg.fingerprint)) {
                seen.add(msg.fingerprint);
                deduplicated.push(msg.text);
            } else {
                console.log(`🔍 Deduplicated message: "${msg.text.substring(0, 30)}..."`);
            }
        }

        return deduplicated;
    }

    /**
     * Create smart batches from messages
     * Groups related messages together, splits unrelated ones
     */
    private createSmartBatches(messages: string[]): string[][] {
        if (messages.length <= 1) return [messages];

        const batches: string[][] = [];
        let currentBatch: string[] = [messages[0]];

        for (let i = 1; i < messages.length; i++) {
            const prevMsg = messages[i - 1];
            const currMsg = messages[i];

            if (this.areMessagesRelated(prevMsg, currMsg)) {
                // Related - add to current batch
                currentBatch.push(currMsg);
            } else {
                // Not related - start new batch
                batches.push(currentBatch);
                currentBatch = [currMsg];
            }
        }

        // Add final batch
        if (currentBatch.length > 0) {
            batches.push(currentBatch);
        }

        return batches;
    }

    /**
     * Add a message to the user's buffer
     */
    add(jid: string, text: string) {
        // 1. Initialize buffer if missing
        if (!this.buffers.has(jid)) {
            this.buffers.set(jid, []);
        }

        // 2. Create buffered message with fingerprint
        const bufferedMsg: BufferedMessage = {
            text,
            timestamp: Date.now(),
            fingerprint: this.generateFingerprint(text)
        };

        // 3. Add message to buffer
        const userBuffer = this.buffers.get(jid)!;
        userBuffer.push(bufferedMsg);

        // 4. Reset the timer
        if (this.timers.has(jid)) {
            clearTimeout(this.timers.get(jid));
        }

        // 5. Calculate adaptive debounce
        const debounceTime = this.getAdaptiveDebounce(jid);

        // 6. Start new timer
        const timer = setTimeout(() => {
            this.flush(jid);
        }, debounceTime);

        this.timers.set(jid, timer);

        const activeCount = this.buffers.size;
        console.log(`⏳ Buffering message from ${jid} (Count: ${userBuffer.length}). Waiting ${debounceTime / 1000}s... [${activeCount} active conversations]`);
    }

    /**
     * Force process the buffer immediately
     */
    async flush(jid: string) {
        if (this.timers.has(jid)) {
            clearTimeout(this.timers.get(jid));
            this.timers.delete(jid);
        }

        const bufferedMessages = this.buffers.get(jid);
        if (!bufferedMessages || bufferedMessages.length === 0) return;

        // Clear buffer
        this.buffers.delete(jid);

        console.log(`🚀 Processing batch for ${jid}: ${bufferedMessages.length} messages.`);

        // Deduplicate messages
        const messages = this.deduplicateMessages(bufferedMessages);

        if (messages.length === 0) {
            console.log(`⏩ All messages were duplicates, skipping`);
            return;
        }

        // Determine priority
        const priority = ownerService.isOwner(jid) ? Priority.CRITICAL : Priority.NORMAL;

        // Enqueue to message queue instead of direct processing
        try {
            await messageQueueService.enqueue(jid, messages, priority);
            console.log(`✅ Enqueued ${messages.length} messages for ${jid} (Priority: ${Priority[priority]})`);
        } catch (error: any) {
            console.error(`❌ Failed to enqueue messages for ${jid}:`, error.message);

            // Fallback: process directly if queue is full
            if (error.message.includes('Queue full')) {
                console.log(`⚠️ Queue full, processing directly...`);
                await this.processBatchCallback(jid, messages).catch(err => {
                    console.error(`🔥 Error processing batch for ${jid}:`, err);
                });
            }
        }
    }

    /**
     * Get buffer statistics
     */
    getStats() {
        const stats = {
            activeBuffers: this.buffers.size,
            totalBufferedMessages: 0,
            buffersByUser: new Map<string, number>()
        };

        for (const [jid, messages] of this.buffers.entries()) {
            stats.totalBufferedMessages += messages.length;
            stats.buffersByUser.set(jid, messages.length);
        }

        return stats;
    }
}
