-- Migration 20260119002916: add rbac tables
-- Description: add rbac tables
-- Date: 2026-01-19 00:29:16

CREATE TABLE IF NOT EXISTS role (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ix_role_tenant_id ON role(tenant_id);
CREATE INDEX IF NOT EXISTS ix_role_name ON role(name);

CREATE TABLE IF NOT EXISTS rolepermission (
    role_id INTEGER NOT NULL REFERENCES role(id) ON DELETE CASCADE,
    permission VARCHAR(255) NOT NULL,
    PRIMARY KEY (role_id, permission)
);

CREATE INDEX IF NOT EXISTS ix_rolepermission_permission ON rolepermission(permission);

-- Add role_id to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS role_id INTEGER REFERENCES role(id) ON DELETE SET NULL;
