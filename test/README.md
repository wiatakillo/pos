# Test Scripts

This directory contains test scripts for the POS system.

## test_login.sh (Recommended - uses curl)

Simple login verification test using curl - **no Python dependencies required**.

### Usage

```bash
# From the project root (automatically loads config.env)
# Note: If using HAProxy, use the proxied URL
API_URL=http://localhost:4202/api bash test/test_login.sh

# Or with direct backend access (if port 8020 is exposed)
API_URL=http://localhost:8020 bash test/test_login.sh

# Or with explicit credentials
API_URL=http://localhost:4202/api POS_TEST_OWNER=ralf@roeber.de POS_TEST_PASSWORD=foo1234 bash test/test_login.sh
```

### Quick Test

For a minimal output version:
```bash
API_URL=http://localhost:4202/api bash test/test_login_quick.sh
```

## test_login.py

Python version of login test (requires `requests` library).

### Usage

```bash
# From the project root (reads from config.env via environment)
source <(grep -E "^POS_TEST|^API_URL" config.env | sed 's/^/export /')
python3 test/test_login.py

# Or with explicit values
API_URL=http://localhost:8020 POS_TEST_OWNER=ralf@roeber.de POS_TEST_PASSWORD=foo1234 python3 test/test_login.py
```

## test_paid_order_fix.py

Tests that items cannot be added to paid orders.

### Usage

```bash
# From the project root
python3 test/test_paid_order_fix.py

# Or with custom API URL
API_URL=http://178.63.8.217:8020 python3 test/test_paid_order_fix.py

# With HAProxy (if using proxy)
API_URL=http://localhost:4202/api python3 test/test_paid_order_fix.py
```

### Requirements

- Python 3
- `requests` library: `pip install requests`

### Test Credentials

The script reads credentials from environment variables:
- `POS_TEST_OWNER` - Test user email (default: `ralf@roeber.de`)
- `POS_TEST_PASSWORD` - Test user password (default: `foo1234`)

You can set these in `config.env` or pass them as environment variables:
```bash
POS_TEST_OWNER=ralf@roeber.de POS_TEST_PASSWORD=foo1234 python3 test/test_paid_order_fix.py
```

### What it tests

1. Logs in as test user
2. Gets a table token
3. Creates an order with an item
4. Pays for the order (simulating Stripe payment)
5. Tries to add another item
6. Verifies that a NEW order is created instead of adding to the paid order
