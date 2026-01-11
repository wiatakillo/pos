#!/bin/bash
# Helper script to create a new timestamped migration file

TIMESTAMP=$(date +"%Y%m%d%H%M%S")
DESCRIPTION=$1

if [ -z "$DESCRIPTION" ]; then
    echo "Usage: ./create_migration.sh description_with_underscores"
    echo ""
    echo "Example:"
    echo "  ./create_migration.sh add_user_preferences"
    echo "  Creates: migrations/20260111143000_add_user_preferences.sql"
    exit 1
fi

MIGRATIONS_DIR="$(dirname "$0")/migrations"
FILENAME="${MIGRATIONS_DIR}/${TIMESTAMP}_${DESCRIPTION}.sql"

# Create migrations directory if it doesn't exist
mkdir -p "$MIGRATIONS_DIR"

# Create the migration file with a template
cat > "$FILENAME" << EOF
-- Migration ${TIMESTAMP}: ${DESCRIPTION//_/ }
-- Description: ${DESCRIPTION//_/ }
-- Date: $(date +"%Y-%m-%d %H:%M:%S")

-- Add your SQL statements here
-- Example:
-- CREATE TABLE IF NOT EXISTS example (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(255) NOT NULL
-- );

EOF

echo "✅ Created migration: $FILENAME"
echo ""
echo "Next steps:"
echo "  1. Edit the file and add your SQL statements"
echo "  2. Test locally: docker compose exec back python -m app.migrate"
echo "  3. Commit to version control"
