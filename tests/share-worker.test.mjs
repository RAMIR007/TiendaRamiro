import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.mjs";

const productId = "123e4567-e89b-12d3-a456-426614174000";
const requestUrl = `https://shop.example/share/${productId}`;

function makeEnv(rows) {
  return {
    SUPABASE_URL: "https://project.example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "public-test-key",
    ASSETS: { fetch: async () => new Response("static asset") },
    rows
  };
}

test("product preview exposes escaped title, description and image without price or stock", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /select=id%2Cname%2Cdescription%2Cimages|select=id%2Cname%2Cdescription%2Cimages/);
    assert.equal(options.headers.apikey, "public-test-key");
    return Response.json([{
      id: productId,
      name: 'Silla <script>alert("x")</script>',
      description: "Silla moderna & cómoda",
      images: ["https://cdn.example/silla.webp"],
      price_cents: 2500,
      stock: 4
    }]);
  };

  try {
    const response = await worker.fetch(new Request(requestUrl), makeEnv());
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /og:title/);
    assert.match(html, /Silla &lt;script&gt;/);
    assert.match(html, /og:description/);
    assert.match(html, /https:\/\/cdn\.example\/silla\.webp/);
    assert.match(html, /\?product=123e4567-e89b-12d3-a456-426614174000/);
    assert.doesNotMatch(html, /2500|stock|price_cents/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invalid product ids are rejected without contacting Supabase", async () => {
  const response = await worker.fetch(
    new Request("https://shop.example/share/not-a-uuid"),
    makeEnv()
  );
  assert.equal(response.status, 404);
});

test("inactive or missing products are not exposed", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json([]);
  try {
    const response = await worker.fetch(new Request(requestUrl), makeEnv());
    assert.equal(response.status, 404);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("non-share requests continue to use static assets", async () => {
  const response = await worker.fetch(
    new Request("https://shop.example/css/store.css"),
    makeEnv()
  );
  assert.equal(await response.text(), "static asset");
});
