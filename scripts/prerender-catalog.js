// Genera HTML público legible por buscadores y extractores sin JavaScript.
// Solo consulta campos públicos de products/categories. Nunca incluye costes,
// comisiones, datos de proveedores ni información de clientes.

const fs = require('node:fs/promises');
const path = require('node:path');

const PRODUCT_SELECT = [
  'id', 'name', 'category', 'price_cents', 'stock', 'supplier_available',
  'badge', 'description', 'images', 'variants', 'active', 'created_at'
].join(',');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function safeImageUrl(value) {
  const candidate = String(value || '').trim();
  if (candidate.startsWith('/img/') && !candidate.includes('..')) return candidate;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'https:' ? parsed.href : '/img/placeholder-800.webp';
  } catch {
    return '/img/placeholder-800.webp';
  }
}

function normalizePublicProduct(row) {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id || '').trim();
  const name = String(row.name || '').trim();
  const priceCents = Number(row.price_cents);
  const stock = Number(row.stock);

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  if (!name || !Number.isFinite(priceCents) || priceCents < 0) return null;
  if (!Number.isFinite(stock) || stock < 0 || row.active === false) return null;

  const images = (Array.isArray(row.images) ? row.images : []).map(safeImageUrl);
  return {
    id,
    name,
    category: String(row.category || 'general'),
    price_cents: Math.round(priceCents),
    stock: Math.floor(stock),
    supplier_available: row.supplier_available === true && stock === 0,
    badge: typeof row.badge === 'string' ? row.badge.trim() : '',
    description: typeof row.description === 'string' ? row.description.trim() : '',
    images: images.length ? images : ['/img/placeholder-800.webp'],
    variants: Array.isArray(row.variants) ? row.variants.map(String).filter(Boolean) : [],
    active: true,
    created_at: typeof row.created_at === 'string' ? row.created_at : null
  };
}

function normalizeCategory(row) {
  if (!row || typeof row.key !== 'string' || typeof row.label !== 'string' || row.active === false) return null;
  return {
    key: row.key.trim(),
    label: row.label.trim(),
    emoji: typeof row.emoji === 'string' && row.emoji.trim() ? row.emoji.trim() : '📦',
    active: true
  };
}

function formatPublicPrice(cents) {
  const amount = (Number(cents) || 0) / 100;
  return '$' + amount.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' USD';
}

function renderCategories(categories) {
  const buttons = ['<button type="button" class="cat-btn active" data-cat="all" aria-pressed="true">Todos los productos</button>'];
  categories.forEach((category) => {
    buttons.push('<button type="button" class="cat-btn" data-cat="' + escapeHtml(category.key) +
      '" aria-pressed="false">' + escapeHtml(category.emoji) + ' ' + escapeHtml(category.label) + '</button>');
  });
  return buttons.join('\n');
}

function renderProductCard(product, categories) {
  const category = categories.find((item) => item.key === product.category);
  const canOrder = product.stock > 0 || product.supplier_available;
  const stockLabel = product.supplier_available
    ? 'Disponible con proveedor'
    : (canOrder ? product.stock + ' en stock' : 'Agotado');
  const description = product.description.length > 170
    ? product.description.slice(0, 167) + '…'
    : product.description;
  const badge = product.badge
    ? '<span class="badge-float">' + escapeHtml(product.badge) + '</span>'
    : '';

  return [
    '<article class="product-card' + (canOrder ? '' : ' is-out') + '" data-id="' + escapeHtml(product.id) + '">',
    '  <div class="product-thumb-wrap">',
    '    <img src="' + escapeHtml(product.images[0]) + '" alt="' + escapeHtml(product.name) + '" width="600" height="600" loading="lazy" decoding="async">',
    '    ' + badge,
    '    <span class="stock-indicator' + (canOrder ? '' : ' out') + '"><span class="stock-dot" aria-hidden="true"></span>' + escapeHtml(stockLabel) + '</span>',
    '  </div>',
    '  <div class="product-info">',
    '    <span class="product-category">' + escapeHtml(category ? category.label : 'General') + '</span>',
    '    <h3 class="product-title"><button type="button" class="product-title-btn" data-open="' + escapeHtml(product.id) + '">' + escapeHtml(product.name) + '</button></h3>',
    '    <p class="product-desc-snippet">' + escapeHtml(description) + '</p>',
    '    <div class="product-bottom-row">',
    '      <div class="product-price">' + escapeHtml(formatPublicPrice(product.price_cents)) + '</div>',
    '      <div class="product-actions"><button type="button" class="btn-add-quick" data-add="' + escapeHtml(product.id) + '"' +
      (canOrder ? '' : ' disabled') + ' aria-label="Añadir ' + escapeHtml(product.name) + ' al carrito">+</button></div>',
    '    </div>',
    '  </div>',
    '</article>'
  ].join('\n');
}

function buildItemList(products, categories, canonicalUrl) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Catálogo de RamiroX Market',
    numberOfItems: products.length,
    itemListElement: products.map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'Product',
        name: product.name,
        description: product.description,
        image: product.images,
        category: (categories.find((item) => item.key === product.category) || {}).label || product.category,
        sku: product.id,
        offers: {
          '@type': 'Offer',
          price: (product.price_cents / 100).toFixed(2),
          priceCurrency: 'USD',
          availability: (product.stock > 0 || product.supplier_available)
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          url: canonicalUrl + '#' + encodeURIComponent(product.id)
        }
      }
    }))
  };
}

function injectCatalogMarkup(html, products, categories) {
  const categoryPattern = /<div id="categoriesPills" class="categories-pills" role="group" aria-label="Filtrar por categoría">[\s\S]*?<\/div>/;
  const gridPattern = /<div id="productsGrid" class="products-grid">(?:[\s\S]*?<!-- CATALOG_PRERENDER_END -->\s*|[\s\S]*?)<\/div>/;
  if (!categoryPattern.test(html) || !gridPattern.test(html)) {
    throw new Error('No se encontraron los contenedores públicos del catálogo en index.html.');
  }

  let output = html
    .replace(categoryPattern, '<div id="categoriesPills" class="categories-pills" role="group" aria-label="Filtrar por categoría">\n' +
      renderCategories(categories) + '\n    </div>')
    .replace(gridPattern, '<div id="productsGrid" class="products-grid">\n<!-- CATALOG_PRERENDER_START -->\n' +
      products.map((product) => renderProductCard(product, categories)).join('\n') +
      '\n<!-- CATALOG_PRERENDER_END -->\n    </div>');

  const countLabel = products.length === 1 ? '1 producto disponible' : products.length + ' productos disponibles';
  const countPattern = /<span id="productsCount" class="products-count" aria-live="polite">[\\s\\S]*?<\\/span>/;
  if (!countPattern.test(output)) throw new Error('No se encontró el contador público de productos.');
  output = output.replace(countPattern, '<span id="productsCount" class="products-count" aria-live="polite">' + countLabel + '</span>');

  output = output.replace(/<script[^>]*id="catalog-prerender-data"[^>]*>[\s\S]*?<\/script>\s*/g, '');
  output = output.replace(/<script[^>]*id="catalog-item-list-jsonld"[^>]*>[\s\S]*?<\/script>\s*/g, '');

  const data = JSON.stringify({ products, categories })
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const dataScript = '<script type="application/json" id="catalog-prerender-data">' + data + '</script>';
  output = output.replace('</main>', dataScript + '\n  </main>');

  const canonicalMatch = output.match(/<link rel="canonical" href="([^"]+)"/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1] : 'https://tiendaramiro.ramiroxavier07.workers.dev/';
  const itemList = JSON.stringify(buildItemList(products, categories, canonicalUrl))
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
  const jsonLdScript = '<script type="application/ld+json" id="catalog-item-list-jsonld">' + itemList + '</script>';
  output = output.replace('</head>', jsonLdScript + '\n</head>');
  return output;
}

async function fetchRows(baseUrl, publishableKey, table, params) {
  const url = new URL('/rest/v1/' + table, baseUrl);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, {
    headers: { apikey: publishableKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Supabase respondió ' + response.status + ' al consultar ' + table + '.');
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('La respuesta pública de ' + table + ' no es una lista.');
  return rows;
}

async function fetchPublicCatalog(configFile) {
  const configSource = await fs.readFile(configFile, 'utf8');
  const urlMatch = configSource.match(/url:\s*['"]([^'"]+)['"]/);
  const keyMatch = configSource.match(/publishableKey:\s*['"]([^'"]+)['"]/);
  const baseUrl = process.env.SUPABASE_URL || (urlMatch && urlMatch[1]);
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || (keyMatch && keyMatch[1]);
  if (!baseUrl || !publishableKey) {
    throw new Error('Falta SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY para generar el catálogo público.');
  }

  const results = await Promise.all([
    fetchRows(baseUrl, publishableKey, 'products', {
      select: PRODUCT_SELECT, active: 'eq.true', order: 'created_at.desc'
    }),
    fetchRows(baseUrl, publishableKey, 'categories', {
      select: 'key,label,emoji,active', active: 'eq.true', order: 'label.asc'
    })
  ]);
  const products = results[0].map(normalizePublicProduct).filter(Boolean);
  const categories = results[1].map(normalizeCategory).filter(Boolean);
  if (products.length === 0) throw new Error('Supabase no devolvió productos activos; se cancela el build para no publicar un catálogo vacío.');
  if (categories.length === 0) throw new Error('Supabase no devolvió categorías activas; se cancela el build del catálogo.');
  return { products, categories };
}

async function prerenderCatalog(publicDir) {
  const configFile = path.join(publicDir, 'js', 'supabase-config.js');
  const indexFile = path.join(publicDir, 'index.html');
  const catalogFile = path.join(publicDir, 'catalog.json');
  const catalog = await fetchPublicCatalog(configFile);
  const html = await fs.readFile(indexFile, 'utf8');
  await fs.writeFile(catalogFile, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  await fs.writeFile(indexFile, injectCatalogMarkup(html, catalog.products, catalog.categories), 'utf8');
  return { products: catalog.products.length, categories: catalog.categories.length };
}

module.exports = {
  escapeHtml,
  safeImageUrl,
  normalizePublicProduct,
  normalizeCategory,
  renderCategories,
  renderProductCard,
  buildItemList,
  injectCatalogMarkup,
  fetchPublicCatalog,
  prerenderCatalog
};
