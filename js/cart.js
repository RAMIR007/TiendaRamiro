// js/cart.js - Manejo del carrito y pedidos por WhatsApp
const CART_STORAGE_KEY = 'rx_store_cart';
const WHATSAPP_PHONE = '5358382989'; // Número oficial RX Web Studio

let cart = [];

// Cargar carrito al iniciar
function initCart() {
  const saved = localStorage.getItem(CART_STORAGE_KEY);
  if (saved) {
    try {
      cart = JSON.parse(saved);
    } catch (e) {
      cart = [];
    }
  }
  updateCartUI();
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
  updateCartUI();
}

// Añadir producto al carrito
function addToCart(productId, quantity = 1, variant = null) {
  const products = getStoredProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;

  const itemVariant = variant || (product.variants && product.variants.length > 0 ? product.variants[0] : null);
  const cartItemKey = `${productId}__${itemVariant || 'default'}`;

  const existingIndex = cart.findIndex(item => item.key === cartItemKey);

  if (existingIndex > -1) {
    cart[existingIndex].quantity += quantity;
  } else {
    cart.push({
      key: cartItemKey,
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.images[0] || '',
      variant: itemVariant,
      quantity: quantity
    });
  }

  saveCart();
  showToast(`Añadido al carrito: ${product.name}`);
}

// Actualizar cantidad de un ítem
function updateCartItemQty(cartKey, delta) {
  const itemIndex = cart.findIndex(item => item.key === cartKey);
  if (itemIndex === -1) return;

  cart[itemIndex].quantity += delta;
  if (cart[itemIndex].quantity <= 0) {
    cart.splice(itemIndex, 1);
  }

  saveCart();
}

// Eliminar ítem completo
function removeFromCart(cartKey) {
  cart = cart.filter(item => item.key !== cartKey);
  saveCart();
}

// Limpiar carrito
function clearCart() {
  cart = [];
  saveCart();
}

// Calcular total y cantidad de productos
function getCartTotals() {
  let count = 0;
  let total = 0;
  cart.forEach(item => {
    count += item.quantity;
    total += item.price * item.quantity;
  });
  return { count, total };
}

// Actualizar elementos en DOM
function updateCartUI() {
  const { count, total } = getCartTotals();

  // Badges contadores
  const countBadges = document.querySelectorAll('.cart-count');
  countBadges.forEach(b => b.textContent = count);

  // Subtotal en drawer
  const subtotalEl = document.getElementById('cartSubtotal');
  if (subtotalEl) {
    subtotalEl.textContent = `$${total} USD`;
  }

  // Lista en drawer
  const listContainer = document.getElementById('cartItemsList');
  if (!listContainer) return;

  if (cart.length === 0) {
    listContainer.innerHTML = `
      <div class="cart-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <p>Tu carrito está vacío</p>
        <small style="color:var(--text-dim); display:block; margin-top:4px;">Explora el catálogo y añade los artículos que desees.</small>
      </div>
    `;
    const footer = document.querySelector('.cart-drawer-footer');
    if (footer) footer.style.display = 'none';
  } else {
    const footer = document.querySelector('.cart-drawer-footer');
    if (footer) footer.style.display = 'block';

    listContainer.innerHTML = cart.map(item => `
      <div class="cart-item">
        <img class="cart-item-thumb" src="${item.image}" alt="${item.name}" loading="lazy">
        <div class="cart-item-details">
          <div class="cart-item-title" title="${item.name}">${item.name}</div>
          ${item.variant ? `<div class="cart-item-variant">Opción: ${item.variant}</div>` : ''}
          <div class="cart-item-price">$${item.price} USD</div>
        </div>
        <div class="cart-item-controls">
          <button class="cart-qty-btn" onclick="updateCartItemQty('${item.key}', -1)" aria-label="Disminuir">-</button>
          <span class="cart-qty-val">${item.quantity}</span>
          <button class="cart-qty-btn" onclick="updateCartItemQty('${item.key}', 1)" aria-label="Aumentar">+</button>
          <button class="btn-remove-item" onclick="removeFromCart('${item.key}')" title="Eliminar del carrito" aria-label="Eliminar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `).join('');
  }
}

// Abrir / Cerrar Drawer del Carrito
function openCartDrawer() {
  const overlay = document.getElementById('cartDrawerOverlay');
  if (overlay) overlay.classList.add('open');
}

function closeCartDrawer() {
  const overlay = document.getElementById('cartDrawerOverlay');
  if (overlay) overlay.classList.remove('open');
}

// Enviar pedido estructurado hacia WhatsApp
function checkoutWhatsApp() {
  if (cart.length === 0) return;

  const clientName = document.getElementById('clientName')?.value.trim() || 'Cliente';
  const clientAddress = document.getElementById('clientAddress')?.value.trim() || 'A coordinar';
  const clientNotes = document.getElementById('clientNotes')?.value.trim() || '';

  const { total } = getCartTotals();

  let message = `👋 ¡Hola! Quiero realizar el siguiente pedido en la tienda:\n\n`;
  message += `📦 *PRODUCTOS SOLICITADOS:*\n`;

  cart.forEach(item => {
    const variantStr = item.variant ? ` (${item.variant})` : '';
    const sub = item.price * item.quantity;
    message += `• ${item.quantity}x ${item.name}${variantStr} — $${sub} USD ($${item.price} c/u)\n`;
  });

  message += `\n💰 *TOTAL A PAGAR:* $${total} USD\n`;
  message += `👤 *Cliente:* ${clientName}\n`;
  message += `📍 *Entrega / Ubicación:* ${clientAddress}\n`;
  if (clientNotes) {
    message += `📝 *Nota adicional:* ${clientNotes}\n`;
  }
  message += `\n¿Tienen disponibilidad para coordinar la entrega y el método de pago?`;

  const encodedUrl = `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
  window.open(encodedUrl, '_blank');
}

// Toast de notificación rápido
function showToast(text) {
  let toast = document.getElementById('toastMsg');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastMsg';
    toast.className = 'toast-msg';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>${text}</span>
  `;
  toast.classList.add('show');
  clearTimeout(window.__toastTimeout);
  window.__toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

// Inicializar al cargar el documento
document.addEventListener('DOMContentLoaded', initCart);
