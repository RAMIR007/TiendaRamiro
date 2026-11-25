---
name: cloudflare-operations
description: Maintains build and preview readiness for Cloudflare Workers while protecting production.
---
# Cloudflare Operations Skill
1. Inspect current wrangler config and CI before recommending changes.
2. Validate build output and asset paths locally where possible.
3. Separate GitHub Actions, Cloudflare preview and production deployment status.
4. Review permissions; CI should use least privilege.
5. Do not change production secrets, variables, domains, DNS, account access, billing or critical Cloudflare settings.
6. Never deploy, promote or roll back production without explicit approval.
7. Report exact commit and environment for every verified result.