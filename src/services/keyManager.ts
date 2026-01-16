/**
 * Key Manager Service
 * Manages a pool of API keys for load balancing and rate limit handling.
 */
import { config } from '../config/env';

interface KeyState {
    key: string;
    isRateLimited: boolean;
    coolDownUntil: number;
    usageCount: number;
}

export class KeyManager {
    private keys: KeyState[] = [];
    private currentIndex = 0;

    constructor() {
        this.initializePool();
    }

    private initializePool() {
        const keyList = config.geminiKeys;
        if (!keyList || keyList.length === 0) {
            console.warn('⚠️ No Gemini API keys found in config!');
            return;
        }

        this.keys = keyList.map(key => ({
            key,
            isRateLimited: false,
            coolDownUntil: 0,
            usageCount: 0
        }));

        console.log(`🔐 Key Manager initialized with ${this.keys.length} keys.`);
    }

    /**
     * Get the next available key (Round Robin)
     * Throws error if ALL keys are rate limited.
     */
    getNextKey(): string {
        const now = Date.now();
        const poolSize = this.keys.length;

        // Try to find a usable key in round-robin fashion
        for (let i = 0; i < poolSize; i++) {
            // Calculate index: (current + i) % size
            const index = (this.currentIndex + i) % poolSize;
            const keyState = this.keys[index];

            // Check if key is usable
            if (keyState.isRateLimited) {
                if (now > keyState.coolDownUntil) {
                    // Cooldown over, reactivate
                    keyState.isRateLimited = false;
                    keyState.coolDownUntil = 0;
                    console.log(`🔓 Key ${index + 1} cooldown expired. Reactivating.`);
                } else {
                    continue; // Still limited
                }
            }

            // Found a good key
            this.currentIndex = (index + 1) % poolSize; // Advance cursor
            keyState.usageCount++;
            return keyState.key;
        }

        // If loop finishes, ALL keys are limited
        throw new Error('ALL_KEYS_EXHAUSTED');
    }

    /**
     * Mark a key as rate limited
     * @param key The key string
     * @param durationSeconds Estimated cooldown (default 60s)
     */
    markRateLimited(key: string, durationSeconds: number = 60) {
        const keyState = this.keys.find(k => k.key === key);
        if (keyState) {
            keyState.isRateLimited = true;
            keyState.coolDownUntil = Date.now() + (durationSeconds * 1000);
            console.log(`🛑 Key marked limited for ${durationSeconds}s. (Usage: ${keyState.usageCount})`);
        }
    }

    /**
     * Get count of available keys
     */
    getAvailableCount(): number {
        const now = Date.now();
        return this.keys.filter(k => !k.isRateLimited || now > k.coolDownUntil).length;
    }

    /**
     * Check if pool is completely exhausted
     */
    isPoolExhausted(): boolean {
        return this.getAvailableCount() === 0;
    }
}

export const keyManager = new KeyManager();
