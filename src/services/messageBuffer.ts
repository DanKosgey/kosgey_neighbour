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

    // Strict 60s window for standard users
    private readonly BATCH_WINDOW_MS = 30000; // 30 seconds
    private readonly OWNER_WINDOW_MS = 5000; // 5 seconds for owner

    constructor(private processBatchCallback: (jid: string, messages: string[]) => Promise<void>) { }

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
     * Add a message to the user's buffer
     * Implements a sliding window: every new message resets the timer.
     * Processing only happens after silence for the window duration.
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

        // 4. Reset the timer (Sliding Window)
        if (this.timers.has(jid)) {
            clearTimeout(this.timers.get(jid));
        }

        // 5. Determine window size
        const windowSize = ownerService.isOwner(jid) ? this.OWNER_WINDOW_MS : this.BATCH_WINDOW_MS;

        // 6. Start new timer
        const timer = setTimeout(() => {
            this.flush(jid);
        }, windowSize);

        this.timers.set(jid, timer);

        console.log(`⏳ Buffering message from ${jid} (Count: ${userBuffer.length}). Reset timer to ${windowSize / 1000}s...`);
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
