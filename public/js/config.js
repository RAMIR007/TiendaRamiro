// js/config.js — Configuración única de la tienda.
// Este es el ÚNICO archivo que hay que editar para adaptar la tienda a un cliente:
// número de WhatsApp, moneda, categorías y textos.

const STORE_CONFIG = {
  brand: {
    name: 'RamiroX Market',
    tagline: 'Tecnología · Moda · Hogar — Pedidos por WhatsApp',
    studio: 'RX Web Studio',
    studioWhatsApp: '5358382989'
  },

  // Número que recibe los pedidos. Formato internacional, sin "+" ni espacios.
  // Cuba: 53 + número (ej. 5358382989).
  whatsappPhone: '5358382989',

  // Gestor que firma los vales (válido para las dinámicas de recolección/venta
  // cuyas comisiones van a la cuenta del vendedor asociado). Sale impreso en el vale.
  gestor: {
    name: 'Ramiro',
    phone: '5358382989'
  },

  // Precio del servicio de mensajería (en USD) — sale en el vale de mensajería.
  deliveryPrice: 2,

  currency: 'USD',
  locale: 'es-ES',

  // Categorías del catálogo. Agregar una aquí la hace aparecer en la tienda,
  // en el filtro y en el formulario del panel, sin tocar nada más.
  categories: [
    { key: 'tecnologia', label: 'Tecnología', emoji: '⚡' },
    { key: 'moda', label: 'Moda & Calzado', emoji: '👟' },
    { key: 'hogar', label: 'Hogar & Accesorios', emoji: '🏠' }
  ],

  checkout: {
    minNameLength: 3,
    minAddressLength: 5,
    minPhoneDigits: 8,
    maxPhoneDigits: 15
  }
};

// Claves de caché local. Los datos reales viven en Supabase; localStorage
// solo guarda el catálogo para que la primera pintura sea instantánea.
const STORAGE_KEYS = {
  products: 'rx_store_products',
  cart: 'rx_store_cart',
  sellerCode: 'rx_seller_code'
};

// Imagen de respaldo cuando un producto no tiene ninguna válida.
const PRODUCT_PLACEHOLDER_IMAGE = '/img/placeholder-800.webp';

// Etiqueta legible de una categoría a partir de su clave.
function getCategoryLabel(categoryKey) {
  const found = STORE_CONFIG.categories.find((category) => category.key === categoryKey);
  return found ? found.label : 'General';
}
