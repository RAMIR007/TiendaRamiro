---
name: customer-journey-testing
description: Exercises storefront customer journeys safely with synthetic data and no real transactions.
---
# Customer Journey Testing Skill

1. Identify the exact app version, environment, browser and viewport.
2. Start with read-only navigation: landing, categories, product pages and account page.
3. Exercise cart operations with synthetic/local data and verify totals and validation.
4. Test guest checkout only up to the final confirmation/submit boundary; do not create a real order.
5. Test account and Google OAuth UI without exposing secrets or using a real customer's account.
6. Check keyboard usability, responsive layouts, console errors, failed network requests and empty/error states.
7. Run `npm run test:e2e` when Playwright and Chromium are installed; extend the synthetic-fixture tests for any newly covered flow. CI installs a pinned runner temporarily without changing the project lockfile. Do not use paid browser services.
8. Record steps, expected/actual results, severity, evidence and commit SHA.
9. Never touch production data, send messages/emails, initiate payment, or claim untested coverage.
