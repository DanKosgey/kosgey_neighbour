/**
 * Message Buffer Service
 * Collects multiple rapid-fire messages from a user and processes them as a single batch.
 * Reduces API calls and gives the AI better context.
 */

export class MessageBuffer {
    private buffers: Map<string, string[]> = new Map();
    private timers: Map<string, NodeJS.Timeout> = new Map();

    // Adaptive Config: Base 60 seconds to allow users to complete their thoughts
    // Increases when multiple people message at once
    private readonly BASE_DEBOUNCE_MS = 60000; // 60 seconds base (1 minute)
    private readonly MAX_DEBOUNCE_MS = 120000; // 120 seconds max (2 minutes)

    constructor(private processBatchCallback: (jid: string, messages: string[]) => Promise<void>) { }

    /**
     * Calculate adaptive debounce time based on active conversations
     * Minimum 60 seconds to allow users to complete their thoughts
     */
    private getAdaptiveDebounce(): number {
        const activeConversations = this.buffers.size;

        // Allow time for users to complete their thoughts
        if (activeConversations === 1) return this.BASE_DEBOUNCE_MS; // 60s
        if (activeConversations <= 3) return 75000; // 75s for 2-3 people
        if (activeConversations <= 10) return 90000; // 90s for 4-10 people
        return this.MAX_DEBOUNCE_MS; // 120s for 10+ people
    }

    /**
     * Add a message to the user's buffer
     */
    add(jid: string, text: string) {
        // 1. Initialize buffer if missing
        if (!this.buffers.has(jid)) {
            this.buffers.set(jid, []);
        }

        // 2. Add message to buffer
        const userBuffer = this.buffers.get(jid)!;
        userBuffer.push(text);

        // 3. Reset the timer
        if (this.timers.has(jid)) {
            clearTimeout(this.timers.get(jid));
        }

        // 4. Calculate adaptive debounce
        const debounceTime = this.getAdaptiveDebounce();

        // 5. Start new timer
        const timer = setTimeout(() => {
            this.flush(jid);
        }, debounceTime);

        this.timers.set(jid, timer);

        const activeCount = this.buffers.size;
        console.log(`⏳ Buffering message from ${jid} (Count: ${userBuffer.length}). Waiting ${debounceTime / 1000}s... [${activeCount} active conversations]`);
    }

    /**
     * Force process the buffer immediately (e.g. if we detect "closing intent" locally?)
     */
    flush(jid: string) {
        if (this.timers.has(jid)) {
            clearTimeout(this.timers.get(jid));
            this.timers.delete(jid);
        }

        const messages = this.buffers.get(jid);
        if (!messages || messages.length === 0) return;

        // Clear buffer
        this.buffers.delete(jid);

        console.log(`🚀 Processing batch for ${jid}: ${messages.length} messages.`);

        // Trigger callback and catch errors
        this.processBatchCallback(jid, messages).catch(err => {
            console.error(`🔥 Error processing batch for ${jid}:`, err);
        });
    }
}
