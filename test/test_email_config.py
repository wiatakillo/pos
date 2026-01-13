#!/usr/bin/env python3
"""
Test script to verify Gmail SMTP configuration.
"""

import asyncio
import sys
import os

# Add parent directory to path to import app modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'back'))

from app.email_service import test_smtp_connection, send_email
from app.settings import settings


async def main():
    print("=" * 70)
    print("Gmail SMTP Configuration Test")
    print("=" * 70)
    
    # Display configuration (hide password)
    print(f"\n📧 Email Configuration:")
    print(f"   SMTP Host: {settings.smtp_host}")
    print(f"   SMTP Port: {settings.smtp_port}")
    print(f"   SMTP User: {settings.smtp_user}")
    print(f"   SMTP Password: {'*' * len(settings.smtp_password) if settings.smtp_password else 'NOT SET'}")
    print(f"   Use TLS: {settings.smtp_use_tls}")
    print(f"   From Email: {settings.email_from}")
    print(f"   From Name: {settings.email_from_name}")
    
    # Test connection
    print(f"\n🔌 Testing SMTP connection...")
    result = await test_smtp_connection()
    
    if result["success"]:
        print(f"✅ {result['message']}")
        
        # Test sending email
        print(f"\n📨 Testing email send...")
        test_email = input("Enter your email address to receive a test email (or press Enter to skip): ").strip()
        
        if test_email:
            print(f"   Sending test email to {test_email}...")
            success = await send_email(
                to_email=test_email,
                subject="POS2 System - Test Email",
                html_content="""
                <html>
                <body>
                    <h1>Test Email from POS2 System</h1>
                    <p>If you received this email, your SMTP configuration is working correctly!</p>
                    <p>This is a test email sent from the POS2 backend system.</p>
                </body>
                </html>
                """,
                text_content="Test Email from POS2 System\n\nIf you received this email, your SMTP configuration is working correctly!"
            )
            
            if success:
                print(f"✅ Test email sent successfully to {test_email}")
                print(f"   Please check your inbox (and spam folder).")
            else:
                print(f"❌ Failed to send test email")
        else:
            print("   Skipped email send test")
    else:
        print(f"❌ {result['message']}")
        print(f"\n⚠️  Troubleshooting:")
        print(f"   1. For Gmail, you need an 'App Password', not your regular password")
        print(f"   2. Generate one at: https://myaccount.google.com/apppasswords")
        print(f"   3. Enable 2-Step Verification first if not already enabled")
        print(f"   4. Make sure 'Less secure app access' is enabled (if using regular password)")
        print(f"   5. Check that SMTP_USER and SMTP_PASSWORD are set in config.env")
        return 1
    
    print(f"\n" + "=" * 70)
    print("Test completed")
    print("=" * 70)
    return 0


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
