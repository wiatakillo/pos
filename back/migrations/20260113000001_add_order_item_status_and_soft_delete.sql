-- Migration: Add item-level status and soft delete fields to OrderItem
-- Description: Enables item-level status tracking and soft delete for order modifications
-- Date: 2026-01-13

-- Add status field to OrderItem (for item-level status tracking)
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending';

-- Add soft delete fields for audit trail (NEVER delete order items)
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS removed_by_customer BOOLEAN DEFAULT FALSE;
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS removed_at TIMESTAMP NULL;
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS removed_reason VARCHAR(255) NULL;
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS removed_by_user_id INT NULL;  -- If removed by staff

-- Add audit fields for status tracking
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMP NULL;
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS prepared_by_user_id INT NULL;  -- Who marked it as ready
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS delivered_by_user_id INT NULL;  -- Who delivered it

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_orderitem_status ON orderitem(order_id, status);
CREATE INDEX IF NOT EXISTS idx_orderitem_removed ON orderitem(order_id, removed_by_customer);
CREATE INDEX IF NOT EXISTS idx_orderitem_active ON orderitem(order_id, removed_by_customer) 
WHERE removed_by_customer = FALSE;

-- Add cancellation tracking to Order table
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP NULL;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(50) NULL;  -- 'customer' or 'staff'

-- Set default status for existing items
UPDATE orderitem SET status = 'pending' WHERE status IS NULL;
UPDATE orderitem SET removed_by_customer = FALSE WHERE removed_by_customer IS NULL;
