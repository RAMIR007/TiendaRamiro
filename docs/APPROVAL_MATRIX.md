# Approval Matrix

| Operation | Autonomous | Owner gate |
|---|---|---|
| Inspect repository, PRs, issues, CI | Yes | No |
| Edit code, CSS, static non-commercial copy, docs, tests, CI on branch | Yes | No |
| Open/update draft PR | Yes | No |
| Read-only DB/RPC/RLS audit, existing access, no cost | Yes | No |
| SQL writes, migrations, seeds, DDL/DML | No | Explicit authorization for the named project and migration |
| Change schema, RPC, SECURITY DEFINER, grants, RLS, DB permissions | No | Explicit authorization for the exact change |
| Alter stored products, prices, orders, users, stock or inventory | No | Explicit authorization for the exact data operation |
| Secrets, env vars, credentials, payments, domains, DNS, production Cloudflare config, account permissions | No | Explicit authorization for the exact change |
| Paid browser automation, paid APIs, paid Supabase branches/test environments, subscriptions or recurring services | No | Explicit budget approval; default new-service budget is zero |
| Merge PR, production deploy/promote/rollback | No | Explicit approval for that exact PR or release |
| Real order, payment, purchase or transactional form as a test | Never | Prohibited; use synthetic tests only |

A generic instruction to “execute everything” does not override these gates. When the owner explicitly authorizes a specific gated operation, execute only that scope and verify the outcome.