// js/admin.js — Panel de administración con Supabase Auth y datos compartidos.
// La sesión real la gestiona Supabase; los permisos se aplican en el servidor
// con RLS y en la interfaz con el rol del perfil.

let currentUser = null;
let productsCache = [];
let ordersCache = [];
let auditCache = [];
let productsError = '';
let adminModalLastFocused = null;

document.addEventListener('DOMContentLoaded', () => {
  renderCategoryOptions();
  setupAdminEvents();
  restoreSession();
});

/* ------------------------------------------------------------------ */
/* Sesión                                                              */
/* ------------------------------------------------------------------ */

async function restoreSession() {
  if (!readSupabaseSession()) {
    showLoginScreen();
    return;
  }

  try {
    const profile = await getProfile();

    if (!profile) {
      await signOut();
      showLoginScreen('Tu cuenta no tiene un perfil asociado. Contacta al administrador.');
      return;
    }

    if (profile.role === 'pending') {
      await signOut();
      showLoginScreen('Tu cuenta está pendiente de aprobación.');
      return;
    }

    currentUser = profile;
    showAdminPanel();
  } catch (error) {
    console.error('[session]', error);
    await signOut();
    showLoginScreen(
      error.status === 401
        ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
        : 'No se pudo verificar la sesión. Revisa tu conexión.'
    );
  }
}

function setLoginError(message) {
  const errorEl = document.getElementById('loginError');
  if (errorEl) errorEl.textContent = message || '';
}

function showLoginScreen(message) {
  const loginScreen = document.getElementById('loginScreen');
  const layout = document.getElementById('adminLayout');

  if (loginScreen) loginScreen.style.display = 'flex';
  if (layout) layout.style.display = 'none';

  currentUser = null;
  setLoginError(message || '');
}

function showAdminPanel() {
  const loginScreen = document.getElementById('loginScreen');
  const layout = document.getElementById('adminLayout');

  if (loginScreen) loginScreen.style.display = 'none';
  if (layout) layout.style.display = 'block';

  setLoginError('');
  applyRolePermissions();
  switchAdminTab('products');
  refreshAll();
}

async function refreshAll() {
  await Promise.allSettled([loadProducts(), loadOrders(), loadAudit()]);
}

async function handleLogin(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const email = document.getElementById('adminEmail').value.trim();
  const password = document.getElementById('adminPassword').value;
  const submitButton = document.getElementById('loginSubmit');

  setLoginError('');

  if (!email || !password) {
    setLoginError('Completa correo y contraseña.');
    return;
  }

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Verificando…';
  }

  try {
    await signInWithPassword(email, password);

    const profile = await getProfile();

    if (!profile) {
      await signOut();
      setLoginError('Tu cuenta no tiene un perfil asociado. Contacta al administrador.');
      return;
    }

    if (profile.role === 'pending') {
      await signOut();
      setLoginError('Tu cuenta está pendiente de aprobación.');
      return;
    }

    currentUser = profile;
    form.reset();
    showAdminPanel();
  } catch (error) {
    console.error('[login]', error);

    const errorCode = error.payload && (error.payload.error_code || error.payload.code);

    if (errorCode === 'email_not_confirmed') {
      setLoginError('Tu correo aún no está confirmado. Confírmalo en Supabase o crea el usuario con Auto Confirm.');
    } else if (error.status === 400 || error.status === 401) {
      setLoginError('Correo o contraseña incorrectos.');
    } else {
      setLoginError(error.message || 'No se pudo iniciar sesión.');
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Ingresar al Panel';
    }
  }
}

async function handleLogout() {
  await signOut();
  currentUser = null;
  productsCache = [];
  ordersCache = [];
  auditCache = [];
  showLoginScreen();
}

async function handleSessionExpired() {
  await signOut();
  showLoginScreen('Tu sesión expiró. Vuelve a iniciar sesión.');
}

/* ------------------------------------------------------------------ */
/* Permisos de interfaz                                                */
/* ------------------------------------------------------------------ */

function isAdmin() {
  return Boolean(currentUser && currentUser.role === 'admin');
}

function roleLabel() {
  if (!currentUser) return '';
  return currentUser.role === 'admin' ? '👑 Administrador' : '📦 Ventas & stock';
}

function requireAdmin(actionLabel) {
  if (isAdmin()) return true;

  showToast('Tu rol no permite esta acción');
  logAudit(`Intento bloqueado: ${actionLabel}`);
  return false;
}

function applyRolePermissions() {
  if (!currentUser) return;

  const badge = document.getElementById('adminUserBadge');
  if (badge) {
    badge.textContent = `${currentUser.name || currentUser.email} (${roleLabel()})`;
  }

  document.querySelectorAll('[data-admin-only]').forEach((element) => {
    element.hidden = !isAdmin();
  });
}

function renderCategoryOptions() {
  const select = document.getElementById('pCategory');
  if (!select) return;

  select.innerHTML = STORE_CONFIG.categories
    .map((category) => `<option value="${escapeHtml(category.key)}">${escapeHtml(category.label)}</option>`)
    .join('');
}

/* ------------------------------------------------------------------ */
/* Pestañas                                                            */
/* ------------------------------------------------------------------ */

function switchAdminTab(tabKey) {
  const tabs = ['products', 'orders', 'reports', 'audit'];

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
  if (tabKey === 'reports') renderReports();
  if (tabKey === 'audit') renderAuditLogs();
}

/* ------------------------------------------------------------------ */
/* Reportes de ventas (solo admin)                                     */
/* ------------------------------------------------------------------ */

function filterOrdersByPeriod(orders, periodKey) {
  if (periodKey === 'all') return [...orders];

  const days = Number(periodKey) || 30;
  const since = Date.now() - days * 24 * 60 * 60 * 1000;
  return orders.filter((order) => new Date(order.createdAt).getTime() >= since);
}

function renderReports() {
  const periodEl = document.getElementById('reportsPeriod');
  const period = periodEl ? periodEl.value : '30';
  const orders = filterOrdersByPeriod(ordersCache.filter((order) => order.status !== 'cancelado'), period);

  const kpis = document.getElementById('reportsKpis');
  const chart = document.getElementById('reportsDailyChart');
  const sellers = document.getElementById('reportsSellers');
  const topProducts = document.getElementById('reportsTopProducts');
  if (!kpis || !chart || !sellers || !topProducts) return;

  if (!orders.length) {
    kpis.innerHTML = '<p class="reports-empty">No hay ventas en el período seleccionado.</p>';
    chart.innerHTML = '';
    sellers.innerHTML = '';
    topProducts.innerHTML = '';
    return;
  }

  // KPIs: total, pedidos, artículos, comisiones y ticket promedio.
  const totalCents = orders.reduce((sum, order) => sum + order.totalCents, 0);
  const commissionCents = orders.reduce((sum, order) => sum + order.commissionCents, 0);
  const itemCount = orders.reduce((sum, order) =>
    sum + order.items.reduce((acc, item) => acc + item.quantity, 0), 0);
  const tandems = [
    ['💰 Facturación', formatCents(totalCents)],
    ['🧾 Pedidos', String(orders.length)],
    ['📦 Artículos', String(itemCount)],
    ['🤝 Comisiones', formatCents(commissionCents)],
    ['🎟️ Ticket promedio', formatCents(Math.round(totalCents / orders.length))]
  ];
  kpis.innerHTML = tandems.map(([label, value]) => `
    <div class="reports-kpi">
      <span class="reports-kpi-label">${label}</span>
      <strong class="reports-kpi-value">${value}</strong>
    </div>
  `).join('');

  // Ventas por día (barras CSS simples, hasta 30 días legibles).
  const byDay = new Map();
  orders.forEach((order) => {
    const day = new Date(order.createdAt);
    const key = `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`;
    byDay.set(key, (byDay.get(key) || 0) + order.totalCents);
  });
  const maxDay = Math.max(...byDay.values(), 1);
  const entries = Array.from(byDay.entries());
  const visible = entries.slice(-Math.min(entries.length, 14));

  chart.innerHTML = visible.map(([key, cents]) => `
    <div class="reports-bar-wrap" title="${key}: ${formatCents(cents)}">
      <div class="reports-bar" style="height:${Math.max(6, Math.round(cents / maxDay * 100))}%"></div>
      <span class="reports-bar-label">${key}</span>
    </div>
  `).join('');

  // Ventas por vendedor.
  const bySeller = new Map();
  orders.forEach((order) => {
    const key = order.sellerName || order.sellerCode || 'Venta directa (web)';
    const current = bySeller.get(key) || { cents: 0, commission: 0, count: 0 };
    current.cents += order.totalCents;
    current.commission += order.commissionCents;
    current.count += 1;
    bySeller.set(key, current);
  });

  sellers.innerHTML = Array.from(bySeller.entries())
    .sort((a, b) => b[1].cents - a[1].cents)
    .map(([name, { cents, commission, count }]) => `
      <div class="reports-row">
        <span>${escapeHtml(name)} <small class="table-muted">(${count})</small></span>
        <strong>${formatCents(cents)} <small class="table-muted">· com. ${formatCents(commission)}</small></strong>
      </div>
    `).join('');

  // Productos más vendidos.
  const byProduct = new Map();
  orders.forEach((order) => {
    order.items.forEach((item) => {
      const key = item.name;
      const current = byProduct.get(key) || { qty: 0, cents: 0 };
      current.qty += item.quantity;
      current.cents += item.unitPriceCents * item.quantity;
      byProduct.set(key, current);
    });
  });

  topProducts.innerHTML = Array.from(byProduct.entries())
    .sort((a, b) => b[1].qty - a[1].qty)
    .slice(0, 10)
    .map(([name, { qty, cents }]) => `
      <div class="reports-row">
        <span>${escapeHtml(name)} <small class="table-muted">×${qty}</small></span>
        <strong>${formatCents(cents)}</strong>
      </div>
    `).join('');
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

async function loadProducts() {
  try {
    productsCache = await fetchProductsFromApi({
      includeInactive: true,
      includeCosts: isAdmin()
    });
    productsError = '';
  } catch (error) {
    console.error('[products]', error);
    productsError = error.message || 'No se pudo cargar el catálogo';

    if (error.status === 401) {
      await handleSessionExpired();
      return;
    }
  }

  renderSuppliersDatalist();
  renderAdminTable();
}

function renderSuppliersDatalist() {
  const list = document.getElementById('suppliersList');
  if (!list) return;

  const suppliers = Array.from(new Set(
    productsCache.map((product) => product.supplier).filter(Boolean)
  ));

  list.innerHTML = suppliers
    .map((supplier) => `<option value="${escapeHtml(supplier)}"></option>`)
    .join('');
}

function imageThumb(product) {
  const first = product.images && product.images[0];
  return first ? smallImageUrl(first) : PRODUCT_PLACEHOLDER_IMAGE;
}

function marginLabel(product) {
  if (product.cost === null || product.cost === undefined) return { text: '—', negative: false };

  const margin = product.price - product.cost;
  const percent = product.price > 0 ? Math.round((margin / product.price) * 100) : 0;
  return {
    text: `${formatMoney(margin)} (${percent}%)`,
    negative: margin < 0
  };
}

function renderAdminTable() {
  const tbody = document.getElementById('adminTableBody');
  const countEl = document.getElementById('adminProdCount');
  if (!tbody) return;

  const adminView = isAdmin();
  const columnCount = adminView ? 8 : 4;

  if (countEl) {
    countEl.textContent = `${productsCache.length} producto${productsCache.length === 1 ? '' : 's'} en catálogo`;
  }

  if (productsError && productsCache.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${columnCount}" class="table-empty">${escapeHtml(productsError)}</td>
      </tr>
    `;
    return;
  }

  if (productsCache.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${columnCount}" class="table-empty">
          El catálogo está vacío. Crea un producto o importa un JSON de respaldo.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = productsCache.map((product) => {
    const outOfStock = product.stock <= 0;
    const lowStock = !outOfStock && product.stock <= 3;
    const stockClass = outOfStock ? 'out' : (lowStock ? 'low' : '');
    const inactive = product.active === false;
    const name = escapeHtml(product.name);
    const id = escapeHtml(product.id);
    const margin = marginLabel(product);
    const commissionUnit = commissionUnitOf(product, product.price);
    const commissionCellText = commissionUnit.amount > 0
      ? `${escapeHtml(formatMoney(commissionUnit.amount))} <span class="table-muted">${commissionUnit.type === 'amount' ? 'fijo' : 'del precio'}</span>`
      : '—';

    const adminCells = adminView ? `
      <td><span class="table-category">${escapeHtml(product.supplier || '—')}</span></td>
      <td>${product.cost === null || product.cost === undefined ? '—' : escapeHtml(formatMoney(product.cost))}</td>
      <td><strong>${escapeHtml(formatMoney(product.price))}</strong></td>
      <td class="${margin.negative ? 'margin-negative' : 'margin-positive'}">${escapeHtml(margin.text)}</td>
      <td>${commissionCellText}</td>
    ` : `
      <td><strong>${escapeHtml(formatMoney(product.price))}</strong></td>
    `;

    return `
      <tr class="${inactive ? 'is-inactive' : ''}">
        <td>
          <div class="prod-table-info">
            <img class="table-thumb" src="${escapeHtml(imageThumb(product))}" alt="" loading="lazy" decoding="async" width="48" height="48">
            <div>
              <strong>${name}</strong>
              <div class="table-id">${escapeHtml(getCategoryLabel(product.category))} · ${id.slice(0, 8)}</div>
              ${inactive ? '<span class="state-pill">Inactivo</span>' : ''}
            </div>
          </div>
        </td>
        ${adminCells}
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
            ${adminView ? `
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

function commissionUnitOf(product, price) {
  if (!product || typeof product !== 'object') return { type: 'percent', amount: 0 };

  const type = product.commissionType === 'amount' ? 'amount' : 'percent';
  if (type === 'amount') {
    return { type, amount: Math.max(0, Number(product.commissionFixed) || 0) };
  }

  const percent = Math.min(100, Math.max(0, Number(product.commissionPercent) || 0));
  return { type, amount: (Number(price) || 0) * percent / 100 };
}

function updateMarginPreview() {
  const preview = document.getElementById('marginPreview');
  if (!preview) return;

  const price = Number(document.getElementById('pPrice').value);
  const costRaw = document.getElementById('pCost').value.trim();
  const typeInput = document.getElementById('pCommissionType');
  const type = typeInput && typeInput.value === 'amount' ? 'amount' : 'percent';
  const commission = Number(document.getElementById('pCommission').value) || 0;
  const label = document.getElementById('pCommissionLabel');
  const hint = document.getElementById('pCommissionHint');

  if (label) label.textContent = type === 'amount' ? 'Comisión ($ por unidad)' : 'Comisión (% del precio)';
  if (hint) {
    hint.textContent = type === 'amount'
      ? 'Ej.: $5 por cada unidad vendida, sin importar el precio.'
      : '10% de un producto de $25 = $2.50 por unidad.';
  }

  if (document.getElementById('pCommission') instanceof HTMLInputElement) {
    document.getElementById('pCommission').step = type === 'amount' ? '0.01' : '0.5';
  }

  if (!Number.isFinite(price) || price <= 0 || costRaw === '') {
    preview.textContent = '—';
    preview.classList.remove('negative');
    return;
  }

  const cost = Number(costRaw);
  if (!Number.isFinite(cost) || cost < 0) {
    preview.textContent = 'Costo inválido';
    preview.classList.add('negative');
    return;
  }

  const commissionAmount = type === 'amount' ? commission : price * commission / 100;
  const margin = price - cost;
  const netMargin = margin - commissionAmount;
  const marginPercent = Math.round((margin / price) * 100);

  preview.textContent =
    `${formatMoney(margin)} (${marginPercent}%) · comisión ${formatMoney(commissionAmount)} · neto ${formatMoney(netMargin)}`;
  preview.classList.toggle('negative', netMargin < 0);
}

function openCreateModal() {
  if (!requireAdmin('crear productos')) return;

  const form = document.getElementById('productForm');
  if (form) form.reset();

  document.getElementById('formModalTitle').textContent = 'Añadir Nuevo Producto';
  document.getElementById('productId').value = '';
  document.getElementById('pSupplier').value = '';
  document.getElementById('pCost').value = '';
  document.getElementById('pCommission').value = '';
  document.getElementById('pCommissionType').value = 'percent';
  updateMarginPreview();
  openModal(document.getElementById('formModal'));
}

function openEditModal(productId) {
  const product = productsCache.find((item) => item.id === productId);
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
  document.getElementById('pSupplier').value = product.supplier || '';
  document.getElementById('pCost').value = product.cost === null || product.cost === undefined ? '' : product.cost;
  document.getElementById('pCommissionType').value = product.commissionType === 'amount' ? 'amount' : 'percent';
  document.getElementById('pCommission').value =
    product.commissionType === 'amount' ? (product.commissionFixed || 0) : (product.commissionPercent || 0);
  updateMarginPreview();

  openModal(document.getElementById('formModal'));
}

async function handleSaveProduct(event) {
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

  const existing = id ? productsCache.find((product) => product.id === id) : null;

  if (!existing && !isAdmin()) {
    showToast('Tu rol no permite crear productos');
    return;
  }

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

  let cost = null;
  let commissionPercent = 0;
  let commissionFixed = 0;
  let commissionTypeFinal = 'percent';
  let supplier = null;

  if (isAdmin()) {
    const costRaw = document.getElementById('pCost').value.trim();
    const commissionRaw = document.getElementById('pCommission').value.trim();
    const supplierRaw = document.getElementById('pSupplier').value.trim();
    const commissionType = document.getElementById('pCommissionType').value === 'amount' ? 'amount' : 'percent';

    cost = costRaw === ''
      ? (existing ? existing.cost : null)
      : Number(costRaw);

    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      showToast('El costo del proveedor debe ser un número mayor o igual a 0');
      return;
    }

    let commissionValue = commissionRaw === ''
      ? (commissionType === 'amount'
        ? (existing ? existing.commissionFixed || 0 : 0)
        : (existing ? existing.commissionPercent || 0 : 0))
      : Number(commissionRaw);

    if (!Number.isFinite(commissionValue) || commissionValue < 0) {
      showToast('La comisión debe ser un número mayor o igual a 0');
      return;
    }

    if (commissionType === 'percent' && commissionValue > 100) {
      showToast('La comisión porcentual debe estar entre 0 y 100');
      return;
    }

    commissionPercent = commissionType === 'amount' ? 0 : commissionValue;
    commissionFixed = commissionType === 'amount' ? commissionValue : 0;
    commissionTypeFinal = commissionType;
    supplier = supplierRaw || (existing ? existing.supplier : null);
  }

  const product = {
    name,
    category: validCategory,
    price,
    stock: Math.floor(stock),
    badge,
    description,
    // Si el campo quedó vacío se conservan las imágenes anteriores.
    images: images.length > 0 ? images : (existing ? existing.images : []),
    variants,
    active: existing ? existing.active : true
  };

  if (isAdmin()) {
    product.cost = cost;
    product.commissionPercent = commissionPercent;
    product.commissionFixed = commissionFixed;
    product.commissionType = commissionTypeFinal;
    product.supplier = supplier;
  }

  try {
    if (existing) {
      await updateProductInApi(existing.id, product);
      await logAudit(`Editó el producto "${name}"`);
    } else {
      await createProductInApi(product);
      await logAudit(`Creó el producto "${name}"`);
    }

    closeModal(document.getElementById('formModal'));
    await loadProducts();
    showToast(existing ? 'Producto actualizado' : 'Producto creado');
  } catch (error) {
    console.error('[product]', error);
    showToast(error.message || 'No se pudo guardar el producto');
  }
}

async function deleteProduct(productId) {
  if (!requireAdmin('eliminar productos')) return;

  const product = productsCache.find((item) => item.id === productId);
  if (!product) return;

  if (!confirm(`¿Eliminar "${product.name}" del catálogo? Esta acción no se puede deshacer.`)) return;

  try {
    await deleteProductInApi(productId);
    await logAudit(`Eliminó el producto "${product.name}"`);
    await loadProducts();
    showToast('Producto eliminado');
  } catch (error) {
    console.error('[delete-product]', error);
    showToast(error.message || 'No se pudo eliminar el producto');
  }
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(productsCache, null, 2)], {
    type: 'application/json;charset=utf-8'
  });

  downloadBlob(blob, `catalogo_tienda_${Date.now()}.json`);
  logAudit(`Exportó el catálogo (${productsCache.length} productos)`);
  showToast('Catálogo exportado');
}

function exportOrders() {
  const blob = new Blob([JSON.stringify(ordersCache, null, 2)], {
    type: 'application/json;charset=utf-8'
  });

  downloadBlob(blob, `pedidos_tienda_${Date.now()}.json`);
  logAudit(`Exportó ${ordersCache.length} pedidos`);
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

  reader.onload = async () => {
    try {
      const parsed = JSON.parse(String(reader.result));

      if (!Array.isArray(parsed)) {
        throw new Error('El archivo no contiene una lista de productos.');
      }

      const imported = parsed
        .filter((item) => item && typeof item === 'object' && String(item.name || '').trim())
        .map((item) => ({
          name: String(item.name).trim(),
          category: STORE_CONFIG.categories.some((option) => option.key === item.category)
            ? item.category
            : STORE_CONFIG.categories[0].key,
          price: Number(item.price) || 0,
          stock: Math.max(0, Math.floor(Number(item.stock) || 0)),
          badge: item.badge ? String(item.badge).trim() : null,
          description: String(item.description || '').trim(),
          images: (Array.isArray(item.images) ? item.images : []).filter(isSafeImageUrl),
          variants: (Array.isArray(item.variants) ? item.variants : [])
            .map((variant) => String(variant).trim())
            .filter(Boolean),
          active: true
        }));

      if (imported.length === 0) {
        throw new Error('El archivo no contiene productos válidos.');
      }

      if (!confirm(`Se agregarán ${imported.length} productos al catálogo actual. ¿Continuar?`)) {
        return;
      }

      await importProductsToApi(imported);
      await logAudit(`Importó ${imported.length} productos desde JSON`);
      await loadProducts();
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

async function loadOrders() {
  try {
    ordersCache = await fetchOrdersFromApi();
  } catch (error) {
    console.error('[orders]', error);

    if (error.status === 401) {
      await handleSessionExpired();
      return;
    }

    showToast(error.message || 'No se pudieron cargar los pedidos');
    ordersCache = [];
  }

  renderOrdersHistory();
  renderReports();
}

function renderOrdersHistory() {
  const container = document.getElementById('ordersListContainer');
  const countBadge = document.getElementById('ordersBadgeCount');
  const totalEl = document.getElementById('ordersTotalAmount');
  const commissionEl = document.getElementById('ordersCommissionAmount');
  if (!container) return;

  if (countBadge) countBadge.textContent = String(ordersCache.length);

  const totalCents = ordersCache.reduce((sum, order) => sum + order.totalCents, 0);
  const commissionCents = ordersCache.reduce((sum, order) => sum + order.commissionCents, 0);

  if (totalEl) totalEl.textContent = formatCents(totalCents);
  if (commissionEl) commissionEl.textContent = formatCents(commissionCents);

  if (ordersCache.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>Aún no se han generado pedidos.</p>
        <small>Cada pedido cerrado desde la tienda se guarda en Supabase y aparece aquí.</small>
      </div>
    `;
    return;
  }

  const statuses = ['pendiente', 'contactado', 'entregado', 'cancelado'];

  container.innerHTML = ordersCache.map((order) => {
    const clientName = escapeHtml(order.clientName || 'Cliente');
    const clientAddress = escapeHtml(order.clientAddress || 'A coordinar');
    const clientPhone = escapeHtml(order.clientPhone || 'Sin teléfono');
    const orderCode = escapeHtml(order.orderCode || '—');
    const deliveryLabel = order.deliveryMethod === 'recogida'
      ? 'Recoge en tienda'
      : 'Envío a domicilio';
    const sellerLabel = escapeHtml(order.sellerName || order.sellerCode || 'Venta directa');

    const itemsHtml = order.items.map((item) => `
      <li>
        <span>${item.quantity}x ${escapeHtml(item.name)}${item.variant ? ` (${escapeHtml(item.variant)})` : ''}</span>
        <span>${escapeHtml(formatCents(item.unitPriceCents * item.quantity))}</span>
      </li>
    `).join('');

    const statusControl = isAdmin()
      ? `
        <label class="sr-only" for="order-status-${escapeHtml(order.id)}">Estado del pedido</label>
        <select class="order-status-select" id="order-status-${escapeHtml(order.id)}" data-order-status="${escapeHtml(order.id)}">
          ${statuses.map((status) => `<option value="${status}"${order.status === status ? ' selected' : ''}>${status}</option>`).join('')}
        </select>
      `
      : `<span class="order-status">${escapeHtml(order.status)}</span>`;

    return `
      <article class="order-card">
        <header class="order-card-header">
          <div>
            <strong>🧾 ${orderCode} · ${clientName}</strong>
            <span class="order-address">📞 ${clientPhone} · 📍 ${clientAddress}</span>
            <span class="order-meta">
              <span class="order-chip">${escapeHtml(deliveryLabel)}</span>
              <span class="order-chip">💵 Efectivo al recibir</span>
              ${isAdmin() ? `<span class="order-chip">🧑‍💼 ${sellerLabel}</span>` : ''}
            </span>
          </div>
          <div class="order-amount">
            <strong>${escapeHtml(formatCents(order.totalCents))}</strong>
            <span>${escapeHtml(order.date)}</span>
            ${order.commissionCents > 0 ? `<span class="order-commission">Comisión: ${escapeHtml(formatCents(order.commissionCents))}</span>` : ''}
          </div>
        </header>
        <ul class="order-items">${itemsHtml}</ul>
        ${order.clientNotes ? `<p class="order-notes">💬 Nota: ${escapeHtml(order.clientNotes)}</p>` : ''}
        <footer class="order-card-footer">
          <div class="order-status-wrap">${statusControl}</div>
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

async function changeOrderStatus(orderId, status) {
  if (!requireAdmin('cambiar el estado de un pedido')) return;

  try {
    await updateOrderStatusInApi(orderId, status);
    await logAudit(`Cambió el estado del pedido ${orderId.slice(0, 8)} a ${status}`);
    await loadOrders();
    showToast('Estado del pedido actualizado');
  } catch (error) {
    console.error('[order-status]', error);
    showToast(error.message || 'No se pudo cambiar el estado');
    await loadOrders();
  }
}

async function deleteOrder(orderId) {
  if (!requireAdmin('eliminar pedidos')) return;

  const order = ordersCache.find((item) => item.id === orderId);
  if (!order) return;

  if (!confirm(`¿Eliminar el pedido de ${order.clientName || 'este cliente'}?`)) return;

  try {
    await deleteOrderInApi(orderId);
    await logAudit(`Eliminó el pedido de ${order.clientName || 'cliente'}`);
    await loadOrders();
    showToast('Pedido eliminado');
  } catch (error) {
    console.error('[delete-order]', error);
    showToast(error.message || 'No se pudo eliminar el pedido');
  }
}

/* ------------------------------------------------------------------ */
/* Auditoría                                                           */
/* ------------------------------------------------------------------ */

async function loadAudit() {
  try {
    auditCache = await fetchAuditFromApi();
  } catch (error) {
    console.error('[audit]', error);

    if (error.status === 401) {
      await handleSessionExpired();
      return;
    }

    auditCache = [];
  }

  renderAuditLogs();
}

function renderAuditLogs() {
  const container = document.getElementById('auditListContainer');
  if (!container) return;

  if (auditCache.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No hay eventos registrados en la auditoría.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = auditCache.map((log) => `
    <div class="audit-row">
      <div>
        <strong>${escapeHtml(log.user)}</strong>:
        <span>${escapeHtml(log.action)}</span>
      </div>
      <time>${escapeHtml(log.date)}</time>
    </div>
  `).join('');
}

async function clearAuditLogs() {
  if (!requireAdmin('vaciar la auditoría')) return;
  if (!confirm('¿Vaciar el historial de actividad? Esta acción no se puede deshacer.')) return;

  try {
    await deleteAuditFromApi();
    await logAudit('Vació el historial de actividad');
    await loadAudit();
    showToast('Historial vaciado');
  } catch (error) {
    console.error('[audit-clear]', error);
    showToast(error.message || 'No se pudo vaciar el historial');
  }
}

/* ------------------------------------------------------------------ */
/* Cuenta                                                              */
/* ------------------------------------------------------------------ */

function openAccountModal() {
  if (!currentUser) return;

  document.getElementById('accountEmail').textContent = currentUser.email;
  document.getElementById('accountName').textContent = currentUser.name || '—';
  document.getElementById('accountRole').textContent = roleLabel();

  const referralCode = currentUser.referralCode || '';
  const referralLink = referralCode
    ? `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}`
    : '';

  document.getElementById('accountReferralCode').textContent = referralCode || '—';
  document.getElementById('accountReferralLink').value = referralLink;

  const myCommission = ordersCache
    .filter((order) => order.sellerId === currentUser.id)
    .reduce((sum, order) => sum + order.commissionCents, 0);

  document.getElementById('accountCommission').textContent = formatCents(myCommission);

  const form = document.getElementById('accountForm');
  if (form) form.reset();

  openModal(document.getElementById('accountModal'));
}

function copyReferralLink() {
  const input = document.getElementById('accountReferralLink');
  if (!input || !input.value) return;

  const done = () => showToast('Enlace de vendedor copiado');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(input.value).then(done).catch(() => {
      input.select();
      document.execCommand('copy');
      done();
    });
    return;
  }

  input.select();
  document.execCommand('copy');
  done();
}

async function handleChangePassword(event) {
  event.preventDefault();

  const password = document.getElementById('newPassword').value;
  const confirmation = document.getElementById('confirmPassword').value;

  if (password.length < 8) {
    showToast('La contraseña debe tener al menos 8 caracteres');
    return;
  }

  if (password !== confirmation) {
    showToast('Las contraseñas no coinciden');
    return;
  }

  try {
    await changePassword(password);
    await logAudit('Cambió su contraseña');
    document.getElementById('accountForm').reset();
    closeModal(document.getElementById('accountModal'));
    showToast('Contraseña actualizada');
  } catch (error) {
    console.error('[password]', error);
    showToast(error.message || 'No se pudo cambiar la contraseña');
  }
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
  const accountModal = document.getElementById('accountModal');
  const formModal = document.getElementById('formModal');

  if (accountModal && accountModal.classList.contains('active')) {
    closeModal(accountModal);
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
  document.getElementById('accountForm')?.addEventListener('submit', handleChangePassword);
  document.getElementById('importFile')?.addEventListener('change', handleImportFile);

  ['pPrice', 'pCost', 'pCommission'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', updateMarginPreview);
  });
  document.getElementById('pCommissionType')?.addEventListener('change', updateMarginPreview);
  document.getElementById('reportsPeriod')?.addEventListener('change', renderReports);

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const action = trigger.getAttribute('data-action');
    const productId = trigger.getAttribute('data-id');
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
      case 'open-account':
        openAccountModal();
        break;
      case 'copy-referral':
        copyReferralLink();
        break;
      case 'logout':
        handleLogout();
        break;
      case 'switch-tab':
        switchAdminTab(tabKey);
        break;      case 'close-form-modal':
        closeModal(document.getElementById('formModal'));
        break;
      case 'close-account-modal':
        closeModal(document.getElementById('accountModal'));
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

  document.addEventListener('change', (event) => {
    const select = event.target.closest('[data-order-status]');
    if (select) changeOrderStatus(select.getAttribute('data-order-status'), select.value);
  });

  [document.getElementById('formModal'), document.getElementById('accountModal')].forEach((modal) => {
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
}
