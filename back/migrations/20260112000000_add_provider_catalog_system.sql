-- Migration 20260112000000: Add provider and catalog system
-- Description: Creates tables for multi-provider product catalog with price comparison
-- Date: 2026-01-12

-- Provider table
CREATE TABLE IF NOT EXISTS provider (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    url VARCHAR(255),
    api_endpoint VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_provider_name ON provider(name);
CREATE INDEX IF NOT EXISTS idx_provider_is_active ON provider(is_active);

-- Normalized product catalog
CREATE TABLE IF NOT EXISTS productcatalog (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(255),
    subcategory VARCHAR(255),
    barcode VARCHAR(255),
    brand VARCHAR(255),
    normalized_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_productcatalog_name ON productcatalog(name);
CREATE INDEX IF NOT EXISTS idx_productcatalog_category ON productcatalog(category);
CREATE INDEX IF NOT EXISTS idx_productcatalog_subcategory ON productcatalog(subcategory);
CREATE INDEX IF NOT EXISTS idx_productcatalog_barcode ON productcatalog(barcode);
CREATE INDEX IF NOT EXISTS idx_productcatalog_normalized_name ON productcatalog(normalized_name);

-- Provider-specific products
CREATE TABLE IF NOT EXISTS providerproduct (
    id SERIAL PRIMARY KEY,
    catalog_id INTEGER NOT NULL REFERENCES productcatalog(id) ON DELETE CASCADE,
    provider_id INTEGER NOT NULL REFERENCES provider(id) ON DELETE CASCADE,
    external_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    price_cents INTEGER,
    image_url TEXT,
    availability BOOLEAN DEFAULT TRUE NOT NULL,
    country VARCHAR(255),
    region VARCHAR(255),
    grape_variety VARCHAR(255),
    volume_ml INTEGER,
    unit VARCHAR(50),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_providerproduct_catalog_id ON providerproduct(catalog_id);
CREATE INDEX IF NOT EXISTS idx_providerproduct_provider_id ON providerproduct(provider_id);
CREATE INDEX IF NOT EXISTS idx_providerproduct_external_id ON providerproduct(external_id);
CREATE INDEX IF NOT EXISTS idx_providerproduct_availability ON providerproduct(availability);
CREATE INDEX IF NOT EXISTS idx_providerproduct_price ON providerproduct(price_cents) WHERE price_cents IS NOT NULL;

-- Composite index for price comparison queries
CREATE INDEX IF NOT EXISTS idx_providerproduct_catalog_provider ON providerproduct(catalog_id, provider_id, availability, price_cents);

-- Tenant product selection (restaurants choose products)
CREATE TABLE IF NOT EXISTS tenantproduct (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    catalog_id INTEGER NOT NULL REFERENCES productcatalog(id) ON DELETE CASCADE,
    provider_product_id INTEGER REFERENCES providerproduct(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES product(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    price_cents INTEGER NOT NULL,
    image_filename VARCHAR(255),
    ingredients TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tenantproduct_tenant_id ON tenantproduct(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenantproduct_catalog_id ON tenantproduct(catalog_id);
CREATE INDEX IF NOT EXISTS idx_tenantproduct_provider_product_id ON tenantproduct(provider_product_id);
CREATE INDEX IF NOT EXISTS idx_tenantproduct_product_id ON tenantproduct(product_id);
CREATE INDEX IF NOT EXISTS idx_tenantproduct_is_active ON tenantproduct(is_active);
CREATE INDEX IF NOT EXISTS idx_tenantproduct_tenant_active ON tenantproduct(tenant_id, is_active);
