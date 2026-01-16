/**
 * Owner Service
 * Detects owner and provides owner-specific utilities
 */

import { config } from '../config/env';

export class OwnerService {
    private ownerPhone: string;

    constructor() {
        this.ownerPhone = config.ownerPhone || '';
        if (!this.ownerPhone) {
            console.warn('⚠️ OWNER_PHONE_NUMBER not set in .env - owner features disabled');
        }
    }

    /**
     * Check if a JID belongs to the owner
     */
    isOwner(jid: string): boolean {
        if (!this.ownerPhone) return false;

        // Extract phone number from JID (format: 1234567890@s.whatsapp.net or @lid)
        const phone = jid.split('@')[0];

        // Normalize both numbers (remove + and any spaces)
        const normalizedOwner = this.ownerPhone.replace(/[\+\s]/g, '');
        const normalizedPhone = phone.replace(/[\+\s]/g, '');

        return normalizedPhone === normalizedOwner;
    }

    /**
     * Get owner's phone number
     */
    getOwnerPhone(): string {
        return this.ownerPhone;
    }

    /**
     * Get owner's JID for WhatsApp
     */
    getOwnerJid(): string {
        const normalizedPhone = this.ownerPhone.replace(/[\+\s]/g, '');
        return `${normalizedPhone}@s.whatsapp.net`;
    }
}

export const ownerService = new OwnerService();
