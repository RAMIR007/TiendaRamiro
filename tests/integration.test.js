// tests/integration.test.js — Prueba de integración con jsdom y Supabase simulado.
// Carga public/index.html y public/admin.html, intercepta fetch y verifica la
// tienda, el login, los roles, el CRUD y el checkout sin tocar el proyecto real.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { randomUUID } = require('crypto');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '..');
const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value));

const PRODUCTS = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Auriculares Inalámbricos TWS Pro',
    category: 'tecnologia',
    price_cents: 2800,
    stock: 12,
    badge: 'Más vendido',
    description: 'Auriculares bluetooth con estuche de carga.',
    images: ['https://example.com/auriculares.jpg'],
    variants: ['Negro Mate', 'Blanco Glaciar'],
    active: true,
    created_at: '2026-10-20T10:00:00Z'
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Camiseta Oversize Algodón Premium',
    category: 'moda',
    price_cents: 2000,
    stock: 5,
    badge: null,
    description: 'Camiseta de algodón peinado.',
    images: ['https://example.com/camiseta.jpg'],
    variants: ['S', 'M'],
    active: true,
    created_at: '2026-10-21T10:00:00Z'
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Lámpara de Escritorio LED',
    category: 'hogar',
    price_cents: 3000,
    stock: 0,
    badge: null,
    description: 'Lámpara recargable.',
    images: [],
    variants: [],
    active: true,
    created_at: '2026-10-22T10:00:00Z'
  }
];

const ORDERS = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    created_at: '2026-10-24T12:00:00Z',
    status: 'pendiente',
    client_name: 'María López',
    client_address: 'Playa, La Habana',
    client_notes: 'Entregar después de las 5',
    total_cents: 5600,
    order_items: [
      { name: 'Auriculares Inalámbricos TWS Pro', variant: 'Negro Mate', unit_price_cents: 2800, quantity: 2 }
    ]
  }
];

const AUDIT = [
  { id: 1, created_at: '2026-10-24T11:00:00Z', user_label: 'admin@test.com', action: 'Inició sesión' }
];

const USERS = {
  'admin@test.com': { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'admin@test.com', password: 'Admin12345', name: 'Administrador', role: 'admin' },
  'ventas@test.com': { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', email: 'ventas@test.com', password: 'Ventas12345', name: 'Ventas', role: 'staff' },
  'pending@test.com': { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'pending@test.com', password: 'Pending12345', name: 'Pendiente', role: 'pending' }
};

function createMock() {
  const state = {
    products: clone(PRODUCTS),
    categories: [
      { key: 'tecnologia', label: 'Tecnología', emoji: '⚡', active: true },
      { key: 'moda', label: 'Moda & Calzado', emoji: '👟', active: true },
      { key: 'hogar', label: 'Hogar & Accesorios', emoji: '🏠', active: true }
    ],
    productLocations: [
      {
        product_id: '11111111-1111-4111-8111-111111111111',
        supplier_city: 'La Habana',
        supplier_municipality: 'Playa',
        supplier_address: 'Calle privada 10'
      }
    ],
    productImages: [],
    orders: clone(ORDERS),
    audit: clone(AUDIT),
    profiles: Object.fromEntries(Object.values(USERS).map((user) => [
      user.id,
      { id: user.id, name: user.name, role: user.role }
    ])),
    users: USERS,
    requests: [],
    lastOrderPayload: null,
    lastOrderPatch: null,
    productCosts: [],
    passwordUpdates: [],
    recoveries: [],
    alerts: [],
    nextAuditId: 100
  };

  const respond = (data, status = 200) => ({
    ok: status >= 200 && status < 400,
    status,
    text: async () => (data === undefined ? '' : JSON.stringify(data))
  });

  async function fetchMock(input, options = {}) {
    const url = new URL(String(input));
    const route = url.pathname;
    const method = String(options.method || 'GET').toUpperCase();
    const headers = options.headers || {};
    const body = options.body && typeof options.body === 'string' ? JSON.parse(options.body) : null;
    const authorization = headers.Authorization || headers.authorization || '';
    const token = authorization.replace(/^Bearer\s+/i, '');
    const userId = token.startsWith('token-') ? token.slice(6) : null;

    state.requests.push({ route, method, body, query: url.searchParams, token });

    if (route === '/auth/v1/token' && method === 'POST') {
      const grant = url.searchParams.get('grant_type');

      if (grant === 'refresh_token') {
        return respond({ access_token: 'token-admin', refresh_token: 'refresh', expires_in: 3600, user: { id: USERS['admin@test.com'].id, email: 'admin@test.com' } });
      }

      const email = String(body.email || '').toLowerCase();
      const user = state.users[email];

      if (!user || user.password !== body.password) {
        return respond({ msg: 'Invalid login credentials' }, 400);
      }

      return respond({
        access_token: `token-${user.id}`,
        refresh_token: 'refresh-token',
        expires_in: 3600,
        user: { id: user.id, email: user.email }
      });
    }

    if (route === '/auth/v1/recover' && method === 'POST') {
      state.recoveries.push(body.email);
      return respond({}, 200);
    }

    if (route === '/auth/v1/user' && method === 'GET') {
      const user = Object.values(state.users).find((candidate) => candidate.id === userId);
      return respond({ id: userId, email: user ? user.email : 'desconocido@test.com' });
    }

    if (route === '/auth/v1/user' && method === 'PUT') {
      state.passwordUpdates.push(body.password);
      return respond({}, 200);
    }

    if (route === '/auth/v1/logout') return respond(null, 204);

    if (route === '/rest/v1/profiles' && method === 'GET') {
      const id = String(url.searchParams.get('id') || '').replace(/^eq\./, '');
      const profile = state.profiles[id];
      return respond(profile ? [profile] : []);
    }

    if (route === '/rest/v1/products' && method === 'GET') {
      const activeOnly = url.searchParams.get('active') === 'eq.true';
      const select = url.searchParams.get('select') || '';
      const withLocations = select.includes('product_locations(');
      const isAdmin = userId === USERS['admin@test.com'].id;
      const rows = state.products
        .filter((product) => !activeOnly || product.active)
        .map((product) => {
          if (!withLocations) return product;

          const location = state.productLocations.find((item) => item.product_id === product.id);
          return {
            ...product,
            product_locations: isAdmin && location ? [location] : []
          };
        });
      return respond(rows);
    }

    if (route === '/rest/v1/categories' && method === 'GET') {
      const activeOnly = url.searchParams.get('active') === 'eq.true';
      return respond(state.categories.filter((category) => !activeOnly || category.active));
    }

    if (route === '/rest/v1/categories' && method === 'POST') {
      if (state.categories.some((category) => category.key === body.key)) {
        return respond({ message: 'duplicate key value violates unique constraint' }, 409);
      }
      const category = { ...body };
      state.categories.push(category);
      return respond([category], 201);
    }

    if (route.startsWith('/storage/v1/object/product-images/') && method === 'POST') {
      state.productImages.push({
        path: route.slice('/storage/v1/object/product-images/'.length),
        contentType: headers['Content-Type'] || headers['content-type']
      });
      return respond({ Key: route });
    }

    if (route === '/storage/v1/object/product-images' && method === 'DELETE') {
      state.productImages = state.productImages.filter((image) => !body.prefixes.includes(image.path));
      return respond({});
    }

    if (route === '/rest/v1/products' && method === 'POST') {
      const wantsRepresentation = url.searchParams.get('select') !== null;
      const rows = Array.isArray(body) ? body : [body];
      const inserted = rows.map((row) => ({ ...row, id: randomUUID(), created_at: new Date().toISOString() }));
      state.products.unshift(...inserted);
      return wantsRepresentation ? respond(inserted) : respond(null, 201);
    }

    if (route === '/rest/v1/product_locations' && method === 'POST') {
      if (userId !== USERS['admin@test.com'].id) {
        return respond({ message: 'row-level security policy violation' }, 403);
      }
      const index = state.productLocations.findIndex((item) => item.product_id === body.product_id);
      if (index >= 0) state.productLocations[index] = { ...state.productLocations[index], ...body };
      else state.productLocations.push(body);
      return respond(null, 201);
    }

    if (route === '/rest/v1/products' && method === 'PATCH') {
      const id = String(url.searchParams.get('id') || '').replace(/^eq\./, '');
      const index = state.products.findIndex((product) => product.id === id);
      if (index > -1) state.products[index] = { ...state.products[index], ...body };
      return respond(null, 204);
    }

    if (route === '/rest/v1/products' && method === 'DELETE') {
      const id = String(url.searchParams.get('id') || '').replace(/^eq\./, '');
      state.products = state.products.filter((product) => product.id !== id);
      return respond(null, 204);
    }

    if (route === '/rest/v1/product_costs' && method === 'POST') {
      const existing = state.productCosts.findIndex((cost) => cost.product_id === body.product_id);
      if (existing > -1) {
        state.productCosts[existing] = { ...state.productCosts[existing], ...body };
      } else {
        state.productCosts.unshift({ ...body, updated_at: new Date().toISOString() });
      }
      return respond(null, 201);
    }

    if (route === '/rest/v1/orders' && method === 'GET') {
      return respond(state.orders);
    }

    if (route === '/rest/v1/orders' && method === 'PATCH') {
      const id = String(url.searchParams.get('id') || '').replace(/^eq\./, '');
      state.lastOrderPatch = { id, body };
      const order = state.orders.find((candidate) => candidate.id === id);
      if (order) order.status = body.status;
      return respond(null, 204);
    }

    if (route === '/rest/v1/orders' && method === 'DELETE') {
      const id = String(url.searchParams.get('id') || '').replace(/^eq\./, '');
      state.orders = state.orders.filter((order) => order.id !== id);
      return respond(null, 204);
    }

    if (route === '/rest/v1/rpc/create_order' && method === 'POST') {
      state.lastOrderPayload = body;

      const totalCents = body.p_items.reduce((sum, item) => {
        const product = state.products.find((candidate) => candidate.id === item.product_id);
        return sum + (product ? product.price_cents : 0) * item.quantity;
      }, 0);
      const count = body.p_items.reduce((sum, item) => sum + item.quantity, 0);

      return respond({ order_id: randomUUID(), total_cents: totalCents, count });
    }

    if (route === '/rest/v1/audit_logs' && method === 'GET') {
      return respond(state.audit);
    }

    if (route === '/rest/v1/audit_logs' && method === 'POST') {
      state.nextAuditId += 1;
      state.audit.unshift({
        id: state.nextAuditId,
        created_at: new Date().toISOString(),
        user_label: body.user_label,
        action: body.action
      });
      return respond(null, 201);
    }

    if (route === '/rest/v1/audit_logs' && method === 'DELETE') {
      state.audit = [];
      return respond(null, 204);
    }

    return respond({ msg: `Ruta no simulada: ${method} ${route}` }, 404);
  }

  return { state, fetch: fetchMock };
}

async function loadPage(pageFile, mock, options = {}) {
  const pagePath = path.join(root, pageFile);
  const pageDir = path.dirname(pagePath);
  let html = fs.readFileSync(pagePath, 'utf8');

  html = html.replace(/<script src="([^"]+)"><\/script>/g, (match, src) => {
    const code = fs.readFileSync(path.join(pageDir, src), 'utf8');
    return `<script>${code}</script>`;
  });

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  virtualConsole.on('error', (message) => errors.push(String(message)));

  const dom = new JSDOM(html, {
    url: options.url || 'http://localhost/',
    runScripts: 'dangerously',
    virtualConsole,
    beforeParse(window) {
      window.fetch = mock.fetch;
      window.confirm = () => true;
      window.alert = (message) => mock.state.alerts.push(String(message));
    }
  });

  const win = dom.window;
  win.__lastOpened = null;
  win.HTMLAnchorElement.prototype.click = function click() {
    win.__lastOpened = this.href;
  };

  await tick(220);

  return { dom, win, doc: win.document, errors };
}

function click(element) {
  const win = element.ownerDocument.defaultView;
  element.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function submit(form) {
  const win = form.ownerDocument.defaultView;
  form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
}

async function login(win, doc, email, password) {
  doc.getElementById('adminEmail').value = email;
  doc.getElementById('adminPassword').value = password;
  submit(doc.getElementById('loginForm'));
  await tick(260);
}

(async () => {
  /* ---------------------------------------------------------------- */
  console.log('\nTienda — catálogo remoto');
  /* ---------------------------------------------------------------- */

  const storeMock = createMock();
  const store = await loadPage('public/index.html', storeMock);
  const { win, doc } = store;

  await check('carga sin errores y sin login local', () => {
    assert.deepStrictEqual(store.errors, []);
    assert.strictEqual(doc.getElementById('adminUser'), null);
    assert.strictEqual(doc.getElementById('adminEmail'), null);
  });

  await check('publica metadatos SEO y datos estructurados de la tienda', () => {
    assert.match(doc.title, /ramirox market.*tecnología, moda y hogar/i);
    assert.strictEqual(doc.querySelector('[data-config="brand-name"]').textContent, 'RamiroX Market');
    assert.strictEqual(doc.querySelector('link[rel="canonical"]').href, 'https://tiendaramiro.ramiroxavier07.workers.dev/');
    assert.ok(doc.querySelector('meta[name="description"]').content.includes('WhatsApp'));
    assert.strictEqual(doc.querySelector('meta[property="og:url"]').content, 'https://tiendaramiro.ramiroxavier07.workers.dev/');
    const structuredData = JSON.parse(doc.querySelector('script[type="application/ld+json"]').textContent);
    assert.strictEqual(structuredData['@type'], 'OnlineStore');
    assert.strictEqual(structuredData.name, 'RamiroX Market');
  });

  await check('el enlace de salto enfoca el catálogo principal', () => {
    const skipLink = doc.querySelector('.skip-link');
    const main = doc.querySelector('main');
    assert.strictEqual(skipLink.getAttribute('href'), '#mainContent');
    assert.strictEqual(main.id, 'mainContent');
    assert.strictEqual(main.tabIndex, -1);
  });

  await check('renderiza los productos que llegan de Supabase', () => {
    assert.strictEqual(doc.querySelectorAll('.product-card').length, 3);
    assert.match(doc.getElementById('productsCount').textContent, /3 productos/);
    assert.ok(doc.body.textContent.includes('Auriculares Inalámbricos TWS Pro'));
  });

  await check('la consulta pública no solicita la ubicación privada de proveedores', () => {
    const request = storeMock.state.requests.find((item) =>
      item.route === '/rest/v1/products' && item.method === 'GET'
    );
    assert.ok(request);
    assert.ok(!request.query.get('select').includes('product_locations'));
    assert.ok(!request.query.get('select').includes('supplier_address'));
  });

  await check('sincroniza las categorías guardadas en Supabase', () => {
    assert.strictEqual(doc.querySelectorAll('#categoriesPills .cat-btn').length, 4);
    assert.ok(doc.querySelector('#categoriesPills [data-cat="moda"]'));
  });

  await check('mantiene el filtro activo al volver a renderizar las categorías', () => {
    click(doc.querySelector('#categoriesPills [data-cat="moda"]'));
    win.renderCategories();

    const activeCategory = doc.querySelector('#categoriesPills [data-cat="moda"]');
    assert.strictEqual(activeCategory.getAttribute('aria-pressed'), 'true');
    assert.ok(activeCategory.classList.contains('active'));
    assert.strictEqual(doc.querySelectorAll('.product-card').length, 1);

    click(doc.querySelector('#categoriesPills [data-cat="all"]'));
    assert.strictEqual(doc.querySelectorAll('.product-card').length, 3);
  });

  await check('el producto agotado no se puede añadir', () => {
    const card = doc.querySelector('.product-card[data-id="33333333-3333-4333-8333-333333333333"]');
    assert.ok(card.classList.contains('is-out'));
    assert.strictEqual(card.querySelector('.btn-add-quick').disabled, true);
  });

  await check('permite comprar productos disponibles con proveedor sin descontar stock local', async () => {
    storeMock.state.products[2].supplier_available = true;
    const refreshedRow = (await win.fetchProductsFromApi()).find((product) => product.id === '33333333-3333-4333-8333-333333333333');
    assert.strictEqual(refreshedRow.supplierAvailable, true);
    await win.refreshProductsFromServer();

    const card = doc.querySelector('.product-card[data-id="33333333-3333-4333-8333-333333333333"]');
    assert.ok(!card.classList.contains('is-out'));
    assert.ok(card.textContent.includes('Disponible con proveedor'));
    assert.strictEqual(card.querySelector('.btn-add-quick').disabled, false);

    click(card.querySelector('.btn-add-quick'));
    assert.strictEqual(win.getCartTotals().count, 1);
    click(card.querySelector('[data-open]'));
    win.changeModalQty(150);
    assert.strictEqual(doc.getElementById('modalQty').textContent, '100');
    click(doc.getElementById('modalAddBtn'));
    assert.strictEqual(win.getCartTotals().count, 100);

    const modalProduct = storeMock.state.products.find((product) => product.id === '33333333-3333-4333-8333-333333333333');
    assert.strictEqual(modalProduct.stock, 0);

    win.clearCart();
    storeMock.state.products[2].supplier_available = false;
    await win.refreshProductsFromServer();
  });

  await check('rellena la caché local para la próxima visita', () => {
    const cached = JSON.parse(win.localStorage.getItem('rx_store_products'));
    assert.strictEqual(cached.length, 3);
  });

  await check('añade al carrito y calcula en centavos', () => {
    const card = doc.querySelector('.product-card[data-id="11111111-1111-4111-8111-111111111111"]');
    click(card.querySelector('.btn-add-quick'));

    assert.strictEqual(win.getCartTotals().count, 1);
    assert.strictEqual(doc.getElementById('cartSubtotal').textContent, '$28 USD');
  });

  await check('respeta el stock del catálogo remoto', () => {
    const card = doc.querySelector('.product-card[data-id="11111111-1111-4111-8111-111111111111"]');
    for (let i = 0; i < 20; i += 1) click(card.querySelector('.btn-add-quick'));

    assert.strictEqual(win.getCartTotals().count, 12);
    assert.strictEqual(win.getCartTotals().totalCents, 33600);
  });

  await check('el modal añade la variante y el stock correctos', () => {
    click(doc.querySelector('[data-open="22222222-2222-4222-8222-222222222222"]'));
    assert.ok(doc.getElementById('productModalOverlay').classList.contains('active'));

    win.changeModalQty(1);
    win.changeModalQty(1);
    click(doc.querySelector('#modalVariantsList [data-variant="M"]'));
    click(doc.getElementById('modalAddBtn'));

    const cart = JSON.parse(win.localStorage.getItem('rx_store_cart'));
    const line = cart.find((item) => item.id === '22222222-2222-4222-8222-222222222222');
    assert.strictEqual(line.quantity, 3);
    assert.strictEqual(line.variant, 'M');
    assert.strictEqual(doc.getElementById('productModalOverlay').classList.contains('active'), false);
  });

  /* ---------------------------------------------------------------- */
  console.log('\nTienda — checkout con RPC');
  /* ---------------------------------------------------------------- */

  await check('valida los datos antes de llamar al servidor', async () => {
    submit(doc.getElementById('checkoutForm'));
    await tick(50);

    assert.strictEqual(storeMock.state.lastOrderPayload, null);
    assert.ok(doc.getElementById('clientName').classList.contains('invalid'));
  });

  await check('rechaza un billete que no cubre producto y mensajería antes de crear el pedido', async () => {
    doc.getElementById('clientName').value = 'María López';
    doc.getElementById('clientPhone').value = '+53 5838 2989';
    doc.getElementById('clientMunicipality').value = 'Playa';
    doc.getElementById('clientAddress').value = 'Calle 23, número 12';
    doc.getElementById('clientReference').value = 'Frente al parque';
    doc.getElementById('clientTimeRange').value = 'Tarde (15:00 — 19:00)';
    doc.getElementById('clientPaymentNote').value = '397';

    submit(doc.getElementById('checkoutForm'));
    await tick(50);

    assert.strictEqual(storeMock.state.lastOrderPayload, null);
    assert.ok(doc.getElementById('clientPaymentNote').classList.contains('invalid'));
    assert.match(doc.getElementById('clientPaymentNoteError').textContent, /398/);
  });

  await check('crea el pedido en Supabase, limpia el carrito y abre WhatsApp', async () => {
    doc.getElementById('clientName').value = 'María López';
    doc.getElementById('clientPhone').value = '+53 5838 2989';
    doc.getElementById('clientMunicipality').value = 'Playa';
    doc.getElementById('clientAddress').value = 'Calle 23, número 12';
    doc.getElementById('clientReference').value = 'Frente al parque';
    doc.getElementById('clientTimeRange').value = 'Tarde (15:00 — 19:00)';
    doc.getElementById('clientPaymentNote').value = '500';

    submit(doc.getElementById('checkoutForm'));
    await tick(260);

    const payload = storeMock.state.lastOrderPayload;
    assert.ok(payload, 'no se llamó a create_order');
    assert.strictEqual(payload.p_client_name, 'María López');
    assert.strictEqual(payload.p_client_phone, '5358382989');
    assert.strictEqual(payload.p_delivery_method, 'domicilio');
    assert.strictEqual(payload.p_client_address, 'Calle 23, número 12, Playa (ref: Frente al parque)');
    assert.strictEqual(payload.p_items.length, 2);
    assert.strictEqual(payload.p_items[0].quantity, 12);
    assert.strictEqual(payload.p_items[1].quantity, 3);
    assert.strictEqual(payload.p_items[1].variant, 'M');

    assert.strictEqual(win.getCartTotals().count, 0);
    assert.strictEqual(doc.getElementById('cartSubtotal').textContent, '$0 USD');
    assert.match(win.__lastOpened, /^https:\/\/wa\.me\/5358382989\?text=/);
    const voucher = new URL(win.__lastOpened).searchParams.get('text');
    assert.ok(voucher.includes('🔱 *VALE DE MENSAJERÍA* 🔱'));
    assert.ok(voucher.includes('Dirección: Calle 23, número 12'));
    assert.ok(voucher.includes('Municipio: Playa'));
    assert.ok(voucher.includes('Punto de referencia: Frente al parque'));
    assert.ok(voucher.includes('Teléfono fijo en caso de tener: —'));
    assert.ok(voucher.includes('Precio de mensajería: $2 USD'));
    assert.ok(voucher.includes('Forma de pago: Efectivo'));
    assert.ok(voucher.includes('Vuelto: $102 USD'));
    assert.ok(voucher.includes('La mensajería es obligatoria pagarla aunque el cliente no se quede con el producto.'));
  });

  await check('genera el vale de recogida con sus campos y sin datos de mensajería', async () => {
    assert.strictEqual(win.addToCart('11111111-1111-4111-8111-111111111111'), true);
    const method = doc.getElementById('deliveryMethod');
    method.value = 'recogida';
    method.dispatchEvent(new win.Event('change', { bubbles: true }));
    doc.getElementById('clientName').value = 'Carlos Pérez';
    doc.getElementById('clientPhone').value = '5358382989';
    doc.getElementById('clientTimeRange').value = 'Mañana (9:00 — 12:00)';
    doc.getElementById('clientPaymentNote').value = '27';
    storeMock.state.lastOrderPayload = null;

    submit(doc.getElementById('checkoutForm'));
    await tick(50);
    assert.strictEqual(storeMock.state.lastOrderPayload, null);
    assert.ok(doc.getElementById('clientPaymentNote').classList.contains('invalid'));
    assert.match(doc.getElementById('clientPaymentNoteError').textContent, /28/);

    doc.getElementById('clientPaymentNote').value = '30';
    submit(doc.getElementById('checkoutForm'));
    await tick(260);

    assert.strictEqual(storeMock.state.lastOrderPayload.p_delivery_method, 'recogida');
    const voucher = new URL(win.__lastOpened).searchParams.get('text');
    assert.ok(voucher.includes('🔱 *VALE DE RECOGIDA* 🔱'));
    assert.ok(voucher.includes('Nombre del cliente: Carlos Pérez'));
    assert.ok(voucher.includes('Teléfono: 5358382989'));
    assert.ok(voucher.includes('Rango de horario de recogida: Mañana (9:00 — 12:00)'));
    assert.ok(voucher.includes('Producto:\n• 1x Auriculares Inalámbricos TWS Pro (Negro Mate)'));
    assert.ok(voucher.includes('Precio del producto:\n• $28 USD ($28 USD c/u)'));
    assert.ok(voucher.includes('Forma de pago: Efectivo'));
    assert.ok(voucher.includes('Nombre y teléfono del gestor (se requiere para las dinámicas): Ramiro (5358382989)'));
    assert.ok(voucher.includes('Revisar bien el producto una vez el cliente se vaya no hay devolución de ningún tipo.'));
    assert.ok(!voucher.includes('Dirección:'));
    assert.ok(!voucher.includes('Precio de mensajería:'));
    assert.ok(!voucher.includes('Total a pagar:'));
  });

  await check('escapa un producto malicioso que llega de la API', async () => {
    storeMock.state.products[0].name = '<img src=x onerror="window.__xss=1">X';
    await win.refreshProductsFromServer();
    await tick(50);

    assert.strictEqual(win.__xss, undefined);
    assert.strictEqual(doc.querySelector('#productsGrid img[onerror]'), null);
    assert.ok(doc.getElementById('productsGrid').textContent.includes('<img'));
  });

  store.dom.window.close();

  /* ---------------------------------------------------------------- */
  console.log('\nPanel — autenticación Supabase');
  /* ---------------------------------------------------------------- */

  const adminMock = createMock();
  const admin = await loadPage('public/admin.html', adminMock);
  const adminWin = admin.win;
  const adminDoc = admin.doc;

  await check('muestra el login por correo, sin credenciales demo', () => {
    assert.deepStrictEqual(admin.errors, []);
    assert.ok(adminDoc.getElementById('adminEmail'));
    assert.strictEqual(adminDoc.getElementById('demoCredentials'), null);
    assert.strictEqual(adminDoc.getElementById('loginScreen').style.display, 'flex');
  });

  await check('sin botón de recuperación SMTP y con aviso de restablecimiento por el admin', async () => {
    assert.deepStrictEqual(admin.errors, []);
    assert.strictEqual(adminDoc.getElementById('forgotPasswordBtn'), null);
    assert.ok(/restablezca/i.test(adminDoc.querySelector('.login-note').textContent));
  });

  await check('rechaza una contraseña incorrecta', async () => {
    await login(adminWin, adminDoc, 'admin@test.com', 'incorrecta');
    assert.match(adminDoc.getElementById('loginError').textContent, /incorrectos/);
    assert.strictEqual(adminDoc.getElementById('adminLayout').style.display, 'none');
  });

  await check('un usuario pendiente no puede entrar', async () => {
    await login(adminWin, adminDoc, 'pending@test.com', 'Pending12345');
    assert.match(adminDoc.getElementById('loginError').textContent, /pendiente/i);
    assert.strictEqual(adminWin.sessionStorage.getItem('rx_sb_session'), null);
  });

  await check('el administrador entra y ve el catálogo remoto', async () => {
    await login(adminWin, adminDoc, 'admin@test.com', 'Admin12345');
    assert.strictEqual(adminDoc.getElementById('adminLayout').style.display, 'block');
    assert.match(adminDoc.getElementById('adminUserBadge').textContent, /Administrador/);
    assert.strictEqual(adminDoc.querySelectorAll('#adminTableBody tr').length, 3);
  });

  await check('el campo para crear categorías tiene una etiqueta accesible', () => {
    const input = adminDoc.getElementById('newCategoryInput');
    assert.strictEqual(adminDoc.querySelector('label[for="newCategoryInput"]').textContent, 'Nombre de la categoría');
    assert.ok(input);
  });

  await check('las pestañas del panel se recorren con flechas, Inicio y Fin', () => {
    const productsTab = adminDoc.getElementById('tabBtnProducts');
    const dispatchKey = (key) => productsTab.ownerDocument.activeElement.dispatchEvent(
      new adminWin.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    );

    productsTab.focus();
    dispatchKey('ArrowRight');
    assert.strictEqual(adminDoc.activeElement.id, 'tabBtnOrders');
    assert.strictEqual(adminDoc.getElementById('tabBtnOrders').getAttribute('aria-selected'), 'true');

    dispatchKey('ArrowLeft');
    assert.strictEqual(adminDoc.activeElement.id, 'tabBtnProducts');

    dispatchKey('End');
    assert.strictEqual(adminDoc.activeElement.id, 'tabBtnAudit');

    dispatchKey('Home');
    assert.strictEqual(adminDoc.activeElement.id, 'tabBtnProducts');
  });

  await check('el administrador lee la ubicación del proveedor desde la tabla protegida', () => {
    const product = adminWin.eval('productsCache.find((item) => item.id === "11111111-1111-4111-8111-111111111111")');
    const request = adminMock.state.requests.find((item) =>
      item.route === '/rest/v1/products'
      && item.method === 'GET'
      && item.query.get('select').includes('product_locations')
    );
    assert.ok(request);
    assert.strictEqual(product.supplierCity, 'La Habana');
    assert.strictEqual(product.supplierMunicipality, 'Playa');
    assert.strictEqual(product.supplierAddress, 'Calle privada 10');
  });

  await check('crea una categoría compartida y la selecciona en el formulario', async () => {
    adminWin.openCreateModal();
    click(adminDoc.getElementById('addCategoryBtn'));
    adminDoc.getElementById('newCategoryInput').value = 'Accesorios';
    click(adminDoc.getElementById('saveCategoryBtn'));
    await tick(220);

    assert.ok(adminMock.state.categories.some((category) => category.key === 'accesorios'));
    assert.strictEqual(adminDoc.getElementById('pCategory').value, 'accesorios');
  });

  await check('sube las imágenes autenticadas a Supabase Storage', async () => {
    const uploaded = await adminWin.uploadProductImage('data:image/webp;base64,AA==');
    assert.match(uploaded.url, /\/storage\/v1\/object\/public\/product-images\/products\//);
    assert.strictEqual(adminMock.state.productImages.length, 1);
    assert.strictEqual(adminMock.state.productImages[0].contentType, 'image/webp');
  });

  await check('crea un producto con precio en centavos y descripción extendida', async () => {
    adminWin.openCreateModal();
    const longDescription = 'x'.repeat(3000);
    assert.strictEqual(adminDoc.getElementById('pDesc').maxLength, 3000);
    adminDoc.getElementById('pName').value = 'Producto de Prueba';
    adminDoc.getElementById('pCategory').value = 'accesorios';
    adminDoc.getElementById('pPrice').value = '12.50';
    adminDoc.getElementById('pStock').value = '';
    adminDoc.getElementById('pSupplierAvailable').checked = true;
    adminDoc.getElementById('pSupplierAvailable').dispatchEvent(new adminWin.Event('change', { bubbles: true }));
    adminDoc.getElementById('pSupplierCity').value = 'La Habana';
    adminDoc.getElementById('pSupplierMunicipality').value = 'Playa';
    adminDoc.getElementById('pSupplierAddress').value = 'Calle 10 #123';
    adminDoc.getElementById('pImages').value = 'https://example.com/foto.jpg, javascript:alert(1)';
    adminDoc.getElementById('pVariants').value = 'Único';
    adminDoc.getElementById('pDesc').value = longDescription;
    adminWin.eval('productLocalImages = ["data:image/webp;base64,AA=="]');

    submit(adminDoc.getElementById('productForm'));
    await tick(300);

    const created = adminMock.state.products.find((product) => product.name === 'Producto de Prueba');
    assert.ok(created, 'no se creó el producto');
    assert.strictEqual(created.price_cents, 1250);
    assert.strictEqual(created.stock, 0);
    assert.strictEqual(created.supplier_available, true);
    assert.strictEqual(created.category, 'accesorios');
    assert.strictEqual(Object.prototype.hasOwnProperty.call(created, 'supplier_city'), false);
    const createdLocation = adminMock.state.productLocations.find((item) => item.product_id === created.id);
    assert.strictEqual(createdLocation.supplier_city, 'La Habana');
    assert.strictEqual(createdLocation.supplier_municipality, 'Playa');
    assert.strictEqual(createdLocation.supplier_address, 'Calle 10 #123');
    assert.strictEqual(created.description, longDescription);
    assert.strictEqual(created.images.length, 2);
    assert.ok(created.images.some((url) => url.includes('/storage/v1/object/public/product-images/products/')));
    assert.ok(created.images.includes('https://example.com/foto.jpg'));
    assert.strictEqual(adminMock.state.productImages.length, 2);
    assert.strictEqual(adminDoc.querySelectorAll('#adminTableBody tr').length, 4);
  });

  await check('los pedidos se leen de Supabase y se cambia el estado', async () => {
    adminWin.switchAdminTab('orders');
    assert.strictEqual(adminDoc.getElementById('ordersTotalAmount').textContent, '$56 USD');

    const select = adminDoc.querySelector('[data-order-status]');
    assert.ok(select, 'no hay selector de estado');
    select.value = 'contactado';
    select.dispatchEvent(new adminWin.Event('change', { bubbles: true }));
    await tick(260);

    assert.strictEqual(adminMock.state.orders[0].status, 'contactado');
    assert.strictEqual(adminMock.state.lastOrderPatch.body.status, 'contactado');
  });

  await check('elimina un pedido y deja el historial vacío', async () => {
    await adminWin.deleteOrder(adminMock.state.orders[0].id);
    await tick(260);

    assert.strictEqual(adminMock.state.orders.length, 0);
    assert.match(adminDoc.getElementById('ordersListContainer').textContent, /Aún no se han generado pedidos/);
  });

  await check('cambia la contraseña desde Mi cuenta', async () => {
    adminWin.openAccountModal();
    adminDoc.getElementById('newPassword').value = 'NuevaClave123';
    adminDoc.getElementById('confirmPassword').value = 'NuevaClave123';
    submit(adminDoc.getElementById('accountForm'));
    await tick(220);

    assert.strictEqual(adminMock.state.passwordUpdates[0], 'NuevaClave123');
  });

  await check('limpia la auditoría y registra el evento', async () => {
    adminWin.switchAdminTab('audit');
    await adminWin.clearAuditLogs();
    await tick(260);

    assert.strictEqual(adminMock.state.audit.length, 1);
    assert.match(adminMock.state.audit[0].action, /Vació el historial/);
  });

  admin.dom.window.close();

  /* ---------------------------------------------------------------- */
  console.log('\nPanel — rol de ventas');
  /* ---------------------------------------------------------------- */

  const staffMock = createMock();
  const staff = await loadPage('public/admin.html', staffMock);
  const staffWin = staff.win;
  const staffDoc = staff.doc;

  await login(staffWin, staffDoc, 'ventas@test.com', 'Ventas12345');

  await check('el rol ventas no ve controles de administrador', () => {
    assert.strictEqual(staffDoc.getElementById('adminLayout').style.display, 'block');
    assert.strictEqual(staffDoc.querySelector('[data-action="create-product"]').hidden, true);
    assert.strictEqual(staffDoc.querySelectorAll('[data-action="delete-product"]').length, 0);
    assert.strictEqual(staffDoc.querySelector('[data-action="import-json"]').hidden, true);
    assert.strictEqual(staffDoc.querySelector('[data-action="clear-audit"]').hidden, true);
  });

  await check('las pestañas con flechas omiten reportes ocultos para ventas', () => {
    const productsTab = staffDoc.getElementById('tabBtnProducts');
    productsTab.focus();
    productsTab.dispatchEvent(new staffWin.KeyboardEvent('keydown', {
      key: 'End',
      bubbles: true,
      cancelable: true
    }));

    assert.strictEqual(staffDoc.activeElement.id, 'tabBtnAudit');
    assert.strictEqual(staffDoc.getElementById('tabBtnAudit').getAttribute('aria-selected'), 'true');
  });

  await check('el rol ventas no puede abrir el formulario de creación', () => {
    staffWin.openCreateModal();
    assert.strictEqual(staffDoc.getElementById('formModal').classList.contains('active'), false);
    assert.match(staffDoc.getElementById('toastMsg').textContent, /rol/i);
  });

  await check('el rol ventas no puede borrar aunque llame a la función', async () => {
    const productId = staffMock.state.products[0].id;
    await staffWin.deleteProduct(productId);
    await tick(100);

    assert.ok(staffMock.state.products.some((product) => product.id === productId));
    assert.match(staffDoc.getElementById('toastMsg').textContent, /rol/i);
  });

  staff.dom.window.close();

  /* ---------------------------------------------------------------- */
  console.log('\nRestablecer contraseña');
  /* ---------------------------------------------------------------- */

  const resetMock = createMock();
  const reset = await loadPage('public/reset-password.html', resetMock, {
    url: 'http://localhost/reset-password#access_token=token-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa&refresh_token=refresh&type=recovery'
  });
  const resetDoc = reset.doc;

  await check('valida el enlace y muestra el formulario', () => {
    assert.strictEqual(resetDoc.getElementById('resetForm').hidden, false);
    assert.match(resetDoc.getElementById('resetEmail').textContent, /admin@test\.com/);
  });

  await check('actualiza la contraseña con el token del enlace', async () => {
    resetDoc.getElementById('resetPassword').value = 'OtraClave123';
    resetDoc.getElementById('resetConfirm').value = 'OtraClave123';
    submit(resetDoc.getElementById('resetForm'));
    await tick(220);

    assert.strictEqual(resetMock.state.passwordUpdates[0], 'OtraClave123');
    assert.strictEqual(resetDoc.getElementById('resetSuccess').hidden, false);
  });

  reset.dom.window.close();

  await check('la migración restringe ubicaciones, pedidos de vendedor y auditoría por rol', () => {
    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20261029120000_security_hardening.sql'),
      'utf8'
    );
    assert.match(migration, /alter table public\.product_locations enable row level security/i);
    assert.match(migration, /revoke all on table public\.product_locations from public, anon/i);
    assert.ok(
      migration.indexOf('insert into public.product_locations') < migration.indexOf('drop column if exists supplier_city'),
      'supplier locations must be copied before the public columns are removed'
    );
    assert.match(migration, /information_schema\.columns[\s\S]*?column_name in \('supplier_city', 'supplier_municipality', 'supplier_address'\)/i);
    assert.match(migration, /create policy "product_locations_admin_all"[\s\S]*?using \(public\.is_admin\(\)\)[\s\S]*?with check \(public\.is_admin\(\)\)/i);
    assert.match(migration, /create policy "orders_staff_read_own"[\s\S]*?public\.is_staff\(\) and seller_id = auth\.uid\(\)/i);
    assert.match(migration, /create policy "order_items_read"[\s\S]*?public\.is_staff\(\)[\s\S]*?o\.seller_id = auth\.uid\(\)/i);
    assert.match(migration, /create policy "audit_staff_insert"[\s\S]*?with check \(public\.is_staff\(\)\)/i);
  });

  await check('la migración de disponibilidad conserva referidos y el inventario físico', () => {
    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20261031120000_supplier_availability.sql'),
      'utf8'
    );
    const orderFunctions = migration.split(/create or replace function public\.create_order/i).slice(1);

    assert.match(migration, /add column if not exists supplier_available boolean not null default false/i);
    assert.strictEqual(orderFunctions.length, 2, 'deben actualizarse ambas firmas de create_order');

    orderFunctions.forEach((orderFunction) => {
      assert.match(orderFunction, /v_product\.stock = 0 and not v_product\.supplier_available/i);
      assert.match(orderFunction, /if v_product\.stock > 0 then\s+update public\.products[\s\S]*?set stock = stock - v_qty/i);
      assert.match(orderFunction, /v_supplier_order_quantity > 100/i);
    });

    assert.match(orderFunctions[0], /p_seller_code[\s\S]*?seller_id, seller_code/i);
    assert.match(orderFunctions[0], /role in \('admin', 'staff'\)/i);
  });

  await check('la nueva migración conserva comisiones fijas y porcentuales sin alterar el contrato del checkout', () => {
    const migration = fs.readFileSync(
      path.join(root, 'supabase/migrations/20261117120000_fix_order_commissions_and_legacy_rpc.sql'),
      'utf8'
    );

    assert.match(migration, /create or replace function public\.create_order\([\s\S]*?p_seller_code text,[\s\S]*?p_items jsonb\)/i);
    assert.match(migration, /select cost_cents, commission_type, commission_percent, commission_fixed_cents, supplier[\s\S]*?from public\.product_costs/i);
    assert.match(migration, /if v_commission_type = 'amount' then[\s\S]*?v_commission_unit := v_commission_fixed[\s\S]*?else[\s\S]*?round\(v_product\.price_cents \* v_commission_percent \/ 100\)/i);
    assert.match(migration, /commission_type, commission_percent, commission_fixed_cents,[\s\S]*?commission_cents, supplier/i);
    assert.match(migration, /if v_product\.stock > 0 then\s+update public\.products[\s\S]*?set stock = stock - v_qty/i);
    assert.match(migration, /revoke all on function public\.create_order\(text, text, text, jsonb\) from public, anon, authenticated/i);
    assert.match(migration, /grant execute on function public\.create_order\(text, text, text, text, text, text, jsonb\) to anon, authenticated/i);
  });

  /* ---------------------------------------------------------------- */
  console.log(`\n${passed} comprobaciones OK, ${failures.length} fallos\n`);
  if (failures.length > 0) process.exitCode = 1;
})().catch((error) => {
  console.error('\nError no controlado en la prueba:', error);
  process.exitCode = 1;
});
