-- Migration: Add category and subcategory to product table
-- Description: Add category and subcategory fields to legacy Product table for categorization
-- Date: 2026-01-12

ALTER TABLE product 
ADD COLUMN IF NOT EXISTS category VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS subcategory VARCHAR(255) DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_product_category ON product(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_product_subcategory ON product(subcategory) WHERE subcategory IS NOT NULL;
