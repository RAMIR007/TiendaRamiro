-- ============================================================================
-- Tienda Ramiro — datos de demostración (8 productos)
-- Ejecutar SOLO la primera vez, después de la migración.
-- Si borras un producto y vuelves a ejecutar este archivo, reaparecerá.
-- ============================================================================
-- ---------------------------------------------------------------------------
-- 7. Datos iniciales (los mismos 8 productos de la demo)
-- ---------------------------------------------------------------------------

insert into public.products
  (id, name, category, price_cents, stock, badge, description, images, variants)
values
  (
    '00000000-0000-0000-0000-000000000001',
    'Auriculares Inalámbricos TWS Pro', 'tecnologia', 2800, 12, 'Más vendido',
    'Auriculares bluetooth 5.3 con cancelación de ruido ambiental (ENC), estuche con pantalla LED indicadora de batería y hasta 24h de reproducción combinada.',
    array[
      '/img/products/p1-1-800.webp',
      '/img/products/p1-2-800.webp',
      '/img/products/p1-3-800.webp'
    ],
    array['Negro Mate', 'Blanco Glaciar']
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    'Smartwatch Deportivo Ultra Fit', 'tecnologia', 4500, 8, 'Nuevo',
    'Reloj inteligente con monitor de ritmo cardíaco, oxímetro SpO2, seguimiento de más de 30 deportes, notificaciones de llamadas/WhatsApp y batería de 7 días.',
    array[
      '/img/products/p2-1-800.webp',
      '/img/products/p2-2-800.webp'
    ],
    array['Correa Negra', 'Correa Naranja Deportivo']
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    'Power Bank Magnético 10000mAh', 'tecnologia', 3200, 15, 'Esencial',
    'Batería portátil compacta con carga rápida PD 20W e imán MagSafe compatible con iPhone y dispositivos Qi. Diseño ultrafino ideal para llevar a diario.',
    array['/img/products/p3-1-800.webp'],
    array['Gris Titanio', 'Azul Noche']
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    'Camiseta Oversize Algodón Premium', 'moda', 2000, 25, 'Tendencia',
    'Camiseta de corte oversized confeccionada en 100% algodón peinado pesado (240 GSM). Tejido fresco, cuello reforzado y costuras de alta durabilidad.',
    array[
      '/img/products/p4-1-800.webp',
      '/img/products/p4-2-800.webp'
    ],
    array['S - Negro', 'M - Negro', 'L - Negro', 'M - Blanco Crema', 'L - Blanco Crema']
  ),
  (
    '00000000-0000-0000-0000-000000000005',
    'Zapatillas Urbanas Minimalist Low', 'moda', 5500, 6, 'Exclusivo',
    'Calzado casual versátil con plantilla ergonómica de memoria, suela de caucho antideslizante y acabado exterior resistente a la suciedad.',
    array[
      '/img/products/p5-1-800.webp',
      '/img/products/p5-2-800.webp'
    ],
    array['Talla 40', 'Talla 41', 'Talla 42', 'Talla 43', 'Talla 44']
  ),
  (
    '00000000-0000-0000-0000-000000000006',
    'Gorra Clásica Streetwear Bordada', 'moda', 1600, 18, null,
    'Gorra estructurada de 6 paneles en dril de algodón con hebilla de ajuste metálica trasera y bordado frontal en relieve de alta definición.',
    array['/img/products/p6-1-800.webp'],
    array['Negro', 'Verde Militar', 'Beige Arena']
  ),
  (
    '00000000-0000-0000-0000-000000000007',
    'Botella Térmica Inox Doble Pared 750ml', 'hogar', 2200, 20, 'Eco Friendly',
    'Termo de acero inoxidable grado alimenticio 18/8. Mantiene bebidas frías por 24h o calientes por 12h. Libre de BPA y a prueba de fugas.',
    array['/img/products/p7-1-800.webp'],
    array['Negro Mate', 'Azul Pastel', 'Acero Pulido']
  ),
  (
    '00000000-0000-0000-0000-000000000008',
    'Lámpara de Escritorio LED Minimal', 'hogar', 3000, 10, null,
    'Lámpara recargable touch con cuello flexible 360°, 3 tonos de luz (cálida, neutra, fría) y dimmer de brillo continuo. Ideal para lectura y trabajo nocturno.',
    array['/img/products/p8-1-800.webp'],
    array['Blanco Nórdico', 'Negro Ébano']
  )
on conflict (id) do nothing;

