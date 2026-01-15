#!/bin/bash
# Quick login test using curl - minimal output

set +e  # Don't exit on error, we'll handle it

# Load config.env if it exists (from test/ directory, config.env is in parent)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/../config.env"

# Load from config.env first (only if variables not already set from environment)
if [ -f "$CONFIG_FILE" ]; then
    while IFS='=' read -r key value; do
        # Skip comments and empty lines
        [[ "$key" =~ ^#.*$ ]] && continue
        [[ -z "$key" ]] && continue
        # Remove quotes if present
        value=$(echo "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
        # Export only the variables we care about, but only if not already set
        case "$key" in
            API_URL)
                [ -z "${API_URL:-}" ] && export API_URL="$value"
                ;;
            POS_TEST_OWNER)
                [ -z "${POS_TEST_OWNER:-}" ] && export POS_TEST_OWNER="$value"
                ;;
            POS_TEST_PASSWORD)
                [ -z "${POS_TEST_PASSWORD:-}" ] && export POS_TEST_PASSWORD="$value"
                ;;
        esac
    done < "$CONFIG_FILE"
fi

# Configuration - environment variables override config.env
API_BASE_URL="${API_URL:-http://localhost:8020}"
TEST_EMAIL="${POS_TEST_OWNER:-ralf@roeber.de}"
TEST_PASSWORD="${POS_TEST_PASSWORD:-foo1234}"

# Login
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/token" \
    -d "username=$TEST_EMAIL" \
    -d "password=$TEST_PASSWORD" \
    -H "Content-Type: application/x-www-form-urlencoded" 2>&1)

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] && echo "$BODY" | grep -q "access_token"; then
    TOKEN=$(echo "$BODY" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    echo "✅ Login successful! Token: ${TOKEN:0:30}..."
    exit 0
elif [ -z "$HTTP_CODE" ] || [ "$HTTP_CODE" = "000" ]; then
    echo "❌ Connection failed: Could not reach $API_BASE_URL"
    echo "   Try: API_URL=http://localhost:4202/api bash test/test_login_quick.sh"
    exit 1
else
    echo "❌ Login failed (HTTP $HTTP_CODE): $BODY"
    exit 1
fi
