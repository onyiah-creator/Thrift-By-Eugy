import { REAL_PRODUCTS } from "./products.js";

// Shared catalogue: real inventory first, then generated placeholders that
// keep the layouts full until the catalog grows.
export const CATEGORIES = ["Dresses", "Outerwear", "Denim", "Tops", "Accessories", "Shoes"];

export const PALETTE = [
  "#6B2C3E", "#3E5C50", "#8A6E2F", "#3C3C6E", "#7A3B2E", "#2F5C5C", "#5C2F5C", "#4B4B23",
];

function seedName(i) {
  const adjectives = ["Vintage", "Retro", "Classic", "Rare", "Timeless", "Boho", "Preloved", "Statement"];
  const items = ["Trench Coat", "Silk Slip Dress", "Denim Jacket", "Wrap Blouse", "Pleated Skirt", "Knit Cardigan", "Leather Belt", "Ankle Boots", "Cotton Tee", "Wide-Leg Trousers", "Beaded Clutch", "Blazer"];
  const a = adjectives[i % adjectives.length];
  const b = items[(i * 3 + 1) % items.length];
  return `${a} ${b}`;
}

export function makeProducts(n, offset = 0) {
  return Array.from({ length: n }).map((_, idx) => {
    const i = idx + offset;
    return {
      id: i,
      sku: `GEN-${String(i).padStart(4, "0")}`,
      name: seedName(i),
      category: CATEGORIES[i % CATEGORIES.length],
      price: 3500 + ((i * 733) % 18000),
      color: PALETTE[i % PALETTE.length],
      height: 220 + ((i * 97) % 140),
      size: ["XS", "S", "M", "L", "XL"][i % 5],
      condition: ["Excellent", "Very Good", "Good"][i % 3],
      quantity: 1,
      status: "active",
      dateAdded: `2026-07-${String((i % 28) + 1).padStart(2, "0")}`,
      justIn: idx < 4,
    };
  });
}

export const ALL_PRODUCTS = [
  ...REAL_PRODUCTS.map((p) => ({ ...p, justIn: true })),
  ...makeProducts(24),
];
