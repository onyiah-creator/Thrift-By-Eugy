# Thrift by Eugy — Recommendation Engine

## The two constraints that shaped this

**1. Every item is quantity-of-one.**
The classic e-commerce approach — "customers who bought this also bought
that" — is close to useless for thrift, because the item it recommends is
the one thing now definitely gone. So instead of learning *item-to-item*
relationships, this learns *attribute-to-attribute* ones: shoppers who browse
Dresses tend to browse Shoes. That knowledge survives the item selling.

**2. No order history on day one.**
An engine that needs 10,000 purchases before it works is useless to you now.
This produces sensible results from product attributes alone, then blends in
behavioural signal with a weight that grows as data accumulates:

| Events collected | Behaviour weight |
|---|---|
| under 50 | 0% — pure content matching |
| 50+ | 15% |
| 250+ | 30% |
| 1,000+ | 45% |

No cold-start hole, no sudden change in quality.

## What it powers

| Function | Where it goes | What it does |
|---|---|---|
| `similarItems` | Product page — "You may also like" | Closest matches by attribute |
| `completeTheLook` | Product page — outfit building | Deliberately picks *different* categories that pair well |
| `forYou` | Discovery feed | Personalised from browsing history |
| `trending` | New visitors | Newest stock, spread across categories |

`completeTheLook` matters commercially: someone viewing a top doesn't need
five more tops, they need what goes *with* it. That's how basket size grows.

## How similarity is scored

| Signal | Weight | Notes |
|---|---|---|
| Category | 30% | Same type of garment |
| Colour | 18% | Family-aware — coral matches rust, neutrals match everything |
| Price band | 16% | Ratio-based, so ₦2k↔₦4k differs as much as ₦20k↔₦40k |
| Size | 14% | One size apart still scores — secondhand sizing is inconsistent across eras |
| Style | 14% | Inferred from name and description keywords |
| Condition | 8% | Similar condition tiers |

**Colour handling is deliberately loose.** Exact match scores 1.0, same
family 0.75, and neutrals pair with everything at 0.45. Strict matching would
only ever show coral things next to coral things, which isn't how people
actually dress.

## Two safeguards worth knowing about

**Sold items are never recommended.** Checked on every path. At quantity-of-one
this isn't a nicety — recommending sold stock is the fastest way to lose a
shopper's trust, and it's a constant risk with this inventory model.

**Results are diversified.** A category cap stops the engine returning six
near-identical coral tops. This also applies to the new-visitor feed — without
it, someone landing on the site right after you upload a batch of tops would
see nothing but tops and conclude that's all you sell.

## Testing

```
node test.js
```

18 tests covering exclusion of sold and already-viewed items, colour family
logic, price symmetry, diversity capping, cold-start behaviour, and the
affinity model's refusal to draw conclusions from thin data.

Worth re-running after any weight change — it's easy to tune one signal and
silently break another.

## Deploying

`worker-recommendations.js` exposes:

```
GET  /api/recommendations/similar/:sku
GET  /api/recommendations/complete-the-look/:sku
GET  /api/recommendations/for-you
POST /api/events
```

Needs a D1 `events` table:

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  type TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_created ON events(created_at);
```

The affinity model rebuilds hourly on a cron trigger and caches to KV, rather
than recomputing per request — recommendation latency sits directly in the
shopper's page load.

If recommendations fail, the endpoint returns an empty set rather than an
error. Hide the section in the UI when it comes back empty. A broken
recommendation strip should never take down a product page.

## Privacy

Sessions are anonymous IDs in a cookie — no login required, no personal data
stored. Events keep only session ID, SKU, category, and type. If you add
accounts later, keep recommendation data separate from personal details, and
mention behavioural tracking in your privacy policy (Nigeria's NDPA requires
disclosure of this kind of processing).

## When to upgrade

This is a hand-tuned content-based engine, which is the right tool at your
current scale. Consider moving to embedding-based similarity when you have
roughly 500+ items and 5,000+ events — at that point a model can infer style
relationships from your photos and descriptions better than keyword rules can.
Below that scale, embeddings mostly add cost and complexity for results that
aren't visibly better.
