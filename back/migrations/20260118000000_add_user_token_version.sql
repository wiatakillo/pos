-- Migration 20260118000000: Add token_version field to user table
-- Description: Add token_version field for refresh token revocation support.
-- Incrementing this value invalidates all existing tokens for that user.

ALTER TABLE "user" 
ADD COLUMN IF NOT EXISTS token_version INTEGER DEFAULT 0 NOT NULL;
