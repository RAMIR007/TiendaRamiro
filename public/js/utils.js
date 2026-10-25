// js/utils.js — Utilidades compartidas: escape de HTML, almacenamiento seguro,
// dinero, fechas, foco para diálogos y configuración de marca.
// Sin dependencias.

/* ------------------------------------------------------------------ */
/* HTML                                                                */
/* ------------------------------------------------------------------ */

// Escapa todo lo que se interpola en HTML. Evita XSS almacenado tanto de
// productos creados en el panel como de datos escritos por el cliente.
function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Solo permite URLs http(s) o data:image. Se usa al normalizar imágenes.
function isSafeImageUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return false;
  return /^https?:\/\//i.test(url.trim()) || /^data:image\//i.test(url.trim());
}

/* ------------------------------------------------------------------ */
/* Almacenamiento                                                      */
/* ------------------------------------------------------------------ */

// Lectura tolerante a fallos: JSON corrupto, storage bloqueado o lleno.
function storeRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return fallback;
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    console.warn(`[storage] No se pudo leer "${key}":`, error);
    return fallback;
  }
}

// Escritura que informa si falló (por ejemplo QuotaExceededError).
function storeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`[storage] No se pudo guardar "${key}":`, error);
    return false;
  }
}

function storeRemove(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`[storage] No se pudo borrar "${key}":`, error);
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Dinero                                                              */
/* ------------------------------------------------------------------ */

// Todo el cálculo monetario se hace en centavos enteros para evitar
// los errores de coma flotante (0.1 + 0.2 !== 0.3).
function toCents(amount) {
  const number = Number(amount);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}

function roundMoney(cents) {
  return Math.round(cents) / 100;
}

// Formato de la tienda: "$28 USD" / "$28.50 USD".
function formatMoney(amount) {
  return formatCents(toCents(amount));
}

function formatCents(cents) {
  const rounded = Math.round(cents);
  const value = rounded / 100;
  const hasDecimals = rounded % 100 !== 0;
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2
  }).format(value);
  return `$${formatted} ${STORE_CONFIG.currency}`;
}

/* ------------------------------------------------------------------ */
/* Fechas                                                              */
/* ------------------------------------------------------------------ */

function formatDateShort(date) {
  try {
    return new Intl.DateTimeFormat(STORE_CONFIG.locale, {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(date || new Date());
  } catch (error) {
    return new Date().toLocaleString();
  }
}

/* ------------------------------------------------------------------ */
/* UI: debounce, scroll y foco                                         */
/* ------------------------------------------------------------------ */

function debounce(fn, wait) {
  let timer = null;
  return function debounced() {
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), wait);
  };
}

function lockPageScroll() {
  document.body.classList.add('no-scroll');
}

function unlockPageScroll() {
  document.body.classList.remove('no-scroll');
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function focusableIn(root) {
  return Array.prototype.slice
    .call(root.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => element.offsetParent !== null || element === document.activeElement);
}

// Mantiene el foco dentro de un diálogo abierto (Tab y Shift+Tab).
function trapTab(event, root) {
  if (event.key !== 'Tab' || !root) return;

  const focusable = focusableIn(root);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function focusFirst(root) {
  if (!root) return;
  const focusable = focusableIn(root);
  if (focusable.length > 0) focusable[0].focus();
}

/* ------------------------------------------------------------------ */
/* Configuración de marca                                              */
/* ------------------------------------------------------------------ */

// Rellena nombre, eslogan y enlace del estudio desde js/config.js para no
// tener el teléfono ni la marca duplicados en el HTML.
function applyStoreConfig() {
  document.querySelectorAll('[data-config="brand-name"]').forEach((element) => {
    element.textContent = STORE_CONFIG.brand.name;
  });

  document.querySelectorAll('[data-config="brand-tagline"]').forEach((element) => {
    element.textContent = STORE_CONFIG.brand.tagline;
  });

  document.querySelectorAll('[data-config="studio-link"]').forEach((element) => {
    const phone = String(STORE_CONFIG.brand.studioWhatsApp || '').replace(/\D/g, '');
    element.textContent = STORE_CONFIG.brand.studio;
    element.href = `https://wa.me/${phone}`;
  });

  const footerLink = document.getElementById('footerWhatsApp');
  if (footerLink) {
    const phone = String(STORE_CONFIG.brand.studioWhatsApp || '').replace(/\D/g, '');
    footerLink.href = `https://wa.me/${phone}`;
  }
}

/* ------------------------------------------------------------------ */
/* Notificaciones                                                      */
/* ------------------------------------------------------------------ */

// Toast compartido por la tienda y el panel. El texto entra por
// textContent: nunca se interpreta como HTML.
function showToast(text) {
  let toast = document.getElementById('toastMsg');

  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toastMsg';
    toast.className = 'toast-msg';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = [
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" aria-hidden="true">',
      '<polyline points="20 6 9 17 4 12"></polyline></svg><span></span>'
    ].join('');
    document.body.appendChild(toast);
  }

  const label = toast.querySelector('span');
  if (label) label.textContent = String(text === null || text === undefined ? '' : text);

  toast.classList.add('show');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 3200);
}
