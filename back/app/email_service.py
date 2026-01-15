"""
Email service for sending transactional emails.
Supports SMTP (Gmail, Proton Mail, etc.) and can be extended for API-based services.
"""

import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

import aiosmtplib

from .settings import settings

logger = logging.getLogger(__name__)


async def send_email(
    to_email: str,
    subject: str,
    html_content: str,
    text_content: Optional[str] = None,
    from_email: Optional[str] = None,
    from_name: Optional[str] = None,
) -> bool:
    """
    Send an email via SMTP.
    
    Args:
        to_email: Recipient email address
        subject: Email subject
        html_content: HTML email body
        text_content: Plain text email body (optional, auto-generated from HTML if not provided)
        from_email: Sender email (defaults to settings.email_from)
        from_name: Sender name (defaults to settings.email_from_name)
    
    Returns:
        True if email sent successfully, False otherwise
    """
    if not settings.smtp_user or not settings.smtp_password:
        logger.error("SMTP credentials not configured")
        return False
    
    from_email = from_email or settings.email_from
    from_name = from_name or settings.email_from_name
    
    # Create message
    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    message["To"] = to_email
    
    # Add text and HTML parts
    if text_content:
        text_part = MIMEText(text_content, "plain")
        message.attach(text_part)
    
    html_part = MIMEText(html_content, "html")
    message.attach(html_part)
    
    try:
        # Send email
        # For Gmail port 587, use start_tls=True (STARTTLS)
        # For port 465, use use_tls=True (SSL/TLS)
        if settings.smtp_port == 587:
            await aiosmtplib.send(
                message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user,
                password=settings.smtp_password,
                start_tls=True,
            )
        elif settings.smtp_port == 465:
            await aiosmtplib.send(
                message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user,
                password=settings.smtp_password,
                use_tls=True,
            )
        else:
            # Default: use start_tls if smtp_use_tls is True
            await aiosmtplib.send(
                message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user,
                password=settings.smtp_password,
                start_tls=settings.smtp_use_tls,
            )
        logger.info(f"Email sent successfully to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {e}")
        return False


async def send_verification_email(to_email: str, verification_token: str, verification_url: str) -> bool:
    """Send email verification email."""
    subject = "Verify your email address"
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
            .button {{ display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
            .code {{ font-size: 24px; font-weight: bold; letter-spacing: 4px; text-align: center; padding: 20px; background-color: #f5f5f5; border-radius: 5px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Verify your email address</h1>
            <p>Thank you for registering with POS2 System. Please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
                <a href="{verification_url}" class="button">Verify Email</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #666;">{verification_url}</p>
            <p>If you didn't create an account, you can safely ignore this email.</p>
            <hr>
            <p style="color: #666; font-size: 12px;">This is an automated message, please do not reply.</p>
        </div>
    </body>
    </html>
    """
    
    text_content = f"""
    Verify your email address
    
    Thank you for registering with POS2 System. Please verify your email address by visiting:
    
    {verification_url}
    
    If you didn't create an account, you can safely ignore this email.
    """
    
    return await send_email(to_email, subject, html_content, text_content)


async def test_smtp_connection() -> dict:
    """
    Test SMTP connection and authentication.
    
    Returns:
        dict with 'success' (bool) and 'message' (str)
    """
    if not settings.smtp_user or not settings.smtp_password:
        return {
            "success": False,
            "message": "SMTP credentials not configured in config.env"
        }
    
    try:
        # Test connection by sending a simple test email to ourselves
        # This is the most reliable way to test SMTP
        test_message = MIMEText("SMTP connection test")
        test_message["From"] = settings.email_from
        test_message["To"] = settings.smtp_user  # Send to ourselves
        test_message["Subject"] = "SMTP Test"
        
        # Use the same logic as send_email
        if settings.smtp_port == 587:
            await aiosmtplib.send(
                test_message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user,
                password=settings.smtp_password,
                start_tls=True,
            )
        elif settings.smtp_port == 465:
            await aiosmtplib.send(
                test_message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user,
                password=settings.smtp_password,
                use_tls=True,
            )
        else:
            await aiosmtplib.send(
                test_message,
                hostname=settings.smtp_host,
                port=settings.smtp_port,
                username=settings.smtp_user,
                password=settings.smtp_password,
                start_tls=settings.smtp_use_tls,
            )
        
        return {
            "success": True,
            "message": f"Successfully connected and sent test email to {settings.smtp_host}:{settings.smtp_port}"
        }
    except aiosmtplib.SMTPAuthenticationError as e:
        return {
            "success": False,
            "message": f"Authentication failed. For Gmail, you need an 'App Password', not your regular password. Error: {e}"
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"Connection failed: {e}"
        }
