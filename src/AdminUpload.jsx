import React, { useState, useRef, useEffect, useCallback } from "react";
import { TEMonogram } from "./BrandLogo.jsx";
import { admin, uploadPhoto, IMAGE_API, CATEGORIES, CONDITIONS, SIZES, API_BASE } from "./api.js";

/**
 * Thrift by Eugy — Admin
 *
 * ON THE TOKEN
 * The admin token lives in React state and nowhere else: not localStorage, not
 * sessionStorage, not a cookie. Closing the tab ends the session. That is a
 * deliberate trade — it means signing in again after every refresh, but a token
 * that never touches persistent storage cannot be read back by anything that
 * later manages to run script on this origin.
 *
 * Photos upload to the image pipeline Worker when VITE_IMAGE_API is set.
 * They are sent AFTER the product is created, because the upload is keyed by
 * SKU and the SKU is not settled until then. Without that variable the panel
 * keeps a local preview and says plainly that nothing was stored.
 */

const GOLD = "#C9A227";
const GOLD_LIGHT = "#E8C56B";
const INK = "#0A0A0C";
const PANEL = "#141416";
const LINE = "#2a2a2d";

const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");

const inputCls =
  "w-full bg-[#0A0A0C] border border-[#2a2a2d] rounded px-3 py-2 text-[13px] text-[#F3ECDD] focus:outline-none focus:border-[#C9A227] placeholder:text-[#555]";

function Field({ label, children, hint }) {
  return (
    <div className="mb-4">
      <label className="block text-[10px] uppercase tracking-[0.14em] text-[#888] mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-[#5f5f5f] mt-1">{hint}</p>}
    </div>
  );
}

function Banner({ kind, children, onDismiss }) {
  if (!children) return null;
  const colors = {
    error: { border: "#7A3B3B", bg: "#2A1618", text: "#E9A5A5" },
    ok: { border: "#3B6B4A", bg: "#14231A", text: "#9FD6B0" },
  }[kind];
  return (
    <div
      className="mb-4 px-3.5 py-2.5 rounded text-[12px] flex items-start gap-3"
      style={{ border: `1px solid ${colors.border}`, background: colors.bg, color: colors.text }}
    >
      <span className="flex-1">{children}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-[14px] leading-none opacity-70 hover:opacity-100">
          &times;
        </button>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    active: { bg: "#14231A", color: "#9FD6B0", label: "Live" },
    draft: { bg: "#232014", color: "#D6C89F", label: "Draft" },
    sold: { bg: "#1A1A22", color: "#9FA8D6", label: "Sold" },
    archived: { bg: "#1C1C1F", color: "#8A8A8E", label: "Archived" },
  };
  const s = map[status] || map.archived;
  return (
    <span
      className="text-[9px] uppercase tracking-[0.12em] px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------
function SignIn({ onToken }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setBusy(true);
    setError("");
    try {
      // Any authenticated endpoint proves the token; stats is the cheapest.
      await admin.stats(value.trim());
      onToken(value.trim());
    } catch (err) {
      setError(
        err.status === 401
          ? "That token was not accepted."
          : err.status === 503
          ? "The Worker has no ADMIN_TOKEN configured, so it is refusing all admin access."
          : err.message
      );
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: INK }}>
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-1 justify-center">
          <TEMonogram size={30} />
          <span className="font-display italic text-xl" style={{ color: GOLD }}>Thrift by Eugy</span>
        </div>
        <p className="text-[11px] uppercase tracking-[0.15em] text-center mb-6" style={{ color: "#666" }}>
          Admin
        </p>

        <Banner kind="error">{error}</Banner>

        <Field label="Admin token" hint="Held in memory for this tab only — never saved to the browser.">
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste your ADMIN_TOKEN"
            className={inputCls}
          />
        </Field>

        <button
          type="submit"
          disabled={busy || !value.trim()}
          className="w-full font-semibold text-[13px] py-2.5 rounded-full disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          style={{ background: GOLD, color: INK }}
        >
          {busy ? "Checking…" : "Sign in"}
        </button>

        <p className="text-[10px] text-center mt-5" style={{ color: "#555" }}>
          {API_BASE || "same origin (dev proxy)"}
        </p>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
const STATUS_TABS = ["all", "draft", "active", "sold", "archived"];

function ProductRow({ p, token, onChanged, onError }) {
  const [busy, setBusy] = useState("");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(p);

  useEffect(() => setForm(p), [p]);

  const reserved = p.reserved_until && new Date(p.reserved_until) > new Date();

  const act = async (label, fn) => {
    setBusy(label);
    onError("");
    try {
      await fn();
      await onChanged();
      setEditing(false);
    } catch (err) {
      onError(err.message);
    } finally {
      setBusy("");
    }
  };

  const publish = () =>
    act("publish", () =>
      // A published one-of-one piece has to be sellable, so restore quantity
      // if a previous archive zeroed it.
      admin.update(token, p.sku, {
        status: "active",
        quantity: Math.max(1, Number(p.quantity) || 0),
      })
    );

  const unpublish = () => act("unpublish", () => admin.update(token, p.sku, { status: "draft" }));

  const archive = () => {
    if (!window.confirm(`Archive ${p.sku}? It leaves the shop but stays readable in past orders.`)) return;
    return act("archive", () => admin.archive(token, p.sku));
  };

  const save = () =>
    act("save", () =>
      admin.update(token, p.sku, {
        name: form.name,
        category: form.category,
        price: Number(form.price),
        size: form.size,
        condition_grade: form.condition_grade,
        color: form.color,
        brand: form.brand,
        description: form.description,
      })
    );

  return (
    <div className="py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px]" style={{ color: "#F3ECDD" }}>{p.name}</span>
            <StatusPill status={p.status} />
            {reserved && (
              <span className="text-[9px] uppercase tracking-[0.12em]" style={{ color: GOLD_LIGHT }}>
                reserved
              </span>
            )}
          </div>
          <p className="text-[11px] mt-0.5" style={{ color: "#777" }}>
            {p.sku} · {p.category} · Size {p.size || "—"} · {p.condition_grade || "—"} ·{" "}
            {naira(p.price)} · qty {p.quantity}
          </p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {p.status === "draft" && (
            <button
              onClick={publish}
              disabled={!!busy}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full disabled:opacity-40"
              style={{ background: GOLD, color: INK }}
            >
              {busy === "publish" ? "Publishing…" : "Publish"}
            </button>
          )}
          {p.status === "active" && (
            <button
              onClick={unpublish}
              disabled={!!busy}
              className="text-[11px] px-3 py-1.5 rounded-full disabled:opacity-40"
              style={{ border: `1px solid ${LINE}`, color: "#999" }}
            >
              {busy === "unpublish" ? "…" : "Unpublish"}
            </button>
          )}
          <button
            onClick={() => setEditing((v) => !v)}
            disabled={!!busy}
            className="text-[11px] px-3 py-1.5 rounded-full disabled:opacity-40"
            style={{ border: `1px solid ${LINE}`, color: "#999" }}
          >
            {editing ? "Cancel" : "Edit"}
          </button>
          {p.status !== "archived" && (
            <button
              onClick={archive}
              disabled={!!busy}
              className="text-[11px] px-3 py-1.5 rounded-full disabled:opacity-40"
              style={{ border: `1px solid ${LINE}`, color: "#8A5A5A" }}
            >
              {busy === "archive" ? "…" : "Archive"}
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="mt-3 p-3 rounded" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
          {reserved && (
            <Banner kind="error">
              A shopper is checking out with this item. The API will refuse edits until the hold expires.
            </Banner>
          )}
          <div className="grid sm:grid-cols-2 gap-x-3">
            <Field label="Name">
              <input className={inputCls} value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Price (NGN)">
              <input className={inputCls} value={form.price ?? ""} onChange={(e) => setForm({ ...form, price: e.target.value })} />
            </Field>
            <Field label="Category">
              <select className={inputCls} value={form.category || ""} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Size">
              <select className={inputCls} value={form.size || ""} onChange={(e) => setForm({ ...form, size: e.target.value })}>
                {SIZES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Condition">
              <select className={inputCls} value={form.condition_grade || ""} onChange={(e) => setForm({ ...form, condition_grade: e.target.value })}>
                {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Colour">
              <input className={inputCls} value={form.color || ""} onChange={(e) => setForm({ ...form, color: e.target.value })} />
            </Field>
          </div>
          <Field label="Brand" hint="Leave blank if unlabeled — placeholders like N/A are stripped server-side.">
            <input className={inputCls} value={form.brand || ""} onChange={(e) => setForm({ ...form, brand: e.target.value })} />
          </Field>
          <Field label="Description">
            <textarea rows={2} className={inputCls + " resize-none"} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <button
            onClick={save}
            disabled={!!busy}
            className="font-semibold text-[12px] px-5 py-2 rounded-full disabled:opacity-40"
            style={{ background: GOLD, color: INK }}
          >
            {busy === "save" ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
    </div>
  );
}

function ProductsView({ token }) {
  const [status, setStatus] = useState("all");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await admin.products(token, status);
      setProducts(data.products || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, status]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className="text-[11px] uppercase tracking-[0.1em] px-3 py-1.5 rounded-full transition-colors"
            style={{
              border: `1px solid ${status === s ? GOLD : LINE}`,
              color: status === s ? GOLD : "#999",
              background: status === s ? PANEL : "transparent",
            }}
          >
            {s}
          </button>
        ))}
        <button onClick={load} className="ml-auto text-[11px] px-3 py-1.5 rounded-full" style={{ border: `1px solid ${LINE}`, color: "#999" }}>
          Refresh
        </button>
      </div>

      <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>

      {loading ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "#666" }}>Loading products…</p>
      ) : products.length === 0 ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "#666" }}>
          {status === "all" ? "No products yet." : `No ${status} products.`}
        </p>
      ) : (
        <>
          <p className="text-[11px] mb-1" style={{ color: "#666" }}>{products.length} product(s)</p>
          {products.map((p) => (
            <ProductRow key={p.sku} p={p} token={token} onChanged={load} onError={setError} />
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------
const ORDER_TABS = ["all", "pending", "paid", "failed", "cancelled"];

function OrdersView({ token }) {
  const [status, setStatus] = useState("all");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await admin.orders(token, status);
      setOrders(data.orders || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, status]);

  useEffect(() => { load(); }, [load]);

  const expand = async (id) => {
    if (open === id) { setOpen(null); setDetail(null); return; }
    setOpen(id);
    setDetail(null);
    try {
      setDetail(await admin.order(token, id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {ORDER_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className="text-[11px] uppercase tracking-[0.1em] px-3 py-1.5 rounded-full"
            style={{
              border: `1px solid ${status === s ? GOLD : LINE}`,
              color: status === s ? GOLD : "#999",
              background: status === s ? PANEL : "transparent",
            }}
          >
            {s}
          </button>
        ))}
        <button onClick={load} className="ml-auto text-[11px] px-3 py-1.5 rounded-full" style={{ border: `1px solid ${LINE}`, color: "#999" }}>
          Refresh
        </button>
      </div>

      <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>

      {loading ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "#666" }}>Loading orders…</p>
      ) : orders.length === 0 ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "#666" }}>
          No orders yet. They appear here once a shopper checks out.
        </p>
      ) : (
        orders.map((o) => (
          <div key={o.id} className="py-3" style={{ borderBottom: `1px solid ${LINE}` }}>
            <button onClick={() => expand(o.id)} className="w-full text-left flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px]" style={{ color: "#F3ECDD" }}>{o.id}</span>
                  <StatusPill status={o.status === "paid" ? "active" : o.status === "pending" ? "draft" : "archived"} />
                  <span className="text-[10px]" style={{ color: "#777" }}>{o.status}</span>
                </div>
                <p className="text-[11px] mt-0.5" style={{ color: "#777" }}>
                  {o.full_name || "—"} · {o.email} · {o.city || "—"} · {o.item_count} item(s)
                </p>
              </div>
              <span className="text-[13px] font-semibold" style={{ color: GOLD }}>{naira(o.amount)}</span>
            </button>

            {open === o.id && (
              <div className="mt-3 p-3 rounded text-[12px]" style={{ background: PANEL, border: `1px solid ${LINE}`, color: "#bbb" }}>
                {!detail ? (
                  <span style={{ color: "#666" }}>Loading order…</span>
                ) : (
                  <>
                    <p style={{ color: "#888" }}>
                      {detail.order.phone || "no phone"} · {detail.order.address || "no address"}
                    </p>
                    <p style={{ color: "#666" }} className="text-[11px] mt-0.5">
                      Created {detail.order.created_at}
                      {detail.order.paid_at ? ` · Paid ${detail.order.paid_at}` : ""}
                    </p>
                    <div className="mt-2">
                      {(detail.items || []).map((it) => (
                        <div key={it.id} className="flex justify-between py-1" style={{ borderTop: `1px solid ${LINE}` }}>
                          <span>{it.sku} · {it.name} {it.size ? `· ${it.size}` : ""}</span>
                          <span style={{ color: GOLD }}>{naira(it.price)}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add product
// ---------------------------------------------------------------------------
function AddView({ token, onAdded }) {
  const [mode, setMode] = useState("auto");
  const [files, setFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const inputRef = useRef();

  const blank = {
    sku: "", name: "", category: "Dresses", price: "", size: "M",
    condition_grade: "Excellent", color: "", brand: "", description: "",
  };
  const [form, setForm] = useState(blank);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Keep the File itself, not just a preview URL — it is what gets uploaded.
  const handleFiles = (list) => {
    setFiles(Array.from(list).slice(0, 5).map((f) => ({ file: f, name: f.name, size: f.size, url: URL.createObjectURL(f) })));
    setResults([]);
  };


  const submit = async (status) => {
    setSaving(true);
    setError("");
    setOk("");
    setResults([]);
    try {
      setStage("Saving item…");
      await admin.create(token, { ...form, price: Number(form.price), quantity: 1, status });

      // Photos go up only after the product exists: the Worker keys objects by
      // SKU, and a failed upload must not cost you the item you just typed in.
      let uploaded = 0;
      const out = [];
      if (IMAGE_API && files.length) {
        for (let i = 0; i < files.length; i++) {
          setStage(`Uploading photo ${i + 1} of ${files.length}…`);
          try {
            const r = await uploadPhoto(token, { sku: form.sku, index: i + 1, file: files[i].file, processing: mode });
            uploaded++;
            out.push({ name: files[i].name, url: files[i].url, ok: true, note: r.note, cutout: r.cutout });
          } catch (err) {
            out.push({ name: files[i].name, url: files[i].url, ok: false, note: err.message });
          }
        }
        setResults(out);
        if (uploaded) {
          setStage("Linking photos…");
          await admin.update(token, form.sku, { image_count: uploaded });
        }
      }

      setOk(
        `${form.sku} saved as ${status}.` +
          (IMAGE_API && files.length ? ` ${uploaded} of ${files.length} photo(s) uploaded.` : "")
      );
      setForm(blank);
      setFiles([]);
      onAdded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setStage("");
      setSaving(false);
    }
  };

  return (
    <div className="grid md:grid-cols-[1.15fr_1fr] gap-6">
      <div>
        <div className="mb-4">
          <label className="block text-[10px] uppercase tracking-[0.14em] text-[#888] mb-2">Photo processing</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: "auto", title: "Clean up automatically", blurb: "Removes the room, crops to the garment, picks a backdrop that keeps it visible." },
              { id: "asis", title: "Use photo as shot", blurb: "Keeps your styling and background. Still compressed and converted for fast loading." },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className="text-left p-3 rounded-lg border transition-colors"
                style={{ borderColor: mode === m.id ? GOLD : LINE, background: mode === m.id ? PANEL : "transparent" }}
              >
                <span className="text-[13px] font-medium" style={{ color: mode === m.id ? GOLD_LIGHT : "#bbb" }}>{m.title}</span>
                <p className="text-[11px] mt-1 leading-snug" style={{ color: "#666" }}>{m.blurb}</p>
              </button>
            ))}
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className="rounded-lg border border-dashed p-8 text-center cursor-pointer transition-colors"
          style={{ borderColor: dragging ? GOLD : LINE, background: dragging ? PANEL : "transparent" }}
        >
          <p className="text-[13px]" style={{ color: "#bbb" }}>Drop photos here, or click to choose</p>
          <p className="text-[11px] mt-1" style={{ color: "#5f5f5f" }}>Up to 5 photos per item · JPG, PNG, HEIC</p>
          <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </div>

        <p className="text-[10px] mt-2" style={{ color: "#6a5a2a" }}>
          {IMAGE_API
            ? "Photos upload when you save — the item has to exist first, since photos are stored against its SKU."
            : "Preview only: no image Worker is configured (VITE_IMAGE_API), so these photos will not be stored with the product."}
        </p>

        {files.length > 0 && (
          <div className="mt-4">
            <div className="flex gap-2 flex-wrap">
              {files.map((f, i) => (
                <div key={i} className="relative">
                  <img src={f.url} alt="" className="w-20 h-24 object-cover rounded" style={{ border: `1px solid ${LINE}` }} />
                  {i === 0 && (
                    <span className="absolute bottom-1 left-1 text-[9px] px-1.5 py-0.5 rounded font-semibold" style={{ background: GOLD, color: INK }}>Main</span>
                  )}
                </div>
              ))}
            </div>

          </div>
        )}

        {results.length > 0 && (
          <div className="mt-5 rounded-lg overflow-hidden" style={{ border: `1px solid ${LINE}` }}>
            <div className="px-3 py-2" style={{ background: PANEL, borderBottom: `1px solid ${LINE}` }}>
              <span className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "#888" }}>Uploads</span>
            </div>
            <div>
              {results.map((r, i) => (
                <div key={i} className="p-3 flex gap-3 items-start" style={{ borderTop: i ? `1px solid ${LINE}` : "none" }}>
                  <img src={r.url} alt="" className="w-12 h-14 object-cover rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] truncate" style={{ color: r.ok ? "#ddd" : "#E9A5A5" }}>{r.name}</p>
                    <p className="text-[11px] mt-0.5" style={{ color: r.ok ? "#8a8a6a" : "#E9A5A5" }}>
                      {r.note || (r.ok ? (r.cutout ? "Background removed and stored." : "Stored and optimised.") : "Upload failed.")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg p-5 h-fit" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
        <h2 className="font-display italic text-lg mb-4" style={{ color: GOLD_LIGHT }}>Item Details</h2>

        <Banner kind="error" onDismiss={() => setError("")}>{error}</Banner>
        <Banner kind="ok" onDismiss={() => setOk("")}>{ok}</Banner>

        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU">
            <input className={inputCls} value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="TBE-0005" />
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
            <select className={inputCls} value={form.condition_grade} onChange={(e) => set("condition_grade", e.target.value)}>
              {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Colour">
            <input className={inputCls} value={form.color} onChange={(e) => set("color", e.target.value)} placeholder="Coral" />
          </Field>
        </div>

        <Field label="Brand" hint="Leave blank if unlabeled.">
          <input className={inputCls} value={form.brand} onChange={(e) => set("brand", e.target.value)} placeholder="Unlabeled" />
        </Field>

        <Field label="Description" hint="Fabric, fit, and any flaws. Search and recommendations read this.">
          <textarea rows={3} className={inputCls + " resize-none"} value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Off-shoulder cotton peplum top with crochet lace trim and elasticated waist." />
        </Field>

        <button
          onClick={() => submit("active")}
          disabled={saving}
          className="w-full font-semibold text-[13px] py-2.5 rounded-full disabled:opacity-40"
          style={{ background: GOLD, color: INK }}
        >
          {saving ? stage || "Saving…" : "Publish Item"}
        </button>
        <button
          onClick={() => submit("draft")}
          disabled={saving}
          className="w-full mt-2 text-[13px] py-2.5 rounded-full disabled:opacity-40"
          style={{ border: `1px solid ${LINE}`, color: "#999" }}
        >
          Save as Draft
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
export default function AdminUpload() {
  const [token, setToken] = useState(null);   // memory only — never persisted
  const [tab, setTab] = useState("add");
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const data = await admin.stats(token);
      setStats(data.stats);
    } catch {
      /* the tab views surface their own errors */
    }
  }, [token]);

  useEffect(() => { loadStats(); }, [loadStats, tab]);

  if (!token) return <SignIn onToken={setToken} />;

  const TABS = [
    { id: "add", label: "Add Product" },
    { id: "products", label: "Products" },
    { id: "orders", label: "Orders" },
  ];

  return (
    <div className="min-h-screen p-6" style={{ background: INK, color: "#F3ECDD", fontFamily: "Inter, sans-serif" }}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <TEMonogram size={28} />
            <span className="font-display italic text-xl" style={{ color: GOLD }}>Thrift by Eugy</span>
            <span className="text-[11px] uppercase tracking-[0.15em] ml-1" style={{ color: "#666" }}>Admin</span>
          </div>
          <button onClick={() => { setToken(null); setStats(null); }} className="text-[12px]" style={{ color: "#777" }}>
            Sign out
          </button>
        </div>

        <svg viewBox="0 0 200 12" className="w-full h-3 opacity-70 mb-5" preserveAspectRatio="none">
          <path d="M0 6 C 40 1, 60 1, 100 6 C 140 11, 160 11, 200 6" stroke={GOLD} strokeWidth="0.8" fill="none" />
        </svg>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-6">
            {[
              ["Live", stats.live], ["Drafts", stats.drafts], ["Sold", stats.sold],
              ["Reserved", stats.reserved_now], ["Pending", stats.pending_orders],
              ["Paid", stats.paid_orders], ["Revenue", naira(stats.revenue)],
            ].map(([label, value]) => (
              <div key={label} className="px-3 py-2 rounded" style={{ background: PANEL, border: `1px solid ${LINE}` }}>
                <p className="text-[9px] uppercase tracking-[0.12em]" style={{ color: "#666" }}>{label}</p>
                <p className="text-[15px] font-semibold" style={{ color: GOLD_LIGHT }}>{value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-5 mb-5 text-[13px]" style={{ borderBottom: `1px solid ${LINE}` }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="pb-2.5 relative"
              style={{ color: tab === t.id ? GOLD : "#888", fontWeight: tab === t.id ? 600 : 400 }}
            >
              {t.label}
              {tab === t.id && <span className="absolute left-0 right-0 bottom-0 h-[2px]" style={{ background: GOLD }} />}
            </button>
          ))}
        </div>

        {tab === "add" && <AddView token={token} onAdded={loadStats} />}
        {tab === "products" && <ProductsView token={token} />}
        {tab === "orders" && <OrdersView token={token} />}
      </div>
    </div>
  );
}
