// js/supabase.js — Cliente mínimo de Supabase (Auth + REST) sin SDK.
// Usa fetch y la clave publishable. Las sesiones viven en sessionStorage.
// Requiere: js/config.js, js/utils.js y js/data.js cargados antes de usar sus funciones.

const SUPABASE_SESSION_KEY = 'rx_sb_session';
const SUPABASE_PRODUCT_SELECT = 'id,name,category,price_cents,stock,badge,description,images,variants,active,created_at';
const SUPABASE_ORDER_SELECT = 'id,created_at,status,client_name,client_address,client_notes,total_cents,order_items(id,name,variant,unit_price_cents,quantity)';

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
    token,
    prefer,
    headers = {}
  } = options;

  const requestHeaders = {
    apikey: SUPABASE_CONFIG.publishableKey,
    ...headers
  };

  if (token) requestHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
  if (prefer) requestHeaders.Prefer = prefer;

  let response;

  try {
    response = await fetch(`${SUPABASE_CONFIG.url}${path}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body)
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
    `/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,name,role`,
    { token }
  );

  if (!Array.isArray(rows) || rows.length === 0) return null;
  return { ...rows[0], email: user.email };
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

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

function mapProductRow(row) {
  if (!row) return null;

  return normalizeProduct({
    id: row.id,
    name: row.name,
    category: row.category,
    price: (Number(row.price_cents) || 0) / 100,
    stock: Number(row.stock) || 0,
    badge: row.badge,
    description: row.description || '',
    images: Array.isArray(row.images) ? row.images : [],
    variants: Array.isArray(row.variants) ? row.variants : []
  });
}

function productToRow(product) {
  return {
    name: product.name,
    category: product.category,
    price_cents: toCents(product.price),
    stock: Math.max(0, Math.floor(Number(product.stock) || 0)),
    badge: product.badge || null,
    description: product.description || '',
    images: product.images || [],
    variants: product.variants || [],
    active: product.active !== false
  };
}

async function fetchProductsFromApi(options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const token = includeInactive ? await requireAccessToken() : null;
  const filter = includeInactive ? '' : '&active=eq.true';

  const rows = await supabaseRequest(
    `/rest/v1/products?select=${SUPABASE_PRODUCT_SELECT}&order=created_at.desc${filter}`,
    { token }
  );

  return (Array.isArray(rows) ? rows : []).map(mapProductRow).filter(Boolean);
}

async function createProductInApi(product) {
  const token = await requireAccessToken();
  await supabaseRequest('/rest/v1/products', {
    method: 'POST',
    token,
    body: productToRow(product),
    prefer: 'return=minimal'
  });
}

async function updateProductInApi(productId, product) {
  const token = await requireAccessToken();
  await supabaseRequest(`/rest/v1/products?id=eq.${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    token,
    body: productToRow(product),
    prefer: 'return=minimal'
  });
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

  return {
    id: row.id,
    createdAt: row.created_at,
    date: formatDateShort(new Date(row.created_at)),
    status: row.status || 'pendiente',
    clientName: row.client_name || '',
    clientAddress: row.client_address || '',
    clientNotes: row.client_notes || '',
    totalCents: Number(row.total_cents) || 0,
    items: items.map((item) => ({
      name: item.name,
      variant: item.variant || null,
      unitPriceCents: Number(item.unit_price_cents) || 0,
      quantity: Number(item.quantity) || 0
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
      p_client_address: order.address,
      p_client_notes: order.notes || null,
      p_items: order.items
    }
  });

  if (!data || typeof data !== 'object') {
    throw new SupabaseError('El servidor no devolvió el pedido creado.', 500, data);
  }

  return {
    orderId: data.order_id,
    totalCents: Number(data.total_cents) || 0,
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
