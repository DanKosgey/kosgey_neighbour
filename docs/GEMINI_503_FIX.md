# Gemini 503 Service Unavailable Fix

## 🐛 Problem
```
Gemini Generate Error: [503 Service Unavailable] The model is overloaded. Please try again later.
```
- **Cause**: Google Gemini API overload (transient error).
- **Previous Behavior**: Bot treated it like a fatal error or generic rate limit (switching keys wouldn't help if the service itself is down/overloaded).
- **Result**: Failed responses when the API was busy.

## ✅ Solution Implemented
Implemented **Exponential Backoff Retry Strategy** specifically for 503 errors.

### Mechanism
1.  **Detection**: Updated `_isRateLimitError` to catch status code `503` and message "overloaded".
2.  **Handling**:
    - If error is `503`: **Wait** (Backoff). Do **NOT** switch keys (since it's a global service issue, not a key issue).
    - Backoff time: `MIN_REQUEST_SPACING_MS * 2` (defaults to 6 seconds).
    - If error is `429` (Rate Limit): **Switch Keys** immediately.

### Code Changes
- Modified `src/services/ai/gemini.ts`
- Updated `_isRateLimitError` detection logic.
- Updated `_handleOperationError` to distinguish between 429 and 503.

## 🚀 Deployment
- **Status**: Deployed to main.
- **Commit**: `16c0dfa`

## 📊 Expected Impact
- **Resilience**: Bot will now patiently wait and retry when Google's servers are overloaded.
- **Reliability**: Fewer dropped messages during peak times.
