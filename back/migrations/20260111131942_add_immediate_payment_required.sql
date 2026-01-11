-- Migration 20260111131942: add immediate payment required
-- Description: Add immediate_payment_required boolean field to tenant table
-- Date: 2026-01-11 13:19:42

-- Add immediate_payment_required column to tenant table
ALTER TABLE tenant 
ADD COLUMN IF NOT EXISTS immediate_payment_required BOOLEAN NOT NULL DEFAULT FALSE;

