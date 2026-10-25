// scripts/build.js — Verificación previa al despliegue.
// No compila nada: el sitio es estático y vive en public/.
// Cloudflare ejecuta `npm run build` (si está configurado) y luego
// `npx wrangler deploy`, que publica únicamente la carpeta public/.

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

const requiredFiles = [
  'index.html',
  'admin.html',
  'reset-password.html',
  'robots.txt',
  '_headers',
  'css/store.css',
  'css/admin.css',
  'js/config.js',
  'js/utils.js',
  'js/supabase-config.js',
  'js/supabase.js',
  'js/data.js',
  'js/cart.js',
  'js/store.js',
  'js/admin.js',
  'js/reset-password.js',
  'img/placeholder-800.webp',
  'img/placeholder-400.webp',
  'img/products/p1-1-800.webp'
];

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(publicDir, file)));

if (missing.length > 0) {
  console.error('Faltan archivos de producción en public/:');
  missing.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
}

console.log(`public/ listo para desplegar (${requiredFiles.length} archivos verificados).`);
