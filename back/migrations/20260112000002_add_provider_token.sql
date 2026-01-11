-- Migration 20260112000002: Add token field to provider table
-- Description: Add unique token field to providers for secure URL access
-- Date: 2026-01-12

ALTER TABLE provider 
ADD COLUMN IF NOT EXISTS token VARCHAR(255) DEFAULT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_token ON provider(token) WHERE token IS NOT NULL;
