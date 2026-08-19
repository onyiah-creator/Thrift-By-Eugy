# Thrift by Eugy — Google Merchant Center Feed

## Nigeria: supported, but in beta

Nigeria is a supported target country for Shopping ads and free listings,
listed among Google's **beta** countries. Practically that means: it works,
but performance and feature availability can differ from mature markets, and
some products may not show everywhere. Set expectations accordingly on early
spend, and use NGN — advertising in a foreign currency drastically limits
traffic.

## Two ways to run the feed

| Method | File | Use when |
|---|---|---|
| **Spreadsheet → XML** | `build_feed.py` | Getting started, before the site is live |
| **Live feed endpoint** | `worker-feed.js` | Once the site is running — recommended |

### Spreadsheet method
```
python3 build_feed.py products.xlsx --out feed.xml
python3 build_feed.py products.xlsx --validate-only    # check without writing
```
Upload `feed.xml` to Merchant Center, or host it and let Google fetch it.

### Live method (recommended)
Deploy the Worker and point Merchant Center at:
```
https://thriftbyeugy.com/feeds/google.xml
```
Set up a **scheduled fetch** — daily minimum, hourly is better.

## Why the live feed matters more for thrift than for normal retail

Standard retail sells the same SKU hundreds of times, so a stale feed is a
minor annoyance. **Your inventory is quantity-of-one.** The moment a piece
sells, continuing to advertise it means:

1. Paying for clicks on something nobody can buy
2. Shoppers landing on a sold-out page — the fastest way to lose trust
3. Availability mismatches, which Google penalises. Repeated mismatches
   get accounts warned and eventually suspended

Your checkout must set quantity to 0 the instant an order completes, and the
feed must reflect that quickly. This is the single biggest operational risk
in advertising thrift inventory.

## The identifier problem (most common cause of disapproval)

Google assumes products have manufacturer barcodes. Thrift usually doesn't.

**`identifier_exists` defaults to `yes` when you omit it.** So if you just
leave brand and GTIN blank, Google waits for an identifier that will never
exist, and disapproves the item. It must be set to `no` explicitly.

Both scripts handle this automatically:

| Situation | What gets sent |
|---|---|
| Unbranded piece | `identifier_exists: no`, no brand, no GTIN, no MPN |
| Label survived (e.g. Zara) | `brand`, `mpn` (your SKU), `identifier_exists: yes` |

**Never write "N/A", "Generic", "Unbranded", or "No brand" in the brand
field.** Google rejects these as placeholder values. Leave it empty instead —
both scripts treat those strings as unbranded and strip them, but it's
cleaner not to enter them at all.

Also note: never guess or invent a GTIN. A wrong one is worse than none.

## Required attributes for used apparel

| Attribute | Value | Notes |
|---|---|---|
| `id` | Your SKU | Must be unique and stable |
| `title` | Colour + name + "Preloved" | Colour leads because people search that way |
| `description` | Required | Condition note appended automatically |
| `link` | Product page URL | |
| `image_link` | Main image | White background helps; served via the image pipeline |
| `availability` | `in_stock` / `out_of_stock` | Driven by quantity |
| `price` | e.g. `12500.00 NGN` | Must match the site exactly |
| `condition` | `used` | Always, for thrift |
| `google_product_category` | Taxonomy ID | Mapped from your category |
| `color` | Required for apparel | |
| `size` | Required for apparel | |
| `gender` | `male`/`female`/`unisex` only | Not "women's" — Google rejects it |
| `age_group` | `adult` etc. | |

`gender` currently defaults to `female`. If you start listing menswear or
unisex pieces, add a gender column to the spreadsheet rather than letting the
default mislabel them.

## Validation before you upload

```
python3 build_feed.py products.xlsx --validate-only
```

Separates **errors** (Google will disapprove) from **warnings** (allowed but
worth fixing). Items that aren't `Active` are skipped, and items with errors
are held back rather than submitted — a disapproved item clutters the
Merchant Center dashboard and hides real problems.

## Setup checklist

1. Create a Merchant Center account, set country **Nigeria**, currency **NGN**
2. Verify and claim your domain
3. Add business info, shipping rates, and a returns policy
   (a clear returns policy matters more for secondhand — buyers are warier)
4. Add the feed as a scheduled fetch
5. Wait for the first review — initial approval commonly takes 3–5 days
6. Fix anything in "Needs attention" before increasing spend

## Free listings

Merchant Center also gives free Shopping tab listings, not just paid ads.
Get the feed clean before spending anything — free listings use the same
data, so a correct feed earns visibility before you pay for a single click.
