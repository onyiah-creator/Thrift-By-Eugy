# Thrift by Eugy — 360° spin: real backend, real constraint

## What this actually makes possible, and what it doesn't

**This adds real storage and delivery for a spin sequence.** Before this,
there was nowhere to put more than 5 flat product photos per SKU, and no
concept of an ordered frame sequence at all — so even a perfect 36-frame
shoot had nowhere real to go.

**This does NOT make an already-uploaded single photo spin.** NYASH, the
coral top, the lime top — none of them will suddenly rotate. A spin needs
24-36 actual photographs of that specific garment turning on the mannequin.
That's photography, not code. The shooting technique (locking exposure,
rotation intervals, timing) is covered in [SPIN_GUIDE.md](SPIN_GUIDE.md)
and hasn't changed.

## What's new in worker-images.js

| Route | Purpose |
|---|---|
| `POST /admin/spin/upload` | Upload one frame (sku, frame number, file) |
| `POST /admin/spin/delete` | Delete an entire spin sequence for a SKU |
| `GET /spin/:sku` | List available frames as ready-to-use URLs |
| `GET /spinimg/:sku/:frame/:variant` | Deliver one frame, resized/format-negotiated |

Frames are stored separately from product photos
(`products/{sku}/spin/{NN}.master`), compressed through the same real
resize-on-upload technique already proven for regular photos — the two
upload paths share one `compressForStorageAt` implementation, not a
separate, untested copy. That shared path also keeps the alpha rule: a
PNG/WebP source that can carry transparency stays WebP rather than being
flattened to JPEG.

**A bug caught before deploy, worth knowing about:** the internal raw-serving
route for spin frames initially ignored the `?src=tmp` flag the compression
step depends on, meaning every spin frame would have silently compressed to
nothing and fallen back to the uncompressed original with no error shown.
Traced and fixed by tracing the actual URL chain end to end rather than
assuming the reuse was safe — verified with the corrected key resolution
before this shipped.

**A deliberate choice:** spin frames always upload "as shot," never through
the cutout/backdrop-picker. Running that per-frame risks each frame choosing
a slightly different crop or background — which reads as an obvious flaw
mid-spin in a way it never would in a single static photo.

## Deploy

Same Worker, same deploy process as before:

```powershell
cd images
wrangler deploy
```

Nothing new to configure — same R2 bucket, same `ADMIN_TOKEN` secret.

## Shooting and uploading a real spin

1. Follow the shooting technique from [SPIN_GUIDE.md](SPIN_GUIDE.md)
   (locked exposure, one mannequin rotation increment per shot, 24-36 frames)
2. Name the files so they sort correctly — `frame00.jpg` through `frame35.jpg`,
   not `frame1.jpg` (which sorts before `frame10.jpg` alphabetically)
3. Put them all in one folder
4. Run:

```powershell
$env:TBE_TOKEN = "your-token"
.\scripts\Upload-Spin.ps1 -Sku TBE-0087 -FolderPath .\spin-photos\TBE-0087
```

This uploads every frame in order, reports the compression result for each,
and — only if every single frame succeeded — marks the product as having a
spin via the products API.

If any frame fails, `has_spin` is deliberately left unset. A half-uploaded
sequence showing as "available" would be worse than no spin at all.

## Verify it worked

```powershell
Invoke-RestMethod "https://thriftbyeugy-images.onyiah.workers.dev/spin/TBE-0087"
```

Should return a `count` matching your frame total and a list of frame URLs.

## The frontend piece

Wired in the same change that brought this backend into the repo:

- `SpinViewer` (`src/SpinViewer.jsx`) accepts a `sku` prop and fetches
  `GET /spin/{sku}` on mount, using the returned frames exactly like its
  existing `frames` prop. With no `sku`, the demo-frame generation is
  unchanged — the `#/spin` preview still works without a real shoot.
- The storefront quick view shows the spin viewer **only** when a product's
  `hasSpin` flag is true; every other product keeps the flat photo and no
  spin UI at all — gated, not shown broken.
- The `/spin` list call is a `fetch()`, so like uploads it goes through the
  dev-server proxy in development (`vite.config.js`); frame delivery URLs
  stay absolute, since `<img>` needs no CORS.

## Cleanup after testing

Any SKU you use for a real spin test can be cleared with:

```powershell
$body = @{ sku = "TBE-0087" } | ConvertTo-Json
Invoke-RestMethod -Uri "https://thriftbyeugy-images.onyiah.workers.dev/admin/spin/delete" -Method Post -Headers @{ Authorization = "Bearer $env:TBE_TOKEN"; "Content-Type" = "application/json" } -Body $body
```
