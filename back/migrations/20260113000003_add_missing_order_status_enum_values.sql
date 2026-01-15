-- Migration: Add missing OrderStatus enum values
-- Description: Add 'partially_delivered' and 'cancelled' to orderstatus enum to match Python code
-- Date: 2026-01-13

-- Add 'partially_delivered' to orderstatus enum (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'partially_delivered' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'orderstatus')
    ) THEN
        ALTER TYPE orderstatus ADD VALUE 'partially_delivered';
    END IF;
END $$;

-- Add 'cancelled' to orderstatus enum (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'cancelled' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'orderstatus')
    ) THEN
        ALTER TYPE orderstatus ADD VALUE 'cancelled';
    END IF;
END $$;
