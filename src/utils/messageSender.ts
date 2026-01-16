import { WASocket } from '@whiskeysockets/baileys';
import { calculateHumanDelay, sleep } from './delay';

export class MessageSender {
    constructor(private sock: WASocket) { }

    /**
     * Send a text message with human-like typing simulation
     */
    async sendText(jid: string, text: string): Promise<void> {
        const delayMs = calculateHumanDelay(text.length);

        // Show "typing..." indicator
        await this.sock.sendPresenceUpdate('composing', jid);
        await sleep(delayMs);
        await this.sock.sendPresenceUpdate('paused', jid);

        // Send the message
        await this.sock.sendMessage(jid, { text });
    }

    /**
     * Send an image with optional caption
     */
    async sendImage(jid: string, imageBuffer: Buffer, caption?: string): Promise<void> {
        // Show "recording" presence for more realism
        await this.sock.sendPresenceUpdate('composing', jid);
        await sleep(1500); // Simulate upload time

        await this.sock.sendMessage(jid, {
            image: imageBuffer,
            caption: caption || ''
        });

        await this.sock.sendPresenceUpdate('paused', jid);
    }

    /**
     * Send an image from URL with optional caption
     */
    async sendImageFromUrl(jid: string, url: string, caption?: string): Promise<void> {
        await this.sock.sendPresenceUpdate('composing', jid);
        await sleep(1500);

        await this.sock.sendMessage(jid, {
            image: { url },
            caption: caption || ''
        });

        await this.sock.sendPresenceUpdate('paused', jid);
    }

    /**
     * Send a voice note (audio message)
     */
    async sendVoiceNote(jid: string, audioBuffer: Buffer): Promise<void> {
        // Show "recording" presence
        await this.sock.sendPresenceUpdate('recording', jid);
        await sleep(2000); // Simulate recording time

        await this.sock.sendMessage(jid, {
            audio: audioBuffer,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true // Push-to-talk (voice note)
        });

        await this.sock.sendPresenceUpdate('paused', jid);
    }

    /**
     * Send a document/file
     */
    async sendDocument(jid: string, documentBuffer: Buffer, filename: string, mimetype: string): Promise<void> {
        await this.sock.sendPresenceUpdate('composing', jid);
        await sleep(1500);

        await this.sock.sendMessage(jid, {
            document: documentBuffer,
            fileName: filename,
            mimetype: mimetype
        });

        await this.sock.sendPresenceUpdate('paused', jid);
    }

    /**
     * Send a location
     */
    async sendLocation(jid: string, latitude: number, longitude: number, name?: string): Promise<void> {
        await this.sock.sendPresenceUpdate('composing', jid);
        await sleep(1000);

        await this.sock.sendMessage(jid, {
            location: {
                degreesLatitude: latitude,
                degreesLongitude: longitude,
                name: name || 'Location'
            }
        });

        await this.sock.sendPresenceUpdate('paused', jid);
    }

    /**
     * Send a contact card
     */
    async sendContact(jid: string, contactJid: string, displayName: string): Promise<void> {
        await this.sock.sendPresenceUpdate('composing', jid);
        await sleep(1000);

        await this.sock.sendMessage(jid, {
            contacts: {
                displayName: displayName,
                contacts: [{ vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${displayName}\nTEL;type=CELL;type=VOICE;waid=${contactJid}:${contactJid}\nEND:VCARD` }]
            }
        });

        await this.sock.sendPresenceUpdate('paused', jid);
    }

    /**
     * React to a message with an emoji
     */
    async sendReaction(jid: string, messageKey: any, emoji: string): Promise<void> {
        await this.sock.sendMessage(jid, {
            react: {
                text: emoji,
                key: messageKey
            }
        });
    }

    /**
     * Mark a message as read
     */
    async markAsRead(jid: string, messageKey: any): Promise<void> {
        await this.sock.readMessages([messageKey]);
    }

    /**
     * Show "online" presence
     */
    async setOnline(): Promise<void> {
        await this.sock.sendPresenceUpdate('available');
    }

    /**
     * Show "offline" presence
     */
    async setOffline(): Promise<void> {
        await this.sock.sendPresenceUpdate('unavailable');
    }
}
