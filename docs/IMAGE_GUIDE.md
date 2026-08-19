# Thrift by Eugy — Product Image Handling

## Where processing happens

Photos are uploaded and processed **from the admin panel on the site itself**.
Nobody runs a script on a laptop. The earlier local script still exists as a
useful bulk-backfill tool for your existing catalog, but day-to-day listing
happens in the browser.

Flow: admin uploads photo → Worker receives it → (optional cleanup) →
master stored in R2 → shoppers served an optimized, resized version.

## Two upload modes

| Mode | What happens | When to use it |
|---|---|---|
| **Clean up automatically** | Background removed, cropped to the garment, backdrop chosen by garment brightness | Standard catalog shots on the mannequin |
| **Use photo as shot** | Photo kept exactly as you styled it | Flat-lays, styled scenes, detail/flaw close-ups, anything where the setting is part of the shot |

Compression and format conversion run in **both** modes — turning off cleanup
never means shipping a 4MB phone photo to a shopper on mobile data.

If automatic cleanup fails on a photo, the upload is still saved as shot and
the admin is told. An upload is never lost because a cleanup step failed.

## Compression: what "smaller without losing quality" actually means

One full-quality master is stored per photo. Every size shoppers see is
generated from it at request time, so the master is never re-encoded and
never degrades.

Each browser is served the smallest format it supports:

| Format | vs JPEG | Support | Role |
|---|---|---|---|
| **AVIF** | ~50% smaller | ~95% of browsers | First choice |
| **WebP** | ~30% smaller | ~97% | Fallback |
| **JPEG** | baseline | universal | Last resort |

This is content negotiation via the `Accept` header — you upload once, and
each shopper automatically gets the best format their device handles.

### Sizes served
| Variant | Width | Used for |
|---|---|---|
| thumb | 300px | grid cards |
| card | 600px | product cards, discovery feed |
| detail | 1200px | product page |
| zoom | 2000px | pinch-to-zoom |

A phone showing a grid downloads 300px thumbnails, not 2000px masters. This
matters a lot for shoppers on Nigerian mobile data.

## On GIF

Don't use GIF for product photos. It's limited to 256 colors, which visibly
bands and posterizes fabric — gradients and subtle tones fall apart. It also
produces *larger* files than AVIF or WebP for photographic content.

If you want a **360° spin** of a garment, the right approach is a sequence of
still frames swapped as the shopper drags or scrolls. Sharper than a GIF,
dramatically smaller, and each frame still benefits from AVIF/WebP.

If you genuinely need short motion (e.g. fabric movement), use a muted
autoplay MP4/WebM video — still far smaller and sharper than GIF.

## Privacy note

EXIF metadata is stripped on delivery (`metadata: "none"`). Phone photos
often embed GPS coordinates — this ensures your home or shop location never
ships inside a product image.

## Setup

```
wrangler secret put ADMIN_TOKEN
wrangler secret put CUTOUT_API_KEY
```

`wrangler.toml`:
```toml
[[r2_buckets]]
binding = "PRODUCT_IMAGES"
bucket_name = "thriftbyeugy-images"

[vars]
ADMIN_ORIGIN = "https://thriftbyeugy.com"
CUTOUT_SERVICE_URL = "https://your-cutout-service/cutout"
```

### The one piece that needs a decision
Workers can't run the background-removal model directly — no native ML
runtime, and the model is ~176MB. Two options:

1. **Cloudflare Workers AI** — run segmentation on Cloudflare's GPUs. Stays
   fully inside Cloudflare, no extra service to maintain.
2. **Small container** (Railway / Fly / Render) running the same rembg
   pipeline from the bulk script, called over HTTP.

Option 1 is cleaner if the available models handle your mannequin shots well;
option 2 reuses logic already proven on your actual photos. Worth testing
option 1 against a dozen real items before committing.
