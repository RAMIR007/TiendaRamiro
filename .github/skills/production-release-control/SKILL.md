---
name: production-release-control
description: Mandatory operational procedure for evaluating and carrying out level-3 production releases with exact-SHA checks, protected human approval, least privilege, rollback planning, and post-release verification.
---

# Production Release Control

## Purpose
This skill governs every merge-to-main and production-impacting release for RamiroX Market. It complements `.github/agents/production-release-manager.agent.md`; it is a procedure, not an autonomous process.

## Non-negotiable rules
1. Zero-cost default. No paid service, plan, runner, browser provider, or API without explicit budget approval.
2. No direct pushes to `main`; work through pull requests.
3. No bypassing branch protection, required checks, or GitHub Environment protection.
4. No merging based on a green check from an older or different commit.
5. No production deploy, promote, rollback, migration, SQL write, DNS, secret, or environment mutation without explicit authorization for that exact operation.
6. Never use production accounts or real customer/order/payment data in tests.
7. Never expose tokens, secret values, customer data, or sensitive response bodies.

## Release procedure
### A. Identify immutable release candidate
Record PR number, base SHA, current head SHA, changed paths, and whether merge triggers Cloudflare automatically. If any value changes, restart validation.

### B. Collect mandatory evidence
- Release-readiness: READY for exact head SHA.
- Quality: tests and build successful for exact head SHA.
- Security/dependency audit: successful for exact head SHA.
- Browser journeys: successful for customer-facing changes, using synthetic fixtures and no production writes.
- Cloudflare verification: exact build/deployment association and environment understood.
- Security specialist review for auth, secrets, data, SQL, RLS/RPC, Worker or deployment changes.
- Documentation and rollback/recovery plan complete.

A skipped check is not a pass. A missing check is not a pass. A pending check is not a pass. If evidence cannot be retrieved, mark UNVERIFIED and stop.

### C. Human approval boundary
- The release workflow must be started manually by repository owner `RAMIR007`, with the exact PR number, exact current 40-character head SHA, and the explicit confirmation `I_APPROVE_MERGE_AND_POSSIBLE_CLOUDFLARE_DEPLOYMENT`.
- The workflow rejects runs started by any other GitHub actor and revalidates the exact PR SHA and check results immediately before merge.
- This manual dispatch is the zero-cost approval mechanism for the current private repository setup. It is not equivalent to a protected GitHub Environment with independent reviewer approval.
- GitHub Free does not provide required deployment reviewers for private repositories, and protected branches/rulesets for private repositories require GitHub Pro or higher. Do not make this store repository public merely to obtain those controls.
- If the repository later moves to GitHub Pro or a suitable Team plan, add the `production-release-approval` Environment with required reviewers and self-review disabled, plus branch protection requiring the exact CI checks. Do not claim these protections are active before verifying them.

### D. Execute and verify
After approval, the protected workflow may merge only after revalidating PR state and all check runs. If merge automatically triggers Cloudflare, monitor that deployment; do not launch a second deploy. Verify the deployed version maps to the merged SHA, then run read-only production smoke checks.

### E. Failure response
If pre-merge validation fails, do not merge. If post-merge smoke fails, stop subsequent releases and report the exact evidence and rollback options. Rollback itself requires explicit authorization. Never apply emergency database migrations or data repairs without separate authorization.

## Required audit record
Store PR number, head SHA, merged SHA, approver evidence, check run IDs/conclusions, Cloudflare build/deployment identifiers, smoke-test timestamp/results, and any incident/rollback decision. Do not store secret values.
