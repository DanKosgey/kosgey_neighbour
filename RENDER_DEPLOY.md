# Render Deployment Quick Start

## Prerequisites
- GitHub repository with this code
- Neon database (https://console.neon.tech)
- Gemini API keys (https://makersuite.google.com/app/apikey)

## Deploy to Render

### Option 1: Using render.yaml (Recommended)

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Optimize for Render deployment"
   git push
   ```

2. **Create Render Service**
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Render will detect `render.yaml` automatically
   - Click "Apply"

3. **Set Environment Variables** in Render dashboard:
   ```
   - `DATABASE_URL` - Your Neon database connection string
   - `OWNER_PHONE_NUMBER` - Your phone number (e.g., 254712345678)
   - `OWNER_LID` - Your WhatsApp Account ID (LID) for explicit identity recognition (e.g. `128724850720810`)
   - `GEMINI_API_KEY1` - Your first Gemini API key
   - `GEMINI_API_KEY2` - Your second Gemini API key (optional, for rate limiting)
   - `GEMINI_API_KEY3` - Your third Gemini API key (optional, for rate limiting)
   ```

4. **Deploy** - Render will build and start your service

### Option 2: Manual Setup

1. Create a new Web Service on Render
2. Configure:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/health`
   - **Instance Count**: `1` (CRITICAL!)
3. Add environment variables (same as above)
4. Deploy

## Post-Deployment

### 1. Run Database Migration

In Neon SQL Editor, run:
```sql
CREATE TABLE IF NOT EXISTS session_lock (
    id SERIAL PRIMARY KEY,
    session_name VARCHAR(100) NOT NULL UNIQUE,
    instance_id TEXT NOT NULL,
    locked_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_lock_name ON session_lock(session_name);
CREATE INDEX IF NOT EXISTS idx_session_lock_expires ON session_lock(expires_at);
```

### 2. Verify Health

Visit these URLs (replace with your Render URL):
- `https://your-app.onrender.com/health` → `{"status":"ok"}`
- `https://your-app.onrender.com/ready` → `{"status":"ready","database":"connected"}`

### 3. Connect WhatsApp

1. Check Render logs for QR code
2. Scan with WhatsApp: Settings → Linked Devices → Link a Device
3. Wait for "✅ Representative Online!" message

## Monitoring

### Health Checks
Render automatically monitors `/health` endpoint. If it fails, Render will restart the service.

### Logs
View real-time logs in Render dashboard → Your Service → Logs

### Key Metrics to Watch
- ✅ No "fetch failed" database errors
- ✅ "🔄 Session lock refreshed" every 1 minute
- ✅ WhatsApp connection stays "CONNECTED"
- ✅ Auth state writes complete without errors

## Troubleshooting

### Database Connection Errors
**Symptom**: `Error connecting to database: fetch failed`

**Solution**:
1. Verify `DATABASE_URL` is correct in Render environment variables
2. Check Neon database is active (not paused)
3. Verify SSL mode is `require` in connection string
4. Check Render logs for specific error details

### QR Code Not Appearing
**Symptom**: No QR code in logs after deployment

**Solution**:
```sql
-- Clear auth data in Neon console
DELETE FROM auth_credentials;
DELETE FROM session_lock;
```
Then restart service in Render.

### Session Conflicts
**Symptom**: `Error: conflict: replaced` or status code 440

**Solution**:
1. Verify Render instance count is `1`
2. Stop any local development instances
3. Clear session lock:
   ```sql
   DELETE FROM session_lock;
   ```

### Service Won't Start
**Symptom**: Build succeeds but service crashes

**Solution**:
1. Check Render logs for error messages
2. Verify all environment variables are set
3. Test database connection:
   ```bash
   # In Render shell
   node -e "require('./dist/database/index.js').testConnection()"
   ```

## Optimization Tips

### 1. Free Tier Limitations
Render free tier spins down after 15 minutes of inactivity. Consider:
- Upgrading to paid tier for 24/7 availability
- Using a cron job to ping `/health` every 10 minutes

### 2. Database Connection
- Connection timeout is set to 30 seconds
- Retry logic handles transient failures
- Bulk UPSERT reduces database calls by ~90%

### 3. Scaling
- **DO NOT** scale beyond 1 instance (WhatsApp session conflict)
- For high load, optimize message processing instead

## Support

For detailed troubleshooting, see:
- `DEPLOYMENT.md` - Full deployment guide
- `docs/SESSION_CONFLICT_FIX.md` - Session management details
- Render logs - Real-time error messages
