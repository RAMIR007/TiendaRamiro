# Approval Matrix

| Operation | Autonomous | Owner gate |
|---|---|---|
| Inspect repository, PRs, issues, CI | Yes | No |
| Edit code, CSS, static non-commercial copy, docs, tests, CI on branch | Yes | No |
| Open/update draft PR | Yes | No |
| Read-only DB/RPC/RLS audit, existing access, no cost | Yes | No |
| SQL writes, migrations, seeds, DDL/DML | No | Prohibited in this orchestrator |
| Change schema, RPC, SECURITY DEFINER, grants, RLS, DB permissions | No | Prohibited in this orchestrator |
| Alter stored products, prices, orders, users, stock or inventory | No | Prohibited in this orchestrator |
| Secrets, env vars, credentials, payments, domains, DNS, production Cloudflare config, account permissions | No | Prohibited in this orchestrator |
| Paid browser automation, paid APIs, paid Supabase branches/test environments, subscriptions or recurring services | No | No new cost; do not use in scheduled maintenance |
| Merge PR, production deploy/promote/rollback | No | Explicit approval for that exact PR or release |
| Real order, payment, purchase or transactional form | No | Prohibited; use synthetic tests only |

Default budget: zero. Generic approval or a broad instruction to “execute everything” does not override prohibited operations.