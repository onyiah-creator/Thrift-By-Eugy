import React, { useState, useMemo, useEffect, useRef } from "react";
import { ALL_PRODUCTS, CATEGORIES, PALETTE } from "./catalogue.js";
import { forYou, trending, completeTheLook } from "./recommender.js";
import { BrandLockup, TEMonogram } from "./BrandLogo.jsx";

/**
 * Thrift by Eugy — storefront
 *
 * Patterns adapted from the reference sites, with thrift-appropriate changes:
 *
 *   Fashion Nova  -> named editorial edits (their "Trend Report"), tabbed
 *                    product rail, recently-viewed + saved, category tiles,
 *                    prominent size guide.
 *   Shein         -> circular category entries built from cutout images,
 *                    price-forward dense grid, mobile-first density.
 *
 * Deliberately NOT copied: countdown timers and % off badges. Both sites lean
 * on manufactured urgency because their stock is infinite. Ours is genuinely
 * one-of-one, so real scarcity is stated plainly instead of dramatised.
 */

const GOLD = "#C9A227";
const GOLD_LIGHT = "#E8C56B";
const INK = "#0A0A0C";
const PANEL = "#141416";
const LINE = "#2a2a2d";
const IVORY = "#F3ECDD";

// Named edits — the single most transferable idea from Fashion Nova.
// For thrift these aren't trend forecasts, they're the curator's eye, which
// is the actual product being sold.
const EDITS = [
  { id: "owambe", name: "Owambe Ready", blurb: "Statement pieces for the weekend you've been invited to", cats: ["Dresses", "Accessories"] },
  { id: "workweek", name: "The Lagos Workweek", blurb: "Tailored, breathable, office-appropriate", cats: ["Outerwear", "Tops"] },
  { id: "denim", name: "Denim, Broken In", blurb: "Already softened by someone else's years", cats: ["Denim"] },
  { id: "quiet", name: "Quiet Luxury", blurb: "Labels that survived. Prices that didn't.", cats: ["Outerwear", "Dresses"] },
];

const ALL = ALL_PRODUCTS;
const naira = (n) => "₦" + n.toLocaleString("en-NG");

// ---------------------------------------------------------------------------
// Product card — price-forward, per Shein. Save button, per Pinterest.
// ---------------------------------------------------------------------------
function Card({ p, onOpen, onSave, saved, tall }) {
  return (
    <div
      onClick={() => onOpen(p)}
      className="group relative cursor-pointer rounded-md overflow-hidden bg-[#141416] border border-[#2a2a2d] hover:border-[#C9A227] transition-colors"
    >
      <div
        className="w-full relative"
        style={{
          height: tall ? p.height : 210,
          background: `linear-gradient(160deg, ${p.color} 0%, #0A0A0C 135%)`,
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
        {p.justIn && (
          <span className="absolute top-2 left-2 text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5 rounded" style={{ background: "rgba(10,10,12,0.75)", color: GOLD }}>
            Just In
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onSave(p); }}
          aria-label={saved ? "Remove from saved" : "Save item"}
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all md:opacity-0 md:group-hover:opacity-100"
          style={{ background: "rgba(10,10,12,0.75)", color: saved ? GOLD : "#bbb", opacity: saved ? 1 : undefined }}
        >
          {saved ? "♥" : "♡"}
        </button>
      </div>

      <div className="p-2.5">
        {/* Price first — Shein's most copyable card decision */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[14px] font-semibold" style={{ color: GOLD }}>{naira(p.price)}</span>
          <span className="text-[10px]" style={{ color: "#777" }}>Size {p.size}</span>
        </div>
        <p className="text-[12px] leading-snug mt-1 line-clamp-2" style={{ color: IVORY }}>{p.name}</p>
        <p className="text-[10px] mt-1" style={{ color: "#666" }}>{p.condition} · 1 available</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function Storefront() {
  const [view, setView] = useState("home");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState([]);
  const [saved, setSaved] = useState([]);
  const [recent, setRecent] = useState([]);
  const [quick, setQuick] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [tab, setTab] = useState("For You");
  const [activeEdit, setActiveEdit] = useState(null);
  const [sizeGuide, setSizeGuide] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(0); // 0 bag · 1 details · 2 payment · 3 confirmed
  const [shipping, setShipping] = useState({ name: "", phone: "", address: "", city: "" });
  const [payMethod, setPayMethod] = useState("card");
  const [orderRef, setOrderRef] = useState(null);

  const open = (p) => {
    setQuick(p);
    setRecent((r) => [p, ...r.filter((x) => x.id !== p.id)].slice(0, 12));
  };
  const toggleSave = (p) =>
    setSaved((s) => (s.find((x) => x.id === p.id) ? s.filter((x) => x.id !== p.id) : [p, ...s]));
  const isSaved = (p) => !!saved.find((x) => x.id === p.id);
  const addToCart = (p) => setCart((c) => (c.find((x) => x.id === p.id) ? c : [...c, p]));
  const total = cart.reduce((s, p) => s + p.price, 0);

  const filtered = useMemo(
    () =>
      ALL.filter(
        (p) =>
          (category === "All" || p.category === category) &&
          p.name.toLowerCase().includes(query.toLowerCase())
      ),
    [category, query]
  );

  const tabItems = useMemo(() => {
    if (tab === "New In") return ALL.filter((p) => p.justIn);
    if (tab === "Dresses") return ALL.filter((p) => p.category === "Dresses");
    if (tab === "Under ₦10k") return ALL.filter((p) => p.price < 10000);
    // "For You" — the real recommendation engine, seeded by what's been viewed
    if (recent.length) return forYou(recent, ALL, { limit: 12 });
    return trending(ALL, { limit: 12 });
  }, [tab, recent]);

  const lookPicks = useMemo(
    () => (quick ? completeTheLook(quick, ALL, { limit: 3 }) : []),
    [quick]
  );

  // First product with a real photo in each category — the Shein-style
  // circles use actual cutouts once a category has one.
  const categoryFace = useMemo(() => {
    const map = {};
    for (const p of ALL) {
      if (p.image && !map[p.category]) map[p.category] = p.image;
    }
    return map;
  }, []);

  const editItems = (edit) => ALL.filter((p) => edit.cats.includes(p.category)).slice(0, 8);

  return (
    <div className="min-h-screen" style={{ background: INK, color: IVORY, fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;1,500;1,600&family=Inter:wght@400;500;600;700&display=swap');
        .font-display { font-family: 'Playfair Display', serif; }
        .line-clamp-2 { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
        .no-sb::-webkit-scrollbar { display:none; }
        .no-sb { scrollbar-width:none; }
        @media (prefers-reduced-motion: reduce){ *{transition:none!important;animation:none!important} }
      `}</style>

      {/* Trust bar — Shein/FN both anchor terms above everything.
          Ours carries the scarcity fact instead of a countdown. */}
      <div className="text-center py-1.5 text-[11px]" style={{ background: PANEL, borderBottom: `1px solid ${LINE}`, color: "#9a9a9a" }}>
        Every piece is one-of-one · Lagos delivery in 48hrs · 3-day returns
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30" style={{ background: INK, borderBottom: `1px solid ${LINE}` }}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
          <button onClick={() => { setView("home"); setActiveEdit(null); }} className="shrink-0">
            <BrandLockup size={30} wordmarkClass="font-display italic text-xl tracking-tight hidden sm:inline" />
          </button>

          <div className="flex-1 max-w-md hidden sm:block">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); if (e.target.value) setView("shop"); }}
              placeholder="Search preloved pieces…"
              className="w-full rounded-full px-4 py-1.5 text-[13px] focus:outline-none"
              style={{ background: PANEL, border: `1px solid ${LINE}`, color: IVORY }}
            />
          </div>

          <div className="flex items-center gap-3 ml-auto text-[12px]">
            <button onClick={() => setSavedOpen(true)} style={{ color: saved.length ? GOLD : "#999" }}>
              ♥ {saved.length > 0 && saved.length}
            </button>
            <button
              onClick={() => setCartOpen(true)}
              className="rounded-full px-3 py-1.5 transition-colors"
              style={{ border: `1px solid ${GOLD}`, color: GOLD }}
            >
              Bag ({cart.length})
            </button>
          </div>
        </div>

        {/* Category strip */}
        <nav className="max-w-6xl mx-auto px-4 pb-2 flex gap-4 overflow-x-auto no-sb text-[12px]">
          <button onClick={() => { setView("home"); setActiveEdit(null); }} style={{ color: view === "home" ? GOLD : "#999" }}>Discover</button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => { setCategory(c); setView("shop"); setActiveEdit(null); }}
              className="whitespace-nowrap"
              style={{ color: view === "shop" && category === c ? GOLD : "#999" }}
            >
              {c}
            </button>
          ))}
          <button onClick={() => setSizeGuide(true)} className="whitespace-nowrap ml-auto" style={{ color: "#777" }}>
            Size Guide
          </button>
        </nav>
      </header>

      {/* ---------------- HOME ---------------- */}
      {view === "home" && !activeEdit && (
        <>
          {/* Hero */}
          <section className="max-w-6xl mx-auto px-4 pt-10 pb-8 grid md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] mb-3" style={{ color: GOLD }}>Curated secondhand · Lagos</p>
              <h1 className="font-display text-4xl md:text-5xl leading-[1.08] mb-4">
                Someone already<br />
                <span className="italic" style={{ color: GOLD }}>loved this first.</span>
              </h1>
              <p className="text-[14px] leading-relaxed mb-6 max-w-md" style={{ color: "#b0b0b0" }}>
                Hand-picked preloved fashion. Every piece checked, photographed, and sold once —
                because there's only ever one.
              </p>
              <button onClick={() => setView("shop")} className="font-semibold text-[13px] px-6 py-3 rounded-full" style={{ background: GOLD, color: INK }}>
                Shop New Arrivals
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {ALL.slice(0, 4).map((p, i) => (
                <div key={p.id} className="relative rounded-md overflow-hidden" style={{ height: i % 2 === 0 ? 165 : 205, marginTop: i % 2 === 0 ? 26 : 0, background: `linear-gradient(160deg, ${p.color} 0%, #0A0A0C 135%)` }}>
                  {p.image && (
                    <img src={p.image} alt={p.name} className="absolute inset-0 w-full h-full object-contain p-2" />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Circular category entries — Shein's pattern, using cutout images */}
          <section className="max-w-6xl mx-auto px-4 py-6">
            <div className="flex gap-5 overflow-x-auto no-sb">
              {CATEGORIES.map((c, i) => (
                <button key={c} onClick={() => { setCategory(c); setView("shop"); }} className="shrink-0 text-center">
                  <div
                    className="relative w-16 h-16 rounded-full mb-1.5 transition-transform hover:scale-105 overflow-hidden"
                    style={{ background: `linear-gradient(150deg, ${PALETTE[i]} 0%, #0A0A0C 140%)`, border: `1px solid ${LINE}` }}
                  >
                    {categoryFace[c] && (
                      <img src={categoryFace[c]} alt={c} className="absolute inset-0 w-full h-full object-cover object-top" />
                    )}
                  </div>
                  <span className="text-[11px]" style={{ color: "#aaa" }}>{c}</span>
                </button>
              ))}
            </div>
          </section>

          {/* THE EDIT — Fashion Nova's Trend Report, reframed as curation */}
          <section className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display italic text-2xl" style={{ color: GOLD_LIGHT }}>The Edit</h2>
              <span className="text-[10px] uppercase tracking-[0.15em]" style={{ color: "#666" }}>Curated by Eugy</span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {EDITS.map((e, i) => (
                <button
                  key={e.id}
                  onClick={() => setActiveEdit(e)}
                  className="text-left rounded-md overflow-hidden group"
                  style={{ border: `1px solid ${LINE}` }}
                >
                  <div className="h-36 relative" style={{ background: `linear-gradient(155deg, ${PALETTE[i + 2]} 0%, #0A0A0C 140%)` }}>
                    <div className="absolute inset-0 flex items-end p-3">
                      <span className="font-display italic text-lg" style={{ color: IVORY }}>{e.name}</span>
                    </div>
                  </div>
                  <p className="text-[11px] p-2.5 leading-snug" style={{ color: "#8f8f8f" }}>{e.blurb}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Tabbed rail — Fashion Nova's "Shop the Latest" */}
          <section className="max-w-6xl mx-auto px-4 py-8">
            <div className="flex gap-4 mb-4 overflow-x-auto no-sb text-[13px]">
              {["For You", "New In", "Dresses", "Under ₦10k"].map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="whitespace-nowrap pb-1.5"
                  style={{
                    color: tab === t ? GOLD : "#888",
                    borderBottom: tab === t ? `1.5px solid ${GOLD}` : "1.5px solid transparent",
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-3 overflow-x-auto no-sb pb-1">
              {tabItems.slice(0, 10).map((p) => (
                <div key={p.id} className="min-w-[150px] w-[150px]">
                  <Card p={p} onOpen={open} onSave={toggleSave} saved={isSaved(p)} />
                </div>
              ))}
            </div>
          </section>

          {/* Recently viewed — FN treats this as first-class */}
          {recent.length > 0 && (
            <section className="max-w-6xl mx-auto px-4 py-6">
              <h2 className="text-[13px] mb-3" style={{ color: "#999" }}>Recently viewed</h2>
              <div className="flex gap-3 overflow-x-auto no-sb pb-1">
                {recent.map((p) => (
                  <div key={p.id} className="min-w-[130px] w-[130px]">
                    <Card p={p} onOpen={open} onSave={toggleSave} saved={isSaved(p)} />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Pinterest-style discovery masonry */}
          <section className="max-w-6xl mx-auto px-4 py-8">
            <h2 className="font-display italic text-2xl mb-4" style={{ color: GOLD_LIGHT }}>Discover</h2>
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 [&>*]:mb-3">
              {ALL.map((p) => (
                <div key={p.id} className="break-inside-avoid">
                  <Card p={p} onOpen={open} onSave={toggleSave} saved={isSaved(p)} tall />
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* ---------------- EDIT DETAIL ---------------- */}
      {activeEdit && (
        <section className="max-w-6xl mx-auto px-4 py-8">
          <button onClick={() => setActiveEdit(null)} className="text-[12px] mb-4" style={{ color: "#888" }}>← Back</button>
          <h1 className="font-display italic text-3xl mb-1" style={{ color: GOLD }}>{activeEdit.name}</h1>
          <p className="text-[13px] mb-6" style={{ color: "#999" }}>{activeEdit.blurb}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {editItems(activeEdit).map((p) => (
              <Card key={p.id} p={p} onOpen={open} onSave={toggleSave} saved={isSaved(p)} />
            ))}
          </div>
        </section>
      )}

      {/* ---------------- SHOP ---------------- */}
      {view === "shop" && !activeEdit && (
        <section className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex gap-2 mb-4 overflow-x-auto no-sb">
            {["All", ...CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className="whitespace-nowrap text-[12px] px-3 py-1.5 rounded-full"
                style={{
                  border: `1px solid ${category === c ? GOLD : LINE}`,
                  color: category === c ? GOLD : "#999",
                  background: category === c ? PANEL : "transparent",
                }}
              >
                {c}
              </button>
            ))}
          </div>
          <p className="text-[11px] mb-3" style={{ color: "#666" }}>{filtered.length} pieces</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filtered.map((p) => (
              <Card key={p.id} p={p} onOpen={open} onSave={toggleSave} saved={isSaved(p)} />
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10" style={{ borderTop: `1px solid ${LINE}` }}>
        <div className="max-w-6xl mx-auto px-4 py-7 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-[11px]" style={{ color: "#777" }}>
          <BrandLockup size={26} wordmarkClass="font-display italic text-base" />
          <span>@thriftbyeugy · your home for exquisite fashion at an affordable price</span>
        </div>
      </footer>

      {/* ---------------- QUICK VIEW ---------------- */}
      {quick && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={() => setQuick(null)}>
          <div className="w-full sm:max-w-md rounded-t-xl sm:rounded-xl overflow-hidden" style={{ background: PANEL, border: `1px solid ${LINE}` }} onClick={(e) => e.stopPropagation()}>
            <div className="relative" style={{ height: 250, background: `linear-gradient(160deg, ${quick.color} 0%, #0A0A0C 135%)` }}>
              {quick.image && (
                <img src={quick.image} alt={quick.name} className="absolute inset-0 w-full h-full object-contain p-3" />
              )}
            </div>
            <div className="p-5">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.15em] mb-1" style={{ color: GOLD }}>{quick.category}</p>
                  <h3 className="font-display text-xl">{quick.name}</h3>
                </div>
                <button onClick={() => toggleSave(quick)} className="text-lg shrink-0" style={{ color: isSaved(quick) ? GOLD : "#888" }}>
                  {isSaved(quick) ? "♥" : "♡"}
                </button>
              </div>
              <p className="text-xl font-semibold my-3" style={{ color: GOLD }}>{naira(quick.price)}</p>
              <p className="text-[12px] mb-1" style={{ color: "#999" }}>
                Size {quick.size} · {quick.condition} condition
              </p>
              {/* Real scarcity, stated plainly — no countdown theatre */}
              <p className="text-[12px] mb-4" style={{ color: GOLD_LIGHT }}>Only one available</p>
              {lookPicks.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] uppercase tracking-[0.15em] mb-2" style={{ color: "#666" }}>
                    Complete the look
                  </p>
                  <div className="flex gap-2">
                    {lookPicks.map((p) => (
                      <button
                        key={p.sku}
                        onClick={() => open(p)}
                        className="flex-1 text-left rounded-md overflow-hidden"
                        style={{ border: `1px solid ${LINE}` }}
                      >
                        <div className="relative h-14" style={{ background: `linear-gradient(160deg, ${p.color} 0%, #0A0A0C 135%)` }}>
                          {p.image && (
                            <img src={p.image} alt={p.name} className="absolute inset-0 w-full h-full object-contain p-1" />
                          )}
                        </div>
                        <div className="px-1.5 py-1">
                          <p className="text-[9px] leading-tight truncate" style={{ color: IVORY }}>{p.name}</p>
                          <p className="text-[10px] font-semibold" style={{ color: GOLD }}>{naira(p.price)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button
                onClick={() => { addToCart(quick); setQuick(null); }}
                className="w-full font-semibold text-[13px] py-3 rounded-full"
                style={{ background: GOLD, color: INK }}
              >
                Add to Bag
              </button>
              <button onClick={() => setSizeGuide(true)} className="w-full text-[11px] mt-2" style={{ color: "#777" }}>
                Check the size guide — vintage sizing runs differently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SAVED ---------------- */}
      {savedOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setSavedOpen(false)}>
          <div className="w-full max-w-sm h-full p-5 overflow-y-auto" style={{ background: INK, borderLeft: `1px solid ${LINE}` }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display italic text-lg" style={{ color: GOLD_LIGHT }}>Saved</h3>
              <button onClick={() => setSavedOpen(false)} className="text-[13px]" style={{ color: "#888" }}>Close</button>
            </div>
            {saved.length === 0 ? (
              <p className="text-[13px]" style={{ color: "#666" }}>
                Tap ♡ on anything you like. Saving doesn't hold the item — one-of-one pieces go to whoever checks out first.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {saved.map((p) => (
                  <Card key={p.id} p={p} onOpen={open} onSave={toggleSave} saved />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- CART / CHECKOUT ---------------- */}
      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => { setCartOpen(false); setCheckoutStep(0); }}
        >
          <div className="w-full max-w-sm h-full p-5 flex flex-col" style={{ background: INK, borderLeft: `1px solid ${LINE}` }} onClick={(e) => e.stopPropagation()}>
            {/* Step indicator */}
            <div className="flex items-center gap-1.5 mb-5">
              {["Bag", "Details", "Payment", "Done"].map((label, i) => (
                <React.Fragment key={label}>
                  <span
                    className="text-[10px] uppercase tracking-[0.1em]"
                    style={{ color: i === checkoutStep ? GOLD : i < checkoutStep ? "#7a6a30" : "#444" }}
                  >
                    {label}
                  </span>
                  {i < 3 && <span className="text-[10px]" style={{ color: "#333" }}>—</span>}
                </React.Fragment>
              ))}
            </div>

            {/* Step 0: Bag */}
            {checkoutStep === 0 && (
              <>
                <h3 className="font-display italic text-lg mb-4" style={{ color: GOLD_LIGHT }}>Your Bag</h3>
                <div className="flex-1 overflow-y-auto space-y-3">
                  {cart.length === 0 && <p className="text-[13px]" style={{ color: "#666" }}>Your bag is empty.</p>}
                  {cart.map((p) => (
                    <div key={p.id} className="flex gap-3 items-center pb-3" style={{ borderBottom: `1px solid ${LINE}` }}>
                      <div className="relative w-14 h-16 rounded overflow-hidden shrink-0" style={{ background: `linear-gradient(160deg, ${p.color} 0%, #0A0A0C 135%)` }}>
                        {p.image && (
                          <img src={p.image} alt={p.name} className="absolute inset-0 w-full h-full object-contain" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-[12px]">{p.name}</p>
                        <p className="text-[12px]" style={{ color: GOLD }}>{naira(p.price)}</p>
                      </div>
                      <button onClick={() => setCart((c) => c.filter((x) => x.id !== p.id))} className="text-[11px]" style={{ color: "#777" }}>Remove</button>
                    </div>
                  ))}
                </div>
                {cart.length > 0 && (
                  <div className="pt-4" style={{ borderTop: `1px solid ${LINE}` }}>
                    <div className="flex justify-between text-[14px] mb-3">
                      <span>Total</span>
                      <span className="font-semibold" style={{ color: GOLD }}>{naira(total)}</span>
                    </div>
                    <button onClick={() => setCheckoutStep(1)} className="w-full font-semibold text-[13px] py-3 rounded-full" style={{ background: GOLD, color: INK }}>
                      Checkout
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Step 1: Delivery details */}
            {checkoutStep === 1 && (
              <>
                <h3 className="font-display italic text-lg mb-4" style={{ color: GOLD_LIGHT }}>Delivery Details</h3>
                <div className="flex-1 space-y-3">
                  {[
                    { key: "name", label: "Full Name", placeholder: "Eugenia Adeyemi" },
                    { key: "phone", label: "Phone Number", placeholder: "080X XXX XXXX" },
                    { key: "address", label: "Delivery Address", placeholder: "Street, Area" },
                    { key: "city", label: "City", placeholder: "Ikeja, Lagos" },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="text-[10px] uppercase tracking-[0.1em]" style={{ color: "#888" }}>{f.label}</label>
                      <input
                        value={shipping[f.key]}
                        onChange={(e) => setShipping((s) => ({ ...s, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full mt-1 rounded px-3 py-2 text-[13px] focus:outline-none"
                        style={{ background: PANEL, border: `1px solid ${LINE}`, color: IVORY }}
                      />
                    </div>
                  ))}
                </div>
                <div className="pt-4 flex gap-2" style={{ borderTop: `1px solid ${LINE}` }}>
                  <button onClick={() => setCheckoutStep(0)} className="px-4 rounded-full text-[13px]" style={{ border: `1px solid ${LINE}`, color: "#999" }}>Back</button>
                  <button
                    disabled={!shipping.name || !shipping.phone || !shipping.address}
                    onClick={() => setCheckoutStep(2)}
                    className="flex-1 font-semibold text-[13px] py-3 rounded-full disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: GOLD, color: INK }}
                  >
                    Continue to Payment
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Payment */}
            {checkoutStep === 2 && (
              <>
                <h3 className="font-display italic text-lg mb-4" style={{ color: GOLD_LIGHT }}>Payment</h3>
                <div className="flex-1 space-y-3">
                  {[
                    { id: "card", label: "Debit / Credit Card" },
                    { id: "transfer", label: "Bank Transfer" },
                    { id: "ussd", label: "USSD" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setPayMethod(m.id)}
                      className="w-full text-left px-3.5 py-3 rounded-lg text-[13px]"
                      style={{
                        border: `1px solid ${payMethod === m.id ? GOLD : LINE}`,
                        background: payMethod === m.id ? PANEL : "transparent",
                        color: payMethod === m.id ? GOLD_LIGHT : "#999",
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                  <p className="text-[11px] pt-2" style={{ color: "#666" }}>
                    Processed securely via Paystack. This demo does not move real money.
                  </p>
                  <div className="flex justify-between text-[14px] pt-3" style={{ borderTop: `1px solid ${LINE}` }}>
                    <span>Total due</span>
                    <span className="font-semibold" style={{ color: GOLD }}>{naira(total)}</span>
                  </div>
                </div>
                <div className="pt-4 flex gap-2">
                  <button onClick={() => setCheckoutStep(1)} className="px-4 rounded-full text-[13px]" style={{ border: `1px solid ${LINE}`, color: "#999" }}>Back</button>
                  <button
                    onClick={() => {
                      setOrderRef("TBE-" + Math.floor(100000 + Math.random() * 900000));
                      setCheckoutStep(3);
                    }}
                    className="flex-1 font-semibold text-[13px] py-3 rounded-full"
                    style={{ background: GOLD, color: INK }}
                  >
                    Pay {naira(total)}
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Confirmation */}
            {checkoutStep === 3 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <TEMonogram size={56} className="mb-4" />
                <h3 className="font-display italic text-xl mb-2" style={{ color: GOLD_LIGHT }}>Order Confirmed</h3>
                <p className="text-[13px] mb-1" style={{ color: "#999" }}>Reference: {orderRef}</p>
                <p className="text-[12px] mb-6 max-w-[220px]" style={{ color: "#666" }}>
                  We'll send delivery updates to {shipping.phone || "your phone"}. Thank you for shopping with Thrift by Eugy.
                </p>
                <button
                  onClick={() => { setCart([]); setCheckoutStep(0); setCartOpen(false); }}
                  className="font-semibold text-[13px] px-6 py-2.5 rounded-full"
                  style={{ background: GOLD, color: INK }}
                >
                  Continue Shopping
                </button>
              </div>
            )}

            {checkoutStep < 3 && (
              <button onClick={() => { setCartOpen(false); setCheckoutStep(0); }} className="text-[11px] mt-3 self-start" style={{ color: "#666" }}>
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------- SIZE GUIDE ---------------- */}
      {sizeGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }} onClick={() => setSizeGuide(false)}>
          <div className="w-full max-w-sm rounded-xl p-5" style={{ background: PANEL, border: `1px solid ${LINE}` }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display italic text-lg mb-2" style={{ color: GOLD_LIGHT }}>Size Guide</h3>
            <p className="text-[12px] mb-4" style={{ color: "#999" }}>
              Vintage and preloved sizing varies a lot by era and brand — a vintage "L" is often a
              modern "M". Every listing includes flat measurements; compare those to a garment you
              already own rather than trusting the label.
            </p>
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ color: "#777" }}>
                  <th className="text-left font-normal pb-2">Size</th>
                  <th className="text-left font-normal pb-2">Bust</th>
                  <th className="text-left font-normal pb-2">Waist</th>
                </tr>
              </thead>
              <tbody style={{ color: "#bbb" }}>
                {[["XS", '32"', '25"'], ["S", '34"', '27"'], ["M", '36"', '29"'], ["L", '39"', '32"'], ["XL", '42"', '35"']].map((r) => (
                  <tr key={r[0]} style={{ borderTop: `1px solid ${LINE}` }}>
                    <td className="py-1.5">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setSizeGuide(false)} className="w-full mt-4 text-[13px] py-2.5 rounded-full" style={{ border: `1px solid ${LINE}`, color: "#999" }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
