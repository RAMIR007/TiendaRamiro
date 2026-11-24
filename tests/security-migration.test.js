const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'supabase/migrations/20261124110711_security_min_privilege.sql'),
  'utf8'
);

assert.match(migration, /alter default privileges for role postgres in schema public\s+revoke all on tables from anon, authenticated/i);
assert.doesNotMatch(migration, /alter default privileges for role supabase_admin/i);
assert.match(migration, /revoke all privileges on all tables in schema public from anon, authenticated/i);
assert.match(migration, /revoke all privileges on all sequences in schema public from anon, authenticated/i);
assert.match(migration, /grant select on table public\.products, public\.categories to anon/i);
assert.match(migration, /grant execute on function public\.create_order\(text, text, text, text, text, text, jsonb\)\s+to anon, authenticated/i);
assert.match(migration, /revoke all privileges on function public\.create_order\(text, text, text, jsonb\)\s+from public, anon, authenticated/i);
assert.match(migration, /alter function public\.create_order\(text, text, text, text, text, text, jsonb\) set search_path = pg_catalog/i);
assert.match(migration, /alter function public\.handle_new_user\(\) set search_path = pg_catalog/i);
assert.match(migration, /grant execute on function public\.is_admin\(\), public\.is_staff\(\) to authenticated/i);
assert.match(migration, /create or replace function public\.is_admin\(\)[\\s\\S]*auth\\.uid\\(\)/i);\nassert.match(migration, /revoke execute on all functions in schema public from public, anon, authenticated/i);
assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete)[\s\S]{0,120}public\.orders\s+to anon/i);
assert.doesNotMatch(migration, /grant\s+(?:insert|update|delete)[\s\S]{0,120}public\.profiles\s+to anon/i);

console.log('Seguridad SQL propuesta: todas las comprobaciones OK.');

const customerMigration = fs.readFileSync(
  path.join(__dirname, '..', 'supabase/migrations/20261124110804_customer_accounts.sql'),
  'utf8'
);
assert.match(customerMigration, /add column if not exists customer_email text/i);
assert.match(customerMigration, /add column if not exists customer_id uuid references auth\.users/i);
assert.match(customerMigration, /email_confirmed_at is not null/i);
assert.match(customerMigration, /lower\(trim\(customer_email\)\) = v_email/i);
assert.match(customerMigration, /create policy orders_customer_read_own/i);
assert.match(customerMigration, /create policy order_items_customer_read_own/i);
assert.match(customerMigration, /grant execute on function public\.claim_my_orders\(\) to authenticated/i);
assert.doesNotMatch(customerMigration, /grant execute on function public\.claim_my_orders\(\) to anon/i);
