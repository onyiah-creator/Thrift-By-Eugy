-- Thrift by Eugy — database schema (Cloudflare D1 / SQLite)
--
-- The defining constraint: every product has quantity 1. Two shoppers can
-- have the same item in their bag at the same time, and only one can win.
-- That race is handled with short-lived reservations plus conditional
-- updates, never with read-then-write (which loses races silently).

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  sku              TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL,
  price            INTEGER NOT NULL,          -- whole naira; converted to kobo at Paystack
  size             TEXT,
  condition_grade  TEXT,
  color            TEXT,
  brand            TEXT,
  description      TEXT,
  image_count      INTEGER DEFAULT 0,
  has_spin         INTEGER DEFAULT 0,
  quantity         INTEGER NOT NULL DEFAULT 1,
  status           TEXT NOT NULL DEFAULT 'draft',   -- draft | active | sold | archived

  -- Reservation: set while a shopper is paying, cleared on failure/expiry.
  -- Held here rather than in a separate row so the check and the claim can
  -- happen in one atomic UPDATE.
  reserved_by      TEXT,                       -- session id
  reserved_until   TEXT,                       -- ISO timestamp

  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_listing  ON products(status, quantity);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_reserved ON products(reserved_until);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id              TEXT PRIMARY KEY,            -- TBE-ORD-xxxxxx, also the Paystack reference
  session_id      TEXT,
  email           TEXT NOT NULL,
  phone           TEXT,
  full_name       TEXT,
  address         TEXT,
  city            TEXT,

  amount          INTEGER NOT NULL,            -- whole naira, what we expect to be paid
  currency        TEXT NOT NULL DEFAULT 'NGN',

  -- pending  : reserved, awaiting payment
  -- paid     : verified against Paystack, stock decremented
  -- failed   : payment failed or abandoned, reservation released
  -- cancelled: released by expiry sweep
  status          TEXT NOT NULL DEFAULT 'pending',

  paystack_ref    TEXT,
  paystack_id     TEXT,
  paid_at         TEXT,

  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_ref    ON orders(paystack_ref);

-- ---------------------------------------------------------------------------
-- Order lines. Price is copied in, not joined — an order must still read
-- correctly if the product is later edited or archived.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    TEXT NOT NULL REFERENCES orders(id),
  sku         TEXT NOT NULL,
  name        TEXT NOT NULL,
  price       INTEGER NOT NULL,
  size        TEXT,
  UNIQUE(order_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ---------------------------------------------------------------------------
-- Webhook idempotency.
-- Paystack retries for up to 72 hours, so duplicates are expected, not
-- exceptional. Every webhook is recorded before it is acted on; a repeat
-- insert fails the PK constraint and the event is skipped.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS webhook_events (
  id           TEXT PRIMARY KEY,               -- {event}:{data.id}
  event        TEXT NOT NULL,
  reference    TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  payload      TEXT
);

-- ---------------------------------------------------------------------------
-- Browsing events, for the recommendation engine's affinity model
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  sku        TEXT,
  category   TEXT,
  type       TEXT NOT NULL,                    -- view | add_to_cart | purchase
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

-- ---------------------------------------------------------------------------
-- Sample data
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO products
  (sku, name, category, price, size, condition_grade, color, description, image_count, quantity, status)
VALUES
  ('TBE-0001','Lace Peplum Top','Tops',12500,'M','Excellent','Coral',
   'Off-shoulder cotton peplum top with crochet lace trim and elasticated waist.',2,1,'active'),
  ('TBE-0002','Ruffle Wrap Blouse','Tops',9800,'S','Very Good','Lime Green',
   'Pleated chiffon wrap blouse with tiered ruffle detail and elasticated hem.',1,1,'active');
