/**
 * Thrift by Eugy — API client
 *
 * Talks to the products/admin Worker (api/worker-api.js).
 *
 * BASE URL
 * In dev the base is empty, so requests go to /api/... on the Vite dev server,
 * which proxies them to the Worker (see vite.config.js). That keeps them
 * same-origin and sidesteps CORS entirely — the Worker only allows
 * SITE_ORIGIN, which is the deployed Pages URL, not localhost.
 * In a production build the full Worker URL is used, where CORS does match.
 * VITE_API_URL overrides both.
 */

const LIVE_API = "https://thriftbyeugy-api.onyiah.workers.dev";

export const API_BASE =
  import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "" : LIVE_API);

// Mirrors VALID_CATEGORIES in the Worker. Anything else is rejected server-side.
export const CATEGORIES = ["Dresses", "Outerwear", "Denim", "Tops", "Accessories", "Shoes"];
export const CONDITIONS = ["Excellent", "Very Good", "Good", "Fair"];
export const SIZES = ["XS", "S", "M", "L", "XL", "Custom"];
export const STATUSES = ["draft", "active", "sold", "archived"];

// ---------------------------------------------------------------------------
// Presentation helpers
//
// The database stores a colour NAME ("Coral"); the cards need a hex to build
// the gradient behind a cut-out photo. Unknown names fall back to a stable
// pick from the brand palette so the same SKU always renders the same colour.
// ---------------------------------------------------------------------------
const COLOR_HEX = {
  coral: "#C8836B", peach: "#E0A080", salmon: "#E08A70", terracotta: "#B5674F",
  rust: "#A85A3C", orange: "#C87F3E", red: "#A34038", burgundy: "#6B2C3E",
  wine: "#6B2C3E", maroon: "#7A3B4E", pink: "#C98BA0", blush: "#D9A5AC",
  rose: "#C98BA0", fuchsia: "#A8497F", green: "#5F8A5F", lime: "#7E9B4A",
  "lime green": "#7E9B4A", olive: "#7A7A45", emerald: "#3E7A5C", sage: "#8FA894",
  mint: "#8FBFA8", blue: "#5F7BA6", navy: "#3C4A6E", denim: "#5A79A0",
  teal: "#3E7A7A", purple: "#7A5C8A", lilac: "#A894C0", lavender: "#A894C0",
  plum: "#6E3C5C", yellow: "#C9A227", mustard: "#B99A2E", gold: "#C9A227",
  brown: "#7A5C43", tan: "#A88A63", camel: "#B39668", beige: "#C4AE8E",
  khaki: "#8A8A5F", black: "#3A3A3E", white: "#C9C5BD", cream: "#D8CFBC",
  ivory: "#D8CFBC", grey: "#8A8A8E", gray: "#8A8A8E", charcoal: "#4A4A50",
  silver: "#A8A8AE", multicolour: "#8A6E2F", multicolor: "#8A6E2F",
};

const FALLBACK_PALETTE = [
  "#C8836B", "#7E9B8A", "#C9A227", "#6E7BA6", "#B5674F", "#5F8A8A", "#9A6E92", "#8A8A55",
];

function colorHex(name, sku = "") {
  const key = String(name || "").trim().toLowerCase();
  if (COLOR_HEX[key]) return COLOR_HEX[key];
  for (const [word, hex] of Object.entries(COLOR_HEX)) {
    if (key.includes(word)) return hex;
  }
  let h = 0;
  for (const ch of sku) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return FALLBACK_PALETTE[h % FALLBACK_PALETTE.length];
}

// Photos already committed to public/products/, used until the image pipeline
// Worker is deployed. Set VITE_IMAGE_BASE to serve from that Worker instead.
const LOCAL_IMAGES = {
  "TBE-0001": "/products/TBE-0001_coral-peplum-top.png",
  "TBE-0002": "/products/TBE-0002_lime-ruffle-top.png",
  "TBE-0003": "/products/TBE-0001_coral-peplum-top.png",
};

function imageFor(p) {
  const base = import.meta.env.VITE_IMAGE_BASE;
  if (base && p.images?.length) return base.replace(/\/$/, "") + p.images[0].card;
  return LOCAL_IMAGES[p.sku] || null;
}

/**
 * Public API products carry no quantity/status (only sellable stock is ever
 * returned), but the recommender checks both, so they are filled in here.
 * A deterministic height keeps the masonry column varied without reflowing
 * between renders.
 */
export function normaliseProduct(p, i = 0) {
  let h = 0;
  for (const ch of p.sku || "") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    ...p,
    id: p.sku,
    color: colorHex(p.color, p.sku),
    colorName: p.color,
    image: imageFor(p),
    height: 250 + (h % 150),
    quantity: 1,
    status: "active",
    justIn: i < 4,
  };
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------
async function request(path, { token, method = "GET", body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    // Network-level failure: offline, DNS, blocked. Never a server response.
    throw new ApiError("Could not reach the shop. Check your connection.", 0);
  }

  let data = null;
  try {
    data = await res.json();
  } catch {
    /* some errors have no JSON body */
  }

  if (!res.ok) {
    throw new ApiError(
      data?.error === "validation_failed"
        ? data.errors?.map((e) => `${e.field}: ${e.message}`).join(", ") || "Validation failed"
        : data?.error || `Request failed (${res.status})`,
      res.status,
      data?.errors
    );
  }
  return data;
}

export class ApiError extends Error {
  constructor(message, status, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// ---- public ---------------------------------------------------------------
export async function fetchProducts({ category, q, limit = 60 } = {}) {
  const params = new URLSearchParams();
  if (category && category !== "All") params.set("category", category);
  if (q) params.set("q", q);
  params.set("limit", String(limit));
  const data = await request(`/api/products?${params}`);
  return {
    products: (data.products || []).map(normaliseProduct),
    total: data.total ?? 0,
  };
}

export async function fetchProduct(sku) {
  const data = await request(`/api/products/${encodeURIComponent(sku)}`);
  return { ...normaliseProduct(data.product), available: data.product.available };
}

// ---- admin (bearer token on every call) -----------------------------------
export const admin = {
  products: (token, status) =>
    request(`/api/admin/products${status && status !== "all" ? `?status=${status}` : ""}`, { token }),
  create: (token, product) =>
    request("/api/admin/products", { token, method: "POST", body: product }),
  update: (token, sku, patch) =>
    request(`/api/admin/products/${encodeURIComponent(sku)}`, { token, method: "PATCH", body: patch }),
  archive: (token, sku) =>
    request(`/api/admin/products/${encodeURIComponent(sku)}`, { token, method: "DELETE" }),
  orders: (token, status) =>
    request(`/api/admin/orders${status && status !== "all" ? `?status=${status}` : ""}`, { token }),
  order: (token, id) => request(`/api/admin/orders/${encodeURIComponent(id)}`, { token }),
  stats: (token) => request("/api/admin/stats", { token }),
};
