// scripts/build.js — Verificación previa al despliegue.
// No compila el sitio estático; valida también la entrada del Worker de previews.

const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

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

const missing = requiredFiles.filter((file) => !fs.existsSync(path.join(publicDir, file)));
const workerEntry = path.join(rootDir, 'worker', 'index.mjs');
const wranglerConfig = path.join(rootDir, 'wrangler.jsonc');

if (!fs.existsSync(workerEntry)) missing.push('worker/index.mjs');
if (!fs.existsSync(wranglerConfig)) missing.push('wrangler.jsonc');

if (missing.length > 0) {
  console.error('Faltan archivos necesarios para el despliegue:');
  missing.forEach((file) => console.error(`  - ${file}`));
  process.exit(1);
}

const config = fs.readFileSync(wranglerConfig, 'utf8');
if (!config.includes('"main": "./worker/index.mjs"')
  || !config.includes('"binding": "ASSETS"')
  || !config.includes('"/share/*"')) {
  console.error('La configuración de Wrangler no enruta /share/* al Worker.');
  process.exit(1);
}

console.log(`public/ listo para desplegar (${requiredFiles.length} archivos verificados); Worker de previews configurado.`);
