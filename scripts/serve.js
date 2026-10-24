// scripts/serve.js — Servidor estático mínimo para probar la tienda en la LAN.
// Uso: node scripts/serve.js   (o PORT=9000 node scripts/serve.js)
// No requiere dependencias. Solo para desarrollo/demostración.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const root = path.join(__dirname, '..');
const port = Number(process.env.PORT) || 8080;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const server = http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);

  // Evita salir de la carpeta del proyecto.
  if (!filePath.startsWith(root + path.sep)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Prohibido');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('No encontrado');
      return;
    }

    response.writeHead(200, {
      'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    response.end(content);
  });
});

function localAddresses() {
  const addresses = [];
  Object.values(os.networkInterfaces()).forEach((entries) => {
    (entries || []).forEach((entry) => {
      if (entry.family === 'IPv4' && !entry.internal) addresses.push(entry.address);
    });
  });
  return addresses;
}

server.listen(port, '0.0.0.0', () => {
  console.log(`\nTienda disponible en:`);
  console.log(`  Local:  http://localhost:${port}/`);
  localAddresses().forEach((address) => {
    console.log(`  LAN:    http://${address}:${port}/   (para probar desde el móvil)`);
  });
  console.log('\nCtrl+C para detener.\n');
});
