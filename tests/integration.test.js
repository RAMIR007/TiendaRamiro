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
    passwordUpdates: [],
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
    const body = options.body ? JSON.parse(options.body) : null;
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
      return respond(state.products.filter((product) => !activeOnly || product.active));
    }

    if (route === '/rest/v1/products' && method === 'POST') {
      const rows = Array.isArray(body) ? body : [body];
      rows.forEach((row) => {
        state.products.unshift({ ...row, id: randomUUID(), created_at: new Date().toISOString() });
      });
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

async function loadPage(pageFile, mock) {
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
    url: 'http://localhost/',
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

  await check('renderiza los productos que llegan de Supabase', () => {
    assert.strictEqual(doc.querySelectorAll('.product-card').length, 3);
    assert.match(doc.getElementById('productsCount').textContent, /3 productos/);
    assert.ok(doc.body.textContent.includes('Auriculares Inalámbricos TWS Pro'));
  });

  await check('el producto agotado no se puede añadir', () => {
    const card = doc.querySelector('.product-card[data-id="33333333-3333-4333-8333-333333333333"]');
    assert.ok(card.classList.contains('is-out'));
    assert.strictEqual(card.querySelector('.btn-add-quick').disabled, true);
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

  await check('crea el pedido en Supabase, limpia el carrito y abre WhatsApp', async () => {
    doc.getElementById('clientName').value = 'María López';
    doc.getElementById('clientAddress').value = 'Playa, La Habana';

    submit(doc.getElementById('checkoutForm'));
    await tick(260);

    const payload = storeMock.state.lastOrderPayload;
    assert.ok(payload, 'no se llamó a create_order');
    assert.strictEqual(payload.p_client_name, 'María López');
    assert.strictEqual(payload.p_client_address, 'Playa, La Habana');
    assert.strictEqual(payload.p_items.length, 2);
    assert.strictEqual(payload.p_items[0].quantity, 12);
    assert.strictEqual(payload.p_items[1].quantity, 3);
    assert.strictEqual(payload.p_items[1].variant, 'M');

    assert.strictEqual(win.getCartTotals().count, 0);
    assert.strictEqual(doc.getElementById('cartSubtotal').textContent, '$0 USD');
    assert.match(win.__lastOpened, /^https:\/\/wa\.me\/5358382989\?text=/);
    assert.ok(decodeURIComponent(win.__lastOpened).includes('$396 USD'));
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

  await check('crea un producto con precio en centavos', async () => {
    adminWin.openCreateModal();
    adminDoc.getElementById('pName').value = 'Producto de Prueba';
    adminDoc.getElementById('pCategory').value = 'hogar';
    adminDoc.getElementById('pPrice').value = '12.50';
    adminDoc.getElementById('pStock').value = '4';
    adminDoc.getElementById('pImages').value = 'https://example.com/foto.jpg, javascript:alert(1)';
    adminDoc.getElementById('pVariants').value = 'Único';

    submit(adminDoc.getElementById('productForm'));
    await tick(300);

    const created = adminMock.state.products.find((product) => product.name === 'Producto de Prueba');
    assert.ok(created, 'no se creó el producto');
    assert.strictEqual(created.price_cents, 1250);
    assert.deepStrictEqual(created.images, ['https://example.com/foto.jpg']);
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
  console.log(`\n${passed} comprobaciones OK, ${failures.length} fallos\n`);
  if (failures.length > 0) process.exitCode = 1;
})().catch((error) => {
  console.error('\nError no controlado en la prueba:', error);
  process.exitCode = 1;
});
