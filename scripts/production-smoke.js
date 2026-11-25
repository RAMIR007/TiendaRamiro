#!/usr/bin/env node
'use strict';

// Read-only production smoke checks. This script performs GET requests only.
const BASE_URL = (process.env.PRODUCTION_URL || 'https://tiendaramiro.ramiroxavier07.workers.dev').replace(/\/$/, '');
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 12000);

async function get(path) {
  const url = new URL(path, BASE_URL);
  const started = Date.now();
  const response = await fetch(url, {
    method: 'GET',
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { 'user-agent': 'RamiroX-Production-Smoke/1.0', 'cache-control': 'no-cache' }
  });
  return {
    path,
    status: response.status,
    ok: response.ok,
    contentType: response.headers.get('content-type') || '',
    finalUrl: response.url,
    elapsedMs: Date.now() - started,
    body: await response.text()
  };
}

function report(label, passed, detail) {
  console.log(`${passed ? 'PASS' : 'FAIL'} | ${label} | ${detail}`);
  if (!passed) process.exitCode = 1;
}

(async () => {
  console.log(`Production smoke test: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const routes = ['/', '/admin.html', '/reset-password.html', '/robots.txt', '/sitemap.xml'];
  const results = new Map();

  for (const path of routes) {
    try {
      const result = await get(path);
      results.set(path, result);
      report(path, result.ok, `HTTP ${result.status}; ${result.contentType || 'no content-type'}; ${result.elapsedMs} ms`);
    } catch (error) {
      report(path, false, error && error.message ? error.message : String(error));
    }
  }

  const home = results.get('/');
  if (!home || !home.ok) {
    report('storefront markup', false, 'Home page unavailable; markup assertions skipped');
    return;
  }

  const html = home.body;
  const assertions = [
    ['brand', /RamiroX Market/i.test(html)],
    ['catalog container', /id=["']productsGrid["']/.test(html)],
    ['search input', /id=["']searchInput["']/.test(html)],
    ['cart control', /data-action=["']open-cart["']/.test(html)],
    ['checkout form markup', /id=["']checkoutForm["']/.test(html)]
  ];
  for (const [name, passed] of assertions) report(`markup: ${name}`, passed, passed ? 'expected landmark present' : 'expected landmark missing');

  const assetPaths = new Set();
  const assetPattern = /(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi;
  let match;
  while ((match = assetPattern.exec(html)) !== null) {
    const raw = match[1];
    if (/^(?:https?:)?\/\//i.test(raw) || raw.startsWith('data:')) continue;
    const path = new URL(raw, BASE_URL + '/').pathname;
    assetPaths.add(path);
  }

  if (assetPaths.size === 0) {
    report('first-party assets', false, 'No local JS/CSS assets were discovered in home page markup');
  } else {
    for (const path of [...assetPaths].sort()) {
      try {
        const result = await get(path);
        const isExpectedType = /(?:javascript|ecmascript|text\/css)/i.test(result.contentType);
        report(`asset: ${path}`, result.ok && isExpectedType,
          `HTTP ${result.status}; ${result.contentType || 'no content-type'}; ${result.elapsedMs} ms`);
      } catch (error) {
        report(`asset: ${path}`, false, error && error.message ? error.message : String(error));
      }
    }
  }

  console.log('NOTE | This test verifies HTTP/static availability only; it does not test browser interactions, authentication, Supabase queries, checkout, WhatsApp or order creation.');
})().catch((error) => {
  console.error('Production smoke test failed unexpectedly:', error && error.message ? error.message : error);
  process.exitCode = 1;
});
