/**
 * Custom Campaign Service
 * 
 * Guides the owner through a conversational flow to create a custom post/ad
 * and broadcast it to all WhatsApp groups (with optional photo).
 *
 * States:
 *  awaiting_topic       → owner describes the post
 *  awaiting_photo_choice → ask text-only or with photo
 *  awaiting_photo        → waiting for owner to send an image
 *  awaiting_confirmation → show AI draft, ask "broadcast now?"
 *  done / idle          → no active session
 */

import { geminiService } from '../ai/gemini';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

type SessionStep =
    | 'awaiting_topic'
    | 'awaiting_photo_choice'
    | 'awaiting_photo'
    | 'awaiting_confirmation';

interface CustomPostSession {
    step: SessionStep;
    topic: string;
    wantsPhoto: boolean;
    imageBuffer: Buffer | null;
    draftText: string;
    startedAt: number;
}

// ─────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────

class CustomCampaignService {
    private sessions: Map<string, CustomPostSession> = new Map();

    // How long before an idle session is auto-discarded (15 minutes)
    private readonly SESSION_TTL_MS = 15 * 60 * 1000;

    // ─── Public API ───────────────────────────

    /** Called when owner triggers the `start_custom_post` tool */
    public startSession(phone: string): string {
        // Guard: if a session already exists (e.g. duplicate tool calls from multiple workers),
        // don't reset it — just nudge the owner to continue.
        if (this.sessions.has(phone)) {
            const existing = this.sessions.get(phone)!;
            if (Date.now() - existing.startedAt < this.SESSION_TTL_MS) {
                return (
                    '⚠️ A custom post session is already in progress.\n\n' +
                    'Please continue from where we left off, or type *cancel* to start fresh.'
                );
            }
        }

        this.sessions.set(phone, {
            step: 'awaiting_topic',
            topic: '',
            wantsPhoto: false,
            imageBuffer: null,
            draftText: '',
            startedAt: Date.now(),
        });

        return (
            '📢 *Custom Post Creator*\n\n' +
            "Let's create your custom broadcast post.\n\n" +
            '✏️ *What is this post about?* Give me a quick description — a promotion, an announcement, an update, whatever you have in mind.'
        );
    }

    /** Returns true if there is an active session for this phone */
    public hasActiveSession(phone: string): boolean {
        const session = this.sessions.get(phone);
        if (!session) return false;

        // Auto-expire stale sessions
        if (Date.now() - session.startedAt > this.SESSION_TTL_MS) {
            this.sessions.delete(phone);
            return false;
        }
        return true;
    }

    /** Cancel an active session */
    public cancelSession(phone: string): void {
        this.sessions.delete(phone);
    }

    /**
     * Main entry point for text messages during a session.
     * Returns:
     *  - A string  → send this back to the owner as the next prompt
     *  - null      → message was NOT handled (caller should pass to normal AI)
     */
    public async handleMessage(
        phone: string,
        text: string,
        client: any
    ): Promise<string | null> {
        if (!this.hasActiveSession(phone)) return null;

        const session = this.sessions.get(phone)!;
        const normalized = text.trim().toLowerCase();

        // Owner can cancel at any time
        if (
            normalized === 'cancel' ||
            normalized === 'stop' ||
            normalized === 'abort' ||
            normalized === 'quit'
        ) {
            this.cancelSession(phone);
            return '❌ Custom post cancelled. Nothing was sent.';
        }

        switch (session.step) {
            case 'awaiting_topic':
                return await this._handleTopic(phone, session, text);

            case 'awaiting_photo_choice':
                return this._handlePhotoChoice(phone, session, normalized);

            case 'awaiting_photo':
                // Owner typed something while we expected a photo
                if (['skip', 'no', 'text only', 'text-only', 'none'].some(k => normalized.includes(k))) {
                    session.wantsPhoto = false;
                    session.step = 'awaiting_confirmation';
                    this.sessions.set(phone, session);
                    return this._buildConfirmationPrompt(session);
                }
                return (
                    "📸 I'm still waiting for the photo! Please send the image directly in this chat, " +
                    'or type *skip* to broadcast as text-only.'
                );

            case 'awaiting_confirmation':
                return await this._handleConfirmation(phone, session, normalized, client);

            default:
                return null;
        }
    }

    /**
     * Called when the owner sends an image message while in `awaiting_photo` step.
     * Returns a string response to send back, or null if no session is active.
     */
    public async handleOwnerImage(
        phone: string,
        imageBuffer: Buffer,
        client: any
    ): Promise<string | null> {
        if (!this.hasActiveSession(phone)) return null;

        const session = this.sessions.get(phone)!;

        if (session.step !== 'awaiting_photo') {
            // Not expecting a photo — ignore silently (return null to let normal flow handle it)
            return null;
        }

        session.imageBuffer = imageBuffer;
        session.step = 'awaiting_confirmation';
        this.sessions.set(phone, session);

        return this._buildConfirmationPrompt(session);
    }

    // ─── Private Step Handlers ─────────────────

    private async _handleTopic(
        phone: string,
        session: CustomPostSession,
        text: string
    ): Promise<string> {
        session.topic = text;
        session.step = 'awaiting_photo_choice';
        this.sessions.set(phone, session);

        return (
            `✅ Got it!\n\n` +
            `🖼️ *Do you want to add a photo to this post?*\n\n` +
            `Reply *yes* to include a photo, or *no* for a text-only post.`
        );
    }

    private _handlePhotoChoice(
        phone: string,
        session: CustomPostSession,
        normalized: string
    ): string {
        const wantsPhoto = ['yes', 'yeah', 'yep', 'photo', 'image', 'pic', 'picture', 'add photo', 'with photo'].some(k =>
            normalized.includes(k)
        );

        session.wantsPhoto = wantsPhoto;

        if (wantsPhoto) {
            session.step = 'awaiting_photo';
            this.sessions.set(phone, session);
            return (
                '📸 Perfect! Please send me the photo now.\n\n' +
                '_(Type *skip* if you change your mind and want text-only.)_'
            );
        } else {
            session.step = 'awaiting_confirmation';
            this.sessions.set(phone, session);
            return this._buildConfirmationPrompt(session);
        }
    }

    private _buildConfirmationPrompt(session: CustomPostSession): string {
        const photoNote = session.imageBuffer
            ? '📸 *Photo:* ✅ Image received\n'
            : '';

        return (
            `✅ *I've prepared your post draft:*\n\n` +
            `📋 *Topic:* ${session.topic}\n` +
            photoNote +
            `\n_The post text will be AI-polished and tailored for your audience when broadcast._\n\n` +
            `📣 *Ready to broadcast to all groups?*\n` +
            `Reply *yes* to send now, *no* to cancel, or type *edit* to change your topic.`
        );
    }

    private async _handleConfirmation(
        phone: string,
        session: CustomPostSession,
        normalized: string,
        client: any
    ): Promise<string> {
        // Require the message to START WITH or EXACTLY MATCH a confirmation word.
        // This prevents accidental triggers from messages like "I said no" or "I don't want to post that".
        const CONFIRM_WORDS = ['yes', 'send', 'broadcast', 'go', 'do it', 'ok', 'okay', 'yep', 'yeah'];
        const isConfirmed = CONFIRM_WORDS.some(k =>
            normalized === k || normalized.startsWith(k + ' ') || normalized.startsWith(k + '!')
        );

        if (isConfirmed) {
            // Generate and broadcast
            this.sessions.delete(phone); // Clear session before async work
            return await this._generateAndBroadcast(session, client);
        }

        const EDIT_WORDS = ['edit', 'change', 'redo', 'rewrite'];
        const isEdit = EDIT_WORDS.some(k =>
            normalized === k || normalized.startsWith(k + ' ')
        );

        if (isEdit) {
            session.step = 'awaiting_topic';
            session.imageBuffer = null;
            session.draftText = '';
            this.sessions.set(phone, session);
            return (
                '✏️ *Let\'s start over.* What is this post about?\n\n' +
                '_(Your previous photo has been cleared.)_'
            );
        }

        const CANCEL_WORDS = ['no', 'nope', 'cancel', 'stop', 'abort', 'quit', 'never mind'];
        const isCancel = CANCEL_WORDS.some(k =>
            normalized === k || normalized.startsWith(k + ' ')
        );

        if (isCancel) {
            this.cancelSession(phone);
            return '❌ Post cancelled. Come back anytime to create a new custom post!';
        }

        // Unrecognized reply — prompt again
        return (
            '❓ I didn\'t quite catch that.\n\n' +
            'Reply *yes* to broadcast now, *edit* to change the topic, or *cancel* to abort.'
        );
    }

    // ─── Broadcast Logic ──────────────────────

    private async _generateAndBroadcast(
        session: CustomPostSession,
        client: any
    ): Promise<string> {
        try {
            // 1. Generate polished post text via AI
            console.log('📝 [CustomCampaign] Generating post text for topic:', session.topic);
            const postText = await this._generatePostText(session.topic);

            // 2. Get all groups
            const groups: string[] = await client.getAllGroups();

            if (!groups || groups.length === 0) {
                return '⚠️ No WhatsApp groups found to broadcast to. Please make sure the bot is in at least one group.';
            }

            console.log(`📢 [CustomCampaign] Broadcasting to ${groups.length} groups...`);

            // 3. Broadcast in background
            this._broadcastToGroups(client, groups, postText, session.imageBuffer)
                .catch(err => console.error('❌ [CustomCampaign] Broadcast error:', err));

            const photoText = session.imageBuffer ? ' with your photo' : '';
            return (
                `🚀 *Broadcast started!*\n\n` +
                `Your custom post${photoText} is being sent to *${groups.length} groups* right now.\n\n` +
                `📋 *Post preview:*\n${postText.substring(0, 200)}${postText.length > 200 ? '...' : ''}`
            );
        } catch (err: any) {
            console.error('❌ [CustomCampaign] Failed to generate/broadcast:', err);
            return `❌ Something went wrong: ${err.message}. Please try again.`;
        }
    }

    private async _generatePostText(topic: string): Promise<string> {
        const prompt = `You are a professional social media copywriter. 
        
Create a compelling WhatsApp broadcast post based on this topic/message:
"${topic}"

Requirements:
- Keep it concise (100-180 words max)
- Use a friendly, engaging tone
- Add 1-2 relevant emojis (don't overdo it)
- End with a clear call-to-action or closing line
- Format for WhatsApp (use *bold* for key phrases)
- Do NOT add hashtags
- Write in English unless the topic is clearly in another language

Output ONLY the final post text, nothing else.`;

        try {
            const generated = await geminiService.generateText(prompt);
            if (generated && generated.trim().length > 10) {
                return generated.trim();
            }
        } catch (e) {
            console.warn('⚠️ [CustomCampaign] AI generation failed, using raw topic as post text');
        }

        // Fallback: use the raw topic
        return topic;
    }

    private async _broadcastToGroups(
        client: any,
        groups: string[],
        text: string,
        imageBuffer: Buffer | null
    ): Promise<void> {
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < groups.length; i++) {
            const groupJid = groups[i];
            try {
                if (imageBuffer) {
                    await client.sendImage(groupJid, imageBuffer, text);
                } else {
                    await client.sendText(groupJid, text);
                }
                successCount++;
                console.log(`✅ [CustomCampaign] Sent to ${groupJid} (${i + 1}/${groups.length})`);
            } catch (err: any) {
                failCount++;
                console.error(`❌ [CustomCampaign] Failed to send to ${groupJid}:`, err.message);
            }

            // Delay between groups to avoid rate-limiting (except after last)
            if (i < groups.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 8000));
            }
        }

        console.log(`📊 [CustomCampaign] Broadcast complete. ✅ ${successCount} sent, ❌ ${failCount} failed.`);
    }
}

// Singleton export
export const customCampaignService = new CustomCampaignService();
