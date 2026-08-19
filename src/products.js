// Real inventory — one entry per SKU, matching templates/ThriftByEugy_Product_Template.xlsx.
// Image files live in public/products/ and are named <SKU>_<slug>.png.
export const REAL_PRODUCTS = [
  {
    id: "TBE-0001",
    sku: "TBE-0001",
    name: "Coral Lace-Trim Peplum Top",
    category: "Tops",
    price: 8500,
    color: "#B85C38",
    height: 300,
    size: "M",
    condition: "Excellent",
    image: "/products/TBE-0001_coral-peplum-top.png",
    description:
      "Off-shoulder peplum top in coral with a crochet lace overlay neckline, button front, and elasticated waist.",
  },
  {
    id: "TBE-0002",
    sku: "TBE-0002",
    name: "Lime Ruffle Crop Top",
    category: "Tops",
    price: 7500,
    color: "#5C8A2F",
    height: 300,
    size: "S",
    condition: "Excellent",
    image: "/products/TBE-0002_lime-ruffle-top.png",
    description:
      "Statement lime-green crop top with cascading pleated ruffles along the V-neckline and cropped hem.",
  },
];
