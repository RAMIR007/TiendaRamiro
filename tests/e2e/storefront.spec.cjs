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

test('la vista móvil permite navegar por el catálogo y abrir el carrito', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(2);
  await page.locator(`.product-card[data-id="${PRODUCT_ID}"] .btn-add-quick`).click();
  // Desktop and mobile expose different accessible labels for the same cart action.
  await page.locator('.cart-floating-fab:visible, .btn-cart-nav:visible').first().click();
  await expect(page.locator('#cartDrawerOverlay')).toHaveClass(/open/);
  await expect(page.locator('#cartItemsList')).toContainText('Auriculares de prueba');
});
