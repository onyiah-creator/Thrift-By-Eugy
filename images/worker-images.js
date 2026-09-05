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
      if (url.pathname === "/admin/spin/upload" && request.method === "POST") {
        return cors(await handleSpinUpload(request, env), env);
      }
      if (url.pathname === "/admin/spin/delete" && request.method === "POST") {
        return cors(await handleSpinDelete(request, env), env);
      }
      if (url.pathname.startsWith("/spin/") && request.method === "GET") {
        return cors(await handleSpinList(env, url), env);
      }
      if (url.pathname.startsWith("/spinimg/")) {
        return handleSpinDeliver(request, env, url, ctx);
      }
      if (url.pathname.startsWith("/_rawspin/")) {
        return handleRawSpin(env, url);
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
  // ?src=tmp reads the just-uploaded, not-yet-compressed file — used only
  // internally, during the upload step, to give the resizer something to
  // fetch and shrink before the real master is ever written.
  const useTmp = url.searchParams.get("src") === "tmp";
  const key = `products/${sku}/${index}.${useTmp ? "upload-tmp" : "master"}`;
  const object = await env.PRODUCT_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" },
  });
}

/**
 * Shrinks the uploaded photo BEFORE it's ever written as the permanent
 * master — this is the actual "reduce size, keep quality" step. Everything
 * downstream (thumb/card/detail/zoom) derives from this already-smaller file,
 * so storage and every later resize both benefit, not just delivery.
 *
 * Workers can't run image codecs directly, so this uses the same mechanism
 * already proven live on this Worker: write the raw bytes to a temporary R2
 * key, then fetch that key back through Cloudflare's edge resizer via
 * cf.image, which returns genuinely re-encoded, smaller bytes.
 */
async function compressForStorage(env, sku, index, isCutout, origin, sourceType) {
  return compressForStorageAt(env, isCutout, sourceType, origin, `/_raw/${sku}/${index}`);
}

/**
 * The compression itself, parameterised on the internal raw-serving path so
 * the product-photo and spin-frame upload paths share one implementation
 * instead of maintaining two copies of the same resize logic.
 */
async function compressForStorageAt(env, isCutout, sourceType, requestUrl, rawPath) {
  const tmpUrl = new URL(`${rawPath}?src=tmp`, requestUrl);

  // Anything that CAN carry alpha must stay in a format that has alpha.
  // Keying this off isCutout alone flattens every transparent PNG a shopper
  // never sees cut out by this Worker — including photos already background-
  // removed elsewhere, which is exactly what this shop uploads. JPEG has no
  // alpha channel, so that loss is permanent in the stored master.
  // WebP keeps transparency and still compresses far better than PNG.
  // Ordinary opaque photos become baseline JPEG: the most compatible format
  // for a long-lived master, since it is re-encoded to AVIF/WebP/JPEG again
  // at delivery time for whichever browser is asking.
  const mayHaveAlpha =
    isCutout || sourceType === "image/png" || sourceType === "image/webp";
  const format = mayHaveAlpha ? "webp" : "baseline-jpeg";

  const response = await fetch(tmpUrl, {
    cf: {
      image: {
        width: 2000,          // generous ceiling — covers pinch-to-zoom, never upscales smaller photos
        quality: mayHaveAlpha ? 90 : 88,
        format,
        fit: "scale-down",
        metadata: "none",
      },
    },
  });

  if (!response.ok) {
    throw new Error(`Storage compression returned ${response.status}`);
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    contentType: mayHaveAlpha ? "image/webp" : "image/jpeg",
  };
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
  const originalBytes = file.size;
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

  // Compress BEFORE persisting. Write to a temp key only so the edge resizer
  // has a URL to fetch — this key never survives past this one request.
  const tmpKey = `products/${sku}/${index}.upload-tmp`;
  let contentType = meta.cutout ? "image/png" : file.type;

  await env.PRODUCT_IMAGES.put(tmpKey, bytes, { httpMetadata: { contentType } });

  try {
    const compressed = await compressForStorage(env, sku, index, meta.cutout, request.url, contentType);
    bytes = compressed.bytes;
    contentType = compressed.contentType;
    meta.storedBytes = bytes.length;
    meta.savedPercent = Math.max(0, Math.round((1 - bytes.length / originalBytes) * 100));
  } catch (err) {
    // If the resizer is unavailable for any reason, the upload must still
    // succeed — a shopper-visible photo that's larger than intended beats no
    // photo at all. Flag it so it's not a silent surprise.
    meta.compressionError = String(err.message || err);
    meta.storedBytes = bytes.length;
    meta.savedPercent = 0;
  } finally {
    await env.PRODUCT_IMAGES.delete(tmpKey).catch(() => {});
  }

  // This IS the stored file now — already reduced, not a full-size original
  // waiting to be shrunk later. Every delivered size (thumb/card/detail/zoom)
  // is derived from this already-smaller master.
  const key = `products/${sku}/${index}.master`;
  await env.PRODUCT_IMAGES.put(key, bytes, {
    httpMetadata: { contentType },
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
    originalBytes,
    // The storefront references these paths; encoding happens at request time.
    urls: Object.fromEntries(
      Object.keys(VARIANTS).map((v) => [v, `/img/${sku}/${index}/${v}`])
    ),
    note:
      meta.compressionError
        ? "Saved at original size — the compression step didn't run this time. Safe to re-upload later once resolved."
        : meta.cutoutError === "not_configured"
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
// 360° spin: an ORDERED SEQUENCE of frames for one SKU, stored separately
// from the up-to-5 flat product photos above. This is real infrastructure
// for a real spin — it does NOT synthesize rotation from a single photo.
// A spin only exists once someone has actually shot 24-36 frames of the
// garment turning on the mannequin (see SPIN_GUIDE.md for the technique).
// ---------------------------------------------------------------------------

/**
 * Upload one frame of a spin sequence. Called once per frame — the admin
 * side (or a bulk script) loops over an ordered folder of photos and posts
 * each one here in turn. Frames are always treated as photographed as-shot;
 * running the cutout/backdrop-choice logic per-frame would risk each frame
 * picking a slightly different crop or backdrop, which is far more visible
 * and distracting in a spinning sequence than in a single static photo.
 */
async function handleSpinUpload(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  const form = await request.formData();
  const file = form.get("file");
  const sku = (form.get("sku") || "").trim();
  const frame = parseInt(form.get("frame") || "", 10);

  if (!file || typeof file === "string") return json({ error: "No file uploaded." }, 400);
  if (!sku) return json({ error: "SKU is required." }, 400);
  if (!Number.isFinite(frame) || frame < 0 || frame > 99) {
    return json({ error: "Frame number must be between 0 and 99." }, 400);
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return json({ error: "That photo is over 15MB. Try a smaller export." }, 413);
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return json({ error: `Unsupported file type: ${file.type}` }, 415);
  }

  const frameStr = String(frame).padStart(2, "0");
  let bytes = new Uint8Array(await file.arrayBuffer());
  const originalBytes = file.size;

  const tmpKey = `products/${sku}/spin/${frameStr}.upload-tmp`;
  await env.PRODUCT_IMAGES.put(tmpKey, bytes, { httpMetadata: { contentType: file.type } });

  let contentType = file.type;
  let savedPercent = 0;
  try {
    const compressed = await compressForStorageAt(
      env, false, file.type, request.url, `/_rawspin/${sku}/${frameStr}`
    );
    bytes = compressed.bytes;
    contentType = compressed.contentType;
    savedPercent = Math.max(0, Math.round((1 - bytes.length / originalBytes) * 100));
  } catch (err) {
    // Same rule as the main upload path: never lose the frame because
    // compression failed. A larger-than-intended frame beats a missing one.
  } finally {
    await env.PRODUCT_IMAGES.delete(tmpKey).catch(() => {});
  }

  const key = `products/${sku}/spin/${frameStr}.master`;
  await env.PRODUCT_IMAGES.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: { sku, frame: frameStr, uploadedAt: new Date().toISOString() },
  });

  return json({ ok: true, sku, frame, key, originalBytes, storedBytes: bytes.length, savedPercent });
}

/**
 * Deletes every frame for a SKU — used when replacing a bad shoot, or when
 * a product is archived. Deliberately whole-sequence: a spin with some
 * frames from an old shoot and some from a new one would jump and stutter,
 * which is worse than having no spin at all.
 */
async function handleSpinDelete(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth) return auth;

  const body = await request.json();
  const sku = (body.sku || "").trim();
  if (!sku) return json({ error: "SKU is required." }, 400);

  const listed = await env.PRODUCT_IMAGES.list({ prefix: `products/${sku}/spin/` });
  const keys = (listed.objects || []).map((o) => o.key);
  if (keys.length) {
    await Promise.all(keys.map((k) => env.PRODUCT_IMAGES.delete(k)));
  }
  return json({ ok: true, sku, deleted: keys.length });
}

/**
 * Lists the frames actually available for a SKU, in order, as ready-to-use
 * URLs. The frontend calls this once per product rather than guessing a
 * frame count — a product with no spin returns an empty list, which the
 * viewer already renders as "No spin frames for this item yet."
 */
async function handleSpinList(env, url) {
  const sku = decodeURIComponent(url.pathname.split("/").pop());
  const listed = await env.PRODUCT_IMAGES.list({ prefix: `products/${sku}/spin/` });

  const frames = (listed.objects || [])
    .map((o) => o.key.match(/\/(\d{2})\.master$/))
    .filter(Boolean)
    .map((m) => m[1])
    .sort((a, b) => Number(a) - Number(b));

  return json({
    sku,
    count: frames.length,
    frames: frames.map((f) => `/spinimg/${sku}/${f}/card`),
  });
}

/** Same resize/format-negotiation delivery as handleDeliver, for spin frames. */
async function handleSpinDeliver(request, env, url, ctx) {
  const [, , sku, frame, variantName] = url.pathname.split("/");
  const variant = VARIANTS[variantName] || VARIANTS.card;

  const cache = caches.default;
  const cacheKey = new Request(url.toString() + "|" + pickFormat(request), request);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const exists = await env.PRODUCT_IMAGES.head(`products/${sku}/spin/${frame}.master`);
  if (!exists) return new Response("Frame not found", { status: 404 });

  const format = pickFormat(request);
  const rawUrl = new URL(`/_rawspin/${sku}/${frame}`, url.origin);
  const response = await fetch(rawUrl, {
    cf: { image: { width: variant.width, quality: variant.quality, format, fit: "scale-down", metadata: "none" } },
  });

  if (!response.ok) {
    const fallback = await env.PRODUCT_IMAGES.get(`products/${sku}/spin/${frame}.master`);
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
      "Cache-Control": "public, max-age=31536000, immutable",
      Vary: "Accept",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}

/** Internal-only raw byte serving for spin frames — mirrors handleRaw,
 * including honoring ?src=tmp so compressForStorageAt can read the
 * just-uploaded temp file before the real master exists. */
async function handleRawSpin(env, url) {
  const [, , sku, frame] = url.pathname.split("/");
  const useTmp = url.searchParams.get("src") === "tmp";
  const key = `products/${sku}/spin/${frame}.${useTmp ? "upload-tmp" : "master"}`;
  const object = await env.PRODUCT_IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream" },
  });
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

