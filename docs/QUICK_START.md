# 🚀 Quick Start Guide - After Rate Limit Fix

## ✅ What Was Fixed

Your WhatsApp AI agent was hitting rate limits because:
1. **Multiple simultaneous API requests** were being made
2. **No spacing between requests** (Gemini free tier: 2 RPM = 1 request/30s)
3. **Retry storm** - when one key hit limit, it instantly tried all other keys

## 🔧 Changes Made

1. **Global Request Queue**: Only one API call at a time
2. **3-second spacing**: Between all requests
3. **2-second delay**: When switching API keys
4. **5-second delay**: Before profiling calls

## 📝 How to Test

### 1. Restart Your Dev Server

**Stop the current server** (in your terminal, press `Ctrl+C`)

Then restart:
```bash
npm run dev
```

### 2. Watch the Logs

You should now see:
- ✅ **Slower, controlled requests** (not rapid-fire)
- ✅ **No "ALL_KEYS_EXHAUSTED" errors**
- ✅ **Successful responses** without hitting limits

### 3. Test with a Message

Send a test message from WhatsApp. You should see:
```
📥 Incoming: 128724850720810@lid ("test message")
⏳ Buffering message... (10s wait)
🚀 Processing batch...
🤖 AI Processing Batch...
✅ Response sent
[5 second delay]
📝 Updating profile...
```

## 📊 Expected Performance

- **Response time**: 3-8 seconds per message (includes queue wait)
- **Max throughput**: ~10-15 messages/minute
- **No rate limit errors** under normal usage

## ⚠️ If You Still Hit Limits

### Option 1: Disable Profiling for Low-Trust Contacts
Edit `src/core/whatsapp.ts`, line 385:
```typescript
// Only profile high-trust contacts
if (!ownerService.isOwner(remoteJid) && !rateLimitManager.isLimited() && contact.trustLevel > 3) {
  this.runProfiling(history.concat(`Them: ${userText}`, `Me: ${finalResponse}`), contact);
}
```

### Option 2: Increase Request Spacing
Edit `src/services/ai/gemini.ts`, line 9:
```typescript
const MIN_REQUEST_SPACING_MS = 5000; // Increase from 3000 to 5000
```

### Option 3: Upgrade to Gemini Pro
- Higher rate limits (60 RPM vs 2 RPM)
- Costs money but eliminates rate limit issues
- Update your API keys in `.env`

## 🎯 Monitoring

Watch for these log messages:

### ✅ Good Signs:
```
🤖 AI Processing Batch...
✅ Response sent
📝 Updating profile...
```

### ⚠️ Warning Signs:
```
⚠️ Key ending in ...cNEc hit Rate Limit (429)
⏸️ Rate limited. Queueing messages...
```

### ❌ Bad Signs (should not happen now):
```
🛑 Key marked limited (repeated rapidly)
❌ ALL_KEYS_EXHAUSTED
```

## 📚 Additional Resources

- **Full explanation**: See `docs/RATE_LIMIT_FIX.md`
- **Web UI**: Access at `http://localhost:3000`
- **API endpoints**: See `docs/WEB_UI.md`

## 🆘 Troubleshooting

### Issue: Still getting rate limits
**Solution**: Increase `MIN_REQUEST_SPACING_MS` to 5000 or 10000

### Issue: Responses too slow
**Solution**: This is expected with free tier. Upgrade to Pro or disable profiling.

### Issue: Messages not being processed
**Solution**: Check if all 3 API keys are valid in your `.env` file

---

**Ready to test!** Restart your server and send a test message. 🎉
