# Calendar Access Control - Implementation Summary

## Overview
Implemented a permissions-based calendar access control system that allows users to enable/disable the agent's calendar scheduling capabilities with a single toggle.

## What Was Implemented

### ✅ Core Features

1. **Global Calendar Access Toggle**
   - Stored in `system_settings` table with key `calendar_access_enabled`
   - Default: `true` (calendar access enabled)
   - Can be toggled on/off by owner

2. **Dynamic Tool Filtering**
   - Calendar tools are programmatically hidden when access is disabled
   - Tools removed: `check_schedule`, `check_availability`, `schedule_meeting`
   - Other tools remain unaffected

3. **System Prompt Integration**
   - Calendar access status injected into system prompt
   - When disabled, agent receives explicit instructions to decline calendar requests
   - Format: `calendar_access: true/false`

4. **Graceful Degradation**
   - If calendar tools are called without access, proper error messages returned
   - Agent informs users that permissions are disabled
   - No silent failures

5. **Owner Control Tools**
   - `enable_calendar_access` - Re-enable calendar features
   - `disable_calendar_access` - Disable calendar features
   - `get_calendar_access_status` - Check current status
   - All owner-only (requires `isOwner` flag)

## Files Modified

### 1. `src/services/systemSettings.ts`
**Changes:**
- Added import for systemSettingsService (self-reference for exports)
- Added 3 new methods:
  - `isCalendarAccessEnabled()` - Get current status
  - `enableCalendarAccess()` - Enable calendar tools
  - `disableCalendarAccess()` - Disable calendar tools

### 2. `src/services/ai/tools.ts`
**Changes:**
- Added import: `import { systemSettingsService } from '../systemSettings';`
- Added new export: `getFilteredTools(calendarAccessEnabled?: boolean)`
  - Dynamically filters tools based on permissions
  - Returns full tool array if calendar access enabled
  - Returns filtered array without calendar tools if disabled
- Added 3 new tool declarations in `AI_TOOLS`:
  - `enable_calendar_access`
  - `disable_calendar_access`
  - `get_calendar_access_status`
- Added runtime permission check in `executeLocalTool()`:
  - Checks if calendar tools are called without access
  - Returns proper error message if access denied
- Added 3 new cases in tool execution switch:
  - `'enable_calendar_access'`
  - `'disable_calendar_access'`
  - `'get_calendar_access_status'`

### 3. `src/services/ai/gemini.ts`
**Changes:**
- Updated imports:
  - Changed: `import { AI_TOOLS } from './tools';`
  - To: `import { AI_TOOLS, getFilteredTools } from './tools';`
  - Added: `import { systemSettingsService } from '../systemSettings';`
- Modified `generateReply()` method:
  - Gets calendar access status from system settings
  - Passes status to `_buildSystemPrompt()`
  - Gets filtered tools via `getFilteredTools()`
  - Passes filtered tools to Gemini model
- Updated `_buildSystemPrompt()` signature:
  - Added parameter: `calendarAccessEnabled?: boolean`
  - Injects permission status into system prompt
  - Adds warning instructions when calendar access is disabled

### 4. `src/services/ai/ownerTools.ts`
**Changes:**
- Added import: `import { systemSettingsService } from '../systemSettings';`
- Added 3 new async functions:
  - `enableCalendarAccess()` - Enables calendar access
  - `disableCalendarAccess()` - Disables calendar access
  - `getCalendarAccessStatus()` - Returns current status

## How It Works

### Enable/Disable Flow

```
Owner: "disable calendar access"
  ↓
AI recognizes owner command
  ↓
Calls disableCalendarAccess() tool
  ↓
System updates setting: calendar_access_enabled = 'false'
  ↓
Next request:
  - getFilteredTools() removes calendar tools
  - System prompt includes: calendar_access: false
  - Agent receives instructions to decline calendar requests
```

### Permission Enforcement (2 Layers)

**Layer 1: Tool Filtering**
- `getFilteredTools()` removes calendar tools before model sees them
- Model never suggests calendar tools

**Layer 2: Runtime Guard**
- If somehow calendar tool is called, `executeLocalTool()` checks permission
- Returns error: "Calendar access is currently disabled..."

### Graceful User Response

When calendar access is disabled and user requests scheduling:
```
User: "Can you check if Monday works?"
Agent: "I'm currently unable to access calendar functions. 
        Calendar permissions have been disabled. Please ask the 
        owner to re-enable calendar access before I can help with scheduling."
```

## Database Changes

### System Settings Table
```sql
INSERT INTO system_settings (key, value, description, updated_at)
VALUES (
  'calendar_access_enabled',
  'true',
  'Global toggle for calendar scheduling tools',
  NOW()
)
```

**Default state:** Calendar access is ENABLED

To disable, owner runs the tool or manual SQL:
```sql
UPDATE system_settings 
SET value = 'false' 
WHERE key = 'calendar_access_enabled';
```

## Usage Examples

### For Owner (Type in Chat)

**Enable calendar access:**
```
Owner: enable calendar access
Agent: ✅ Calendar access has been ENABLED.
       The agent can now:
       - Check your calendar availability
       - View your schedule
       - Book meetings
```

**Disable calendar access:**
```
Owner: disable calendar access
Agent: 🔒 Calendar access has been DISABLED.
       The agent can NO LONGER:
       - Check your calendar availability
       - View your schedule
       - Book meetings
```

**Check status:**
```
Owner: what's my calendar access status
Agent: 📅 Calendar Access Status: ✅ ENABLED
       The database currently has calendar access set to: enabled.
```

### For Customers (When Disabled)

**Request scheduling:**
```
Customer: Can we schedule a call?
Agent: I'm currently unable to access calendar functions. 
       Calendar permissions have been disabled. Please ask 
       the owner to re-enable calendar access before I can 
       help with scheduling.
```

## Verification Steps

### 1. Check System Settings Table
```sql
SELECT * FROM system_settings 
WHERE key = 'calendar_access_enabled';
```
Expected: Row with value='true' (or 'false' if disabled)

### 2. Test Calendar Tools Available
- Start agent with calendar access enabled
- Send message requesting meeting
- Verify calendar tools are suggested by model

### 3. Test Calendar Tools Hidden
- Call `disableCalendarAccess()`
- Verify `calendar_access_enabled` = 'false' in database
- Send message requesting meeting
- Verify calendar tools are NOT suggested (graceful error instead)

### 4. Test System Prompt Injection
- Check logs for system prompt
- Verify includes: `calendar_access: false` (when disabled)
- Verify includes warning text about disabled access

### 5. Test Tool Filtering
- Call `getFilteredTools(false)`
- Verify returned tools don't include calendar tools
- Call `getFilteredTools(true)`
- Verify returned tools include all calendar tools

### 6. Test Owner Commands
As owner:
```
/enable_calendar_access
/disable_calendar_access
/get_calendar_access_status
```

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    User Message                          │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ↓
        ┌──────────────────────────────┐
        │  GeminiService.generateReply │
        │  1. Check calendar_access    │
        │  2. Build system prompt      │
        │  3. Get filtered tools       │
        └──────────────────┬───────────┘
                           │
                ┌──────────┴─────────┐
                │                    │
                ↓                    ↓
    ┌───────────────────┐   ┌──────────────────┐
    │ systemSettings    │   │ getFilteredTools │
    │ Service           │   │                  │
    │ (Check Status)    │   │ (Remove Calendar │
    │                   │   │  tools if needed)│
    └────────┬──────────┘   └────────┬─────────┘
             │                       │
             └───────────┬───────────┘
                         │
                         ↓
        ┌────────────────────────────┐
        │  Genai.generateContent()   │
        │  (With filtered tools)     │
        └────────────┬───────────────┘
                     │
                     ↓
        ┌────────────────────────────┐
        │  Function Call Detected    │
        │  │                         │
        │  ├─ executeLocalTool()     │
        │  │  (Runtime permission    │
        │  │   check for calendar)   │
        │  │                         │
        │  └─ Return result          │
        └────────────┬───────────────┘
                     │
                     ↓
        ┌────────────────────────────┐
        │   Response to User         │
        └────────────────────────────┘
```

## Performance Impact

- **Minimal:** Added one async call to `systemSettingsService.isCalendarAccessEnabled()` per request
- **Caching:** Settings cached in memory by `systemSettingsService`
- **Tool Filtering:** O(n) filter operation on tool array (n ≈ 30 tools)
- **No database queries:** Uses in-memory cache loaded on startup

## Security Notes

1. ✅ **Owner-Only Access:** Calendar control tools require `isOwner` flag
2. ✅ **Double-Checked:** Tool filtering + runtime execution guard
3. ✅ **No Silent Failures:** Returns explicit error or helpful message
4. ✅ **User Communication:** Agent explains why it can't help
5. ✅ **Database Integrity:** Settings use transactional updates

## Future Enhancements

Possible improvements:
- Per-user/per-contact calendar permissions
- Schedule-based access (enable/disable on specific times)
- Audit logging for all calendar access changes
- Separate read-only vs. write permissions
- Integration with customer notification system

## Support & Documentation

Full documentation available in: `docs/CALENDAR_ACCESS_CONTROL.md`

Contains:
- Architecture details
- Component reference
- Usage scenarios
- API reference
- Troubleshooting guide
- Testing checklist
