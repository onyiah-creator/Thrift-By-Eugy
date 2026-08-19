import React, { useId } from "react";

/**
 * Thrift by Eugy brand mark — a crisp vector rendition of the TE monogram
 * crest from the official logo (gold circle, serif TE, signature wave),
 * so it stays sharp at any size on the ink background.
 */
export function TEMonogram({ size = 34, className = "" }) {
  const id = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="Thrift by Eugy monogram"
    >
      <defs>
        <radialGradient id={`${id}-g`} cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#E8C56B" />
          <stop offset="55%" stopColor="#C9A227" />
          <stop offset="100%" stopColor="#8A6E2F" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="47" fill={`url(#${id}-g)`} stroke="#E8C56B" strokeWidth="1.5" />
      <text
        x="37"
        y="63"
        textAnchor="middle"
        fontFamily="'Playfair Display', Georgia, serif"
        fontSize="54"
        fontWeight="700"
        fill="#F3ECDD"
        stroke="#0A0A0C"
        strokeWidth="2"
        paintOrder="stroke"
      >
        T
      </text>
      <text
        x="62"
        y="74"
        textAnchor="middle"
        fontFamily="'Playfair Display', Georgia, serif"
        fontSize="54"
        fontWeight="700"
        fill="#F3ECDD"
        stroke="#0A0A0C"
        strokeWidth="2"
        paintOrder="stroke"
      >
        E
      </text>
      <path
        d="M6 54 C 28 40, 50 66, 94 46"
        stroke="#0A0A0C"
        strokeWidth="7"
        fill="none"
        opacity="0.85"
      />
      <path
        d="M6 51 C 28 38, 50 63, 94 43"
        stroke="#F3ECDD"
        strokeWidth="2.5"
        fill="none"
      />
    </svg>
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
