import React, { useState, useEffect } from "react";
import Storefront from "./Storefront.jsx";
import ThriftByEugy from "./ThriftByEugy.jsx";
import AdminUpload from "./AdminUpload.jsx";
import SpinViewerDemo from "./SpinViewer.jsx";
import RecommenderLab from "./RecommenderLab.jsx";

/**
 * Thrift by Eugy — preview shell.
 *
 * Wraps every prototype built so far behind a simple hash router so the whole
 * project can be deployed to Cloudflare Pages and reviewed in one place.
 *
 * This shell is a REVIEW TOOL, not part of the real storefront. When the
 * production site is built, Storefront becomes the root route and the admin
 * panel moves behind authentication.
 */

const VIEWS = [
  { id: "storefront", label: "Storefront", component: Storefront, note: "Customer-facing shop" },
  { id: "spin", label: "360° Viewer", component: SpinViewerDemo, note: "Product rotation" },
  { id: "admin", label: "Admin Upload", component: AdminUpload, note: "Add products" },
  { id: "recommender", label: "Recommender", component: RecommenderLab, note: "AI suggestions" },
  { id: "classic", label: "Classic Storefront", component: ThriftByEugy, note: "Original layout" },
];

function getHash() {
  const h = window.location.hash.replace("#/", "").replace("#", "");
  return VIEWS.find((v) => v.id === h)?.id || "storefront";
}

export default function App() {
  const [view, setView] = useState(getHash);
  const [barOpen, setBarOpen] = useState(false);

  useEffect(() => {
    const onHash = () => setView(getHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const go = (id) => {
    window.location.hash = `/${id}`;
    setView(id);
    setBarOpen(false);
    window.scrollTo(0, 0);
  };

  const Active = VIEWS.find((v) => v.id === view)?.component || Storefront;

  return (
    <div className="min-h-screen" style={{ background: "#0A0A0C" }}>
      {/* Floating preview switcher. Deliberately unobtrusive so the storefront
          can be judged on its own, but always reachable. */}
      <div className="fixed bottom-4 right-4 z-[100]">
        {barOpen && (
          <div
            className="mb-2 rounded-xl overflow-hidden shadow-2xl"
            style={{ background: "#141416", border: "1px solid #2a2a2d", minWidth: 210 }}
          >
            <div className="px-3 py-2 text-[10px] uppercase tracking-[0.15em]" style={{ color: "#666", borderBottom: "1px solid #2a2a2d" }}>
              Preview
            </div>
            {VIEWS.map((v) => (
              <button
                key={v.id}
                onClick={() => go(v.id)}
                className="w-full text-left px-3 py-2.5 transition-colors hover:bg-black/40"
                style={{ borderBottom: "1px solid #2a2a2d" }}
              >
                <div className="text-[13px]" style={{ color: view === v.id ? "#C9A227" : "#ddd" }}>
                  {v.label}
                </div>
                <div className="text-[10px]" style={{ color: "#666" }}>{v.note}</div>
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setBarOpen((b) => !b)}
          aria-label="Switch preview"
          className="w-12 h-12 rounded-full shadow-2xl flex items-center justify-center text-[18px] transition-transform active:scale-95"
          style={{ background: "#C9A227", color: "#0A0A0C" }}
        >
          {barOpen ? "×" : "☰"}
        </button>
      </div>

      <Active />
    </div>
  );
}
