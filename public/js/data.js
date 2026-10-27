// js/data.js — Caché local del catálogo y normalización de productos.
// La fuente de verdad es Supabase. localStorage solo guarda la última copia
// válida para que la primera pintura sea instantánea y para poder mostrar el
// catálogo si el cliente vuelve sin conexión.

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Normaliza cualquier producto recibido de la API o del caché. Evita que un
// dato corrupto, vacío o manipulado rompa el renderizado.
function normalizeProduct(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const id = String(raw.id || '').trim();
  const name = String(raw.name || '').trim();

  // Solo aceptamos UUID de Supabase: descarta cachés viejas con ids "prod-1",
  // que no podrían usarse al crear un pedido.
  if (!UUID_PATTERN.test(id) || !name) return null;

  const price = Number(raw.price);
  const stock = Number(raw.stock);
  const category = typeof raw.category === 'string' && raw.category.trim()
    ? raw.category.trim()
    : (STORE_CONFIG.categories[0] ? STORE_CONFIG.categories[0].key : 'general');

  const images = (Array.isArray(raw.images) ? raw.images : [])
    .filter(isSafeImageUrl)
    .map((url) => url.trim());

  const variants = (Array.isArray(raw.variants) ? raw.variants : [])
    .map((variant) => String(variant).trim())
    .filter(Boolean);

  const badge = typeof raw.badge === 'string' && raw.badge.trim()
    ? raw.badge.trim()
    : null;

  const cost = Number(raw.cost);
  const commission = Number(raw.commissionPercent);
  const commissionFixed = Number(raw.commissionFixed);
  const commissionType = raw.commissionType === 'amount' ? 'amount' : 'percent';
  const createdAt = typeof raw.created_at === 'string' ? raw.created_at : null;

  return {
    id,
    name,
    category,
    price: Number.isFinite(price) && price >= 0 ? Math.round(price * 100) / 100 : 0,
    stock: Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0,
    badge,
    description: typeof raw.description === 'string' ? raw.description.trim() : '',
    images: images.length > 0 ? images : [PRODUCT_PLACEHOLDER_IMAGE],
    variants,
    active: raw.active !== false,
    createdAt,
    // Datos internos: solo llegan al panel del administrador.
    cost: Number.isFinite(cost) && cost >= 0 ? Math.round(cost * 100) / 100 : null,
    commissionPercent: Number.isFinite(commission)
      ? Math.min(100, Math.max(0, commission))
      : 0,
    commissionType,
    commissionFixed: Number.isFinite(commissionFixed) && commissionFixed >= 0
      ? Math.round(commissionFixed * 100) / 100
      : 0,
    supplier: typeof raw.supplier === 'string' && raw.supplier.trim()
      ? raw.supplier.trim()
      : null,
    supplierCity: typeof raw.supplier_city === 'string' && raw.supplier_city.trim()
      ? raw.supplier_city.trim()
      : null,
    supplierMunicipality: typeof raw.supplier_municipality === 'string' && raw.supplier_municipality.trim()
      ? raw.supplier_municipality.trim()
      : null,
    supplierAddress: typeof raw.supplier_address === 'string' && raw.supplier_address.trim()
      ? raw.supplier_address.trim()
      : null
  };
}

function normalizeProducts(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeProduct).filter(Boolean);
}

// Última copia válida del catálogo (puede estar vacía en la primera visita).
function getCachedProducts() {
  return normalizeProducts(storeRead(STORAGE_KEYS.products, []));
}

// Guarda el catálogo normalizado y devuelve la lista resultante.
function setCachedProducts(products) {
  const clean = normalizeProducts(products);
  storeWrite(STORAGE_KEYS.products, clean);
  return clean;
}

function clearCachedProducts() {
  storeRemove(STORAGE_KEYS.products);
}
