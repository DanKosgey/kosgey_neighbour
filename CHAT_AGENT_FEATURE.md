# Chat Agent Enable/Disable Feature

## Overview

The **Chat Agent** feature allows the owner to control whether the AI bot auto-replies to incoming user messages. When disabled, the bot operates in **broadcast-only mode** — it sends ads to groups but doesn't respond to individual DM inquiries.

This is useful when you want to:
- Focus purely on advertising without engaging in conversations
- Reduce API costs by disabling unnecessary AI processing
- Temporarily disable responses while maintaining scheduled broadcasts

---

## How It Works

### Architecture

The feature is implemented across three key files:

1. **`src/services/systemSettings.ts`** - Persistent storage of the chat agent setting
2. **`src/core/whatsapp.ts`** - Message processing logic that checks the setting
3. **`src/services/ai/ownerTools.ts`** & **`src/services/ai/tools.ts`** - Owner commands to control the feature

### Message Flow

```
Incoming Message
    ↓
WhatsApp Event (messages.upsert)
    ↓
handleIncomingMessage() - adds to message buffer
    ↓
processMessageBatch() - HERE IS THE CHECK!
    ↓
    Is Chat Agent Enabled?
    ├─ YES → Continue with AI processing
    ├─ NO  → Log message & return (no AI response)
    ↓
(If enabled) Send AI response
```

### Key Changes

#### 1. **systemSettings.ts** (Added 3 methods)

```typescript
// Check if chat agent is enabled (default: true)
async isChatAgentEnabled(): Promise<boolean>

// Enable chat agent
async enableChatAgent(): Promise<void>

// Disable chat agent
async disableChatAgent(): Promise<void>
```

#### 2. **whatsapp.ts** - processMessageBatch() (Added check)

```typescript
// New check added early in processMessageBatch():
const chatAgentEnabled = await systemSettingsService.isChatAgentEnabled();
if (!chatAgentEnabled && !isOwner) {
  console.log(`🔇 Chat Agent is DISABLED. Skipping AI reply...`);
  // Message is logged but no AI response sent
  return;
}
```

**Important**: Owner messages are ALWAYS processed, regardless of chat agent status.

#### 3. **Owner Tools** (Added 3 new commands)

Users can control the feature with these commands (owner only):

```
/enable chat agent
/disable chat agent
/chat agent status
```

Or with natural language:
- "enable chat agent"
- "disable chat agent"
- "chat agent status"
- "turn on auto-reply"
- "turn off responses"

---

## Usage

### For the Owner

Simply send a message to the bot while logged in as the owner:

```
You: enable chat agent
Bot: ✅ Chat Agent ENABLED
     🤖 The AI will now AUTO-REPLY to incoming DMs...

You: disable chat agent
Bot: 🔇 Chat Agent DISABLED
     📢 The bot will ONLY BROADCAST ads to groups...

You: chat agent status
Bot: 🤖 Chat Agent Status: ✅ ENABLED (Auto-reply mode)
     - AI will reply to incoming DMs...
```

### What Happens When Disabled

**When Chat Agent is DISABLED:**
- ✅ Bot continues broadcasting ads to groups
- ❌ Bot does NOT auto-reply to DMs
- ❌ Bot does NOT respond to customer inquiries
- ✅ Incoming messages are still logged for context
- ✅ Owner messages are processed normally

**When Chat Agent is ENABLED:**
- ✅ Bot broadcasts ads to groups
- ✅ Bot auto-replies to customer DMs
- ✅ Full conversation engagement active
- ✅ All AI tools available

---

## Database Storage

The setting is stored in the `system_settings` table:

```sql
-- Check current status
SELECT * FROM system_settings WHERE key = 'chat_agent_enabled';

-- Manually update (not recommended, use commands instead)
UPDATE system_settings SET value = 'false' WHERE key = 'chat_agent_enabled';
```

Default value: `'true'` (chat agent enabled)

---

## Implementation Details

### File Locations

1. **Message Handler**: [src/core/whatsapp.ts](src/core/whatsapp.ts#L670-L686)
   - Lines 670-686: Chat agent check in `processMessageBatch()`

2. **Settings Service**: [src/services/systemSettings.ts](src/services/systemSettings.ts#L108-L144)
   - Lines 108-144: Chat agent control methods

3. **Owner Tools**: [src/services/ai/ownerTools.ts](src/services/ai/ownerTools.ts#L250-L295)
   - Lines 250-295: Command implementations

4. **Tool Registration**: [src/services/ai/tools.ts](src/services/ai/tools.ts)
   - Declaration section: Chat agent tool definitions
   - Execution section: Tool case handlers

### Console Output

When chat agent is disabled:
```
🔇 Chat Agent is DISABLED. Skipping AI reply for [user-jid]. 
   Message will be logged but no response sent.
```

When toggling:
```
🤖 Chat Agent ENABLED - AI will reply to incoming messages
🔇 Chat Agent DISABLED - Bot will only broadcast ads, not reply to messages
```

---

## Code Examples

### Checking the Setting Programmatically

```typescript
import { systemSettingsService } from '../services/systemSettings';

const isEnabled = await systemSettingsService.isChatAgentEnabled();

if (isEnabled) {
  // Process with AI
} else {
  // Skip AI, just log message
}
```

### Toggling from Code

```typescript
// Enable
await systemSettingsService.enableChatAgent();

// Disable
await systemSettingsService.disableChatAgent();
```

---

## Testing

### Test Scenario 1: Disable Chat Agent

1. Send as owner: `disable chat agent`
2. Bot confirms: `🔇 Chat Agent DISABLED`
3. Send a message from a regular user
4. Expected: Message logged to DB, no AI response sent
5. Check console: `🔇 Chat Agent is DISABLED...`

### Test Scenario 2: Enable Chat Agent

1. Send as owner: `enable chat agent`
2. Bot confirms: `✅ Chat Agent ENABLED`
3. Send a message from a regular user
4. Expected: Normal AI response sent
5. Check console: `🤖 AI Processing Batch...`

### Test Scenario 3: Owner Always Gets Response

1. Disable chat agent
2. Send message as owner
3. Expected: Message is processed with AI (owner bypass works)

### Test Scenario 4: Check Status

1. Send as owner: `chat agent status`
2. Bot responds with current setting

---

## Performance Impact

- **Chat Agent ENABLED**: Uses Gemini API for each message (normal behavior)
- **Chat Agent DISABLED**: 
  - Skips all Gemini API calls
  - Only database operations (message logging)
  - **Significant cost savings** if many messages arrive
  - **Reduced latency** per message (no API calls)

---

## Default Behavior

The chat agent is **enabled by default** on first run. If the setting doesn't exist in the database, it defaults to `true`.

To change the default, modify [src/services/systemSettings.ts](src/services/systemSettings.ts#L132):

```typescript
async isChatAgentEnabled(): Promise<boolean> {
    const val = await this.get('chat_agent_enabled', 'true'); // Change 'true' to 'false'
    return (val ?? 'true').toLowerCase() === 'true';
}
```

---

## Related Features

This feature works alongside other system settings:

- **Calendar Access Control** - Same pattern, controls calendar tool availability
- **Rate Limiting** - Still applies even when chat agent is disabled
- **Message Logging** - Always active regardless of chat agent status
- **Contact Verification** - Not needed if chat agent is disabled

---

## Troubleshooting

### Issue: Chat agent toggle doesn't work

**Check:**
1. Are you sending the command as the owner? (Only owner can toggle)
2. Does a message in logs say "Chat Agent is DISABLED"?
3. Check database: `SELECT * FROM system_settings WHERE key = 'chat_agent_enabled';`

### Issue: Owner messages not processing

**Check:**
1. Verify owner phone is correctly configured in `.env`
2. Owner messages should process regardless of setting
3. If not working, check logs for owner detection

### Issue: Messages being logged but not replied

**Check:**
1. Run `/chat agent status` to see current setting
2. If you want replies, run `/enable chat agent`
3. New messages should get AI responses

---

## Future Enhancements

Possible improvements:

1. **Per-Group Settings** - Enable/disable chat agent per group
2. **Per-Contact Whitelist** - Only respond to specific contacts
3. **Time-Based** - Enable/disable on schedule
4. **Hybrid Mode** - Respond only to high-priority contacts
5. **UI Dashboard** - Visual toggle in web interface

---

## Summary

This feature gives you complete control over whether your bot engages in conversations. Perfect for:
- Pure advertising campaigns
- Cost optimization during low-activity periods
- Testing messaging without AI responses
- Focusing on scheduled broadcasts only

Use `/enable chat agent` and `/disable chat agent` to toggle, or check `/chat agent status` anytime.
