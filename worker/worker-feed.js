/**
 * Thrift by Eugy — Cloudflare Worker: live Google Merchant Center feed
 *
 *   GET /feeds/google.xml
 *
 * Point Merchant Center at this URL as a scheduled fetch (daily minimum,
 * hourly is better for one-of-one stock). This beats uploading a file by
 * hand because thrift inventory is single-quantity: the moment something
 * sells it must stop being advertised, or you pay for clicks on a product
 * nobody can buy — and repeated availability mismatches get an account
 * warned or suspended.
 *
 * Assumes a D1 table `products`. Adjust column names to match your schema.
 */

const STORE = {
  name: "Thrift by Eugy",
  url: "https://thriftbyeugy.com",
  description: "Curated secondhand fashion — one-of-one preloved pieces.",
  currency: "NGN",
};

const CATEGORY_MAP = {
  Dresses: ["2271", "Apparel & Accessories > Clothing > Dresses"],
  Outerwear: ["5598", "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets"],
  Denim: ["5322", "Apparel & Accessories > Clothing > Pants"],
  Tops: ["212", "Apparel & Accessories > Clothing > Shirts & Tops"],
  Accessories: ["166", "Apparel & Accessories > Clothing Accessories"],
  Shoes: ["187", "Apparel & Accessories > Shoes"],
};

const CONDITION_NOTES = {
  Excellent: "Excellent preloved condition, no visible wear.",
  "Very Good": "Very good preloved condition, minimal signs of wear.",
  Good: "Good preloved condition, light wear consistent with age.",
  Fair: "Fair preloved condition, visible wear — see photos.",
};

// Values Google rejects as a brand. Anything here is treated as unbranded.
const PLACEHOLDER_BRANDS = new Set([
  "n/a", "na", "none", "generic", "no brand", "unbranded",
  "unlabeled", "unlabelled", "unknown", "does not exist", "-",
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/feeds/google.xml") {
      return new Response("Not found", { status: 404 });
    }

    const { results } = await env.DB.prepare(
      `SELECT sku, name, category, price, size, condition_grade, color, brand,
              description, image_count, quantity, status
         FROM products
        WHERE status = 'active'
        ORDER BY created_at DESC`
    ).all();

    const items = (results || []).filter(isFeedEligible);
    const xml = buildFeed(items);

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        // Short cache: stock changes matter more than shaving requests here.
        "Cache-Control": "public, max-age=900",
      },
    });
  },
};

/**
 * Skip rows Google would reject anyway. A disapproved item is noise in the
 * Merchant Center dashboard that hides real problems, so it's better to
 * withhold an incomplete listing than submit it and collect an error.
 */
function isFeedEligible(p) {
  if (!p.sku || !p.name || !p.description) return false;
  if (!CATEGORY_MAP[p.category]) return false;
  if (!(Number(p.price) > 0)) return false;
  if (!p.color || !p.size) return false;
  if (!Number(p.image_count)) return false;
  return true;
}

function hasRealBrand(brand) {
  if (!brand) return false;
  return !PLACEHOLDER_BRANDS.has(String(brand).trim().toLowerCase());
}

function buildTitle(p) {
  let t = [p.color, p.name].filter(Boolean).join(" ");
  const lower = t.toLowerCase();
  if (!lower.includes("preloved") && !lower.includes("thrift")) {
    t += " — Preloved";
  }
  return t.slice(0, 150);
}

function buildDescription(p) {
  const parts = [p.description];
  const note = CONDITION_NOTES[p.condition_grade];
  if (note) parts.push(note);
  parts.push("One-of-one preloved piece — once it's gone, it's gone.");
  if (p.size) parts.push(`Size ${p.size}.`);
  return parts.filter(Boolean).join(" ").slice(0, 5000);
}

function buildFeed(items) {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    `    <title>${esc(STORE.name)}</title>`,
    `    <link>${esc(STORE.url)}</link>`,
    `    <description>${esc(STORE.description)}</description>`,
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
  ];

  for (const p of items) {
    const [catId, catPath] = CATEGORY_MAP[p.category];
    const availability = Number(p.quantity) > 0 ? "in_stock" : "out_of_stock";
    const imageCount = Math.min(Number(p.image_count) || 1, 3);

    out.push("    <item>");
    out.push(`      <g:id>${esc(p.sku)}</g:id>`);
    out.push(`      <g:title>${esc(buildTitle(p))}</g:title>`);
    out.push(`      <g:description>${esc(buildDescription(p))}</g:description>`);
    out.push(`      <g:link>${esc(STORE.url)}/product/${esc(p.sku)}</g:link>`);
    out.push(`      <g:image_link>${esc(STORE.url)}/img/${esc(p.sku)}/1/detail</g:image_link>`);
    for (let i = 2; i <= imageCount; i++) {
      out.push(
        `      <g:additional_image_link>${esc(STORE.url)}/img/${esc(p.sku)}/${i}/detail</g:additional_image_link>`
      );
    }
    out.push(`      <g:availability>${availability}</g:availability>`);
    out.push(`      <g:price>${Number(p.price).toFixed(2)} ${STORE.currency}</g:price>`);
    out.push(`      <g:condition>used</g:condition>`);
    out.push(`      <g:google_product_category>${catId}</g:google_product_category>`);
    out.push(`      <g:product_type>${esc(catPath)}</g:product_type>`);

    // Identifiers — the usual cause of secondhand disapprovals.
    // identifier_exists defaults to 'yes' when omitted, so unbranded items
    // must say 'no' explicitly or Google waits for a GTIN that will never come.
    if (hasRealBrand(p.brand)) {
      out.push(`      <g:brand>${esc(p.brand)}</g:brand>`);
      out.push(`      <g:mpn>${esc(p.sku)}</g:mpn>`);
      out.push(`      <g:identifier_exists>yes</g:identifier_exists>`);
    } else {
      out.push(`      <g:identifier_exists>no</g:identifier_exists>`);
    }

    // Apparel-required attributes
    out.push(`      <g:color>${esc(p.color)}</g:color>`);
    out.push(`      <g:size>${esc(p.size)}</g:size>`);
    out.push(`      <g:gender>female</g:gender>`);
    out.push(`      <g:age_group>adult</g:age_group>`);
    out.push("    </item>");
  }

  out.push("  </channel>", "</rss>");
  return out.join("\n");
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
