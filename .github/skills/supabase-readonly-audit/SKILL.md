---
name: supabase-readonly-audit
description: Audits Supabase RPC, RLS, grants and order integrity in read-only mode.
---
# Supabase Read-only Audit Skill
1. Distinguish live schema from repository migrations.
2. Read only: inspect function signatures, grants, RLS policies, triggers and client calls.
3. Trace who can invoke each RPC and which fields are validated or trusted.
4. Check price/stock authority, commission snapshots, duplicate lines and seller attribution.
5. Record evidence, role context and date; do not infer exploitability without proof.
6. Never execute SQL writes, migrations, DDL, DML, seeds or resets.
7. Never alter schema, RPC, SECURITY DEFINER, grants, RLS or DB permissions.
8. Do not create paid Supabase branches/test environments without explicit budget approval.
9. Produce a remediation proposal, not an unapproved change.