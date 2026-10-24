// tests/utils.test.js — Pruebas sin dependencias: `node tests/utils.test.js`
// Verifica hashing (incluido el respaldo JS), escape de HTML, dinero y storage.

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const source = ['public/js/config.js', 'public/js/utils.js']
  .map((file) => fs.readFileSync(path.join(root, file), 'utf8'))
  .join('\n');

// localStorage mínimo para probar la capa de almacenamiento.
const memory = new Map();
global.localStorage = {
  getItem: (key) => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key),
  clear: () => memory.clear()
};

const api = new Function(
  `${source}
  return {
    sha256Hex, sha256Fallback, escapeHtml, isSafeImageUrl,
    toCents, roundMoney, formatMoney, formatCents,
    storeRead, storeWrite, storeRemove, pushAudit, STORE_CONFIG, STORAGE_KEYS
  };`
)();

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n       ${error.message}`);
    process.exitCode = 1;
  }
}

function referenceSha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

const vectors = [
  '',
  'abc',
  'admin123',
  'ventas123',
  'contraseña con ñ, áéíóú y €',
  'x'.repeat(55),
  'x'.repeat(56),
  'x'.repeat(64),
  'x'.repeat(1000)
];

console.log('\nSHA-256');
vectors.forEach((text) => {
  const label = text.length > 20 ? `${text.slice(0, 12)}… (${text.length} chars)` : JSON.stringify(text);
  check(`respaldo JS coincide con Node: ${label}`, () => {
    const bytes = new TextEncoder().encode(text);
    assert.strictEqual(api.sha256Fallback(bytes), referenceSha256(text));
  });
});

console.log('\nEscape de HTML');
check('neutraliza etiquetas y comillas', () => {
  const input = `<img src=x onerror="alert('xss')">&`;
  const output = api.escapeHtml(input);
  assert.ok(!output.includes('<'));
  assert.ok(!output.includes('>'));
  assert.ok(output.includes('&lt;img'));
  assert.ok(output.includes('&#39;xss&#39;'));
});
check('conserva acentos y emoji', () => {
  assert.strictEqual(api.escapeHtml('Auricular ñandú 🔊'), 'Auricular ñandú 🔊');
});
check('null y undefined producen cadena vacía', () => {
  assert.strictEqual(api.escapeHtml(null), '');
  assert.strictEqual(api.escapeHtml(undefined), '');
});
check('solo acepta URLs http(s) y data:image', () => {
  assert.strictEqual(api.isSafeImageUrl('https://cdn.com/a.jpg'), true);
  assert.strictEqual(api.isSafeImageUrl('data:image/png;base64,AAA'), true);
  assert.strictEqual(api.isSafeImageUrl('javascript:alert(1)'), false);
  assert.strictEqual(api.isSafeImageUrl(''), false);
});

console.log('\nDinero');
check('toCents redondea sin errores de coma flotante', () => {
  assert.strictEqual(api.toCents(0.1 + 0.2), 30);
  assert.strictEqual(api.toCents(28.999), 2900);
  assert.strictEqual(api.toCents('45'), 4500);
  assert.strictEqual(api.toCents('basura'), 0);
  assert.strictEqual(api.toCents(Infinity), 0);
});
check('formatCents no muestra colas flotantes', () => {
  assert.strictEqual(api.formatCents(3219999), '$32,199.99 USD');
  assert.strictEqual(api.formatCents(2800), '$28 USD');
  assert.strictEqual(api.formatCents(2850), '$28.50 USD');
});
check('formatMoney acepta unidades', () => {
  assert.strictEqual(api.formatMoney(28.5), '$28.50 USD');
});

console.log('\nStorage');
check('lee valores y aplica fallback', () => {
  api.storeWrite('test_key', { a: 1 });
  assert.deepStrictEqual(api.storeRead('test_key', null), { a: 1 });
  assert.strictEqual(api.storeRead('no_existe', 'defecto'), 'defecto');
});
check('sobrevive a JSON corrupto', () => {
  localStorage.setItem('test_broken', '{no-json');
  assert.deepStrictEqual(api.storeRead('test_broken', []), []);
});
check('storeWrite informa fallo de cuota', () => {
  const original = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  assert.strictEqual(api.storeWrite('test_quota', 'x'), false);
  localStorage.setItem = original;
});

console.log('\nAuditoría');
check('ordena del más reciente al más antiguo y limita a 150', () => {
  localStorage.removeItem(api.STORAGE_KEYS.audit);
  for (let i = 0; i < 200; i += 1) api.pushAudit('prueba', `evento ${i}`);
  const logs = api.storeRead(api.STORAGE_KEYS.audit, []);
  assert.strictEqual(logs.length, 150);
  assert.strictEqual(logs[0].action, 'evento 199');
});

(async () => {
  const digest = await api.sha256Hex('admin123');
  assert.strictEqual(digest, '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9');
  const fallbackDigest = await api.sha256Hex('ñandú');
  assert.strictEqual(fallbackDigest, referenceSha256('ñandú'));
  passed += 1;
  console.log('  ok  sha256Hex usa Web Crypto y coincide con los hashes del panel');

  console.log(`\n${passed} comprobaciones OK${process.exitCode ? ' (con fallos)' : ''}\n`);
})();
