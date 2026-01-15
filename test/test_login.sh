#!/bin/bash
# Test script to verify login with credentials from config.env using curl

set -e

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

echo "======================================================================"
echo "LOGIN VERIFICATION TEST (using curl)"
echo "======================================================================"
echo ""
echo "Configuration:"
echo "   API URL: $API_BASE_URL"
echo "   Test Email: $TEST_EMAIL"
echo "   Test Password: $(echo "$TEST_PASSWORD" | sed 's/./*/g')"
echo ""
echo "Note: Credentials are read from environment variables:"
echo "   - POS_TEST_OWNER (or default: ralf@roeber.de)"
echo "   - POS_TEST_PASSWORD (or default: foo1234)"
echo ""

# Test login
echo "[1] Testing login..."
echo "   Email: $TEST_EMAIL"
echo "   API URL: $API_BASE_URL"
echo ""

LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$API_BASE_URL/token" \
    -d "username=$TEST_EMAIL" \
    -d "password=$TEST_PASSWORD" \
    -H "Content-Type: application/x-www-form-urlencoded")

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
RESPONSE_BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ Login successful!"
    TOKEN=$(echo "$RESPONSE_BODY" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    if [ -n "$TOKEN" ]; then
        echo "   Token (first 20 chars): ${TOKEN:0:20}..."
        
        # Test authenticated request
        echo ""
        echo "[2] Testing authenticated request..."
        ORDERS_RESPONSE=$(curl -s -w "\n%{http_code}" -X GET "$API_BASE_URL/orders" \
            -H "Authorization: Bearer $TOKEN")
        
        ORDERS_HTTP_CODE=$(echo "$ORDERS_RESPONSE" | tail -n1)
        ORDERS_BODY=$(echo "$ORDERS_RESPONSE" | sed '$d')
        
        if [ "$ORDERS_HTTP_CODE" = "200" ]; then
            ORDER_COUNT=$(echo "$ORDERS_BODY" | grep -o '"id"' | wc -l || echo "0")
            echo "✅ Authenticated request successful!"
            echo "   Found $ORDER_COUNT orders"
            echo ""
            echo "======================================================================"
            echo "✅ TEST PASSED: Login verification successful"
            echo "======================================================================"
            echo ""
            echo "Summary:"
            echo "  - Successfully logged in as $TEST_EMAIL"
            echo "  - Successfully made authenticated API request"
            echo "  - Credentials from environment are working correctly"
            exit 0
        else
            echo "❌ Authenticated request failed: HTTP $ORDERS_HTTP_CODE"
            echo "   Response: $ORDERS_BODY"
            exit 1
        fi
    else
        echo "⚠️  Warning: Login successful but could not extract token"
        echo "   Response: $RESPONSE_BODY"
        exit 1
    fi
else
    echo "❌ Login failed: HTTP $HTTP_CODE"
    echo "   Response: $RESPONSE_BODY"
    echo ""
    echo "======================================================================"
    echo "❌ TEST FAILED: Login unsuccessful"
    echo "======================================================================"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check that the backend is running"
    echo "  2. Verify API URL is correct: $API_BASE_URL"
    echo "  3. Verify credentials are correct"
    echo "  4. Check backend logs for errors"
    exit 1
fi
