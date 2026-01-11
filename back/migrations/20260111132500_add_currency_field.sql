-- Migration 20260111132500: add currency field
-- Description: Add currency field to tenant table
-- Date: 2026-01-11 13:25:00

-- Add currency column to tenant table
ALTER TABLE tenant 
ADD COLUMN IF NOT EXISTS currency VARCHAR(10) DEFAULT NULL;
