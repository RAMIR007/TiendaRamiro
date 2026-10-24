// js/config.js — Configuración única de la tienda.
// Este es el ÚNICO archivo que hay que editar para adaptar la tienda a un cliente:
// número de WhatsApp, moneda, categorías y textos. No tocar el resto del código.

const STORE_CONFIG = {
  brand: {
    name: 'RX Store Demo',
    tagline: 'Catálogo & Pedidos a WhatsApp',
    studio: 'RX Web Studio',
    studioWhatsApp: '5358382989'
  },

  // Número que recibe los pedidos. Formato internacional, sin "+" ni espacios.
  // Cuba: 53 + número (ej. 5358382989). Cambiar aquí y en ningún otro sitio.
  whatsappPhone: '5358382989',

  currency: 'USD',
  locale: 'es-ES',

  // true = muestra credenciales demo en el login y textos de demostración.
  // Poner en false antes de entregar a un cliente real.
  demoMode: true,

  // Categorías del catálogo. Agregar una aquí la hace aparecer en la tienda,
  // en el filtro y en el formulario del panel, sin tocar nada más.
  categories: [
    { key: 'tecnologia', label: 'Tecnología', emoji: '⚡' },
    { key: 'moda', label: 'Moda & Calzado', emoji: '👟' },
    { key: 'hogar', label: 'Hogar & Accesorios', emoji: '🏠' }
  ],

  checkout: {
    minNameLength: 3,
    minAddressLength: 5
  }
};

// Claves de almacenamiento. Cambiar el prefijo permite tener dos tiendas
// distintas en el mismo navegador sin que se pisen los datos.
const STORAGE_PREFIX = 'rx_store_';
const STORAGE_KEYS = {
  products: `${STORAGE_PREFIX}products`,
  cart: `${STORAGE_PREFIX}cart`,
  orders: `${STORAGE_PREFIX}orders`,
  audit: `${STORAGE_PREFIX}audit_logs`,
  users: `${STORAGE_PREFIX}admin_users`,
  session: `${STORAGE_PREFIX}admin_user`,
  schemaVersion: `${STORAGE_PREFIX}schema_version`
};

// Imagen de respaldo cuando un producto no tiene ninguna válida.
const PRODUCT_PLACEHOLDER_IMAGE =
  'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80';

// Etiqueta legible de una categoría a partir de su clave.
function getCategoryLabel(categoryKey) {
  const found = STORE_CONFIG.categories.find((category) => category.key === categoryKey);
  return found ? found.label : 'General';
}
