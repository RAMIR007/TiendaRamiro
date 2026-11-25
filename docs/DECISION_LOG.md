# Decision Log

## 2026-11-21 — RamiroX Market specialist foundation
- RamiroX Market is the first implementation target.
- Eight specialist profiles and eight procedural Skills are version-controlled in this repository.
- One orchestrator coordinates the specialist perspectives; Markdown files do not instantiate independent background agents by themselves.
- Safe autonomous scope: code, styles, static non-commercial copy, tests, docs and CI on feature branches.
- Database access is read-only: no SQL writes, migrations, DDL/DML, schema, RPC, SECURITY DEFINER, grants, RLS, permission or business-record changes.
- No real orders, payments or purchases are created.
- No paid services or new recurring costs are used; default budget is zero.
- Merge and production deployment remain gated by explicit approval for the exact PR or release.