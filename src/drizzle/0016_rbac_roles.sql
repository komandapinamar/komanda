-- 0016_rbac_roles.sql
-- Expand role check constraint to support admin and employee roles

ALTER TABLE tenant_memberships
DROP CONSTRAINT IF EXISTS tenant_memberships_role_check;

ALTER TABLE tenant_memberships
ADD CONSTRAINT tenant_memberships_role_check
CHECK (role IN ('owner', 'admin', 'employee'));
