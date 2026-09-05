import React, { useState, useRef, useEffect, useCallback } from "react";
import { fetchSpinFrames } from "./api.js";

/**
 * Thrift by Eugy — 360° Spin Viewer
 *
 * Production use:
 *   <SpinViewer sku="TBE-0087" />
 * fetches the real frame list from the image Worker (GET /spin/{sku}) on
 * mount. Passing `frames` directly still works and skips the fetch:
 *   <SpinViewer frames={[url, url, ...]} />
 *
 * Frames are plain images swapped on drag — no video, no GIF. Each frame is
 * served as AVIF/WebP through the same image pipeline as every other product
 * photo, so a 36-frame spin costs far less than one GIF of the same thing.
 *
 * The demo below draws its own frames in-browser so the interaction can be
 * tested before a real spin shoot exists.
 */

const GOLD = "#C9A227";
const GOLD_LIGHT = "#E8C56B";
const INK = "#0A0A0C";
const LINE = "#2a2a2d";

// ---------------------------------------------------------------------------
// The viewer
// ---------------------------------------------------------------------------
export function SpinViewer({
  sku = null,               // fetch real frames for this SKU from the image Worker
  frames: framesProp = [],  // or hand frames in directly (demo/tests) — no fetch
  autoSpin = true,
  autoSpinSpeed = 110,     // ms per frame
  sensitivity = 1,          // higher = less drag needed for a full turn
  label = "Drag to spin",
}) {
  const [index, setIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [spinning, setSpinning] = useState(autoSpin);
  const [loaded, setLoaded] = useState(0);
  const [hasInteracted, setHasInteracted] = useState(false);
  // null = list fetch still in flight; [] = fetched, no frames exist.
  const [fetchedFrames, setFetchedFrames] = useState(null);

  const dragState = useRef({ startX: 0, startIndex: 0 });
  const containerRef = useRef(null);

  // With a sku, the frame list comes from the image Worker; without one the
  // caller's frames prop is authoritative (the demo harness below, tests).
  useEffect(() => {
    if (!sku) return;
    let cancelled = false;
    setFetchedFrames(null);
    fetchSpinFrames(sku)
      .then((urls) => { if (!cancelled) setFetchedFrames(urls); })
      .catch(() => { if (!cancelled) setFetchedFrames([]); });
    return () => { cancelled = true; };
  }, [sku]);

  const frames = sku ? fetchedFrames || [] : framesProp;
  const listPending = !!sku && fetchedFrames === null;
  const count = frames.length;

  // Preload every frame up front. A spin that stutters mid-drag reads as
  // broken, so we hold the hint until they're all in.
  useEffect(() => {
    if (!count) return;
    let cancelled = false;
    let done = 0;
    frames.forEach((src) => {
      const img = new Image();
      img.onload = img.onerror = () => {
        if (cancelled) return;
        done += 1;
        setLoaded(done);
      };
      img.src = src;
    });
    return () => {
      cancelled = true;
    };
  }, [frames, count]);

  const ready = count > 0 && loaded >= count;

  // Idle auto-spin, stops for good once the shopper takes over.
  useEffect(() => {
    if (!spinning || dragging || !ready || hasInteracted) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, autoSpinSpeed);
    return () => clearInterval(id);
  }, [spinning, dragging, ready, hasInteracted, count, autoSpinSpeed]);

  const pointerX = (e) => (e.touches ? e.touches[0].clientX : e.clientX);

  const onDown = useCallback(
    (e) => {
      if (!ready) return;
      setDragging(true);
      setSpinning(false);
      setHasInteracted(true);
      dragState.current = { startX: pointerX(e), startIndex: index };
    },
    [index, ready]
  );

  const onMove = useCallback(
    (e) => {
      if (!dragging || !containerRef.current) return;
      const width = containerRef.current.offsetWidth || 1;
      const dx = pointerX(e) - dragState.current.startX;
      // One full container-width drag = one full rotation.
      const framesMoved = Math.round((dx / width) * count * sensitivity);
      const next = (((dragState.current.startIndex - framesMoved) % count) + count) % count;
      setIndex(next);
    },
    [dragging, count, sensitivity]
  );

  const onUp = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      if (e.cancelable) e.preventDefault();
      onMove(e);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging, onMove, onUp]);

  const step = (dir) => {
    setSpinning(false);
    setHasInteracted(true);
    setIndex((i) => (((i + dir) % count) + count) % count);
  };

  // Frame list still being fetched for this SKU — hold the same-shaped shell
  // rather than flashing "no spin frames" at a product that has them.
  if (listPending) {
    return (
      <div
        className="rounded-lg overflow-hidden flex flex-col items-center justify-center"
        style={{ background: INK, border: `1px solid ${LINE}`, aspectRatio: "3 / 4" }}
      >
        <div className="w-28 h-[2px] rounded" style={{ background: LINE }} />
        <p className="text-[11px] mt-2" style={{ color: "#777" }}>
          Loading 360° view
        </p>
      </div>
    );
  }

  if (!count) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center" style={{ borderColor: LINE }}>
        <p className="text-[13px] text-[#888]">No spin frames for this item yet.</p>
        <p className="text-[11px] text-[#5f5f5f] mt-1">
          Upload a spin sequence from the admin panel to enable 360° view.
        </p>
      </div>
    );
  }

  return (
    <div className="select-none">
      <div
        ref={containerRef}
        onMouseDown={onDown}
        onTouchStart={onDown}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") step(-1);
          if (e.key === "ArrowRight") step(1);
        }}
        tabIndex={0}
        role="slider"
        aria-label="Rotate product view"
        aria-valuemin={1}
        aria-valuemax={count}
        aria-valuenow={index + 1}
        className="relative rounded-lg overflow-hidden focus:outline-none focus:ring-1 touch-none"
        style={{
          background: INK,
          border: `1px solid ${LINE}`,
          cursor: dragging ? "grabbing" : "grab",
          ["--tw-ring-color"]: GOLD,
          aspectRatio: "3 / 4",
        }}
      >
        {/* Frames are all rendered, only the active one is visible. Toggling
            opacity avoids the white flash a changing src attribute causes. */}
        {frames.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={i === index ? `Product view ${i + 1} of ${count}` : ""}
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
            style={{ opacity: i === index ? 1 : 0 }}
          />
        ))}

        {/* Loading */}
        {!ready && (
          <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ background: INK }}>
            <div className="w-28 h-[2px] rounded overflow-hidden" style={{ background: LINE }}>
              <div
                className="h-full transition-all duration-200"
                style={{ width: `${(loaded / count) * 100}%`, background: GOLD }}
              />
            </div>
            <p className="text-[11px] mt-2" style={{ color: "#777" }}>
              Loading 360° view
            </p>
          </div>
        )}

        {/* Drag hint — fades out once they've spun it themselves */}
        {ready && !hasInteracted && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-sm"
              style={{ background: "rgba(10,10,12,0.75)", border: `1px solid ${LINE}` }}
            >
              <span style={{ color: GOLD }}>‹</span>
              <span className="text-[11px] tracking-wide" style={{ color: GOLD_LIGHT }}>
                {label}
              </span>
              <span style={{ color: GOLD }}>›</span>
            </div>
          </div>
        )}

        {/* 360 badge */}
        {ready && (
          <div
            className="absolute top-3 left-3 px-2 py-1 rounded text-[10px] tracking-[0.1em]"
            style={{ background: "rgba(10,10,12,0.7)", color: GOLD, border: `1px solid ${LINE}` }}
          >
            360°
          </div>
        )}
      </div>

      {/* Controls */}
      {ready && (
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={() => step(-1)}
            aria-label="Rotate left"
            className="w-8 h-8 rounded-full border flex items-center justify-center text-[13px] transition-colors hover:border-[#C9A227] hover:text-[#C9A227]"
            style={{ borderColor: LINE, color: "#999" }}
          >
            ‹
          </button>

          {/* Scrub bar doubles as position indicator */}
          <input
            type="range"
            min={0}
            max={count - 1}
            value={index}
            onChange={(e) => {
              setSpinning(false);
              setHasInteracted(true);
              setIndex(Number(e.target.value));
            }}
            aria-label="Scrub through rotation"
            className="flex-1 h-[2px] appearance-none rounded outline-none"
            style={{
              background: `linear-gradient(to right, ${GOLD} ${(index / (count - 1)) * 100}%, ${LINE} ${
                (index / (count - 1)) * 100
              }%)`,
            }}
          />

          <button
            onClick={() => step(1)}
            aria-label="Rotate right"
            className="w-8 h-8 rounded-full border flex items-center justify-center text-[13px] transition-colors hover:border-[#C9A227] hover:text-[#C9A227]"
            style={{ borderColor: LINE, color: "#999" }}
          >
            ›
          </button>

          <button
            onClick={() => {
              setHasInteracted(false);
              setSpinning((s) => !s);
            }}
            className="text-[11px] px-3 py-1.5 rounded-full border transition-colors"
            style={{
              borderColor: spinning ? GOLD : LINE,
              color: spinning ? GOLD : "#999",
            }}
          >
            {spinning ? "Pause" : "Spin"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demo harness — generates placeholder frames in-browser.
// Delete this once real spin sequences exist; keep SpinViewer above.
// ---------------------------------------------------------------------------
function useDemoFrames(count = 36) {
  const [frames, setFrames] = useState([]);

  useEffect(() => {
    const W = 600;
    const H = 800;
    const out = [];

    for (let i = 0; i < count; i++) {
      const c = document.createElement("canvas");
      c.width = W;
      c.height = H;
      const ctx = c.getContext("2d");
      const ang = (i / count) * Math.PI * 2;

      ctx.fillStyle = INK;
      ctx.fillRect(0, 0, W, H);

      const facing = Math.cos(ang);
      const squeeze = 0.28 + 0.72 * Math.abs(facing);
      const cx = W / 2;

      // mannequin form
      const bodyW = 200 * squeeze;
      const shade = facing >= 0 ? 1 : 0.66;
      ctx.fillStyle = `rgb(${Math.round(26 * shade)},${Math.round(26 * shade)},${Math.round(34 * shade)})`;
      ctx.beginPath();
      ctx.ellipse(cx, 150, 52 * squeeze, 62, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - bodyW / 2, 230);
      ctx.quadraticCurveTo(cx - bodyW / 2 - 18 * squeeze, 470, cx - bodyW / 2 + 22 * squeeze, 690);
      ctx.lineTo(cx + bodyW / 2 - 22 * squeeze, 690);
      ctx.quadraticCurveTo(cx + bodyW / 2 + 18 * squeeze, 470, cx + bodyW / 2, 230);
      ctx.closePath();
      ctx.fill();

      // garment (coral, matching your sample top)
      const g = ctx.createLinearGradient(cx - bodyW / 2, 0, cx + bodyW / 2, 0);
      const base = facing >= 0 ? [232, 106, 74] : [168, 74, 52];
      g.addColorStop(0, `rgb(${base[0] * 0.72},${base[1] * 0.72},${base[2] * 0.72})`);
      g.addColorStop(0.45, `rgb(${base[0]},${base[1]},${base[2]})`);
      g.addColorStop(1, `rgb(${base[0] * 0.66},${base[1] * 0.66},${base[2] * 0.66})`);
      ctx.fillStyle = g;

      const gW = 240 * squeeze;
      ctx.beginPath();
      ctx.moveTo(cx - gW / 2, 285);
      ctx.lineTo(cx + gW / 2, 285);
      ctx.quadraticCurveTo(cx + gW / 2 - 14 * squeeze, 430, cx + gW / 2 - 34 * squeeze, 470);
      ctx.quadraticCurveTo(cx + gW / 2 + 16 * squeeze, 560, cx + gW / 2 - 6 * squeeze, 620);
      ctx.lineTo(cx - gW / 2 + 6 * squeeze, 620);
      ctx.quadraticCurveTo(cx - gW / 2 - 16 * squeeze, 560, cx - gW / 2 + 34 * squeeze, 470);
      ctx.quadraticCurveTo(cx - gW / 2 + 14 * squeeze, 430, cx - gW / 2, 285);
      ctx.closePath();
      ctx.fill();

      // lace trim band
      ctx.fillStyle = `rgb(${base[0] * 0.88},${base[1] * 0.8},${base[2] * 0.8})`;
      ctx.fillRect(cx - gW / 2, 285, gW, 46);
      const scallops = Math.max(3, Math.round(10 * squeeze));
      for (let s = 0; s < scallops; s++) {
        const sx = cx - gW / 2 + (gW / scallops) * (s + 0.5);
        ctx.beginPath();
        ctx.arc(sx, 331, gW / scallops / 2.1, 0, Math.PI);
        ctx.fill();
      }

      // waist gather
      ctx.strokeStyle = `rgba(0,0,0,0.28)`;
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.moveTo(cx - gW / 2 + 30 * squeeze, 465);
      ctx.lineTo(cx + gW / 2 - 30 * squeeze, 465);
      ctx.stroke();

      // frame counter, so it's obvious these are placeholders
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.font = "12px Inter, sans-serif";
      ctx.fillText(`demo frame ${i + 1}/${count}`, 16, H - 18);

      out.push(c.toDataURL("image/jpeg", 0.8));
    }
    setFrames(out);
  }, [count]);

  return frames;
}

export default function SpinViewerDemo() {
  const frames = useDemoFrames(36);

  return (
    <div className="min-h-screen p-6" style={{ background: INK, color: "#F3ECDD", fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,500&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Playfair Display', serif; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 12px; height: 12px;
          border-radius: 50%; background: ${GOLD}; cursor: pointer;
        }
        input[type=range]::-moz-range-thumb {
          width: 12px; height: 12px; border: none;
          border-radius: 50%; background: ${GOLD}; cursor: pointer;
        }
        @media (prefers-reduced-motion: reduce) {
          * { animation: none !important; transition: none !important; }
        }
      `}</style>

      <div className="max-w-4xl mx-auto">
        <span className="font-display italic text-xl" style={{ color: GOLD }}>
          Thrift by Eugy
        </span>
        <svg viewBox="0 0 200 12" className="w-full h-3 opacity-70 my-4" preserveAspectRatio="none">
          <path d="M0 6 C 40 1, 60 1, 100 6 C 140 11, 160 11, 200 6" stroke={GOLD} strokeWidth="0.8" fill="none" />
        </svg>

        <div className="grid md:grid-cols-2 gap-8 items-start">
          <SpinViewer frames={frames} />

          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] mb-2" style={{ color: GOLD }}>
              Tops · One-of-one
            </p>
            <h1 className="font-display text-2xl mb-2">Coral Lace Peplum Top</h1>
            <p className="text-lg font-semibold mb-4" style={{ color: GOLD }}>
              ₦12,500
            </p>
            <p className="text-[13px] leading-relaxed mb-4" style={{ color: "#b8b8b8" }}>
              Off-shoulder cotton peplum with crochet lace trim and an elasticated waist.
              Condition: Excellent · Size M.
            </p>
            <button
              className="w-full font-semibold text-[13px] py-3 rounded-full transition-colors"
              style={{ background: GOLD, color: INK }}
            >
              Add to Bag
            </button>

            <div className="mt-6 p-3 rounded-lg" style={{ border: `1px solid ${LINE}` }}>
              <p className="text-[11px] leading-relaxed" style={{ color: "#777" }}>
                These are generated placeholder frames so the interaction can be tested.
                Real spins come from photographing the mannequin at fixed intervals —
                the viewer itself doesn't change.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
