# Database Migrations

This directory contains versioned SQL migration files that bring the database schema to the latest version.

## Migration File Naming

The system supports two naming patterns:

### 1. Timestamp-Based (Recommended for concurrent development)
Format: `{YYYYMMDDHHMMSS}_{description}.sql`

Example: `20260111143000_add_user_preferences.sql`

**Benefits:**
- ✅ No conflicts when multiple developers create migrations simultaneously
- ✅ Natural chronological ordering
- ✅ Industry standard (used by Django, Rails, Alembic, etc.)

**Creating a timestamped migration:**
```bash
# Use the helper script
./back/create_migration.sh add_user_preferences

# Or manually
date +"%Y%m%d%H%M%S"  # Get timestamp
# Then create: migrations/20260111143000_add_user_preferences.sql
```

### 2. Sequential Numbers (Backward Compatible)
Format: `{version:03d}_{description}.sql`

Example: `001_add_tenant_fields.sql`, `002_add_user_preferences.sql`

⚠️ **Warning**: Sequential numbers can conflict if two developers work simultaneously. Git will catch the conflict, but it's disruptive. Use timestamps for new migrations.

## How It Works

1. Each migration file contains SQL statements to modify the database schema
2. Migrations are executed in version order (sequential numbers or timestamps)
3. Applied migrations are tracked in the `schema_version` table
4. The migration runner automatically detects and applies missing migrations
5. Both sequential and timestamp-based migrations can coexist (backward compatible)

## Concurrent Development & Version Conflicts

### The Problem
If two developers create migrations with sequential numbers simultaneously:
- Developer A creates `002_feature_a.sql`
- Developer B creates `002_feature_b.sql`
- **Git will catch the filename conflict**, but this is disruptive and requires manual resolution

### The Solution: Timestamp-Based Migrations
Using timestamps (YYYYMMDDHHMMSS) eliminates conflicts:
- Developer A creates `20260111143000_feature_a.sql` at 14:30:00
- Developer B creates `20260111143015_feature_b.sql` at 14:30:15
- **No conflict!** Migrations run in chronological order
- **Git handles it naturally** - different filenames, no merge conflicts

### Why Not Hashes?
- ❌ Hashes don't provide natural ordering
- ❌ Harder to understand migration sequence
- ❌ No chronological information
- ✅ Timestamps are the industry standard (Django, Rails, Alembic, Flyway)

## Running Migrations

Migrations are automatically run on application startup, or you can run them manually:

```bash
docker compose exec back python -m app.migrate
```

## Creating a New Migration

1. Create a new SQL file: `migrations/XXX_description.sql` (where XXX is the next version number)
2. Write your SQL statements (CREATE TABLE, ALTER TABLE, etc.)
3. Test the migration locally
4. Commit the file to version control

## Best Practices

- **Never modify existing migration files** - create a new migration to fix issues
- **Test migrations on a copy of production data** before applying to production
- **Keep migrations small and focused** - one logical change per migration
- **Use transactions** where possible (PostgreSQL supports DDL in transactions)
- **Document complex migrations** with comments in the SQL file
