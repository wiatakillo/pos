-- Migration 001: Add business profile fields to tenant table
-- Description: Adds fields for business information, contact details, logo, and opening hours
-- Date: 2026-01-11

ALTER TABLE tenant 
ADD COLUMN IF NOT EXISTS business_type VARCHAR,
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS phone VARCHAR,
ADD COLUMN IF NOT EXISTS whatsapp VARCHAR,
ADD COLUMN IF NOT EXISTS email VARCHAR,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS website VARCHAR,
ADD COLUMN IF NOT EXISTS logo_filename VARCHAR,
ADD COLUMN IF NOT EXISTS opening_hours TEXT;
