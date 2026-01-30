import makeWASocket, { DisconnectReason, useMultiFileAuthState, WASocket } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { config } from '../config/env';
import { db, withRetry } from '../database';
import { contacts, messageLogs, aiProfile, userProfile, authCredentials } from '../database/schema';
import { eq, desc } from 'drizzle-orm';
import { geminiService } from '../services/ai/gemini';
import { calculateHumanDelay, sleep } from '../utils/delay';
import { usePostgresAuthState } from '../database/auth/postgresAuth';
import { MessageSender } from '../utils/messageSender';
import pino from 'pino';
import { IdentityValidator } from '../utils/identityValidator';
import { ConversationManager } from '../services/conversationManager';
import { MessageBuffer } from '../services/messageBuffer';
import { executeLocalTool } from '../services/ai/tools';
import { rateLimitManager } from '../services/rateLimitManager';
import { ownerService } from '../services/ownerService';
import { notificationService } from '../services/notificationService';
import { sessionManager } from '../services/sessionManager';
import { messageQueueService } from '../services/queue/messageQueue';
import { WorkerPool } from '../services/queue/workerPool';
import { schedulerService } from '../services/scheduler';
import { ConcurrencyController } from '../services/queue/concurrencyController';

export class WhatsAppClient {
  private sock: WASocket | undefined;
  private messageSender: MessageSender | undefined;
  private conversationManager: ConversationManager | undefined;
  private messageBuffer: MessageBuffer | undefined;
  private workerPool: WorkerPool | undefined;
  private concurrencyController: ConcurrencyController | undefined;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private qrCode: string | null = null;
  private lastConnectTime: number = 0;
  private isLoggingOut: boolean = false;

  constructor() { }

  public getStatus() {
    return {
      status: this.sock?.user ? 'CONNECTED' : (this.qrCode ? 'WAITING_FOR_QR' : 'DISCONNECTED'),
      qr: this.qrCode
    };
  }

  public async logout(): Promise<void> {
    this.isLoggingOut = true;
    try {
      if (this.sock) {
        console.log('📤 Logging out from WhatsApp...');
        await this.sock.logout();
        this.sock = undefined;
        this.qrCode = null;
        this.reconnectAttempts = 0;
        console.log('✅ Logged out successfully');
        setTimeout(() => this.initialize(), 2000);
      } else {
        console.log('⚠️ No active connection to logout from');
      }
    } catch (error) {
      console.error('❌ Logout error:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    console.log('🛑 Shutting down WhatsApp client...');
    try {
      if (this.concurrencyController) {
        this.concurrencyController.stop();
      }
      if (this.workerPool) {
        await this.workerPool.shutdown();
      }
      messageQueueService.stopMetricsCollection();
      await messageQueueService.cleanup();
      console.log('✅ WhatsApp client shutdown complete');
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }

  public async getAllGroups(): Promise<string[]> {
    if (!this.sock) {
      console.log('⚠️ WhatsApp not connected, cannot fetch groups (sock is undefined)');
      return [];
    }
    try {
      console.log('🔄 Fetching participating groups...');
      let groups = await this.sock.groupFetchAllParticipating();
      let groupJids = Object.keys(groups);

      if (groupJids.length === 0) {
        console.log('⚠️ First fetch returned 0 groups. Waiting 2s and retrying...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        groups = await this.sock.groupFetchAllParticipating();
        groupJids = Object.keys(groups);
      }

      console.log(`📢 Found ${groupJids.length} groups:`, groupJids);
      return groupJids;
    } catch (error) {
      console.error('❌ Failed to fetch groups:', error);
      return [];
    }
  }

  async initialize() {
    this.isLoggingOut = false;
    console.log('🔌 Initializing Representative Agent...');

    console.log('🔒 Attempting to acquire session lock...');
    const lockAcquired = await sessionManager.waitForLock(150000);

    if (!lockAcquired) {
      console.log('❌ Could not acquire session lock after 2.5 minutes.');
      console.log('   Another instance is likely stuck or running.');
      console.log('💡 The updated lock expiry is 2 minutes. This instance will exit and retry.');
      process.exit(1);
      return;
    }

    console.log('✅ Session lock acquired. Proceeding with connection...');

    const { state, saveCreds } = await usePostgresAuthState('whatsapp_session');

    console.log('🔍 Auth State Check:');
    console.log('   - Has existing credentials:', !!state.creds.me);
    console.log('   - Registration ID:', state.creds.registrationId);

    this.sock = makeWASocket({
      logger: pino({ level: 'silent' }) as any,
      auth: state,
      browser: ['Representative', 'Chrome', '1.0.0'],
      syncFullHistory: false,
      retryRequestDelayMs: 500,
      maxMsgRetryCount: 3,
      shouldIgnoreJid: () => false,
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log('📌 Scan the QR Code below to connect:');
        this.qrCode = qr;
        require('qrcode-terminal').generate(qr, { small: true });
      }

      if (connection === 'close') {
        const error = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const errorData = (lastDisconnect?.error as any)?.data;

        console.log('⚠️ Connection closed.');
        console.log('   Status Code:', error);
        console.log('   Error Data:', errorData);

        if (error === 440 && errorData?.tag === 'conflict') {
          console.log('❌ Session conflict detected (440: replaced).');
          console.log('   This means another instance connected with the same credentials.');
          console.log('💡 Releasing lock and exiting to prevent conflict loop...');
          await sessionManager.releaseLock();
          process.exit(1);
          return;
        }

        if (error === 405) {
          console.log('❌ Session data is corrupted or invalid (405 error).');
          console.log('💡 Solution: Run "npx ts-node scripts/clear-auth.ts" to clear session and generate a new QR code.');
          await sessionManager.releaseLock();
          process.exit(1);
          return;
        }

        if ((error === 401 || error === DisconnectReason.loggedOut) && !this.isLoggingOut) {
          console.log('❌ Session logged out or invalid (401).');
          console.log('💡 Clearing auth credentials to allow re-scan...');
          try {
            await db.delete(authCredentials);
          } catch (deleteError) {
            console.warn('⚠️ Failed to clear auth credentials (table might not exist):', deleteError);
          }
          await sessionManager.releaseLock();
          console.log('✅ Credentials cleared. Exiting to restart...');
          process.exit(1);
          return;
        }

        if (lastDisconnect?.error?.message?.includes('Unsupported state or unable to authenticate data')) {
          console.log('❌ Decryption error detected. Session keys are corrupted.');
          console.log('💡 Solution: Clear the auth_credentials table and restart to get a new QR code.');
          await sessionManager.releaseLock();
          process.exit(1);
          return;
        }

        const shouldReconnect = error !== DisconnectReason.loggedOut;

        if (shouldReconnect) {
          const sessionDuration = Date.now() - this.lastConnectTime;
          if (this.lastConnectTime > 0 && sessionDuration > 60000) {
            console.log(`✅ Connection stable (${Math.round(sessionDuration / 1000)}s). Resetting backoff.`);
            this.reconnectAttempts = 0;
          } else if (this.lastConnectTime > 0) {
            console.warn(`⚠️ Connection unstable (${Math.round(sessionDuration / 1000)}s). Escalating backoff to avoid conflict loop.`);
          }
        }

        if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(3000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
          console.log(`⏳ Reconnecting in ${delay / 1000} seconds... (Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.initialize(), delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.log('❌ Max reconnection attempts reached. Please check your connection and try again.');
          await sessionManager.releaseLock();
          process.exit(1);
        }
      } else if (connection === 'open') {
        console.log('✅ Representative Online!');
        this.qrCode = null;
        this.lastConnectTime = Date.now();

        this.messageSender = new MessageSender(this.sock!);
        this.conversationManager = new ConversationManager();
        this.messageBuffer = new MessageBuffer((jid, messages) => this.processMessageBatch(jid, messages));

        await messageQueueService.restoreQueue();

        this.workerPool = new WorkerPool(
          messageQueueService,
          this.processMessageBatch.bind(this)
        );

        this.concurrencyController = new ConcurrencyController(
          messageQueueService,
          this.workerPool
        );

        this.workerPool.start().catch(err => {
          console.error('❌ Worker pool error:', err);
        });
        this.concurrencyController.start();

        console.log('🎯 Advanced queue system initialized');

        if (this.sock) {
          notificationService.init(this.sock);
        }

        schedulerService.init(this);

        await this.messageSender.setOnline();
        console.log('👁️ Presence set to: Online');
      }
    });

    const decryptionFailures = new Map<string, number>();
    const MAX_DECRYPT_FAILURES = 3;

    this.sock.ev.on('messaging-history.set', ({ isLatest }) => {
      if (isLatest) {
        console.log('✅ Message history synced');
        decryptionFailures.clear();
      }
    });

    this.sock.ev.on('call', async (callEvents) => {
      for (const call of callEvents) {
        console.log(`📞 Incoming call from ${call.from}, status: ${call.status}`);
      }
    });

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      console.log(`📨 Raw Event: ${type}, Count: ${messages.length}`);

      if (type !== 'notify') {
        console.log('Skipping event (not "notify")');
        return;
      }

      for (const msg of messages) {
        const jid = msg.key.remoteJid;
        const fromMe = msg.key.fromMe;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
        const msgType = Object.keys(msg.message || {})[0];

        console.log(`🔍 Inspecting Msg: JID=${jid}, Me=${fromMe}, Type=${msgType}, Text=${text ? `"${text.substring(0, 20)}..."` : 'N/A'}`);

        if (!jid) {
          console.log('⏩ Skipping: No JID');
          continue;
        }

        if (fromMe) {
          console.log('⏩ Skipping: Sent by Me (Bot)');
          continue;
        }

        if (!msg.message || Object.keys(msg.message).length === 0) {
          console.warn(`⚠️ Message from ${jid} could not be decrypted (likely Bad MAC error)`);

          const failureCount = (decryptionFailures.get(jid) || 0) + 1;
          decryptionFailures.set(jid, failureCount);

          if (failureCount >= MAX_DECRYPT_FAILURES) {
            console.error(`❌ Too many decryption failures for ${jid}. Notifying user and clearing session.`);

            try {
              if (this.sock) {
                await this.sock.sendMessage(jid, {
                  text: "⚠️ I'm having trouble reading your messages due to an encryption issue. This usually happens when:\n\n" +
                    "1. You're using WhatsApp Web/Desktop\n2. Your session keys are out of sync\n\n" +
                    "**To fix this:**\n" +
                    "• Try sending your message again from your phone (not Web/Desktop)\n" +
                    "• Or wait a few minutes and try again\n\n" +
                    "If the problem persists, the bot admin may need to reset the connection."
                });
              }
            } catch (e) {
              console.error('Failed to send decryption error message:', e);
            }

            decryptionFailures.delete(jid);
          }
        }

        try {
          await this.handleIncomingMessage(msg);
        } catch (err: any) {
          console.error('❌ Error handling message:', err.message);
        }
      }
    });
  }

  private async handleIncomingMessage(msg: any) {
    let remoteJid = msg.key.remoteJid!;
    remoteJid = ownerService.normalizeJid(remoteJid);

    const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text;
    const pushName = msg.pushName;

    if (!text) return;
    if (remoteJid === 'status@broadcast') return;

    if (remoteJid.endsWith('@g.us')) {
      console.log(`⏩ Skipping: Group message from ${remoteJid}`);
      return;
    }

    if (remoteJid.includes('@broadcast') || remoteJid.includes('@newsletter')) {
      console.log(`⏩ Skipping: Broadcast/Channel message from ${remoteJid}`);
      return;
    }

    if (!remoteJid.endsWith('@s.whatsapp.net') && !remoteJid.endsWith('@lid')) {
      console.log(`⏩ Skipping: Unknown JID format ${remoteJid}`);
      return;
    }

    console.log(`📥 Incoming DM: ${remoteJid} ("${text}")`);

    if (ownerService.isOwner(remoteJid)) {
      console.log(`👑 Owner Message Detected from ${remoteJid}`);
    }

    let contact = await withRetry(async () => {
      return await db.select().from(contacts).where(eq(contacts.phone, remoteJid)).then(res => res[0]);
    });

    if (!contact) {
      console.log('✨ New Contact Detected! Creating profile...');
      const newContacts = await withRetry(async () => {
        return await db.insert(contacts).values({
          phone: remoteJid,
          originalPushname: pushName,
          name: IdentityValidator.extractDisplayName(pushName) || 'Unknown',
          summary: 'New contact. Interaction started.',
          trustLevel: 0,
          platform: 'whatsapp',
          isVerified: false
        }).returning();
      });
      contact = newContacts[0];
    } else {
      if (!contact.originalPushname && pushName) {
        await withRetry(async () => {
          await db.update(contacts).set({ originalPushname: pushName }).where(eq(contacts.phone, remoteJid));
        });
      }
    }

    if (this.messageBuffer) {
      this.messageBuffer.add(remoteJid, text);
    }
  }

  private async processMessageBatch(remoteJid: string, messages: string[]) {
    const fullText = messages.join('\n');
    const isOwner = ownerService.isOwner(remoteJid);

    console.log(`🤖 AI Processing Batch for ${remoteJid} (Owner: ${isOwner}): "${fullText}"`);

    if (rateLimitManager.isLimited() && !isOwner) {
      console.log(`⏸️ Rate limited. Queueing message from ${remoteJid} (silent mode)`);
      rateLimitManager.enqueue(remoteJid, messages);
      return;
    }

    const contact = await withRetry(async () => {
      return await db.select().from(contacts).where(eq(contacts.phone, remoteJid)).then(res => res[0]);
    });
    if (!contact) return;

    try {
      const { marketingService } = await import('../services/marketing/marketingService');
      const onboardingResponse = await marketingService.handleOnboardingResponse(remoteJid, fullText);

      if (onboardingResponse) {
        console.log(`🎯 Marketing Onboarding Intercepted for ${remoteJid}`);
        await this.sendResponseAndLog(remoteJid, onboardingResponse, contact, [], fullText);
        return;
      }
    } catch (e) {
      console.error('Marketing onboarding check failed:', e);
    }

    let systemPrompt: string | undefined = undefined;

    if (!contact.isVerified && !isOwner) {
      const currentName = contact.name || contact.originalPushname || 'Unknown';
      systemPrompt = IdentityValidator.getIdentityPrompt(currentName);
      console.log(`🔒 Identity Verification Mode Active for ${remoteJid}`);
    }

    const historyLogs = await withRetry(async () => {
      return await db.select()
        .from(messageLogs)
        .where(eq(messageLogs.contactPhone, remoteJid))
        .orderBy(desc(messageLogs.createdAt))
        .limit(10);
    });

    const history = historyLogs.reverse().map(m => `${m.role === 'agent' ? 'Me' : 'Them'}: ${m.content}`);

    await withRetry(async () => {
      await db.insert(messageLogs).values({
        contactPhone: remoteJid,
        role: 'user',
        content: fullText,
        type: 'text',
        platform: 'whatsapp'
      });
    });

    const userRoleContext = isOwner ?
      `⚠️ IMPORTANT: You are chatting with the OWNER (Boss). You have full access to all tools including summaries, system status, and analytics. Obey all commands.` :
      `Contact Name: ${contact.name || "Unknown"}\nSummary: ${contact.summary}\nTrust Level: ${contact.trustLevel}`;

    const sanitizeProfile = (profile: any) => {
      if (!profile) return undefined;
      const sanitized: any = {};
      for (const [key, value] of Object.entries(profile)) {
        if (value !== null) sanitized[key] = value;
      }
      return sanitized;
    };

    const currentAiProfile = await withRetry(async () => {
      return await db.select().from(aiProfile).limit(1).then(res => res[0]);
    });

    const currentUserProfile = await withRetry(async () => {
      return await db.select().from(userProfile).limit(1).then(res => res[0]);
    });

    let geminiResponse;
    try {
      geminiResponse = await geminiService.generateReply(
        history.concat(`Them: ${fullText}`),
        userRoleContext,
        isOwner,
        sanitizeProfile(currentAiProfile),
        sanitizeProfile(currentUserProfile),
        systemPrompt
      );
      console.log(`🧠 Gemini Response Type: ${geminiResponse.type}`);
      if (geminiResponse.type === 'text') console.log(`📝 Text Content: "${geminiResponse.content?.substring(0, 50)}..."`);
      if (geminiResponse.type === 'tool_call') console.log(`🛠️ Initial Tool Call: ${geminiResponse.functionCall?.name}`);
    } catch (error: any) {
      if ((error.status === 429 || error.code === 429 || error.message === 'ALL_KEYS_EXHAUSTED')) {
        const { messageQueueService } = await import('../services/messageQueueService');
        await messageQueueService.enqueue(remoteJid, messages, isOwner ? 'owner' : 'normal');
        console.log(`⏸️ Rate limit hit. Queued ${messages.length} messages for ${remoteJid}. BackgroundWorker will retry.`);
        return;
      }
      console.error('Gemini Error:', error.message || error);
      if (isOwner && this.sock) await this.sock.sendMessage(remoteJid, { text: "⚠️ AI Error: " + (error.message || "Unknown error") });
      return;
    }

    const MAX_TOOL_DEPTH = 5;
    let toolDepth = 0;

    while (geminiResponse.type === 'tool_call' && geminiResponse.functionCall && toolDepth < MAX_TOOL_DEPTH) {
      const { name, args } = geminiResponse.functionCall;
      console.log(`🛠️ Tool Execution: ${name}`);

      let toolResult;
      try {
        toolResult = await executeLocalTool(name, args, { contact, userProfile: currentUserProfile, client: this });
      } catch (toolError: any) {
        console.error(`Tool error:`, toolError.message);
        toolResult = { error: "Tool failed: " + toolError.message };
      }

      const resultData = (toolResult as any)?._data;

      if (resultData?.type === 'image_file' && resultData.path) {
        console.log(`🖼️ Image Generation Detected! Sending file from ${resultData.path} to ${remoteJid}...`);
        try {
          const fs = require('fs');
          const imageBuffer = fs.readFileSync(resultData.path);

          if (this.messageSender) {
            await this.messageSender.sendImage(remoteJid, imageBuffer, resultData.caption || "Here is your image");
          } else if (this.sock) {
            await this.sock.sendMessage(remoteJid, {
              image: imageBuffer,
              caption: resultData.caption
            });
          }

          try {
            fs.unlinkSync(resultData.path);
          } catch (cleanupError) {
            console.warn('Failed to cleanup temp image file:', cleanupError);
          }

          toolResult = { result: "Image generated and sent successfully to user." };
        } catch (imgError: any) {
          console.error('Failed to send generated image:', imgError);
          toolResult = { error: "Image generated but failed to send: " + imgError.message };
        }
      }

      const toolOutputText = `[System: Tool '${name}' returned: ${JSON.stringify(toolResult)}]`;

      try {
        geminiResponse = await geminiService.generateReply(
          history.concat(`Them: ${fullText}`, toolOutputText),
          userRoleContext,
          isOwner,
          sanitizeProfile(currentAiProfile),
          sanitizeProfile(currentUserProfile),
          systemPrompt
        );
      } catch (error: any) {
        if ((error.status === 429 || error.code === 429 || error.message === 'ALL_KEYS_EXHAUSTED') && !isOwner) {
          console.log(`⏸️ Rate limit hit during tool execution. Re-queueing batch.`);
          const retryAfter = error.errorDetails?.find((d: any) => d['@type']?.includes('RetryInfo'))?.retryDelay;
          const seconds = retryAfter ? parseInt(retryAfter) : 60;
          rateLimitManager.setRateLimited(seconds);
          rateLimitManager.enqueue(remoteJid, messages);
          setTimeout(() => rateLimitManager.processQueue(this.processMessageBatch.bind(this)), seconds * 1000);
          return;
        }
        console.error('Gemini Tool Response Error:', error);
        if (isOwner && this.sock) await this.sock.sendMessage(remoteJid, { text: "⚠️ AI Error during tool: " + (error.message || "Unknown") });
        break;
      }
      toolDepth++;
    }

    if (geminiResponse.type === 'text' && geminiResponse.content) {
      await this.sendResponseAndLog(remoteJid, geminiResponse.content, contact, history, fullText);
    } else if (geminiResponse.type === 'tool_call') {
      console.warn(`⚠️ Max tool depth (${MAX_TOOL_DEPTH}) exceeded. Forcing final response from AI...`);

      try {
        const forcedResponse = await geminiService.generateReply(
          history.concat(`Them: ${fullText}`, `[System: Maximum tool calls reached. You MUST NOT call any more tools. Please provide the best possible answer based on the information you have gathered so far. Do not apologize for the limit, just answer the user's question with the data you have.]`),
          userRoleContext,
          isOwner,
          sanitizeProfile(currentAiProfile),
          sanitizeProfile(currentUserProfile),
          systemPrompt
        );

        if (forcedResponse.type === 'text' && forcedResponse.content) {
          console.log(`✅ Generated forced response after tool limit.`);
          await this.sendResponseAndLog(remoteJid, forcedResponse.content, contact, history, fullText);
        } else {
          const errorMsg = "I found some information but I'm having trouble synthesizing it. Please try asking a more specific question.";
          await this.sendResponseAndLog(remoteJid, errorMsg, contact, history, fullText);
        }
      } catch (e) {
        console.error('Error fetching forced response:', e);
        const errorMsg = "I'm having trouble getting all the information. I might be getting stuck in a research loop.";
        await this.sendResponseAndLog(remoteJid, errorMsg, contact, history, fullText);
      }
    }
  }

  private async sendResponseAndLog(remoteJid: string, responseText: string, contact: any, history: string[], userText: string) {
    console.log(`📤 Sending Response to ${remoteJid}: "${responseText.substring(0, 50)}..."`);
    let finalResponse = responseText;
    let shouldEndSession = false;

    if (responseText.includes('#END_SESSION#')) {
      shouldEndSession = true;
      finalResponse = responseText.replace('#END_SESSION#', '').trim();
    }

    if (this.messageSender) {
      await this.messageSender.sendText(remoteJid, finalResponse);
    } else {
      await this.sock!.sendMessage(remoteJid, { text: finalResponse });
    }

    await withRetry(async () => {
      await db.insert(messageLogs).values({
        contactPhone: remoteJid,
        role: 'agent',
        content: finalResponse,
        type: 'text',
        platform: 'whatsapp'
      });
    });

    if (this.conversationManager) {
      if (shouldEndSession) {
        console.log('🏁 Closing Intent Detected. Ending session.');
        this.conversationManager.endConversation(remoteJid);
      } else {
        this.conversationManager.touchConversation(remoteJid);
      }
    }

    if (!ownerService.isOwner(remoteJid) && !rateLimitManager.isLimited()) {
      this.runProfiling(history.concat(`Them: ${userText}`, `Me: ${finalResponse}`), contact);
    }
  }

  public async sendText(jid: string, text: string): Promise<void> {
    if (!this.sock) {
      console.warn('⚠️ Cannot send message: Client not initialized');
      return;
    }

    try {
      await this.sock.sendMessage(jid, { text });
      console.log(`✅ Text sent to ${jid}`);
    } catch (error) {
      console.error(`❌ Error sending text to ${jid}:`, error);
      throw error;
    }
  }

  public async sendImage(jid: string, image: Buffer, caption?: string): Promise<void> {
    if (!this.sock) {
      console.warn('⚠️ Cannot send image: Client not initialized');
      return;
    }

    console.log(`📤 Sending image to ${jid} (${image.length} bytes)...`);

    try {
      // Increased timeout for reliability
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Send image timeout (120s)')), 120000)
      );

      await Promise.race([
        this.sock.sendMessage(jid, {
          image,
          caption,
          mimetype: 'image/jpeg'
        }),
        timeoutPromise
      ]);

      console.log(`✅ Image sent to ${jid}`);
    } catch (error) {
      console.error(`❌ Error sending image to ${jid}:`, error);
      throw error;
    }
  }

  private async runProfiling(history: string[], contact: any) {
    if (rateLimitManager.isLimited()) return;

    await new Promise(resolve => setTimeout(resolve, 5000));

    const profileUpdate = await geminiService.updateProfile(history, contact.summary || "");

    if (profileUpdate) {
      console.log(`📝 Updating profile for ${contact.phone}...`);

      await withRetry(async () => {
        await db.update(contacts)
          .set({
            name: profileUpdate.name || contact.name,
            summary: profileUpdate.summary,
            trustLevel: profileUpdate.trust_level
          })
          .where(eq(contacts.phone, contact.phone));
      });
    }
  }
}