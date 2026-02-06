# Calendar Access Control System

## Overview

The Calendar Access Control system implements a permissions-based framework that allows users to grant or revoke the agent's ability to access calendar-related functions. When calendar access is disabled, the agent's calendar tools are programmatically hidden from the model's available toolset, and the agent gracefully informs users that scheduling features are temporarily unavailable.

## Architecture

### 1. Core Components

#### A. System Settings Service (`systemSettingsService`)
**File:** `src/services/systemSettings.ts`

New methods added for calendar access management:
- `isCalendarAccessEnabled()` - Get the current calendar access status
- `enableCalendarAccess()` - Enable calendar scheduling tools
- `disableCalendarAccess()` - Disable calendar scheduling tools

```typescript
// Default: calendar access is ENABLED (true)
const enabled = await systemSettingsService.isCalendarAccessEnabled(); // Returns boolean

// Enable calendar access
await systemSettingsService.enableCalendarAccess();

// Disable calendar access
await systemSettingsService.disableCalendarAccess();
```

#### B. Tool Filtering System (`tools.ts`)
**File:** `src/services/ai/tools.ts`

**New Export:** `getFilteredTools(calendarAccessEnabled?: boolean)`

This function dynamically filters the available tools based on permissions:

```typescript
// Get tools based on current system setting
const tools = await getFilteredTools();

// Or explicitly pass the access level
const tools = await getFilteredTools(false); // Filters out calendar tools
```

**Calendar Tools Controlled:**
- `check_schedule` - Legacy schedule checking
- `check_availability` - Check available time slots
- `schedule_meeting` - Book a calendar event

**Tools NOT Filtered:**
- `get_current_time` - Remains available (useful for general context)
- All other agent tools remain unaffected

#### C. Gemini Service Integration (`gemini.ts`)
**File:** `src/services/ai/gemini.ts`

**Modified Method:** `generateReply()`

Changes:
1. Fetches calendar access status from systemSettingsService
2. Passes calendar access status to `_buildSystemPrompt()`
3. Uses `getFilteredTools()` to get permission-aware tool definitions
4. Passes filtered tools to the Gemini model

```typescript
async generateReply(
  history: string[],
  userContext: string,
  isOwner: boolean,
  aiProfile?: AIProfile,
  userProfile?: UserProfile,
  customPrompt?: string
): Promise<GeminiResponse> {
  // Get calendar access status
  const calendarAccessEnabled = await systemSettingsService.isCalendarAccessEnabled();

  // Build system prompt with access status
  const systemPrompt = this._buildSystemPrompt(
    userContext,
    isOwner,
    aiProfile,
    userProfile,
    customPrompt,
    calendarAccessEnabled
  );

  // Get filtered tools
  const availableTools = await getFilteredTools(calendarAccessEnabled);

  // Use filtered tools with model
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    tools: availableTools as any,
  });
}
```

### 2. Permission Enforcement

#### System Prompt Injection
When building the system prompt, the calendar access status is injected:

```
=== PERMISSIONS STATUS ===
calendar_access: true/false
⚠️ CRITICAL: Calendar access is currently DISABLED. If the user asks to check 
availability, schedule meetings, or do anything calendar-related, you MUST politely 
inform them: "I'm currently unable to access calendar functions. Calendar 
permissions have been disabled. Please ask the owner to re-enable calendar access 
before I can help with scheduling."
```

#### Tool Execution Guard
In `executeLocalTool()`, calendar tools are checked at runtime:

```typescript
const calendarToolNames = new Set(['check_schedule', 'check_availability', 'schedule_meeting']);
if (calendarToolNames.has(name)) {
    const calendarAccessEnabled = await systemSettingsService.isCalendarAccessEnabled();
    if (!calendarAccessEnabled) {
        return {
            error: "Calendar access is currently disabled. Please contact the owner 
                   to re-enable calendar permissions before scheduling meetings."
        };
    }
}
```

### 3. Owner Control Tools

**File:** `src/services/ai/ownerTools.ts`

Three new owner-only tools have been added:

#### A. Enable Calendar Access
```typescript
export async function enableCalendarAccess(): Promise<string>
```
- Enables calendar scheduling for all users
- Returns confirmation message
- Available to owner only

**Response Example:**
```
✅ Calendar access has been ENABLED.

The agent can now:
- Check your calendar availability
- View your schedule
- Book meetings

Calendar scheduling tools are now available in the agent's toolset.
```

#### B. Disable Calendar Access
```typescript
export async function disableCalendarAccess(): Promise<string>
```
- Disables calendar scheduling for all users
- Returns confirmation message
- Available to owner only

**Response Example:**
```
🔒 Calendar access has been DISABLED.

The agent can NO LONGER:
- Check your calendar availability
- View your schedule
- Book meetings

Calendar scheduling tools have been revoked from the agent's toolset. 
When customers ask to schedule meetings, the agent will inform them that 
calendar access is currently unavailable.
```

#### C. Get Calendar Access Status
```typescript
export async function getCalendarAccessStatus(): Promise<string>
```
- Retrieves current calendar access status
- Shows whether access is enabled or disabled
- Available to owner only

**Response Example:**
```
📅 Calendar Access Status: ✅ ENABLED

The database currently has calendar access set to: enabled.

Use "enable calendar" or "disable calendar" to change this setting.
```

## Usage Scenarios

### Scenario 1: Disable Calendar Access During Maintenance

```
User: disable calendar access
System: Calls disableCalendarAccess()
Response: 🔒 Calendar access has been DISABLED...
Result: All calendar tools removed from agent's toolset
```

### Scenario 2: Customer Requests Meeting While Access is Disabled

```
Customer: Can you check if Monday at 3pm works for a meeting?
Agent's Response: I'm currently unable to access calendar functions. 
                 Calendar permissions have been disabled. Please ask 
                 the owner to re-enable calendar access before I can 
                 help with scheduling.
```

### Scenario 3: Re-enable Calendar Access

```
User: enable calendar access
System: Calls enableCalendarAccess()
Response: ✅ Calendar access has been ENABLED...
Result: All calendar tools restored to agent's toolset
```

### Scenario 4: Check Current Status

```
User: what's my calendar access status
System: Calls getCalendarAccessStatus()
Response: 📅 Calendar Access Status: ✅ ENABLED...
```

## Database Changes

### System Settings Table
The `system_settings` table stores the calendar access state:

```
Key: 'calendar_access_enabled'
Value: 'true' or 'false'
Description: 'Global toggle for calendar scheduling tools'
Updated At: Timestamp of last change
```

**Default Value:** `'true'` (calendar access enabled by default)

## Implementation Details

### Database Schema
No schema changes needed. The existing `systemSettings` table is used with a new key:
- Key: `calendar_access_enabled`
- Value: String boolean (`'true'` or `'false'`)

### AI Tools Declaration
New tools added to `AI_TOOLS` array:
1. `enable_calendar_access` (Owner Only)
2. `disable_calendar_access` (Owner Only)
3. `get_calendar_access_status` (Owner Only)

### Tool Filtering Logic
```
IF calendar_access_enabled != true:
  REMOVE from available_tools:
    - check_schedule
    - check_availability
    - schedule_meeting
ELSE:
  KEEP all tools
```

### System Prompt Injection
Calendar access status is injected into the system prompt dynamically:
```
=== PERMISSIONS STATUS ===
calendar_access: true/false
```

## Security Considerations

1. **Owner-Only Access:** Calendar control tools are restricted to the owner (checked via `isOwner` flag)
2. **Double-Layered Prevention:** 
   - Layer 1: Tool filtering (tools not presented to model)
   - Layer 2: Tool execution guard (runtime check)
3. **Graceful Degradation:** If tools are somehow called without access, they return proper error messages
4. **User Communication:** Agent informs users of restriction status in plain language

## Testing Checklist

- [ ] Enable calendar access and verify tools are available
- [ ] Disable calendar access and verify tools are removed from toolset
- [ ] Request calendar function while disabled → verify graceful error message
- [ ] Check status command works for owner
- [ ] Verify non-owners cannot call enable/disable commands
- [ ] Verify system prompt includes calendar access status
- [ ] Verify database stores setting correctly
- [ ] Test with existing conversations to ensure compatibility

## Configuration

No configuration needed. The system defaults to:
- **Calendar Access:** ENABLED (`'true'`)
- **Database:** Uses existing `systemSettings` table
- **Access Control:** Owner only

To change the default, modify the return value in `systemSettingsService.isCalendarAccessEnabled()`:
```typescript
async isCalendarAccessEnabled(): Promise<boolean> {
    const val = await this.get('calendar_access_enabled', 'true'); // Change default here
    return val.toLowerCase() === 'true';
}
```

## API Reference

### systemSettingsService

```typescript
// Get calendar access status
const enabled: boolean = await systemSettingsService.isCalendarAccessEnabled();

// Enable calendar access
await systemSettingsService.enableCalendarAccess();

// Disable calendar access
await systemSettingsService.disableCalendarAccess();
```

### Tool Functions

```typescript
// Get filtered tools
const tools = await getFilteredTools(calendarAccessEnabled?: boolean);

// Execute a tool (with built-in permission check)
const result = await executeLocalTool(name, args, context);
```

### Owner Tools

```typescript
// Enable calendar access (owner only)
const message = await ownerTools.enableCalendarAccess();

// Disable calendar access (owner only)
const message = await ownerTools.disableCalendarAccess();

// Get calendar access status (owner only)
const status = await ownerTools.getCalendarAccessStatus();
```

## Troubleshooting

### Issue: Calendar tools still available after disabling
**Solution:** Verify the setting was saved to database. Check `systemSettings` table for `calendar_access_enabled` key.

### Issue: Tools not filtered correctly
**Solution:** Ensure `getFilteredTools()` is being called in `generateReply()`. Check logs for tool filtering messages.

### Issue: Agent doesn't mention calendar access restriction
**Solution:** Verify system prompt injection in `_buildSystemPrompt()`. Check that `calendarAccessEnabled` parameter is passed correctly.

### Issue: Owner can't run enable/disable commands
**Solution:** Verify `isOwner` flag is set correctly. Calendar control tools require `isOwner === true`.

## Future Enhancements

1. **Per-User Permissions:** Add role-based access control (instead of global)
2. **Schedule-Based Access:** Enable/disable calendar access on a schedule
3. **Audit Logging:** Track all calendar access changes
4. **Calendar-Specific Permissions:** Separate permissions for viewing vs. booking
5. **Notification System:** Alert owner when denied calendar access is requested
6. **Time-Based Restrictions:** Disable calendar access during specific hours
