const { test, expect } = require('@playwright/test');

const SUPABASE_ORIGIN = 'https://zpttucawhdmhgqeuzaup.supabase.co';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

const products = [
  {
    id: PRODUCT_ID,
    name: 'Auriculares de prueba',
    category: 'tecnologia',
    price_cents: 2800,
    stock: 4,
    supplier_available: false,
    badge: 'Prueba',
    description: 'Producto sintético para pruebas de navegador.',
    images: ['/img/placeholder-400.webp'],
    variants: ['Negro', 'Blanco'],
    active: true,
    created_at: '2026-01-01T10:00:00Z'
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Camiseta de prueba',
    category: 'moda',
    price_cents: 2000,
    stock: 2,
    supplier_available: false,
    badge: null,
    description: 'Segundo producto sintético.',
    images: ['/img/placeholder-400.webp'],
    variants: ['M'],
    active: true,
    created_at: '2026-01-02T10:00:00Z'
  }
];

const categories = [
  { key: 'tecnologia', label: 'Tecnología', emoji: '⚡', active: true },
  { key: 'moda', label: 'Moda', emoji: '👕', active: true }
];

async function installSafeNetworkMocks(page) {
  const sideEffects = [];

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === SUPABASE_ORIGIN) {
      if (request.method() === 'GET' && url.pathname === '/rest/v1/products') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(products)
        });
        return;
      }

      if (request.method() === 'GET' && url.pathname === '/rest/v1/categories') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(categories)
        });
        return;
      }

      if (!['GET', 'HEAD'].includes(request.method())) {
        sideEffects.push({ method: request.method(), path: url.pathname });
      }

      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Blocked by safe Playwright test fixture' })
      });
      return;
    }

    if (url.origin === 'http://127.0.0.1:8080' || url.origin === 'http://localhost:8080') {
      await route.continue();
      return;
    }

    await route.abort();
  });

  return sideEffects;
}

test.beforeEach(async ({ page }) => {
  page.sideEffects = await installSafeNetworkMocks(page);
});

test('muestra catálogo, categorías y metadatos accesibles', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/RamiroX Market/i);
  await expect(page.locator('.product-card')).toHaveCount(2);
  await expect(page.locator('#categoriesPills')).toHaveAttribute('role', 'group');
  await expect(page.getByRole('searchbox', { name: /buscar productos/i })).toBeVisible();
  await expect(page.locator('.skip-link')).toHaveAttribute('href', '#mainContent');
});

test('filtra productos por texto y categoría', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(2);

  await page.getByRole('searchbox', { name: /buscar productos/i }).fill('Camiseta');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText('Camiseta de prueba');

  await page.getByRole('searchbox', { name: /buscar productos/i }).fill('');
  await page.locator('#categoriesPills [data-cat="tecnologia"]').click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText('Auriculares de prueba');
});

test('añade un artículo, actualiza el total y abre el carrito', async ({ page }) => {
  await page.goto('/');
  await page.locator(`.product-card[data-id="${PRODUCT_ID}"] .btn-add-quick`).click();

  await expect(page.locator('.cart-count').first()).toHaveText('1');
  await page.getByRole('button', { name: 'Abrir carrito' }).click();
  await expect(page.locator('#cartDrawerOverlay')).toHaveClass(/open/);
  await expect(page.locator('#cartItemsList')).toContainText('Auriculares de prueba');
  await expect(page.locator('#cartSubtotal')).toHaveText('$28 USD');

  await page.getByRole('button', { name: /añadir una unidad de Auriculares de prueba/i }).click();
  await expect(page.locator('.cart-count').first()).toHaveText('2');
  await expect(page.locator('#cartSubtotal')).toHaveText('$56 USD');
});

test('checkout vacío muestra validaciones y nunca crea un pedido', async ({ page }) => {
  await page.goto('/');
  await page.locator(`.product-card[data-id="${PRODUCT_ID}"] .btn-add-quick`).click();
  await page.getByRole('button', { name: 'Abrir carrito' }).click();

  await page.locator('#checkoutForm').evaluate((form) => {
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });

  await expect(page.locator('#clientName')).toHaveClass(/invalid/);
  expect(page.sideEffects).toEqual([]);
});


test('checkout de mensajería usa el subtotal del servidor y no envía precios del navegador', async ({ page }) => {
  let orderPayload = null;
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/rpc/create_order`, async (route) => {
    orderPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        order_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
        order_code: 'E2E-DELIVERY-001',
        total_cents: 39500,
        commission_cents: 0,
        count: 1
      })
    });
  });
  await page.addInitScript(() => {
    window.__testWhatsAppUrl = null;
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith('https://wa.me/')) {
        window.__testWhatsAppUrl = this.href;
        return;
      }
      return nativeClick.call(this);
    };
  });

  await page.goto('/');
  await page.locator(`.product-card[data-id="${PRODUCT_ID}"] .btn-add-quick`).click();
  await page.locator('.cart-floating-fab:visible, .btn-cart-nav:visible').first().click();
  await page.locator('#clientName').fill('Cliente E2E');
  await page.locator('#clientPhone').fill('5355555555');
  await page.locator('#deliveryMethod').selectOption('domicilio');
  await page.locator('#clientMunicipality').fill('Playa');
  await page.locator('#clientAddress').fill('Calle 23, número 12');
  await page.locator('#clientReference').fill('Frente al parque');
  await page.locator('#clientTimeRange').selectOption('Tarde (15:00 — 19:00)');
  await page.locator('#clientPaymentNote').fill('500');

  await page.locator('#checkoutBtn').click();
  await expect.poll(() => orderPayload).not.toBeNull();
  await expect.poll(() => page.evaluate(() => window.__testWhatsAppUrl)).not.toBeNull();

  expect(orderPayload.p_client_name).toBe('Cliente E2E');
  expect(orderPayload.p_delivery_method).toBe('domicilio');
  expect(orderPayload.p_items).toHaveLength(1);
  expect(orderPayload.p_items[0]).toMatchObject({ product_id: PRODUCT_ID, quantity: 1 });
  expect(orderPayload.p_items[0]).not.toHaveProperty('price_cents');
  expect(orderPayload.p_items[0]).not.toHaveProperty('stock');
  expect(orderPayload).not.toHaveProperty('p_total_cents');
  expect(orderPayload).not.toHaveProperty('p_delivery_fee_cents');

  const whatsappUrl = await page.evaluate(() => window.__testWhatsAppUrl);
  const voucher = new URL(whatsappUrl).searchParams.get('text');
  expect(voucher).toContain('Nº de vale: E2E-DELIVERY-001');
  expect(voucher).toContain('Subtotal de productos (confirmado por el sistema): $395 USD');
  expect(voucher).toContain('Precio de mensajería (tarifa configurada): $2 USD');
  expect(voucher).toContain('Total a pagar: $397 USD');
  expect(voucher).toContain('Vuelto: $103 USD');
  expect(voucher).not.toContain('Precio del producto:');
  await expect(page.locator('#cartSubtotal')).toHaveText('$0 USD');
  expect(page.sideEffects).toEqual([]);
});

test('checkout de recogida usa el subtotal del servidor y omite mensajería', async ({ page }) => {
  let orderPayload = null;
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/rpc/create_order`, async (route) => {
    orderPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        order_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        order_code: 'E2E-PICKUP-001',
        total_cents: 2700,
        commission_cents: 0,
        count: 1
      })
    });
  });
  await page.addInitScript(() => {
    window.__testWhatsAppUrl = null;
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith('https://wa.me/')) {
        window.__testWhatsAppUrl = this.href;
        return;
      }
      return nativeClick.call(this);
    };
  });

  await page.goto('/');
  await page.locator(`.product-card[data-id="${PRODUCT_ID}"] .btn-add-quick`).click();
  await page.locator('.cart-floating-fab:visible, .btn-cart-nav:visible').first().click();
  await page.locator('#clientName').fill('Cliente E2E');
  await page.locator('#clientPhone').fill('5355555555');
  await page.locator('#deliveryMethod').selectOption('recogida');
  await page.locator('#clientTimeRange').selectOption('Mañana (9:00 — 12:00)');

  await page.locator('#checkoutBtn').click();
  await expect.poll(() => orderPayload).not.toBeNull();
  await expect.poll(() => page.evaluate(() => window.__testWhatsAppUrl)).not.toBeNull();

  expect(orderPayload.p_delivery_method).toBe('recogida');
  expect(orderPayload.p_client_address).toBeNull();
  const whatsappUrl = await page.evaluate(() => window.__testWhatsAppUrl);
  const voucher = new URL(whatsappUrl).searchParams.get('text');
  expect(voucher).toContain('Nº de vale: E2E-PICKUP-001');
  expect(voucher).toContain('Subtotal de productos (confirmado por el sistema): $27 USD');
  expect(voucher).toContain('Total a pagar: $27 USD');
  expect(voucher).not.toContain('Precio de mensajería');
  expect(voucher).not.toContain('Precio del producto:');
  expect(voucher).not.toContain('Dirección:');
  expect(page.sideEffects).toEqual([]);
});

test('no abre WhatsApp ni vacía el carrito si la RPC devuelve un total inválido', async ({ page }) => {
  let orderPayload = null;
  await page.route(`${SUPABASE_ORIGIN}/rest/v1/rpc/create_order`, async (route) => {
    orderPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        order_id: '11111111-1111-4111-8111-111111111111',
        order_code: 'E2E-INVALID-001',
        count: 1
      })
    });
  });
  await page.addInitScript(() => {
    window.__testWhatsAppUrl = null;
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.href.startsWith('https://wa.me/')) {
        window.__testWhatsAppUrl = this.href;
        return;
      }
      return nativeClick.call(this);
    };
  });

  await page.goto('/');
  await page.locator(`.product-card[data-id="${PRODUCT_ID}"] .btn-add-quick`).click();
  await page.locator('.cart-floating-fab:visible, .btn-cart-nav:visible').first().click();
  await page.locator('#clientName').fill('Cliente E2E');
  await page.locator('#clientPhone').fill('5355555555');
  await page.locator('#clientMunicipality').fill('Playa');
  await page.locator('#clientAddress').fill('Calle 23, número 12');
  await page.locator('#clientReference').fill('Frente al parque');
  await page.locator('#clientTimeRange').selectOption('Tarde (15:00 — 19:00)');
  await page.locator('#clientPaymentNote').fill('500');

  await page.locator('#checkoutBtn').click();
  await expect.poll(() => orderPayload).not.toBeNull();
  await expect(page.locator('#checkoutBtn')).toContainText('Completar Pedido en WhatsApp');
  await expect(page.locator('#cartSubtotal')).toHaveText('$28 USD');
  expect(await page.evaluate(() => window.__testWhatsAppUrl)).toBeNull();
  expect(page.sideEffects).toEqual([]);
});

test('la vista móvil permite navegar por el catálogo y abrir el carrito', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(2);
  await page.locator(`.product-card[data-id="${PRODUCT_ID}"] .btn-add-quick`).click();
  // Desktop and mobile expose different accessible labels for the same cart action.
  await page.locator('.cart-floating-fab:visible, .btn-cart-nav:visible').first().click();
  await expect(page.locator('#cartDrawerOverlay')).toHaveClass(/open/);
  await expect(page.locator('#cartItemsList')).toContainText('Auriculares de prueba');
});

test('la búsqueda sin coincidencias no rompe el catálogo y permite recuperarlo', async ({ page }) => {
  await page.goto('/');
  const search = page.getByRole('searchbox', { name: /buscar productos/i });

  await search.fill('producto que no existe');
  await expect(page.locator('.product-card')).toHaveCount(0);

  await search.fill('');
  await expect(page.locator('.product-card')).toHaveCount(2);
});

test('el carrito se puede cerrar y volver a abrir sin perder sus artículos', async ({ page }) => {
  await page.goto('/');
  await page.locator(`.product-card[data-id="${PRODUCT_ID}"] .btn-add-quick`).click();

  await page.locator('.cart-floating-fab:visible, .btn-cart-nav:visible').first().click();
  await expect(page.locator('#cartDrawerOverlay')).toHaveClass(/open/);

  await page.getByRole('button', { name: 'Cerrar carrito' }).click();
  await expect(page.locator('#cartDrawerOverlay')).not.toHaveClass(/open/);

  await page.locator('.cart-floating-fab:visible, .btn-cart-nav:visible').first().click();
  await expect(page.locator('#cartItemsList')).toContainText('Auriculares de prueba');
  await expect(page.locator('.cart-count').first()).toHaveText('1');
});
