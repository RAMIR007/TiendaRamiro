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
  if (typeof url !== 'string' || !/^https:\/\/images\.unsplash\.com\//i.test(url)) return '';
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
          <img src="${escapeHtml(url)}" alt="" width="65" height="65" loading="lazy" decoding="async">
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
