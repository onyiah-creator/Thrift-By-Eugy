# Thrift by Eugy — Image Worker Deploy Guide

## What this makes real today, and what it doesn't

Two things happen when you upload a photo in the admin panel: the photo gets
**stored and delivered efficiently** (real, working after this deploy), and
optionally **its background gets removed automatically** (not working yet —
see below).

Don't skip the second section. It's the difference between the panel telling
you the truth and the panel looking like it works while quietly doing less
than it says.

## What's real after this deploy

- **Upload** — photos go to Cloudflare R2 (object storage), keyed by SKU
- **Compression + format negotiation** — one full-quality master is stored;
  each shopper's browser is served AVIF, WebP, or JPEG depending on what it
  supports, generated on the fly and cached
- **Four sizes per photo** — thumbnail (grid), card (product listings),
  detail (product page), zoom (pinch-to-zoom) — all derived from the one
  master, so nothing is re-uploaded or re-compressed by hand
- **EXIF stripped on delivery** — phone photos often embed GPS coordinates;
  this removes them automatically

This is the "Use photo as shot" path in the admin panel, and it's fully
functional once deployed.

## What's NOT real yet: automatic background removal

**"Clean up automatically" — the option that removes the room and picks a
light/dark backdrop — has no service behind it.** The code that decides
*what* to do (garment brightness, backdrop choice) was built and tested
earlier as a Python script. But Workers can't run that kind of model directly
— no native ML runtime, and the model is roughly 176MB — so the Worker is
written to call out to a separate service for it. That service was never
stood up.

**What happens if you use "Clean up automatically" right now:** the Worker
notices no cutout service is configured, skips attempting it, and stores your
photo exactly as shot — compressed and format-optimised, just not
background-removed. The admin panel will show a note explaining this rather
than pretending it worked.

**Two ways to close this gap, when you're ready for that project:**

1. **Cloudflare Workers AI** — run a segmentation model on Cloudflare's own
   GPUs. Stays entirely inside Cloudflare, nothing extra to host or maintain.
2. **A small container** (Railway, Fly, Render) running the same rembg
   pipeline already proven on your coral and lime top photos.

Either way, once that service exists, set `CUTOUT_SERVICE_URL` and
`CUTOUT_API_KEY` and the "Clean up automatically" path starts working with no
other changes needed — the Worker is already written to use it.

## Two bugs fixed before this was safe to deploy

Worth knowing about, since they'd have been invisible until they mattered:

**1. The resize call was pointed at itself.** To get Cloudflare's image
resizing, the Worker fetches a URL with special resize options attached —
but it was fetching its *own* public `/img/...` address, which is handled by
this same function. That either recurses or (as originally written) silently
discards the resized result and serves the raw, full-size master with a
mismatched content-type label claiming it was AVIF. Fixed by adding an
internal `/_raw/` endpoint for the resizer to target instead — the same
pattern as fetching any other image off the web, just one you control.

**2. Background caching wasn't actually guaranteed to finish.** The code
wrote to cache using a local helper that just attached an empty `.catch()`,
not the real `ctx.waitUntil()`. Workers can terminate immediately after
returning a response, cutting off anything not registered with the real
mechanism — so caching would have worked sometimes and silently failed other
times, in a way that's genuinely hard to notice until you're wondering why
images keep reprocessing. Fixed by threading the real `ctx` through.

Both were the kind of bug that looks fine in a five-minute check and causes
real cost later — full-size images shipped to phones, or a caching layer that
isn't actually caching.

## Setup

```bash
wrangler r2 bucket create thriftbyeugy-images
wrangler secret put ADMIN_TOKEN
wrangler deploy
```

Use the **same** `ADMIN_TOKEN` value as your products API Worker — the admin
panel sends one token to both.

## Verify

```bash
# Should fail — no token
curl -i -X POST https://your-images-url/admin/upload

# Should succeed and return a key + urls
curl -X POST https://your-images-url/admin/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "sku=TBE-0004" \
  -F "index=1" \
  -F "processing=asis" \
  -F "file=@/path/to/a/photo.jpg"

# Fetch it back — check the Content-Type matches your browser's Accept header
curl -i https://your-images-url/img/TBE-0004/1/card
```

If Image Resizing isn't enabled on your zone, delivery falls back to serving
the untouched master rather than a broken image — slower, but never blank.
Worth checking Cloudflare's dashboard for your zone's Image Resizing setting
if fetched images look larger than expected.

## Connecting the storefront

Once deployed, set `VITE_IMAGE_BASE` in the frontend to this Worker's URL so
product photos resolve there instead of the committed files in
`public/products/`.
