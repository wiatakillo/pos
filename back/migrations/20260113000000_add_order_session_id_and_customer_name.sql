-- Migration: Add session_id and customer_name to Order table
-- Description: Enables order isolation per browser session and optional customer name for restaurant staff
-- Date: 2026-01-13

-- Add session_id column (nullable for backward compatibility with existing orders)
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS session_id VARCHAR(255);

-- Add customer_name column (nullable, optional)
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);

-- Create index for fast lookups by table_id and session_id
CREATE INDEX IF NOT EXISTS idx_order_session ON "order"(table_id, session_id);

-- Create index for customer_name (for restaurant staff to filter/search)
CREATE INDEX IF NOT EXISTS idx_order_customer_name ON "order"(customer_name);
