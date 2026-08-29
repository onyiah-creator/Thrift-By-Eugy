import React, { useState, useMemo, useEffect, useCallback } from "react";
import { fetchProducts } from "./api.js";
import { similarItems, completeTheLook, similarity } from "./recommender.js";
import { TEMonogram } from "./BrandLogo.jsx";

const GOLD = "#C9A227";
const GOLD_LIGHT = "#E8C56B";
const INK = "#0A0A0C";
const PANEL = "#141416";
const LINE = "#2a2a2d";
const IVORY = "#F3ECDD";

// A product row can claim an image_count whose object was never stored, and a
// variant can 404. Hiding the <img> reveals the colour gradient painted behind
// it, which is a far better empty state than a broken-image icon.
const hideBrokenImage = (e) => { e.currentTarget.style.display = "none"; };

const naira = (n) => "₦" + n.toLocaleString("en-NG");

function Thumb({ p, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 w-[110px] text-left rounded-md overflow-hidden transition-colors"
      style={{ border: `1px solid ${active ? GOLD : LINE}`, background: PANEL }}
    >
      <div className="relative h-[110px]" style={{ background: `linear-gradient(160deg, ${p.color} 0%, #0A0A0C 135%)` }}>
        {p.image && <img src={p.image} alt={p.name} onError={hideBrokenImage} className="absolute inset-0 w-full h-full object-contain p-1.5" />}
      </div>
      <div className="p-1.5">
        <p className="text-[10px] leading-tight truncate" style={{ color: IVORY }}>{p.name}</p>
        <p className="text-[10px] font-semibold" style={{ color: GOLD }}>{naira(p.price)}</p>
      </div>
    </button>
  );
}

function ResultRow({ p, seed, score }) {
  return (
    <div className="flex gap-3 items-center py-2.5" style={{ borderBottom: `1px solid ${LINE}` }}>
      <div className="relative w-12 h-14 rounded overflow-hidden shrink-0" style={{ background: `linear-gradient(160deg, ${p.color} 0%, #0A0A0C 135%)` }}>
        {p.image && <img src={p.image} alt={p.name} onError={hideBrokenImage} className="absolute inset-0 w-full h-full object-contain" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] truncate" style={{ color: IVORY }}>{p.name}</p>
        <p className="text-[10px]" style={{ color: "#777" }}>
          {p.category} · {p.colorName || "—"} · Size {p.size} · {naira(p.price)}
        </p>
        <div className="mt-1 h-[3px] rounded overflow-hidden" style={{ background: LINE }}>
          <div className="h-full" style={{ width: `${Math.min(100, Math.round(score * 100))}%`, background: GOLD }} />
        </div>
      </div>
      <span className="text-[11px] font-semibold w-10 text-right" style={{ color: GOLD_LIGHT }}>
        {(score * 100).toFixed(0)}%
      </span>
    </div>
  );
}

/**
 * Recommender Lab — the suggestion engine made visible.
 * Pick any item as the seed and see exactly what the engine would surface
 * for it, with the underlying scores. A review tool, not a shopper page.
 */
export default function RecommenderLab() {
  // Runs against the live catalogue, so what it scores here is exactly what a
  // shopper would be shown.
  const [catalogue, setCatalogue] = useState([]);
  const [seed, setSeed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    setLoading(true);
    return fetchProducts({ limit: 60 })
      .then(({ products }) => {
        setCatalogue(products);
        setSeed((cur) => products.find((p) => p.sku === cur?.sku) || products[0] || null);
        setError("");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const similar = useMemo(
    () => (seed ? similarItems(seed, catalogue, { limit: 6 }).map((p) => ({ p, score: similarity(seed, p) })) : []),
    [seed, catalogue]
  );
  const look = useMemo(
    () => (seed ? completeTheLook(seed, catalogue, { limit: 4 }) : []),
    [seed, catalogue]
  );

  return (
    <div className="min-h-screen p-6" style={{ background: INK, color: IVORY, fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Playfair Display', serif; }
        .no-sb::-webkit-scrollbar { display:none; } .no-sb { scrollbar-width:none; }
      `}</style>

      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2.5 mb-1">
          <TEMonogram size={28} />
          <span className="font-display italic text-xl" style={{ color: GOLD }}>Thrift by Eugy</span>
          <span className="text-[11px] uppercase tracking-[0.15em] ml-1" style={{ color: "#666" }}>Recommender Lab</span>
        </div>
        <p className="text-[12px] mb-6" style={{ color: "#888" }}>
          Pick any piece as the seed. The engine scores every other available item on category,
          colour family, price band, size, style keywords, and condition — sold items never appear.
        </p>

        {loading && <p className="text-[13px] py-8" style={{ color: "#666" }}>Loading the live catalogue…</p>}

        {!loading && error && (
          <div className="py-8">
            <p className="text-[13px] mb-3" style={{ color: "#E9A5A5" }}>{error}</p>
            <button onClick={reload} className="text-[12px] px-4 py-2 rounded-full" style={{ border: `1px solid ${LINE}`, color: "#999" }}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && catalogue.length === 0 && (
          <p className="text-[13px] py-8" style={{ color: "#666" }}>
            Nothing live to score yet. Publish a product in the admin panel and it will appear here.
          </p>
        )}

        {!loading && !error && seed && (<>
        {/* Seed picker */}
        <p className="text-[10px] uppercase tracking-[0.15em] mb-2" style={{ color: "#666" }}>Seed item</p>
        <div className="flex gap-2.5 overflow-x-auto no-sb pb-2 mb-8">
          {catalogue.slice(0, 14).map((p) => (
            <Thumb key={p.sku} p={p} active={seed.sku === p.sku} onClick={() => setSeed(p)} />
          ))}
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          <div>
            <h2 className="font-display italic text-lg mb-1" style={{ color: GOLD_LIGHT }}>You may also like</h2>
            <p className="text-[11px] mb-3" style={{ color: "#777" }}>
              Closest matches to <span style={{ color: IVORY }}>{seed.name}</span>, with their similarity score.
            </p>
            {similar.length === 0 && <p className="text-[12px]" style={{ color: "#666" }}>Nothing scores above the noise threshold.</p>}
            {similar.map(({ p, score }) => (
              <ResultRow key={p.sku} p={p} seed={seed} score={score} />
            ))}
          </div>

          <div>
            <h2 className="font-display italic text-lg mb-1" style={{ color: GOLD_LIGHT }}>Complete the look</h2>
            <p className="text-[11px] mb-3" style={{ color: "#777" }}>
              Deliberately different categories that pair with a {seed.category.toLowerCase().replace(/s$/, "")} —
              colour harmony and price band matter, sameness doesn't.
            </p>
            {look.length === 0 && <p className="text-[12px]" style={{ color: "#666" }}>No complementary pieces in stock.</p>}
            <div className="grid grid-cols-2 gap-3">
              {look.map((p) => (
                <div key={p.sku} className="rounded-md overflow-hidden" style={{ border: `1px solid ${LINE}`, background: PANEL }}>
                  <div className="relative h-28" style={{ background: `linear-gradient(160deg, ${p.color} 0%, #0A0A0C 135%)` }}>
                    {p.image && <img src={p.image} alt={p.name} onError={hideBrokenImage} className="absolute inset-0 w-full h-full object-contain p-1.5" />}
                  </div>
                  <div className="p-2">
                    <p className="text-[11px] leading-tight truncate" style={{ color: IVORY }}>{p.name}</p>
                    <p className="text-[10px]" style={{ color: "#777" }}>{p.category}</p>
                    <p className="text-[11px] font-semibold" style={{ color: GOLD }}>{naira(p.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        </>)}
      </div>
    </div>
  );
}
