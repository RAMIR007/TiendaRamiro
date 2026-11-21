---
name: security-audit
description: Reviews frontend, dependencies, privacy and authorization boundaries without protected infrastructure changes.
---
# Security Audit Skill
1. Inspect changed code for unsafe HTML insertion, XSS, injection, weak validation and data leakage.
2. Check dependency advisories and lockfile changes with non-billable tooling.
3. Review workflow token permissions and secret exposure.
4. Trace sensitive order fields; tests/logs must use synthetic data.
5. Inspect Supabase RPC, grants, RLS and SECURITY DEFINER read-only only.
6. Classify findings with evidence and realistic impact.
7. Never modify DB security configuration, secrets, credentials or production permissions.