// js/cart.js — Carrito, validación de stock y cierre de pedido por WhatsApp.
// El pedido se crea en Supabase con create_order(): el servidor valida precio
// y stock. localStorage solo guarda el carrito del visitante.

let cart = [];
let checkoutInProgress = false;
let drawerLastFocused = null;

document.addEventListener('DOMContentLoaded', () => {
  initCart();
  setupCartEvents();
});

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

function normalizeCart(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      const id = String(item.id || '').trim();
      const quantity = Math.floor(Number(item.quantity));

      // Descarta carritos viejos con ids locales ("prod-1").
      if (!UUID_PATTERN.test(id) || !Number.isFinite(quantity) || quantity <= 0) return null;

      const variant = item.variant ? String(item.variant) : null;
      return {
        key: String(item.key || `${id}__${variant || 'default'}`),
        id,
        name: String(item.name || ''),
        price: Number(item.price) || 0,
        image: typeof item.image === 'string' ? item.image : '',
        variant,
        quantity
      };
    })
    .filter(Boolean);
}

// Sincroniza el carrito con el catálogo real: elimina productos borrados,
// refresca precios/nombres/imágenes y limita cantidades según el tipo de producto.
function reconcileWithCatalog() {
  const products = getCachedProducts();

  // Si el catálogo todavía no cargó, no tocamos el carrito.
  if (products.length === 0) return;

  const byId = new Map(products.map((product) => [product.id, product]));
  const used = new Map();

  const reconciled = cart
    .map((item) => {
      const product = byId.get(item.id);
      if (!productCanBeOrdered(product)) return null;

      const available = productCartLimit(product) - (used.get(item.id) || 0);
      if (available <= 0) return null;

      const quantity = Math.min(item.quantity, available);
      used.set(item.id, (used.get(item.id) || 0) + quantity);

      const variant = product.variants.includes(item.variant)
        ? item.variant
        : (product.variants[0] || null);

      return {
        key: `${product.id}__${variant || 'default'}`,
        id: product.id,
        name: product.name,
        price: product.price,
        image: product.images[0],
        variant,
        quantity
      };
    })
    .filter(Boolean);

  // Dos variantes antiguas pueden colapsar en la misma clave: se suman.
  const merged = [];
  reconciled.forEach((item) => {
    const existing = merged.find((candidate) => candidate.key === item.key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      merged.push(item);
    }
  });

  // Último recorte por producto: la suma de variantes respeta el límite de compra.
  const limitById = new Map(products.map((product) => [product.id, productCartLimit(product)]));
  const usedAfterMerge = new Map();

  cart = merged.filter((item) => {
    const available = limitById.get(item.id) - (usedAfterMerge.get(item.id) || 0);
    if (available <= 0) return false;

    item.quantity = Math.min(item.quantity, available);
    usedAfterMerge.set(item.id, (usedAfterMerge.get(item.id) || 0) + item.quantity);
    return true;
  });
}

// Se llama desde store.js después de refrescar el catálogo.
function syncCartWithCatalog() {
  reconcileWithCatalog();
  persistCart();
  updateCartUI();
}

function persistCart() {
  return storeWrite(STORAGE_KEYS.cart, cart);
}

function saveCart() {
  persistCart();
  updateCartUI();
}

function initCart() {
  cart = normalizeCart(storeRead(STORAGE_KEYS.cart, []));

  if (getCachedProducts().length > 0) {
    reconcileWithCatalog();
  }

  persistCart();
  updateCartUI();
  restoreSellerCode();
  refreshCheckoutFields();

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.cart) {
      cart = normalizeCart(storeRead(STORAGE_KEYS.cart, []));
      updateCartUI();
      return;
    }

    if (event.key === STORAGE_KEYS.products) {
      syncCartWithCatalog();
    }
  });
}

/* ------------------------------------------------------------------ */
/* Operaciones                                                         */
/* ------------------------------------------------------------------ */

function findProduct(productId) {
  return getCachedProducts().find((product) => product.id === productId) || null;
}

function addToCart(productId, quantity = 1, variant = null) {
  const product = findProduct(productId);

  if (!product) {
    showToast('El catálogo está cargando o el producto ya no existe');
    return false;
  }

  if (!productCanBeOrdered(product)) {
    showToast('Producto agotado');
    return false;
  }

  const wanted = Math.max(1, Math.floor(Number(quantity) || 1));
  const inCart = cart
    .filter((item) => item.id === productId)
    .reduce((total, item) => total + item.quantity, 0);
  const available = productCartLimit(product) - inCart;

  if (available <= 0) {
    showToast(`Ya tienes todo el stock disponible de "${product.name}"`);
    return false;
  }

  const added = Math.min(wanted, available);
  const chosenVariant = product.variants.includes(variant)
    ? variant
    : (product.variants[0] || null);
  const key = `${product.id}__${chosenVariant || 'default'}`;
  const existing = cart.find((item) => item.key === key);

  if (existing) {
    existing.quantity += added;
  } else {
    cart.push({
      key,
      id: product.id,
      name: product.name,
      price: product.price,
      image: product.images[0],
      variant: chosenVariant,
      quantity: added
    });
  }

  saveCart();

  if (added < wanted) {
    showToast(`Añadidas ${added}: solo quedan ${available} unidades`);
  } else {
    showToast(`Añadido al carrito: ${product.name}`);
  }

  return true;
}

function updateCartItemQty(cartKey, delta) {
  const item = cart.find((candidate) => candidate.key === cartKey);
  if (!item) return;

  const product = findProduct(item.id);
  if (!product) {
    removeFromCart(cartKey);
    return;
  }

  const otherLines = cart
    .filter((candidate) => candidate.id === item.id && candidate.key !== cartKey)
    .reduce((total, candidate) => total + candidate.quantity, 0);
  const maxForLine = Math.max(0, productCartLimit(product) - otherLines);
  const nextQuantity = Math.max(0, Math.min(maxForLine, item.quantity + delta));

  if (nextQuantity === 0) {
    removeFromCart(cartKey);
    return;
  }

  if (delta > 0 && nextQuantity === maxForLine && item.quantity === maxForLine) {
    showToast(`Solo quedan ${maxForLine} unidades disponibles`);
    return;
  }

  item.quantity = nextQuantity;
  saveCart();
}

function removeFromCart(cartKey) {
  cart = cart.filter((item) => item.key !== cartKey);
  saveCart();
}

function clearCart() {
  cart = [];
  saveCart();
}

function getCartTotals() {
  let count = 0;
  let totalCents = 0;

  cart.forEach((item) => {
    count += item.quantity;
    totalCents += toCents(item.price) * item.quantity;
  });

  return { count, totalCents };
}

/* ------------------------------------------------------------------ */
/* Interfaz                                                            */
/* ------------------------------------------------------------------ */

function renderCartItem(item) {
  const name = escapeHtml(item.name);
  const key = escapeHtml(item.key);

  return `
    <div class="cart-item" role="listitem">
      <img class="cart-item-thumb" src="${escapeHtml(smallImageUrl(item.image))}" alt="" loading="lazy" decoding="async">
      <div class="cart-item-details">
        <div class="cart-item-title" title="${name}">${name}</div>
        ${item.variant ? `<div class="cart-item-variant">Opción: ${escapeHtml(item.variant)}</div>` : ''}
        <div class="cart-item-price">${escapeHtml(formatMoney(item.price))} <span class="cart-item-unit">c/u</span></div>
      </div>
      <div class="cart-item-controls">
        <button type="button" class="cart-qty-btn" data-cart-key="${key}" data-qty="-1"
          aria-label="Quitar una unidad de ${name}">-</button>
        <span class="cart-qty-val" aria-label="Cantidad seleccionada">${item.quantity}</span>
        <button type="button" class="cart-qty-btn" data-cart-key="${key}" data-qty="1"
          aria-label="Añadir una unidad de ${name}">+</button>
        <button type="button" class="btn-remove-item" data-remove="${key}"
          title="Eliminar del carrito" aria-label="Eliminar ${name} del carrito">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
}

function updateCartUI() {
  const { count, totalCents } = getCartTotals();

  document.querySelectorAll('.cart-count').forEach((badge) => {
    badge.textContent = String(count);
  });

  const subtotalEl = document.getElementById('cartSubtotal');
  if (subtotalEl) subtotalEl.textContent = formatCents(totalCents);

  const listContainer = document.getElementById('cartItemsList');
  if (!listContainer) return;

  const footer = document.querySelector('.cart-drawer-footer');
  const checkoutButton = document.getElementById('checkoutBtn');

  if (cart.length === 0) {
    listContainer.innerHTML = `
      <div class="cart-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <p>Tu carrito está vacío</p>
        <small>Explora el catálogo y añade los artículos que desees.</small>
      </div>
    `;
    if (footer) footer.hidden = true;
    if (checkoutButton) checkoutButton.disabled = true;
    return;
  }

  if (footer) footer.hidden = false;
  if (checkoutButton) checkoutButton.disabled = false;

  listContainer.innerHTML = cart.map(renderCartItem).join('');
}

function openCartDrawer() {
  const overlay = document.getElementById('cartDrawerOverlay');
  if (!overlay) return;

  drawerLastFocused = document.activeElement;
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  lockPageScroll();
  focusFirst(overlay);
}

function closeCartDrawer() {
  const overlay = document.getElementById('cartDrawerOverlay');
  if (!overlay || !overlay.classList.contains('open')) return;

  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');

  if (!document.querySelector('.modal-overlay.active')) {
    unlockPageScroll();
  }

  if (drawerLastFocused && typeof drawerLastFocused.focus === 'function') {
    drawerLastFocused.focus();
  }
  drawerLastFocused = null;
}

// Captura el enlace de vendedor (?ref=CODIGO) y recuerda el código entre visitas.
function restoreSellerCode() {
  const input = document.getElementById('sellerCodeInput');
  if (!input) return;

  const params = new URLSearchParams(window.location.search);
  const refCode = (params.get('ref') || '').trim().toUpperCase();
  if (refCode) {
    storeWrite(STORAGE_KEYS.sellerCode, refCode);
    history.replaceState(null, '', window.location.pathname);
  }

  const saved = String(storeRead(STORAGE_KEYS.sellerCode, '') || '').trim();
  if (saved && !input.value) {
    input.value = saved;
  }
}

// Al cerrar la venta guarda el código para atribuir futuras compras al vendedor.
function rememberSellerCode(code) {
  if (code) storeWrite(STORAGE_KEYS.sellerCode, code);
}

/* ------------------------------------------------------------------ */
/* Checkout                                                            */
/* ------------------------------------------------------------------ */

function setFieldError(input, message) {
  if (!input) return;
  const errorEl = document.getElementById(`${input.id}Error`);
  if (errorEl) errorEl.textContent = message || '';
  input.classList.toggle('invalid', Boolean(message));
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function getDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

// Muestra u oculta los campos propios de mensajería según el método elegido.
function refreshCheckoutFields() {
  const methodInput = document.getElementById('deliveryMethod');
  if (!methodInput) return;

  const method = methodInput.value === 'recogida' ? 'recogida' : 'domicilio';
  document.querySelectorAll('[data-field]').forEach((el) => {
    el.hidden = method !== 'domicilio';
  });

  const timeLabel = document.querySelector('[for="clientTimeRange"]');
  if (timeLabel && timeLabel.classList.contains('sr-only') === false) {
    timeLabel.textContent = method === 'recogida' ? 'Rango de horario de recogida' : 'Rango de horario de mensajería';
  }
}

function validateCheckout() {
  const nameInput = document.getElementById('clientName');
  const phoneInput = document.getElementById('clientPhone');
  const landlineInput = document.getElementById('clientPhoneLandline');
  const methodInput = document.getElementById('deliveryMethod');
  const municipalityInput = document.getElementById('clientMunicipality');
  const addressInput = document.getElementById('clientAddress');
  const referenceInput = document.getElementById('clientReference');
  const timeInput = document.getElementById('clientTimeRange');
  const sellerInput = document.getElementById('sellerCodeInput');
  const notesInput = document.getElementById('clientNotes');
  const paymentInput = document.getElementById('clientPaymentNote');

  const name = nameInput ? nameInput.value.trim() : '';
  const phone = getDigits(phoneInput ? phoneInput.value : '');
  const phoneLandline = getDigits(landlineInput ? landlineInput.value : '');
  const deliveryMethod = methodInput && methodInput.value === 'recogida' ? 'recogida' : 'domicilio';
  const municipality = municipalityInput ? municipalityInput.value.trim() : '';
  const address = addressInput ? addressInput.value.trim() : '';
  const reference = referenceInput ? referenceInput.value.trim() : '';
  const timeRange = timeInput ? timeInput.value : '';
  const sellerCode = sellerInput ? sellerInput.value.trim().toUpperCase() : '';
  const notes = notesInput ? notesInput.value.trim() : '';
  const paysWith = paymentInput ? Number(paymentInput.value) || 0 : 0;

  let ok = true;
  let firstInvalid = null;

  const markInvalid = (input, message) => {
    setFieldError(input, message);
    ok = false;
    firstInvalid = firstInvalid || input;
  };

  if (name.length >= STORE_CONFIG.checkout.minNameLength) {
    setFieldError(nameInput, '');
  } else {
    markInvalid(nameInput, 'Escribe tu nombre completo (mínimo 3 letras).');
  }

  const { minPhoneDigits, maxPhoneDigits } = STORE_CONFIG.checkout;
  if (phone.length >= minPhoneDigits && phone.length <= maxPhoneDigits) {
    setFieldError(phoneInput, '');
  } else {
    markInvalid(phoneInput, `Teléfono necesario para confirmar el pedido (${minPhoneDigits}–${maxPhoneDigits} dígitos).`);
  }

  if (phoneLandline && phoneLandline.length < minPhoneDigits) {
    markInvalid(landlineInput, `El teléfono fijo necesita ${minPhoneDigits}+ dígitos.`);
  }

  if (deliveryMethod === 'domicilio') {
    if (municipality.length >= 3) {
      setFieldError(municipalityInput, '');
    } else {
      markInvalid(municipalityInput, 'Indica el municipio para el mensajero.');
    }

    if (address.length >= STORE_CONFIG.checkout.minAddressLength) {
      setFieldError(addressInput, '');
    } else {
      markInvalid(addressInput, 'Indica calle, número y apto. para el mensajero.');
    }

    if (reference.length >= 3) {
      setFieldError(referenceInput, '');
    } else {
      markInvalid(referenceInput, 'Un punto de referencia ayuda al mensajero a llegar.');
    }

  }

  const deliveryFeeCents = deliveryMethod === 'domicilio'
    ? toCents(STORE_CONFIG.deliveryPrice)
    : 0;
  const amountDueCents = totalOrderValue() + deliveryFeeCents;
  if (paysWith > 0 && toCents(paysWith) < amountDueCents) {
    const deliveryLabel = deliveryFeeCents > 0 ? ' con mensajería' : '';
    markInvalid(paymentInput, `El billete debe cubrir el total${deliveryLabel} (${formatCents(amountDueCents)}).`);
  } else {
    setFieldError(paymentInput, '');
  }

  if (timeRange) {
    setFieldError(timeInput, '');
  } else {
    markInvalid(timeInput, 'Elige el rango de horario para la entrega / recogida.');
  }

  if (notes.length > 200) {
    markInvalid(notesInput, 'Máximo 200 caracteres.');
  }

  const fullAddress = deliveryMethod === 'domicilio'
    ? `${address}, ${municipality}${reference ? ` (ref: ${reference})` : ''}`
    : '';

  return {
    ok, firstInvalid, name, phone, phoneLandline, deliveryMethod,
    municipality, address, reference, timeRange, sellerCode, notes, paysWith, fullAddress
  };
}

function totalOrderValue() {
  return getCartTotals().totalCents;
}

function productLines() {
  return cart.map((item) => {
    const variant = item.variant ? ` (${item.variant})` : '';
    return {
      name: `${item.quantity}x ${item.name}${variant}`
    };
  });
}

function productNamesText(lines) {
  return lines.map((line) => `• ${line.name}`).join('\n');
}

function valeGestorLine() {
  const gestor = STORE_CONFIG.gestor || {};
  return `Nombre y teléfono del gestor (se requiere para las dinámicas): ${gestor.name || '—'} (${gestor.phone || '—'})`;
}

function buildWhatsAppMessage(data, totalCents, orderCode, registered = true) {
  const lines = productLines();
  const productsText = productNamesText(lines);
  const subtotalLabel = registered
    ? 'Subtotal de productos (confirmado por el sistema)'
    : 'Subtotal de productos (estimado; pendiente de registro)';
  const totalLabel = registered ? 'Total a pagar' : 'Total estimado (pedido no registrado)';
  const disclaimer = 'Revisar bien el producto una vez el cliente se vaya no hay devolución de ningún tipo.';
  const paymentMethod = 'Efectivo';

  if (data.deliveryMethod === 'recogida') {
    let vale = '🔱 *VALE DE RECOGIDA* 🔱';
    if (orderCode) vale += `\nNº de vale: ${orderCode}`;
    vale += '\n\n';
    vale += `Nombre del cliente: ${data.name}\n`;
    vale += `Teléfono: ${data.phone}\n`;
    vale += `Rango de horario de recogida: ${data.timeRange}\n`;
    vale += `Producto:\n${productsText}\n`;
    vale += `${subtotalLabel}: ${formatCents(totalCents)}\n`;
    vale += `${totalLabel}: ${formatCents(totalCents)}\n`;
    vale += `Forma de pago: ${paymentMethod}\n`;
    vale += `\n${valeGestorLine()}\n\n`;
    vale += disclaimer;
    return vale;
  }

  const deliveryPriceCents = Math.max(0, toCents(Number(STORE_CONFIG.deliveryPrice) || 0));
  const amountDueCents = totalCents + deliveryPriceCents;
  const cashCents = data.paysWith ? toCents(data.paysWith) : 0;
  const vuelto = data.paysWith
    ? formatCents(Math.max(0, cashCents - amountDueCents))
    : '—';
  const cashInsufficient = cashCents > 0 && cashCents < amountDueCents;

  let vale = '🔱 *VALE DE MENSAJERÍA* 🔱';
  if (orderCode) vale += `\nNº de vale: ${orderCode}`;
  vale += '\n\n';
  vale += `Nombre del cliente: ${data.name}\n`;
  vale += `Dirección: ${data.address}\n`;
  vale += `Municipio: ${data.municipality}\n`;
  vale += `Punto de referencia: ${data.reference}\n`;
  vale += `Teléfono: ${data.phone}\n`;
  vale += `Teléfono fijo en caso de tener: ${data.phoneLandline || '—'}\n`;
  vale += `Rango de horario de mensajería: ${data.timeRange}\n`;
  vale += `Producto:\n${productsText}\n`;
  vale += `${subtotalLabel}: ${formatCents(totalCents)}\n`;
  vale += `Precio de mensajería (tarifa configurada): ${formatCents(deliveryPriceCents)}\n`;
  vale += `${totalLabel}: ${formatCents(amountDueCents)}\n`;
  vale += `Forma de pago: ${paymentMethod}\n`;
  vale += `Vuelto: ${vuelto}\n`;
  if (cashInsufficient) {
    vale += '⚠️ El billete indicado no cubre el total actualizado. Confirma el importe antes de aceptar el pedido.\n';
  }
  if (data.sellerCode) vale += `Código de vendedor: ${data.sellerCode}\n`;
  if (data.notes) vale += `Nota: ${data.notes}\n`;
  vale += `\n${valeGestorLine()}\n\n`;
  vale += `${disclaimer}\n`;
  vale += 'La mensajería es obligatoria pagarla aunque el cliente no se quede con el producto.';
  return vale;
}
function buildWhatsAppUrl(message) {
  const phone = String(STORE_CONFIG.whatsappPhone || '').replace(/\D/g, '');
  if (phone.length < 8) {
    console.warn('[checkout] Configura un número de WhatsApp válido en js/config.js');
  }
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

// Enlace real en vez de window.open: funciona mejor en navegadores in-app
// (Instagram/Facebook) y con bloqueadores de popups.
function openWhatsApp(url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function setCheckoutBusy(busy) {
  const button = document.getElementById('checkoutBtn');
  if (!button) return;

  button.disabled = Boolean(busy) || cart.length === 0;
  const label = button.querySelector('span');
  if (label) {
    label.textContent = busy ? 'Procesando…' : 'Completar Pedido en WhatsApp';
  }
}

async function checkoutWhatsApp() {
  if (checkoutInProgress) return;

  if (cart.length === 0) {
    showToast('Tu carrito está vacío');
    return;
  }

  const data = validateCheckout();
  if (!data.ok) {
    if (data.firstInvalid) data.firstInvalid.focus();
    showToast('Revisa los datos de entrega');
    return;
  }

  checkoutInProgress = true;
  setCheckoutBusy(true);

  try {
    const localTotalCents = getCartTotals().totalCents;
    let registered = false;
    let totalCents = localTotalCents;
    let orderCode = '';

    try {
      const result = await createOrderInApi({
        name: data.name,
        phone: data.phone,
        address: data.fullAddress,
        notes: data.notes,
        deliveryMethod: data.deliveryMethod,
        sellerCode: data.sellerCode,
        items: cart.map((item) => ({
          product_id: item.id,
          variant: item.variant,
          quantity: item.quantity
        }))
      });

      registered = true;
      totalCents = result.totalCents;
      orderCode = result.orderCode;
      rememberSellerCode(data.sellerCode);
    } catch (error) {
      console.error('[checkout]', error);

      if (error && error.status === 0) {
        // Sin conexión: no se pierde la venta; se ofrece enviar igual por WhatsApp.
        const proceed = window.confirm(
          'No se pudo registrar el pedido en el sistema. ¿Quieres enviarlo igual por WhatsApp?'
        );
        if (!proceed) return;
      } else {
        showToast(error.message || 'No se pudo registrar el pedido');

        if (typeof refreshProductsFromServer === 'function') {
          await refreshProductsFromServer({ silent: true });
        }
        syncCartWithCatalog();
        return;
      }
    }

    const message = buildWhatsAppMessage(data, totalCents, orderCode, registered);
    openWhatsApp(buildWhatsAppUrl(message));

    clearCart();
    closeCartDrawer();

    ['clientName', 'clientPhone', 'clientPhoneLandline', 'clientMunicipality', 'clientAddress',
      'clientReference', 'sellerCodeInput', 'clientNotes', 'clientPaymentNote'].forEach((id) => {
      const input = document.getElementById(id);
      if (input) input.value = '';
    });
    const timeInput = document.getElementById('clientTimeRange');
    if (timeInput) timeInput.value = '';

    showToast(registered
      ? 'Pedido registrado. Envía el mensaje en WhatsApp para confirmarlo.'
      : 'Pedido enviado por WhatsApp. No se pudo registrar en el panel.');
  } finally {
    checkoutInProgress = false;
    setCheckoutBusy(false);
  }
}

/* ------------------------------------------------------------------ */
/* Eventos                                                             */
/* ------------------------------------------------------------------ */

function setupCartEvents() {
  const overlay = document.getElementById('cartDrawerOverlay');

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const action = trigger.getAttribute('data-action');
    if (action === 'open-cart') openCartDrawer();
    if (action === 'close-cart') closeCartDrawer();
  });

  const checkoutForm = document.getElementById('checkoutForm');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', (event) => {
      event.preventDefault();
      checkoutWhatsApp();
    });
  }

  if (overlay) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeCartDrawer();
    });
  }

  const list = document.getElementById('cartItemsList');
  if (list) {
    list.addEventListener('click', (event) => {
      const qtyButton = event.target.closest('[data-qty]');
      if (qtyButton) {
        updateCartItemQty(
          qtyButton.getAttribute('data-cart-key'),
          Number(qtyButton.getAttribute('data-qty'))
        );
        return;
      }

      const removeButton = event.target.closest('[data-remove]');
      if (removeButton) removeFromCart(removeButton.getAttribute('data-remove'));
    });
  }

  ['clientName', 'clientPhone', 'clientPhoneLandline', 'clientMunicipality', 'clientAddress',
    'clientReference', 'sellerCodeInput', 'clientNotes', 'clientPaymentNote'].forEach((id) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('input', () => setFieldError(input, ''));
  });

  const methodInput = document.getElementById('deliveryMethod');
  if (methodInput) {
    methodInput.addEventListener('change', () => {
      setFieldError(methodInput, '');
      refreshCheckoutFields();
    });
    refreshCheckoutFields();
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeCartDrawer();
      return;
    }

    if (event.key === 'Tab' && overlay && overlay.classList.contains('open')) {
      trapTab(event, overlay.querySelector('.cart-drawer'));
    }
  });
}
