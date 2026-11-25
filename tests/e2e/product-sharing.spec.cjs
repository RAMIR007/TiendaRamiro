const { test, expect } = require('@playwright/test');

const SUPABASE_ORIGIN = 'https://zpttucawhdmhgqeuzaup.supabase.co';
const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

const products = [{
  id: PRODUCT_ID,
  name: 'Auriculares de prueba',
  category: 'tecnologia',
  price_cents: 2800,
  stock: 4,
  supplier_available: false,
  badge: 'Prueba',
  description: 'Producto sintético para probar los enlaces compartidos.',
  images: ['/img/placeholder-400.webp'],
  variants: ['Negro'],
  active: true,
  created_at: '2026-01-01T10:00:00Z'
}];

const categories = [
  { key: 'tecnologia', label: 'Tecnología', emoji: '⚡', active: true }
];

async function installSafeMocks(page) {
  const sideEffects = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.origin === SUPABASE_ORIGIN) {
      if (request.method() === 'GET' && url.pathname === '/rest/v1/products') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) });
        return;
      }
      if (request.method() === 'GET' && url.pathname === '/rest/v1/categories') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(categories) });
        return;
      }
      if (!['GET', 'HEAD'].includes(request.method())) {
        sideEffects.push({ method: request.method(), path: url.pathname });
      }
      await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'Blocked by safe fixture' }) });
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
  page.sideEffects = await installSafeMocks(page);
  await page.addInitScript(() => {
    window.__openedShareUrls = [];
    window.open = (url) => {
      window.__openedShareUrls.push(String(url));
      return null;
    };
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (payload) => { window.__nativeSharePayload = payload; }
    });
  });
});

test('comparte el producto por WhatsApp, Facebook y Telegram', async ({ page }) => {
  await page.goto('/');
  const shareButton = page.locator(`.product-card[data-id="${PRODUCT_ID}"] [data-share]`);

  for (const [target, expectedHost] of [
    ['whatsapp', 'wa.me'],
    ['facebook', 'facebook.com/sharer/sharer.php'],
    ['telegram', 't.me/share/url']
  ]) {
    await shareButton.click();
    await expect(page.locator('#shareSheetOverlay')).toBeVisible();
    await page.locator(`#shareSheetOverlay [data-share-target="${target}"]`).click();

    const opened = await page.evaluate(() => window.__openedShareUrls.at(-1));
    expect(opened).toContain(expectedHost);
    expect(decodeURIComponent(opened)).toContain(`/share/${PRODUCT_ID}`);
    await expect(page.locator('#shareSheetOverlay')).toBeHidden();
  }

  expect(page.sideEffects).toEqual([]);
});

test('usa el menú nativo para compartir con otras aplicaciones', async ({ page }) => {
  await page.goto('/');
  await page.locator(`.product-card[data-id="${PRODUCT_ID}"] [data-share]`).click();
  await page.locator('#shareSheetOverlay [data-share-target="system"]').click();

  await expect.poll(() => page.evaluate(() => window.__nativeSharePayload && window.__nativeSharePayload.url))
    .toContain(`/share/${PRODUCT_ID}`);
  await expect(page.locator('#shareSheetOverlay')).toBeHidden();
  expect(page.sideEffects).toEqual([]);
});

test('un enlace compartido abre directamente el producto correcto', async ({ page }) => {
  await page.goto(`/?/share/${PRODUCT_ID}`);

  await expect(page.locator('#productModalOverlay')).toHaveClass(/active/);
  await expect(page.locator('#modalTitle')).toHaveText('Auriculares de prueba');
  expect(page.sideEffects).toEqual([]);
});
