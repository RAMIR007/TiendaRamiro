// tests/network-timeout.test.js — límites de espera de las peticiones HTTP a Supabase.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'public/js/supabase.js'), 'utf8');
const config = { url: 'https://example.supabase.co', publishableKey: 'test-public-key' };

function createApi(fetchImpl) {
  return new Function('SUPABASE_CONFIG', 'fetch', `${source}
    return { supabaseRequest, SupabaseError };
  `)(config, fetchImpl);
}

async function run() {
  let aborted = false;
  const pending = createApi((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      aborted = true;
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  }));

  await assert.rejects(
    pending.supabaseRequest('/rest/v1/products', { timeoutMs: 1000 }),
    (error) => error instanceof pending.SupabaseError
      && error.status === 0
      && /tardando demasiado/i.test(error.message)
  );
  assert.strictEqual(aborted, true, 'la petición pendiente debe cancelarse');

  const success = createApi(async (_url, options) => {
    assert.ok(options.signal, 'la petición debe recibir AbortSignal');
    return { ok: true, status: 200, text: async () => '[{"id":"ok"}]' };
  });
  const data = await success.supabaseRequest('/rest/v1/products', { timeoutMs: 1000 });
  assert.deepStrictEqual(data, [{ id: 'ok' }]);

  const serverError = createApi(async () => ({
    ok: false,
    status: 503,
    text: async () => JSON.stringify({ message: 'Servicio temporalmente no disponible' })
  }));
  await assert.rejects(
    serverError.supabaseRequest('/rest/v1/products', { timeoutMs: 1000 }),
    (error) => error.status === 503 && /Servicio temporalmente no disponible/.test(error.message)
  );

  console.log('3 comprobaciones de tiempo de espera y errores HTTP OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
