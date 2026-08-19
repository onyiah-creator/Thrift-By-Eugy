/**
 * Thrift by Eugy — Cloudflare Worker: recommendations + event tracking
 *
 *   GET  /api/recommendations/similar/:sku
 *   GET  /api/recommendations/complete-the-look/:sku
 *   GET  /api/recommendations/for-you
 *   POST /api/events            (view / add-to-cart / purchase)
 *
 * The affinity model is rebuilt periodically and cached in KV rather than
 * recomputed per request — it changes slowly, and recommendation latency
 * sits directly in the shopper's page load.
 */

import {
  similarItems,
  completeTheLook,
  forYou,
  trending,
  buildAffinityModel,
} from "../src/recommender.js";

const AFFINITY_KEY = "affinity:model:v1";
const AFFINITY_TTL = 60 * 60; // rebuild hourly
const RECENT_VIEW_LIMIT = 20;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path.startsWith("/api/recommendations/similar/")) {
        return json(await handleSimilar(path.split("/").pop(), url, env));
      }
      if (path.startsWith("/api/recommendations/complete-the-look/")) {
        return json(await handleCompleteLook(path.split("/").pop(), url, env));
      }
      if (path === "/api/recommendations/for-you") {
        return json(await handleForYou(request, url, env));
      }
      if (path === "/api/events" && request.method === "POST") {
        return json(await handleEvent(request, env, ctx));
      }
    } catch (err) {
      // A failed recommendation must never break the product page.
      // Return an empty set and let the UI hide the section.
      console.error("recommendation error", err);
      return json({ items: [], error: "unavailable" });
    }

    return new Response("Not found", { status: 404 });
  },

  // Rebuild the affinity model on a schedule instead of on request.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(rebuildAffinity(env));
  },
};

// ---------------------------------------------------------------------------
// Catalogue access
// ---------------------------------------------------------------------------
async function loadCatalogue(env) {
  const { results } = await env.DB.prepare(
    `SELECT sku, name, category, price, size, condition_grade AS condition,
            color, description, quantity, status, created_at AS dateAdded
       FROM products
      WHERE status = 'active' AND quantity > 0`
  ).all();
  return results || [];
}

async function loadProduct(sku, env) {
  return await env.DB.prepare(
    `SELECT sku, name, category, price, size, condition_grade AS condition,
            color, description, quantity, status, created_at AS dateAdded
       FROM products WHERE sku = ?`
  )
    .bind(sku)
    .first();
}

// ---------------------------------------------------------------------------
// Affinity model, cached
// ---------------------------------------------------------------------------
async function getAffinityModel(env) {
  const cached = await env.KV.get(AFFINITY_KEY, "json");
  if (!cached) return null;

  // Rehydrate into the shape the recommender expects.
  return {
    totalEvents: cached.totalEvents,
    affinity(a, b) {
      if (!a || !b || a === b) return 0;
      return cached.pairs[`${a}|${b}`] || 0;
    },
  };
}

async function rebuildAffinity(env) {
  const { results } = await env.DB.prepare(
    `SELECT session_id AS sessionId, category
       FROM events
      WHERE created_at > datetime('now', '-30 days')
        AND category IS NOT NULL`
  ).all();

  const model = buildAffinityModel(results || []);

  // Precompute every category pair so the cached form needs no logic.
  const categories = [...new Set((results || []).map((r) => r.category))];
  const pairs = {};
  for (const a of categories) {
    for (const b of categories) {
      if (a === b) continue;
      const v = model.affinity(a, b);
      if (v > 0) pairs[`${a}|${b}`] = v;
    }
  }

  await env.KV.put(
    AFFINITY_KEY,
    JSON.stringify({ totalEvents: model.totalEvents, pairs }),
    { expirationTtl: AFFINITY_TTL * 3 }
  );
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function handleSimilar(sku, url, env) {
  const limit = clampLimit(url.searchParams.get("limit"), 6);
  const product = await loadProduct(sku, env);
  if (!product) return { items: [] };

  const [catalogue, model] = await Promise.all([loadCatalogue(env), getAffinityModel(env)]);
  return { items: similarItems(product, catalogue, { limit, model }) };
}

async function handleCompleteLook(sku, url, env) {
  const limit = clampLimit(url.searchParams.get("limit"), 4);
  const product = await loadProduct(sku, env);
  if (!product) return { items: [] };

  const catalogue = await loadCatalogue(env);
  return { items: completeTheLook(product, catalogue, { limit }) };
}

async function handleForYou(request, url, env) {
  const limit = clampLimit(url.searchParams.get("limit"), 12);
  const sessionId = getSessionId(request);
  const catalogue = await loadCatalogue(env);

  if (!sessionId) return { items: trending(catalogue, { limit }), basis: "trending" };

  const recentSkus = (await env.KV.get(`recent:${sessionId}`, "json")) || [];
  const viewed = recentSkus
    .map((s) => catalogue.find((p) => p.sku === s))
    .filter(Boolean);

  const model = await getAffinityModel(env);
  return {
    items: forYou(viewed, catalogue, { limit, model }),
    basis: viewed.length ? "history" : "trending",
  };
}

async function handleEvent(request, env, ctx) {
  const body = await request.json();
  const { type, sku, category } = body;

  if (!["view", "add_to_cart", "purchase"].includes(type)) {
    return { ok: false, error: "unknown event type" };
  }

  const sessionId = getSessionId(request);
  if (!sessionId) return { ok: false, error: "no session" };

  // Persist for the affinity model.
  ctx.waitUntil(
    env.DB.prepare(
      `INSERT INTO events (session_id, sku, category, type, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    )
      .bind(sessionId, sku || null, category || null, type)
      .run()
  );

  // Maintain a short recently-viewed list for the personalised feed.
  if (type === "view" && sku) {
    ctx.waitUntil(
      (async () => {
        const key = `recent:${sessionId}`;
        const list = (await env.KV.get(key, "json")) || [];
        const next = [sku, ...list.filter((s) => s !== sku)].slice(0, RECENT_VIEW_LIMIT);
        await env.KV.put(key, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 30 });
      })()
    );
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSessionId(request) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/tbe_session=([^;]+)/);
  return match ? match[1] : null;
}

function clampLimit(raw, fallback) {
  const n = parseInt(raw || "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), 24);
}

function json(body) {
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, max-age=60",
    },
  });
}
