// js/utils.js — Utilidades compartidas: escape de HTML, almacenamiento seguro,
// dinero, fechas, hashing con respaldo y control de foco para diálogos.
// Sin dependencias. Compatible con navegadores antiguos (ES2017).

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

// Solo permite URLs http(s) o data:image. Se usa al guardar imágenes del panel.
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
/* Auditoría                                                           */
/* ------------------------------------------------------------------ */

const AUDIT_MAX_ENTRIES = 150;

// Registro único compartido por la tienda y el panel (antes estaba
// duplicado en cart.js y admin.js con reglas distintas).
function pushAudit(user, action) {
  const stored = storeRead(STORAGE_KEYS.audit, []);
  const logs = Array.isArray(stored) ? stored : [];
  logs.unshift({
    timestamp: Date.now(),
    date: formatDateShort(new Date()),
    user: String(user || 'Sistema'),
    action: String(action || '')
  });
  if (logs.length > AUDIT_MAX_ENTRIES) logs.length = AUDIT_MAX_ENTRIES;
  storeWrite(STORAGE_KEYS.audit, logs);
}

/* ------------------------------------------------------------------ */
/* Hashing                                                             */
/* ------------------------------------------------------------------ */

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

// SHA-256 en JS puro. Necesario porque crypto.subtle no existe cuando la
// demo se abre por http:// en una LAN (contexto no seguro) o desde file://
// en algunos navegadores, y ahí el login se rompía en silencio.
function sha256Fallback(bytes) {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  const rotr = (x, n) => (x >>> n) | (x << (32 - n));

  let H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  ];

  const length = bytes.length;
  // 1 byte (0x80) + 8 bytes de longitud, redondeado a bloques de 64.
  const total = (((length + 8) >> 6) + 1) << 6;
  const message = new Uint8Array(total);
  message.set(bytes);
  message[length] = 0x80;

  const view = new DataView(message.buffer);
  const bitHigh = Math.floor((length * 8) / 0x100000000);
  const bitLow = (length * 8) >>> 0;
  view.setUint32(total - 8, bitHigh);
  view.setUint32(total - 4, bitLow);

  const w = new Uint32Array(64);

  for (let offset = 0; offset < total; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = H[0], b = H[1], c = H[2], d = H[3];
    let e = H[4], f = H[5], g = H[6], h = H[7];

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g; g = f; f = e;
      e = (d + temp1) >>> 0;
      d = c; c = b; b = a;
      a = (temp1 + temp2) >>> 0;
    }

    H = [
      (H[0] + a) >>> 0, (H[1] + b) >>> 0, (H[2] + c) >>> 0, (H[3] + d) >>> 0,
      (H[4] + e) >>> 0, (H[5] + f) >>> 0, (H[6] + g) >>> 0, (H[7] + h) >>> 0
    ];
  }

  return H.map((word) => word.toString(16).padStart(8, '0')).join('');
}

// Codificador UTF-8 con respaldo para navegadores/webviews antiguos donde
// TextEncoder no existe (el login fallaba en esos dispositivos).
function utf8Bytes(text) {
  const value = String(text);

  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value);
  }

  const encoded = encodeURIComponent(value);
  const bytes = [];

  for (let i = 0; i < encoded.length; i += 1) {
    if (encoded[i] === '%') {
      bytes.push(parseInt(encoded.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i));
    }
  }

  return new Uint8Array(bytes);
}

async function sha256Hex(text) {
  const bytes = utf8Bytes(text);

  if (typeof crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
    try {
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return bytesToHex(new Uint8Array(digest));
    } catch (error) {
      console.warn('[hash] Web Crypto no disponible, usando respaldo JS:', error);
    }
  }

  return sha256Fallback(bytes);
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
  showToast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}
