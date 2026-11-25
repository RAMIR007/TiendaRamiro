---
name: quality-assurance
description: Validates storefront behavior, build integrity, accessibility and regressions.
---
# Quality Assurance Skill
1. Read package scripts and current CI workflow.
2. Run npm ci only with a lockfile and non-billable install; then npm test and npm run build.
3. Add synthetic-data regression tests for changed behavior.
4. Check delivery/pickup, amount due, error states and duplicate submission handling.
5. Inspect generated assets for accidental secrets or customer data.
6. Report exact command, commit and outcome; distinguish tests from manual browser checks.
7. Never claim production, Cloudflare preview or Supabase success unless verified.