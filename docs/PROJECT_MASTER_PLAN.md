# RamiroX Market — Master Plan

## Goal
A trustworthy storefront that converts qualified traffic into valid, fulfilled orders and creates sustainable revenue.

## Phase 0 — Team foundation
- Define 8 specialist profiles and 8 Skills.
- Define one orchestrator and explicit approval gates.
- Configure supported coding environments to load the profiles.

## Phase 1 — Order integrity (highest priority)
- Review checkout, commissions, delivery fee and order payload.
- Commission/RPC mismatch and legacy RPC exposure require a separately reviewed, owner-approved DB change.
- No migration or live Supabase write without explicit approval and safe test plan.
- Verify Cloudflare preview separately from GitHub Actions.

## Phase 2 — Customer trust and conversion
- Audit home, categories, product cards, cart and checkout.
- Clarify delivery vs pickup, payment method, order steps and contact.
- Improve imagery, mobile layout, form feedback and accessibility.
- Do not change stored catalog/pricing/stock in frontend work.

## Phase 3 — Growth
- Metadata, canonical, sitemap, robots, structured data and internal links.
- Accurate category and informational copy.
- Low-cost acquisition plan based on fulfillment capacity.
- Privacy-conscious funnel baseline.

## Phase 4 — Operational quality
- Regression tests for shopping journeys.
- Least-privilege CI, dependency checks and reproducible builds.
- Accessibility, performance and support runbooks.

## Phase 5 — Revenue and reinvestment
Measure qualified traffic, valid/fulfilled orders and contribution margin. Do not scale paid ads or tooling until unit economics and fulfillment are understood. Reinvest validated operating surplus, not speculative revenue.