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

## Brand

The official logo artwork lives in `public/brand/`: `crest.png` (the laurel TE crest) and `wordmark.png` (the script wordmark) form the storefront's header lockup, footer, and order confirmation, and `crest-round.png` (the circular TE medallion) serves as the favicon/touch icon and the compact monogram in the dark-themed views (via `src/BrandLogo.jsx`). The artwork is gold, so it always sits on ink-colored bars; on the light body, gold text uses `GOLD_DEEP` (#8A6E14) for contrast, per the note at the top of `src/Storefront.jsx`.

## Admin panel

Open `#/admin` and sign in with the Worker's `ADMIN_TOKEN`. Three tabs:

- **Add Product** — item details form that `POST`s to the API, publishing live or saving as a draft. Photos upload to the image Worker afterwards (they are keyed by SKU, so the item has to exist first) and the product's `image_count` is patched to match. Without `VITE_IMAGE_API` the panel keeps a local preview and says plainly that nothing was stored.
- **Products** — every product including drafts, sold and archived, filterable by status, with inline **edit**, **publish** / **unpublish**, and **archive**. Publishing a draft is the UI path that previously only existed as a raw API call.
- **Orders** — orders newest first, filterable by status, expanding to show contact details and line items.

A stats strip across the top reads `/api/admin/stats`: live, drafts, sold, reserved now, pending and paid orders, and revenue.

**The token is held in React state only** — never localStorage, sessionStorage, or a cookie — so closing the tab ends the session and nothing can read it back later. It is sent as `Authorization: Bearer …` on every admin call.

## Image pipeline

`images/worker-images.js` (config `images/wrangler.toml`) stores one full-quality master per photo in R2 and derives every delivered size from it: thumb / card / detail / zoom, encoded as AVIF, WebP or JPEG per the browser's `Accept` header, with EXIF (including phone GPS) stripped on delivery.

```bash
cd images
wrangler r2 bucket create thriftbyeugy-images
wrangler secret put ADMIN_TOKEN     # the SAME token as the products API
wrangler deploy
```

Then set `VITE_IMAGE_API` (admin uploads) and `VITE_IMAGE_BASE` (storefront delivery) to the deployed URL.

**"Clean up automatically" does not work yet.** Background removal needs a model Workers cannot host, so the Worker calls out to a separate service that has not been stood up. Until `CUTOUT_SERVICE_URL` is set it skips the attempt and stores the photo as shot — still compressed and format-optimised — and both the Worker and the admin panel say so rather than implying the cleanup ran. See [docs/IMAGE_DEPLOY_GUIDE.md](docs/IMAGE_DEPLOY_GUIDE.md) for the two ways to close that gap, and [docs/IMAGE_GUIDE.md](docs/IMAGE_GUIDE.md) for the format and sizing rationale.

## 360° spin viewer

`src/SpinViewer.jsx` exports `SpinViewer`, a drag-to-rotate frame viewer (mouse, touch, arrow keys, scrub bar, auto-spin, full preload). Try the interaction at `#/spin`, which renders generated placeholder frames. Real spins are shot on the mannequin at fixed intervals and prepared with `scripts/prep_spin.py` — it applies one shared crop box across all frames so the garment doesn't jitter (photos go in `spin_raw/<SKU>/` next to the script; output lands in `spin_out/<SKU>/` with a manifest). See [docs/SPIN_GUIDE.md](docs/SPIN_GUIDE.md) for the shooting checklist and why frames beat GIF/video.

## Adding stock

`scripts/Add-Product.ps1` talks to the deployed API directly, so products added this way are real — they live in D1 and show up in the storefront and admin panel immediately. The admin panel can do all of this too; the script stays useful for bulk CSV imports.

```powershell
$env:TBE_TOKEN = "your-admin-token"      # never hard-coded in the script
$env:TBE_API   = "https://thriftbyeugy-api.onyiah.workers.dev"

.\scripts\Add-Product.ps1                                  # interactive prompts
.\scripts\Add-Product.ps1 -List                            # what is in the database
.\scripts\Add-Product.ps1 -Stats                           # dashboard counts
.\scripts\Add-Product.ps1 -FromCsv .\templates\products-template.csv   # bulk import
```

Everything is created as a **draft** — nothing goes live until you have seen it listed. SKUs auto-continue the `TBE-####` sequence, and the token is read from an environment variable so it never lands in the repo.

The script is saved UTF-8 **with BOM** and CRLF line endings, and `.gitattributes` keeps it that way on checkout — without the BOM, Windows PowerShell 5.1 reads it as ANSI and mangles non-ASCII characters.

`templates/products-template.csv` is the bulk-import format (the richer `templates/ThriftByEugy_Product_Template.xlsx` remains the full cataloguing sheet, including image filenames).

## Frontend ↔ API

`src/api.js` is the single client for both the storefront and the admin panel. The storefront, the Recommender Lab and the admin panel all read the live database — there is no demo catalogue left in the code.

The Worker sets `Access-Control-Allow-Origin` to `SITE_ORIGIN` (the deployed Pages URL), so a browser on `localhost` would be refused. Rather than loosening that, `vite.config.js` proxies `/api` to the Worker in dev and preview, keeping those calls same-origin. A production build calls the Worker URL directly, where the origin does match.

| Variable | Effect |
| --- | --- |
| `VITE_API_URL` | Override the API base (e.g. a local mock). Defaults to the dev proxy in development and the live Worker in a build. |
| `VITE_API_PROXY` | Change what the dev/preview proxy points at. |
| `VITE_IMAGE_BASE` | Serve product photos from the image pipeline Worker. Until it is deployed, the committed photos in `public/products/` are used, and anything without one falls back to its colour gradient. |
| `VITE_IMAGE_API` | Image Worker base URL for admin uploads. Unset means photos are previewed but not stored. |

The API stores a colour *name* ("Coral"); the client maps it to a hex for the card gradient behind a cut-out photo, falling back to a stable palette pick per SKU.

## Products & admin API

`api/worker-api.js` (config: `api/wrangler.toml`) is the read/write layer the storefront and admin panel need. Public routes (`GET /api/products`, `GET /api/products/:sku`) only ever return `status='active'` stock, so drafts and sold pieces can't be reached by guessing a URL — though a single sold item still resolves with `available: false`, because links to sold one-of-one pieces get shared constantly and "this one's gone, here's what's similar" beats a 404.

Admin routes (`/api/admin/*` — products CRUD, orders, stats) require a bearer token, compared in constant time, and **fail closed**: with no `ADMIN_TOKEN` configured they return 503 rather than allowing access. Deleting archives rather than hard-deletes (orders reference SKUs and must stay readable), reserved items can't be edited mid-checkout (409), and placeholder brands like "N/A" or "Unbranded" are normalised to null on entry so the Merchant Center feed never has to guess.

```bash
cd api
wrangler secret put ADMIN_TOKEN          # long and random; store in a password manager
wrangler deploy
```

The products/admin API deploys from `api/`, which has its own `wrangler.toml`. The other Workers live in `worker/`, where `wrangler.toml` is the deployed checkout Worker and `wrangler-images.toml.example` is the image pipeline template (deploy a non-default config with `--config <file>`). The shared D1 schema is `worker/schema.sql`.

The test that matters after deploying: `curl https://<api-url>/api/admin/products` with **no** token must return 401. See [docs/API_GUIDE.md](docs/API_GUIDE.md).

> The admin panel now holds the token behind a sign-in and keeps it in memory only. A single shared token is right for a one-person shop; move to Cloudflare Access the moment someone else needs their own login.

## Checkout & inventory backend

`worker/worker-checkout.js` + `worker/schema.sql` (Cloudflare Worker + D1) handle the one-of-one race: reservations are claimed with a single conditional `UPDATE` (never read-then-write), orders only become `paid` through the signature-verified Paystack webhook, duplicate webhooks are rejected by primary key, and a cron sweep releases expired 15-minute holds. Amounts are stored in whole naira and converted to kobo at the Paystack boundary; prices always come from the database, never the client.

Prove the race logic any time it changes — `npm run test:backend` runs all three backend suites against the real schema:

```bash
python3 scripts/test_race.py    # 8 concurrent shoppers, 1 item → exactly 1 winner
python3 scripts/test_flows.py   # 9 reservation/webhook/expiry flow tests
python3 scripts/test_api.py     # 9 API SQL/visibility tests
```

See [docs/CHECKOUT_GUIDE.md](docs/CHECKOUT_GUIDE.md) for the flow, Paystack setup, and the five things that will bite if changed.

> **Preview note:** `public/robots.txt` and a `noindex` meta currently keep the demo catalogue out of search engines. Remove both when the real catalogue and checkout go live.

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
