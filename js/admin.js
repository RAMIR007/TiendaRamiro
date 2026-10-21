// js/admin.js - Lógica del panel administrativo con hashing SHA-256, roles, auditoría y pedidos

// Hash SHA-256 precalculado para:
// admin123 -> 240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
// ventas123 -> 8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918
const DEFAULT_USERS = [
  { user: 'admin', passHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', role: 'admin', name: 'Administrador Principal' },
  { user: 'ventas', passHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', role: 'staff', name: 'Gestor de Ventas y Stock' }
];

let currentUser = null;

// Función criptográfica Web Crypto SHA-256
async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getUsers() {
  const saved = localStorage.getItem('rx_admin_users');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {}
  }
  localStorage.setItem('rx_admin_users', JSON.stringify(DEFAULT_USERS));
  return DEFAULT_USERS;
}

// Registrar eventos en el historial de auditoría
function logActivity(actionDesc) {
  const auditLogs = JSON.parse(localStorage.getItem('rx_store_audit_logs') || '[]');
  auditLogs.unshift({
    timestamp: Date.now(),
    date: new Date().toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }),
    user: currentUser ? `@${currentUser.user} (${currentUser.name})` : 'Sistema',
    action: actionDesc
  });
  // Mantener últimos 150 registros
  if (auditLogs.length > 150) auditLogs.pop();
  localStorage.setItem('rx_store_audit_logs', JSON.stringify(auditLogs));
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
      renderOrdersHistory();
      renderAuditLogs();
      return;
    } catch (e) {}
  }
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminLayout').style.display = 'none';
}

async function handleLogin(e) {
  e.preventDefault();
  const userInput = document.getElementById('adminUser').value.trim();
  const passInput = document.getElementById('adminPassword').value.trim();
  const passHash = await sha256(passInput);
  const users = getUsers();

  const found = users.find(u => 
    u.user.toLowerCase() === userInput.toLowerCase() && 
    (u.passHash === passHash || u.pass === passInput)
  );

  if (found) {
    currentUser = found;
    sessionStorage.setItem('rx_admin_user', JSON.stringify(found));
    logActivity(`Inicio de sesión en panel administrativo`);
    checkAuth();
  } else {
    alert('Usuario o contraseña incorrectos.');
  }
}

function handleLogout() {
  if (currentUser) {
    logActivity(`Cierre de sesión`);
  }
  currentUser = null;
  sessionStorage.removeItem('rx_admin_user');
  checkAuth();
}

function applyRolePermissions() {
  if (!currentUser) return;
  const userBadge = document.getElementById('adminUserBadge');
  if (userBadge) {
    userBadge.textContent = `${currentUser.name} (${currentUser.role === 'admin' ? '👑 Acceso Total' : '📦 Ventas & Stock'})`;
  }

  // Ocultar acciones exclusivas de SuperAdmin al personal de ventas
  const isStaff = currentUser.role === 'staff';
  
  const manageUsersBtn = document.getElementById('btnManageUsers');
  if (manageUsersBtn) manageUsersBtn.style.display = isStaff ? 'none' : 'inline-flex';

  const resetBtn = document.getElementById('btnResetCatalog');
  if (resetBtn) resetBtn.style.display = isStaff ? 'none' : 'inline-flex';

  const deleteBtns = document.querySelectorAll('.btn-icon.del');
  deleteBtns.forEach(b => b.style.display = isStaff ? 'none' : 'inline-flex');
}

// Navegación entre pestañas (Catálogo, Pedidos, Auditoría)
function switchAdminTab(tabKey) {
  const tabs = ['products', 'orders', 'audit'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tabBtn${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const content = document.getElementById(`tabContent${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) {
      if (t === tabKey) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    }
    if (content) {
      content.style.display = (t === tabKey) ? 'block' : 'none';
    }
  });

  if (tabKey === 'orders') renderOrdersHistory();
  if (tabKey === 'audit') renderAuditLogs();
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
  document.getElementById('uPassword').value = '';
  document.getElementById('uPassword').placeholder = 'Dejar en blanco para mantener la actual';
  document.getElementById('uRole').value = user.role;
}

async function handleSaveUser(e) {
  e.preventDefault();
  const name = document.getElementById('uName').value.trim();
  const username = document.getElementById('uUsername').value.trim().toLowerCase();
  const pass = document.getElementById('uPassword').value.trim();
  const role = document.getElementById('uRole').value;

  if (!name || !username) {
    alert('Por favor completa el nombre y usuario.');
    return;
  }

  let users = getUsers();
  const existingIndex = users.findIndex(u => u.user.toLowerCase() === username);

  if (existingIndex > -1) {
    // Actualizar usuario existente
    users[existingIndex].name = name;
    users[existingIndex].role = role;
    if (pass) {
      users[existingIndex].passHash = await sha256(pass);
      delete users[existingIndex].pass; // Eliminar clave en texto plano
      logActivity(`Cambió la contraseña del usuario @${username}`);
    } else {
      logActivity(`Actualizó datos del usuario @${username}`);
    }
    alert(`Usuario @${username} actualizado con éxito.`);
  } else {
    // Nuevo usuario
    if (!pass) {
      alert('Debes asignar una contraseña al nuevo usuario.');
      return;
    }
    const passHash = await sha256(pass);
    users.push({ user: username, passHash, role, name });
    logActivity(`Creó un nuevo usuario: @${username} con rol ${role}`);
    alert(`Nuevo usuario @${username} creado con éxito.`);
  }

  localStorage.setItem('rx_admin_users', JSON.stringify(users));
  
  if (currentUser && currentUser.user.toLowerCase() === username) {
    currentUser = users.find(u => u.user.toLowerCase() === username);
    sessionStorage.setItem('rx_admin_user', JSON.stringify(currentUser));
    applyRolePermissions();
  }

  renderUsersList();
  document.getElementById('userForm').reset();
  document.getElementById('userFormTitle').textContent = 'Crear Nuevo Usuario';
  document.getElementById('uUsername').removeAttribute('readonly');
  document.getElementById('uPassword').placeholder = 'Mínimo 4 caracteres';
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
  logActivity(`Eliminó la cuenta de usuario: @${username}`);
  renderUsersList();
}

// Renderizar Historial de Ventas / Pedidos
function renderOrdersHistory() {
  const container = document.getElementById('ordersListContainer');
  const countBadge = document.getElementById('ordersBadgeCount');
  const totalAmountEl = document.getElementById('ordersTotalAmount');
  if (!container) return;

  const orders = JSON.parse(localStorage.getItem('rx_store_orders') || '[]');
  
  if (countBadge) countBadge.textContent = orders.length;

  let sum = 0;
  orders.forEach(o => sum += (o.total || 0));
  if (totalAmountEl) totalAmountEl.textContent = `$${sum} USD`;

  if (orders.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: var(--text-dim);">
        <p>Aún no se han generado pedidos en la tienda.</p>
        <small>Cada vez que un cliente complete un pedido a WhatsApp, se registrará aquí automáticamente.</small>
      </div>
    `;
    return;
  }

  container.innerHTML = orders.map(ord => `
    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <strong style="color: #fff; font-size: 0.95rem;">👤 ${ord.clientName}</strong>
          <span style="font-size: 0.75rem; color: var(--text-dim); margin-left: 0.5rem;">📍 ${ord.clientAddress}</span>
        </div>
        <div style="text-align: right;">
          <span style="font-size: 1.1rem; font-weight: 800; color: #10b981;">$${ord.total} USD</span>
          <div style="font-size: 0.72rem; color: var(--text-dim);">${ord.date}</div>
        </div>
      </div>
      <div style="font-size: 0.82rem; color: var(--text-muted); background: rgba(0,0,0,0.2); padding: 0.5rem 0.75rem; border-radius: 6px;">
        ${(ord.items || []).map(i => `• ${i.quantity}x ${i.name} ${i.variant ? `(${i.variant})` : ''} - $${i.price * i.quantity} USD`).join('<br>')}
      </div>
      ${ord.clientNotes ? `<div style="font-size: 0.75rem; color: #cbd5e1; margin-top: 0.4rem;">💬 <em>Nota: ${ord.clientNotes}</em></div>` : ''}
    </div>
  `).join('');
}

// Renderizar Historial de Auditoría
function renderAuditLogs() {
  const container = document.getElementById('auditListContainer');
  if (!container) return;

  const logs = JSON.parse(localStorage.getItem('rx_store_audit_logs') || '[]');

  if (logs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: var(--text-dim);">
        <p>No hay eventos registrados en la auditoría.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = logs.map(l => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.55rem 0.85rem; background: rgba(255,255,255,0.02); border-radius: 6px; font-size: 0.82rem; border-left: 3px solid var(--primary);">
      <div>
        <strong style="color: #818cf8;">${l.user}</strong>: 
        <span style="color: var(--text-main);">${l.action}</span>
      </div>
      <span style="font-size: 0.72rem; color: var(--text-dim); margin-left: 1rem; white-space: nowrap;">${l.date}</span>
    </div>
  `).join('');
}

function clearAuditLogs() {
  if (confirm('¿Vaciar el historial de actividad y auditoría?')) {
    localStorage.removeItem('rx_store_audit_logs');
    renderAuditLogs();
  }
}
