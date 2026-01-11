-- Migration 20260112000001: Add image_filename to providerproduct
-- Description: Add image_filename field to store locally downloaded provider product images
-- Date: 2026-01-12

ALTER TABLE providerproduct 
ADD COLUMN IF NOT EXISTS image_filename VARCHAR(255) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_providerproduct_image_filename ON providerproduct(image_filename) WHERE image_filename IS NOT NULL;
