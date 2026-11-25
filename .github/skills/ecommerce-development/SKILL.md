---
name: ecommerce-development
description: Improves catalog, cart and order journeys while preserving existing checkout architecture.
---
# E-commerce Development Skill
1. Trace the actual journey from catalog to WhatsApp/order confirmation.
2. Verify how totals, delivery fee, pickup, cash amount and order payload are calculated.
3. Keep displayed totals and submitted payload consistent; use integer cents for money.
4. Treat browser validation as usability support, not authoritative security.
5. Test empty cart, quantity changes, unavailable item, pickup, delivery and insufficient cash.
6. Use synthetic fixtures and mocks; never submit a real order.
7. Do not change stored products, prices, stock, orders or payment config.
8. Add regression tests for each fixed checkout defect.