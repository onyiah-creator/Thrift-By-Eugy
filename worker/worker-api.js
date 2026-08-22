/**
 * Thrift by Eugy — Cloudflare Worker: products API + admin
 *
 * PUBLIC (storefront reads these)
 *   GET  /api/products                 list active, in-stock items
 *   GET  /api/products/:sku            one item
 *
 * ADMIN (all require a bearer token)
 *   GET    /api/admin/products         everything, including drafts and sold
 *   POST   /api/admin/products         create
 *   PATCH  /api/admin/products/:sku    update
 *   DELETE /api/admin/products/:sku    archive (never a hard delete)
 *   GET    /api/admin/orders           order list, newest first
 *   GET    /api/admin/orders/:id       one order with its lines
 *   GET    /api/admin/stats            dashboard counts
 *
 * ON AUTHENTICATION
 * The admin panel writes to the product database, so it cannot sit on a public
 * URL unprotected. This uses a single shared bearer token, which is the right
 * weight for a one-person shop: no user table, no password reset flow, nothing
 * to get subtly wrong. It is NOT appropriate once staff share access — at that
 * point move to Cloudflare Access or real per-user accounts.
 *
 * The token is compared in constant time and lives in Cloudflare's encrypted
 * secret store, never in the repo.
 *
 * Secrets:  wrangler secret put ADMIN_TOKEN
 * Bindings: DB (D1)
 */

const VALID_CATEGORIES = ["Dresses", "Outerwear", "Denim", "Tops", "Accessories", "Shoes"];
const VALID_CONDITIONS = ["Excellent", "Very Good", "Good", "Fair"];
const VALID_STATUSES = ["draft", "active", "sold", "archived"];
const PAGE_SIZE_MAX = 60;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return cors(new Response(null, { status: 204 }), env);

    try {
      // ---- public -------------------------------------------------------
      if (path === "/api/products" && method === "GET") {
        return cors(await listPublicProducts(url, env), env);
      }
      if (path.startsWith("/api/products/") && method === "GET") {
        return cors(await getPublicProduct(decodeURIComponent(path.split("/").pop()), env), env);
      }

      // ---- admin --------------------------------------------------------
      if (path.startsWith("/api/admin/")) {
        const denied = requireAdmin(request, env);
        if (denied) return cors(denied, env);

        if (path === "/api/admin/products" && method === "GET") {
          return cors(await listAllProducts(url, env), env);
        }
        if (path === "/api/admin/products" && method === "POST") {
          return cors(await createProduct(request, env), env);
        }
        if (path.startsWith("/api/admin/products/")) {
          const sku = decodeURIComponent(path.split("/").pop());
          if (method === "PATCH") return cors(await updateProduct(sku, request, env), env);
          if (method === "DELETE") return cors(await archiveProduct(sku, env), env);
        }
        if (path === "/api/admin/orders" && method === "GET") {
          return cors(await listOrders(url, env), env);
        }
        if (path.startsWith("/api/admin/orders/") && method === "GET") {
          return cors(await getOrder(decodeURIComponent(path.split("/").pop()), env), env);
        }
        if (path === "/api/admin/stats" && method === "GET") {
          return cors(await getStats(env), env);
        }
      }
    } catch (err) {
      console.error("api error", err);
      return cors(json({ error: "Something went wrong." }, 500), env);
    }

    return cors(json({ error: "Not found" }, 404), env);
  },
};

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------
async function listPublicProducts(url, env) {
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q");
  const limit = clamp(url.searchParams.get("limit"), 24, PAGE_SIZE_MAX);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

  // Only ever expose sellable stock. A shopper should never see, or be able to
  // reach, a draft or an item someone else has already bought.
  const where = ["status = 'active'", "quantity > 0"];
  const binds = [];

  if (category && category !== "All") {
    if (!VALID_CATEGORIES.includes(category)) return json({ error: "Unknown category" }, 400);
    where.push("category = ?");
    binds.push(category);
  }
  if (q) {
    where.push("(name LIKE ? OR description LIKE ? OR color LIKE ?)");
    const like = `%${q}%`;
    binds.push(like, like, like);
  }

  const sql = `SELECT sku, name, category, price, size, condition_grade, color, brand,
                      description, image_count, has_spin, created_at
                 FROM products
                WHERE ${where.join(" AND ")}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?`;

  const { results } = await env.DB.prepare(sql).bind(...binds, limit, offset).all();

  const countSql = `SELECT COUNT(*) AS n FROM products WHERE ${where.join(" AND ")}`;
  const count = await env.DB.prepare(countSql).bind(...binds).first();

  return json({
    products: (results || []).map(shapeProduct),
    total: count?.n ?? 0,
    limit,
    offset,
  });
}

async function getPublicProduct(sku, env) {
  const row = await env.DB.prepare(
    `SELECT sku, name, category, price, size, condition_grade, color, brand,
            description, image_count, has_spin, quantity, status, created_at
       FROM products
      WHERE sku = ? AND status = 'active'`
  )
    .bind(sku)
    .first();

  if (!row) return json({ error: "Not found" }, 404);

  // Sold items still resolve, so the page can say "this one's gone" rather
  // than 404 — a dead link from a shared post is a worse experience, and for
  // one-of-one stock it happens constantly.
  return json({ product: { ...shapeProduct(row), available: Number(row.quantity) > 0 } });
}

// ---------------------------------------------------------------------------
// Admin reads
// ---------------------------------------------------------------------------
async function listAllProducts(url, env) {
  const status = url.searchParams.get("status");
  const limit = clamp(url.searchParams.get("limit"), 50, PAGE_SIZE_MAX);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") || "0", 10) || 0);

  const where = [];
  const binds = [];
  if (status && status !== "all") {
    if (!VALID_STATUSES.includes(status)) return json({ error: "Unknown status" }, 400);
    where.push("status = ?");
    binds.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { results } = await env.DB.prepare(
    `SELECT sku, name, category, price, size, condition_grade, color, brand,
            image_count, has_spin, quantity, status, reserved_until, created_at
       FROM products ${clause}
      ORDER BY created_at DESC LIMIT ? OFFSET ?`
  )
    .bind(...binds, limit, offset)
    .all();

  return json({ products: results || [], limit, offset });
}

async function listOrders(url, env) {
  const status = url.searchParams.get("status");
  const limit = clamp(url.searchParams.get("limit"), 50, PAGE_SIZE_MAX);

  const where = [];
  const binds = [];
  if (status && status !== "all") {
    where.push("status = ?");
    binds.push(status);
  }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { results } = await env.DB.prepare(
    `SELECT o.id, o.full_name, o.email, o.phone, o.city, o.amount, o.status,
            o.created_at, o.paid_at,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
       FROM orders o ${clause}
      ORDER BY o.created_at DESC LIMIT ?`
  )
    .bind(...binds, limit)
    .all();

  return json({ orders: results || [] });
}

async function getOrder(id, env) {
  const order = await env.DB.prepare(`SELECT * FROM orders WHERE id = ?`).bind(id).first();
  if (!order) return json({ error: "Order not found" }, 404);
  const items = await env.DB.prepare(
    `SELECT sku, name, price, size FROM order_items WHERE order_id = ?`
  )
    .bind(id)
    .all();
  return json({ order, items: items.results || [] });
}

async function getStats(env) {
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM products WHERE status='active' AND quantity>0) AS live,
       (SELECT COUNT(*) FROM products WHERE status='draft')                 AS drafts,
       (SELECT COUNT(*) FROM products WHERE status='sold')                  AS sold,
       (SELECT COUNT(*) FROM orders   WHERE status='pending')               AS pending_orders,
       (SELECT COUNT(*) FROM orders   WHERE status='paid')                  AS paid_orders,
       (SELECT COALESCE(SUM(amount),0) FROM orders WHERE status='paid')     AS revenue,
       (SELECT COUNT(*) FROM products
         WHERE reserved_until IS NOT NULL
           AND reserved_until > datetime('now'))                            AS reserved_now`
  ).first();
  return json({ stats: row });
}

// ---------------------------------------------------------------------------
// Admin writes
// ---------------------------------------------------------------------------
async function createProduct(request, env) {
  const body = await request.json();
  const errors = validateProduct(body, { requireSku: true });
  if (errors.length) return json({ error: "validation_failed", errors }, 400);

  const existing = await env.DB.prepare(`SELECT sku FROM products WHERE sku = ?`)
    .bind(body.sku)
    .first();
  if (existing) {
    return json({ error: `SKU ${body.sku} already exists.`, field: "sku" }, 409);
  }

  await env.DB.prepare(
    `INSERT INTO products
       (sku, name, category, price, size, condition_grade, color, brand,
        description, image_count, has_spin, quantity, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      body.sku.trim(),
      body.name.trim(),
      body.category,
      Math.round(Number(body.price)),
      body.size || null,
      body.condition_grade || null,
      body.color || null,
      normaliseBrand(body.brand),
      body.description || null,
      Number(body.image_count) || 0,
      body.has_spin ? 1 : 0,
      // One-of-one is the default. Anything else needs to be deliberate.
      body.quantity === undefined ? 1 : Math.max(0, Number(body.quantity)),
      VALID_STATUSES.includes(body.status) ? body.status : "draft"
    )
    .run();

  return json({ ok: true, sku: body.sku }, 201);
}

async function updateProduct(sku, request, env) {
  const body = await request.json();
  const errors = validateProduct(body, { requireSku: false, partial: true });
  if (errors.length) return json({ error: "validation_failed", errors }, 400);

  const existing = await env.DB.prepare(
    `SELECT sku, status, reserved_until FROM products WHERE sku = ?`
  )
    .bind(sku)
    .first();
  if (!existing) return json({ error: "Product not found" }, 404);

  // Refuse to edit an item someone is actively paying for. Changing the price
  // mid-checkout would make the order total disagree with the product record.
  if (existing.reserved_until && new Date(existing.reserved_until) > new Date()) {
    return json(
      { error: "This item is reserved by a shopper checking out. Try again in a few minutes." },
      409
    );
  }

  const allowed = {
    name: "name",
    category: "category",
    price: "price",
    size: "size",
    condition_grade: "condition_grade",
    color: "color",
    brand: "brand",
    description: "description",
    image_count: "image_count",
    has_spin: "has_spin",
    quantity: "quantity",
    status: "status",
  };

  const sets = [];
  const binds = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (body[key] === undefined) continue;
    let v = body[key];
    if (key === "price") v = Math.round(Number(v));
    if (key === "brand") v = normaliseBrand(v);
    if (key === "has_spin") v = v ? 1 : 0;
    if (key === "quantity") v = Math.max(0, Number(v));
    sets.push(`${column} = ?`);
    binds.push(v);
  }

  if (!sets.length) return json({ error: "Nothing to update" }, 400);

  sets.push("updated_at = datetime('now')");
  await env.DB.prepare(`UPDATE products SET ${sets.join(", ")} WHERE sku = ?`)
    .bind(...binds, sku)
    .run();

  return json({ ok: true, sku });
}

/**
 * Archive, never hard delete. Orders reference SKUs, so removing the row would
 * break order history — and an order must still read correctly years later.
 */
async function archiveProduct(sku, env) {
  const sold = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
      WHERE oi.sku = ? AND o.status = 'paid'`
  )
    .bind(sku)
    .first();

  const res = await env.DB.prepare(
    `UPDATE products
        SET status = 'archived', quantity = 0, reserved_by = NULL, reserved_until = NULL,
            updated_at = datetime('now')
      WHERE sku = ?`
  )
    .bind(sku)
    .run();

  if (res.meta.changes === 0) return json({ error: "Product not found" }, 404);

  return json({
    ok: true,
    archived: sku,
    note: sold?.n
      ? "Archived. This item appears in past orders, so its record is kept."
      : "Archived and removed from the shop.",
  });
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateProduct(b, { requireSku, partial = false }) {
  const e = [];
  const has = (k) => b[k] !== undefined && b[k] !== null && String(b[k]).trim() !== "";

  if (requireSku && !has("sku")) e.push({ field: "sku", message: "SKU is required" });
  if (has("sku") && !/^[A-Za-z0-9._-]{2,40}$/.test(String(b.sku).trim())) {
    e.push({ field: "sku", message: "SKU may use letters, numbers, dot, dash, underscore only" });
  }

  if (!partial || b.name !== undefined) {
    if (!has("name")) e.push({ field: "name", message: "Name is required" });
    else if (String(b.name).length > 150) e.push({ field: "name", message: "Name is too long" });
  }

  if (!partial || b.category !== undefined) {
    if (!VALID_CATEGORIES.includes(b.category)) {
      e.push({ field: "category", message: `Category must be one of: ${VALID_CATEGORIES.join(", ")}` });
    }
  }

  if (!partial || b.price !== undefined) {
    const p = Number(b.price);
    if (!Number.isFinite(p) || p <= 0) e.push({ field: "price", message: "Price must be a number above zero" });
    else if (p > 100_000_000) e.push({ field: "price", message: "Price looks wrong — check the amount" });
  }

  if (b.condition_grade !== undefined && b.condition_grade !== null && b.condition_grade !== "") {
    if (!VALID_CONDITIONS.includes(b.condition_grade)) {
      e.push({ field: "condition_grade", message: `Condition must be one of: ${VALID_CONDITIONS.join(", ")}` });
    }
  }

  if (b.status !== undefined && !VALID_STATUSES.includes(b.status)) {
    e.push({ field: "status", message: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
  }

  return e;
}

/**
 * Google rejects placeholder brand values on used items, and a wrong brand is
 * worse than none. Normalise them to null at the point of entry so the
 * Merchant Center feed never has to guess.
 */
function normaliseBrand(brand) {
  if (!brand) return null;
  const b = String(brand).trim();
  const placeholders = new Set([
    "n/a", "na", "none", "generic", "no brand", "unbranded",
    "unlabeled", "unlabelled", "unknown", "does not exist", "-", "nil",
  ]);
  return placeholders.has(b.toLowerCase()) ? null : b;
}

function shapeProduct(row) {
  return {
    sku: row.sku,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    size: row.size,
    condition: row.condition_grade,
    color: row.color,
    brand: row.brand,
    description: row.description,
    imageCount: Number(row.image_count) || 0,
    hasSpin: !!row.has_spin,
    images: Array.from({ length: Number(row.image_count) || 0 }, (_, i) => ({
      thumb: `/img/${row.sku}/${i + 1}/thumb`,
      card: `/img/${row.sku}/${i + 1}/card`,
      detail: `/img/${row.sku}/${i + 1}/detail`,
    })),
    dateAdded: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Auth + helpers
// ---------------------------------------------------------------------------
function requireAdmin(request, env) {
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!env.ADMIN_TOKEN) {
    // Fail closed. A missing secret must never mean "let everyone in".
    console.error("ADMIN_TOKEN is not configured");
    return json({ error: "Admin access is not configured." }, 503);
  }
  if (!token || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
    return json({ error: "Not authorised." }, 401);
  }
  return null;
}

function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function clamp(raw, fallback, max) {
  const n = parseInt(raw || "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), max);
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
  h.set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, { status: response.status, headers: h });
}
