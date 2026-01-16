# 🆔 Identity Validation & Discovery System

## Overview
This system prevents the agent from interacting with users who have "nonsense" names (e.g., emojis, "User 1", ".", "iPhone") without first verifying their identity. It ensures a professional experience and accurate database records.

## 🛠️ How It Works

### 1. The Gatekeeper (Validation)
When a message arrives from a contact who is **not yet verified**:
- The system checks their **PushName** (from WhatsApp).
- It runs a "Vibe Check" (`IdentityValidator.isValidName`).

**Criteria for Invalid Names:**
- Too short (e.g., ".")
- Only emojis (e.g., "🔥")
- Generic placeholders (e.g., "WhatsApp User", "iPhone")
- Too long (potential spam)
- Mostly numbers

### 2. The Discovery Flow (If Name is Invalid)
If the name is flagged as invalid:
- The agent activates a **Special Identity Prompt**.
- Instead of a normal reply, the AI is instructed to:
  1. Politely ask for the user's name.
  2. Ask for context (how they know the owner).
  3. Start the conversation after getting this info.

**Example Prompt:**
> "The user's WhatsApp display name is '.' which is too short. Your PRIMARY GOAL is to politely discover their real name and how they know the owner."

### 3. The Extraction (Auto-Update)
When the user replies (e.g., "It's Mike from the gym"):
- The system scans the message using regex patterns (`IdentityValidator.extractNameFromMessage`).
- If a valid name is found ("Mike"):
  - **Database Updated:** `confirmedName` = "Mike", `isVerified` = `true`.
  - **AI Notified:** Context summary updated with `[Identity Confirmed: Mike]`.
  - **Future Chats:** Agent uses "Mike" naturally.

## 📊 Database Updates (`contacts` table)

| Field | Type | Purpose |
|-------|------|---------|
| `original_pushname` | text | The raw name from WhatsApp (e.g., "🔥") |
| `confirmed_name` | text | The verified real name (e.g., "Mike Jones") |
| `is_verified` | boolean | `true` if identity confirmed |
| `context_summary` | text | Stores "Friend from gym", "Client", etc. |

## 🚀 Usage

This system runs automatically in `WhatsAppClient.handleMessage`. No manual intervention required.

### Force Verification
If you want to manually verify a user, you can simply edit their record in the database:
```sql
UPDATE contacts SET is_verified = true, confirmed_name = 'John Doe' WHERE phone = '+1234567890';
```
