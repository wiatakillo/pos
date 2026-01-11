-- Migration: Add wine_category_id to providerproduct table
ALTER TABLE providerproduct
ADD COLUMN IF NOT EXISTS wine_category_id VARCHAR(50) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_providerproduct_wine_category_id
ON providerproduct(wine_category_id) WHERE wine_category_id IS NOT NULL;
