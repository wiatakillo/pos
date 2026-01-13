# Customer Features Implementation Plan

## Overview
Add customer-facing features: customer accounts, order history, email verification, MFA, and invoice generation for tax deduction.

---

## 1. Database Schema Changes

### 1.1 New `Customer` Model
Separate from `User` (restaurant owners). Customers are end-users who place orders.

**Fields:**
- `id` (Primary Key)
- `email` (Unique, indexed)
- `hashed_password`
- `full_name`
- `business_name` (Optional - for invoice generation)
- `tax_id` / `vat_number` (Optional - for invoice generation)
- `address` (Optional - for invoice generation)
- `phone` (Optional)
- `email_verified` (Boolean, default=False)
- `email_verification_token` (UUID, nullable)
- `email_verification_sent_at` (DateTime, nullable)
- `mfa_enabled` (Boolean, default=False)
- `mfa_secret` (String, nullable - TOTP secret)
- `mfa_backup_codes` (JSON array, nullable - backup codes)
- `created_at` (DateTime)
- `updated_at` (DateTime)

### 1.2 Update `Order` Model
Add optional customer link (backward compatible with table-only orders).

**New Fields:**
- `customer_id` (Foreign Key to Customer, nullable, indexed)
- Keep existing `table_id` (for backward compatibility)

### 1.3 New `Invoice` Model
For generated invoices.

**Fields:**
- `id` (Primary Key)
- `customer_id` (Foreign Key to Customer)
- `order_id` (Foreign Key to Order)
- `invoice_number` (String, unique - e.g., "INV-2026-001")
- `issue_date` (DateTime)
- `due_date` (DateTime, nullable)
- `subtotal_cents` (Integer)
- `tax_cents` (Integer)
- `total_cents` (Integer)
- `currency` (String)
- `status` (Enum: draft, sent, paid, cancelled)
- `pdf_filename` (String, nullable - stored file)
- `notes` (Text, nullable)
- `created_at` (DateTime)

### 1.4 New `EmailVerification` Model (Optional - for tracking)
Or use simple token in Customer model (simpler approach chosen above).

---

## 2. Authentication & Security

### 2.1 Customer Registration Endpoint
- `POST /customer/register`
  - Email, password, full_name
  - Send verification email
  - Return: customer_id, email (unverified status)

### 2.2 Email Verification
- `GET /customer/verify-email?token={verification_token}`
  - Verify token and mark email as verified
  - Return success/error

- `POST /customer/resend-verification`
  - Resend verification email (rate limited)

### 2.3 Customer Login
- `POST /customer/token` (separate from restaurant owner login)
  - Email + password
  - Check email_verified (optional - can allow unverified login with warning)
  - Return JWT token with customer_id (not tenant_id)

### 2.4 MFA Setup
- `POST /customer/mfa/setup`
  - Generate TOTP secret
  - Return QR code data URL and backup codes
  - Mark MFA as enabled after verification

- `POST /customer/mfa/verify`
  - Verify TOTP code during login
  - Return new token if verified

- `POST /customer/mfa/disable`
  - Disable MFA (requires password confirmation)

- `POST /customer/mfa/backup-codes`
  - Regenerate backup codes

### 2.5 Customer Authentication Middleware
- `get_current_customer()` dependency
  - Similar to `get_current_user()` but for customers
  - JWT contains customer_id instead of tenant_id

---

## 3. Order Management

### 3.1 Link Orders to Customers
- Update `POST /menu/{table_token}/order` to optionally accept customer token
- If customer is logged in, link order to customer
- Maintain backward compatibility (table-only orders still work)

### 3.2 Customer Order History
- `GET /customer/orders`
  - List all orders for authenticated customer
  - Filter by status, date range
  - Include order details, items, totals

- `GET /customer/orders/{order_id}`
  - Get specific order details

---

## 4. Invoice Generation

### 4.1 Invoice Creation
- `POST /customer/orders/{order_id}/invoice`
  - Generate invoice for a paid order
  - Create Invoice record
  - Generate PDF invoice
  - Store PDF in uploads/customers/{customer_id}/invoices/
  - Return invoice details + download URL

### 4.2 Invoice Management
- `GET /customer/invoices`
  - List all invoices for customer
  - Filter by date, status

- `GET /customer/invoices/{invoice_id}`
  - Get invoice details

- `GET /customer/invoices/{invoice_id}/download`
  - Download PDF invoice

### 4.3 Invoice PDF Generation
- Use library like `reportlab` or `weasyprint`
- Include:
  - Invoice number
  - Customer business details (if provided)
  - Order details (items, quantities, prices)
  - Tax breakdown
  - Total amount
  - Issue date
  - Restaurant/business details (from Tenant)

---

## 5. Email Service

### 5.1 Email Configuration
- Add email service (SMTP or service like SendGrid/Mailgun)
- Configuration in `config.env`:
  - `SMTP_HOST`
  - `SMTP_PORT`
  - `SMTP_USER`
  - `SMTP_PASSWORD`
  - `EMAIL_FROM`

### 5.2 Email Templates
- Email verification
- MFA setup confirmation
- Invoice ready notification

---

## 6. Frontend Changes

### 6.1 Customer Registration/Login Pages
- New routes: `/customer/register`, `/customer/login`
- Separate from restaurant owner auth

### 6.2 Customer Dashboard
- Order history
- Invoice list
- MFA settings
- Profile settings (business info for invoices)

### 6.3 Invoice View/Download
- Invoice detail page
- PDF viewer/download

---

## 7. Dependencies to Add

```python
# MFA/TOTP
pyotp>=2.9.0
qrcode[pil]>=7.4.2

# PDF Generation
reportlab>=4.0.0
# OR
weasyprint>=60.0

# Email
aiosmtplib>=3.0.0  # For async email
# OR use external service SDK
```

---

## 8. Migration Strategy

### Phase 1: Database Migration
1. Create migration for Customer table
2. Add `customer_id` to Order table (nullable)
3. Create Invoice table
4. Run migration

### Phase 2: Backend Implementation
1. Customer models and authentication
2. Email verification
3. MFA setup
4. Order linking
5. Invoice generation

### Phase 3: Frontend Implementation
1. Customer auth pages
2. Customer dashboard
3. Invoice management

### Phase 4: Testing
1. Test customer registration/login
2. Test email verification
3. Test MFA
4. Test order linking
5. Test invoice generation

---

## 9. Security Considerations

1. **Email Verification**: Required before sensitive operations (invoice generation)
2. **MFA**: Optional but recommended
3. **Rate Limiting**: On registration, login, email resend
4. **Password Requirements**: Minimum 8 characters, complexity rules
5. **JWT Expiration**: Shorter for customers (15-30 minutes)
6. **Invoice Access**: Only customer who owns the order can generate invoice
7. **Data Privacy**: Customer data separate from restaurant data

---

## 10. API Endpoints Summary

### Customer Authentication
- `POST /customer/register` - Register new customer
- `POST /customer/token` - Customer login
- `GET /customer/verify-email?token={token}` - Verify email
- `POST /customer/resend-verification` - Resend verification email
- `POST /customer/forgot-password` - Request password reset
- `POST /customer/reset-password` - Reset password with token

### MFA
- `POST /customer/mfa/setup` - Setup MFA
- `POST /customer/mfa/verify` - Verify MFA code
- `POST /customer/mfa/disable` - Disable MFA
- `POST /customer/mfa/backup-codes` - Regenerate backup codes

### Customer Profile
- `GET /customer/profile` - Get customer profile
- `PUT /customer/profile` - Update customer profile

### Orders
- `GET /customer/orders` - List customer orders
- `GET /customer/orders/{order_id}` - Get order details

### Invoices
- `POST /customer/orders/{order_id}/invoice` - Generate invoice
- `GET /customer/invoices` - List invoices
- `GET /customer/invoices/{invoice_id}` - Get invoice details
- `GET /customer/invoices/{invoice_id}/download` - Download PDF

---

## 11. Configuration Changes

### config.env additions:
```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=noreply@yourdomain.com

# Invoice Settings
INVOICE_PREFIX=INV
INVOICE_NUMBER_FORMAT=INV-{year}-{number:04d}
```

---

## 12. Questions for Confirmation

1. **Email Verification**: Should customers be able to place orders before email verification, or should it be required?
2. **MFA**: Should MFA be mandatory or optional?
3. **Invoice Requirements**: What information is required for invoices (tax ID, business name, address)?
4. **Order Linking**: Should customers be able to link existing orders (placed before login) to their account?
5. **Invoice Format**: Any specific invoice format requirements or templates?
6. **Email Service**: Prefer SMTP or external service (SendGrid, Mailgun, etc.)?
7. **PDF Library**: Prefer reportlab or weasyprint for PDF generation?

---

## Implementation Order

1. ✅ Database migrations (Customer, Invoice tables, Order.customer_id)
2. ✅ Customer model and authentication endpoints
3. ✅ Email verification
4. ✅ MFA setup and verification
5. ✅ Order linking (optional customer_id)
6. ✅ Invoice generation
7. ✅ Frontend customer pages
8. ✅ Testing

---

**Ready for your review and confirmation before implementation.**
