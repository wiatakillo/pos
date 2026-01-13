# Gmail SMTP Setup Instructions

## ✅ Configuration Complete

I've configured Gmail SMTP for your POS2 system with the following:

- **Email:** pos2iceo@gmail.com
- **SMTP Server:** smtp.gmail.com:587
- **Configuration:** Added to `config.env` and `docker-compose.yml`

## ⚠️ Important: Gmail App Password Required

**Gmail requires an "App Password", not your regular password!**

The password you provided (`HzF-gXF/r2i^Ks%`) might work if:
- 2-Step Verification is **disabled**
- "Less secure app access" is enabled (deprecated by Google)

**For better security, use an App Password:**

### Steps to Generate Gmail App Password:

1. **Enable 2-Step Verification** (if not already enabled):
   - Go to: https://myaccount.google.com/security
   - Enable "2-Step Verification"

2. **Generate App Password**:
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter name: "POS2 System"
   - Click "Generate"
   - Copy the 16-character password (spaces don't matter)

3. **Update config.env**:
   ```env
   SMTP_PASSWORD=<your_16_character_app_password>
   ```

4. **Restart Docker containers**:
   ```bash
   docker compose --env-file config.env restart back
   ```

## 📧 Current Configuration

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=pos2iceo@gmail.com
SMTP_PASSWORD=HzF-gXF/r2i^Ks%  # Replace with App Password
SMTP_USE_TLS=true
EMAIL_FROM=pos2iceo@gmail.com
EMAIL_FROM_NAME=POS2 System
```

## 🧪 Testing the Configuration

### Option 1: Run the test script
```bash
cd /development/pos2
python3 test/test_email_config.py
```

### Option 2: Test from Docker container
```bash
docker exec pos-back python3 -c "
import sys
sys.path.insert(0, '/app')
import asyncio
from app.email_service import test_smtp_connection

async def test():
    result = await test_smtp_connection()
    print('Success:', result['success'])
    print('Message:', result['message'])

asyncio.run(test())
"
```

### Option 3: Send a test email
```bash
docker exec pos-back python3 -c "
import sys
sys.path.insert(0, '/app')
import asyncio
from app.email_service import send_email

async def test():
    success = await send_email(
        to_email='your-email@example.com',
        subject='Test from POS2',
        html_content='<h1>Test Email</h1><p>This is a test.</p>'
    )
    print('Email sent:', success)

asyncio.run(test())
"
```

## 🔧 Troubleshooting

### Authentication Failed
- **Error:** "Authentication failed" or "Invalid credentials"
- **Solution:** Generate an App Password (see steps above)

### Connection Timeout
- **Error:** "Connection timeout" or "Could not connect"
- **Solution:** 
  - Check firewall settings
  - Verify SMTP_HOST and SMTP_PORT are correct
  - Try port 465 with SSL instead of 587 with STARTTLS

### Gmail Blocking
- **Error:** "Access denied" or "Login blocked"
- **Solution:**
  - Check Gmail security alerts: https://myaccount.google.com/security
  - Allow access from "less secure apps" (if 2FA disabled)
  - Use App Password instead

## 📝 Email Service Usage

The email service is ready to use in your code:

```python
from app.email_service import send_email, send_verification_email

# Send a simple email
await send_email(
    to_email="customer@example.com",
    subject="Welcome!",
    html_content="<h1>Welcome to POS2!</h1>"
)

# Send verification email
await send_verification_email(
    to_email="customer@example.com",
    verification_token="abc123",
    verification_url="https://yourdomain.com/verify?token=abc123"
)
```

## 🚀 Next Steps

1. **Generate App Password** (recommended)
2. **Update config.env** with App Password
3. **Restart containers**: `docker compose --env-file config.env restart back`
4. **Test connection** using one of the test methods above
5. **Send a test email** to verify everything works

## 📊 Gmail Limits

- **Daily limit:** 500 emails/day
- **Rate limit:** ~100 emails/hour
- **Best for:** Development and low-volume production
- **For production:** Consider SendGrid, Resend, or AWS SES

---

**Status:** ✅ Configuration files updated
**Next:** Generate App Password and test connection
