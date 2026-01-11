#!/bin/sh
set -e

# Get API and WS URLs from environment variables, with defaults
API_URL="${API_URL:-http://localhost:8020}"
WS_URL="${WS_URL:-ws://localhost:8021}"
STRIPE_PUBLISHABLE_KEY="${STRIPE_PUBLISHABLE_KEY:-}"

# Replace placeholders in index.html with actual values
# Use # as delimiter to avoid conflicts with URLs and || operator
# Escape special characters for sed (slashes, ampersands, etc.)
API_URL_ESCAPED=$(echo "$API_URL" | sed 's/[\/&]/\\&/g')
WS_URL_ESCAPED=$(echo "$WS_URL" | sed 's/[\/&]/\\&/g')
STRIPE_KEY_ESCAPED=$(echo "$STRIPE_PUBLISHABLE_KEY" | sed 's/[\/&]/\\&/g')

# Replace the default values in the JavaScript code
# Match any URL pattern after the || operator (more flexible pattern)
sed -i "s#window.__API_URL__ || '[^']*'#window.__API_URL__ || '${API_URL_ESCAPED}'#g" /app/src/index.html
sed -i "s#window.__WS_URL__ || '[^']*'#window.__WS_URL__ || '${WS_URL_ESCAPED}'#g" /app/src/index.html
sed -i "s#window.__STRIPE_PUBLISHABLE_KEY__ || '[^']*'#window.__STRIPE_PUBLISHABLE_KEY__ || '${STRIPE_KEY_ESCAPED}'#g" /app/src/index.html

# Execute the original command
exec "$@"
