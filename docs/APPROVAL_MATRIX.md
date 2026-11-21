# Approval Matrix

| Operation | Autonomous | Owner gate |
|---|---|---|
| Inspect repository, PRs, issues, CI | Yes | No |
| Edit code, CSS, static non-commercial copy, docs, tests, CI on branch | Yes | No |
| Open/update draft PR | Yes | No |
| Read-only DB/RPC/RLS audit, existing access, no cost | Yes | No |
| SQL writes, migrations, seeds, DDL/DML | No | Explicit task-specific approval |
| Change schema, RPC, SECURITY DEFINER, grants, RLS, DB permissions | No | Explicit task-specific approval |
| Alter stored products, prices, orders, users, stock or inventory | No | Explicit approval |
| Secrets, env vars, credentials, payments, domains, DNS, production Cloudflare | No | Explicit approval |
| Paid service, paid Supabase branch/test environment, metered AI/API | No | Explicit budget approval |
| Merge PR, production deploy/promote/rollback | No | Explicit approval for that PR/release |
| Real order, payment or purchase | No | Explicit transaction approval |

Approval for one action does not authorize future unrelated actions. Default budget: zero.