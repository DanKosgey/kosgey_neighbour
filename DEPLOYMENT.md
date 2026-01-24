# Deployment Guide - Render Optimized

## 🚀 Render Deployment (Recommended)

This application is optimized for deployment on Render with:
- ✅ Health check endpoints (`/health`, `/ready`)
- ✅ Graceful shutdown handling
- ✅ Database connection retry logic
- ✅ Bulk UPSERT operations for efficiency
- ✅ Single instance session locking

### Quick Deploy with render.yaml

1. **Fork/Clone this repository** to your GitHub account

2. **Create a new Web Service** on Render:
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Render will auto-detect `render.yaml` and configure everything

3. **Set Environment Variables**:
   - `DATABASE_URL` - Your Neon database connection string
   - `OWNER_PHONE_NUMBER` - Your phone number (e.g., 254712345678)
   - `GEMINI_API_KEY1`, `GEMINI_API_KEY2`, etc. - Your Gemini API keys

4. **Deploy** - Render will automatically build and deploy

5. **Monitor Health**:
   - Visit `https://your-app.onrender.com/health` - Should return `{"status":"ok"}`
   - Visit `https://your-app.onrender.com/ready` - Should return `{"status":"ready","database":"connected"}`

### Health Check Endpoints

The application provides two health check endpoints for monitoring:

- **`GET /health`** - Basic liveness check, always returns 200 OK
- **`GET /ready`** - Readiness check, verifies database connectivity

Configure Render to use `/health` as the health check path (already set in `render.yaml`).

## 🚨 CRITICAL: Read Before Deploying

Your WhatsApp agent was experiencing session conflicts because multiple instances were trying to connect with the same credentials. This has been fixed with a session locking mechanism.

## Pre-Deployment Checklist

- [ ] Database migration has been run (see Step 1)
- [ ] Render is configured for **exactly 1 instance**
- [ ] No local development instance is running
- [ ] You have access to Neon database console

## Step-by-Step Deployment

### Step 1: Run Database Migration

**Option A: Using Neon Console (Recommended)**
1. Go to your Neon dashboard: https://console.neon.tech
2. Select your database
3. Click "SQL Editor"
4. Copy and paste this SQL:

\`\`\`sql
CREATE TABLE IF NOT EXISTS session_lock (
    id SERIAL PRIMARY KEY,
    session_name VARCHAR(100) NOT NULL UNIQUE,
    instance_id TEXT NOT NULL,
    locked_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_lock_name ON session_lock(session_name);
CREATE INDEX IF NOT EXISTS idx_session_lock_expires ON session_lock(expires_at);

-- Clean up any existing locks
DELETE FROM session_lock WHERE expires_at < NOW();
\`\`\`

5. Click "Run" to execute

**Option B: Using psql**
\`\`\`bash
psql $DATABASE_URL -f migrations/001_add_session_lock.sql
\`\`\`

### Step 2: Clear Corrupted Auth Data (REQUIRED)

Since you're experiencing decryption errors, you MUST clear the corrupted auth data:

**Option A: Using Neon Console**
\`\`\`sql
DELETE FROM auth_credentials;
DELETE FROM session_lock;
\`\`\`

**Option B: Using the script (if running locally)**
\`\`\`bash
npm run clear-auth
\`\`\`

⚠️ **Note**: This will log you out of WhatsApp. You'll need to scan a new QR code.

### Step 3: Configure Render

1. Go to your Render dashboard
2. Select your WhatsApp agent service
3. Click "Settings"
4. Under "Scaling":
   - Set **Instance Count** to `1` (CRITICAL!)
   - Save changes

### Step 4: Deploy Code

\`\`\`bash
# Commit all changes
git add .
git commit -m "fix: Add session locking to prevent conflicts"

# Push to trigger deployment
git push
\`\`\`

### Step 5: Monitor Deployment

1. Go to Render dashboard → Your service → "Logs"
2. Watch for these messages:

**✅ Success indicators:**
\`\`\`
🔒 Attempting to acquire session lock...
✅ Session lock acquired. Proceeding with connection...
📌 Scan the QR Code below to connect:
\`\`\`

**❌ Error indicators:**
\`\`\`
❌ Could not acquire session lock
❌ Session conflict detected
❌ Decryption error detected
\`\`\`

### Step 6: Scan QR Code

Since we cleared the auth data, you'll need to connect again:

1. Watch the Render logs for the QR code
2. Open WhatsApp on your phone
3. Go to Settings → Linked Devices → Link a Device
4. Scan the QR code from the logs

**Note**: The QR code in terminal logs might be hard to read. Consider:
- Using the web UI at `https://your-app.onrender.com` (if you have one)
- Taking a screenshot of the logs and zooming in
- Using a QR code reader app to scan from your screen

### Step 7: Verify Connection

Once connected, check the logs for:
\`\`\`
✅ Representative Online!
👁️ Presence set to: Online
🔄 Session lock refreshed
\`\`\`

## Troubleshooting

### Problem: "Could not acquire session lock"

**Cause**: Another instance is running or lock is orphaned

**Solution**:
1. Check Render: Ensure only 1 instance is running
2. Wait 5 minutes for auto-expiry
3. Or manually clear: `DELETE FROM session_lock;`

### Problem: "Decryption error detected"

**Cause**: Auth data is still corrupted

**Solution**:
\`\`\`sql
DELETE FROM auth_credentials;
DELETE FROM session_lock;
\`\`\`
Then restart the service in Render.

### Problem: "Session conflict detected (440: replaced)"

**Cause**: Multiple instances are running

**Solution**:
1. Verify Render instance count is `1`
2. Check if you have a local dev instance running
3. Check if you have multiple Render services for the same app

### Problem: QR code not appearing

**Cause**: App is trying to use old credentials

**Solution**:
\`\`\`sql
DELETE FROM auth_credentials;
\`\`\`
Then restart.

### Problem: Connection keeps dropping

**Cause**: Network issues or rate limiting

**Solution**:
- Check Render logs for specific errors
- Verify your Gemini API keys are valid
- Check if you're hitting rate limits

## Post-Deployment Verification

Run these checks after deployment:

1. **Check logs**: No error messages for 5+ minutes
2. **Send test message**: Message yourself from another number
3. **Check response**: Agent should respond appropriately
4. **Monitor lock refresh**: Should see "🔄 Session lock refreshed" every 2 minutes

## Rollback Plan

If something goes wrong:

1. **Stop the service** in Render
2. **Clear locks**: `DELETE FROM session_lock;`
3. **Revert code**:
   \`\`\`bash
   git revert HEAD
   git push
   \`\`\`
4. **Clear auth again**: `DELETE FROM auth_credentials;`
5. **Restart and scan new QR**

## Monitoring

Set up monitoring for:
- **Session lock age**: Should refresh every 2 minutes
- **Connection status**: Should stay "CONNECTED"
- **Error rate**: Should be near zero
- **Response time**: Should be consistent

## Next Steps

After successful deployment:

1. **Test thoroughly**: Send various types of messages
2. **Monitor for 24 hours**: Watch for any issues
3. **Document any issues**: Report in logs
4. **Consider backup**: Set up regular contact data backups

## Web Control Panel

The deployed application includes a web dashboard for easier management:

1.  **Access**: Open `https://your-app-name.onrender.com`
2.  **Dashboard**: View message stats and recent activity feed.
3.  **Chats**: View conversation history.
4.  **Disconnect**: Go to **Settings > Danger Zone** to disconnect and reset the session. This is useful if the connection gets stuck or you want to pair a different device.

## Support

If you encounter issues not covered here:

1. Check `docs/SESSION_CONFLICT_FIX.md` for detailed technical info
2. Review Render logs for specific error messages
3. Check Neon database for orphaned locks or corrupted data
4. Verify environment variables are set correctly

## Important Reminders

- ✅ **Always use 1 instance** in production
- ✅ **Don't run local dev** while production is running
- ✅ **Monitor logs regularly** for early warnings
- ✅ **Keep auth data clean** - clear when corrupted
- ✅ **Session locks auto-expire** after 5 minutes
