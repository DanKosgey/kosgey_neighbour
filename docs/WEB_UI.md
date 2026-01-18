# WhatsApp Representative Agent - Web Dashboard

## 🎨 Features

### Dashboard
- **Real-time Status Monitoring**: See connection status, QR code for login, and system stats
- **QR Code Login**: Scan QR code directly from the browser to connect WhatsApp
- **Statistics Cards**: View total messages, active contacts, response rate, and average response time
- **Recent Activity Feed**: Monitor recent interactions

### Chats
- **Conversation List**: Browse all active conversations
- **Message History**: View full message threads with contacts
- **Real-time Updates**: Auto-refresh every 3 seconds
- **Search**: Filter conversations by name or content

### Contacts
- **Contact Directory**: View all contacts with trust levels
- **Contact Profiles**: See detailed information including phone numbers and summaries
- **Trust Level Indicators**: Visual badges showing contact trust levels (High/Medium/Low)
- **Search**: Filter contacts by name or phone number

### Settings
- **Connection Status**: View current WhatsApp connection state
- **Desktop Notifications**: Enable/disable browser notifications
- **Sound Alerts**: Toggle sound for new messages
- **Disconnect**: Log out from WhatsApp

## 🚀 Getting Started

### 1. Start the Server

```bash
npm run dev
```

The server will start on port 3000 (or the port specified in your `PORT` environment variable).

### 2. Access the Dashboard

Open your browser and navigate to:

```
http://localhost:3000
```

### 3. Connect WhatsApp

1. If not already connected, you'll see a QR code on the dashboard
2. Open WhatsApp on your phone
3. Go to **Settings** → **Linked Devices** → **Link a Device**
4. Scan the QR code displayed in your browser
5. Once connected, the dashboard will update automatically

## 📱 UI Overview

### Navigation Sidebar
- **Dashboard**: Overview and QR code login
- **Chats**: View and manage conversations
- **Contacts**: Browse all contacts
- **Settings**: Configure notifications and connection

### Status Indicator
The bottom of the sidebar shows the current connection status:
- 🟢 **Connected**: WhatsApp is online and ready
- 🟡 **Waiting for QR**: Scan the QR code to connect
- 🔴 **Disconnected**: Not connected to WhatsApp

## 🎯 API Endpoints

The dashboard uses the following API endpoints:

- `GET /api/status` - Get connection status and QR code
- `GET /api/stats` - Get system statistics
- `GET /api/contacts` - Get all contacts
- `GET /api/contacts/:phone` - Get specific contact details
- `GET /api/chats` - Get all conversations
- `GET /api/chats/:phone/messages` - Get messages for a specific conversation

## 🎨 Design Features

- **Dark Theme**: Modern dark UI with purple/blue gradients
- **Responsive**: Works on desktop, tablet, and mobile
- **Smooth Animations**: Polished transitions and hover effects
- **Real-time Updates**: Auto-refresh every 3 seconds
- **Premium Aesthetics**: Glassmorphism, gradients, and micro-animations

## 🔧 Technical Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL (via Drizzle ORM)
- **Real-time**: Polling-based updates (3-second intervals)

## 📝 Notes

### Message Buffer Timing
The agent now responds within **10 seconds** (reduced from 60 seconds) for better user experience. This means:
- Single conversation: 10-second response time
- 2-3 active conversations: 15-second response time
- 4-10 active conversations: 20-second response time
- 10+ active conversations: 30-second response time

### Browser Notifications
To enable desktop notifications:
1. Go to **Settings** page
2. Enable "Desktop Notifications"
3. Grant permission when prompted by your browser

### Deployment
When deploying, ensure:
1. The `public` folder is included in your deployment
2. The server serves static files from the `public` directory
3. The `PORT` environment variable is set correctly

## 🎉 Enjoy!

Your WhatsApp Representative Agent now has a beautiful, functional web interface for monitoring and managing all your conversations!
