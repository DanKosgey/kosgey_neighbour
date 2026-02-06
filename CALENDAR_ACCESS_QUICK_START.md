# Calendar Access Control - Quick Start Guide

## Instant Summary

You've implemented a permissions-based calendar access control system where the agent's calendar tools can be toggled on/off.

**Key Features:**
- ✅ Global calendar access toggle (enable/disable)
- ✅ Tools hidden from model when access is disabled
- ✅ Graceful error messages when disabled
- ✅ Owner-only control commands
- ✅ System prompt integration showing status

## Quick Test (60 seconds)

### 1. Check Current Status
```
Type to agent: "what's my calendar access status"
Expected: "📅 Calendar Access Status: ✅ ENABLED"
```

### 2. Disable Calendar Access
```
Type to agent: "disable calendar access"
Expected: "🔒 Calendar access has been DISABLED..."
```

### 3. Test Graceful Response
```
Type to agent: "can you check if monday works for a meeting"
Expected: "I'm currently unable to access calendar functions..."
```

### 4. Re-enable Calendar Access
```
Type to agent: "enable calendar access"
Expected: "✅ Calendar access has been ENABLED..."
```

## How It Works

### Before (Without Control)
- Calendar tools always available
- No way to prevent scheduling
- Customers can always request meetings

### After (With Control)
```
┌─ Calendar Access: ENABLED ──────┐
│                                  │
│  ✅ check_availability           │
│  ✅ schedule_meeting             │
│  ✅ check_schedule               │
│                                  │
│  Full scheduling features        │
└──────────────────────────────────┘

         ↓ (run: disable calendar access)

┌─ Calendar Access: DISABLED ─────┐
│                                  │
│  ❌ check_availability (hidden)  │
│  ❌ schedule_meeting (hidden)    │
│  ❌ check_schedule (hidden)      │
│                                  │
│  Graceful error messages given   │
└──────────────────────────────────┘
```

## Owner Commands

### Command 1: Enable Calendar
```
Type: "enable calendar access"
Response: ✅ Calendar access has been ENABLED.
Actions:
- check_availability tool added
- schedule_meeting tool added
- check_schedule tool added
```

### Command 2: Disable Calendar
```
Type: "disable calendar access"
Response: 🔒 Calendar access has been DISABLED.
Actions:
- check_availability tool removed
- schedule_meeting tool removed  
- check_schedule tool removed
- Agent cannot suggest calendar features
```

### Command 3: Check Status
```
Type: "get calendar access status" or "what's my calendar status"
Response: Current permission status (ENABLED or DISABLED)
```

## What Changes Happen Behind-the-Scenes

### 1. Database
```
system_settings table:
Key: 'calendar_access_enabled'
Value: 'true' (enabled) or 'false' (disabled)
```

### 2. Tool Availability
```
When disabled:
- getFilteredTools() removes calendar tools from toolset
- Model never sees calendar-related functions
- Model can't suggest scheduling features
```

### 3. System Prompt
```
Agent receives:
=== PERMISSIONS STATUS ===
calendar_access: true/false

If false, includes:
"⚠️ CRITICAL: Calendar access is currently DISABLED. 
If the user asks to check availability, schedule meetings, 
or do anything calendar-related, you MUST politely inform them..."
```

### 4. Runtime Protection
```
If calendar tool somehow called:
- executeLocalTool() checks permission first
- Returns: "Calendar access is currently disabled..."
- No function call is executed
```

## Practical Use Cases

### Use Case 1: Server Maintenance
```
During maintenance window:
1. Owner: "disable calendar access"
2. Customers cannot book meetings
3. Agent: "Calendar features temporarily unavailable"
4. After maintenance: "enable calendar access"
```

### Use Case 2: Vacation Mode
```
Owner going on vacation:
1. Disable calendar access before leaving
2. Customers see: "Cannot schedule at this time"
3. Owner returns and enables access
```

### Use Case 3: Testing
```
Testing new features:
1. Disable calendar access
2. Test other functionality
3. Re-enable when ready for production
```

### Use Case 4: Tiered Access Control
```
Future: Combine with role-based access:
- Customers: No direct calendar access
- Staff: View-only calendar
- Owner: Full control
```

## Files Modified

| File | Changes | Lines |
|------|---------|-------|
| `src/services/systemSettings.ts` | Added 3 methods | +30 |
| `src/services/ai/tools.ts` | Added filtering + 3 tools | +60 |
| `src/services/ai/gemini.ts` | Updated prompt building | +15 |
| `src/services/ai/ownerTools.ts` | Added 3 functions | +45 |
| **Total** | **Code additions** | **~150 lines** |

## Architecture

```
┌─────────────────────────────────────────┐
│         Owner Types Command              │
│   "disable calendar access"              │
└────────────────┬────────────────────────┘
                 │
                 ↓
        ┌────────────────────┐
        │  execute tool()    │
        │  disable_calendar  │
        │  _access           │
        └────────┬───────────┘
                 │
                 ↓
        ┌────────────────────┐
        │ Update System      │
        │ Settings:          │
        │ calendar_access    │
        │ = 'false'          │
        └────────┬───────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ↓                         ↓
┌─────────────────┐  ┌──────────────────┐
│ Next request:   │  │ System Prompt    │
│                 │  │ Updated with:    │
│ getFiltered     │  │ calendar_access: │
│ Tools()         │  │ false            │
│ removes:        │  │                  │
│ • check_avail   │  │ Agent told to    │
│ • schedule_mtg  │  │ decline requests │
│ • check_sched   │  │                  │
└─────────────────┘  └──────────────────┘
```

## Testing Checklist

- [ ] Database contains `calendar_access_enabled` key
- [ ] Owner can run "enable calendar access" command
- [ ] Owner can run "disable calendar access" command
- [ ] Owner can check current status
- [ ] Calendar tools available when enabled
- [ ] Calendar tools NOT available when disabled
- [ ] Customer receives graceful message when calendar disabled
- [ ] System prompt shows correct permission status
- [ ] No TypeScript compilation errors

## FAQ

### Q: Can customers disable calendar access?
**A:** No. Only the owner can run enable/disable commands. The system checks `isOwner` flag.

### Q: What happens if calendar tool is called directly?
**A:** Two-layer protection:
1. Tool filtering (tool doesn't appear in toolset)
2. Runtime check (if somehow called, returns error)

### Q: Do I need to restart the server?
**A:** No. Settings are cached but updated on every request, so changes take effect immediately.

### Q: Can I set time-based access?
**A:** Not yet. This is a global toggle. Future versions could add scheduled access control.

### Q: What about existing scheduled meetings?
**A:** Disabling calendar doesn't delete meetings. It just prevents NEW schedules and prevents viewing.

### Q: Is there an audit log?
**A:** Not yet. Current implementation stores setting in `system_settings` table.

### Q: Can different users have different permissions?
**A:** Currently: No (global toggle). Future version could add per-user permissions.

### Q: What if I accidentally disable calendar access?
**A:** Simply run "enable calendar access" command to restore it immediately.

## Troubleshooting

### Issue: Calendar tools still showing when disabled
```
Check: 
1. Is calendar_access_enabled = 'false' in database?
2. Clear browser cache
3. Restart server
4. Check application logs for filtering messages
```

### Issue: Owner can't run enable/disable commands
```
Check:
1. Are you chatting as the owner user?
2. Is isOwner flag set correctly?
3. Check logs: "OWNER ONLY: ..." messages
```

### Issue: Agent not showing permission messages
```
Check:
1. System prompt injection working?
2. Review logs for "PERMISSIONS STATUS" section
3. Verify gemini.ts updated with calendar status
```

### Issue: "Calendar access disabled" error before disabled
```
Check:
1. Did disableCalendarAccess() complete?
2. Verify database transaction succeeded
3. Check for race conditions if multiple requests
```

## Next Steps

### Recommended Actions
1. ✅ Test the feature with above Quick Test
2. ✅ Verify database shows `calendar_access_enabled` setting
3. ✅ Build and deploy the updated code
4. ✅ Document the feature for team
5. ✅ Update user documentation/help pages

### Future Enhancements
- Per-user/role-based permissions
- Schedule-based access (e.g., disable nights/weekends)
- Audit logging for all access changes
- User notifications when access denied
- Integration with calendar provider settings

## Support

Full technical documentation: `docs/CALENDAR_ACCESS_CONTROL.md`

Contains:
- Architecture deep-dive
- API reference
- Implementation details
- Security considerations
- Testing strategies
