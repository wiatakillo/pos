-- Migration 20260112000003: Add detailed wine information fields to providerproduct
-- Description: Add fields for detailed wine information (description, style, vintage, winery, aromas, elaboration)
-- Date: 2026-01-12

ALTER TABLE providerproduct 
ADD COLUMN IF NOT EXISTS detailed_description TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS wine_style VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS vintage INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS winery VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS aromas VARCHAR(500) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS elaboration VARCHAR(255) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_providerproduct_vintage ON providerproduct(vintage) WHERE vintage IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_providerproduct_winery ON providerproduct(winery) WHERE winery IS NOT NULL;
