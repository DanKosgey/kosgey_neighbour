# Session Conflict Fix

## Problem
The WhatsApp agent was experiencing session conflicts and decryption errors when deployed to Render. This was caused by:

1. **Multiple instances** trying to connect with the same WhatsApp credentials
2. **Corrupted encryption keys** in the database
3. **No session locking mechanism** to prevent conflicts

## Solution Implemented

### 1. Session Locking System
- Added `session_lock` table to database
- Created `SessionManager` service that:
  - Acquires a lock before connecting to WhatsApp
  - Prevents multiple instances from connecting simultaneously
  - Auto-expires locks after 5 minutes (in case of crashes)
  - Refreshes lock every 2 minutes while active

### 2. Improved Error Handling
- Detects **440 conflict errors** (session replaced by another instance)
- Detects **decryption errors** (corrupted encryption keys)
- Detects **405 errors** (invalid session data)
- Automatically releases lock and exits on fatal errors

### 3. Graceful Shutdown
- Properly releases session lock on SIGINT/SIGTERM
- Prevents orphaned locks that could block future connections

## Deployment Steps

### Step 1: Run Database Migration
Execute the migration to create the `session_lock` table:

\`\`\`bash
# Connect to your Neon database and run:
psql $DATABASE_URL -f migrations/001_add_session_lock.sql
\`\`\`

Or manually execute in Neon console:
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
\`\`\`

### Step 2: Clear Corrupted Auth Data (If Needed)
If you're currently experiencing decryption errors:

\`\`\`bash
npm run clear-auth
# or
npx ts-node scripts/clear-auth.ts
\`\`\`

This will:
- Clear all auth credentials
- Clear session locks
- Force a fresh QR code scan on next startup

### Step 3: Deploy to Render
\`\`\`bash
git add .
git commit -m "Fix: Add session locking to prevent conflicts"
git push
\`\`\`

### Step 4: Configure Render
In your Render dashboard:

1. **Set Instance Count to 1**
   - Go to your service settings
   - Under "Scaling", ensure you have exactly **1 instance**
   - Multiple instances will conflict even with session locking

2. **Add Health Check** (Optional but recommended)
   - Health Check Path: `/api/status`
   - This helps Render know when your app is ready

## How It Works

### Before (Problem)
\`\`\`
Instance A connects → WhatsApp Session Active
Render restarts → Instance B starts
Instance B connects → WhatsApp kicks Instance A (440 conflict)
Instance A tries to reconnect → Conflict loop
Decryption errors occur due to concurrent access
\`\`\`

### After (Solution)
\`\`\`
Instance A starts → Acquires session lock → Connects to WhatsApp
Render tries to start Instance B → Cannot acquire lock → Waits or exits
Instance A maintains lock (refreshes every 2 minutes)
On shutdown → Instance A releases lock → Instance B can now connect
\`\`\`

## Troubleshooting

### "Could not acquire session lock"
**Cause**: Another instance is running or a lock is orphaned

**Solutions**:
1. Wait 5 minutes for the lock to auto-expire
2. Manually clear locks:
   \`\`\`sql
   DELETE FROM session_lock;
   \`\`\`
3. Check Render logs to see if another instance is running

### "Decryption error detected"
**Cause**: Encryption keys are corrupted

**Solution**:
\`\`\`bash
npm run clear-auth
\`\`\`
Then restart and scan the new QR code.

### "Session conflict detected (440: replaced)"
**Cause**: Another instance connected with the same credentials

**Solution**:
- The app will automatically exit and release the lock
- Check that you only have **1 instance** configured in Render
- Ensure no local development instance is running

### Logs show rapid reconnection attempts
**Cause**: Flapping connection (connects and disconnects quickly)

**Solution**:
- The app now detects this and escalates backoff delays
- If it persists, run `npm run clear-auth` to reset credentials

## Monitoring

Check your Render logs for these key messages:

✅ **Good signs**:
- `✅ Session lock acquired`
- `✅ Representative Online!`
- `🔄 Session lock refreshed` (every 2 minutes)

❌ **Warning signs**:
- `❌ Could not acquire session lock` (another instance running)
- `❌ Session conflict detected` (multiple instances)
- `❌ Decryption error detected` (corrupted keys)

## Prevention

1. **Always use 1 instance** in production
2. **Don't run local dev** while production is running (they'll conflict)
3. **Monitor logs** for early warning signs
4. **Keep backups** of your contact data (not auth credentials)

## Files Modified

- `src/database/schema.ts` - Added `session_lock` table
- `src/services/sessionManager.ts` - New session locking service
- `src/core/whatsapp.ts` - Added session lock acquisition and conflict handling
- `src/index.ts` - Added graceful shutdown with lock release
- `scripts/clear-auth.ts` - Updated to clear session locks
- `migrations/001_add_session_lock.sql` - Database migration

## Additional Notes

- Session locks auto-expire after **5 minutes** to prevent deadlocks
- Locks are refreshed every **2 minutes** while the instance is running
- Each instance has a unique UUID to identify it in logs
- The system will wait up to **30 seconds** for a lock before giving up
