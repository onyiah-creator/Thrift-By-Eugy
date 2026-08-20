/**
 * Thrift by Eugy — Cloudflare Worker: checkout, inventory locking, Paystack
 *
 *   POST /api/checkout/reserve   claim items, create a pending order, get a
 *                                Paystack authorization URL
 *   POST /api/checkout/webhook   Paystack calls this; the only place an order
 *                                is marked paid
 *   GET  /api/checkout/status    poll order state from the success page
 *   POST /api/checkout/release   shopper abandoned payment, free the items
 *
 * THE CORE PROBLEM
 * Every product has quantity 1. Two shoppers can hold the same item in their
 * bag simultaneously; only one can buy it. Getting this wrong means charging
 * two people for one garment.
 *
 * The fix is never to read-then-write. A check like
 *     SELECT quantity FROM products WHERE sku = ?      // 1, looks fine
 *     UPDATE products SET quantity = 0 WHERE sku = ?   // both succeed
 * loses the race silently: both requests read 1, both write 0, both proceed.
 *
 * Instead every claim is a single conditional UPDATE whose WHERE clause
 * contains the condition, and we trust meta.changes to tell us whether we
 * actually won. Exactly one caller can get changes === 1.
 *
 * Secrets (wrangler secret put):
 *   PAYSTACK_SECRET_KEY
 * Bindings: DB (D1)
 */

const RESERVATION_MINUTES = 15;
const PAYSTACK_API = "https://api.paystack.co";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), env);

    try {
      if (path === "/api/checkout/reserve" && request.method === "POST") {
        return cors(await handleReserve(request, env), env);
      }
      if (path === "/api/checkout/webhook" && request.method === "POST") {
        // Never CORS-wrapped: this is server-to-server from Paystack.
        return await handleWebhook(request, env, ctx);
      }
      if (path === "/api/checkout/status") {
        return cors(await handleStatus(url, env), env);
      }
      if (path === "/api/checkout/release" && request.method === "POST") {
        return cors(await handleRelease(request, env), env);
      }
    } catch (err) {
      console.error("checkout error", err);
      return cors(json({ error: "Something went wrong. No payment was taken." }, 500), env);
    }

    return new Response("Not found", { status: 404 });
  },

  // Cron: sweep expired reservations so abandoned carts don't lock stock out
  // of the catalogue (and out of the Merchant Center feed) forever.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sweepExpiredReservations(env));
  },
};

// ---------------------------------------------------------------------------
// Reserve — the race-critical path
// ---------------------------------------------------------------------------
async function handleReserve(request, env) {
  const body = await request.json();
  const { items, email, phone, fullName, address, city } = body;
  const sessionId = getSessionId(request) || crypto.randomUUID();

  if (!Array.isArray(items) || items.length === 0) {
    return json({ error: "Your bag is empty." }, 400);
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: "A valid email is required for your receipt." }, 400);
  }
  if (!fullName || !phone || !address) {
    return json({ error: "Name, phone and delivery address are required." }, 400);
  }

  const skus = [...new Set(items.map((i) => String(i.sku)))];
  const orderId = makeOrderId();
  const expiresAt = new Date(Date.now() + RESERVATION_MINUTES * 60_000).toISOString();

  // --- Claim each item atomically -----------------------------------------
  // The WHERE clause carries every condition. If another shopper already
  // holds the item, changes === 0 and we know we lost — no ambiguity, no
  // second query, no window between check and claim.
  const claimed = [];
  const unavailable = [];

  for (const sku of skus) {
    const res = await env.DB.prepare(
      `UPDATE products
          SET reserved_by = ?, reserved_until = ?, updated_at = datetime('now')
        WHERE sku = ?
          AND status = 'active'
          AND quantity > 0
          AND (reserved_until IS NULL
               OR reserved_until < datetime('now')
               OR reserved_by = ?)`
    )
      .bind(sessionId, expiresAt, sku, sessionId)
      .run();

    if (res.meta.changes === 1) claimed.push(sku);
    else unavailable.push(sku);
  }

  // Partial failure: release what we took. Charging for some of a bag and
  // silently dropping the rest is worse than failing the whole checkout.
  if (unavailable.length > 0) {
    await releaseSkus(env, claimed, sessionId);
    const names = await lookupNames(env, unavailable);
    return json(
      {
        error: "some_items_gone",
        message:
          names.length === 1
            ? `${names[0]} was just bought by someone else. One-of-one pieces go to whoever checks out first.`
            : `${names.length} items in your bag were just bought by someone else.`,
        unavailable,
        unavailableNames: names,
      },
      409
    );
  }

  // --- Price server-side --------------------------------------------------
  // Never trust prices from the client. Read them from the database.
  const priced = await env.DB.prepare(
    `SELECT sku, name, price, size FROM products WHERE sku IN (${skus.map(() => "?").join(",")})`
  )
    .bind(...skus)
    .all();

  const rows = priced.results || [];
  const amountNaira = rows.reduce((sum, r) => sum + Number(r.price), 0);

  if (amountNaira <= 0) {
    await releaseSkus(env, claimed, sessionId);
    return json({ error: "Could not price this order." }, 400);
  }

  // --- Persist the pending order ------------------------------------------
  const statements = [
    env.DB.prepare(
      `INSERT INTO orders (id, session_id, email, phone, full_name, address, city,
                           amount, currency, status, paystack_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NGN', 'pending', ?)`
    ).bind(orderId, sessionId, email, phone, fullName, address, city || null, amountNaira, orderId),
    ...rows.map((r) =>
      env.DB.prepare(
        `INSERT INTO order_items (order_id, sku, name, price, size) VALUES (?, ?, ?, ?, ?)`
      ).bind(orderId, r.sku, r.name, r.price, r.size)
    ),
  ];
  await env.DB.batch(statements);

  // --- Initialise the Paystack transaction --------------------------------
  // Amount goes in kobo: naira * 100.
  const init = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: amountNaira * 100,
      currency: "NGN",
      reference: orderId,
      callback_url: `${env.SITE_ORIGIN}/order/${orderId}`,
      metadata: {
        order_id: orderId,
        custom_fields: [
          { display_name: "Delivery", variable_name: "delivery", value: `${address}, ${city || ""}` },
        ],
      },
    }),
  });

  const initData = await init.json();
  if (!init.ok || !initData.status) {
    // Payment couldn't even start — don't leave stock locked.
    await releaseSkus(env, claimed, sessionId);
    await env.DB.prepare(`UPDATE orders SET status = 'failed' WHERE id = ?`).bind(orderId).run();
    return json({ error: "Could not start payment. Please try again." }, 502);
  }

  return json({
    ok: true,
    orderId,
    sessionId,
    amount: amountNaira,
    expiresAt,
    authorizationUrl: initData.data.authorization_url,
    accessCode: initData.data.access_code,
  });
}

// ---------------------------------------------------------------------------
// Webhook — the ONLY place an order becomes paid
// ---------------------------------------------------------------------------
async function handleWebhook(request, env, ctx) {
  // Read the body ONCE as raw text. Signature is computed over these exact
  // bytes — re-serialising parsed JSON can reorder keys or change spacing and
  // will fail verification for reasons that look mysterious.
  const raw = await request.text();
  const signature = request.headers.get("x-paystack-signature") || "";

  const valid = await verifySignature(raw, signature, env.PAYSTACK_SECRET_KEY);
  if (!valid) {
    console.warn("webhook signature rejected");
    return new Response("Invalid signature", { status: 401 });
  }

  const event = JSON.parse(raw);
  const eventId = `${event.event}:${event.data?.id ?? event.data?.reference}`;

  // Idempotency. Paystack retries for up to 72 hours, so duplicates are
  // routine. The PK constraint is the guard: if the insert fails, we've
  // already handled this event and must not apply it twice.
  try {
    await env.DB.prepare(
      `INSERT INTO webhook_events (id, event, reference, payload) VALUES (?, ?, ?, ?)`
    )
      .bind(eventId, event.event, event.data?.reference || null, raw.slice(0, 10000))
      .run();
  } catch {
    return new Response("Already processed", { status: 200 });
  }

  // Acknowledge fast — Paystack expects a 200 within 30s and will retry
  // otherwise. Do the work after responding.
  ctx.waitUntil(processEvent(event, env));
  return new Response("OK", { status: 200 });
}

async function processEvent(event, env) {
  if (event.event !== "charge.success") return;

  const reference = event.data.reference;

  // Verify independently before granting value. The webhook says paid; this
  // confirms it against Paystack directly, so a forged or replayed payload
  // can't complete an order on its own.
  const verify = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
  });
  const v = await verify.json();

  if (!verify.ok || !v.status || v.data.status !== "success") {
    console.warn("verify failed for", reference);
    return;
  }

  const order = await env.DB.prepare(
    `SELECT id, amount, status, session_id FROM orders WHERE id = ?`
  )
    .bind(reference)
    .first();

  if (!order) return;
  if (order.status === "paid") return; // already settled

  // Confirm the amount actually paid matches what we asked for, in kobo.
  const expectedKobo = Number(order.amount) * 100;
  if (Number(v.data.amount) !== expectedKobo) {
    console.error("amount mismatch", reference, v.data.amount, expectedKobo);
    await env.DB.prepare(`UPDATE orders SET status = 'failed' WHERE id = ?`).bind(reference).run();
    return;
  }

  const items = await env.DB.prepare(`SELECT sku FROM order_items WHERE order_id = ?`)
    .bind(reference)
    .all();

  // Mark paid and sell the stock in one atomic batch. Decrementing quantity
  // is what removes the item from the storefront AND from the Merchant Center
  // feed — the step that stops us advertising something already sold.
  const statements = [
    env.DB.prepare(
      `UPDATE orders
          SET status = 'paid', paystack_id = ?, paid_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ?`
    ).bind(String(v.data.id), reference),
    ...(items.results || []).map((it) =>
      env.DB.prepare(
        `UPDATE products
            SET quantity = 0, status = 'sold', reserved_by = NULL, reserved_until = NULL,
                updated_at = datetime('now')
          WHERE sku = ?`
      ).bind(it.sku)
    ),
    ...(items.results || []).map((it) =>
      env.DB.prepare(
        `INSERT INTO events (session_id, sku, type) VALUES (?, ?, 'purchase')`
      ).bind(order.session_id || "unknown", it.sku)
    ),
  ];

  await env.DB.batch(statements);
}

// ---------------------------------------------------------------------------
// Status / release / sweep
// ---------------------------------------------------------------------------
async function handleStatus(url, env) {
  const orderId = url.searchParams.get("order");
  if (!orderId) return json({ error: "Missing order id" }, 400);

  const order = await env.DB.prepare(
    `SELECT id, status, amount, email, full_name, created_at, paid_at FROM orders WHERE id = ?`
  )
    .bind(orderId)
    .first();

  if (!order) return json({ error: "Order not found" }, 404);

  const items = await env.DB.prepare(
    `SELECT sku, name, price, size FROM order_items WHERE order_id = ?`
  )
    .bind(orderId)
    .all();

  return json({ order, items: items.results || [] });
}

async function handleRelease(request, env) {
  const { orderId } = await request.json();
  const sessionId = getSessionId(request);
  if (!orderId) return json({ error: "Missing order id" }, 400);

  const order = await env.DB.prepare(`SELECT id, status, session_id FROM orders WHERE id = ?`)
    .bind(orderId)
    .first();

  if (!order || order.status === "paid") return json({ ok: true });
  if (order.session_id && sessionId && order.session_id !== sessionId) {
    return json({ error: "Not your order" }, 403);
  }

  const items = await env.DB.prepare(`SELECT sku FROM order_items WHERE order_id = ?`)
    .bind(orderId)
    .all();

  await releaseSkus(env, (items.results || []).map((i) => i.sku), order.session_id);
  await env.DB.prepare(`UPDATE orders SET status = 'cancelled' WHERE id = ?`).bind(orderId).run();

  return json({ ok: true });
}

/** Free items whose reservation lapsed without payment. */
async function sweepExpiredReservations(env) {
  const res = await env.DB.batch([
    env.DB.prepare(
      `UPDATE products
          SET reserved_by = NULL, reserved_until = NULL
        WHERE reserved_until IS NOT NULL
          AND reserved_until < datetime('now')
          AND quantity > 0`
    ),
    env.DB.prepare(
      `UPDATE orders
          SET status = 'cancelled', updated_at = datetime('now')
        WHERE status = 'pending'
          AND created_at < datetime('now', '-${RESERVATION_MINUTES} minutes')`
    ),
  ]);
  console.log("sweep released", res[0]?.meta?.changes ?? 0, "items");
}

/** Only clears a reservation the given session actually holds. */
async function releaseSkus(env, skus, sessionId) {
  if (!skus || skus.length === 0) return;
  await env.DB.batch(
    skus.map((sku) =>
      env.DB.prepare(
        `UPDATE products
            SET reserved_by = NULL, reserved_until = NULL
          WHERE sku = ? AND reserved_by = ?`
      ).bind(sku, sessionId)
    )
  );
}

async function lookupNames(env, skus) {
  if (!skus.length) return [];
  const r = await env.DB.prepare(
    `SELECT name FROM products WHERE sku IN (${skus.map(() => "?").join(",")})`
  )
    .bind(...skus)
    .all();
  return (r.results || []).map((x) => x.name);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** HMAC SHA512 over the raw body, compared in constant time. */
async function verifySignature(rawBody, signature, secret) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(expected, signature);
}

/** Avoids leaking information through comparison timing. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function makeOrderId() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return `TBE-ORD-${String(n).padStart(6, "0")}`;
}

function getSessionId(request) {
  const m = (request.headers.get("Cookie") || "").match(/tbe_session=([^;]+)/);
  return m ? m[1] : null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cors(response, env) {
  const h = new Headers(response.headers);
  h.set("Access-Control-Allow-Origin", env.SITE_ORIGIN || "*");
  h.set("Access-Control-Allow-Credentials", "true");
  h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(response.body, { status: response.status, headers: h });
}
