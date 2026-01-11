-- Migration 20260111143538: add Stripe keys to tenant
-- Description: Add stripe_secret_key and stripe_publishable_key fields to tenant table
-- Date: 2026-01-11 14:35:38

-- Add Stripe keys columns to tenant table
ALTER TABLE tenant 
ADD COLUMN IF NOT EXISTS stripe_secret_key VARCHAR(255) DEFAULT NULL;

ALTER TABLE tenant 
ADD COLUMN IF NOT EXISTS stripe_publishable_key VARCHAR(255) DEFAULT NULL;
