// js/store.js — Catálogo, búsqueda, filtros y modal de producto.
// La fuente es Supabase; localStorage solo acelera la primera pintura.

let currentCategory = 'all';
let searchQuery = '';
let selectedVariant = null;
let currentModalProduct = null;
let currentModalQty = 1;
let modalLastFocused = null;
let catalogState = 'loading';
let catalogError = '';

document.addEventListener('DOMContentLoaded', () => {
  applyStoreConfig();
  renderCategories();
  setupCategoryEvents();
  setupCatalogEvents();
  setupSearchEvents();
  setupModalEvents();
  window.addEventListener('storage', handleStorageChange);

  catalogState = getCachedProducts().length > 0 ? 'ready' : 'loading';
  renderCatalog();
  refreshCategoriesFromServer();
  refreshProductsFromServer();
});

/* ------------------------------------------------------------------ */
/* Sincronización con Supabase                                         */
/* ------------------------------------------------------------------ */

async function refreshProductsFromServer(options = {}) {
  const silent = Boolean(options.silent);
  const cached = getCachedProducts();

  if (!silent && cached.length === 0) {
    catalogState = 'loading';
    catalogError = '';
    renderCatalog();
  }

  try {
    const products = await fetchProductsFromApi();
    setCachedProducts(products);
    catalogState = 'ready';
    catalogError = '';

    if (typeof syncCartWithCatalog === 'function') syncCartWithCatalog();
    renderCatalog();

    if (currentModalProduct) {
      const stillExists = products.find((product) => product.id === currentModalProduct.id);
      if (stillExists) {
        openProductModal(stillExists.id);
      } else {
        closeProductModal();
        showToast('El producto que estabas viendo ya no está disponible');
      }
    }

    return products;
  } catch (error) {
    console.error('[catalog]', error);
    catalogError = error.message || 'No se pudo cargar el catálogo';
    catalogState = getCachedProducts().length > 0 ? 'ready' : 'error';
    renderCatalog();

    if (catalogState === 'ready') {
      showToast('Sin conexión: mostrando el catálogo guardado');
    }

    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Categorías                                                          */
/* ------------------------------------------------------------------ */

async function refreshCategoriesFromServer() {
  try {
    const categories = await fetchCategoriesFromApi();
    STORE_CONFIG.categories = categories;
    renderCategories();
    renderCatalog();
  } catch (error) {
    console.error('[categories]', error);
    showToast('No se pudieron sincronizar las categorías; se muestran las predeterminadas.');
  }
}

function renderCategories() {
  const container = document.getElementById('categoriesPills');
  if (!container) return;

  const options = [{ key: 'all', label: 'Todos los productos' }].concat(
    STORE_CONFIG.categories.map((category) => ({
      key: category.key,
      label: `${category.emoji} ${category.label}`
    }))
  );

  container.innerHTML = options
    .map((option, index) => {
      const isActive = index === 0;
      return `<button type="button" class="cat-btn${isActive ? ' active' : ''}" data-cat="${escapeHtml(option.key)}" aria-pressed="${isActive}">${escapeHtml(option.label)}</button>`;
    })
    .join('');
}

function setupCategoryEvents() {
  const container = document.getElementById('categoriesPills');
  if (!container) return;

  container.addEventListener('click', (event) => {
    const button = event.target.closest('.cat-btn');
    if (!button) return;

    currentCategory = button.getAttribute('data-cat') || 'all';

    container.querySelectorAll('.cat-btn').forEach((item) => {
      const isActive = item === button;
      item.classList.toggle('active', isActive);
      item.setAttribute('aria-pressed', String(isActive));
    });

    renderCatalog();
  });
}

/* ------------------------------------------------------------------ */
/* Catálogo                                                            */
/* ------------------------------------------------------------------ */

function buildSrcset(url) {
  if (typeof url !== 'string') return '';

  // Imágenes locales: pN-M-800.webp + pN-M-400.webp
  if (/^\/img\/.+-800\.webp$/.test(url)) {
    return `${url.replace(/-800\.webp$/, '-400.webp')} 400w, ${url} 800w`;
  }

  // Compatibilidad con imágenes externas de Unsplash.
  if (!/^https:\/\/images\.unsplash\.com\//i.test(url)) return '';
  if (!/[?&]w=\d+/.test(url)) return '';
  return [320, 640, 800]
    .map((width) => `${url.replace(/([?&])w=\d+/, `$1w=${width}`)} ${width}w`)
    .join(', ');
}

function renderProductCard(product) {
  const outOfStock = product.stock <= 0;
  const srcset = buildSrcset(product.images[0]);

  return `
    <article class="product-card${outOfStock ? ' is-out' : ''}" data-id="${escapeHtml(product.id)}">
      <div class="product-thumb-wrap">
        <img
          src="${escapeHtml(product.images[0])}"
          ${srcset ? `srcset="${escapeHtml(srcset)}" sizes="(max-width: 700px) 92vw, 300px"` : ''}
          alt="${escapeHtml(product.name)}"
          width="600" height="600" loading="lazy" decoding="async">
        ${product.badge ? `<span class="badge-float">${escapeHtml(product.badge)}</span>` : ''}
        <span class="stock-indicator${outOfStock ? ' out' : ''}">
          <span class="stock-dot" aria-hidden="true"></span>
          ${outOfStock ? 'Agotado' : `${product.stock} en stock`}
        </span>
      </div>
      <div class="product-info">
        <span class="product-category">${escapeHtml(getCategoryLabel(product.category))}</span>
        <h3 class="product-title">
          <button type="button" class="product-title-btn" data-open="${escapeHtml(product.id)}">${escapeHtml(product.name)}</button>
        </h3>
        <p class="product-desc-snippet">${escapeHtml(product.description)}</p>
        <div class="product-bottom-row">
          <div class="product-price">${escapeHtml(formatMoney(product.price))}</div>
          <div class="product-actions">
            <button type="button" class="btn-share-quick" data-share="${escapeHtml(product.id)}"
              aria-label="Compartir ${escapeHtml(product.name)} por WhatsApp" title="Compartir por WhatsApp">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.592 2.654-.696c1.004.577 1.764.846 2.806.847h.005c3.182 0 5.767-2.587 5.768-5.766.001-3.182-2.585-5.77-5.773-5.77zm4.565 8.081c-.195.55-1.124 1.056-1.547 1.127-.406.068-.934.096-2.738-.65-1.928-.797-3.17-2.754-3.266-2.883-.095-.128-.781-1.04-1.189-1.579-.408-.538-.216-.807-.024-.999.172-.172.384-.44.576-.632.192-.192.256-.32.384-.544.128-.224.064-.416-.032-.608-.096-.192-.864-2.083-1.184-2.853-.312-.751-.628-.648-.864-.66-.224-.012-.48-.016-.736-.016-.256 0-.672.096-1.024.48-.352.384-1.344 1.312-1.344 3.2 0 1.888 1.376 3.712 1.568 3.968.192.256 2.709 4.137 6.561 5.799 3.852 1.662 3.852 1.108 4.544 1.044.692-.064 2.24-1.08 2.56-2.12.32-1.04.32-1.936.224-2.12-.096-.184-.352-.288-.736-.48z"/>
              </svg>
            </button>
            <button type="button" class="btn-add-quick" data-add="${escapeHtml(product.id)}"
              ${outOfStock ? 'disabled' : ''}
              aria-label="Añadir ${escapeHtml(product.name)} al carrito">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderCatalogStatus(html) {
  const container = document.getElementById('productsGrid');
  const countEl = document.getElementById('productsCount');
  if (countEl) countEl.textContent = '';
  if (container) container.innerHTML = `<div class="catalog-status">${html}</div>`;
}

function renderCatalog() {
  const container = document.getElementById('productsGrid');
  const countEl = document.getElementById('productsCount');
  if (!container) return;

  const products = getCachedProducts().filter((product) => product.active !== false);

  if (products.length === 0 && catalogState === 'loading') {
    renderCatalogStatus(`
      <div class="catalog-spinner" aria-hidden="true"></div>
      <h3>Cargando catálogo…</h3>
      <p>Estamos consultando los productos disponibles.</p>
    `);
    return;
  }

  if (products.length === 0 && catalogState === 'error') {
    renderCatalogStatus(`
      <h3>No se pudo cargar el catálogo</h3>
      <p>${escapeHtml(catalogError || 'Revisa tu conexión e inténtalo de nuevo.')}</p>
      <button type="button" class="btn-retry" data-action="retry-products">Reintentar</button>
    `);
    return;
  }

  if (products.length === 0) {
    renderCatalogStatus(`
      <h3>Catálogo vacío</h3>
      <p>Todavía no hay productos publicados.</p>
      <button type="button" class="btn-retry" data-action="retry-products">Actualizar</button>
    `);
    return;
  }

  const query = searchQuery.toLowerCase();

  const filtered = products.filter((product) => {
    if (currentCategory !== 'all' && product.category !== currentCategory) return false;
    if (!query) return true;

    const haystack = [
      product.name,
      product.description,
      getCategoryLabel(product.category),
      product.variants.join(' '),
      product.badge || ''
    ].join(' ').toLowerCase();

    return haystack.includes(query);
  });

  if (countEl) {
    countEl.textContent = `${filtered.length} producto${filtered.length === 1 ? '' : 's'} disponible${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-catalog">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <h3>No encontramos coincidencias</h3>
        <p>Intenta con otra palabra clave o explora otra categoría.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(renderProductCard).join('');

  // Respaldo visual si una URL de imagen está rota o ya no existe.
  container.querySelectorAll('.product-thumb-wrap img').forEach((image) => {
    image.addEventListener('error', () => {
      image.removeAttribute('srcset');
      image.src = PRODUCT_PLACEHOLDER_IMAGE;
    }, { once: true });
  });
}

function handleStorageChange(event) {
  if (event.key !== STORAGE_KEYS.products) return;

  renderCatalog();

  if (currentModalProduct) {
    const stillExists = getCachedProducts().find((product) => product.id === currentModalProduct.id);
    if (stillExists) {
      openProductModal(stillExists.id);
    } else {
      closeProductModal();
    }
  }
}

function setupCatalogEvents() {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  container.addEventListener('click', (event) => {
    const retryButton = event.target.closest('[data-action="retry-products"]');
    if (retryButton) {
      refreshProductsFromServer();
      return;
    }

    const addButton = event.target.closest('[data-add]');
    if (addButton) {
      event.stopPropagation();
      if (addButton.disabled) return;
      addToCart(addButton.getAttribute('data-add'), 1);
      return;
    }

    const shareButton = event.target.closest('[data-share]');
    if (shareButton) {
      event.stopPropagation();
      openProductShare(shareButton.getAttribute('data-share'));
      return;
    }

    const openButton = event.target.closest('[data-open]');
    if (openButton) {
      openProductModal(openButton.getAttribute('data-open'));
      return;
    }

    const card = event.target.closest('.product-card');
    if (card) openProductModal(card.getAttribute('data-id'));
  });
}

/* ------------------------------------------------------------------ */
/* Búsqueda                                                            */
/* ------------------------------------------------------------------ */

function setupSearchEvents() {
  const input = document.getElementById('searchInput');
  if (!input) return;

  input.addEventListener('input', debounce((event) => {
    searchQuery = event.target.value.trim();
    renderCatalog();
  }, 120));
}

/* ------------------------------------------------------------------ */
/* Modal de producto                                                   */
/* ------------------------------------------------------------------ */

function setModalGallery(product) {
  const mainImage = document.getElementById('modalMainImg');
  const thumbsContainer = document.getElementById('modalThumbs');
  if (!mainImage || !thumbsContainer) return;

  mainImage.src = product.images[0];
  mainImage.alt = product.name;

  if (product.images.length > 1) {
    thumbsContainer.hidden = false;
    thumbsContainer.innerHTML = product.images
      .map((url, index) => `
        <button type="button" class="thumb-item${index === 0 ? ' active' : ''}"
          data-thumb="${escapeHtml(url)}" aria-pressed="${index === 0}"
          aria-label="Ver imagen ${index + 1} de ${product.images.length}">
          <img src="${escapeHtml(smallImageUrl(url))}" alt="" width="65" height="65" loading="lazy" decoding="async">
        </button>
      `)
      .join('');
  } else {
    thumbsContainer.hidden = true;
    thumbsContainer.innerHTML = '';
  }
}

function setModalVariants(product) {
  const section = document.getElementById('modalVariantsSection');
  const list = document.getElementById('modalVariantsList');
  if (!section || !list) return;

  if (product.variants.length > 0) {
    section.hidden = false;
    list.innerHTML = product.variants
      .map((variant, index) => `
        <button type="button" class="variant-btn${index === 0 ? ' selected' : ''}"
          data-variant="${escapeHtml(variant)}" aria-pressed="${index === 0}">${escapeHtml(variant)}</button>
      `)
      .join('');
  } else {
    section.hidden = true;
    list.innerHTML = '';
  }
}

function openProductModal(productId) {
  const product = getCachedProducts().find((item) => item.id === productId);
  if (!product) {
    showToast('Ese producto ya no está disponible');
    return;
  }

  currentModalProduct = product;
  selectedVariant = product.variants.length > 0 ? product.variants[0] : null;
  currentModalQty = 1;

  document.getElementById('modalCat').textContent = getCategoryLabel(product.category);
  document.getElementById('modalTitle').textContent = product.name;
  document.getElementById('modalPrice').textContent = formatMoney(product.price);
  document.getElementById('modalDesc').textContent = product.description;
  document.getElementById('modalQty').textContent = '1';

  const stockEl = document.getElementById('modalStock');
  if (stockEl) {
    stockEl.textContent = product.stock > 0 ? `${product.stock} disponibles` : 'Producto agotado';
    stockEl.className = `modal-stock${product.stock > 0 ? '' : ' out'}`;
  }

  const addButton = document.getElementById('modalAddBtn');
  if (addButton) {
    addButton.disabled = product.stock <= 0;
    addButton.querySelector('span').textContent = product.stock > 0 ? 'Añadir al Carrito' : 'Agotado';
  }

  setModalGallery(product);
  setModalVariants(product);

  const overlay = document.getElementById('productModalOverlay');
  if (overlay) {
    modalLastFocused = document.activeElement;
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    lockPageScroll();
    focusFirst(overlay);
  }
}

function closeProductModal() {
  const overlay = document.getElementById('productModalOverlay');
  if (!overlay || !overlay.classList.contains('active')) return;

  overlay.classList.remove('active');
  overlay.setAttribute('aria-hidden', 'true');
  currentModalProduct = null;
  selectedVariant = null;
  unlockPageScroll();

  if (modalLastFocused && typeof modalLastFocused.focus === 'function') {
    modalLastFocused.focus();
  }
  modalLastFocused = null;
}

function switchModalGalleryImage(url, button) {
  const mainImage = document.getElementById('modalMainImg');
  if (mainImage) mainImage.src = url;

  const thumbs = document.querySelectorAll('#modalThumbs .thumb-item');
  thumbs.forEach((thumb) => {
    const isActive = thumb === button;
    thumb.classList.toggle('active', isActive);
    thumb.setAttribute('aria-pressed', String(isActive));
  });
}

function selectVariant(variantName, button) {
  selectedVariant = variantName;

  const buttons = document.querySelectorAll('#modalVariantsList .variant-btn');
  buttons.forEach((item) => {
    const isActive = item === button;
    item.classList.toggle('selected', isActive);
    item.setAttribute('aria-pressed', String(isActive));
  });
}

function changeModalQty(delta) {
  const max = currentModalProduct ? Math.max(1, currentModalProduct.stock) : 1;
  currentModalQty = Math.min(max, Math.max(1, currentModalQty + delta));

  const qtyEl = document.getElementById('modalQty');
  if (qtyEl) qtyEl.textContent = String(currentModalQty);
}

function openProductShare(productId) {
  const product = findProduct(productId);
  if (!product) return;

  const primaryImage = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : '';
  const productUrl = `${window.location.origin}/index.html#${encodeURIComponent(product.id)}`;
  const message = `🛍️ *${brandNameText(product)}*\n${formatMoney(product.price)}\n\n👀 Mira el detalle: ${productUrl}\n\nPide desde ${window.location.origin} 📱`;

  if (primaryImage) {
    const shareUrl = new URL('https://wa.me/');
    shareUrl.searchParams.set('text', message + `\n\n📸 ${primaryImage}`);
    openWhatsApp(shareUrl.toString());
  } else {
    openWhatsApp(`https://wa.me/?text=${encodeURIComponent(message)}`);
  }

  showToast('Abre WhatsApp y elige el contacto');
}

function brandNameText(product) {
  return `${product.name}${product.stock > 0 ? '' : ' (agotado)'}`;
}

function addCurrentModalToCart() {
  if (!currentModalProduct) return;
  if (currentModalProduct.stock <= 0) {
    showToast('Producto agotado');
    return;
  }

  const added = addToCart(currentModalProduct.id, currentModalQty, selectedVariant);
  if (added) closeProductModal();
}

function setupModalEvents() {
  const overlay = document.getElementById('productModalOverlay');

  if (overlay) {
    overlay.addEventListener('click', (event) => {
      const actionElement = event.target.closest('[data-action]');
      if (actionElement) {
        const action = actionElement.getAttribute('data-action');
        if (action === 'close-product-modal') closeProductModal();
        if (action === 'qty-minus') changeModalQty(-1);
        if (action === 'qty-plus') changeModalQty(1);
        if (action === 'add-modal-to-cart') addCurrentModalToCart();
        if (action === 'share-modal' && currentModalProduct) openProductShare(currentModalProduct.id);
        return;
      }

      if (event.target === overlay) closeProductModal();
    });

    const thumbs = document.getElementById('modalThumbs');
    if (thumbs) {
      thumbs.addEventListener('click', (event) => {
        const thumb = event.target.closest('[data-thumb]');
        if (thumb) switchModalGalleryImage(thumb.getAttribute('data-thumb'), thumb);
      });
    }

    const variantsList = document.getElementById('modalVariantsList');
    if (variantsList) {
      variantsList.addEventListener('click', (event) => {
        const button = event.target.closest('[data-variant]');
        if (button) selectVariant(button.getAttribute('data-variant'), button);
      });
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeProductModal();
      return;
    }

    if (event.key === 'Tab' && overlay && overlay.classList.contains('active')) {
      trapTab(event, overlay.querySelector('.modal-content'));
    }
  });
}
