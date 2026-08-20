# Thrift by Eugy

Your home for exquisite fashion at an affordable price. A curated secondhand fashion storefront — Lagos.

Built with React, Vite, and Tailwind CSS.

## Features

The default storefront (`src/Storefront.jsx`) adapts patterns from Fashion Nova, Shein, and Pinterest with thrift-appropriate changes — see [docs/DESIGN_REFERENCES.md](docs/DESIGN_REFERENCES.md) for what was taken and what was deliberately not (no countdown timers, no fake %-off badges).

- **The Edit** — named curated collections (Owambe Ready, The Lagos Workweek, Denim Broken In, Quiet Luxury)
- **Tabbed rail** — For You (recommendation engine) / New In / Dresses / Under ₦10k
- **Wishlist & recently viewed** — with the explicit note that saving doesn't reserve a one-of-one piece
- **Price-forward cards** — price leads, with condition grade and "1 available" on every card
- **Size guide** — framed around vintage sizing inconsistency
- **Quick view** — photo, description, "Complete the look" picks, only-one-available scarcity note
- **Bag & checkout** — 4-step flow: Bag → Delivery Details → Payment (Card / Bank Transfer / USSD) → Order confirmation, totals in naira (₦)

### Routes

A gold **☰ button (bottom-right)** switches between every prototype — a review tool only; in production the storefront is the root route and admin moves behind authentication.

| Hash | Page |
| --- | --- |
| `/` or `#/storefront` | Storefront (default) |
| `#/spin` | 360° spin viewer demo |
| `#/admin` | Add Product admin panel |
| `#/recommender` | Recommender Lab — the suggestion engine made visible |
| `#/classic` | Original storefront layout |

## Brand

`src/BrandLogo.jsx` provides the TE monogram crest and the monogram + wordmark lockup as crisp inline SVGs (vector renditions of the official logo), used in the storefront header/footer, the admin panel, the order confirmation, and as the favicon (`public/favicon.svg`).

## Admin panel

Open `#/admin` (e.g. http://localhost:5173/#/admin) for the **Add Product** page: drag-and-drop photo upload with two processing modes (automatic background cleanup, or keep the photo as shot), a compression report (AVIF/WebP/JPEG sizes), and the item details form matching the product template columns.

## Image pipeline

`worker/worker-images.js` is the Cloudflare Worker that backs the admin upload flow: it stores one full-quality master per photo in R2 and serves resized AVIF/WebP/JPEG variants (thumb/card/detail/zoom) via content negotiation, with EXIF stripped on delivery. `worker/wrangler.toml.example` shows the required bindings; see [docs/IMAGE_GUIDE.md](docs/IMAGE_GUIDE.md) for the full guide, including the one open decision (where background removal runs: Cloudflare Workers AI vs. a small rembg container).

## 360° spin viewer

`src/SpinViewer.jsx` exports `SpinViewer`, a drag-to-rotate frame viewer (mouse, touch, arrow keys, scrub bar, auto-spin, full preload). Try the interaction at `#/spin`, which renders generated placeholder frames. Real spins are shot on the mannequin at fixed intervals and prepared with `scripts/prep_spin.py` — it applies one shared crop box across all frames so the garment doesn't jitter (photos go in `spin_raw/<SKU>/` next to the script; output lands in `spin_out/<SKU>/` with a manifest). See [docs/SPIN_GUIDE.md](docs/SPIN_GUIDE.md) for the shooting checklist and why frames beat GIF/video.

## Recommendations

`src/recommender.js` is a thrift-aware recommendation engine: content similarity (category, colour family, price band, size, style keywords, condition) blended with an attribute-level behaviour model whose weight grows as browsing events accumulate — no cold-start hole, and sold items are never recommended. The storefront uses it live: the home strip is `trending` for new visitors and `forYou` once the bag has items, and the quick-view modal shows `completeTheLook` picks from complementary categories. `worker/worker-recommendations.js` exposes the same engine as an API (`/api/recommendations/*`, `POST /api/events`) backed by D1 + KV. Run the test suite with `npm test`; see [docs/RECOMMENDATIONS_GUIDE.md](docs/RECOMMENDATIONS_GUIDE.md) for design rationale and tuning notes.

## Google Merchant Center feed

Two ways to produce the Shopping feed, both handling the thrift-specific pitfalls (everything `condition: used`, `identifier_exists: no` for unbranded pieces, quantity-of-one availability):

- **`scripts/build_feed.py`** — generates `feed.xml` from the product spreadsheet: `python3 scripts/build_feed.py templates/ThriftByEugy_Product_Template.xlsx --out feed.xml` (add `--validate-only` to check without writing).
- **`worker/worker-feed.js`** — Cloudflare Worker serving a live feed at `/feeds/google.xml` from a D1 `products` table, for Merchant Center scheduled fetches once the site is live.

See [docs/MERCHANT_FEED_GUIDE.md](docs/MERCHANT_FEED_GUIDE.md) for the setup checklist and [docs/example_feed.xml](docs/example_feed.xml) for sample output.

## Product import template

`templates/ThriftByEugy_Product_Template.xlsx` is the spreadsheet for cataloguing real inventory. It has a **Products** sheet (SKU, name, category, price, size, condition, color, brand, description, image filenames, quantity, status, date added — with one filled-in example row) and a **Legend & Instructions** sheet explaining each column.

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (defaults to http://localhost:5173).

## Deploying to Cloudflare Pages

**Option A — Git (recommended):** in the Cloudflare dashboard, *Workers & Pages → Create → Pages → Connect to Git*, pick this repo, framework preset **Vite**, build command `npm run build`, output directory `dist`, Node 18+. Every push redeploys automatically and PRs get preview URLs.

**Option B — direct upload:**

```bash
npm run build
npx wrangler pages deploy dist --project-name=thrift-by-eugy
```

**Custom domain:** in the Pages project, *Custom domains → Set up a domain* → `thriftbyeugy.com`. With nameservers on Cloudflare, DNS and SSL are automatic.

Included config: `public/_redirects` (SPA routing), `public/_headers` (immutable asset caching + security headers), `wrangler.toml` (Pages project config).

**This deploys the frontend only**, running on demo data. Not yet connected: D1 database (products are hardcoded), R2 image storage, Paystack (checkout is a mock), and the recommendation / image / Merchant Center Workers in `worker/` — those deploy separately.

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
