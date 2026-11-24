// js/supabase.js — Cliente mínimo de Supabase (Auth + REST) sin SDK.
// Usa fetch y la clave publishable. Las sesiones viven en sessionStorage.
// Requiere: js/config.js, js/utils.js y js/data.js cargados antes de usar sus funciones.

const SUPABASE_SESSION_KEY = 'rx_sb_session';
const SUPABASE_PRODUCT_SELECT = 'id,name,category,price_cents,stock,supplier_available,badge,description,images,variants,active,created_at';
const SUPABASE_PRODUCT_COST_SELECT = 'product_costs(cost_cents,commission_percent,commission_type,commission_fixed_cents,supplier)';
const SUPABASE_PRODUCT_LOCATION_SELECT = 'product_locations(supplier_city,supplier_municipality,supplier_address)';
const SUPABASE_ORDER_SELECT = [
  'id,created_at,status,client_name,client_phone,client_address,client_notes',
  'total_cents,commission_cents,order_code,delivery_method,payment_method,seller_id,seller_code',
  'seller:profiles(name,referral_code)',
  'order_items(id,name,variant,unit_price_cents,quantity,cost_cents,commission_type,commission_percent,commission_fixed_cents,commission_cents,supplier)'
].join(',');

class SupabaseError extends Error {
  constructor(message, status, payload, cause) {
    super(message);
    this.name = 'SupabaseError';
    this.status = status || 0;
    this.payload = payload || null;
    this.cause = cause || null;
  }
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

async function supabaseRequest(path, options = {}) {
  const {
    method = 'GET',
    body,
    rawBody,
    contentType = 'application/json',
    token,
    prefer,
    headers = {}
  } = options;

  const requestHeaders = {
    apikey: SUPABASE_CONFIG.publishableKey,
    ...headers
  };

  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined || rawBody !== undefined) requestHeaders['Content-Type'] = contentType;
  if (prefer) requestHeaders.Prefer = prefer;

  let response;

  try {
    response = await fetch(`${SUPABASE_CONFIG.url}${path}`, {
      method,
      headers: requestHeaders,
      body: rawBody !== undefined ? rawBody : (body === undefined ? undefined : JSON.stringify(body))
    });
  } catch (error) {
    throw new SupabaseError('No se pudo conectar con el servidor. Revisa tu conexión.', 0, null, error);
  }

  const raw = await response.text();
  let data = null;

  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (error) {
      data = raw;
    }
  }

  if (!response.ok) {
    const message =
      (data && (data.msg || data.message || data.error_description || data.error)) ||
      `Error ${response.status}`;

    throw new SupabaseError(message, response.status, data);
  }

  return data;
}

/* ------------------------------------------------------------------ */
/* Sesión (Supabase Auth)                                              */
/* ------------------------------------------------------------------ */

function readSupabaseSession() {
  try {
    const raw = sessionStorage.getItem(SUPABASE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function writeSupabaseSession(session) {
  try {
    sessionStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
  } catch (error) {
    console.warn('[auth] No se pudo guardar la sesión:', error);
  }
}

function clearSupabaseSession() {
  try {
    sessionStorage.removeItem(SUPABASE_SESSION_KEY);
  } catch (error) {
    /* sin sesión que borrar */
  }
}

function buildSession(data, fallbackUser) {
  const expiresIn = Number(data.expires_in) || 3600;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + Math.max(60, expiresIn - 60) * 1000,
    user: {
      id: (data.user && data.user.id) || (fallbackUser && fallbackUser.id) || null,
      email: (data.user && data.user.email) || (fallbackUser && fallbackUser.email) || ''
    }
  };
}

async function signInWithPassword(email, password) {
  const data = await supabaseRequest('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: { email: String(email).trim(), password }
  });

  const session = buildSession(data, null);
  writeSupabaseSession(session);
  return session;
}

async function refreshSupabaseSession() {
  const session = readSupabaseSession();
  if (!session || !session.refresh_token) {
    throw new SupabaseError('Tu sesión expiró. Vuelve a iniciar sesión.', 401, null);
  }

  const data = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST',
    body: { refresh_token: session.refresh_token }
  });

  const next = buildSession(data, session.user);
  writeSupabaseSession(next);
  return next;
}

async function getAccessToken() {
  const session = readSupabaseSession();
  if (!session) return null;

  if (Date.now() >= Number(session.expires_at || 0)) {
    try {
      const refreshed = await refreshSupabaseSession();
      return refreshed.access_token;
    } catch (error) {
      clearSupabaseSession();
      return null;
    }
  }

  return session.access_token;
}

async function requireAccessToken() {
  const token = await getAccessToken();
  if (!token) {
    throw new SupabaseError('Tu sesión expiró. Vuelve a iniciar sesión.', 401, null);
  }
  return token;
}

async function getCurrentUser() {
  const token = await requireAccessToken();
  const user = await supabaseRequest('/auth/v1/user', { token });

  if (!user || !user.id) {
    throw new SupabaseError('No se pudo validar la sesión.', 401, null);
  }

  return { id: user.id, email: user.email || '' };
}

async function getProfile() {
  const token = await requireAccessToken();
  const user = await getCurrentUser();
  const rows = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,name,role,referral_code`,
    { token }
  );

  if (!Array.isArray(rows) || rows.length === 0) return null;
  return {
    ...rows[0],
    referralCode: rows[0].referral_code || '',
    email: user.email
  };
}

async function signOut() {
  const session = readSupabaseSession();
  clearSupabaseSession();

  if (!session) return;

  try {
    await supabaseRequest('/auth/v1/logout', {
      method: 'POST',
      token: session.access_token
    });
  } catch (error) {
    // Cerrar sesión en el cliente es suficiente aunque falle el servidor.
    console.warn('[auth] Logout remoto falló:', error);
  }
}

async function changePassword(newPassword) {
  const token = await requireAccessToken();
  await supabaseRequest('/auth/v1/user', {
    method: 'PUT',
    token,
    body: { password: newPassword }
  });
}

// Envía el correo de recuperación. Supabase responde igual exista o no la
// cuenta, para no revelar qué correos están registrados.
async function requestPasswordReset(email, redirectTo) {
  const query = redirectTo ? `?redirect_to=${encodeURIComponent(redirectTo)}` : '';
  await supabaseRequest(`/auth/v1/recover${query}`, {
    method: 'POST',
    body: { email: String(email).trim() }
  });
}

/* ------------------------------------------------------------------ */
/* Cuenta de cliente: acceso OAuth solo con Google                    */
/* ------------------------------------------------------------------ */

function signInCustomerWithOAuth(provider, redirectTo) {
  const allowedProviders = ['google'];
  if (!allowedProviders.includes(provider)) {
    throw new SupabaseError('Proveedor de acceso no permitido.', 400, null);
  }

  const callback = redirectTo || `${window.location.origin}/account.html`;
  const url = `${SUPABASE_CONFIG.url}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(callback)}`;
  window.location.assign(url);
}

async function completeCustomerAuthRedirect() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const errorDescription = params.get('error_description') || params.get('error');
  if (errorDescription) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
    throw new SupabaseError(errorDescription, 400, null);
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return null;

  const authUser = await supabaseRequest('/auth/v1/user', { token: accessToken });
  const session = buildSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: params.get('expires_in'),
    user: authUser
  }, authUser);

  writeSupabaseSession(session);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  const claimedOrders = await claimCustomerOrders();
  return { user: authUser, claimedOrders };
}

async function claimCustomerOrders() {
  const token = await requireAccessToken();
  return supabaseRequest('/rest/v1/rpc/claim_my_orders', {
    method: 'POST',
    token,
    body: {}
  });
}

async function fetchCustomerOrders(limit = 50) {
  const token = await requireAccessToken();
  const user = await getCurrentUser();
  const select = 'id,created_at,status,order_code,total_cents,delivery_method,order_items(id,name,variant,unit_price_cents,quantity)';
  const rows = await supabaseRequest(
    `/rest/v1/orders?select=${select}&customer_id=eq.${encodeURIComponent(user.id)}&order=created_at.desc&limit=${Math.min(100, Math.max(1, Number(limit) || 50))}`,
    { token }
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchCustomerProfile() {
  const token = await requireAccessToken();
  const user = await getCurrentUser();
  const rows = await supabaseRequest(
    `/rest/v1/profiles?select=name,phone,address&id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { token }
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

function mapProductRow(row, includeCosts) {
  if (!row) return null;

  const costRow = includeCosts && row.product_costs
    ? (Array.isArray(row.product_costs) ? row.product_costs[0] : row.product_costs)
    : null;
  const locationRow = includeCosts && row.product_locations
    ? (Array.isArray(row.product_locations) ? row.product_locations[0] : row.product_locations)
    : null;

  return normalizeProduct({
    id: row.id,
    name: row.name,
    category: row.category,
    price: (Number(row.price_cents) || 0) / 100,
    stock: Number(row.stock) || 0,
    supplier_available: row.supplier_available === true,
    badge: row.badge,
    description: row.description || '',
    images: Array.isArray(row.images) ? row.images : [],
    variants: Array.isArray(row.variants) ? row.variants : [],
    created_at: row.created_at,
    cost: costRow ? (Number(costRow.cost_cents) || 0) / 100 : null,
    commissionPercent: costRow ? Number(costRow.commission_percent) || 0 : 0,
    commissionType: costRow && costRow.commission_type === 'amount' ? 'amount' : 'percent',
    commissionFixed: costRow ? (Number(costRow.commission_fixed_cents) || 0) / 100 : 0,
    supplier: costRow ? costRow.supplier : null,
    supplier_city: locationRow ? locationRow.supplier_city : null,
    supplier_municipality: locationRow ? locationRow.supplier_municipality : null,
    supplier_address: locationRow ? locationRow.supplier_address : null
  });
}

function productToRow(product) {
  const row = {
    name: product.name,
    category: product.category,
    price_cents: toCents(product.price),
    stock: Math.max(0, Math.floor(Number(product.stock) || 0)),
    supplier_available: product.supplierAvailable === true && Number(product.stock) === 0,
    badge: product.badge || null,
    description: product.description || '',
    images: product.images || [],
    variants: product.variants || [],
    active: product.active !== false
  };

  return row;
}

function productToLocationRow(productId, product) {
  if (!Object.prototype.hasOwnProperty.call(product, 'supplierCity')
    && !Object.prototype.hasOwnProperty.call(product, 'supplierMunicipality')
    && !Object.prototype.hasOwnProperty.call(product, 'supplierAddress')) {
    return null;
  }

  return {
    product_id: productId,
    supplier_city: product.supplierCity || null,
    supplier_municipality: product.supplierMunicipality || null,
    supplier_address: product.supplierAddress || null
  };
}

async function fetchCategoriesFromApi(options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const token = includeInactive ? await requireAccessToken() : null;
  const activeFilter = includeInactive ? '' : '&active=eq.true';
  const rows = await supabaseRequest(
    `/rest/v1/categories?select=key,label,emoji,active&order=label.asc${activeFilter}`,
    { token }
  );

  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && typeof row.key === 'string' && typeof row.label === 'string')
    .map((row) => ({
      key: row.key,
      label: row.label,
      emoji: row.emoji || '📦',
      active: row.active !== false
    }));
}

async function createCategoryInApi(category) {
  const token = await requireAccessToken();
  const rows = await supabaseRequest('/rest/v1/categories?select=key,label,emoji,active', {
    method: 'POST',
    token,
    body: {
      key: category.key,
      label: category.label,
      emoji: category.emoji || '📦',
      active: true
    },
    prefer: 'return=representation'
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || row.key !== category.key) {
    throw new SupabaseError('Supabase no confirmó la categoría creada.', 500, rows);
  }

  return {
    key: row.key,
    label: row.label,
    emoji: row.emoji || '📦',
    active: row.active !== false
  };
}

async function uploadProductImage(dataUrl) {
  const match = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/i.exec(String(dataUrl || ''));
  if (!match) {
    throw new SupabaseError('La imagen no tiene un formato compatible. Vuelve a seleccionarla.', 400, null);
  }

  const mimeType = match[1].toLowerCase();
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  if (bytes.byteLength > 8 * 1024 * 1024) {
    throw new SupabaseError('La imagen convertida supera el límite de 8 MB.', 413, null);
  }

  const token = await requireAccessToken();
  const suffix = mimeType === 'image/webp' ? 'webp' : (mimeType === 'image/png' ? 'png' : 'jpg');
  const nonce = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const objectPath = `products/${nonce}.${suffix}`;
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');

  await supabaseRequest(`/storage/v1/object/product-images/${encodedPath}`, {
    method: 'POST',
    token,
    rawBody: new Blob([bytes], { type: mimeType }),
    contentType: mimeType,
    headers: { 'x-upsert': 'false' }
  });

  return {
    path: objectPath,
    url: `${SUPABASE_CONFIG.url}/storage/v1/object/public/product-images/${encodedPath}`
  };
}

async function deleteProductImagesInApi(paths) {
  const objectPaths = Array.isArray(paths) ? paths.filter(Boolean) : [];
  if (objectPaths.length === 0) return;

  const token = await requireAccessToken();
  await supabaseRequest('/storage/v1/object/product-images', {
    method: 'DELETE',
    token,
    body: { prefixes: objectPaths }
  });
}

async function fetchProductsFromApi(options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const includeCosts = Boolean(options.includeCosts);
  const token = (includeInactive || includeCosts) ? await requireAccessToken() : null;
  const filter = includeInactive ? '' : '&active=eq.true';
  const select = includeCosts
    ? `${SUPABASE_PRODUCT_SELECT},${SUPABASE_PRODUCT_COST_SELECT},${SUPABASE_PRODUCT_LOCATION_SELECT}`
    : SUPABASE_PRODUCT_SELECT;

  const rows = await supabaseRequest(
    `/rest/v1/products?select=${select}&order=created_at.desc${filter}`,
    { token }
  );

  return (Array.isArray(rows) ? rows : [])
    .map((row) => mapProductRow(row, includeCosts))
    .filter(Boolean);
}

function productToCostRow(productId, product) {
  return {
    product_id: productId,
    cost_cents: toCents(product.cost),
    commission_type: product.commissionType === 'amount' ? 'amount' : 'percent',
    commission_percent: product.commissionType === 'amount' ? 0 : (Number(product.commissionPercent) || 0),
    commission_fixed_cents: product.commissionType === 'amount' ? toCents(product.commissionFixed) : 0,
    supplier: product.supplier || null
  };
}

async function upsertProductCost(productId, product) {
  const token = await requireAccessToken();
  await supabaseRequest('/rest/v1/product_costs', {
    method: 'POST',
    token,
    body: productToCostRow(productId, product),
    prefer: 'resolution=merge-duplicates,return=minimal'
  });
}

async function upsertProductLocation(productId, product, token) {
  const row = productToLocationRow(productId, product);
  if (!row) return;

  await supabaseRequest('/rest/v1/product_locations?on_conflict=product_id', {
    method: 'POST',
    token,
    body: row,
    prefer: 'resolution=merge-duplicates,return=minimal'
  });
}

async function createProductInApi(product) {
  const token = await requireAccessToken();
  const rows = await supabaseRequest('/rest/v1/products?select=id', {
    method: 'POST',
    token,
    body: productToRow(product),
    prefer: 'return=representation'
  });

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || !row.id) {
    throw new SupabaseError('El servidor no devolvió el producto creado.', 500, rows);
  }

  if (product.cost !== undefined && product.cost !== null) {
    await upsertProductCost(row.id, product);
  }
  await upsertProductLocation(row.id, product, token);

  return row.id;
}

async function updateProductInApi(productId, product) {
  const token = await requireAccessToken();
  await supabaseRequest(`/rest/v1/products?id=eq.${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    token,
    body: productToRow(product),
    prefer: 'return=minimal'
  });

  if (product.cost !== undefined && product.cost !== null) {
    await upsertProductCost(productId, product);
  }
  await upsertProductLocation(productId, product, token);
}

async function deleteProductInApi(productId) {
  const token = await requireAccessToken();
  await supabaseRequest(`/rest/v1/products?id=eq.${encodeURIComponent(productId)}`, {
    method: 'DELETE',
    token,
    prefer: 'return=minimal'
  });
}

async function importProductsToApi(products) {
  const token = await requireAccessToken();
  await supabaseRequest('/rest/v1/products', {
    method: 'POST',
    token,
    body: products.map(productToRow),
    prefer: 'return=minimal'
  });
}

/* ------------------------------------------------------------------ */
/* Pedidos                                                             */
/* ------------------------------------------------------------------ */

function mapOrderRow(row) {
  const items = Array.isArray(row.order_items) ? row.order_items : [];
  const seller = row.seller
    ? (Array.isArray(row.seller) ? row.seller[0] : row.seller)
    : null;

  return {
    id: row.id,
    createdAt: row.created_at,
    date: formatDateShort(new Date(row.created_at)),
    status: row.status || 'pendiente',
    orderCode: row.order_code || '',
    clientName: row.client_name || '',
    clientPhone: row.client_phone || '',
    clientAddress: row.client_address || '',
    clientNotes: row.client_notes || '',
    deliveryMethod: row.delivery_method || 'domicilio',
    paymentMethod: row.payment_method || 'efectivo',
    totalCents: Number(row.total_cents) || 0,
    commissionCents: Number(row.commission_cents) || 0,
    sellerId: row.seller_id || (seller ? seller.id : null),
    sellerCode: row.seller_code || (seller ? seller.referral_code : ''),
    sellerName: seller ? seller.name : '',
    items: items.map((item) => ({
      name: item.name,
      variant: item.variant || null,
      unitPriceCents: Number(item.unit_price_cents) || 0,
      quantity: Number(item.quantity) || 0,
      costCents: Number(item.cost_cents) || 0,
      commissionPercent: Number(item.commission_percent) || 0,
      commissionType: item.commission_type === 'amount' ? 'amount' : 'percent',
      commissionFixed: (Number(item.commission_fixed_cents) || 0) / 100,
      commissionCents: Number(item.commission_cents) || 0,
      supplier: item.supplier || ''
    }))
  };
}

async function fetchOrdersFromApi(limit = 100) {
  const token = await requireAccessToken();
  const rows = await supabaseRequest(
    `/rest/v1/orders?select=${SUPABASE_ORDER_SELECT}&order=created_at.desc&limit=${Number(limit) || 100}`,
    { token }
  );

  return (Array.isArray(rows) ? rows : []).map(mapOrderRow);
}

async function createOrderInApi(order) {
  const data = await supabaseRequest('/rest/v1/rpc/create_order', {
    method: 'POST',
    body: {
      p_client_name: order.name,
      p_client_phone: order.phone,
      p_client_address: order.deliveryMethod === 'recogida' ? null : (order.address || null),
      p_client_notes: order.notes || null,
      p_delivery_method: order.deliveryMethod || 'domicilio',
      p_seller_code: order.sellerCode || null,
      p_items: order.items,
      p_client_email: order.email || null
    }
  });

  if (!data || typeof data !== 'object') {
    throw new SupabaseError('El servidor no devolvió el pedido creado.', 500, data);
  }

  return {
    orderId: data.order_id,
    orderCode: data.order_code || '',
    totalCents: Number(data.total_cents) || 0,
    commissionCents: Number(data.commission_cents) || 0,
    count: Number(data.count) || 0
  };
}

async function updateOrderStatusInApi(orderId, status) {
  const token = await requireAccessToken();
  await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'PATCH',
    token,
    body: { status },
    prefer: 'return=minimal'
  });
}

async function deleteOrderInApi(orderId) {
  const token = await requireAccessToken();
  await supabaseRequest(`/rest/v1/orders?id=eq.${encodeURIComponent(orderId)}`, {
    method: 'DELETE',
    token,
    prefer: 'return=minimal'
  });
}

/* ------------------------------------------------------------------ */
/* Auditoría                                                           */
/* ------------------------------------------------------------------ */

async function fetchAuditFromApi(limit = 150) {
  const token = await requireAccessToken();
  const rows = await supabaseRequest(
    `/rest/v1/audit_logs?select=id,created_at,user_label,action&order=created_at.desc&limit=${Number(limit) || 150}`,
    { token }
  );

  return (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    date: formatDateShort(new Date(row.created_at)),
    user: row.user_label || 'Sistema',
    action: row.action || ''
  }));
}

async function logAudit(action) {
  try {
    const token = await getAccessToken();
    if (!token) return;

    const session = readSupabaseSession();
    const label = (session && session.user && session.user.email) || 'Staff';

    await supabaseRequest('/rest/v1/audit_logs', {
      method: 'POST',
      token,
      body: { user_label: label, action: String(action) },
      prefer: 'return=minimal'
    });
  } catch (error) {
    console.warn('[audit] No se pudo registrar el evento:', error);
  }
}

async function deleteAuditFromApi() {
  const token = await requireAccessToken();
  await supabaseRequest('/rest/v1/audit_logs?id=gt.0', {
    method: 'DELETE',
    token,
    prefer: 'return=minimal'
  });
}
