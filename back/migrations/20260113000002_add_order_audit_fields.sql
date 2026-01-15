-- Migration: Add audit fields for order and item modifications
-- Description: Track who modified orders/items and when, for audit trail and tax reporting
-- Date: 2026-01-13

-- Add modification tracking to OrderItem
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS modified_by_user_id INT NULL;
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS modified_at TIMESTAMP NULL;
ALTER TABLE orderitem ADD COLUMN IF NOT EXISTS cancelled_reason TEXT NULL;  -- Required when cancelling ready items

-- Add payment tracking to Order
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP NULL;
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS paid_by_user_id INT NULL;  -- Who marked it as paid (staff)
ALTER TABLE "order" ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) NULL;  -- 'stripe', 'cash', 'terminal', etc.

-- Create indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_orderitem_modified ON orderitem(order_id, modified_at);
CREATE INDEX IF NOT EXISTS idx_order_paid ON "order"(paid_at, payment_method);
