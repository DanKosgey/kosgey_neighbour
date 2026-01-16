# 🕵️ Auto-WhatsApp: Your Personal Representative

A fully autonomous WhatsApp agent that acts as your **Executive Assistant**. It answers factual questions, builds profiles of who is messaging you, and strictly defers decisions to you.

## 🌟 Features
- **Representative Persona:** Polite, professional, and protective. Never makes unauthorized commitments.
- **Dynamic Profiling:** "Reads" conversations to build a contact dossier (Name, Role, Vibe) in the database.
- **Zero Cost Stack:** Runs on free tiers of Render, Neon (Postgres), and Google Gemini.
- **Dual Number System:** Keeps your personal number private; alerts you only when decisions are needed.
- **Human-Like Behavior:** Shows "typing..." indicators, realistic delays, and online presence.
- **Full Media Support:** Can send text, images, voice notes, documents, locations, and more.
- **Real-Time Sync:** All messages appear on your phone instantly - you maintain full control.

### 📱 Messaging Capabilities
The agent supports all WhatsApp message types:
- ✅ **Text Messages** with typing simulation
- ✅ **Presence Updates** (Online, Typing, Recording)
- ✅ **Images** (from buffer or URL)
- ✅ **Voice Notes** with recording indicator
- ✅ **Documents/Files** of any type
- ✅ **Locations** with coordinates
- ✅ **Contact Cards** for sharing contacts
- ✅ **Reactions** to messages
- ✅ **Read Receipts** for message tracking

### 🛡️ Smart Features
- **The "Digital Buffer":** Filters noise. AI handles the chat, you only see the summary.
- **Identity Discovery:** Automatically detects unknown users and politely asks "Who is this?".
- **Real-Time Calendar:** Checks your Google Calendar before committing to times (requires setup).
- **Traffic Light Reports:**
  - 🔴 **Red:** Urgent decision needed.
  - 🟡 **Yellow:** Informational update.
  - 🟢 **Green:** Low priority / handled.
- **Conversation Sessions:** intelligently tracks when a conversation starts and ends (20 min silence).
- **Dynamic Profiling:** Builds a permanent dossier of every contact in your database.

📖 See [DIGITAL_BUFFER_SYSTEM.md](docs/DIGITAL_BUFFER_SYSTEM.md) for the full architecture.


## 🚀 Setup Guide (Zero Cost)

### 1. Prerequisites
- **Git** & **Node.js** v18+.
- **WhatsApp** account (for the Agent).

### 2. The "Brain" (Gemini)
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey).
2. Create a free API Key.

### 3. The "Memory" (Neon Postgres)
1. Create a free project on [Neon.tech](https://neon.tech).
2. Get your `postgres://...` connection string.

### 4. Local Run
1. Clone this repo.
2. `npm install`
3. Create `.env` from `.env.example` and fill in your keys.
4. **Push Schema:** `npm run db:push` (Creates tables in Neon).
5. `npm run dev`
6. **Scan the QR Code** with your Agent's WhatsApp account (Linked Devices).

### 5. Deploy to Cloud (Render)
1. Connect repo to Render "Web Service".
2. Build Command: `npm install && npm run build`.
3. Start Command: `npm start`.
4. Set Environment Variables in Dashboard.
5. Deploy!

## 🔧 Troubleshooting

### Connection Error 405 (Session Corrupted)
If you see repeated `405 Method Not Allowed` errors:
```bash
npm run clear-auth
```
This clears the corrupted session data. Restart the app and scan a new QR code.

### App Keeps Reconnecting
- Check your internet connection
- Verify your WhatsApp account isn't logged in elsewhere
- Make sure your DATABASE_URL is correct in `.env`

### QR Code Not Showing
- The QR code will appear in the terminal when you first run the app
- If already authenticated, no QR code is needed
- To force a new QR code, run `npm run clear-auth` first

## ⚠️ Privacy Note
Your data stays in **your** database. The AI logic processes text but doesn't train on it publicly.

---
*Built with ❤️ for privacy & efficiency.*
