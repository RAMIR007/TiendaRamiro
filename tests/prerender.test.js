const assert = require('node:assert/strict');
const {
  escapeHtml,
  normalizePublicProduct,
  renderCategories,
  renderProductCard,
  buildItemList,
  injectCatalogMarkup
} = require('../scripts/prerender-catalog');

const product = normalizePublicProduct({
  id: '11111111-1111-4111-8111-111111111111',
  name: '<script>alert(1)</script> Auriculares',
  category: 'tecnologia',
  price_cents: 2800,
  stock: 4,
  supplier_available: false,
  badge: 'Nuevo',
  description: 'Producto de prueba',
  images: ['https://images.example.test/product.webp'],
  variants: ['Negro'],
  active: true
});
const categories = [{ key: 'tecnologia', label: 'Tecnología', emoji: '⚡', active: true }];

assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
assert.ok(product);
assert.match(renderCategories(categories), /data-cat="tecnologia"/);
const card = renderProductCard(product, categories);
assert.match(card, /Auriculares/);
assert.doesNotMatch(card, /<script>/i);
assert.match(card, /data-add="11111111-1111-4111-8111-111111111111"/);

const itemList = buildItemList([product], categories, 'https://example.test/');
assert.equal(itemList.itemListElement[0].item.name, product.name);
assert.equal(itemList.itemListElement[0].item.offers.price, '28.00');

const html = [
  '<html><head><link rel="canonical" href="https://example.test/"></head><body>',
  '<div id="categoriesPills" class="categories-pills" role="group" aria-label="Filtrar por categoría"><!-- Generado desde STORE_CONFIG.categories --></div>',
  '<main><div id="productsGrid" class="products-grid"><!-- Inyectado dinámicamente por store.js --></div></main>',
  '</body></html>'
].join('\n');
const rendered = injectCatalogMarkup(html, [product], categories);

assert.match(rendered, /class="product-card"/);
assert.match(rendered, /id="catalog-prerender-data"/);
assert.match(rendered, /id="catalog-item-list-jsonld"/);
assert.match(rendered, /Todos los productos/);
assert.match(rendered, /1 producto disponible/);
const embedded = rendered.match(/<script type="application\/json" id="catalog-prerender-data">([\s\S]*?)<\/script>/);
assert.ok(embedded);
const embeddedData = JSON.parse(embedded[1]);
assert.equal(embeddedData.products.length, 1);
assert.equal(embeddedData.categories[0].key, 'tecnologia');

const rebuilt = injectCatalogMarkup(rendered, [product], categories);
assert.equal((rebuilt.match(/class="product-card"/g) || []).length, 1);
assert.equal((rebuilt.match(/id="catalog-prerender-data"/g) || []).length, 1);

console.log('Prerender de catálogo: todas las comprobaciones OK.');
