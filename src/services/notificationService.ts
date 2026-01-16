/**
 * Notification Service
 * Sends notifications to the owner
 */

import { WASocket } from '@whiskeysockets/baileys';
import { ownerService } from './ownerService';

export class NotificationService {
    private sock: WASocket | undefined;

    /**
     * Initialize with WhatsApp socket
     */
    init(sock: WASocket) {
        this.sock = sock;
    }

    /**
     * Send notification to owner
     */
    async notifyOwner(message: string): Promise<void> {
        if (!this.sock) {
            console.warn('⚠️ NotificationService not initialized');
            return;
        }

        const ownerPhone = ownerService.getOwnerPhone();
        if (!ownerPhone) {
            console.warn('⚠️ OWNER_PHONE_NUMBER not set - cannot send notification');
            return;
        }

        // Normalize phone number (remove +)
        const normalizedPhone = ownerPhone.replace(/[\+\s]/g, '');

        // WhatsApp JID format
        const ownerJid = `${normalizedPhone}@s.whatsapp.net`;

        try {
            await this.sock.sendMessage(ownerJid, { text: message });
            console.log(`📨 Notification sent to owner: "${message.substring(0, 50)}..."`);
        } catch (error) {
            console.error('Failed to send notification to owner:', error);
        }
    }

    /**
     * Send Smart Snitch Report (when someone new messages)
     */
    async sendSnitchReport(contactJid: string, contactName: string, message: string): Promise<void> {
        const report = `📝 Smart Snitch Report\n\n` +
            `👤 Contact: ${contactName}\n` +
            `📞 Number: ${contactJid.split('@')[0]}\n` +
            `💬 Message: "${message}"\n\n` +
            `Reply to this message to respond to them.`;

        await this.notifyOwner(report);
    }

    /**
     * Send urgent message alert
     */
    async sendUrgentAlert(contactName: string, message: string): Promise<void> {
        const alert = `🚨 URGENT MESSAGE\n\n` +
            `From: ${contactName}\n` +
            `Message: "${message}"`;

        await this.notifyOwner(alert);
    }

    /**
     * Send new contact notification
     */
    async sendNewContactAlert(contactName: string, contactJid: string): Promise<void> {
        const alert = `✨ New Contact\n\n` +
            `Name: ${contactName}\n` +
            `Number: ${contactJid.split('@')[0]}`;

        await this.notifyOwner(alert);
    }
}

export const notificationService = new NotificationService();
