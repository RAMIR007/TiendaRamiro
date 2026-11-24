// Verifica los activos estáticos y genera HTML inicial con catálogo público.
// El prerender consulta únicamente productos/categorías públicos con la clave publishable.

const fs = require('fs');
const path = require('path');
const { prerenderCatalog } = require('./prerender-catalog');

const publicDir = path.join(__dirname, '..', 'public');
const requiredFiles = [
  'index.html',
  'admin.html',
  'reset-password.html',
  'robots.txt',
  'sitemap.xml',
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

async function main() {
  const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(publicDir, file)));
  if (missing.length > 0) {
    throw new Error('Faltan archivos de producción en public/:\n  - ' + missing.join('\n  - '));
  }

  const result = await prerenderCatalog(publicDir);
  console.log('public/ listo: ' + requiredFiles.length + ' archivos, ' +
    result.products + ' productos y ' + result.categories + ' categorías prerenderizados.');
}

main().catch((error) => {
  console.error('[build]', error.message || error);
  process.exitCode = 1;
});
