# Thrift by Eugy — Checkout & Inventory

## The problem this solves

Every product has quantity 1. Two shoppers can hold the same item in their bags
at once; only one can buy it. Get this wrong and you charge two people for one
garment, then refund one and lose them.

**The failure mode is invisible in testing.** Read-then-write looks correct:

```sql
SELECT quantity FROM products WHERE sku = ?   -- returns 1, looks available
UPDATE products SET quantity = 0 WHERE sku = ? -- claim it
```

With one shopper it works perfectly. With two simultaneous shoppers, both read
1, both write 0, both proceed to payment. You only find out when a customer
messages asking where their order is.

**The fix:** never read then write. Put every condition in the WHERE clause of
a single UPDATE and trust the row count:

```sql
UPDATE products SET reserved_by = ?, reserved_until = ?
 WHERE sku = ? AND status = 'active' AND quantity > 0
   AND (reserved_until IS NULL OR reserved_until < datetime('now') OR reserved_by = ?)
```

Exactly one caller can get `changes === 1`. There is no window between the
check and the claim, because they are the same statement.

### Proof, not assertion

```
python3 test_race.py
```

Runs 8 concurrent shoppers against one item:

```
NAIVE   8 concurrent shoppers, 1 item -> 8 winner(s)
ATOMIC  8 concurrent shoppers, 1 item -> 1 winner(s)
```

The naive version sells the same garment eight times. Run this if you ever
change the claim logic.

```
python3 test_flows.py
```

Nine tests: expired reservations reclaimable, same-session idempotency, live
reservations blocking others, sold and draft items unreservable, release
authorisation, webhook idempotency, and the expiry sweep freeing only expired
holds.

## Flow

1. **Reserve** — items claimed atomically, order saved as `pending`, Paystack
   transaction initialised. Items held 15 minutes.
2. **Pay** — shopper completes payment on Paystack.
3. **Webhook** — Paystack calls back. Signature verified, event verified
   independently, amount checked, then order marked `paid` and stock zeroed.
4. **Expiry** — a cron sweep releases anything reserved but never paid.

## Five things that will bite if changed

**1. The webhook is the only place an order becomes paid.** Not the callback
URL — a shopper can close the tab, and the callback can be forged by visiting
the URL directly.

**2. Read the webhook body as raw text, once.** The signature is HMAC-SHA512
over those exact bytes. Re-serialising parsed JSON can reorder keys or change
spacing and fails verification for reasons that look mysterious.

**3. Verify independently after the signature passes.** The signature proves
the payload came from Paystack; the verify call proves the payment actually
succeeded. Both are needed before granting value.

**4. Prices come from the database, never the client.** The reserve endpoint
ignores any price the browser sends and reads it from D1.

**5. Duplicate webhooks are routine, not exceptional.** Paystack retries for up
to 72 hours. Every event is recorded by primary key before being acted on; a
repeat insert fails and the event is skipped.

## Amounts

Paystack works in **kobo**. ₦12,500 is `1250000`. Orders store whole naira and
multiply at the API boundary. The webhook re-checks the paid amount matches.

## Setup

```bash
wrangler d1 create thriftbyeugy
wrangler d1 execute thriftbyeugy --file=./schema.sql
wrangler secret put PAYSTACK_SECRET_KEY
```

`wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "thriftbyeugy"
database_id = "..."

[vars]
SITE_ORIGIN = "https://thriftbyeugy.com"

[triggers]
crons = ["*/5 * * * *"]   # release expired reservations
```

Then in the Paystack dashboard set the webhook URL to
`https://thriftbyeugy.com/api/checkout/webhook`.

## Testing before real money

Use test keys (`sk_test_...`). Paystack provides test cards. Worth doing
deliberately:

- Complete a payment → order `paid`, item disappears from the storefront
- Abandon at the payment page → wait 15 minutes → item returns to sale
- Two browsers, same item, both to checkout → second gets a clear "just bought
  by someone else" message rather than a silent failure
- Replay a webhook → second delivery is ignored

## Why this matters for ads

The moment an item sells, quantity hits 0, and it drops out of both the
storefront and the Merchant Center feed. That's what stops you paying for
clicks on sold stock — and repeated availability mismatches are what get
Merchant Center accounts warned and eventually suspended.

Prove this path works before spending anything on ads.
