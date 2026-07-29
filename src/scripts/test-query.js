import { Client } from 'pg';

async function run() {
  const client = new Client({
    connectionString: "postgres://komanda_migration:npg_Ed7czuVILb5Q@ep-steep-heart-acx3nqbn.sa-east-1.aws.neon.tech/komanda?sslmode=require"
  });
  await client.connect();
  const sql = `
    SELECT * from pg_policies where tablename = 'tenant_memberships'
  `;
  const res = await client.query(sql);
  console.log("Policies:", res.rows);
  await client.end();
}
run().catch(console.error);