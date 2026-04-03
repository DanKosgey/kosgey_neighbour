# Chat Agent Quick Start

## 3-Minute Overview

**What it does:** Toggle whether your bot replies to user messages.

- ✅ **Enabled** = Bot replies to DMs + broadcasts ads
- ❌ **Disabled** = Bot only broadcasts ads, ignores DMs

## Commands (Owner Only)

```
/enable chat agent        → Turn on AI auto-replies
/disable chat agent       → Turn off AI auto-replies  
/chat agent status        → Check current mode
```

Or use natural language:
- "enable chat agent"
- "disable chat agent"  
- "what's the chat agent status"

## Use Cases

| Situation | Setting | Why |
|-----------|---------|-----|
| Normal operation | Enabled | Respond to customers while broadcasting |
| Pure advertising campaign | Disabled | Focus only on sending ads, save API costs |
| Reduce costs | Disabled | Skip Gemini API calls for incoming DMs |
| Testing broadcasts | Disabled | Send ads without triggering AI responses |
| Resume engagement | Enabled | Re-enable conversations when ready |

## How It Works

1. User sends a DM
2. Message is logged to database
3. Choose: Process with AI or skip?
   - **Enabled**: Generate AI response → Send reply
   - **Disabled**: Skip AI → No reply sent
4. Continue with scheduled broadcasts (unaffected)

**Owner messages are always processed** (bypass the setting).

## Default State

- Chat agent starts **enabled**
- Bot will reply to messages by default
- Owner can disable at any time

## Example Conversation

**User (Owner):** "disable chat agent"
**Bot:** 
```
🔇 Chat Agent DISABLED

📢 The bot will ONLY BROADCAST ads to groups.

Features when disabled:
- ❌ No AI auto-replies to DMs
- ❌ No conversation engagement
- ✅ Still broadcasts ads to target groups
- ✅ Still logs incoming messages for context

This mode is useful when you want the bot to focus purely on advertising 
without responding to customer inquiries.
```

**Later... User (Owner):** "enable chat agent"
**Bot:**
```
✅ Chat Agent ENABLED

🤖 The AI will now AUTO-REPLY to incoming DMs from contacts.

Features:
- Responds to customer inquiries
- Processes conversation context
- Uses full AI capabilities for engagement

The bot will continue broadcasting ads to groups while also responding 
to individual messages.
```

## Where to Find Implementation

| Component | File | Lines |
|-----------|------|-------|
| Message interception | `src/core/whatsapp.ts` | 670-686 |
| Settings control | `src/services/systemSettings.ts` | 108-144 |
| Owner commands | `src/services/ai/ownerTools.ts` | 250-295 |
| Tool registration | `src/services/ai/tools.ts` | (multiple) |

## Database

Setting stored in `system_settings` table:
```sql
key: 'chat_agent_enabled'
value: 'true' or 'false'
```

Check with owner command: `/chat agent status`

## Performance

- **Enabled**: Normal (Gemini API calls per message)
- **Disabled**: 
  - No API calls = lower costs
  - Faster processing (just database log)
  - More eco-friendly

## Notes

- Only owner can toggle this setting
- Regular users cannot see or change it
- Incoming messages are always logged (for history)
- This doesn't affect:
  - Group broadcasts (always continue)
  - Calendar access control  
  - Other AI features
  - Rate limiting
