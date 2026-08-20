import React from "react";

/**
 * Thrift by Eugy brand mark — the official circular TE medallion
 * (public/brand/crest-round.png, transparent background), used wherever a
 * compact square mark is needed. The full laurel crest and script wordmark
 * also live in public/brand/ for header lockups on ink grounds.
 */
export function TEMonogram({ size = 34, className = "" }) {
  return (
    <img
      src="/brand/crest-round.png"
      alt="Thrift by Eugy monogram"
      width={size}
      height={size}
      className={className}
      style={{ display: "block", borderRadius: "50%" }}
    />
  );
}

/** Monogram + script wordmark lockup for headers and footers. */
export function BrandLockup({ size = 30, wordmarkClass = "font-display italic text-2xl tracking-tight" }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <TEMonogram size={size} />
      <span className={wordmarkClass} style={{ color: "#C9A227" }}>
        Thrift by Eugy
      </span>
    </span>
  );
}
