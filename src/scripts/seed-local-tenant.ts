import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { Pool } from "pg";

const defaultOwnerEmail = process.env.DEV_OWNER_EMAIL ?? "owner@komanda.test";
const defaultOwnerPassword = process.env.DEV_OWNER_PASSWORD ?? "Komanda123!";
const defaultTenantName = process.env.DEV_TENANT_NAME ?? "Restaurante Demo";
const defaultTenantSlug = process.env.DEV_TENANT_SLUG ?? "demo-resto";

async function main() {
  const directUrl = process.env.DATABASE_DIRECT_URL;
  if (!directUrl) throw new Error("DATABASE_DIRECT_URL is required.");

  const pool = new Pool({ connectionString: directUrl, max: 1 });

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // 1. Plan definition
      await client.query(
        `INSERT INTO plan_definitions (plan_id, version, status, entitlements, effective_from)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (plan_id, version)
         DO UPDATE SET status = $3, entitlements = $4`,
        [
          "development",
          1,
          "active",
          JSON.stringify({
            catalog_management: true,
            online_payments: true,
            printing: true,
          }),
          new Date("2024-01-01T00:00:00.000Z"),
        ],
      );

      // 2. Owner user
      const normalizedEmail = defaultOwnerEmail.trim().toLowerCase();
      const existingUser = await client.query<{ id: string }>(
        `SELECT id FROM users WHERE normalized_email = $1`,
        [normalizedEmail],
      );

      let userId = existingUser.rows[0]?.id;
      const passwordHash = await bcrypt.hash(defaultOwnerPassword, 12);

      if (!userId) {
        userId = randomUUID();
        await client.query(
          `INSERT INTO users (id, email, normalized_email, password_hash, status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'active', now(), now())`,
          [userId, defaultOwnerEmail, normalizedEmail, passwordHash],
        );
      } else {
        await client.query(
          `UPDATE users SET password_hash = $1, status = 'active', updated_at = now() WHERE id = $2`,
          [passwordHash, userId],
        );
      }

      // 3. Tenant
      const normalizedSlug = defaultTenantSlug.trim().toLowerCase();
      const existingTenant = await client.query<{ id: string }>(
        `SELECT id FROM tenants WHERE normalized_slug = $1`,
        [normalizedSlug],
      );

      let tenantId = existingTenant.rows[0]?.id;
      if (!tenantId) {
        tenantId = randomUUID();
        await client.query(
          `INSERT INTO tenants (id, name, slug, normalized_slug, status, default_currency, default_timezone, version, activated_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'active', 'ARS', 'America/Argentina/Buenos_Aires', 1, now(), now(), now())`,
          [tenantId, defaultTenantName, defaultTenantSlug, normalizedSlug],
        );
      } else {
        await client.query(
          `UPDATE tenants SET status = 'active', activated_at = COALESCE(activated_at, now()), updated_at = now() WHERE id = $1`,
          [tenantId],
        );
      }

      // 4. Primary Location
      const existingLoc = await client.query<{ id: string }>(
        `SELECT id FROM tenant_locations WHERE tenant_id = $1 AND is_primary = true`,
        [tenantId],
      );
      if (existingLoc.rows.length === 0) {
        await client.query(
          `INSERT INTO tenant_locations (id, tenant_id, name, timezone, status, is_primary, created_at, updated_at)
           VALUES ($1, $2, 'Local Principal', 'America/Argentina/Buenos_Aires', 'active', true, now(), now())`,
          [randomUUID(), tenantId],
        );
      }

      // 5. Tenant Settings
      await client.query(
        `INSERT INTO tenant_settings (tenant_id, sales_enabled, printing_enabled, menu_theme, order_prefix, updated_at)
         VALUES ($1, true, true, 'classic', 'DEMO', now())
         ON CONFLICT (tenant_id)
         DO UPDATE SET sales_enabled = true, printing_enabled = true, updated_at = now()`,
        [tenantId],
      );

      // 6. Tenant Membership
      await client.query(
        `INSERT INTO tenant_memberships (id, tenant_id, user_id, role, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'owner', 'active', now(), now())
         ON CONFLICT (tenant_id, user_id)
         DO UPDATE SET role = 'owner', status = 'active', updated_at = now()`,
        [randomUUID(), tenantId, userId],
      );

      // 7. Tenant Counter
      await client.query(
        `INSERT INTO tenant_counters (tenant_id, counter_type, current_value, updated_at)
         VALUES ($1, 'purchase_number', 0, now())
         ON CONFLICT (tenant_id, counter_type) DO NOTHING`,
        [tenantId],
      );

      // 8. Entitlement Snapshot
      const existingSnapshot = await client.query(
        `SELECT id FROM tenant_entitlement_snapshots WHERE tenant_id = $1`,
        [tenantId],
      );
      if (existingSnapshot.rows.length === 0) {
        await client.query(
          `INSERT INTO tenant_entitlement_snapshots (id, tenant_id, plan_id, plan_version, entitlements, source_request_id, effective_at, created_at)
           VALUES ($1, $2, 'development', 1, $3, 'seed-local', now(), now())`,
          [
            randomUUID(),
            tenantId,
            JSON.stringify({
              catalog_management: true,
              online_payments: true,
              printing: true,
            }),
          ],
        );
      }

      // 9. Catalog Items (bypass RLS for seeding via direct migration connection)
      const existingCat = await client.query<{ id: string }>(
        `SELECT id FROM catalog_categories WHERE tenant_id = $1 LIMIT 1`,
        [tenantId],
      );

      if (existingCat.rows.length === 0) {
        const catBurgerId = randomUUID();
        const catDrinksId = randomUUID();

        await client.query(
          `INSERT INTO catalog_categories (id, tenant_id, name, normalized_name, sort_order, status, version, created_at, updated_at)
           VALUES
             ($1, $2, 'Hamburguesas', 'hamburguesas', 1, 'active', 1, now(), now()),
             ($3, $2, 'Bebidas', 'bebidas', 2, 'active', 1, now(), now())`,
          [catBurgerId, tenantId, catDrinksId],
        );

        await client.query(
          `INSERT INTO catalog_items (id, tenant_id, category_id, name, normalized_name, description, price, currency, sort_order, status, version, created_at, updated_at)
           VALUES
             ($1, $2, $3, 'Hamburguesa Completa', 'hamburguesa completa', 'Carne 180g, queso cheddar, lechuga y tomate', '4500.00', 'ARS', 1, 'active', 1, now(), now()),
             ($4, $2, $3, 'Papas Fritas Grandes', 'papas fritas grandes', 'Papas rústicas con salsa alioli', '2200.00', 'ARS', 2, 'active', 1, now(), now()),
             ($5, $2, $6, 'Gaseosa 500ml', 'gaseosa 500ml', 'Línea Coca-Cola', '1500.00', 'ARS', 1, 'active', 1, now(), now())`,
          [randomUUID(), tenantId, catBurgerId, randomUUID(), randomUUID(), catDrinksId],
        );
      }

      await client.query("COMMIT");

      console.log("\n=======================================================");
      console.log("  TENANT CREADO Y LISTO PARA DESARROLLO");
      console.log("=======================================================");
      console.log(`Tenant ID:         ${tenantId}`);
      console.log(`Tenant Slug:       ${defaultTenantSlug}`);
      console.log(`Email Dueño:       ${defaultOwnerEmail}`);
      console.log(`Contraseña:        ${defaultOwnerPassword}`);
      console.log("-------------------------------------------------------");
      console.log(`Pedidos (Admin):   http://localhost:3000/admin/${tenantId}/orders`);
      console.log(`Nuevo Pedido:      http://localhost:3000/admin/${tenantId}/orders/new`);
      console.log(`Login:             http://localhost:3000/login`);
      console.log("=======================================================\n");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Error al aprovisionar tenant local:", err);
  process.exitCode = 1;
});
