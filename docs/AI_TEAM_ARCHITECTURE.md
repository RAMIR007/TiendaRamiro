# RamiroX Market — AI Team Architecture

One coordinated orchestrator uses eight specialist profiles:
1. Project Manager / Orchestrator — intake, prioritization, approval gates, acceptance.
2. UI/UX Designer — shopping journey, visual system, mobile and accessibility.
3. Frontend Developer — implementation in the existing static stack.
4. Backend Architect — order contracts and Supabase trust boundaries; read-only audit only.
5. SEO & Growth Specialist — discovery, conversion, trust and low-cost growth.
6. QA & Security Engineer — regression, privacy, dependency and security checks.
7. DevOps Engineer — CI/build/Cloudflare readiness, never production operations.
8. Technical Documentation Agent — runbooks, decisions and evidence.

Eight Skills live under `.github/skills/`: project-architecture, frontend-design, ecommerce-development, supabase-readonly-audit, quality-assurance, security-audit, seo-conversion, cloudflare-operations.

Workflow: inspect -> prioritize -> specialist analysis -> scoped implementation -> QA/security -> docs -> draft PR -> owner approval gate.

These Markdown profiles are version-controlled instructions. They do not instantiate independent background agents by themselves. The orchestrator coordinates specialist perspectives in one execution unless a compatible coding platform explicitly loads them.

Reuse the framework across apps, but tailor each app's project brief, data model, brand, stack, deployment and business rules. Never copy credentials, customer data, catalog or environment configuration between apps.