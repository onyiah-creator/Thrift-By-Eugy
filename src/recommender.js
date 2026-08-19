/**
 * Thrift by Eugy — recommendation engine
 *
 * Designed around two constraints that make thrift different from normal retail:
 *
 *   1. EVERY ITEM IS QUANTITY-OF-ONE. Classic "customers who bought this also
 *      bought that" is nearly useless here — the item it recommends is the one
 *      thing that is now definitely gone. So co-purchase signal has to be
 *      generalised to item *attributes*, not item IDs.
 *
 *   2. NO ORDER HISTORY ON DAY ONE. The engine must produce sensible results
 *      from product attributes alone, then blend in behaviour as it accrues.
 *
 * Strategy: content similarity always works; behavioural signal is layered on
 * top with a weight that grows as data arrives. No cliff, no cold-start hole.
 */

// ---------------------------------------------------------------------------
// Tunables
// ---------------------------------------------------------------------------
const WEIGHTS = {
  category: 0.30,
  color: 0.18,
  priceBand: 0.16,
  size: 0.14,
  style: 0.14,
  condition: 0.08,
};

// How much behavioural signal is trusted, based on how much of it exists.
// Stays at zero until there's enough to beat noise.
const BEHAVIOUR_RAMP = [
  { minEvents: 0, weight: 0.0 },
  { minEvents: 50, weight: 0.15 },
  { minEvents: 250, weight: 0.30 },
  { minEvents: 1000, weight: 0.45 },
];

// Colours that read as harmonious together. Used so a coral top can suggest
// a rust skirt, not only other coral things.
const COLOR_FAMILIES = {
  coral: ["coral", "peach", "salmon", "terracotta", "rust", "orange"],
  red: ["red", "burgundy", "wine", "maroon", "crimson"],
  pink: ["pink", "blush", "rose", "fuchsia", "magenta"],
  green: ["green", "lime", "olive", "emerald", "sage", "mint"],
  blue: ["blue", "navy", "denim", "teal", "cobalt", "sky"],
  purple: ["purple", "lilac", "lavender", "plum", "violet"],
  yellow: ["yellow", "mustard", "gold", "ochre"],
  brown: ["brown", "tan", "camel", "beige", "chocolate", "khaki"],
  neutral: ["black", "white", "cream", "ivory", "grey", "gray", "charcoal"],
};

const STYLE_KEYWORDS = {
  formal: ["blazer", "suit", "tailored", "shift", "sheath", "office", "smart"],
  casual: ["tee", "t-shirt", "jeans", "denim", "hoodie", "sweat", "everyday"],
  occasion: ["silk", "sequin", "lace", "satin", "gown", "cocktail", "evening", "party"],
  boho: ["floral", "crochet", "flowy", "peasant", "kaftan", "maxi", "ruffle"],
  vintage: ["vintage", "retro", "y2k", "90s", "80s", "classic"],
  outerwear: ["coat", "jacket", "trench", "parka", "cardigan"],
};

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL"];
const CONDITION_ORDER = ["Fair", "Good", "Very Good", "Excellent"];

// ---------------------------------------------------------------------------
// Attribute similarity
// ---------------------------------------------------------------------------
function colorFamily(color) {
  if (!color) return null;
  const c = String(color).toLowerCase();
  for (const [family, members] of Object.entries(COLOR_FAMILIES)) {
    if (members.some((m) => c.includes(m))) return family;
  }
  return null;
}

function colorScore(a, b) {
  if (!a || !b) return 0;
  const ca = String(a).toLowerCase();
  const cb = String(b).toLowerCase();
  if (ca === cb) return 1;

  const fa = colorFamily(a);
  const fb = colorFamily(b);
  if (fa && fa === fb) return 0.75;

  // Neutrals pair with everything — that's what makes them neutrals.
  if (fa === "neutral" || fb === "neutral") return 0.45;
  return 0;
}

function styleTags(item) {
  const text = `${item.name || ""} ${item.description || ""}`.toLowerCase();
  const tags = new Set();
  for (const [style, words] of Object.entries(STYLE_KEYWORDS)) {
    if (words.some((w) => text.includes(w))) tags.add(style);
  }
  return tags;
}

function styleScore(a, b) {
  const ta = styleTags(a);
  const tb = styleTags(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  // Jaccard: shared over union
  return shared / (ta.size + tb.size - shared);
}

function priceScore(a, b) {
  const pa = Number(a);
  const pb = Number(b);
  if (!(pa > 0) || !(pb > 0)) return 0;
  // Ratio-based, so ₦2k vs ₦4k is as different as ₦20k vs ₦40k.
  const ratio = Math.min(pa, pb) / Math.max(pa, pb);
  return ratio < 0.4 ? 0 : (ratio - 0.4) / 0.6;
}

function sizeScore(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ia = SIZE_ORDER.indexOf(String(a).toUpperCase());
  const ib = SIZE_ORDER.indexOf(String(b).toUpperCase());
  if (ia === -1 || ib === -1) return 0;
  const gap = Math.abs(ia - ib);
  // One size away still plausibly fits, especially in secondhand where
  // sizing is inconsistent across eras and brands.
  return gap === 1 ? 0.5 : gap === 2 ? 0.15 : 0;
}

function conditionScore(a, b) {
  if (!a || !b) return 0;
  const ia = CONDITION_ORDER.indexOf(a);
  const ib = CONDITION_ORDER.indexOf(b);
  if (ia === -1 || ib === -1) return 0;
  return 1 - Math.abs(ia - ib) / (CONDITION_ORDER.length - 1);
}

/** Content similarity between two products, 0..1 */
export function similarity(a, b) {
  if (!a || !b || a.sku === b.sku) return 0;

  const parts = {
    category: a.category && b.category && a.category === b.category ? 1 : 0,
    color: colorScore(a.color, b.color),
    priceBand: priceScore(a.price, b.price),
    size: sizeScore(a.size, b.size),
    style: styleScore(a, b),
    condition: conditionScore(a.condition, b.condition),
  };

  let score = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    score += parts[key] * weight;
  }
  return score;
}

// ---------------------------------------------------------------------------
// Behavioural signal
//
// Because items are one-of-one, we can't learn "SKU A goes with SKU B".
// Instead we learn which ATTRIBUTE PAIRS co-occur in real sessions —
// e.g. shoppers who view Dresses often go on to view Shoes. That knowledge
// survives the item selling out.
// ---------------------------------------------------------------------------
export function buildAffinityModel(events) {
  // events: [{ sessionId, sku, category, colorFamily, type }]
  const bySession = new Map();
  for (const e of events) {
    if (!bySession.has(e.sessionId)) bySession.set(e.sessionId, []);
    bySession.get(e.sessionId).push(e);
  }

  const pairCounts = new Map();
  const singleCounts = new Map();
  let totalEvents = 0;

  const key = (a, b) => `${a}|${b}`;

  for (const items of bySession.values()) {
    const cats = [...new Set(items.map((i) => i.category).filter(Boolean))];
    totalEvents += items.length;
    for (const c of cats) {
      singleCounts.set(c, (singleCounts.get(c) || 0) + 1);
    }
    for (let i = 0; i < cats.length; i++) {
      for (let j = 0; j < cats.length; j++) {
        if (i === j) continue;
        const k = key(cats[i], cats[j]);
        pairCounts.set(k, (pairCounts.get(k) || 0) + 1);
      }
    }
  }

  return {
    totalEvents,
    /** P(viewing categoryB | viewed categoryA), lightly smoothed */
    affinity(catA, catB) {
      if (!catA || !catB || catA === catB) return 0;
      const pair = pairCounts.get(key(catA, catB)) || 0;
      const base = singleCounts.get(catA) || 0;
      if (base < 3) return 0; // too thin to mean anything
      return pair / (base + 5); // +5 smoothing pulls sparse pairs toward zero
    },
  };
}

function behaviourWeight(totalEvents) {
  let w = 0;
  for (const step of BEHAVIOUR_RAMP) {
    if (totalEvents >= step.minEvents) w = step.weight;
  }
  return w;
}

// ---------------------------------------------------------------------------
// Recommenders
// ---------------------------------------------------------------------------

/**
 * "You may also like" — shown on a product page.
 * Pure content similarity, optionally nudged by category affinity.
 */
export function similarItems(product, catalogue, { limit = 6, model = null } = {}) {
  const bw = model ? behaviourWeight(model.totalEvents) : 0;

  const scored = catalogue
    .filter((p) => p.sku !== product.sku && isAvailable(p))
    .map((p) => {
      const content = similarity(product, p);
      const behaviour = model ? model.affinity(product.category, p.category) : 0;
      return { product: p, score: content * (1 - bw) + behaviour * bw, content, behaviour };
    })
    .filter((r) => r.score > 0.08) // below this it's noise dressed as a recommendation
    .sort((a, b) => b.score - a.score);

  return diversify(scored, limit);
}

/**
 * "Complete the look" — deliberately picks a DIFFERENT category that pairs
 * well, rather than more of the same thing. A shopper looking at a top
 * doesn't need five more tops.
 */
const PAIRS_WITH = {
  Dresses: ["Shoes", "Accessories", "Outerwear"],
  Tops: ["Denim", "Accessories", "Shoes"],
  Denim: ["Tops", "Shoes", "Accessories"],
  Outerwear: ["Dresses", "Tops", "Denim"],
  Shoes: ["Dresses", "Denim", "Accessories"],
  Accessories: ["Dresses", "Tops", "Outerwear"],
};

export function completeTheLook(product, catalogue, { limit = 4 } = {}) {
  const targets = PAIRS_WITH[product.category] || [];
  if (!targets.length) return [];

  const scored = catalogue
    .filter((p) => targets.includes(p.category) && isAvailable(p) && p.sku !== product.sku)
    .map((p) => {
      // Complementary, not identical: colour harmony and price band matter,
      // category sameness explicitly does not.
      const score =
        colorScore(product.color, p.color) * 0.45 +
        priceScore(product.price, p.price) * 0.30 +
        styleScore(product, p) * 0.25;
      return { product: p, score };
    })
    .filter((r) => r.score > 0.1)
    .sort((a, b) => b.score - a.score);

  return diversify(scored, limit);
}

/**
 * Personalised feed from browsing history — the discovery page.
 * Recent views count for more than older ones.
 */
export function forYou(recentlyViewed, catalogue, { limit = 12, model = null } = {}) {
  if (!recentlyViewed?.length) {
    return trending(catalogue, { limit });
  }

  const seen = new Set(recentlyViewed.map((p) => p.sku));
  const totals = new Map();

  recentlyViewed.slice(0, 10).forEach((viewed, i) => {
    const recency = Math.pow(0.85, i); // decay down the history
    for (const candidate of catalogue) {
      if (seen.has(candidate.sku) || !isAvailable(candidate)) continue;
      const s = similarity(viewed, candidate) * recency;
      totals.set(candidate.sku, (totals.get(candidate.sku) || 0) + s);
    }
  });

  const scored = [...totals.entries()]
    .map(([sku, score]) => ({ product: catalogue.find((p) => p.sku === sku), score }))
    .filter((r) => r.product && r.score > 0.1)
    .sort((a, b) => b.score - a.score);

  return diversify(scored, limit);
}

/**
 * Fallback for brand-new visitors: newest available stock, spread across
 * categories. Without the diversity pass a first-time visitor can land on
 * four near-identical tops purely because they were uploaded together —
 * a poor first impression of the catalogue's range.
 */
export function trending(catalogue, { limit = 12 } = {}) {
  const fresh = catalogue
    .filter(isAvailable)
    .sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0))
    .map((product, i) => ({ product, score: 1 / (i + 1) }));

  return diversify(fresh, limit);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Never recommend something that can't be bought. Critical at quantity-of-one. */
function isAvailable(p) {
  return Number(p.quantity) > 0 && String(p.status || "").toLowerCase() === "active";
}

/**
 * Stop the results being six near-identical coral tops. Caps how many items
 * from one category appear before lower-scoring variety is preferred.
 */
function diversify(scored, limit) {
  const maxPerCategory = Math.max(2, Math.ceil(limit / 3));
  const counts = new Map();
  const out = [];
  const overflow = [];

  for (const r of scored) {
    const c = r.product.category;
    const n = counts.get(c) || 0;
    if (n < maxPerCategory) {
      out.push(r.product);
      counts.set(c, n + 1);
      if (out.length === limit) return out;
    } else {
      overflow.push(r.product);
    }
  }
  // Backfill if diversity capping left us short.
  for (const p of overflow) {
    if (out.length === limit) break;
    out.push(p);
  }
  return out;
}

export const _internals = { colorScore, priceScore, sizeScore, styleScore, diversify, isAvailable };
