-- Migration: Add wine_category_id to providerproduct table
-- This stores the category ID from the provider API (e.g., "18010" for Red Wine, "18011" for White Wine)
-- This is the most reliable source for determining wine type

ALTER TABLE providerproduct 
ADD COLUMN IF NOT EXISTS wine_category_id VARCHAR(50) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_providerproduct_wine_category_id 
ON providerproduct(wine_category_id) WHERE wine_category_id IS NOT NULL;
