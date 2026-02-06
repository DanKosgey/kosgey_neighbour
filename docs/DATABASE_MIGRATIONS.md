# Database Migration System

## Overview

The application now features a **comprehensive database migration system** that automatically runs all pending migrations on startup, ensuring your database schema is always up-to-date.

## How It Works

### Three-Tier Migration Strategy

The migration system now handles:

1. **Drizzle Auto-Migrations** (`drizzle/` folder)
   - Auto-generated from schema changes
   - Handles table creation from `src/database/schema.ts`
   - State tracking via `_drizzle_migrations` table

2. **Manual SQL Migrations** (`migrations/` folder)
   - Additional SQL files for fine-tuning
   - Numbered: `001_`, `002_`, etc.
   - Run in lexicographic order

3. **Connection Verification**
   - Tests database connectivity before running migrations
   - Verifies critical tables after migrations
   - Graceful error handling with detailed logging

### Execution Flow

```
Application Start
  ↓
runMigrations() called
  ↓
  ├─ Test database connection
  ├─ Run drizzle migrations (from drizzle/ folder)
  ├─ Run manual SQL migrations (from migrations/ folder)
  ├─ Verify critical tables exist
  └─ Report status
  ↓
Application continues
```

## Migration Files

### Drizzle Migrations (`drizzle/`)

Auto-generated files from Drizzle when schema changes:

```
drizzle/
  ├─ 0000_marvelous_nuke.sql
  ├─ 0001_tense_wilson_fisk.sql
  └─ _meta/
```

To regenerate after schema changes:
```bash
npx drizzle-kit generate:pg
```

### Manual Migrations (`migrations/`)

Numbered SQL files for manual adjustments:

```
migrations/
  ├─ 001_add_session_lock.sql
  ├─ 002_add_business_description.sql
  ├─ 003_add_company_link.sql
  ├─ 004_add_campaign_content_source.sql
  ├─ 005_add_product_image_urls.sql
  └─ create_report_queue.sql
```

**Each file should:**
- Start with a number (for ordering): `001_`, `002_`, etc.
- Contain valid PostgreSQL SQL
- Have idempotent operations (use `IF NOT EXISTS`, etc.)
- End with semicolon

Example:
```sql
-- Add missing column
ALTER TABLE marketing_campaigns 
ADD COLUMN IF NOT EXISTS content_source VARCHAR(20) DEFAULT 'ai';

-- Create index
CREATE INDEX IF NOT EXISTS idx_campaign_source 
ON marketing_campaigns(content_source);
```

## Generated Log Output

When the app starts, you'll see:

```
📦 Starting comprehensive database migrations...
🔗 Testing database connection...
✅ Database connection successful
📂 Running drizzle migrations...
✅ Drizzle migrations completed
📝 Running manual SQL migrations...
📄 Found 6 SQL migration files
  🔄 Applying: 001_add_session_lock.sql
  ✅ Applied: 001_add_session_lock.sql
  🔄 Applying: 002_add_business_description.sql
  ✅ Applied: 002_add_business_description.sql
  ... (more files)
✓ Verifying critical tables...
  ✅ contacts
  ✅ message_logs
  ✅ auth_credentials
  ✅ groups
  ✅ group_members

✅ All database migrations completed successfully!
```

## Adding a New Migration

### Method 1: Automatic (Recommended for Schema Changes)

1. Modify `src/database/schema.ts`:
```typescript
export const myTable = pgTable('my_table', {
    id: serial('id').primaryKey(),
    newColumn: varchar('new_column', { length: 100 })
});
```

2. Generate migration:
```bash
npx drizzle-kit generate:pg
```

3. Migration is automatically included on next startup

### Method 2: Manual (For Custom SQL)

1. Create `migrations/NNN_description.sql`:
```sql
-- migrations/006_add_custom_feature.sql
ALTER TABLE groups ADD COLUMN IF NOT EXISTS custom_field TEXT;
CREATE INDEX IF NOT EXISTS idx_custom ON groups(custom_field);
```

2. Ensure filename follows pattern: `NNN_description.sql` (e.g., `006_`, `007_`)

3. Migration runs automatically on next startup

## Error Handling

The system handles common scenarios:

### ✅ Already Exists (Skipped)
```
⏭️ Skipped: 001_add_session_lock.sql (already applied)
```
- Migration was already run
- Table/column exists
- No error, silently skipped

### ⚠️ Dependency Not Met (Skipped with Warning)
```
⚠️ Partially skipped: 002_add_business_description.sql (some dependencies not met)
```
- Referenced table doesn't exist yet
- Will try again on next startup
- Safe to ignore if dependencies are added later

### ❌ Real Error (Reported)
```
❌ Failed: 006_bad_migration.sql [error details]
```
- Syntax error or permission issue
- Check migration file syntax
- Check database permissions

## Verification

After startup, all critical tables should exist:

- `contacts` - User contacts
- `message_logs` - Message history
- `auth_credentials` - Session auth
- `groups` - WhatsApp groups
- `group_members` - Group participants

If any table is missing, check:
1. Database connection
2. Migration file syntax
3. Database permissions

## Configuration

### Database URL

Set in `.env`:
```
DATABASE_URL=postgresql://user:password@host/database
```

### Migration Folder Paths

Migrations are looked for at startup:
- Drizzle: `./drizzle/`
- Manual: `./migrations/`

In production (Render), paths are relative to app's working directory after deployment.

## Troubleshooting

### "relation X does not exist" Error

The table wasn't created by migrations. Possible causes:
1. Migration file has syntax error
2. Drizzle didn't generate migration file
3. Migration folder is missing

**Solution:**
1. Check `migrations/` folder exists
2. Verify migration files are valid SQL
3. Regenerate drizzle migration with `npx drizzle-kit generate:pg`
4. Restart app

### "column Y does not exist" Error

A migration didn't apply the column. Possible causes:
1. Manual migration file is malformed
2. Migration was skipped due to dependencies
3. Column name typo in schema

**Solution:**
1. Verify column name in `src/database/schema.ts`
2. Check migration SQL syntax
3. Ensure migration file number is lower than dependent migrations
4. Re-run migrations or manually fix in database

### Migrations Keep Failing

Some migrations are problematic. **Debugging:**

1. Check migration file syntax:
```bash
# Test locally
psql your_database < migrations/001_*.sql
```

2. Check drizzle migrations:
```bash
npx drizzle-kit introspect:pg
```

3. Check app logs during startup for detailed error messages

## Best Practices

✅ **DO:**
- Use descriptive migration names: `006_add_group_analytics.sql`
- Use `IF NOT EXISTS` for idempotency
- Number migrations sequentially: `001_`, `002_`, etc.
- Keep migrations small and focused
- Test migrations locally before deployment

❌ **DON'T:**
- Use migration names without numbers
- Mix drizzle auto-migrations with manual schema edits
- Edit already-applied migrations
- Use unsafe operations without backups
- Skip migration errors in production

## Related Documentation

- [Database Schema](../src/database/schema.ts)
- [Migration Files](../migrations/)
- [Drizzle Config](../../drizzle.config.ts)
- [Environment Setup](.env.example)

## Support

If migrations fail:
1. Check logs for error details
2. Verify database is accessible
3. Ensure all migration files are valid SQL
4. Check database user has sufficient permissions

Contact: Check Render dashboard logs at https://dashboard.render.com for production errors.
