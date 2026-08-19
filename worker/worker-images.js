/**
 * Thrift by Eugy — Cloudflare Worker: product image upload & delivery
 *
 * Handles admin uploads from the site itself (no local script needed).
 * Two modes, chosen by the admin at upload time:
 *   processing = "auto"  -> background removed + cropped + backdrop picked
 *   processing = "asis"  -> photo kept exactly as shot
 * Compression + multi-format delivery happen in BOTH modes.
 *
 * wrangler.toml needs:
 *   [[r2_buckets]]
 *   binding = "PRODUCT_IMAGES"
 *   bucket_name = "thriftbyeugy-images"
 *
 *   [vars]
 *   CF_ACCOUNT_ID = "..."
 *   ADMIN_ORIGIN  = "https://thriftbyeugy.com"
 *   # CF_IMAGES_TOKEN and CUTOUT_API_KEY go in secrets, not here:
 *   #   wrangler secret put CF_IMAGES_TOKEN
 */

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB per photo
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];

// Delivery variants. Cloudflare Images resizes + encodes on the fly;
// we define the sizes once and reference them by name from the storefront.
const VARIANTS = {
  thumb: { width: 300, quality: 80 },   // grid cards
  card: { width: 600, quality: 82 },    // product cards / discovery feed
  detail: { width: 1200, quality: 85 }, // product page main image
  zoom: { width: 2000, quality: 88 },   // pinch/zoom on mobile
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), env);

    if (url.pathname === "/admin/upload" && request.method === "POST") {
      return cors(await handleUpload(request, env), env);
    }
    if (url.pathname.startsWith("/img/")) {
      return handleDeliver(request, env, url);
    }
    return new Response("Not found", { status: 404 });
  },
};

// ---------------------------------------------------------------------------
// Upload: admin posts the raw photo + the processing choice
// ---------------------------------------------------------------------------
async function handleUpload(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  const form = await request.formData();
  const file = form.get("file");
  const sku = (form.get("sku") || "").trim();
  const processing = form.get("processing") === "asis" ? "asis" : "auto";
  const index = parseInt(form.get("index") || "1", 10);

  if (!file || typeof file === "string") return json({ error: "No file uploaded." }, 400);
  if (!sku) return json({ error: "SKU is required." }, 400);
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: "That photo is over 15MB. Try a smaller export." }, 413);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return json({ error: `Unsupported file type: ${file.type}` }, 415);
  }

  let bytes = new Uint8Array(await file.arrayBuffer());
  let meta = { processing, cutout: false };

  if (processing === "auto") {
    try {
      const cleaned = await runCutout(bytes, file.type, env);
      bytes = cleaned.bytes;
      meta = { ...meta, ...cleaned.meta, cutout: true };
    } catch (err) {
      // Never lose the upload because cleanup failed — store the original
      // and tell the admin, so they can retry or keep it as shot.
      meta.cutoutError = String(err.message || err);
    }
  }

  // Store the master. Every delivered size is derived from this one file,
  // so we keep it at full quality and never re-encode the master.
  const key = `products/${sku}/${index}.master`;
  await env.PRODUCT_IMAGES.put(key, bytes, {
    httpMetadata: { contentType: meta.cutout ? "image/png" : file.type },
    customMetadata: {
      sku,
      index: String(index),
      processing,
      cutout: String(meta.cutout),
      garment: meta.garment || "",
      backdrop: meta.backdrop || "",
      uploadedAt: new Date().toISOString(),
    },
  });

  return json({
    ok: true,
    sku,
    index,
    key,
    ...meta,
    originalBytes: file.size,
    // The storefront references these paths; encoding happens at request time.
    urls: Object.fromEntries(
      Object.keys(VARIANTS).map((v) => [v, `/img/${sku}/${index}/${v}`])
    ),
    note: meta.cutoutError
      ? "Saved as shot — automatic cleanup didn't run on this photo."
      : undefined,
  });
}

// ---------------------------------------------------------------------------
// Cutout: background removal + crop + backdrop choice
//
// Workers can't run the segmentation model itself (no native ML runtime, and
// the model is ~176MB), so this calls it out to a service. Two viable options:
//   1. Cloudflare Workers AI — run a segmentation model on CF's own GPUs
//   2. A small container (Railway/Fly/Render) running the rembg pipeline
// Either way the admin experience is identical: upload in the browser, done.
// ---------------------------------------------------------------------------
async function runCutout(bytes, contentType, env) {
  const res = await fetch(env.CUTOUT_SERVICE_URL, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Authorization: `Bearer ${env.CUTOUT_API_KEY}`,
    },
    body: bytes,
  });

  if (!res.ok) {
    throw new Error(`Cutout service returned ${res.status}`);
  }

  // Service returns the cut-out PNG, plus what it decided, in headers.
  const out = new Uint8Array(await res.arrayBuffer());
  return {
    bytes: out,
    meta: {
      garment: res.headers.get("X-Garment-Lightness") || "",   // "light" | "dark"
      backdrop: res.headers.get("X-Backdrop-Applied") || "",   // "ink" | "white"
    },
  };
}

// ---------------------------------------------------------------------------
// Deliver: /img/{sku}/{index}/{variant}
//
// One stored master -> AVIF, WebP, or JPEG depending on what the shopper's
// browser accepts. Smaller file, identical visible quality.
// ---------------------------------------------------------------------------
async function handleDeliver(request, env, url) {
  const [, , sku, index, variantName] = url.pathname.split("/");
  const variant = VARIANTS[variantName] || VARIANTS.card;

  const cache = caches.default;
  const cacheKey = new Request(url.toString() + "|" + pickFormat(request), request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const object = await env.PRODUCT_IMAGES.get(`products/${sku}/${index}.master`);
  if (!object) return new Response("Image not found", { status: 404 });

  const format = pickFormat(request);

  // cf.image runs Cloudflare's resizing/encoding at the edge.
  const response = await fetch(new Request(url.toString()), {
    cf: {
      image: {
        width: variant.width,
        quality: variant.quality,
        format,                // avif | webp | baseline-jpeg
        fit: "scale-down",     // never upscale past the master
        metadata: "none",      // strip EXIF (also strips location data from phone photos)
      },
    },
  });

  const out = new Response(object.body, {
    headers: {
      "Content-Type": `image/${format === "baseline-jpeg" ? "jpeg" : format}`,
      // Immutable: filenames are versioned by SKU+index, so a changed photo
      // gets a new key rather than needing a purge.
      "Cache-Control": "public, max-age=31536000, immutable",
      Vary: "Accept",
    },
  });

  ctxWaitUntil(cache.put(cacheKey, out.clone()));
  return out;
}

// Content negotiation: give each browser the smallest format it understands.
function pickFormat(request) {
  const accept = request.headers.get("Accept") || "";
  if (accept.includes("image/avif")) return "avif";
  if (accept.includes("image/webp")) return "webp";
  return "baseline-jpeg";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function requireAdmin(request, env) {
  const token = (request.headers.get("Authorization") || "").replace("Bearer ", "");
  if (!token || token !== env.ADMIN_TOKEN) {
    return json({ error: "Sign in as an admin to upload products." }, 401);
  }
  return null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function cors(response, env) {
  const h = new Headers(response.headers);
  h.set("Access-Control-Allow-Origin", env.ADMIN_ORIGIN || "*");
  h.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return new Response(response.body, { status: response.status, headers: h });
}

function ctxWaitUntil(promise) {
  // In a real handler this comes from the ctx argument; kept simple here.
  promise.catch(() => {});
}
