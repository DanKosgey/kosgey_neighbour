# 🚀 Quick Fix Guide - Session Conflicts

## The Problem
Your WhatsApp agent keeps crashing with:
- `Error: Unsupported state or unable to authenticate data`
- `conflict: replaced` (440 error)
- Rapid reconnection loops

## The Cause
Multiple instances trying to use the same WhatsApp session simultaneously.

## The Fix (3 Steps)

### 1️⃣ Run This SQL in Neon Console
\`\`\`sql
-- Create session lock table
CREATE TABLE IF NOT EXISTS session_lock (
    id SERIAL PRIMARY KEY,
    session_name VARCHAR(100) NOT NULL UNIQUE,
    instance_id TEXT NOT NULL,
    locked_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_session_lock_name ON session_lock(session_name);
CREATE INDEX IF NOT EXISTS idx_session_lock_expires ON session_lock(expires_at);

-- Clear corrupted data
DELETE FROM auth_credentials;
DELETE FROM session_lock;
\`\`\`

### 2️⃣ Set Render to 1 Instance
- Render Dashboard → Your Service → Settings → Scaling
- Set **Instance Count** to `1`
- Save

### 3️⃣ Deploy
\`\`\`bash
git add .
git commit -m "fix: Add session locking"
git push
\`\`\`

## What to Watch For

### ✅ Good Signs (in Render logs)
\`\`\`
✅ Session lock acquired
✅ Representative Online!
🔄 Session lock refreshed
\`\`\`

### ❌ Bad Signs
\`\`\`
❌ Could not acquire session lock → Check instance count
❌ Session conflict detected → Multiple instances running
❌ Decryption error → Run: DELETE FROM auth_credentials;
\`\`\`

## Emergency Commands

### Clear Everything and Start Fresh
\`\`\`sql
DELETE FROM auth_credentials;
DELETE FROM session_lock;
\`\`\`
Then restart Render service and scan new QR code.

### Check Lock Status
\`\`\`sql
SELECT * FROM session_lock;
\`\`\`

### Force Release Lock
\`\`\`sql
DELETE FROM session_lock WHERE session_name = 'whatsapp_session';
\`\`\`

## After Deployment
1. Watch Render logs for QR code
2. Scan QR with WhatsApp
3. Verify "Representative Online!" message
4. Send test message to yourself

## Need More Help?
- Full docs: `docs/SESSION_CONFLICT_FIX.md`
- Deployment guide: `DEPLOYMENT.md`
