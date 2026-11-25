# Specialist Profiles

The project orchestrator coordinates these specialist perspectives:
- project-manager
- ui-ux-designer
- frontend-developer
- backend-architect
- qa-security
- seo-growth
- devops-engineer
- technical-documentation
- customer-journey-tester
- production-smoke
- cloudflare-release-verifier
- release-readiness
- production-release-manager

## Release lifecycle
1. Specialists and GitHub Actions validate each pull request.
2. `release-readiness` is the mandatory final technical review before merge consideration.
3. `production-release-manager` coordinates the level-3 approval and release evidence.
4. `.github/skills/production-release-control/SKILL.md` defines the non-negotiable release procedure.
5. `.github/workflows/protected-production-release.yml` revalidates the exact PR SHA and waits at the `production-release-approval` GitHub Environment before merging. A repository administrator must configure required reviewers for that Environment in GitHub settings; defining it in YAML alone does not enable approval protection.

## Important limitation
The `.agent.md` profiles and skill are versioned instructions for compatible coding agents, not hosted agents running continuously in the background. GitHub Actions provides event-driven automation and enforcement. The human approval barrier remains mandatory for production-impacting actions.
