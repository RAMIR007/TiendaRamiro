// js/store.js - Renderizado del catálogo, búsqueda, filtros y modal de producto con galería
let currentCategory = 'all';
let searchQuery = '';
let selectedVariant = null;
let currentModalProduct = null;
let currentModalQty = 1;

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
  renderCatalog();
  setupFilterEvents();
  setupSearchEvents();
  setupModalEvents();
});

// Renderizar tarjetas del catálogo
function renderCatalog() {
  const container = document.getElementById('productsGrid');
  const countEl = document.getElementById('productsCount');
  if (!container) return;

  const products = getStoredProducts();

  // Filtrado
  const filtered = products.filter(item => {
    const matchCat = currentCategory === 'all' || item.category === currentCategory;
    const matchSearch = searchQuery === '' || 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCat && matchSearch;
  });

  if (countEl) {
    countEl.textContent = `${filtered.length} producto${filtered.length === 1 ? '' : 's'} disponible${filtered.length === 1 ? '' : 's'}`;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-catalog">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <h3>No encontramos coincidencias</h3>
        <p>Intenta con otra palabra clave o explora otra categoría.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(prod => `
    <article class="product-card" onclick="openProductModal('${prod.id}')" data-id="${prod.id}">
      <div class="product-thumb-wrap">
        <img src="${prod.images[0]}" alt="${prod.name}" loading="lazy">
        ${prod.badge ? `<span class="badge-float">${prod.badge}</span>` : ''}
        <span class="stock-indicator">
          <span class="stock-dot"></span>
          ${prod.stock > 0 ? `${prod.stock} en stock` : 'Agotado'}
        </span>
      </div>
      <div class="product-info">
        <span class="product-category">${getCategoryLabel(prod.category)}</span>
        <h3 class="product-title">${prod.name}</h3>
        <p class="product-desc-snippet">${prod.description}</p>
        <div class="product-bottom-row">
          <div class="product-price">$${prod.price}<small>USD</small></div>
          <button class="btn-add-quick" onclick="event.stopPropagation(); addToCart('${prod.id}', 1)" title="Añadir al carrito" aria-label="Añadir rápido">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
      </div>
    </article>
  `).join('');
}

function getCategoryLabel(catKey) {
  const map = {
    'tecnologia': 'Tecnología',
    'moda': 'Moda & Estilo',
    'hogar': 'Hogar & Accesorios'
  };
  return map[catKey] || 'General';
}

// Configurar botones de categorías
function setupFilterEvents() {
  const buttons = document.querySelectorAll('.cat-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.getAttribute('data-cat') || 'all';
      renderCatalog();
    });
  });
}

// Configurar buscador en tiempo real
function setupSearchEvents() {
  const input = document.getElementById('searchInput');
  if (!input) return;

  input.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    renderCatalog();
  });
}

// Modal de detalle y galería
function openProductModal(productId) {
  const products = getStoredProducts();
  const product = products.find(p => p.id === productId);
  if (!product) return;

  currentModalProduct = product;
  currentModalQty = 1;
  selectedVariant = (product.variants && product.variants.length > 0) ? product.variants[0] : null;

  // Llenar contenido
  document.getElementById('modalCat').textContent = getCategoryLabel(product.category);
  document.getElementById('modalTitle').textContent = product.name;
  document.getElementById('modalPrice').textContent = `$${product.price} USD`;
  document.getElementById('modalDesc').textContent = product.description;
  document.getElementById('modalQty').textContent = '1';

  // Galería de imágenes
  const mainImg = document.getElementById('modalMainImg');
  const thumbsContainer = document.getElementById('modalThumbs');
  
  mainImg.src = product.images[0] || '';
  mainImg.alt = product.name;

  if (product.images.length > 1) {
    thumbsContainer.style.display = 'flex';
    thumbsContainer.innerHTML = product.images.map((imgUrl, idx) => `
      <div class="thumb-item ${idx === 0 ? 'active' : ''}" onclick="switchModalGalleryImage('${imgUrl}', this)">
        <img src="${imgUrl}" alt="Vista ${idx + 1}" loading="lazy">
      </div>
    `).join('');
  } else {
    thumbsContainer.style.display = 'none';
    thumbsContainer.innerHTML = '';
  }

  // Variantes / Opciones
  const variantsSection = document.getElementById('modalVariantsSection');
  const variantsList = document.getElementById('modalVariantsList');

  if (product.variants && product.variants.length > 0) {
    variantsSection.style.display = 'block';
    variantsList.innerHTML = product.variants.map((v, i) => `
      <button class="variant-btn ${i === 0 ? 'selected' : ''}" onclick="selectVariant('${v}', this)">${v}</button>
    `).join('');
  } else {
    variantsSection.style.display = 'none';
    variantsList.innerHTML = '';
  }

  const overlay = document.getElementById('productModalOverlay');
  if (overlay) overlay.classList.add('active');
}

function switchModalGalleryImage(url, thumbEl) {
  const mainImg = document.getElementById('modalMainImg');
  if (mainImg) mainImg.src = url;

  const thumbs = document.querySelectorAll('.thumb-item');
  thumbs.forEach(t => t.classList.remove('active'));
  if (thumbEl) thumbEl.classList.add('active');
}

function selectVariant(variantName, btnEl) {
  selectedVariant = variantName;
  const buttons = document.querySelectorAll('.variant-btn');
  buttons.forEach(b => b.classList.remove('selected'));
  if (btnEl) btnEl.classList.add('selected');
}

function changeModalQty(delta) {
  currentModalQty = Math.max(1, currentModalQty + delta);
  const qtyEl = document.getElementById('modalQty');
  if (qtyEl) qtyEl.textContent = currentModalQty;
}

function addCurrentModalToCart() {
  if (!currentModalProduct) return;
  addToCart(currentModalProduct.id, currentModalQty, selectedVariant);
  closeProductModal();
}

function closeProductModal() {
  const overlay = document.getElementById('productModalOverlay');
  if (overlay) overlay.classList.remove('active');
}

function setupModalEvents() {
  const overlay = document.getElementById('productModalOverlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeProductModal();
    });
  }

  // Tecla Escape para cerrar modales y cajón
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProductModal();
      closeCartDrawer();
    }
  });
}
