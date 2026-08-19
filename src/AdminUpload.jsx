import React, { useState, useRef } from "react";
import { TEMonogram } from "./BrandLogo.jsx";

/**
 * Thrift by Eugy — Admin: Add Product
 * Prototype of the in-site upload flow. Two processing modes:
 *   Auto  — background removed, cropped, backdrop chosen by garment brightness
 *   As-is — photo used exactly as shot (still compressed + format-converted)
 * Compression/format conversion happens in BOTH modes; only the cutout is optional.
 */

const CATEGORIES = ["Dresses", "Outerwear", "Denim", "Tops", "Accessories", "Shoes"];
const CONDITIONS = ["Excellent", "Very Good", "Good", "Fair"];
const SIZES = ["XS", "S", "M", "L", "XL", "Custom"];

const GOLD = "#C9A227";
const GOLD_LIGHT = "#E8C56B";
const INK = "#0A0A0C";
const PANEL = "#141416";
const LINE = "#2a2a2d";

function Field({ label, children, hint }) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] uppercase tracking-[0.14em] text-[#888] mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-[#5f5f5f] mt-1">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full bg-[#0A0A0C] border border-[#2a2a2d] rounded px-3 py-2 text-[13px] text-[#F3ECDD] focus:outline-none focus:border-[#C9A227] placeholder:text-[#555]";

export default function AdminUpload() {
  const [mode, setMode] = useState("auto"); // auto | asis
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const [form, setForm] = useState({
    sku: "",
    name: "",
    category: "Dresses",
    price: "",
    size: "M",
    condition: "Excellent",
    color: "",
    brand: "",
    description: "",
  });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFiles = (list) => {
    const arr = Array.from(list).slice(0, 5);
    const mapped = arr.map((f) => ({
      name: f.name,
      size: f.size,
      url: URL.createObjectURL(f),
    }));
    setFiles(mapped);
    setResults([]);
  };

  // Mock of what the server pipeline reports back per image.
  const runProcessing = () => {
    setProcessing(true);
    setResults([]);
    setTimeout(() => {
      const out = files.map((f, i) => {
        const originalKB = Math.round(f.size / 1024) || 2400;
        // realistic ratios: AVIF ~ 1/5 of a big JPEG, WebP ~ 1/3
        const avif = Math.max(28, Math.round(originalKB * 0.13));
        const webp = Math.max(40, Math.round(originalKB * 0.21));
        const jpg = Math.max(70, Math.round(originalKB * 0.38));
        return {
          name: f.name,
          url: f.url,
          original: originalKB,
          avif,
          webp,
          jpg,
          saved: Math.round((1 - avif / originalKB) * 100),
          garment: i % 2 === 0 ? "light" : "dark",
          backdrop: i % 2 === 0 ? "Brand ink" : "White",
          cutout: mode === "auto",
        };
      });
      setResults(out);
      setProcessing(false);
    }, 1400);
  };

  const fmtKB = (kb) => (kb >= 1024 ? (kb / 1024).toFixed(1) + " MB" : kb + " KB");

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-[#F3ECDD] p-6" style={{ fontFamily: "Inter, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;1,500&family=Inter:wght@400;500;600&display=swap');
        .font-display { font-family: 'Playfair Display', serif; }
      `}</style>

      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <TEMonogram size={28} />
            <span className="font-display italic text-xl" style={{ color: GOLD }}>
              Thrift by Eugy
            </span>
            <span className="text-[11px] uppercase tracking-[0.15em] text-[#666] ml-1">Admin</span>
          </div>
          <span className="text-[12px] text-[#777]">Add Product</span>
        </div>
        <svg viewBox="0 0 200 12" className="w-full h-3 opacity-70 mb-6" preserveAspectRatio="none">
          <path d="M0 6 C 40 1, 60 1, 100 6 C 140 11, 160 11, 200 6" stroke={GOLD} strokeWidth="0.8" fill="none" />
        </svg>

        <div className="grid md:grid-cols-[1.15fr_1fr] gap-6">
          {/* LEFT: photos */}
          <div>
            {/* Mode switch */}
            <div className="mb-4">
              <label className="block text-[10px] uppercase tracking-[0.14em] text-[#888] mb-2">
                Photo processing
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setMode("auto")}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    mode === "auto" ? "border-[#C9A227] bg-[#141416]" : "border-[#2a2a2d]"
                  }`}
                >
                  <span className={`text-[13px] font-medium ${mode === "auto" ? "text-[#E8C56B]" : "text-[#bbb]"}`}>
                    Clean up automatically
                  </span>
                  <p className="text-[11px] text-[#666] mt-1 leading-snug">
                    Removes the room, crops to the garment, picks a backdrop that keeps it visible.
                  </p>
                </button>
                <button
                  onClick={() => setMode("asis")}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    mode === "asis" ? "border-[#C9A227] bg-[#141416]" : "border-[#2a2a2d]"
                  }`}
                >
                  <span className={`text-[13px] font-medium ${mode === "asis" ? "text-[#E8C56B]" : "text-[#bbb]"}`}>
                    Use photo as shot
                  </span>
                  <p className="text-[11px] text-[#666] mt-1 leading-snug">
                    Keeps your styling and background. Still compressed and converted for fast loading.
                  </p>
                </button>
              </div>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => inputRef.current?.click()}
              className={`rounded-lg border border-dashed p-8 text-center cursor-pointer transition-colors ${
                dragging ? "border-[#C9A227] bg-[#141416]" : "border-[#2a2a2d]"
              }`}
            >
              <p className="text-[13px] text-[#bbb]">Drop photos here, or click to choose</p>
              <p className="text-[11px] text-[#5f5f5f] mt-1">Up to 5 photos per item · JPG, PNG, HEIC</p>
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>

            {/* Thumbnails */}
            {files.length > 0 && (
              <div className="mt-4">
                <div className="flex gap-2 flex-wrap">
                  {files.map((f, i) => (
                    <div key={i} className="relative">
                      <img
                        src={f.url}
                        alt=""
                        className="w-20 h-24 object-cover rounded border border-[#2a2a2d]"
                      />
                      {i === 0 && (
                        <span className="absolute bottom-1 left-1 bg-[#C9A227] text-[#0A0A0C] text-[9px] px-1.5 py-0.5 rounded font-semibold">
                          Main
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  onClick={runProcessing}
                  disabled={processing}
                  className="mt-4 w-full bg-[#C9A227] disabled:opacity-50 text-[#0A0A0C] font-semibold text-[13px] py-2.5 rounded-full hover:bg-[#E8C56B] transition-colors"
                >
                  {processing ? "Processing…" : `Process ${files.length} photo${files.length > 1 ? "s" : ""}`}
                </button>
              </div>
            )}

            {/* Results */}
            {results.length > 0 && (
              <div className="mt-5 border border-[#2a2a2d] rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-[#141416] border-b border-[#2a2a2d] flex justify-between items-center">
                  <span className="text-[11px] uppercase tracking-[0.12em] text-[#888]">Processed</span>
                  <span className="text-[11px]" style={{ color: GOLD }}>
                    {Math.round(results.reduce((s, r) => s + r.saved, 0) / results.length)}% smaller on average
                  </span>
                </div>
                <div className="divide-y divide-[#2a2a2d]">
                  {results.map((r, i) => (
                    <div key={i} className="p-3 flex gap-3 items-start">
                      <img src={r.url} alt="" className="w-12 h-14 object-cover rounded" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] truncate">{r.name}</p>
                        <p className="text-[11px] text-[#666] mt-0.5">
                          {r.cutout ? `Cut out · ${r.garment} garment · ${r.backdrop} backdrop` : "Kept as shot"}
                        </p>
                        <div className="flex gap-3 mt-1.5 text-[10px]">
                          <span className="text-[#555] line-through">{fmtKB(r.original)}</span>
                          <span style={{ color: GOLD_LIGHT }}>AVIF {fmtKB(r.avif)}</span>
                          <span className="text-[#888]">WebP {fmtKB(r.webp)}</span>
                          <span className="text-[#666]">JPG {fmtKB(r.jpg)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="px-3 py-2 bg-[#141416] border-t border-[#2a2a2d]">
                  <p className="text-[10px] text-[#666] leading-relaxed">
                    All three formats are stored. Each shopper's browser is served the smallest one it
                    supports — no quality difference, just faster loading.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: product details */}
          <div className="bg-[#141416] border border-[#2a2a2d] rounded-lg p-5 h-fit">
            <h2 className="font-display italic text-lg mb-4" style={{ color: GOLD_LIGHT }}>
              Item Details
            </h2>

            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU">
                <input className={inputCls} value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="TBE-0001" />
              </Field>
              <Field label="Price (NGN)">
                <input className={inputCls} value={form.price} onChange={(e) => set("price", e.target.value)} placeholder="12500" />
              </Field>
            </div>

            <Field label="Product Name">
              <input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Coral Lace Peplum Top" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select className={inputCls} value={form.category} onChange={(e) => set("category", e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Size">
                <select className={inputCls} value={form.size} onChange={(e) => set("size", e.target.value)}>
                  {SIZES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Condition">
                <select className={inputCls} value={form.condition} onChange={(e) => set("condition", e.target.value)}>
                  {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Color">
                <input className={inputCls} value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="Coral" />
              </Field>
            </div>

            <Field label="Brand" hint="Leave blank if unlabeled.">
              <input className={inputCls} value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Unlabeled" />
            </Field>

            <Field label="Description" hint="Fabric, fit, and any flaws. Search and recommendations read this.">
              <textarea
                rows={3}
                className={inputCls + " resize-none"}
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Off-shoulder cotton peplum top with crochet lace trim and elasticated waist."
              />
            </Field>

            <button className="w-full bg-[#C9A227] text-[#0A0A0C] font-semibold text-[13px] py-2.5 rounded-full hover:bg-[#E8C56B] transition-colors">
              Publish Item
            </button>
            <button className="w-full mt-2 border border-[#2a2a2d] text-[#999] text-[13px] py-2.5 rounded-full hover:border-[#C9A227] hover:text-[#C9A227] transition-colors">
              Save as Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
