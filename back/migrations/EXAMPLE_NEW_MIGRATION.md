# Example: Creating a New Migration

This is an example workflow for creating a new database migration.

## Scenario
You need to add a `preferences` table to store user preferences.

## Steps

1. **Check current version:**
   ```bash
   docker compose exec back python -m app.migrate --check
   ```
   Output: `Current database version: 1`

2. **Create the migration file:**
   ```bash
   # Create: back/migrations/002_add_user_preferences.sql
   ```

3. **Write the SQL:**
   ```sql
   -- Migration 002: Add user preferences table
   -- Description: Creates a table to store user preferences
   -- Date: 2026-01-XX

   CREATE TABLE IF NOT EXISTS user_preferences (
       id SERIAL PRIMARY KEY,
       user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
       key VARCHAR(255) NOT NULL,
       value TEXT,
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       UNIQUE(user_id, key)
   );

   CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
   ```

4. **Test the migration:**
   ```bash
   # Check what will be applied
   docker compose exec back python -m app.migrate --check
   
   # Apply it
   docker compose exec back python -m app.migrate
   ```

5. **Commit to version control:**
   ```bash
   git add back/migrations/002_add_user_preferences.sql
   git commit -m "Add user preferences table migration"
   ```

## When Another Developer Pulls Your Changes

1. They pull the latest code (including your migration file)
2. They start the application
3. **Migrations run automatically on startup** - the system detects version 2 is missing and applies it
4. Their database is now in sync!

## Best Practices

- ✅ Use `IF NOT EXISTS` for idempotency
- ✅ Use transactions where possible
- ✅ Test migrations on a copy of production data
- ✅ Document complex migrations with comments
- ✅ Never modify existing migration files
- ✅ Keep migrations small and focused
