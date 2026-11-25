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
- The final release action must run through a GitHub Actions workflow targeting the protected GitHub Environment `production-release-approval`.
- A repository administrator must configure required reviewers and prevent self-review for that environment in GitHub settings. A workflow reference to an Environment alone does not create its protection rules.
- The approver must inspect the exact PR and SHA and approve the waiting deployment job.
- Do not configure or weaken the Environment, branch protection, or required checks from this skill.
- If the protected Environment is not configured, the workflow must be treated as unavailable and the release remains blocked.
- The workflow also requires the repository Actions variable `PRODUCTION_RELEASE_GATES_CONFIGURED=true`. Set it only after configuring the `production-release-approval` Environment with required reviewers and self-review disabled, and configuring `main` branch protection/rulesets with required CI checks. The variable is a fail-closed operator assertion, not independent proof of those settings. If unsure, leave it unset.

### D. Execute and verify
After approval, the protected workflow may merge only after revalidating PR state and all check runs. If merge automatically triggers Cloudflare, monitor that deployment; do not launch a second deploy. Verify the deployed version maps to the merged SHA, then run read-only production smoke checks.

### E. Failure response
If pre-merge validation fails, do not merge. If post-merge smoke fails, stop subsequent releases and report the exact evidence and rollback options. Rollback itself requires explicit authorization. Never apply emergency database migrations or data repairs without separate authorization.

## Required audit record
Store PR number, head SHA, merged SHA, approver evidence, check run IDs/conclusions, Cloudflare build/deployment identifiers, smoke-test timestamp/results, and any incident/rollback decision. Do not store secret values.
