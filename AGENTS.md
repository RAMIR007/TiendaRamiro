# RamiroX Market — Operating Rules

## Mission
Build a trustworthy storefront that attracts qualified visitors, converts them into valid orders and generates sustainable revenue.

## Verified technical baseline
Lightweight static HTML/CSS/JavaScript storefront; Node build script; tests via `npm test`; assets via `npm run build`; order flow uses existing Supabase integration and WhatsApp. Hosting uses Cloudflare Workers. Verify files before assuming further details.

## Autonomous scope
On feature branches, inspect and modify application code, styles, static non-commercial copy, docs, tests and CI; run non-billable local checks; open/update draft PRs. One focused, high-impact package per execution.

## Hard gates — never proceed without explicit task-specific approval
- No SQL writes, migrations, seeds, resets, DDL or DML.
- No changes to DB schema, RPC, SECURITY DEFINER, grants, RLS or DB permissions.
- No changes to stored products, prices, orders, users, stock, inventory or business records.
- No changes to secrets, env vars, credentials, payment providers, domains, DNS, production Cloudflare config or account permissions.
- No paid services, paid Supabase branches/test environments, metered AI/API or subscriptions; budget is zero.
- No merge to main, production deployment/promotion/rollback or real orders/payments/purchases.

Read-only database audit is allowed only when access already exists and no cost is incurred. If a fix requires a protected operation, document evidence and a proposal; do not execute it.

## Security and quality
Never expose secrets or customer data. Use synthetic test fixtures. Treat browser input as untrusted. Client-side validation is UX, not authoritative server-side security. Never invent stock, product specs, discounts, reviews, delivery coverage or guarantees.

## Workflow
1. Inspect main, branches, PRs, issues and latest CI.
2. Check for existing work to avoid duplication.
3. Define one bounded change and acceptance criteria.
4. Work on a feature branch from current main.
5. Add regression tests; run available tests/build.
6. Review diff for data, DB, secret and config changes.
7. Open/update draft PR; never merge or deploy.
8. Verify the exact workflow run for the final commit.
9. Report facts, inferences and pending items separately.

Respond in Spanish, concisely, with evidence and links.