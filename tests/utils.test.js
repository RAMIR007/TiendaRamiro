// tests/utils.test.js — Pruebas sin dependencias: `node tests/utils.test.js`
// Verifica escape de HTML, dinero, almacenamiento y normalización del catálogo.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..');
const source = ['public/js/config.js', 'public/js/utils.js', 'public/js/data.js']
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n');

// localStorage mínimo para probar la capa de almacenamiento.
const memory = new Map();
global.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear()
};

const api = new Function(
  `${source}
  return {
    escapeHtml, isSafeImageUrl, smallImageUrl,
    toCents, roundMoney, formatMoney, formatCents,
    storeRead, storeWrite, storeRemove,
    normalizeProduct, normalizeProducts,
    getCachedProducts, setCachedProducts, clearCachedProducts,
    STORAGE_KEYS, PRODUCT_PLACEHOLDER_IMAGE, UUID_PATTERN
  };`
)();

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  FAIL ${name}\n       ${error.message}`);
    process.exitCode = 1;
  }
}

const VALID_ID = '11111111-1111-4111-8111-111111111111';

function validProduct(overrides = {}) {
  return {
    id: VALID_ID,
    name: 'Producto de prueba',
    category: 'tecnologia',
    price: 12.5,
    stock: 4,
    badge: 'Nuevo',
    description: 'Descripción',
    images: ['https://example.com/foto.jpg'],
    variants: ['Negro'],
    active: true,
    ...overrides
  };
}

console.log('\nEscape de HTML');
check('neutraliza etiquetas y comillas', () => {
  const output = api.escapeHtml(`<img src=x onerror="alert('xss')">&`);
  assert.ok(!output.includes('<'));
  assert.ok(output.includes('&lt;img'));
  assert.ok(output.includes('&#39;xss&#39;'));
});
check('conserva acentos y emoji', () => {
  assert.strictEqual(api.escapeHtml('Auricular ñandú 🔊'), 'Auricular ñandú 🔊');
});
check('null y undefined producen cadena vacía', () => {
  assert.strictEqual(api.escapeHtml(null), '');
  assert.strictEqual(api.escapeHtml(undefined), '');
});
check('solo acepta URLs http(s) y data:image', () => {
  assert.strictEqual(api.isSafeImageUrl('https://cdn.com/a.jpg'), true);
  assert.strictEqual(api.isSafeImageUrl('data:image/png;base64,AAA'), true);
  assert.strictEqual(api.isSafeImageUrl('javascript:alert(1)'), false);
  assert.strictEqual(api.isSafeImageUrl(''), false);
});
check('acepta rutas locales /img y rechaza traversal', () => {
  assert.strictEqual(api.isSafeImageUrl('/img/products/p1-1-800.webp'), true);
  assert.strictEqual(api.isSafeImageUrl('/img/../secret.webp'), false);
  assert.strictEqual(api.isSafeImageUrl('//evil.com/foto.jpg'), false);
});
check('smallImageUrl usa la versión de 400 px', () => {
  assert.strictEqual(api.smallImageUrl('/img/products/p1-1-800.webp'), '/img/products/p1-1-400.webp');
  assert.strictEqual(api.smallImageUrl('https://example.com/a.jpg'), 'https://example.com/a.jpg');
});

console.log('\nDinero');
check('toCents redondea sin errores de coma flotante', () => {
  assert.strictEqual(api.toCents(0.1 + 0.2), 30);
  assert.strictEqual(api.toCents(28.999), 2900);
  assert.strictEqual(api.toCents('45'), 4500);
  assert.strictEqual(api.toCents('basura'), 0);
  assert.strictEqual(api.toCents(Infinity), 0);
});
check('formatCents no muestra colas flotantes', () => {
  assert.strictEqual(api.formatCents(3219999), '$32,199.99 USD');
  assert.strictEqual(api.formatCents(2800), '$28 USD');
  assert.strictEqual(api.formatCents(2850), '$28.50 USD');
});
check('formatMoney acepta unidades', () => {
  assert.strictEqual(api.formatMoney(28.5), '$28.50 USD');
});

console.log('\nStorage');
check('lee valores y aplica fallback', () => {
  api.storeWrite('test_key', { a: 1 });
  assert.deepStrictEqual(api.storeRead('test_key', null), { a: 1 });
  assert.strictEqual(api.storeRead('no_existe', 'defecto'), 'defecto');
});
check('sobrevive a JSON corrupto', () => {
  localStorage.setItem('test_broken', '{no-json');
  assert.deepStrictEqual(api.storeRead('test_broken', []), []);
});
check('storeWrite informa fallo de cuota', () => {
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.strictEqual(api.storeWrite('test_quota', 'x'), false);
  localStorage.setItem = original;
});

console.log('\nProductos');
check('normaliza un producto válido', () => {
  const product = api.normalizeProduct(validProduct());
  assert.strictEqual(product.id, VALID_ID);
  assert.strictEqual(product.price, 12.5);
  assert.strictEqual(product.stock, 4);
  assert.strictEqual(product.active, true);
  assert.deepStrictEqual(product.variants, ['Negro']);
});
check('rechaza ids que no son UUID (catálogos viejos)', () => {
  assert.strictEqual(api.normalizeProduct(validProduct({ id: 'prod-1' })), null);
  assert.strictEqual(api.normalizeProduct(validProduct({ id: '' })), null);
  assert.strictEqual(api.normalizeProduct(validProduct({ name: '' })), null);
});
check('filtra imágenes inseguras y usa el placeholder', () => {
  const product = api.normalizeProduct(validProduct({
    images: ['javascript:alert(1)', 'https://example.com/ok.jpg']
  }));
  assert.deepStrictEqual(product.images, ['https://example.com/ok.jpg']);

  const local = api.normalizeProduct(validProduct({
    images: ['/img/products/p1-1-800.webp']
  }));
  assert.deepStrictEqual(local.images, ['/img/products/p1-1-800.webp']);

  const empty = api.normalizeProduct(validProduct({ images: [] }));
  assert.deepStrictEqual(empty.images, [api.PRODUCT_PLACEHOLDER_IMAGE]);
});
check('respeta productos inactivos', () => {
  assert.strictEqual(api.normalizeProduct(validProduct({ active: false })).active, false);
});

console.log('\nCaché del catálogo');
check('guarda, lee y limpia el catálogo', () => {
  const saved = api.setCachedProducts([validProduct(), validProduct({
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Segundo'
  })]);

  assert.strictEqual(saved.length, 2);
  assert.strictEqual(api.getCachedProducts().length, 2);

  api.clearCachedProducts();
  assert.deepStrictEqual(api.getCachedProducts(), []);
});
check('ignora caché corrupta o con ids inválidos', () => {
  localStorage.setItem(api.STORAGE_KEYS.products, '{no-json');
  assert.deepStrictEqual(api.getCachedProducts(), []);

  api.setCachedProducts([validProduct({ id: 'prod-1' })]);
  assert.deepStrictEqual(api.getCachedProducts(), []);
});

console.log(`\n${passed} comprobaciones OK${failures.length ? `, ${failures.length} fallos` : ''}\n`);
