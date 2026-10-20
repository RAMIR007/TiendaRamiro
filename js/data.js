// js/data.js
const INITIAL_PRODUCTS = [
  {
    "id": "prod-1",
    "name": "Auriculares Inalámbricos TWS Pro",
    "category": "tecnologia",
    "price": 28,
    "stock": 12,
    "badge": "Más vendido",
    "description": "Auriculares bluetooth 5.3 con cancelación de ruido ambiental (ENC), estuche con pantalla LED indicadora de batería y hasta 24h de reproducción combinada.",
    "images": [
      "https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1606220588913-b3aacb4d2f46?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800&auto=format&fit=crop&q=80"
    ],
    "variants": ["Negro Mate", "Blanco Glaciar"]
  },
  {
    "id": "prod-2",
    "name": "Smartwatch Deportivo Ultra Fit",
    "category": "tecnologia",
    "price": 45,
    "stock": 8,
    "badge": "Nuevo",
    "description": "Reloj inteligente con monitor de ritmo cardíaco, oxímetro SpO2, seguimiento de más de 30 deportes, notificaciones de llamadas/WhatsApp y batería de 7 días.",
    "images": [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?w=800&auto=format&fit=crop&q=80"
    ],
    "variants": ["Correa Negra", "Correa Naranja Deportivo"]
  },
  {
    "id": "prod-3",
    "name": "Power Bank Magnético 10000mAh",
    "category": "tecnologia",
    "price": 32,
    "stock": 15,
    "badge": "Esencial",
    "description": "Batería portátil compacta con carga rápida PD 20W e imán MagSafe compatible con iPhone y dispositivos Qi. Diseño ultrafino ideal para llevar a diario.",
    "images": [
      "https://images.unsplash.com/photo-1609091839311-d5365f9ff1c5?w=800&auto=format&fit=crop&q=80"
    ],
    "variants": ["Gris Titanio", "Azul Noche"]
  },
  {
    "id": "prod-4",
    "name": "Camiseta Oversize Algodón Premium",
    "category": "moda",
    "price": 20,
    "stock": 25,
    "badge": "Tendencia",
    "description": "Camiseta de corte oversized confeccionada en 100% algodón peinado pesado (240 GSM). Tejido fresco, cuello reforzado y costuras de alta durabilidad.",
    "images": [
      "https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=800&auto=format&fit=crop&q=80"
    ],
    "variants": ["S - Negro", "M - Negro", "L - Negro", "M - Blanco Crema", "L - Blanco Crema"]
  },
  {
    "id": "prod-5",
    "name": "Zapatillas Urbanas Minimalist Low",
    "category": "moda",
    "price": 55,
    "stock": 6,
    "badge": "Exclusivo",
    "description": "Calzado casual versátil con plantilla ergonómica de memoria, suela de caucho antideslizante y acabado exterior resistente a la suciedad.",
    "images": [
      "https://images.unsplash.com/photo-1549298916-b41d501d3772?w=800&auto=format&fit=crop&q=80",
      "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?w=800&auto=format&fit=crop&q=80"
    ],
    "variants": ["Talla 40", "Talla 41", "Talla 42", "Talla 43", "Talla 44"]
  },
  {
    "id": "prod-6",
    "name": "Gorra Clásica Streetwear Bordada",
    "category": "moda",
    "price": 16,
    "stock": 18,
    "badge": null,
    "description": "Gorra estructurada de 6 paneles en dril de algodón con hebilla de ajuste metálica trasera y bordado frontal en relieve de alta definición.",
    "images": [
      "https://images.unsplash.com/photo-1588850561407-ed78c282e89b?w=800&auto=format&fit=crop&q=80"
    ],
    "variants": ["Negro", "Verde Militar", "Beige Arena"]
  },
  {
    "id": "prod-7",
    "name": "Botella Térmica Inox Doble Pared 750ml",
    "category": "hogar",
    "price": 22,
    "stock": 20,
    "badge": "Eco Friendly",
    "description": "Termo de acero inoxidable grado alimenticio 18/8. Mantiene bebidas frías por 24h o calientes por 12h. Libre de BPA y a prueba de fugas.",
    "images": [
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&auto=format&fit=crop&q=80"
    ],
    "variants": ["Negro Mate", "Azul Pastel", "Acero Pulido"]
  },
  {
    "id": "prod-8",
    "name": "Lámpara de Escritorio LED Minimal",
    "category": "hogar",
    "price": 30,
    "stock": 10,
    "badge": null,
    "description": "Lámpara recargable touch con cuello flexible 360°, 3 tonos de luz (cálida, neutra, fría) y dimmer de brillo continuo. Ideal para lectura y trabajo nocturno.",
    "images": [
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?w=800&auto=format&fit=crop&q=80"
    ],
    "variants": ["Blanco Nórdico", "Negro Ébano"]
  }
];

// Helper para obtener productos (desde localStorage o semilla)
function getStoredProducts() {
  const saved = localStorage.getItem('rx_store_products');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch (e) {
      console.error('Error parseando productos de localStorage', e);
    }
  }
  localStorage.setItem('rx_store_products', JSON.stringify(INITIAL_PRODUCTS));
  return INITIAL_PRODUCTS;
}

function saveProducts(products) {
  localStorage.setItem('rx_store_products', JSON.stringify(products));
}
