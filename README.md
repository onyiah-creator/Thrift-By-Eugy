# Thrift by Eugy

Your home for exquisite fashion at an affordable price. A curated secondhand fashion storefront — Lagos.

Built with React, Vite, and Tailwind CSS.

## Features

- **Home / Discover** — hero, AI-style recommendations, and a Pinterest-style masonry discovery grid
- **Shop** — category filters and live search
- **Quick view** — product detail modal with condition, size, and one-of-one notes
- **Bag & checkout** — slide-out drawer with a 4-step flow: Bag → Delivery Details → Payment (Card / Bank Transfer / USSD) → Order confirmation with reference number, totals in naira (₦)

## Admin panel

Open `#/admin` (e.g. http://localhost:5173/#/admin) for the **Add Product** page: drag-and-drop photo upload with two processing modes (automatic background cleanup, or keep the photo as shot), a compression report (AVIF/WebP/JPEG sizes), and the item details form matching the product template columns.

## Image pipeline

`worker/worker-images.js` is the Cloudflare Worker that backs the admin upload flow: it stores one full-quality master per photo in R2 and serves resized AVIF/WebP/JPEG variants (thumb/card/detail/zoom) via content negotiation, with EXIF stripped on delivery. `worker/wrangler.toml.example` shows the required bindings; see [docs/IMAGE_GUIDE.md](docs/IMAGE_GUIDE.md) for the full guide, including the one open decision (where background removal runs: Cloudflare Workers AI vs. a small rembg container).

## 360° spin viewer

`src/SpinViewer.jsx` exports `SpinViewer`, a drag-to-rotate frame viewer (mouse, touch, arrow keys, scrub bar, auto-spin, full preload). Try the interaction at `#/spin`, which renders generated placeholder frames. Real spins are shot on the mannequin at fixed intervals and prepared with `scripts/prep_spin.py` — it applies one shared crop box across all frames so the garment doesn't jitter (photos go in `spin_raw/<SKU>/` next to the script; output lands in `spin_out/<SKU>/` with a manifest). See [docs/SPIN_GUIDE.md](docs/SPIN_GUIDE.md) for the shooting checklist and why frames beat GIF/video.

## Product import template

`templates/ThriftByEugy_Product_Template.xlsx` is the spreadsheet for cataloguing real inventory. It has a **Products** sheet (SKU, name, category, price, size, condition, color, brand, description, image filenames, quantity, status, date added — with one filled-in example row) and a **Legend & Instructions** sheet explaining each column.

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (defaults to http://localhost:5173).

## Scripts

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `npm run dev`     | Start the dev server             |
| `npm run build`   | Production build into `dist/`    |
| `npm run preview` | Preview the production build     |

## Brand tokens

| Token      | Hex       |
| ---------- | --------- |
| Ink        | `#0A0A0C` |
| Gold       | `#C9A227` |
| Gold light | `#E8C56B` |
| Ivory      | `#F3ECDD` |
| Burgundy   | `#5C1A2B` |
