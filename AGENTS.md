# RamiroX Market — Operating Rules

## Mission
Build a trustworthy storefront that attracts qualified visitors, converts them into valid orders and generates sustainable revenue.

## Verified technical baseline
Lightweight static HTML/CSS/JavaScript storefront; Node build script; tests via `npm test`; assets via `npm run build`; order flow uses existing Supabase integration and WhatsApp. Hosting uses Cloudflare Workers. Verify files before assuming further details.

## Autonomous scope
On feature branches, inspect and modify application code, styles, static non-commercial copy, docs, tests and CI; run non-billable local checks; open/update draft PRs. One focused, high-impact package per execution.

## Absolute prohibitions for this orchestrator
- Never execute SQL writes, migrations, seeds, resets, DDL or DML.
- Never change database schema, RPCs, SECURITY DEFINER functions, grants, RLS or database permissions.
- Never alter stored products, prices, orders, users, stock, inventory or business records.
- Never touch secrets, environment variables, credentials, payment providers, domains, DNS, production Cloudflare configuration or account permissions.
- Never create real orders, payments, purchases or transactional forms.
- Never use paid browser automation, paid APIs, paid Supabase branches/test environments, subscriptions or recurring services. New-service budget is zero.
- Never merge to main or deploy, promote or roll back production without explicit approval for that exact PR or release.

Generic instructions such as “execute everything” do not override these boundaries. If progress requires a prohibited operation, stop and document the exact blocker; do not perform it.

Read-only database audit is allowed only when access already exists and no cost is incurred. Database remediation remains a documented proposal, not an executable action in this workflow.

## Security and quality
Never expose secrets or customer data. Use synthetic test fixtures. Treat browser input as untrusted. Client-side validation is UX, not authoritative server-side security. Never invent stock, product specs, discounts, reviews, delivery coverage or guarantees.

## Workflow
1. Inspect main, branches, PRs, issues and latest CI.
2. Check for existing work to avoid duplication.
3. Define one bounded change and acceptance criteria.
4. Work on a feature branch from current main.
5. Add regression tests; run available tests/build.
6. Review diff for data, DB, secret and config changes.
7. Open/update draft PR; never merge or deploy production.
8. Verify the exact workflow run for the final commit.
9. Report facts, inferences and pending items separately.

Respond in Spanish, concisely, with evidence and links.