# Thrift by Eugy — Products & Admin API

The piece everything else was waiting on. The storefront had no way to read
real products and the admin had no way to write them, because no endpoint
existed. This is that endpoint.

## The security point, first

**The admin panel currently has no authentication.** It sits at `#/admin` on a
public URL. While it's a mock that's harmless — but the moment it writes to the
database, anyone who finds that URL can add, edit, or delete your inventory.

This Worker requires a bearer token on every `/api/admin/*` route. It fails
**closed**: if `ADMIN_TOKEN` isn't configured, admin routes return 503 rather
than allowing access. A missing secret must never mean "let everyone in".

A single shared token is the right weight for a one-person shop — no user
table, no password reset flow, nothing subtle to get wrong. **It stops being
right the moment someone else needs access.** At that point move to Cloudflare
Access, which gives real per-person login without you building auth.

## Endpoints

### Public
| Method | Path | Notes |
|---|---|---|
| GET | `/api/products` | `?category=` `?q=` `?limit=` `?offset=` |
| GET | `/api/products/:sku` | Includes `available` flag |

Public routes only ever return `status='active'` items. Drafts and sold stock
are invisible, and not reachable by guessing a URL.

Single-product lookup still resolves for sold items, returning
`available: false`. For one-of-one stock, links to sold pieces get shared
constantly — "this one's gone, here's what's similar" beats a 404.

### Admin (bearer token required)
| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/products` | Includes drafts and sold; `?status=` |
| POST | `/api/admin/products` | Create |
| PATCH | `/api/admin/products/:sku` | Partial update |
| DELETE | `/api/admin/products/:sku` | **Archives**, never hard-deletes |
| GET | `/api/admin/orders` | Newest first; `?status=` |
| GET | `/api/admin/orders/:id` | With line items |
| GET | `/api/admin/stats` | Dashboard counts |

## Three deliberate behaviours

**Delete archives rather than removes.** Orders reference SKUs. Hard-deleting
a product would break order history, and an order must still read correctly
years later. Archiving takes it out of the shop while keeping the record.

**Reserved items can't be edited.** If a shopper is mid-checkout, editing
returns 409. Changing a price during payment would leave the order total
disagreeing with the product record.

**Placeholder brands are normalised to null on entry.** "N/A", "Generic",
"Unbranded" and similar become empty. Google rejects these on used items, so
catching it at data entry means the Merchant Center feed never has to guess.

## Deploy

```powershell
cd api
wrangler secret put ADMIN_TOKEN
wrangler deploy
```

For the token, generate something long and random — not a password you use
elsewhere:

```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```

Save it in a password manager. It's the only thing standing between the
internet and your product database.

## Test it

```powershell
# public — should work with no token
curl https://your-api-url/api/products

# admin without a token — should return 401
curl https://your-api-url/api/admin/products

# admin with the token — should return your products
curl -H "Authorization: Bearer YOUR_TOKEN" https://your-api-url/api/admin/products
```

The middle one returning 401 is the test that matters. If it returns data, stop
and check the secret was set on the right Worker.

```
python3 test_api.py
```

Nine tests covering the SQL: drafts and sold excluded from public reads,
category and search filters, stats accuracy, archived products keeping order
history readable, and reserved items being detectable for the edit block.
