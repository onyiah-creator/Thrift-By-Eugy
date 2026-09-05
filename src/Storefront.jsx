import React, { useState, useMemo, useEffect, useCallback } from "react";
import { CATEGORIES, fetchProducts } from "./api.js";
import { SpinViewer } from "./SpinViewer.jsx";
import { forYou, trending, completeTheLook } from "./recommender.js";

/**
 * Thrift by Eugy — storefront (light theme)
 *
 * Palette shifted from ink-on-black to an editorial light ground, following
 * Fashion Nova's approach: garments read far better against white, and a
 * white product background is also what Google Merchant Center prefers.
 *
 * IMPORTANT COLOUR NOTE
 * The brand gold #C9A227 scores only 2.42:1 against white — well below the
 * 4.5:1 needed for readable text. So gold is split into two roles:
 *   GOLD      #C9A227 — fills, buttons, rules, the crest. Never text on white.
 *   GOLD_DEEP #8A6E14 — gold-coloured TEXT on light (4.86:1, passes).
 * Ink carries all body copy, exactly as Fashion Nova uses black.
 */

const CREST = "/brand/crest.png";
const WORDMARK = "/brand/wordmark.png";

// ---- Palette ----
const INK = "#111112";          // body text
const INK_SOFT = "#6B6B70";     // secondary text
const GOLD = "#C9A227";         // fills / buttons / crest
const GOLD_DEEP = "#8A6E14";    // gold text on light — passes contrast
const CREAM = "#FAF8F4";        // section ground
const WHITE = "#FFFFFF";
const HAIR = "#E6E2DA";         // hairline borders

const EDITS = [
  { id: "owambe", name: "Owambe Ready", blurb: "Statement pieces for the weekend you've been invited to", cats: ["Dresses", "Accessories"] },
  { id: "workweek", name: "The Lagos Workweek", blurb: "Tailored, breathable, office-appropriate", cats: ["Outerwear", "Tops"] },
  { id: "denim", name: "Denim, Broken In", blurb: "Already softened by someone else's years", cats: ["Denim"] },
  { id: "quiet", name: "Quiet Luxury", blurb: "Labels that survived. Prices that didn't.", cats: ["Outerwear", "Dresses"] },
];

const PALETTE = ["#C8836B", "#7E9B8A", "#C9A227", "#6E7BA6", "#B5674F", "#5F8A8A", "#9A6E92", "#8A8A55"];

// A product row can claim an image_count whose object was never stored, and a
// variant can 404. Hiding the <img> reveals the colour gradient painted behind
// it, which is a far better empty state than a broken-image icon.
const hideBrokenImage = (e) => { e.currentTarget.style.display = "none"; };

const naira = (n) => "\u20A6" + n.toLocaleString("en-NG");

// ---------------------------------------------------------------------------
// Wordmark — crest and name side by side
// ---------------------------------------------------------------------------
function Wordmark({ onClick, compact }) {
  // Crest and script wordmark side by side, separated by a gold hairline.
  // Both are gold artwork, so this lockup lives on the ink bar where the
  // brand gold has proper contrast — never on the white body.
  //
  // Sizing is responsive via CSS classes rather than fixed px: at full desktop
  // size the lockup is ~360px wide, which overflows a phone viewport once the
  // menu, saved and bag controls are added alongside it. min-w-0 lets it
  // shrink rather than forcing the page into horizontal scroll.
  const crest = compact ? "h-[34px]" : "h-[28px] min-[400px]:h-[34px] sm:h-[44px] lg:h-[52px]";
  const wm = compact ? "h-[20px]" : "h-[16px] min-[400px]:h-[19px] sm:h-[25px] lg:h-[30px]";
  const rule = compact ? "h-[20px]" : "h-[17px] min-[400px]:h-[20px] sm:h-[26px] lg:h-[32px]";

  return (
    <button
      onClick={onClick}
      className="flex items-center min-w-0 shrink"
      aria-label="Thrift by Eugy — home"
    >
      <img src={CREST} alt="" className={`block w-auto shrink-0 ${crest}`} />
      <span
        aria-hidden="true"
        className={`block shrink-0 mx-1.5 min-[400px]:mx-2 sm:mx-3 lg:mx-4 ${rule}`}
        style={{ width: 1, background: "linear-gradient(transparent, rgba(201,162,39,0.55), transparent)" }}
      />
      <img
        src={WORDMARK}
        alt="Thrift by Eugy"
        className={`block w-auto max-w-full ${wm}`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Product card — light ground, price in ink (Fashion Nova convention)
// ---------------------------------------------------------------------------
function Card({ p, onOpen, onSave, saved, tall }) {
  return (
    <div onClick={() => onOpen(p)} className="group cursor-pointer">
      <div
        className="relative overflow-hidden rounded-sm"
        style={{ height: tall ? p.height : 250, background: CREAM, border: `1px solid ${HAIR}` }}
      >
        <div className="absolute inset-0" style={{ background: `linear-gradient(165deg, ${p.color}33 0%, ${p.color}88 100%)` }} />
        {p.image && (
          <img
            src={p.image}
            alt={p.name} onError={hideBrokenImage}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-contain p-2"
          />
        )}
        {p.justIn && (
          <span className="absolute top-2 left-2 text-[9px] uppercase tracking-[0.12em] px-2 py-1" style={{ background: INK, color: WHITE }}>
            Just In
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onSave(p); }}
          aria-label={saved ? "Remove from saved" : "Save"}
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-[13px] transition-opacity"
          style={{ background: "rgba(255,255,255,0.92)", color: saved ? "#C0392B" : INK_SOFT, boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
        >
          {saved ? "\u2665" : "\u2661"}
        </button>
      </div>

      <div className="pt-2">
        {/* Fixed two-line slot: without it a one-line title and a two-line
            title push their prices to different heights, and the grid rows
            visibly misalign. */}
        <p className="text-[12px] leading-snug line-clamp-2 min-h-[2.4em]" style={{ color: INK }}>{p.name}</p>
        <p className="text-[14px] font-semibold mt-1" style={{ color: INK }}>{naira(p.price)}</p>
        <p className="text-[10.5px] mt-0.5" style={{ color: INK_SOFT }}>
          Size {p.size} · {p.condition} · 1 left
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Catalogue status — shown instead of product grids while the live catalogue
// is loading, unreachable, or genuinely empty. An empty shop is a normal
// state for one-of-one stock: it means everything sold.
// ---------------------------------------------------------------------------
function CatalogueStatus({ loading, error, onRetry }) {
  if (loading) {
    return (
      <section className="max-w-6xl mx-auto px-4 py-16 text-center">
        <div className="inline-block w-6 h-6 rounded-full mb-4" style={{ border: `2px solid ${HAIR}`, borderTopColor: GOLD, animation: "tbe-spin 0.8s linear infinite" }} />
        <p className="text-[13px]" style={{ color: INK_SOFT }}>Loading the collection…</p>
        <style>{`@keyframes tbe-spin { to { transform: rotate(360deg) } }`}</style>
      </section>
    );
  }
  if (error) {
    return (
      <section className="max-w-6xl mx-auto px-4 py-16 text-center">
        <h2 className="font-display italic text-2xl mb-2" style={{ color: INK }}>The rail is not loading</h2>
        <p className="text-[13px] mb-5 max-w-sm mx-auto" style={{ color: INK_SOFT }}>{error}</p>
        <button onClick={onRetry} className="font-medium text-[13px] px-6 py-3" style={{ background: INK, color: WHITE }}>
          Try again
        </button>
      </section>
    );
  }
  return (
    <section className="max-w-6xl mx-auto px-4 py-16 text-center">
      <h2 className="font-display italic text-2xl mb-2" style={{ color: INK }}>Everything has found a home</h2>
      <p className="text-[13px] max-w-sm mx-auto" style={{ color: INK_SOFT }}>
        Every piece here is one-of-one, so the rail empties as things sell. New arrivals are photographed and listed weekly.
      </p>
    </section>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState("For You");
  const [activeEdit, setActiveEdit] = useState(null);
  const [sizeGuide, setSizeGuide] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(0); // 0 bag · 1 details · 2 payment · 3 confirmed
  const [shipping, setShipping] = useState({ name: "", phone: "", address: "", city: "" });
  const [payMethod, setPayMethod] = useState("card");
  const [orderRef, setOrderRef] = useState(null);

  // Live catalogue. Only sellable stock is ever returned, so anything here can
  // be bought; a sold piece simply stops appearing on the next load.
  const [ALL, setAll] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const reload = useCallback(() => {
    setLoading(true);
    return fetchProducts({ limit: 60 })
      .then(({ products }) => { setAll(products); setLoadError(""); })
      .catch((err) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const open = (p) => { setQuick(p); setRecent((r) => [p, ...r.filter((x) => x.id !== p.id)].slice(0, 12)); };
  const toggleSave = (p) => setSaved((s) => (s.find((x) => x.id === p.id) ? s.filter((x) => x.id !== p.id) : [p, ...s]));
  const isSaved = (p) => !!saved.find((x) => x.id === p.id);
  const addToCart = (p) => setCart((c) => (c.find((x) => x.id === p.id) ? c : [...c, p]));
  const total = cart.reduce((s, p) => s + p.price, 0);
  const home = () => { setView("home"); setActiveEdit(null); setMenuOpen(false); };

  const filtered = useMemo(
    () => ALL.filter((p) => (category === "All" || p.category === category) && p.name.toLowerCase().includes(query.toLowerCase())),
    [category, query]
  );

  const tabItems = useMemo(() => {
    if (tab === "New In") return ALL.filter((p) => p.justIn);
    if (tab === "Dresses") return ALL.filter((p) => p.category === "Dresses");
    if (tab === "Under \u20A610k") return ALL.filter((p) => p.price < 10000);
    // "For You" \u2014 the real recommendation engine, seeded by browsing history
    if (recent.length) return forYou(recent, ALL, { limit: 12 });
    return trending(ALL, { limit: 12 });
  }, [tab, recent]);

  const lookPicks = useMemo(
    () => (quick ? completeTheLook(quick, ALL, { limit: 3 }) : []),
    [quick]
  );

  // First product with a real photo per category \u2014 fronts the circle entries.
  const categoryFace = useMemo(() => {
    const map = {};
    for (const p of ALL) {
      if (p.image && !map[p.category]) map[p.category] = p.image;
    }
    return map;
  }, []);

  const goCat = (c) => { setCategory(c); setView("shop"); setActiveEdit(null); setMenuOpen(false); };

  return (
    <div className="min-h-screen overflow-x-hidden" style={{ background: WHITE, color: INK, fontFamily: "Inter, sans-serif" }}>
      {/* ---------------- NAV ---------------- */}
      {/* Utility bar — dark strip keeps a trace of the brand's ink identity
          and carries the terms, mirroring how FN anchors promo info up top. */}
      <div className="text-center py-2 text-[11px] tracking-wide" style={{ background: "#000000", color: "#C9C5BD" }}>
        Every piece is one-of-one · Lagos delivery in 48hrs · 3-day returns
      </div>

      <header className="sticky top-0 z-30" style={{ background: INK }}>
        {/* Row 1 — logo, search, actions */}
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-[60px] sm:h-[72px] lg:h-[84px] flex items-center gap-2 sm:gap-4">
          <button onClick={() => setMenuOpen(true)} className="md:hidden text-[19px] leading-none shrink-0 pr-1" style={{ color: "#E8E4DC" }} aria-label="Open menu">
            &#9776;
          </button>

          <Wordmark onClick={home} />

          <div className="flex-1 hidden md:block max-w-lg mx-auto">
            <div className="relative">
              <input
                value={query}
                onChange={(e) => { setQuery(e.target.value); if (e.target.value) setView("shop"); }}
                placeholder="Search preloved pieces"
                className="w-full rounded-full pl-10 pr-4 py-2 text-[13px] focus:outline-none"
                style={{ background: "#1C1C1F", border: "1px solid #33333A", color: "#F3ECDD" }}
              />
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[13px]" style={{ color: "#8C8880" }}>&#9906;</span>
            </div>
          </div>

          <div className="flex items-center gap-2 min-[400px]:gap-3 sm:gap-4 ml-auto shrink-0">
            <button onClick={() => setSizeGuide(true)} className="hidden lg:block text-[12px]" style={{ color: "#A8A49C" }}>
              Size Guide
            </button>
            <button onClick={() => setSavedOpen(true)} className="relative text-[17px] leading-none shrink-0" aria-label="Saved" style={{ color: saved.length ? "#E8646B" : "#E8E4DC" }}>
              {saved.length ? "\u2665" : "\u2661"}
              {saved.length > 0 && (
                <span className="absolute -top-1.5 -right-2 text-[9px] rounded-full w-4 h-4 flex items-center justify-center" style={{ background: INK, color: WHITE }}>
                  {saved.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setCartOpen(true)}
              className="text-[10.5px] min-[400px]:text-[11px] sm:text-[12px] font-medium rounded-full px-2.5 min-[400px]:px-3 sm:px-4 py-1.5 sm:py-2 whitespace-nowrap shrink-0"
              style={{ background: GOLD, color: INK }}
            >
              Bag ({cart.length})
            </button>
          </div>
        </div>

        {/* Row 2 — categories. Gold underline marks the active item; the gold
            is decorative here, never carrying the text colour on white. */}
        <nav className="hidden md:block" style={{ borderTop: "1px solid #26262B", background: INK }}>
          <div className="max-w-6xl mx-auto px-4 flex items-center gap-7 h-11 text-[12px] tracking-wide uppercase">
            <button onClick={home} className="relative h-full" style={{ color: view === "home" ? GOLD : "#A8A49C", fontWeight: view === "home" ? 600 : 400 }}>
              Discover
              {view === "home" && <span className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: GOLD }} />}
            </button>
            {CATEGORIES.map((c) => {
              const on = view === "shop" && category === c;
              return (
                <button key={c} onClick={() => goCat(c)} className="relative h-full whitespace-nowrap" style={{ color: on ? GOLD : "#A8A49C", fontWeight: on ? 600 : 400 }}>
                  {c}
                  {on && <span className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: GOLD }} />}
                </button>
              );
            })}
            <button onClick={() => { setView("shop"); setCategory("All"); }} className="ml-auto" style={{ color: "#F3ECDD", fontWeight: 600 }}>
              Shop All
            </button>
          </div>
        </nav>

        {/* Mobile search */}
        <div className="md:hidden px-4 pb-3">
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); if (e.target.value) setView("shop"); }}
            placeholder="Search preloved pieces"
            className="w-full rounded-full px-4 py-2 text-[13px] focus:outline-none"
            style={{ background: "#1C1C1F", border: "1px solid #33333A", color: "#F3ECDD" }}
          />
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-50 md:hidden" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setMenuOpen(false)}>
          <div className="w-72 h-full" style={{ background: WHITE }} onClick={(e) => e.stopPropagation()}>
            {/* Gold artwork needs an ink ground to stay legible */}
            <div className="px-5 py-4" style={{ background: INK }}>
              <Wordmark onClick={home} compact />
            </div>
            <div className="px-5 pt-4 flex flex-col gap-1">
              <button onClick={home} className="text-left py-2.5 text-[14px]" style={{ borderBottom: `1px solid ${HAIR}`, color: INK }}>Discover</button>
              {CATEGORIES.map((c) => (
                <button key={c} onClick={() => goCat(c)} className="text-left py-2.5 text-[14px]" style={{ borderBottom: `1px solid ${HAIR}`, color: INK }}>{c}</button>
              ))}
              <button onClick={() => { setSizeGuide(true); setMenuOpen(false); }} className="text-left py-2.5 text-[14px]" style={{ color: GOLD_DEEP }}>Size Guide</button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- HOME ---------------- */}
      {view === "home" && !activeEdit && (
        <>
          <section className="max-w-6xl mx-auto px-4 pt-10 pb-12 grid md:grid-cols-2 gap-10 items-center">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] mb-4" style={{ color: GOLD_DEEP }}>Curated secondhand · Lagos</p>
              <h1 className="font-display text-[42px] md:text-[54px] leading-[1.05] mb-5" style={{ color: INK }}>
                Someone already<br /><span className="italic">loved this first.</span>
              </h1>
              <p className="text-[14px] leading-relaxed mb-7 max-w-md" style={{ color: INK_SOFT }}>
                Hand-picked preloved fashion. Every piece checked, photographed, and sold once —
                because there's only ever one.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setView("shop")} className="font-medium text-[13px] px-7 py-3" style={{ background: INK, color: WHITE }}>
                  Shop New Arrivals
                </button>
                <button onClick={() => setView("shop")} className="font-medium text-[13px] px-7 py-3" style={{ border: `1px solid ${INK}`, color: INK }}>
                  Browse All
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ALL.slice(0, 4).map((p, i) => (
                <div key={p.id} className="relative rounded-sm overflow-hidden" style={{ height: i % 2 === 0 ? 175 : 215, marginTop: i % 2 === 0 ? 28 : 0, background: `linear-gradient(165deg, ${p.color}33 0%, ${p.color}99 100%)`, border: `1px solid ${HAIR}` }}>
                  {p.image && (
                    <img src={p.image} alt={p.name} onError={hideBrokenImage} className="absolute inset-0 w-full h-full object-contain p-2" />
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* Circular category entries */}
          <section className="max-w-6xl mx-auto px-4 py-8" style={{ borderTop: `1px solid ${HAIR}` }}>
            <div className="flex gap-7 overflow-x-auto no-sb justify-start md:justify-center">
              {CATEGORIES.map((c, i) => (
                <button key={c} onClick={() => goCat(c)} className="shrink-0 text-center group">
                  <div className="relative w-[68px] h-[68px] rounded-full mb-2 transition-transform group-hover:scale-105 overflow-hidden" style={{ background: `linear-gradient(150deg, ${PALETTE[i]}44 0%, ${PALETTE[i]} 130%)`, border: `1px solid ${HAIR}` }}>
                    {categoryFace[c] && (
                      <img src={categoryFace[c]} alt={c} onError={hideBrokenImage} className="absolute inset-0 w-full h-full object-cover object-top" />
                    )}
                  </div>
                  <span className="text-[11px]" style={{ color: INK }}>{c}</span>
                </button>
              ))}
            </div>
          </section>

          {(loading || loadError || ALL.length === 0) && (
            <CatalogueStatus loading={loading} error={loadError} onRetry={reload} />
          )}

          {!loading && !loadError && ALL.length > 0 && (<>
          {/* THE EDIT */}
          <section className="py-12" style={{ background: CREAM, borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}` }}>
            <div className="max-w-6xl mx-auto px-4">
              <div className="text-center mb-7">
                <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: GOLD_DEEP }}>Curated by Eugy</p>
                <h2 className="font-display italic text-3xl" style={{ color: INK }}>The Edit</h2>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {EDITS.map((e, i) => (
                  <button key={e.id} onClick={() => setActiveEdit(e)} className="text-left group" >
                    <div className="h-44 relative overflow-hidden rounded-sm" style={{ background: `linear-gradient(160deg, ${PALETTE[i + 2]}44 0%, ${PALETTE[i + 2]} 135%)`, border: `1px solid ${HAIR}` }}>
                      <div className="absolute inset-x-0 bottom-0 p-3" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.55))" }}>
                        <span className="font-display italic text-lg" style={{ color: WHITE }}>{e.name}</span>
                      </div>
                    </div>
                    <p className="text-[11.5px] mt-2 leading-snug" style={{ color: INK_SOFT }}>{e.blurb}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Tabbed rail */}
          <section className="max-w-6xl mx-auto px-4 py-12">
            <div className="flex gap-6 mb-5 overflow-x-auto no-sb text-[12px] uppercase tracking-wide" style={{ borderBottom: `1px solid ${HAIR}` }}>
              {["For You", "New In", "Dresses", "Under \u20A610k"].map((t) => (
                <button key={t} onClick={() => setTab(t)} className="whitespace-nowrap pb-2.5 relative" style={{ color: tab === t ? INK : INK_SOFT, fontWeight: tab === t ? 600 : 400 }}>
                  {t}
                  {tab === t && <span className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: GOLD }} />}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {tabItems.slice(0, 10).map((p) => <Card key={p.id} p={p} onOpen={open} onSave={toggleSave} saved={isSaved(p)} />)}
            </div>
          </section>

          {recent.length > 0 && (
            <section className="max-w-6xl mx-auto px-4 pb-10">
              <h2 className="text-[12px] uppercase tracking-wide mb-4" style={{ color: INK }}>Recently viewed</h2>
              <div className="flex gap-4 overflow-x-auto no-sb pb-1">
                {recent.map((p) => <div key={p.id} className="min-w-[140px] w-[140px]"><Card p={p} onOpen={open} onSave={toggleSave} saved={isSaved(p)} /></div>)}
              </div>
            </section>
          )}

          <section className="max-w-6xl mx-auto px-4 py-10" style={{ borderTop: `1px solid ${HAIR}` }}>
            <h2 className="font-display italic text-2xl mb-5" style={{ color: INK }}>Discover</h2>
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 [&>*]:mb-4">
              {ALL.map((p) => <div key={p.id} className="break-inside-avoid"><Card p={p} onOpen={open} onSave={toggleSave} saved={isSaved(p)} tall /></div>)}
            </div>
          </section>
          </>)}
        </>
      )}

      {/* ---------------- EDIT DETAIL ---------------- */}
      {activeEdit && (
        <section className="max-w-6xl mx-auto px-4 py-10">
          <button onClick={() => setActiveEdit(null)} className="text-[12px] mb-5" style={{ color: INK_SOFT }}>&larr; Back</button>
          <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: GOLD_DEEP }}>Curated by Eugy</p>
          <h1 className="font-display italic text-3xl mb-2" style={{ color: INK }}>{activeEdit.name}</h1>
          <p className="text-[13px] mb-8" style={{ color: INK_SOFT }}>{activeEdit.blurb}</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {ALL.filter((p) => activeEdit.cats.includes(p.category)).slice(0, 8).map((p) => (
              <Card key={p.id} p={p} onOpen={open} onSave={toggleSave} saved={isSaved(p)} />
            ))}
          </div>
        </section>
      )}

      {/* ---------------- SHOP ---------------- */}
      {view === "shop" && !activeEdit && (
        <section className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex gap-2 mb-5 overflow-x-auto no-sb">
            {["All", ...CATEGORIES].map((c) => (
              <button key={c} onClick={() => setCategory(c)} className="whitespace-nowrap text-[12px] px-4 py-2 rounded-full"
                style={{ border: `1px solid ${category === c ? INK : HAIR}`, background: category === c ? INK : WHITE, color: category === c ? WHITE : INK }}>
                {c}
              </button>
            ))}
          </div>
          {loading || loadError ? (
            <CatalogueStatus loading={loading} error={loadError} onRetry={reload} />
          ) : filtered.length === 0 ? (
            <p className="text-[13px] py-12 text-center" style={{ color: INK_SOFT }}>
              {query || category !== "All"
                ? "Nothing matches that yet — try another category or search."
                : "Everything has sold. New arrivals are listed weekly."}
            </p>
          ) : (
            <>
              <p className="text-[11px] mb-4" style={{ color: INK_SOFT }}>{filtered.length} pieces</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {filtered.map((p) => <Card key={p.id} p={p} onOpen={open} onSave={toggleSave} saved={isSaved(p)} />)}
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------------- FOOTER ---------------- */}
      <footer style={{ background: INK, color: "#C9C5BD" }} className="mt-14">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col sm:flex-row justify-between gap-5">
          <div className="flex items-center gap-2.5">
            <img src={CREST} alt="" width={34} height={34} className="rounded-full" />
            <span className="font-display italic text-lg" style={{ color: GOLD }}>Thrift by Eugy</span>
          </div>
          <div className="text-[11.5px] leading-relaxed">
            <p>your home for exquisite fashion at an affordable price</p>
            <p className="mt-1" style={{ color: "#8C8880" }}>@thriftbyeugy · Lagos, Nigeria</p>
          </div>
        </div>
      </footer>

      {/* ---------------- QUICK VIEW ---------------- */}
      {quick && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4" style={{ background: "rgba(0,0,0,0.45)" }} onClick={() => setQuick(null)}>
          <div className="w-full sm:max-w-md rounded-t-lg sm:rounded-lg overflow-hidden" style={{ background: WHITE }} onClick={(e) => e.stopPropagation()}>
            {quick.hasSpin ? (
              /* Only when a real shot sequence exists (has_spin on the product
                 record) does the 360° viewer take the photo slot — a product
                 without one keeps the flat photo and never shows an empty
                 spin box. The viewer is dark-themed, so it sits on ink. */
              <div className="py-4" style={{ background: "#0A0A0C" }}>
                <div className="mx-auto" style={{ width: 210 }}>
                  <SpinViewer sku={quick.sku} />
                </div>
              </div>
            ) : (
              <div className="relative" style={{ height: 270, background: `linear-gradient(165deg, ${quick.color}33 0%, ${quick.color}99 100%)` }}>
                {/* The 270px-tall modal deserves the larger variant; grid cards
                    stay on `card` so a thumbnail never pulls a 1200px file. */}
                {(quick.imageDetail || quick.image) && (
                  <img src={quick.imageDetail || quick.image} alt={quick.name} onError={hideBrokenImage} className="absolute inset-0 w-full h-full object-contain p-3" />
                )}
              </div>
            )}
            <div className="p-5">
              <div className="flex justify-between items-start gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: GOLD_DEEP }}>{quick.category}</p>
                  <h3 className="font-display text-xl" style={{ color: INK }}>{quick.name}</h3>
                </div>
                <button onClick={() => toggleSave(quick)} className="text-lg shrink-0" style={{ color: isSaved(quick) ? "#C0392B" : INK_SOFT }}>
                  {isSaved(quick) ? "\u2665" : "\u2661"}
                </button>
              </div>
              <p className="text-2xl font-semibold my-3" style={{ color: INK }}>{naira(quick.price)}</p>
              <p className="text-[12px]" style={{ color: INK_SOFT }}>Size {quick.size} · {quick.condition} condition</p>
              <p className="text-[12px] mt-1 mb-5 font-medium" style={{ color: GOLD_DEEP }}>Only one available</p>
              {lookPicks.length > 0 && (
                <div className="mb-5">
                  <p className="text-[10px] uppercase tracking-[0.18em] mb-2" style={{ color: INK_SOFT }}>Complete the look</p>
                  <div className="flex gap-2">
                    {lookPicks.map((p) => (
                      <button key={p.sku} onClick={() => open(p)} className="flex-1 text-left overflow-hidden rounded-sm" style={{ border: `1px solid ${HAIR}` }}>
                        <div className="relative h-14" style={{ background: `linear-gradient(165deg, ${p.color}33 0%, ${p.color}88 100%)` }}>
                          {p.image && (
                            <img src={p.image} alt={p.name} onError={hideBrokenImage} className="absolute inset-0 w-full h-full object-contain p-1" />
                          )}
                        </div>
                        <div className="px-1.5 py-1">
                          <p className="text-[9px] leading-tight truncate" style={{ color: INK }}>{p.name}</p>
                          <p className="text-[10px] font-semibold" style={{ color: INK }}>{naira(p.price)}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => { addToCart(quick); setQuick(null); }} className="w-full font-medium text-[13px] py-3.5" style={{ background: INK, color: WHITE }}>
                Add to Bag
              </button>
              <button onClick={() => setSizeGuide(true)} className="w-full text-[11px] mt-3" style={{ color: INK_SOFT }}>
                Check the size guide — vintage sizing runs differently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- SAVED ---------------- */}
      {savedOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => setSavedOpen(false)}>
          <div className="w-full max-w-sm h-full p-5 overflow-y-auto" style={{ background: WHITE }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-display italic text-lg" style={{ color: INK }}>Saved</h3>
              <button onClick={() => setSavedOpen(false)} className="text-[13px]" style={{ color: INK_SOFT }}>Close</button>
            </div>
            {saved.length === 0 ? (
              <p className="text-[13px] leading-relaxed" style={{ color: INK_SOFT }}>
                Tap the heart on anything you like. Saving doesn't hold the item — one-of-one pieces go to whoever checks out first.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {saved.map((p) => <Card key={p.id} p={p} onOpen={open} onSave={toggleSave} saved />)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- CART / CHECKOUT ---------------- */}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.4)" }} onClick={() => { setCartOpen(false); setCheckoutStep(0); }}>
          <div className="w-full max-w-sm h-full p-5 flex flex-col" style={{ background: WHITE }} onClick={(e) => e.stopPropagation()}>
            {/* Step indicator */}
            <div className="flex items-center gap-1.5 mb-5">
              {["Bag", "Details", "Payment", "Done"].map((label, i) => (
                <React.Fragment key={label}>
                  <span
                    className="text-[10px] uppercase tracking-[0.1em]"
                    style={{ color: i === checkoutStep ? GOLD_DEEP : i < checkoutStep ? "#B7A96B" : "#C4C0B8", fontWeight: i === checkoutStep ? 600 : 400 }}
                  >
                    {label}
                  </span>
                  {i < 3 && <span className="text-[10px]" style={{ color: HAIR }}>—</span>}
                </React.Fragment>
              ))}
            </div>

            {/* Step 0: Bag */}
            {checkoutStep === 0 && (
              <>
                <h3 className="font-display italic text-lg mb-4" style={{ color: INK }}>Your Bag</h3>
                <div className="flex-1 overflow-y-auto space-y-4">
                  {cart.length === 0 && <p className="text-[13px]" style={{ color: INK_SOFT }}>Your bag is empty.</p>}
                  {cart.map((p) => (
                    <div key={p.id} className="flex gap-3 items-center pb-4" style={{ borderBottom: `1px solid ${HAIR}` }}>
                      <div className="relative w-16 h-20 rounded-sm shrink-0 overflow-hidden" style={{ background: `linear-gradient(165deg, ${p.color}33 0%, ${p.color}99 100%)`, border: `1px solid ${HAIR}` }}>
                        {p.image && (
                          <img src={p.image} alt={p.name} onError={hideBrokenImage} className="absolute inset-0 w-full h-full object-contain" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-[12px]" style={{ color: INK }}>{p.name}</p>
                        <p className="text-[13px] font-semibold mt-0.5" style={{ color: INK }}>{naira(p.price)}</p>
                        <p className="text-[10.5px]" style={{ color: INK_SOFT }}>Size {p.size}</p>
                      </div>
                      <button onClick={() => setCart((c) => c.filter((x) => x.id !== p.id))} className="text-[11px]" style={{ color: INK_SOFT }}>Remove</button>
                    </div>
                  ))}
                </div>
                {cart.length > 0 && (
                  <div className="pt-4" style={{ borderTop: `1px solid ${HAIR}` }}>
                    <div className="flex justify-between text-[14px] mb-4">
                      <span style={{ color: INK_SOFT }}>Total</span>
                      <span className="font-semibold" style={{ color: INK }}>{naira(total)}</span>
                    </div>
                    <button onClick={() => setCheckoutStep(1)} className="w-full font-medium text-[13px] py-3.5" style={{ background: INK, color: WHITE }}>
                      Checkout
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Step 1: Delivery details */}
            {checkoutStep === 1 && (
              <>
                <h3 className="font-display italic text-lg mb-4" style={{ color: INK }}>Delivery Details</h3>
                <div className="flex-1 space-y-3">
                  {[
                    { key: "name", label: "Full Name", placeholder: "Eugenia Adeyemi" },
                    { key: "phone", label: "Phone Number", placeholder: "080X XXX XXXX" },
                    { key: "address", label: "Delivery Address", placeholder: "Street, Area" },
                    { key: "city", label: "City", placeholder: "Ikeja, Lagos" },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="text-[10px] uppercase tracking-[0.1em]" style={{ color: INK_SOFT }}>{f.label}</label>
                      <input
                        value={shipping[f.key]}
                        onChange={(e) => setShipping((s) => ({ ...s, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                        className="w-full mt-1 rounded-sm px-3 py-2 text-[13px] focus:outline-none"
                        style={{ background: CREAM, border: `1px solid ${HAIR}`, color: INK }}
                      />
                    </div>
                  ))}
                </div>
                <div className="pt-4 flex gap-2" style={{ borderTop: `1px solid ${HAIR}` }}>
                  <button onClick={() => setCheckoutStep(0)} className="px-4 text-[13px]" style={{ border: `1px solid ${HAIR}`, color: INK_SOFT }}>Back</button>
                  <button
                    disabled={!shipping.name || !shipping.phone || !shipping.address}
                    onClick={() => setCheckoutStep(2)}
                    className="flex-1 font-medium text-[13px] py-3 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: INK, color: WHITE }}
                  >
                    Continue to Payment
                  </button>
                </div>
              </>
            )}

            {/* Step 2: Payment */}
            {checkoutStep === 2 && (
              <>
                <h3 className="font-display italic text-lg mb-4" style={{ color: INK }}>Payment</h3>
                <div className="flex-1 space-y-3">
                  {[
                    { id: "card", label: "Debit / Credit Card" },
                    { id: "transfer", label: "Bank Transfer" },
                    { id: "ussd", label: "USSD" },
                  ].map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setPayMethod(m.id)}
                      className="w-full text-left px-3.5 py-3 rounded-sm text-[13px]"
                      style={{
                        border: `1px solid ${payMethod === m.id ? INK : HAIR}`,
                        background: payMethod === m.id ? CREAM : WHITE,
                        color: INK,
                        fontWeight: payMethod === m.id ? 600 : 400,
                      }}
                    >
                      {m.label}
                    </button>
                  ))}
                  <p className="text-[11px] pt-2" style={{ color: INK_SOFT }}>
                    Processed securely via Paystack. This demo does not move real money.
                  </p>
                  <div className="flex justify-between text-[14px] pt-3" style={{ borderTop: `1px solid ${HAIR}` }}>
                    <span style={{ color: INK_SOFT }}>Total due</span>
                    <span className="font-semibold" style={{ color: INK }}>{naira(total)}</span>
                  </div>
                </div>
                <div className="pt-4 flex gap-2">
                  <button onClick={() => setCheckoutStep(1)} className="px-4 text-[13px]" style={{ border: `1px solid ${HAIR}`, color: INK_SOFT }}>Back</button>
                  <button
                    onClick={() => {
                      setOrderRef("TBE-" + Math.floor(100000 + Math.random() * 900000));
                      setCheckoutStep(3);
                    }}
                    className="flex-1 font-medium text-[13px] py-3"
                    style={{ background: INK, color: WHITE }}
                  >
                    Pay {naira(total)}
                  </button>
                </div>
              </>
            )}

            {/* Step 3: Confirmation */}
            {checkoutStep === 3 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <img src={CREST} alt="" style={{ height: 54, width: "auto" }} className="mb-4" />
                <h3 className="font-display italic text-xl mb-2" style={{ color: INK }}>Order Confirmed</h3>
                <p className="text-[13px] mb-1" style={{ color: INK_SOFT }}>Reference: {orderRef}</p>
                <p className="text-[12px] mb-6 max-w-[220px]" style={{ color: INK_SOFT }}>
                  We'll send delivery updates to {shipping.phone || "your phone"}. Thank you for shopping with Thrift by Eugy.
                </p>
                <button
                  onClick={() => { setCart([]); setCheckoutStep(0); setCartOpen(false); }}
                  className="font-medium text-[13px] px-6 py-2.5"
                  style={{ background: INK, color: WHITE }}
                >
                  Continue Shopping
                </button>
              </div>
            )}

            {checkoutStep < 3 && (
              <button onClick={() => { setCartOpen(false); setCheckoutStep(0); }} className="text-[11px] mt-3 self-start" style={{ color: INK_SOFT }}>
                Close
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---------------- SIZE GUIDE ---------------- */}
      {sizeGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => setSizeGuide(false)}>
          <div className="w-full max-w-sm rounded-lg p-6" style={{ background: WHITE }} onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display italic text-xl mb-3" style={{ color: INK }}>Size Guide</h3>
            <p className="text-[12px] mb-5 leading-relaxed" style={{ color: INK_SOFT }}>
              Vintage and preloved sizing varies a lot by era and brand — a vintage "L" is often a
              modern "M". Every listing includes flat measurements; compare those to a garment you
              already own rather than trusting the label.
            </p>
            <table className="w-full text-[12px]">
              <thead>
                <tr style={{ color: INK_SOFT }}>
                  <th className="text-left font-normal pb-2">Size</th>
                  <th className="text-left font-normal pb-2">Bust</th>
                  <th className="text-left font-normal pb-2">Waist</th>
                </tr>
              </thead>
              <tbody style={{ color: INK }}>
                {[["XS",'32"','25"'],["S",'34"','27"'],["M",'36"','29"'],["L",'39"','32"'],["XL",'42"','35"']].map((r) => (
                  <tr key={r[0]} style={{ borderTop: `1px solid ${HAIR}` }}>
                    <td className="py-2">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => setSizeGuide(false)} className="w-full mt-5 text-[13px] py-3" style={{ border: `1px solid ${HAIR}`, color: INK }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
