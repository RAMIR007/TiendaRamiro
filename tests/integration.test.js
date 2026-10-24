// tests/integration.test.js — Prueba de integración real con jsdom.
// Carga public/index.html y public/admin.html, ejecuta sus scripts y simula
// clics/formularios. Requiere: npm install (jsdom es dependencia de desarrollo).

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.join(__dirname, '..');

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

const tick = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Carga una página sustituyendo los <script src> por scripts inline para que
// jsdom los ejecute sin acceso a red.
async function loadPage(pageFile) {
  const directory = path.dirname(path.join(root, pageFile));
  let html = fs.readFileSync(path.join(root, pageFile), 'utf8');

  html = html.replace(/<script src="([^"]+)"><\/script>/g, (match, src) => {
    const code = fs.readFileSync(path.join(directory, src), 'utf8');
    return `<script>${code}</script>`;
  });

  const errors = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => errors.push(error.message));
  virtualConsole.on('error', (message) => errors.push(String(message)));

  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    virtualConsole
  });

  const win = dom.window;
  win.alert = (message) => { win.__alerts.push(String(message)); };
  win.confirm = () => true;
  win.__alerts = [];
  win.__lastOpened = null;

  // Los enlaces de WhatsApp no deben navegar de verdad en jsdom.
  win.HTMLAnchorElement.prototype.click = function click() {
    win.__lastOpened = this.href;
  };

  await tick(80);

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

function readJson(win, key, fallback) {
  try {
    return JSON.parse(win.localStorage.getItem(key)) ?? fallback;
  } catch (error) {
    return fallback;
  }
}

(async () => {
  /* ---------------------------------------------------------------- */
  console.log('\nTienda — catálogo y renderizado');
  /* ---------------------------------------------------------------- */

  const store = await loadPage('public/index.html');
  const { win, doc } = store;

  await check('sin errores de ejecución al cargar', () => {
    assert.deepStrictEqual(store.errors, []);
  });

  await check('renderiza los 8 productos y las 4 pestañas de categoría', () => {
    assert.strictEqual(doc.querySelectorAll('.product-card').length, 8);
    assert.strictEqual(doc.querySelectorAll('.cat-btn').length, 4);
    assert.match(doc.getElementById('productsCount').textContent, /8 productos/);
  });

  await check('aplica el nombre de marca desde config.js', () => {
    assert.strictEqual(doc.querySelector('[data-config="brand-name"]').textContent, 'RX Store Demo');
    assert.match(doc.getElementById('footerWhatsApp').href, /wa\.me\/5358382989/);
  });

  await check('las categorías se generan desde la configuración', () => {
    const labels = Array.from(doc.querySelectorAll('.cat-btn')).map((b) => b.textContent.trim());
    assert.deepStrictEqual(labels, [
      'Todos los productos',
      '⚡ Tecnología',
      '👟 Moda & Calzado',
      '🏠 Hogar & Accesorios'
    ]);
  });

  await check('el stock agotado deshabilita el botón de añadir', () => {
    const products = readJson(win, 'rx_store_products', []);
    const target = products.find((p) => p.id === 'prod-2');
    target.stock = 0;
    win.localStorage.setItem('rx_store_products', JSON.stringify(products));
    win.renderCatalog();

    const card = doc.querySelector('.product-card[data-id="prod-2"]');
    assert.ok(card.classList.contains('is-out'));
    assert.strictEqual(card.querySelector('.btn-add-quick').disabled, true);

    target.stock = 8;
    win.localStorage.setItem('rx_store_products', JSON.stringify(products));
    win.renderCatalog();
  });

  /* ---------------------------------------------------------------- */
  console.log('\nTienda — seguridad (XSS)');
  /* ---------------------------------------------------------------- */

  await check('escapa nombres de producto maliciosos (no ejecuta HTML)', () => {
    const products = readJson(win, 'rx_store_products', []);
    products.push({
      id: 'evil-1',
      name: '<img src=x onerror="window.__xss = true">Auriculares',
      category: 'tecnologia',
      price: 10,
      stock: 3,
      description: '<script>window.__xss = true<\/script>',
      images: ['https://example.com/a.jpg'],
      variants: ['"><b>variante</b>']
    });
    win.localStorage.setItem('rx_store_products', JSON.stringify(products));
    win.renderCatalog();

    assert.strictEqual(win.__xss, undefined, 'se ejecutó un script inyectado');
    assert.strictEqual(doc.querySelector('.product-card img[onerror]'), null);
    assert.ok(doc.getElementById('productsGrid').textContent.includes('<img'));

    win.localStorage.setItem('rx_store_products', JSON.stringify(products.filter((p) => p.id !== 'evil-1')));
    win.renderCatalog();
  });

  /* ---------------------------------------------------------------- */
  console.log('\nTienda — carrito y stock');
  /* ---------------------------------------------------------------- */

  await check('añadir al carrito actualiza contador y subtotal', () => {
    const card = doc.querySelector('.product-card[data-id="prod-1"]');
    click(card.querySelector('.btn-add-quick'));

    assert.strictEqual(win.getCartTotals().count, 1);
    assert.strictEqual(doc.getElementById('cartSubtotal').textContent, '$28 USD');
    assert.strictEqual(doc.querySelector('.cart-count').textContent, '1');
  });

  await check('no permite superar el stock disponible (prod-1 = 12)', () => {
    const card = doc.querySelector('.product-card[data-id="prod-1"]');
    for (let i = 0; i < 20; i += 1) click(card.querySelector('.btn-add-quick'));

    assert.strictEqual(win.getCartTotals().count, 12);
    assert.strictEqual(win.getCartTotals().totalCents, 12 * 2800);
  });

  await check('el modal respeta el stock y añade la variante elegida', () => {
    click(doc.querySelector('[data-open="prod-5"]'));
    assert.ok(doc.getElementById('productModalOverlay').classList.contains('active'));
    assert.strictEqual(doc.getElementById('modalTitle').textContent, 'Zapatillas Urbanas Minimalist Low');

    win.changeModalQty(1);
    win.changeModalQty(1);
    assert.strictEqual(doc.getElementById('modalQty').textContent, '3');

    click(doc.querySelector('#modalVariantsList [data-variant="Talla 42"]'));
    click(doc.getElementById('modalAddBtn'));

    const cart = readJson(win, 'rx_store_cart', []);
    const line = cart.find((item) => item.id === 'prod-5');
    assert.ok(line, 'no se añadió el producto');
    assert.strictEqual(line.quantity, 3);
    assert.strictEqual(line.variant, 'Talla 42');
    assert.strictEqual(doc.getElementById('productModalOverlay').classList.contains('active'), false);
  });

  await check('disminuir por debajo de 1 elimina la línea del carrito', () => {
    const before = readJson(win, 'rx_store_cart', []).length;
    win.updateCartItemQty('prod-5__Talla 42', -3);
    assert.strictEqual(readJson(win, 'rx_store_cart', []).length, before - 1);
  });

  /* ---------------------------------------------------------------- */
  console.log('\nTienda — checkout');
  /* ---------------------------------------------------------------- */

  await check('valida nombre y dirección antes de registrar el pedido', () => {
    submit(doc.getElementById('checkoutForm'));

    assert.strictEqual(readJson(win, 'rx_store_orders', []).length, 0);
    assert.ok(doc.getElementById('clientName').classList.contains('invalid'));
    assert.match(doc.getElementById('clientNameError').textContent, /nombre/i);
    assert.match(doc.getElementById('clientAddressError').textContent, /dirección/i);
  });

  await check('registra un pedido único, descuenta stock y limpia el carrito', () => {
    const productsBefore = readJson(win, 'rx_store_products', []);
    const stockBefore = productsBefore.find((p) => p.id === 'prod-1').stock;
    const cartBefore = readJson(win, 'rx_store_cart', []);
    const expectedCents = cartBefore.reduce((sum, item) => sum + Math.round(item.price * 100) * item.quantity, 0);

    doc.getElementById('clientName').value = 'María López';
    doc.getElementById('clientAddress').value = 'Playa, La Habana';
    submit(doc.getElementById('checkoutForm'));

    const orders = readJson(win, 'rx_store_orders', []);
    assert.strictEqual(orders.length, 1);
    assert.strictEqual(orders[0].totalCents, expectedCents);
    assert.strictEqual(orders[0].status, 'pendiente');
    assert.strictEqual(orders[0].clientName, 'María López');

    const stockAfter = readJson(win, 'rx_store_products', [])
      .find((p) => p.id === 'prod-1').stock;
    assert.strictEqual(stockAfter, stockBefore - 12);

    assert.deepStrictEqual(readJson(win, 'rx_store_cart', []), []);
    assert.strictEqual(win.getCartTotals().count, 0);
    assert.strictEqual(doc.getElementById('cartSubtotal').textContent, '$0 USD');

    assert.match(win.__lastOpened, /^https:\/\/wa\.me\/5358382989\?text=/);
    assert.ok(decodeURIComponent(win.__lastOpened).includes('María López'));
    assert.ok(decodeURIComponent(win.__lastOpened).includes('$336 USD'));
  });

  await check('un segundo envío con el carrito vacío no duplica pedidos', () => {
    submit(doc.getElementById('checkoutForm'));
    assert.strictEqual(readJson(win, 'rx_store_orders', []).length, 1);
  });

  await check('el pedido queda en la auditoría', () => {
    const logs = readJson(win, 'rx_store_audit_logs', []);
    assert.ok(logs.some((log) => /Pedido/.test(log.action)));
  });

  store.dom.window.close();

  /* ---------------------------------------------------------------- */
  console.log('\nPanel — autenticación');
  /* ---------------------------------------------------------------- */

  const admin = await loadPage('public/admin.html');
  const adminWin = admin.win;
  const adminDoc = admin.doc;

  await check('sin errores de ejecución al cargar el panel', () => {
    assert.deepStrictEqual(admin.errors, []);
  });

  await check('el login muestra las credenciales solo en modo demo', () => {
    const box = adminDoc.getElementById('demoCredentials');
    assert.strictEqual(box.hidden, false);
    assert.match(box.textContent, /admin123/);
    assert.match(box.textContent, /ventas123/);
  });

  await check('rechaza contraseña incorrecta', async () => {
    adminDoc.getElementById('adminUser').value = 'admin';
    adminDoc.getElementById('adminPassword').value = 'incorrecta';
    submit(adminDoc.getElementById('loginForm'));
    await tick(30);
    assert.match(adminDoc.getElementById('loginError').textContent, /incorrectos/);
    assert.strictEqual(adminDoc.getElementById('adminLayout').style.display, 'none');
  });

  await check('el usuario ventas puede entrar con ventas123 (hash corregido)', async () => {
    adminDoc.getElementById('adminUser').value = 'ventas';
    adminDoc.getElementById('adminPassword').value = 'ventas123';
    submit(adminDoc.getElementById('loginForm'));
    await tick(30);
    assert.strictEqual(adminDoc.getElementById('adminLayout').style.display, 'block');
    assert.match(adminDoc.getElementById('adminUserBadge').textContent, /Ventas/);
  });

  await check('el rol ventas no ve eliminar, usuarios ni restablecer', () => {
    assert.strictEqual(adminDoc.querySelectorAll('[data-action="delete-product"]').length, 0);
    assert.strictEqual(adminDoc.querySelector('[data-action="open-users"]').hidden, true);
    assert.strictEqual(adminDoc.querySelector('[data-action="reset-catalog"]').hidden, true);
  });

  await check('el rol ventas no puede eliminar productos desde la consola', () => {
    adminWin.deleteProduct('prod-1');
    const products = readJson(adminWin, 'rx_store_products', []);
    assert.ok(products.some((p) => p.id === 'prod-1'), 'el producto se eliminó sin permiso');
    assert.match(adminDoc.getElementById('toastMsg').textContent, /rol/i);
  });

  adminWin.close();

  /* ---------------------------------------------------------------- */
  console.log('\nPanel — administración');
  /* ---------------------------------------------------------------- */

  const panel = await loadPage('public/admin.html');
  const pw = panel.win;
  const pd = panel.doc;

  pd.getElementById('adminUser').value = 'admin';
  pd.getElementById('adminPassword').value = 'admin123';
  submit(pd.getElementById('loginForm'));
  await tick(30);

  await check('el administrador entra con admin123', () => {
    assert.strictEqual(pd.getElementById('adminLayout').style.display, 'block');
    assert.strictEqual(pd.querySelectorAll('#adminTableBody tr').length, 8);
  });

  await check('crea un producto y lo registra en la auditoría', () => {
    pw.openCreateModal();
    assert.ok(pd.getElementById('formModal').classList.contains('active'));

    pd.getElementById('pName').value = 'Producto de Prueba';
    pd.getElementById('pCategory').value = 'hogar';
    pd.getElementById('pPrice').value = '12.50';
    pd.getElementById('pStock').value = '4';
    pd.getElementById('pImages').value = 'https://example.com/foto.jpg, javascript:alert(1)';
    pd.getElementById('pVariants').value = 'Único';
    submit(pd.getElementById('productForm'));

    const products = readJson(pw, 'rx_store_products', []);
    const created = products.find((p) => p.name === 'Producto de Prueba');
    assert.ok(created, 'no se creó el producto');
    assert.deepStrictEqual(created.images, ['https://example.com/foto.jpg']);
    assert.strictEqual(created.price, 12.5);
    assert.strictEqual(pd.querySelectorAll('#adminTableBody tr').length, 9);

    const logs = readJson(pw, 'rx_store_audit_logs', []);
    assert.match(logs[0].action, /Creó el producto/);
  });

  await check('editar el producto sin tocar imágenes conserva las anteriores', () => {
    const before = readJson(pw, 'rx_store_products', []).find((p) => p.name === 'Producto de Prueba');
    pw.openEditModal(before.id);
    pd.getElementById('pImages').value = '';
    pd.getElementById('pStock').value = '7';
    submit(pd.getElementById('productForm'));

    const after = readJson(pw, 'rx_store_products', []).find((p) => p.name === 'Producto de Prueba');
    assert.deepStrictEqual(after.images, ['https://example.com/foto.jpg']);
    assert.strictEqual(after.stock, 7);
  });

  await check('crea un pedido de prueba y lo muestra en la pestaña Pedidos', () => {
    pw.localStorage.setItem('rx_store_orders', JSON.stringify([{
      id: 'ord-test',
      date: '1/1/2026, 10:00',
      timestamp: Date.now(),
      status: 'pendiente',
      clientName: '<b>Cliente</b>',
      clientAddress: 'Centro Habana',
      clientNotes: '<img src=x onerror="window.__xss2=1">',
      items: [{ name: 'Producto de Prueba', variant: 'Único', price: 12.5, quantity: 2 }],
      total: 25,
      totalCents: 2500,
      count: 2
    }]));

    pw.switchAdminTab('orders');

    assert.strictEqual(pd.getElementById('ordersBadgeCount').textContent, '1');
    assert.strictEqual(pd.getElementById('ordersTotalAmount').textContent, '$25 USD');
    assert.strictEqual(pw.__xss2, undefined);
    assert.strictEqual(pd.querySelector('#ordersListContainer img'), null);

    const renderedName = pd.querySelector('#ordersListContainer .order-card-header strong').textContent;
    assert.ok(renderedName.includes('<b>Cliente</b>'), 'el nombre debe mostrarse como texto plano');
  });

  await check('editar un usuario dejando la contraseña vacía mantiene el hash', async () => {
    pw.openUsersModal();
    assert.ok(pd.getElementById('usersModal').classList.contains('active'));

    const hashBefore = readJson(pw, 'rx_store_admin_users', []).find((u) => u.user === 'ventas').passHash;

    pw.editUserPassword('ventas');
    pd.getElementById('uName').value = 'Ventas Actualizado';
    pd.getElementById('uPassword').value = '';
    submit(pd.getElementById('userForm'));
    await tick(30);

    const user = readJson(pw, 'rx_store_admin_users', []).find((u) => u.user === 'ventas');
    assert.strictEqual(user.name, 'Ventas Actualizado');
    assert.strictEqual(user.passHash, hashBefore);
  });

  await check('no permite eliminar al último administrador', () => {
    const usersBefore = readJson(pw, 'rx_store_admin_users', []).length;
    pw.deleteUserAccount('admin');
    assert.strictEqual(readJson(pw, 'rx_store_admin_users', []).length, usersBefore);
    assert.match(pd.getElementById('toastMsg').textContent, /propia cuenta|último/i);
  });

  await check('la limpieza de auditoría deja constancia del evento', () => {
    pw.clearAuditLogs();
    const logs = readJson(pw, 'rx_store_audit_logs', []);
    assert.strictEqual(logs.length, 1);
    assert.match(logs[0].action, /Vació el historial/);
  });

  panel.win.close();

  /* ---------------------------------------------------------------- */
  console.log(`\n${passed} comprobaciones OK, ${failures.length} fallos\n`);
  if (failures.length > 0) process.exitCode = 1;
})().catch((error) => {
  console.error('\nError no controlado en la prueba:', error);
  process.exitCode = 1;
});
