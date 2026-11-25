---
name: production-release-control
description: Mandatory operational procedure for evaluating production releases with exact-SHA checks, least privilege, explicit owner-controlled merge, rollback planning, and post-release verification.
---

# Production Release Control

## Purpose
This skill governs every merge-to-main and production-impacting release for RamiroX Market. It complements `.github/agents/production-release-manager.agent.md`; it is a procedure, not an autonomous process.

## Non-negotiable rules
1. Zero-cost default. No paid service, plan, runner, browser provider, or API without explicit budget approval.
2. No direct pushes to `main`; work through pull requests.
3. No bypassing branch protection or required checks.
4. Never merge based on a green check from an older or different commit.
5. No production deploy, promote, rollback, migration, SQL write, DNS, secret, or environment mutation without explicit authorization for that exact operation.
6. Never use production accounts or real customer/order/payment data in tests.
7. Never expose tokens, secret values, customer data, or sensitive response bodies.
8. The release workflow is read-only: it must never merge a PR or deploy to production.

## Release procedure
### A. Identify immutable release candidate
Record PR number, base SHA, current head SHA, changed paths, and whether merging to `main` triggers Cloudflare automatically. If any value changes, restart validation.

### B. Collect mandatory evidence
- Release-readiness: READY for the exact head SHA.
- Quality: tests and build successful for the exact head SHA.
- Security/dependency audit: successful for the exact head SHA.
- Browser journeys: successful for customer-facing changes, using synthetic fixtures and no production writes.
- Cloudflare verification: exact preview/build association and production deployment behavior understood.
- Security specialist review for auth, secrets, data, SQL, RLS/RPC, Worker, or deployment changes.
- Documentation and rollback/recovery plan complete.

A skipped check is not a pass unless this procedure explicitly allows that exact skip for a change that does not touch the corresponding system. A missing check is not a pass. A pending check is not a pass. If evidence cannot be retrieved, mark UNVERIFIED and stop.

### C. Automatic read-only release preflight
- The workflow `.github/workflows/protected-production-release.yml` runs automatically for every PR targeting `main`. It is read-only and does not execute PR code, so it can safely evaluate contributions from forks as well.
- It checks the exact current PR head SHA, open PR state, base branch, changed paths, required quality/security checks, conditional browser journey, all other check runs, and commit statuses.
- It waits for checks to finish, fails closed on failed/missing/pending evidence, and never runs storefront code or uses production data.
- The workflow has read-only permissions. It must not call the GitHub merge API, push commits, deploy, or modify repository settings.
- A successful result means only `READY TO MERGE MANUALLY`; it is not a merge or deployment approval.

### D. Sole-owner approval and merge
- No second reviewer or collaborator is required. Do not create a fake reviewer or add someone solely to satisfy an Environment rule.
- Do not create or require the GitHub Environment `production-release-approval` for this workflow. An Environment with required reviewers would block a solo maintainer or create a misleading approval step. If that Environment was created only for the old workflow, it is unused; it can be left untouched or removed manually, but the workflow must not reference it.
- Configure branch protection or a repository ruleset for `main`: require pull requests; require `Tests and static build check`, `Dependency vulnerability audit`, and `Revalidate exact release candidate`; require branches to be up to date; require conversation resolution; disallow force pushes and branch deletion. Do not require a human approving review when there is no second maintainer.
- After the preflight passes, the owner reviews the PR diff, readiness report, checks, and Cloudflare impact, then manually clicks **Merge** in GitHub. That click is the explicit authorization to merge and may trigger Cloudflare production deployment.
- Do not use auto-merge or a bot token to merge. Do not bypass branch protection. If GitHub blocks the owner merge because a required check or rule is unmet, stop and fix the underlying issue; do not weaken protection just to force the merge.
- If Cloudflare's GitHub integration is connected to the production Worker, assume merging to `main` can automatically deploy. Do not run a second manual deployment unless separately authorized.

### E. Execute and verify
After the owner merges, record the merge commit SHA and monitor the Cloudflare deployment associated with that merge. Verify the deployed version maps to the merged SHA, then run read-only production smoke checks. A PR preview build is not evidence that production changed.

### F. Failure response
If pre-merge validation fails, do not merge. If post-merge smoke fails, stop subsequent releases and report the exact evidence and rollback options. Rollback itself requires explicit authorization. Never apply emergency database migrations or data repairs without separate authorization.

## Required audit record
Store PR number, head SHA, merged SHA, owner merge evidence, check run IDs/conclusions, Cloudflare preview/build and production deployment identifiers, smoke-test timestamp/results, and any incident/rollback decision. Do not store secret values.
