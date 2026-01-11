# Creating a New Migration

## Recommended: Timestamp-Based Naming (for concurrent development)

Use timestamp-based naming to avoid conflicts when multiple developers create migrations simultaneously.

### Format
```
{YYYYMMDDHHMMSS}_{description}.sql
```

### Example
```bash
# Current time: 2026-01-11 14:30:00
# Migration file: 20260111143000_add_user_preferences.sql
```

### How to Create

**Option 1: Manual (recommended for learning)**
```bash
# Get current timestamp
date +"%Y%m%d%H%M%S"
# Output: 20260111143000

# Create file
touch back/migrations/20260111143000_add_user_preferences.sql
```

**Option 2: Helper script (see below)**

### Benefits
- ✅ No conflicts: Two developers can't create the same timestamp
- ✅ Natural ordering: Migrations run in chronological order
- ✅ Clear history: You can see when each migration was created
- ✅ Industry standard: Used by Django, Rails, Alembic, etc.

## Alternative: Sequential Naming (backward compatible)

For simple projects or when you're sure no one else is creating migrations:

```
{version:03d}_{description}.sql
```

Example: `002_add_user_preferences.sql`

⚠️ **Warning**: Sequential numbers can conflict if two developers work simultaneously. Git will catch the conflict, but it's disruptive.

## Migration Helper Script

Create a helper script to generate timestamped migrations:

```bash
#!/bin/bash
# save as: back/create_migration.sh

TIMESTAMP=$(date +"%Y%m%d%H%M%S")
DESCRIPTION=$1

if [ -z "$DESCRIPTION" ]; then
    echo "Usage: ./create_migration.sh description_with_underscores"
    exit 1
fi

FILENAME="back/migrations/${TIMESTAMP}_${DESCRIPTION}.sql"
touch "$FILENAME"
echo "-- Migration ${TIMESTAMP}: ${DESCRIPTION//_/ }" >> "$FILENAME"
echo "-- Date: $(date +"%Y-%m-%d %H:%M:%S")" >> "$FILENAME"
echo "" >> "$FILENAME"

echo "Created: $FILENAME"
```

Usage:
```bash
chmod +x back/create_migration.sh
./back/create_migration.sh add_user_preferences
# Creates: back/migrations/20260111143000_add_user_preferences.sql
```

## Best Practices

1. **Use timestamps for new migrations** - Prevents conflicts
2. **Keep sequential migrations** - Don't rename existing ones
3. **One logical change per migration** - Keep them focused
4. **Use descriptive names** - `add_user_preferences` not `migration1`
5. **Test before committing** - Run migrations locally first
