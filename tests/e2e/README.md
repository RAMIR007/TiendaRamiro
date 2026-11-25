# Browser tests (Playwright)

These end-to-end tests run the static storefront locally and use synthetic catalog/category fixtures.

## Local setup

1. Install the repository dependencies: `npm ci`.
2. Install the pinned browser test runner: `npm install --no-save --package-lock=false @playwright/test@1.65.1`.
3. Install Chromium: `npx playwright install chromium`.
4. Run: `npm run test:e2e`.

The test runner starts `npm run serve` on `http://127.0.0.1:8080`.

## Coverage

The suite runs each journey in desktop Chromium and a mobile Chromium profile: catalog rendering and accessibility landmarks, text/category filtering, empty search recovery, cart quantity and subtotal calculations, cart close/reopen recovery, invalid checkout handling, and mobile cart navigation.

## Safety

- Supabase catalog reads are intercepted and answered with synthetic fixtures.
- Writes to the Supabase origin are blocked and recorded.
- Other external network requests are blocked.
- Tests do not submit a valid checkout, create orders, send WhatsApp messages, send email, process payments, or use real customer accounts.
- Never point these tests at a production or customer-data environment.
