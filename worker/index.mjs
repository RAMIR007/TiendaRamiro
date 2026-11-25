const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_IMAGE_PATH = "/img/placeholder-800.webp";
const CACHE_SECONDS = 600;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function getPublicImage(images, origin) {
  const first = Array.isArray(images) ? images.find((item) => typeof item === "string" && item.trim()) : "";
  if (!first || /^data:/i.test(first)) return new URL(DEFAULT_IMAGE_PATH, origin).toString();

  try {
    const image = new URL(first.trim(), origin);
    if (image.protocol !== "https:" && image.protocol !== "http:") {
      return new URL(DEFAULT_IMAGE_PATH, origin).toString();
    }
    return image.toString();
  } catch {
    return new URL(DEFAULT_IMAGE_PATH, origin).toString();
  }
}

function renderProductPage(product, requestUrl) {
  const url = new URL(requestUrl);
  const productUrl = new URL(`/?product=${encodeURIComponent(product.id)}`, url.origin).toString();
  const shareUrl = new URL(`/share/${encodeURIComponent(product.id)}`, url.origin).toString();
  const title = cleanText(product.name, 120) || "Producto";
  const description = cleanText(product.description, 200) || `Descubre ${title} en RamiroX Market.`;
  const image = getPublicImage(product.images, url.origin);
  const safeTitle = escapeHtml(`${title} | RamiroX Market`);
  const safeDescription = escapeHtml(description);
  const safeImage = escapeHtml(image);
  const safeProductUrl = escapeHtml(productUrl);
  const safeShareUrl = escapeHtml(shareUrl);

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDescription}">
<link rel="canonical" href="${safeShareUrl}">
<meta property="og:type" content="product">
<meta property="og:site_name" content="RamiroX Market">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:url" content="${safeShareUrl}">
<meta property="og:image" content="${safeImage}">
<meta property="og:image:alt" content="${escapeHtml(title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${safeImage}">
<meta http-equiv="refresh" content="0;url=${safeProductUrl}">
<script>window.location.replace(${JSON.stringify(productUrl)});</script>
</head>
<body>
<p>Abriendo <a href="${safeProductUrl}">${escapeHtml(title)}</a> en RamiroX Market…</p>
</body>
</html>`;
}

function htmlResponse(body, status = 200, headOnly = false) {
  return new Response(headOnly ? null : body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": `public, max-age=300, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=300`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin"
    }
  });
}

async function getProduct(productId, env) {
  const baseUrl = String(env.SUPABASE_URL || "").replace(/\/$/, "");
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || "");
  if (!baseUrl || !publishableKey) throw new Error("Missing public catalog configuration");

  const endpoint = new URL(`${baseUrl}/rest/v1/products`);
  endpoint.searchParams.set("id", `eq.${productId}`);
  endpoint.searchParams.set("active", "eq.true");
  endpoint.searchParams.set("select", "id,name,description,images");
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint.toString(), {
    headers: { apikey: publishableKey, Accept: "application/json" },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);

  const rows = await response.json();
  return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/share/")) return env.ASSETS.fetch(request);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
    }

    const productId = url.pathname.slice("/share/".length);
    if (!PRODUCT_ID_PATTERN.test(productId)) {
      return new Response("Not Found", { status: 404 });
    }

    const cache = globalThis.caches?.default;
    const cacheKey = new Request(new URL(`/share/${productId}`, url.origin).toString(), { method: "GET" });
    if (cache) {
      const cached = await cache.match(cacheKey);
      if (cached) return request.method === "HEAD" ? new Response(null, cached) : cached;
    }

    try {
      const product = await getProduct(productId, env);
      if (!product) return new Response("Product not found", { status: 404 });

      const response = htmlResponse(renderProductPage(product, request.url), 200, request.method === "HEAD");
      if (cache && request.method === "GET") {
        const cacheCopy = htmlResponse(renderProductPage(product, request.url));
        ctx?.waitUntil?.(cache.put(cacheKey, cacheCopy));
      }
      return response;
    } catch {
      return new Response("Product preview temporarily unavailable", {
        status: 503,
        headers: { "Cache-Control": "no-store", "Retry-After": "60" }
      });
    }
  }
};

export { escapeHtml, getPublicImage, renderProductPage };
