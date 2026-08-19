import React, { useState, useMemo } from "react";
import { REAL_PRODUCTS } from "./products.js";

// ---- Brand tokens ----
// ink #0A0A0C, gold #C9A227, gold-light #E8C56B, ivory #F3ECDD, burgundy #5C1A2B

const FLOURISH = (
  <svg viewBox="0 0 200 40" className="w-full h-6 opacity-80" preserveAspectRatio="none">
    <path
      d="M0 20 C 40 5, 60 5, 100 20 C 140 35, 160 35, 200 20"
      stroke="#C9A227"
      strokeWidth="1.5"
      fill="none"
    />
    <circle cx="100" cy="20" r="2.5" fill="#E8C56B" />
  </svg>
);

const CATEGORIES = ["All", "Dresses", "Outerwear", "Denim", "Tops", "Accessories", "Shoes"];

const PALETTE = [
  "#6B2C3E", "#3E5C50", "#8A6E2F", "#3C3C6E", "#7A3B2E", "#2F5C5C", "#5C2F5C", "#4B4B23",
];

function seedName(i) {
  const adjectives = ["Vintage", "Retro", "Classic", "Rare", "Timeless", "Boho", "Preloved", "Statement"];
  const items = ["Trench Coat", "Silk Slip Dress", "Denim Jacket", "Wrap Blouse", "Pleated Skirt", "Knit Cardigan", "Leather Belt", "Ankle Boots", "Cotton Tee", "Wide-Leg Trousers", "Beaded Clutch", "Blazer"];
  const a = adjectives[i % adjectives.length];
  const b = items[(i * 3 + 1) % items.length];
  return `${a} ${b}`;
}

function makeProducts(n, offset = 0) {
  return Array.from({ length: n }).map((_, idx) => {
    const i = idx + offset;
    const cat = CATEGORIES[1 + (i % (CATEGORIES.length - 1))];
    const price = 3500 + ((i * 733) % 18000);
    const height = 220 + ((i * 97) % 140); // for masonry variety
    return {
      id: i,
      name: seedName(i),
      category: cat,
      price,
      color: PALETTE[i % PALETTE.length],
      height,
      size: ["XS", "S", "M", "L", "XL"][i % 5],
      condition: ["Excellent", "Very Good", "Good"][i % 3],
    };
  });
}

const ALL_PRODUCTS = [...REAL_PRODUCTS, ...makeProducts(24)];

function formatNaira(n) {
  return "₦" + n.toLocaleString("en-NG");
}

function ProductCard({ p, onOpen, onAdd, tall }) {
  return (
    <div
      className="group relative rounded-lg overflow-hidden bg-[#141416] border border-[#2a2a2d] hover:border-[#C9A227] transition-colors duration-300 cursor-pointer"
      onClick={() => onOpen(p)}
    >
      <div
        className="relative w-full flex items-end p-3"
        style={{
          height: tall ? p.height : 200,
          background: `linear-gradient(160deg, ${p.color} 0%, #0A0A0C 130%)`,
        }}
      >
        {p.image && (
          <img
            src={p.image}
            alt={p.name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-contain p-2"
          />
        )}
        <span className="relative z-10 text-[10px] tracking-[0.15em] uppercase text-[#E8C56B]/80 font-medium">
          {p.condition}
        </span>
      </div>
      <div className="p-3">
        <p className="text-[13px] text-[#F3ECDD] font-medium leading-snug">{p.name}</p>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[#C9A227] text-[13px] font-semibold">{formatNaira(p.price)}</span>
          <span className="text-[10px] text-[#888]">Size {p.size}</span>
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAdd(p);
        }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity bg-[#C9A227] text-[#0A0A0C] text-[11px] font-semibold px-2.5 py-1 rounded-full"
      >
        + Add
      </button>
    </div>
  );
}

export default function ThriftByEugy() {
  const [category, setCategory] = useState("All");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [quickView, setQuickView] = useState(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState("home"); // home | shop
  const [checkoutStep, setCheckoutStep] = useState(0); // 0 = cart, 1 = details, 2 = payment, 3 = confirmed
  const [shipping, setShipping] = useState({ name: "", phone: "", address: "", city: "" });
  const [payMethod, setPayMethod] = useState("card");
  const [orderRef, setOrderRef] = useState(null);

  const filtered = useMemo(() => {
    return ALL_PRODUCTS.filter((p) => {
      const matchCat = category === "All" || p.category === category;
      const matchQuery = p.name.toLowerCase().includes(query.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [category, query]);

  const recommended = useMemo(() => {
    // mock AI rec: items from same categories as cart, else fallback random slice
    if (cart.length === 0) return ALL_PRODUCTS.slice(4, 10);
    const cats = new Set(cart.map((c) => c.category));
    return ALL_PRODUCTS.filter((p) => cats.has(p.category) && !cart.find((c) => c.id === p.id)).slice(0, 6);
  }, [cart]);

  const addToCart = (p) => setCart((c) => [...c, p]);
  const removeFromCart = (id) =>
    setCart((c) => {
      const idx = c.findIndex((i) => i.id === id);
      if (idx === -1) return c;
      const copy = [...c];
      copy.splice(idx, 1);
      return copy;
    });
  const total = cart.reduce((s, p) => s + p.price, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F3ECDD]" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,700;1,500&family=Inter:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Playfair Display', serif; }
      `}</style>

      {/* Top bar */}
      <div className="bg-[#0A0A0C] border-b border-[#2a2a2d]">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-6">
            <span
              className="font-display italic text-2xl tracking-tight"
              style={{ color: "#C9A227" }}
            >
              Thrift by Eugy
            </span>
            <nav className="hidden md:flex gap-5 text-[13px] text-[#cfcfcf]">
              <button
                onClick={() => setView("home")}
                className={`hover:text-[#C9A227] transition-colors ${view === "home" ? "text-[#C9A227]" : ""}`}
              >
                Discover
              </button>
              <button
                onClick={() => setView("shop")}
                className={`hover:text-[#C9A227] transition-colors ${view === "shop" ? "text-[#C9A227]" : ""}`}
              >
                Shop
              </button>
              <span className="text-[#555]">Sale</span>
              <span className="text-[#555]">New In</span>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search exquisite finds..."
              className="hidden sm:block bg-[#141416] border border-[#2a2a2d] rounded-full px-4 py-1.5 text-[12px] w-52 focus:outline-none focus:border-[#C9A227] placeholder:text-[#666]"
            />
            <button
              onClick={() => setCartOpen(true)}
              className="relative text-[13px] border border-[#C9A227] text-[#C9A227] rounded-full px-3.5 py-1.5 hover:bg-[#C9A227] hover:text-[#0A0A0C] transition-colors"
            >
              Bag ({cart.length})
            </button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto px-5">{FLOURISH}</div>
      </div>

      {view === "home" && (
        <>
          {/* Hero */}
          <section className="max-w-6xl mx-auto px-5 pt-12 pb-16 grid md:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-[11px] tracking-[0.25em] uppercase text-[#C9A227] mb-4">
                Curated Secondhand · Lagos
              </p>
              <h1 className="font-display text-4xl md:text-5xl leading-[1.1] mb-5">
                Exquisite fashion,<br />
                <span className="italic" style={{ color: "#C9A227" }}>thrifted with intention.</span>
              </h1>
              <p className="text-[#b8b8b8] text-[14px] leading-relaxed mb-7 max-w-md">
                One-of-one pieces, hand-picked and quality-checked. Your home for
                exquisite fashion at an affordable price.
              </p>
              <button
                onClick={() => setView("shop")}
                className="bg-[#C9A227] text-[#0A0A0C] font-semibold text-[13px] px-6 py-3 rounded-full hover:bg-[#E8C56B] transition-colors"
              >
                Shop the Collection
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ALL_PRODUCTS.slice(0, 4).map((p, i) => (
                <div
                  key={p.id}
                  className="relative rounded-lg overflow-hidden"
                  style={{
                    height: i % 2 === 0 ? 160 : 200,
                    marginTop: i % 2 === 0 ? 24 : 0,
                    background: `linear-gradient(160deg, ${p.color} 0%, #0A0A0C 130%)`,
                  }}
                >
                  {p.image && (
                    <img
                      src={p.image}
                      alt={p.name}
                      className="absolute inset-0 w-full h-full object-contain p-2"
                    />
                  )}
                </div>
              ))}
            </div>
          </section>

          <div className="max-w-6xl mx-auto px-5">{FLOURISH}</div>

          {/* AI Recommendations */}
          <section className="max-w-6xl mx-auto px-5 py-10">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-xl italic" style={{ color: "#E8C56B" }}>
                {cart.length ? "Styled for you" : "Trending picks"}
              </h2>
              <span className="text-[10px] uppercase tracking-[0.15em] text-[#666]">AI Recommended</span>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1">
              {recommended.map((p) => (
                <div key={p.id} className="min-w-[170px]">
                  <ProductCard p={p} onOpen={setQuickView} onAdd={addToCart} />
                </div>
              ))}
            </div>
          </section>

          <div className="max-w-6xl mx-auto px-5">{FLOURISH}</div>

          {/* Pinterest-style discovery masonry */}
          <section className="max-w-6xl mx-auto px-5 py-10">
            <h2 className="font-display text-xl italic mb-4" style={{ color: "#E8C56B" }}>
              Discover
            </h2>
            <div className="columns-2 sm:columns-3 md:columns-4 gap-4 [&>*]:mb-4">
              {ALL_PRODUCTS.map((p) => (
                <div key={p.id} className="break-inside-avoid">
                  <ProductCard p={p} onOpen={setQuickView} onAdd={addToCart} tall />
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {view === "shop" && (
        <section className="max-w-6xl mx-auto px-5 py-10 grid md:grid-cols-[180px_1fr] gap-8">
          <aside>
            <p className="text-[11px] uppercase tracking-[0.15em] text-[#666] mb-3">Category</p>
            <div className="flex md:flex-col flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={`text-left text-[13px] px-3 py-1.5 rounded-full md:rounded md:px-0 md:py-1 transition-colors ${
                    category === c
                      ? "text-[#C9A227] border md:border-0 border-[#C9A227] bg-[#141416] md:bg-transparent"
                      : "text-[#999] border md:border-0 border-[#2a2a2d]"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </aside>
          <div>
            <p className="text-[12px] text-[#666] mb-4">{filtered.length} items</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {filtered.map((p) => (
                <ProductCard key={p.id} p={p} onOpen={setQuickView} onAdd={addToCart} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-[#2a2a2d] mt-12">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row justify-between gap-4 text-[12px] text-[#777]">
          <span className="font-display italic text-[#C9A227] text-base">Thrift by Eugy</span>
          <span>@thriftbyeugy · your home for exquisite fashion at an affordable price</span>
        </div>
      </footer>

      {/* Quick view modal */}
      {quickView && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setQuickView(null)}
        >
          <div
            className="bg-[#141416] border border-[#2a2a2d] rounded-xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="relative"
              style={{
                height: 260,
                background: `linear-gradient(160deg, ${quickView.color} 0%, #0A0A0C 130%)`,
              }}
            >
              {quickView.image && (
                <img
                  src={quickView.image}
                  alt={quickView.name}
                  className="absolute inset-0 w-full h-full object-contain p-3"
                />
              )}
            </div>
            <div className="p-5">
              <p className="text-[10px] uppercase tracking-[0.15em] text-[#C9A227] mb-1">
                {quickView.category}
              </p>
              <h3 className="font-display text-xl mb-2">{quickView.name}</h3>
              <p className="text-[#C9A227] text-lg font-semibold mb-3">{formatNaira(quickView.price)}</p>
              {quickView.description && (
                <p className="text-[12px] text-[#b8b8b8] leading-relaxed mb-3">{quickView.description}</p>
              )}
              <p className="text-[12px] text-[#999] mb-4">
                Condition: {quickView.condition} · Size {quickView.size} · One-of-one piece
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    addToCart(quickView);
                    setQuickView(null);
                  }}
                  className="flex-1 bg-[#C9A227] text-[#0A0A0C] font-semibold text-[13px] py-2.5 rounded-full hover:bg-[#E8C56B] transition-colors"
                >
                  Add to Bag
                </button>
                <button
                  onClick={() => setQuickView(null)}
                  className="px-4 border border-[#2a2a2d] rounded-full text-[13px] text-[#999]"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart / Checkout drawer */}
      {cartOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex justify-end"
          onClick={() => {
            setCartOpen(false);
            setCheckoutStep(0);
          }}
        >
          <div
            className="bg-[#0A0A0C] border-l border-[#2a2a2d] w-full max-w-sm h-full p-5 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Step indicator */}
            <div className="flex items-center gap-1.5 mb-5">
              {["Bag", "Details", "Payment", "Done"].map((label, i) => (
                <React.Fragment key={label}>
                  <span
                    className={`text-[10px] uppercase tracking-[0.1em] ${
                      i === checkoutStep ? "text-[#C9A227]" : i < checkoutStep ? "text-[#7a6a30]" : "text-[#444]"
                    }`}
                  >
                    {label}
                  </span>
                  {i < 3 && <span className="text-[#333] text-[10px]">—</span>}
                </React.Fragment>
              ))}
            </div>

            {/* Step 0: Bag */}
            {checkoutStep === 0 && (
              <>
                <h3 className="font-display text-lg italic mb-4" style={{ color: "#E8C56B" }}>
                  Your Bag
                </h3>
                <div className="flex-1 overflow-y-auto space-y-3">
                  {cart.length === 0 && <p className="text-[13px] text-[#666]">Your bag is empty.</p>}
                  {cart.map((p, idx) => (
                    <div key={idx} className="flex gap-3 items-center border-b border-[#2a2a2d] pb-3">
                      <div
                        className="relative w-14 h-14 rounded overflow-hidden shrink-0"
                        style={{ background: `linear-gradient(160deg, ${p.color} 0%, #0A0A0C 130%)` }}
                      >
                        {p.image && (
                          <img
                            src={p.image}
                            alt={p.name}
                            className="absolute inset-0 w-full h-full object-contain"
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px]">{p.name}</p>
                        <p className="text-[#C9A227] text-[12px]">{formatNaira(p.price)}</p>
                      </div>
                      <button
                        onClick={() => removeFromCart(p.id)}
                        className="text-[11px] text-[#777] hover:text-[#C9A227]"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                {cart.length > 0 && (
                  <div className="pt-4 border-t border-[#2a2a2d]">
                    <div className="flex justify-between text-[14px] mb-4">
                      <span>Total</span>
                      <span className="text-[#C9A227] font-semibold">{formatNaira(total)}</span>
                    </div>
                    <button
                      onClick={() => setCheckoutStep(1)}
                      className="w-full bg-[#C9A227] text-[#0A0A0C] font-semibold text-[13px] py-3 rounded-full hover:bg-[#E8C56B] transition-colors"
                    >
                      Checkout
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Step 1: Shipping details */}
            {checkoutStep === 1 && (
              <>
                <h3 className="font-display text-lg italic mb-4" style={{ color: "#E8C56B" }}>
                  Delivery Details
                </h3>
                <div className="flex-1 space-y-3">
                  {[
                    { key: "name", label: "Full Name", placeholder: "Eugenia Adeyemi" },
                    { key: "phone", label: "Phone Number", placeholder: "080X XXX XXXX" },
                    { key: "address", label: "Delivery Address", placeholder: "Street, Area" },
                    { key: "city", label: "City", placeholder: "Ikeja, Lagos" },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="text-[10px] uppercase tracking-[0.1em] text-[#888]">{f.label}</label>
                      <input
                        value={shipping[f.key]}
                        onChange={(e) => setShipping((s) => ({ ...s, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full mt-1 bg-[#141416] border border-[#2a2a2d] rounded px-3 py-2 text-[13px] focus:outline-none focus:border-[#C9A227] placeholder:text-[#555]"
                      />
                    </div>
                  ))}
                </div>
                <div className="pt-4 border-t border-[#2a2a2d] flex gap-2">
                  <button
                    onClick={() => setCheckoutStep(0)}
                    className="px-4 border border-[#2a2a2d] rounded-full text-[13px] text-[#999]"
                  >
                    Back
                  </button>
                  <button
                    disabled={!shipping.name || !shipping.phone || !shipping.address}
                    onClick={() => setCheckoutStep(2)}
                    className="flex-1 bg-[#C9A227] disabled:opacity-40 disabled:cursor-not-allowed text-[#0A0A0C] font-semibold text-[13px] py-3 rounded-full hover:bg-[#E8C56B] transition-colors"
                  >
                    Continue to Payment
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Payment */}
            {checkoutStep === 2 && (
              <>
                <h3 className="font-display text-lg italic mb-4" style={{ color: "#E8C56B" }}>
                  Payment
                </h3>
                <div className="flex-1 space-y-3">
                  {[
                    { id: "card", label: "Debit / Credit Card" },
                    { id: "transfer", label: "Bank Transfer" },
                    { id: "ussd", label: "USSD" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setPayMethod(m.id)}
                      className={`w-full text-left px-3.5 py-3 rounded-lg border text-[13px] transition-colors ${
                        payMethod === m.id
                          ? "border-[#C9A227] bg-[#141416] text-[#E8C56B]"
                          : "border-[#2a2a2d] text-[#999]"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                  <p className="text-[11px] text-[#666] pt-2">
                    Processed securely via Paystack. This demo does not move real money.
                  </p>
                  <div className="flex justify-between text-[14px] pt-3 border-t border-[#2a2a2d]">
                    <span>Total due</span>
                    <span className="text-[#C9A227] font-semibold">{formatNaira(total)}</span>
                  </div>
                </div>
                <div className="pt-4 flex gap-2">
                  <button
                    onClick={() => setCheckoutStep(1)}
                    className="px-4 border border-[#2a2a2d] rounded-full text-[13px] text-[#999]"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => {
                      setOrderRef("TBE-" + Math.floor(100000 + Math.random() * 900000));
                      setCheckoutStep(3);
                    }}
                    className="flex-1 bg-[#C9A227] text-[#0A0A0C] font-semibold text-[13px] py-3 rounded-full hover:bg-[#E8C56B] transition-colors"
                  >
                    Pay {formatNaira(total)}
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Confirmation */}
            {checkoutStep === 3 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mb-4 border"
                  style={{ borderColor: "#C9A227" }}
                >
                  <span style={{ color: "#C9A227", fontSize: 22 }}>✓</span>
                </div>
                <h3 className="font-display text-xl italic mb-2" style={{ color: "#E8C56B" }}>
                  Order Confirmed
                </h3>
                <p className="text-[13px] text-[#999] mb-1">Reference: {orderRef}</p>
                <p className="text-[12px] text-[#666] mb-6 max-w-[220px]">
                  We'll send delivery updates to {shipping.phone || "your phone"}. Thank you for shopping with
                  Thrift by Eugy.
                </p>
                <button
                  onClick={() => {
                    setCart([]);
                    setCheckoutStep(0);
                    setCartOpen(false);
                  }}
                  className="bg-[#C9A227] text-[#0A0A0C] font-semibold text-[13px] px-6 py-2.5 rounded-full hover:bg-[#E8C56B] transition-colors"
                >
                  Continue Shopping
                </button>
              </div>
            )}

            {checkoutStep < 3 && (
              <button
                onClick={() => {
                  setCartOpen(false);
                  setCheckoutStep(0);
                }}
                className="text-[11px] text-[#666] mt-3 self-start"
              >
                Close
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
