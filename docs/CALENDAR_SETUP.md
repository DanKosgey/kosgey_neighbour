# 📅 Google Calendar Setup Guide

To enable the AI to check your real schedule, you need to create a "Service Account" and share your calendar with it.

## Step 1: Create a Service Account
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Project (or select an existing one).
3. Enable the **Google Calendar API** for that project.
4. Go to **IAM & Admin** -> **Service Accounts**.
5. Click **Create Service Account**.
   - Name: `whatsapp-agent`
   - Description: "Calendar Access for AI"
6. Create it. Skip role assignment (optional).
7. Click on the new Service Account (email looks like `whatsapp-agent@project-id.iam.gserviceaccount.com`).
8. Go to the **Keys** tab -> **Add Key** -> **Create new key** -> **JSON**.
9. A file will download. **Rename it to `service-account.json`.**
10. Move this file into your project folder: `w_app agent/service-account.json`.

## Step 2: Share Your Calendar
1. Open [Google Calendar](https://calendar.google.com/).
2. Look at the **Left Sidebar** under "My calendars".
3. **Hover your mouse** over your name (e.g., "Kosgey Dan").
4. You will see **3 vertical dots** appear next to it on the right. Click them.
5. Select **Settings and sharing**.
6. A new page opens. Scroll down until you see the section **"Share with specific people or groups"**.
7. Click the **+ Add people and groups** button.
8. Paste the **Service Account Email** (It usually looks like: `whatsapp-agent@....iam.gserviceaccount.com`).
   - Permissions: Select **"See all event details"**.
9. Click **Send**.

## Step 3: Update .env
1. Open your `.env` file.
2. Add your **personal Gmail address** as the Calendar ID:
   ```env
   GOOGLE_CALENDAR_ID=your.email@gmail.com
   ```

## Testing
Restart the bot. Send a message to the agent:
> "Are you free at 3pm today?"

The AI should now check your real calendar! 🚀
