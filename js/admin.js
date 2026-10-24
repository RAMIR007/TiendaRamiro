// js/admin.js — Panel de administración: sesión, roles, catálogo, pedidos y auditoría.
//
// IMPORTANTE: esta autenticación es del lado del cliente y este panel guarda los
// datos en el navegador. Sirve para gestionar la demo en un solo dispositivo,
// NO como control de acceso real. Ver README ("Límites de esta versión").

// Hash SHA-256 de las contraseñas demo (sin sal, suficiente solo para demo).
// admin123  -> 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
// ventas123 -> e2151232843fc5ee75d0c8bfc0c74bdcdace97b001a7dab658f7a27ecc8d93f5
const DEFAULT_USERS = [
  {
    user: 'admin',
    passHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9',
    role: 'admin',
    name: 'Administrador Principal'
  },
  {
    user: 'ventas',
    passHash: 'e2151232843fc5ee75d0c8bfc0c74bdcdace97b001a7dab658f7a27ecc8d93f5',
    role: 'staff',
    name: 'Gestor de Ventas y Stock'
  }
];

// Solo se muestran si STORE_CONFIG.demoMode es true.
const DEMO_CREDENTIALS = [
  { user: 'admin', pass: 'admin123', role: 'Acceso total' },
  { user: 'ventas', pass: 'ventas123', role: 'Stock y edición' }
];

let currentUser = null;
let adminModalLastFocused = null;

document.addEventListener('DOMContentLoaded', () => {
  renderCategoryOptions();
  renderDemoHint();
  checkAuth();
  setupAdminEvents();
});

function renderCategoryOptions() {
  const select = document.getElementById('pCategory');
  if (!select) return;

  select.innerHTML = STORE_CONFIG.categories
    .map((category) => `<option value="${escapeHtml(category.key)}">${escapeHtml(category.label)}</option>`)
    .join('');
}

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

function sessionRead() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEYS.session);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

function sessionWrite(user) {
  try {
    sessionStorage.setItem(STORAGE_KEYS.session, JSON.stringify({
      user: user.user,
      name: user.name,
      role: user.role
    }));
  } catch (error) {
    console.warn('[session] No se pudo guardar la sesión:', error);
  }
}

function sessionClear() {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.session);
  } catch (error) {
    /* sin sesión que borrar */
  }
}

function isAdmin() {
  return Boolean(currentUser && currentUser.role === 'admin');
}

function userLabel() {
  return currentUser ? `@${currentUser.user} (${currentUser.name})` : 'Sistema';
}

// Guardia real de permisos: las funciones sensibles la llaman antes de actuar.
function requireAdmin(actionLabel) {
  if (isAdmin()) return true;

  pushAudit(userLabel(), `Intento bloqueado: ${actionLabel}`);
  showToast('Tu rol no permite esta acción');
  return false;
}

function getUsers() {
  const stored = storeRead(STORAGE_KEYS.users, null);

  if (!Array.isArray(stored) || stored.length === 0) {
    const seed = DEFAULT_USERS.map((user) => ({ ...user }));
    storeWrite(STORAGE_KEYS.users, seed);
    return seed;
  }

  const users = stored
    .filter((user) => user && typeof user.user === 'string' && user.user.trim())
    .filter((user) => typeof user.passHash === 'string' && /^[a-f0-9]{64}$/i.test(user.passHash))
    .map((user) => ({
      user: String(user.user).trim(),
      name: String(user.name || user.user).trim(),
      passHash: user.passHash.toLowerCase(),
      role: user.role === 'admin' ? 'admin' : 'staff'
    }));

  if (users.length === 0) {
    const seed = DEFAULT_USERS.map((user) => ({ ...user }));
    storeWrite(STORAGE_KEYS.users, seed);
    return seed;
  }

  return users;
}

function saveUsers(users) {
  return storeWrite(STORAGE_KEYS.users, users);
}

function countAdmins(users) {
  return users.filter((user) => user.role === 'admin').length;
}

function checkAuth() {
  const session = sessionRead();

  if (!session || !session.user) {
    showLoginScreen();
    return;
  }

  const found = getUsers().find(
    (user) => user.user.toLowerCase() === String(session.user).toLowerCase()
  );

  if (!found) {
    sessionClear();
    showLoginScreen();
    return;
  }

  currentUser = found;
  sessionWrite(found);
  showAdminPanel();
}

function showLoginScreen() {
  const loginScreen = document.getElementById('loginScreen');
  const layout = document.getElementById('adminLayout');
  if (loginScreen) loginScreen.style.display = 'flex';
  if (layout) layout.style.display = 'none';
  currentUser = null;
}

function showAdminPanel() {
  const loginScreen = document.getElementById('loginScreen');
  const layout = document.getElementById('adminLayout');
  if (loginScreen) loginScreen.style.display = 'none';
  if (layout) layout.style.display = 'block';

  applyRolePermissions();
  renderAdminTable();
  renderOrdersHistory();
  renderAuditLogs();
}

function setLoginError(message) {
  const errorEl = document.getElementById('loginError');
  if (errorEl) errorEl.textContent = message || '';
}

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const userInput = document.getElementById('adminUser').value.trim();
  const passInput = document.getElementById('adminPassword').value;
  const submitButton = document.getElementById('loginSubmit');

  setLoginError('');

  if (!userInput || !passInput) {
    setLoginError('Completa usuario y contraseña.');
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Verificando…';
  }

  try {
    const passHash = await sha256Hex(passInput);
    const found = getUsers().find(
      (user) => user.user.toLowerCase() === userInput.toLowerCase() && user.passHash === passHash
    );

    if (!found) {
      setLoginError('Usuario o contraseña incorrectos.');
      return;
    }

    currentUser = found;
    sessionWrite(found);
    pushAudit(userLabel(), 'Inicio de sesión en el panel');
    form.reset();
    setLoginError('');
    showAdminPanel();
  } catch (error) {
    console.error('[login]', error);
    setLoginError('No se pudo verificar el acceso. Revisa que el navegador permita Web Crypto.');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Ingresar al Panel';
    }
  }
}

function handleLogout() {
  if (currentUser) pushAudit(userLabel(), 'Cierre de sesión');
  currentUser = null;
  sessionClear();
  showLoginScreen();
}

/* ------------------------------------------------------------------ */
/* Permisos de interfaz                                                */
/* ------------------------------------------------------------------ */

function applyRolePermissions() {
  if (!currentUser) return;

  const badge = document.getElementById('adminUserBadge');
  if (badge) {
    badge.textContent = `${currentUser.name} (${isAdmin() ? '👑 Acceso total' : '📦 Ventas & stock'})`;
  }

  // Los controles exclusivos de administrador se ocultan con [data-admin-only].
  document.querySelectorAll('[data-admin-only]').forEach((element) => {
    element.hidden = !isAdmin();
  });
}

function renderDemoHint() {
  const container = document.getElementById('demoCredentials');
  if (!container) return;

  if (!STORE_CONFIG.demoMode) {
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = `
    <strong>🔑 Acceso de demostración</strong>
    <ul>
      ${DEMO_CREDENTIALS.map((credential) => `
        <li><code>${escapeHtml(credential.user)}</code> / <code>${escapeHtml(credential.pass)}</code> — ${escapeHtml(credential.role)}</li>
      `).join('')}
    </ul>
  `;
}

/* ------------------------------------------------------------------ */
/* Pestañas                                                            */
/* ------------------------------------------------------------------ */

function switchAdminTab(tabKey) {
  const tabs = ['products', 'orders', 'audit'];

  tabs.forEach((tab) => {
    const capitalized = tab.charAt(0).toUpperCase() + tab.slice(1);
    const button = document.getElementById(`tabBtn${capitalized}`);
    const panel = document.getElementById(`tabContent${capitalized}`);
    const isActive = tab === tabKey;

    if (button) {
      button.classList.toggle('btn-primary', isActive);
      button.classList.toggle('btn-secondary', !isActive);
      button.setAttribute('aria-selected', String(isActive));
      button.tabIndex = isActive ? 0 : -1;
    }

    if (panel) panel.hidden = !isActive;
  });

  if (tabKey === 'orders') renderOrdersHistory();
  if (tabKey === 'audit') renderAuditLogs();
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

function renderAdminTable() {
  const tbody = document.getElementById('adminTableBody');
  const countEl = document.getElementById('adminProdCount');
  if (!tbody) return;

  const products = getStoredProducts();
  if (countEl) {
    countEl.textContent = `${products.length} producto${products.length === 1 ? '' : 's'} en catálogo`;
  }

  if (products.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="table-empty">
          El catálogo está vacío. Crea un producto o importa un JSON de respaldo.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = products.map((product) => {
    const outOfStock = product.stock <= 0;
    const lowStock = !outOfStock && product.stock <= 3;
    const stockClass = outOfStock ? 'out' : (lowStock ? 'low' : '');
    const name = escapeHtml(product.name);
    const id = escapeHtml(product.id);

    return `
      <tr>
        <td>
          <div class="prod-table-info">
            <img class="table-thumb" src="${escapeHtml(product.images[0])}" alt="" loading="lazy" decoding="async" width="48" height="48">
            <div>
              <strong>${name}</strong>
              <div class="table-id">${id}</div>
            </div>
          </div>
        </td>
        <td><span class="table-category">${escapeHtml(getCategoryLabel(product.category))}</span></td>
        <td><strong>${escapeHtml(formatMoney(product.price))}</strong></td>
        <td><span class="stock-cell ${stockClass}">${product.stock} unid.</span></td>
        <td>
          <div class="action-btns">
            <button type="button" class="btn-icon" data-action="edit-product" data-id="${id}"
              title="Editar" aria-label="Editar ${name}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            ${isAdmin() ? `
              <button type="button" class="btn-icon del" data-action="delete-product" data-id="${id}"
                title="Eliminar" aria-label="Eliminar ${name}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openCreateModal() {
  const form = document.getElementById('productForm');
  if (form) form.reset();

  document.getElementById('formModalTitle').textContent = 'Añadir Nuevo Producto';
  document.getElementById('productId').value = '';
  openModal(document.getElementById('formModal'));
}

function openEditModal(productId) {
  const product = getStoredProducts().find((item) => item.id === productId);
  if (!product) {
    showToast('Producto no encontrado');
    return;
  }

  document.getElementById('formModalTitle').textContent = 'Editar Producto';
  document.getElementById('productId').value = product.id;
  document.getElementById('pName').value = product.name;
  document.getElementById('pCategory').value = product.category;
  document.getElementById('pPrice').value = product.price;
  document.getElementById('pStock').value = product.stock;
  document.getElementById('pBadge').value = product.badge || '';
  document.getElementById('pImages').value = product.images.join(', ');
  document.getElementById('pVariants').value = product.variants.join(', ');
  document.getElementById('pDesc').value = product.description;

  openModal(document.getElementById('formModal'));
}

function handleSaveProduct(event) {
  event.preventDefault();

  const id = document.getElementById('productId').value.trim();
  const name = document.getElementById('pName').value.trim();
  const category = document.getElementById('pCategory').value;
  const priceRaw = document.getElementById('pPrice').value.trim();
  const stockRaw = document.getElementById('pStock').value.trim();
  const price = Number(priceRaw);
  const stock = Number(stockRaw);
  const badge = document.getElementById('pBadge').value.trim() || null;
  const description = document.getElementById('pDesc').value.trim();

  const images = document.getElementById('pImages').value
    .split(',')
    .map((url) => url.trim())
    .filter(isSafeImageUrl);

  const variants = document.getElementById('pVariants').value
    .split(',')
    .map((variant) => variant.trim())
    .filter(Boolean);

  if (!name) {
    showToast('El nombre del producto es obligatorio');
    return;
  }

  if (!priceRaw || !Number.isFinite(price) || price < 0) {
    showToast('El precio debe ser un número mayor o igual a 0');
    return;
  }

  if (!stockRaw || !Number.isFinite(stock) || stock < 0) {
    showToast('El stock debe ser un número entero mayor o igual a 0');
    return;
  }

  const validCategory = STORE_CONFIG.categories.some((option) => option.key === category)
    ? category
    : STORE_CONFIG.categories[0].key;

  const products = getStoredProducts();

  if (id) {
    const index = products.findIndex((product) => product.id === id);
    if (index === -1) {
      showToast('El producto ya no existe');
      closeModal(document.getElementById('formModal'));
      return;
    }

    const previous = products[index];
    products[index] = {
      ...previous,
      name,
      category: validCategory,
      price,
      stock: Math.floor(stock),
      badge,
      // Si el campo quedó vacío se conservan las imágenes anteriores.
      images: images.length > 0 ? images : previous.images,
      variants,
      description
    };

    pushAudit(userLabel(), `Editó el producto "${name}"`);
  } else {
    products.unshift({
      id: `prod-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      category: validCategory,
      price,
      stock: Math.floor(stock),
      badge,
      images,
      variants,
      description
    });

    pushAudit(userLabel(), `Creó el producto "${name}"`);
  }

  if (!saveProducts(products)) {
    showToast('No se pudo guardar el producto (almacenamiento lleno)');
    return;
  }

  closeModal(document.getElementById('formModal'));
  renderAdminTable();
  showToast(id ? 'Producto actualizado' : 'Producto creado');
}

function deleteProduct(productId) {
  if (!requireAdmin('eliminar productos')) return;

  const products = getStoredProducts();
  const product = products.find((item) => item.id === productId);
  if (!product) return;

  const confirmed = confirm(`¿Eliminar "${product.name}" del catálogo? Esta acción no se puede deshacer.`);
  if (!confirmed) return;

  if (!saveProducts(products.filter((item) => item.id !== productId))) {
    showToast('No se pudo eliminar el producto');
    return;
  }

  pushAudit(userLabel(), `Eliminó el producto "${product.name}"`);
  renderAdminTable();
  showToast('Producto eliminado');
}

function resetDefaults() {
  if (!requireAdmin('restablecer el catálogo')) return;

  const confirmed = confirm('¿Restablecer el catálogo con los productos de muestra? Se sobrescribirán tus cambios.');
  if (!confirmed) return;

  const products = resetProductsToSeed();
  pushAudit(userLabel(), `Restableció el catálogo (${products.length} productos)`);
  renderAdminTable();
  showToast('Catálogo restablecido');
}

function exportJSON() {
  const products = getStoredProducts();
  const blob = new Blob([JSON.stringify(products, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  downloadBlob(blob, `catalogo_tienda_${Date.now()}.json`);
  pushAudit(userLabel(), `Exportó el catálogo (${products.length} productos)`);
  showToast('Catálogo exportado');
}

function exportOrders() {
  const orders = storeRead(STORAGE_KEYS.orders, []);
  const list = Array.isArray(orders) ? orders : [];
  const blob = new Blob([JSON.stringify(list, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  downloadBlob(blob, `pedidos_tienda_${Date.now()}.json`);
  pushAudit(userLabel(), `Exportó ${list.length} pedidos`);
  showToast('Pedidos exportados');
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function handleImportFile(event) {
  if (!requireAdmin('importar el catálogo')) {
    event.target.value = '';
    return;
  }

  const file = event.target.files && event.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const imported = normalizeProducts(parsed);

      if (imported.length === 0) {
        throw new Error('El archivo no contiene productos válidos.');
      }

      const currentCount = getStoredProducts().length;
      const confirmed = confirm(`Se reemplazarán los ${currentCount} productos actuales por ${imported.length} del archivo. ¿Continuar?`);
      if (!confirmed) return;

      if (!saveProducts(imported)) {
        throw new Error('No se pudo guardar el catálogo en este dispositivo.');
      }

      pushAudit(userLabel(), `Importó ${imported.length} productos desde JSON`);
      renderAdminTable();
      showToast(`Importados ${imported.length} productos`);
    } catch (error) {
      console.error('[import]', error);
      showToast(error.message || 'No se pudo importar el catálogo');
    } finally {
      event.target.value = '';
    }
  };

  reader.onerror = () => {
    showToast('No se pudo leer el archivo');
    event.target.value = '';
  };

  reader.readAsText(file);
}

/* ------------------------------------------------------------------ */
/* Pedidos                                                             */
/* ------------------------------------------------------------------ */

function renderOrdersHistory() {
  const container = document.getElementById('ordersListContainer');
  const countBadge = document.getElementById('ordersBadgeCount');
  const totalEl = document.getElementById('ordersTotalAmount');
  if (!container) return;

  const stored = storeRead(STORAGE_KEYS.orders, []);
  const orders = Array.isArray(stored) ? stored : [];

  if (countBadge) countBadge.textContent = String(orders.length);

  const totalCents = orders.reduce((sum, order) => {
    const cents = Number(order.totalCents);
    if (Number.isFinite(cents)) return sum + cents;
    return sum + toCents(order.total);
  }, 0);

  if (totalEl) totalEl.textContent = formatCents(totalCents);

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Aún no se han generado pedidos en este navegador.</p>
        <small>Cada pedido cerrado desde la tienda se registra aquí. En esta versión los datos son locales al dispositivo.</small>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map((order) => {
    const items = Array.isArray(order.items) ? order.items : [];
    const clientName = escapeHtml(order.clientName || 'Cliente');
    const clientAddress = escapeHtml(order.clientAddress || 'A coordinar');
    const orderCents = Number.isFinite(Number(order.totalCents))
      ? Number(order.totalCents)
      : toCents(order.total);

    const itemsHtml = items.map((item) => {
      const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0));
      const priceCents = toCents(item.price) * quantity;
      return `<li>${quantity}x ${escapeHtml(item.name)}${item.variant ? ` (${escapeHtml(item.variant)})` : ''} — ${escapeHtml(formatCents(priceCents))}</li>`;
    }).join('');

    return `
      <article class="order-card">
        <header class="order-card-header">
          <div>
            <strong>👤 ${clientName}</strong>
            <span class="order-address">📍 ${clientAddress}</span>
          </div>
          <div class="order-amount">
            <strong>${escapeHtml(formatCents(orderCents))}</strong>
            <span>${escapeHtml(order.date || '')}</span>
          </div>
        </header>
        <ul class="order-items">${itemsHtml}</ul>
        ${order.clientNotes ? `<p class="order-notes">💬 Nota: ${escapeHtml(order.clientNotes)}</p>` : ''}
        <footer class="order-card-footer">
          <span class="order-status">${escapeHtml(order.status || 'pendiente')}</span>
          ${isAdmin() ? `
            <button type="button" class="btn-icon del" data-action="delete-order" data-id="${escapeHtml(order.id)}"
              title="Eliminar pedido" aria-label="Eliminar pedido de ${clientName}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          ` : ''}
        </footer>
      </article>
    `;
  }).join('');
}

function deleteOrder(orderId) {
  if (!requireAdmin('eliminar pedidos')) return;

  const stored = storeRead(STORAGE_KEYS.orders, []);
  const orders = Array.isArray(stored) ? stored : [];
  const order = orders.find((item) => item.id === orderId);
  if (!order) return;

  if (!confirm(`¿Eliminar el pedido de ${order.clientName || 'este cliente'}?`)) return;

  if (!storeWrite(STORAGE_KEYS.orders, orders.filter((item) => item.id !== orderId))) {
    showToast('No se pudo eliminar el pedido');
    return;
  }

  pushAudit(userLabel(), `Eliminó el pedido de ${order.clientName || 'cliente'}`);
  renderOrdersHistory();
  showToast('Pedido eliminado');
}

/* ------------------------------------------------------------------ */
/* Auditoría                                                           */
/* ------------------------------------------------------------------ */

function renderAuditLogs() {
  const container = document.getElementById('auditListContainer');
  if (!container) return;

  const stored = storeRead(STORAGE_KEYS.audit, []);
  const logs = Array.isArray(stored) ? stored : [];

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No hay eventos registrados en la auditoría.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = logs.map((log) => `
    <div class="audit-row">
      <div>
        <strong>${escapeHtml(log.user || 'Sistema')}</strong>:
        <span>${escapeHtml(log.action || '')}</span>
      </div>
      <time>${escapeHtml(log.date || '')}</time>
    </div>
  `).join('');
}

function clearAuditLogs() {
  if (!requireAdmin('vaciar la auditoría')) return;
  if (!confirm('¿Vaciar el historial de actividad? Esta acción no se puede deshacer.')) return;

  storeRemove(STORAGE_KEYS.audit);
  // Se deja constancia de la propia limpieza.
  pushAudit(userLabel(), 'Vació el historial de actividad');
  renderAuditLogs();
  showToast('Historial vaciado');
}

/* ------------------------------------------------------------------ */
/* Usuarios                                                            */
/* ------------------------------------------------------------------ */

function openUsersModal() {
  if (!requireAdmin('gestionar usuarios')) return;

  renderUsersList();
  resetUserForm();
  openModal(document.getElementById('usersModal'));
}

function closeUsersModal() {
  closeModal(document.getElementById('usersModal'));
}

function renderUsersList() {
  const container = document.getElementById('usersListContainer');
  if (!container) return;

  const users = getUsers();

  container.innerHTML = users.map((user) => {
    const username = escapeHtml(user.user);
    const isCurrent = currentUser && currentUser.user.toLowerCase() === user.user.toLowerCase();

    return `
      <div class="user-row">
        <div>
          <strong>${escapeHtml(user.name)}</strong>
          <code>@${username}</code>${isCurrent ? ' <span class="user-you">(tú)</span>' : ''}
          <div class="user-role">Rol: ${user.role === 'admin' ? '👑 Administrador total' : '📦 Ventas & stock'}</div>
        </div>
        <div class="user-actions">
          <button type="button" class="btn-icon" data-action="edit-user" data-user="${username}"
            title="Cambiar contraseña" aria-label="Cambiar contraseña de @${username}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </button>
          ${currentUser && user.user !== currentUser.user ? `
            <button type="button" class="btn-icon del" data-action="delete-user" data-user="${username}"
              title="Eliminar usuario" aria-label="Eliminar usuario @${username}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function editUserPassword(username) {
  if (!requireAdmin('gestionar usuarios')) return;

  const user = getUsers().find((candidate) => candidate.user === username);
  if (!user) return;

  document.getElementById('userFormTitle').textContent = `Editar usuario @${user.user}`;
  document.getElementById('uEditing').value = user.user;
  document.getElementById('uName').value = user.name;
  document.getElementById('uUsername').value = user.user;
  document.getElementById('uUsername').setAttribute('readonly', 'readonly');
  document.getElementById('uPassword').value = '';
  document.getElementById('uPassword').placeholder = 'Dejar en blanco para mantener la actual';
  document.getElementById('uRole').value = user.role;
}

function resetUserForm() {
  const form = document.getElementById('userForm');
  if (form) form.reset();

  const editing = document.getElementById('uEditing');
  if (editing) editing.value = '';

  const username = document.getElementById('uUsername');
  if (username) username.removeAttribute('readonly');

  const password = document.getElementById('uPassword');
  if (password) password.placeholder = 'Mínimo 4 caracteres';

  document.getElementById('userFormTitle').textContent = 'Crear Nuevo Usuario';
}

async function handleSaveUser(event) {
  event.preventDefault();

  if (!requireAdmin('gestionar usuarios')) return;

  const editing = document.getElementById('uEditing').value.trim().toLowerCase();
  const name = document.getElementById('uName').value.trim();
  const username = document.getElementById('uUsername').value.trim().toLowerCase();
  const password = document.getElementById('uPassword').value;
  const role = document.getElementById('uRole').value === 'admin' ? 'admin' : 'staff';

  if (!name || !username) {
    showToast('Completa el nombre y el usuario');
    return;
  }

  if (!/^[a-z0-9._-]{3,20}$/.test(username)) {
    showToast('El usuario debe tener entre 3 y 20 caracteres: letras, números, punto, guion o guion bajo');
    return;
  }

  if (!editing && password.length < 4) {
    showToast('La contraseña del nuevo usuario debe tener al menos 4 caracteres');
    return;
  }

  if (password && password.length < 4) {
    showToast('La contraseña debe tener al menos 4 caracteres');
    return;
  }

  const users = getUsers();
  const existingIndex = users.findIndex((user) => user.user.toLowerCase() === username);
  const isCreateMode = !editing;

  if (isCreateMode && existingIndex > -1) {
    showToast('Ese nombre de usuario ya existe');
    return;
  }

  if (!isCreateMode && existingIndex === -1) {
    showToast('Ese usuario ya no existe');
    return;
  }

  if (!isCreateMode && username !== editing) {
    showToast('No se puede cambiar el nombre de usuario de una cuenta existente');
    return;
  }

  try {
    if (existingIndex > -1) {
      const target = users[existingIndex];

      if (target.role === 'admin' && role !== 'admin' && countAdmins(users) === 1) {
        showToast('Debe existir al menos un administrador');
        return;
      }

      target.name = name;
      target.role = role;
      if (password) target.passHash = await sha256Hex(password);

      pushAudit(userLabel(), password
        ? `Cambió la contraseña de @${username}`
        : `Actualizó los datos de @${username}`);
    } else {
      users.push({
        user: username,
        name,
        passHash: await sha256Hex(password),
        role
      });

      pushAudit(userLabel(), `Creó el usuario @${username} con rol ${role}`);
    }
  } catch (error) {
    console.error('[users]', error);
    showToast('No se pudo procesar la contraseña');
    return;
  }

  if (!saveUsers(users)) {
    showToast('No se pudo guardar el usuario');
    return;
  }

  // Si el usuario editado es el que tiene la sesión abierta, se refresca.
  if (currentUser && currentUser.user.toLowerCase() === username) {
    currentUser = users.find((user) => user.user.toLowerCase() === username);
    sessionWrite(currentUser);
    applyRolePermissions();
  }

  renderUsersList();
  resetUserForm();
  showToast(existingIndex > -1 ? 'Usuario actualizado' : 'Usuario creado');
}

function deleteUserAccount(username) {
  if (!requireAdmin('eliminar usuarios')) return;

  if (currentUser && currentUser.user.toLowerCase() === username.toLowerCase()) {
    showToast('No puedes eliminar tu propia cuenta');
    return;
  }

  const users = getUsers();
  const target = users.find((user) => user.user.toLowerCase() === username.toLowerCase());
  if (!target) return;

  if (target.role === 'admin' && countAdmins(users) === 1) {
    showToast('No se puede eliminar el último administrador');
    return;
  }

  if (!confirm(`¿Eliminar al usuario @${target.user}?`)) return;

  if (!saveUsers(users.filter((user) => user.user.toLowerCase() !== username.toLowerCase()))) {
    showToast('No se pudo eliminar el usuario');
    return;
  }

  pushAudit(userLabel(), `Eliminó la cuenta de @${target.user}`);
  renderUsersList();
  showToast('Usuario eliminado');
}

/* ------------------------------------------------------------------ */
/* Modales                                                             */
/* ------------------------------------------------------------------ */

function openModal(modal) {
  if (!modal) return;

  adminModalLastFocused = document.activeElement;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');
  lockPageScroll();
  focusFirst(modal);
}

function closeModal(modal) {
  if (!modal || !modal.classList.contains('active')) return;

  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  unlockPageScroll();

  if (adminModalLastFocused && typeof adminModalLastFocused.focus === 'function') {
    adminModalLastFocused.focus();
  }
  adminModalLastFocused = null;
}

function closeTopModal() {
  const usersModal = document.getElementById('usersModal');
  const formModal = document.getElementById('formModal');

  if (usersModal && usersModal.classList.contains('active')) {
    closeModal(usersModal);
    return true;
  }

  if (formModal && formModal.classList.contains('active')) {
    closeModal(formModal);
    return true;
  }

  return false;
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

function setupAdminEvents() {
  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
  document.getElementById('productForm')?.addEventListener('submit', handleSaveProduct);
  document.getElementById('userForm')?.addEventListener('submit', handleSaveUser);

  document.getElementById('importFile')?.addEventListener('change', handleImportFile);

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const action = trigger.getAttribute('data-action');
    const productId = trigger.getAttribute('data-id');
    const username = trigger.getAttribute('data-user');
    const tabKey = trigger.getAttribute('data-tab');

    switch (action) {
      case 'create-product':
        openCreateModal();
        break;
      case 'edit-product':
        openEditModal(productId);
        break;
      case 'delete-product':
        deleteProduct(productId);
        break;
      case 'export-json':
        exportJSON();
        break;
      case 'export-orders':
        exportOrders();
        break;
      case 'import-json':
        document.getElementById('importFile')?.click();
        break;
      case 'open-users':
        openUsersModal();
        break;
      case 'reset-catalog':
        resetDefaults();
        break;
      case 'logout':
        handleLogout();
        break;
      case 'switch-tab':
        switchAdminTab(tabKey);
        break;
      case 'close-form-modal':
        closeModal(document.getElementById('formModal'));
        break;
      case 'close-users-modal':
        closeUsersModal();
        break;
      case 'edit-user':
        editUserPassword(username);
        break;
      case 'delete-user':
        deleteUserAccount(username);
        break;
      case 'delete-order':
        deleteOrder(productId);
        break;
      case 'clear-audit':
        clearAuditLogs();
        break;
      default:
        break;
    }
  });

  [document.getElementById('formModal'), document.getElementById('usersModal')].forEach((modal) => {
    if (!modal) return;
    modal.addEventListener('click', (event) => {
      if (event.target === modal) closeModal(modal);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeTopModal();
      return;
    }

    if (event.key === 'Tab') {
      const activeModal = document.querySelector('.modal-overlay.active');
      if (activeModal) trapTab(event, activeModal.querySelector('.modal-content'));
    }
  });

  window.addEventListener('storage', (event) => {
    if (!currentUser) return;

    if (event.key === STORAGE_KEYS.products) renderAdminTable();
    if (event.key === STORAGE_KEYS.orders) renderOrdersHistory();
    if (event.key === STORAGE_KEYS.audit) renderAuditLogs();
    if (event.key === STORAGE_KEYS.users) refreshSessionUser();
  });
}

function refreshSessionUser() {
  if (!currentUser) return;

  const fresh = getUsers().find(
    (user) => user.user.toLowerCase() === currentUser.user.toLowerCase()
  );

  if (!fresh) {
    sessionClear();
    showLoginScreen();
    showToast('Tu cuenta fue eliminada en otra pestaña');
    return;
  }

  currentUser = fresh;
  sessionWrite(fresh);
  applyRolePermissions();
  renderAdminTable();
  renderOrdersHistory();
}
