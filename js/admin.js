// js/admin.js - Lógica del panel administrativo local con roles
const DEFAULT_USERS = [
  { user: 'admin', pass: 'admin123', role: 'admin', name: 'Administrador Principal' },
  { user: 'ventas', pass: 'ventas123', role: 'staff', name: 'Gestor de Ventas y Stock' }
];

let currentUser = null;

function getUsers() {
  const saved = localStorage.getItem('rx_admin_users');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch (e) {
      // fallback
    }
  }
  localStorage.setItem('rx_admin_users', JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS;
}

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  setupAdminEvents();
});

function checkAuth() {
  const sessionUser = sessionStorage.getItem('rx_admin_user');
  if (sessionUser) {
    try {
      currentUser = JSON.parse(sessionUser);
      document.getElementById('loginScreen').style.display = 'none';
      document.getElementById('adminLayout').style.display = 'block';
      applyRolePermissions();
      renderAdminTable();
      return;
    } catch (e) {}
  }
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminLayout').style.display = 'none';
}

function handleLogin(e) {
  e.preventDefault();
  const userInput = document.getElementById('adminUser').value.trim();
  const passInput = document.getElementById('adminPassword').value.trim();
  const users = getUsers();

  const found = users.find(u => u.user.toLowerCase() === userInput.toLowerCase() && u.pass === passInput);

  if (found) {
    currentUser = found;
    sessionStorage.setItem('rx_admin_user', JSON.stringify(found));
    checkAuth();
  } else {
    alert('Usuario o contraseña incorrectos.');
  }
}

function handleLogout() {
  currentUser = null;
  sessionStorage.removeItem('rx_admin_user');
  checkAuth();
}

function applyRolePermissions() {
  if (!currentUser) return;
  const userBadge = document.getElementById('adminUserBadge');
  if (userBadge) {
    userBadge.textContent = `${currentUser.name} (${currentUser.role === 'admin' ? 'Acceso Total' : 'Stock & Pedidos'})`;
  }

  // Ocultar acciones críticas si es personal de ventas (staff)
  const isStaff = currentUser.role === 'staff';
  const deleteBtns = document.querySelectorAll('.btn-icon.del');
  deleteBtns.forEach(b => b.style.display = isStaff ? 'none' : 'inline-flex');

  const resetBtn = document.getElementById('btnResetCatalog');
  if (resetBtn) resetBtn.style.display = isStaff ? 'none' : 'inline-flex';
}

// Renderizar tabla
function renderAdminTable() {
  const tbody = document.getElementById('adminTableBody');
  const countEl = document.getElementById('adminProdCount');
  const products = getStoredProducts();

  if (countEl) countEl.textContent = `${products.length} productos en catálogo`;

  tbody.innerHTML = products.map(p => `
    <tr>
      <td>
        <div class="prod-table-info">
          <img class="table-thumb" src="${p.images[0]}" alt="${p.name}">
          <div>
            <strong>${p.name}</strong>
            <div style="font-size:0.75rem; color:var(--text-dim);">${p.id}</div>
          </div>
        </div>
      </td>
      <td><span style="text-transform: capitalize;">${p.category}</span></td>
      <td><strong>$${p.price} USD</strong></td>
      <td>${p.stock} unid.</td>
      <td>
        <div class="action-btns">
          <button class="btn-icon" onclick="openEditModal('${p.id}')" title="Editar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon del" onclick="deleteProduct('${p.id}')" title="Eliminar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Abrir modal para crear
function openCreateModal() {
  const modal = document.getElementById('formModal');
  document.getElementById('formModalTitle').textContent = 'Añadir Nuevo Producto';
  document.getElementById('productId').value = '';
  document.getElementById('productForm').reset();
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('active'), 10);
}

// Abrir modal para editar
function openEditModal(id) {
  const products = getStoredProducts();
  const prod = products.find(p => p.id === id);
  if (!prod) return;

  const modal = document.getElementById('formModal');
  document.getElementById('formModalTitle').textContent = 'Editar Producto';
  document.getElementById('productId').value = prod.id;
  document.getElementById('pName').value = prod.name;
  document.getElementById('pCategory').value = prod.category;
  document.getElementById('pPrice').value = prod.price;
  document.getElementById('pStock').value = prod.stock;
  document.getElementById('pBadge').value = prod.badge || '';
  document.getElementById('pImages').value = prod.images ? prod.images.join(', ') : '';
  document.getElementById('pVariants').value = prod.variants ? prod.variants.join(', ') : '';
  document.getElementById('pDesc').value = prod.description || '';

  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('active'), 10);
}

function closeFormModal() {
  const modal = document.getElementById('formModal');
  modal.classList.remove('active');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 200);
}

// Guardar producto (Nuevo o Edición)
function handleSaveProduct(e) {
  e.preventDefault();
  let products = getStoredProducts();

  const id = document.getElementById('productId').value;
  const name = document.getElementById('pName').value.trim();
  const category = document.getElementById('pCategory').value;
  const price = parseFloat(document.getElementById('pPrice').value) || 0;
  const stock = parseInt(document.getElementById('pStock').value) || 0;
  const badge = document.getElementById('pBadge').value.trim() || null;
  const images = document.getElementById('pImages').value.split(',').map(s => s.trim()).filter(Boolean);
  const variants = document.getElementById('pVariants').value.split(',').map(s => s.trim()).filter(Boolean);
  const description = document.getElementById('pDesc').value.trim();

  if (id) {
    // Editar
    const index = products.findIndex(p => p.id === id);
    if (index > -1) {
      products[index] = { ...products[index], name, category, price, stock, badge, images, variants, description };
    }
  } else {
    // Crear
    const newId = 'prod-' + Date.now();
    products.unshift({
      id: newId,
      name,
      category,
      price,
      stock,
      badge,
      images: images.length ? images : ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800'],
      variants,
      description
    });
  }

  saveProducts(products);
  closeFormModal();
  renderAdminTable();
}

// Eliminar producto
function deleteProduct(id) {
  if (!confirm('¿Estás seguro de eliminar este producto del catálogo?')) return;
  let products = getStoredProducts();
  products = products.filter(p => p.id !== id);
  saveProducts(products);
  renderAdminTable();
}

// Exportar catálogo a JSON
function exportJSON() {
  const products = getStoredProducts();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(products, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", `catalogo_tienda_${Date.now()}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

// Restaurar productos originales semilla
function resetDefaults() {
  if (confirm('¿Restablecer el catálogo con los productos iniciales de muestra? Se sobrescribirán tus cambios.')) {
    localStorage.removeItem('rx_store_products');
    getStoredProducts();
    renderAdminTable();
  }
}

function setupAdminEvents() {
  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
  document.getElementById('productForm')?.addEventListener('submit', handleSaveProduct);
}
