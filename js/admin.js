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
  document.getElementById('userForm')?.addEventListener('submit', handleSaveUser);
}

// Modal de Usuarios
function openUsersModal() {
  const modal = document.getElementById('usersModal');
  renderUsersList();
  document.getElementById('userForm').reset();
  document.getElementById('userFormTitle').textContent = 'Crear Nuevo Usuario';
  document.getElementById('uUsername').removeAttribute('readonly');
  modal.style.display = 'flex';
  setTimeout(() => modal.classList.add('active'), 10);
}

function closeUsersModal() {
  const modal = document.getElementById('usersModal');
  modal.classList.remove('active');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 200);
}

function renderUsersList() {
  const container = document.getElementById('usersListContainer');
  const users = getUsers();

  container.innerHTML = users.map(u => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.6rem 0.8rem; background: rgba(255,255,255,0.04); border-radius: 6px; font-size: 0.85rem;">
      <div>
        <strong>${u.name}</strong> <code style="color: #818cf8; margin-left: 4px;">@${u.user}</code>
        <div style="font-size: 0.75rem; color: var(--text-dim);">
          Rol: ${u.role === 'admin' ? '👑 Administrador Total' : '📦 Ventas & Stock'}
        </div>
      </div>
      <div style="display: flex; gap: 0.4rem; align-items: center;">
        <button class="btn-icon" onclick="editUserPassword('${u.user}')" title="Cambiar Contraseña">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </button>
        ${u.user !== 'admin' ? `
          <button class="btn-icon del" onclick="deleteUserAccount('${u.user}')" title="Eliminar Usuario">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function editUserPassword(username) {
  const users = getUsers();
  const user = users.find(u => u.user === username);
  if (!user) return;

  document.getElementById('userFormTitle').textContent = `Editar / Cambiar Contraseña de @${user.user}`;
  document.getElementById('uName').value = user.name;
  document.getElementById('uUsername').value = user.user;
  document.getElementById('uUsername').setAttribute('readonly', 'true');
  document.getElementById('uPassword').value = user.pass;
  document.getElementById('uRole').value = user.role;
}

function handleSaveUser(e) {
  e.preventDefault();
  const name = document.getElementById('uName').value.trim();
  const username = document.getElementById('uUsername').value.trim().toLowerCase();
  const pass = document.getElementById('uPassword').value.trim();
  const role = document.getElementById('uRole').value;

  if (!name || !username || !pass) {
    alert('Por favor completa todos los campos.');
    return;
  }

  let users = getUsers();
  const existingIndex = users.findIndex(u => u.user.toLowerCase() === username);

  if (existingIndex > -1) {
    // Actualizar usuario o contraseña de admin
    users[existingIndex].name = name;
    users[existingIndex].pass = pass;
    users[existingIndex].role = role;
    alert(`Usuario @${username} actualizado con éxito.`);
  } else {
    // Nuevo usuario
    users.push({ user: username, pass, role, name });
    alert(`Nuevo usuario @${username} creado con éxito.`);
  }

  localStorage.setItem('rx_admin_users', JSON.stringify(users));
  
  // Si el usuario actualmente logueado se actualizó a sí mismo
  if (currentUser && currentUser.user.toLowerCase() === username) {
    currentUser = users.find(u => u.user.toLowerCase() === username);
    sessionStorage.setItem('rx_admin_user', JSON.stringify(currentUser));
    applyRolePermissions();
  }

  renderUsersList();
  document.getElementById('userForm').reset();
  document.getElementById('userFormTitle').textContent = 'Crear Nuevo Usuario';
  document.getElementById('uUsername').removeAttribute('readonly');
}

function deleteUserAccount(username) {
  if (username === 'admin') {
    alert('No se puede eliminar la cuenta principal de admin.');
    return;
  }
  if (!confirm(`¿Eliminar al usuario @${username}?`)) return;

  let users = getUsers();
  users = users.filter(u => u.user !== username);
  localStorage.setItem('rx_admin_users', JSON.stringify(users));
  renderUsersList();
}
