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
    try {
      const url = new URL(request.url);

      if (request.method === "OPTIONS") return cors(new Response(null, { status: 204 }), env);

      if (url.pathname === "/admin/upload" && request.method === "POST") {
        return cors(await handleUpload(request, env), env);
      }
      if (url.pathname.startsWith("/img/")) {
        return handleDeliver(request, env, url, ctx);
      }
      if (url.pathname.startsWith("/_raw/")) {
        return handleRaw(env, url);
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      // Without this, any unhandled error (a malformed multipart body, an
      // R2 failure, anything) surfaces as Cloudflare's generic "error 1101"
      // page with no detail at all. Catching here turns that into an actual
      // message you can act on instead of a mystery code to search for.
      console.error("unhandled worker error", err);
      return cors(
        json({ error: "Upload failed.", detail: String(err.message || err) }, 500),
        env
      );
    }
  },
};

/**
 * Internal-only: serves the exact R2 bytes with no transformation.
 * This exists so handleDeliver has something DIFFERENT to point Cloudflare's
 * image resizer at. Pointing the resizer at the same public /img/ URL that
 * handleDeliver itself serves would recurse into this same function forever
 * (or, worse, silently skip resizing) — it needs a distinct origin URL to
 * fetch and transform, exactly like fetching a normal image off the web.
 */
async function handleRaw(env, url) {
  const [, , sku, index] = url.pathname.split("/");
  const object = await env.PRODUCT_IMAGES.get(`products/${sku}/${index}.master`);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" },
  });
}

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
    if (!env.CUTOUT_SERVICE_URL) {
      // The background-removal service (Workers AI or a rembg container) is
      // not deployed yet — this is a known, expected gap, not a fault. Skip
      // the network attempt entirely rather than throwing a confusing error,
      // and say so plainly so the admin isn't left guessing why nothing
      // changed about the photo.
      meta.cutoutError = "not_configured";
    } else {
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
    note:
      meta.cutoutError === "not_configured"
        ? "Saved as shot — automatic background cleanup isn't turned on yet. Photo was still compressed and optimised."
        : meta.cutoutError
        ? "Saved as shot — automatic cleanup didn't run on this photo. Photo was still compressed and optimised."
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
async function handleDeliver(request, env, url, ctx) {
  const [, , sku, index, variantName] = url.pathname.split("/");
  const variant = VARIANTS[variantName] || VARIANTS.card;

  const cache = caches.default;
  const cacheKey = new Request(url.toString() + "|" + pickFormat(request), request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const exists = await env.PRODUCT_IMAGES.head(`products/${sku}/${index}.master`);
  if (!exists) return new Response("Image not found", { status: 404 });

  const format = pickFormat(request);

  // Point the resizer at the internal /_raw/ origin, NOT this same /img/ URL —
  // fetching the URL this function itself handles would recurse forever
  // instead of ever reaching real image bytes.
  const rawUrl = new URL(`/_raw/${sku}/${index}`, url.origin);
  const response = await fetch(rawUrl, {
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

  if (!response.ok) {
    // Resizing failed for some reason (e.g. Image Resizing not enabled on
    // this zone yet) — fall back to the untouched original rather than a
    // broken image. Slower and heavier, but a visible product beats none.
    const fallback = await env.PRODUCT_IMAGES.get(`products/${sku}/${index}.master`);
    return new Response(fallback.body, {
      headers: {
        "Content-Type": fallback.httpMetadata?.contentType || "application/octet-stream",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const out = new Response(response.body, {
    headers: {
      "Content-Type": `image/${format === "baseline-jpeg" ? "jpeg" : format}`,
      // Immutable: filenames are versioned by SKU+index, so a changed photo
      // gets a new key rather than needing a purge.
      "Cache-Control": "public, max-age=31536000, immutable",
      Vary: "Accept",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, out.clone()));
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
  const header = request.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";

  if (!env.ADMIN_TOKEN) {
    // Fail closed, and say why in the logs. A missing secret must never mean
    // "let everyone in" — matching the products API Worker, which shares this
    // same token.
    console.error("ADMIN_TOKEN is not configured");
    return json({ error: "Admin access is not configured." }, 503);
  }
  if (!token || !timingSafeEqual(token, env.ADMIN_TOKEN)) {
    return json({ error: "Sign in as an admin to upload products." }, 401);
  }
  return null;
}

// Constant-time compare: a plain !== leaks how much of the token matched via
// response timing. Both Workers accept the same token, so weak checking on
// either one weakens both.
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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

