---
name: release-readiness
description: Performs an evidence-based pre-merge review of a pull request against main.
---
# Release Readiness Skill

1. Pin the review to the exact PR head SHA and base SHA.
2. Inspect all changed files and the full diff; do not rely on PR title or summary.
3. Confirm all required checks for that exact SHA are completed successfully.
4. Verify npm tests, static build, dependency/security results, and unresolved review threads. For storefront/customer-flow changes, also require passing Playwright browser checks on the exact PR head SHA.
5. Check scope boundaries: no unapproved DB, secrets, commercial data, production, DNS or deployment changes.
6. Review customer-impacting regressions and operational/rollback notes.
7. Return READY, NOT READY, or NEEDS MANUAL VALIDATION with evidence and blockers.
8. This skill never authorizes or performs merge/deployment; owner approval for the exact PR remains mandatory.
