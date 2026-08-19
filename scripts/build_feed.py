#!/usr/bin/env python3
"""
Thrift by Eugy — Google Merchant Center feed generator
-------------------------------------------------------
Reads the product spreadsheet and emits a Google-spec RSS 2.0 XML feed.

Thrift inventory breaks several assumptions Google's spec makes about
retail, so this handles those explicitly:

  * Everything is condition=used, not new.
  * Most pieces are unbranded, so there is no GTIN and no MPN.
    Google's default assumption is identifier_exists=true; leaving it
    unset gets one-of-one thrift items disapproved.
  * Quantity is almost always 1, so a sold item MUST flip to
    out_of_stock fast or you're advertising something you can't sell.
  * Apparel adds required attributes (color, size, gender, age_group)
    that non-apparel feeds don't need.

Usage:
    python3 build_feed.py products.xlsx --out feed.xml
    python3 build_feed.py products.xlsx --validate-only
"""

import argparse
import html
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

try:
    import openpyxl
except ImportError:
    print("Needs openpyxl:  pip install openpyxl --break-system-packages")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Store configuration
# ---------------------------------------------------------------------------
STORE_NAME = "Thrift by Eugy"
STORE_URL = "https://thriftbyeugy.com"
STORE_DESC = "Curated secondhand fashion — one-of-one preloved pieces."
CURRENCY = "NGN"
IMAGE_BASE = f"{STORE_URL}/img"

# Google product taxonomy IDs.
# Full list: https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
CATEGORY_MAP = {
    "Dresses": ("2271", "Apparel & Accessories > Clothing > Dresses"),
    "Outerwear": ("5598", "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets"),
    "Denim": ("5322", "Apparel & Accessories > Clothing > Pants"),
    "Tops": ("212", "Apparel & Accessories > Clothing > Shirts & Tops"),
    "Accessories": ("166", "Apparel & Accessories > Clothing Accessories"),
    "Shoes": ("187", "Apparel & Accessories > Shoes"),
}

# Google accepts only: male, female, unisex
DEFAULT_GENDER = "female"
# Google accepts only: newborn, infant, toddler, kids, adult
DEFAULT_AGE_GROUP = "adult"

# Google accepts only: new, refurbished, used
CONDITION = "used"

# Your spreadsheet's condition grades are merchandising language, not Google's
# condition attribute. They belong in the description so shoppers see them.
CONDITION_NOTES = {
    "Excellent": "Excellent preloved condition, no visible wear.",
    "Very Good": "Very good preloved condition, minimal signs of wear.",
    "Good": "Good preloved condition, light wear consistent with age.",
    "Fair": "Fair preloved condition, visible wear — see photos.",
}

MAX_TITLE = 150
MAX_DESC = 5000


class FeedItem:
    def __init__(self, row):
        self.sku = str(row.get("SKU") or "").strip()
        self.name = str(row.get("Product Name") or "").strip()
        self.category = str(row.get("Category") or "").strip()
        self.price = row.get("Price (NGN)")
        self.size = str(row.get("Size") or "").strip()
        self.condition_grade = str(row.get("Condition") or "").strip()
        self.color = str(row.get("Color") or "").strip()
        self.brand = str(row.get("Brand (if known)") or "").strip()
        self.description = str(row.get("Description") or "").strip()
        self.image1 = str(row.get("Image Filename 1") or "").strip()
        self.image2 = str(row.get("Image Filename 2") or "").strip()
        self.image3 = str(row.get("Image Filename 3") or "").strip()
        self.qty = row.get("Quantity Available")
        self.status = str(row.get("Status") or "").strip()

    # -- validation ---------------------------------------------------------
    def errors(self):
        """Blocking problems — Google will disapprove the item."""
        e = []
        if not self.sku:
            e.append("Missing SKU")
        if not self.name:
            e.append("Missing product name")
        if not self.description:
            e.append("Missing description (required by Google)")
        if self.category not in CATEGORY_MAP:
            e.append(f"Unknown category '{self.category}' — must be one of: {', '.join(CATEGORY_MAP)}")
        try:
            p = float(self.price)
            if p <= 0:
                e.append("Price must be greater than zero")
        except (TypeError, ValueError):
            e.append(f"Price is not a number: {self.price!r}")
        if not self.image1:
            e.append("Missing main image — Google requires at least one")
        if not self.color:
            e.append("Missing color (required for apparel)")
        if not self.size:
            e.append("Missing size (required for apparel)")
        if len(self.name) > MAX_TITLE:
            e.append(f"Title over {MAX_TITLE} characters")
        return e

    def warnings(self):
        """Non-blocking, but worth fixing."""
        w = []
        if self.brand and self.brand.lower() in (
            "n/a", "na", "none", "generic", "no brand", "unbranded", "unlabeled", "does not exist",
        ):
            w.append(
                f"Brand '{self.brand}' is a placeholder — Google rejects these. "
                "Leave brand empty instead."
            )
        if len(self.description) < 30:
            w.append("Description is very short — hurts ad relevance")
        try:
            if int(self.qty) > 1:
                w.append(f"Quantity {self.qty} — unusual for one-of-one thrift, double-check")
        except (TypeError, ValueError):
            pass
        return w

    # -- feed fields --------------------------------------------------------
    @property
    def is_listable(self):
        return self.status.lower() == "active"

    @property
    def availability(self):
        try:
            return "in_stock" if int(self.qty) > 0 else "out_of_stock"
        except (TypeError, ValueError):
            return "out_of_stock"

    @property
    def has_real_brand(self):
        """A genuine manufacturer brand, not a placeholder."""
        if not self.brand:
            return False
        return self.brand.lower() not in (
            "n/a", "na", "none", "generic", "no brand", "unbranded",
            "unlabeled", "unknown", "does not exist", "",
        )

    def title(self):
        """Google matches on title text, so lead with what people search:
        color + item, and flag preloved so expectations are set in the SERP."""
        bits = []
        if self.color:
            bits.append(self.color)
        bits.append(self.name)
        t = " ".join(bits)
        if "preloved" not in t.lower() and "thrift" not in t.lower():
            t = f"{t} — Preloved"
        return t[:MAX_TITLE]

    def full_description(self):
        parts = [self.description]
        note = CONDITION_NOTES.get(self.condition_grade)
        if note:
            parts.append(note)
        parts.append("One-of-one preloved piece — once it's gone, it's gone.")
        if self.size:
            parts.append(f"Size {self.size}.")
        return " ".join(p for p in parts if p)[:MAX_DESC]

    def image_urls(self):
        urls = []
        for img in (self.image1, self.image2, self.image3):
            if img:
                idx = len(urls) + 1
                urls.append(f"{IMAGE_BASE}/{self.sku}/{idx}/detail")
        return urls


def read_products(path):
    wb = openpyxl.load_workbook(path, data_only=True)
    ws = wb["Products"] if "Products" in wb.sheetnames else wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    items = []
    for r in rows[1:]:
        if not any(c is not None and str(c).strip() for c in r):
            continue
        items.append(FeedItem(dict(zip(headers, r))))
    return items


def build_xml(items):
    now = datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000")
    out = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
        "  <channel>",
        f"    <title>{escape(STORE_NAME)}</title>",
        f"    <link>{escape(STORE_URL)}</link>",
        f"    <description>{escape(STORE_DESC)}</description>",
        f"    <lastBuildDate>{now}</lastBuildDate>",
    ]

    for it in items:
        cat_id, cat_path = CATEGORY_MAP[it.category]
        images = it.image_urls()
        price = f"{float(it.price):.2f} {CURRENCY}"

        out.append("    <item>")
        out.append(f"      <g:id>{escape(it.sku)}</g:id>")
        out.append(f"      <g:title>{escape(it.title())}</g:title>")
        out.append(f"      <g:description>{escape(it.full_description())}</g:description>")
        out.append(f"      <g:link>{escape(STORE_URL)}/product/{escape(it.sku)}</g:link>")
        out.append(f"      <g:image_link>{escape(images[0])}</g:image_link>")
        for extra in images[1:]:
            out.append(f"      <g:additional_image_link>{escape(extra)}</g:additional_image_link>")
        out.append(f"      <g:availability>{it.availability}</g:availability>")
        out.append(f"      <g:price>{price}</g:price>")
        out.append(f"      <g:condition>{CONDITION}</g:condition>")
        out.append(f"      <g:google_product_category>{cat_id}</g:google_product_category>")
        out.append(f"      <g:product_type>{escape(cat_path)}</g:product_type>")

        # Identifiers: the part that trips up secondhand sellers.
        if it.has_real_brand:
            # A recognisable label survived on the garment. Give Google the
            # brand, but still no GTIN — a specific preloved item has no
            # manufacturer barcode we can honestly supply.
            out.append(f"      <g:brand>{escape(it.brand)}</g:brand>")
            out.append(f"      <g:mpn>{escape(it.sku)}</g:mpn>")
            out.append("      <g:identifier_exists>yes</g:identifier_exists>")
        else:
            # Unbranded thrift: no brand, no GTIN, no MPN.
            # identifier_exists defaults to 'yes' if omitted, which gets these
            # items disapproved — so it must be set explicitly.
            out.append("      <g:identifier_exists>no</g:identifier_exists>")

        # Apparel-specific required attributes
        out.append(f"      <g:color>{escape(it.color)}</g:color>")
        out.append(f"      <g:size>{escape(it.size)}</g:size>")
        out.append(f"      <g:gender>{DEFAULT_GENDER}</g:gender>")
        out.append(f"      <g:age_group>{DEFAULT_AGE_GROUP}</g:age_group>")

        out.append("    </item>")

    out.append("  </channel>")
    out.append("</rss>")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("spreadsheet")
    ap.add_argument("--out", default="feed.xml")
    ap.add_argument("--validate-only", action="store_true")
    args = ap.parse_args()

    path = Path(args.spreadsheet)
    if not path.exists():
        print(f"No file at {path}")
        sys.exit(1)

    items = read_products(path)
    print(f"Read {len(items)} row(s) from {path.name}\n")

    listable, skipped, blocked = [], [], []
    warn_count = 0

    for it in items:
        errs = it.errors()
        warns = it.warnings()
        for w in warns:
            print(f"  warning  {it.sku or '(no SKU)'}: {w}")
            warn_count += 1
        if errs:
            for e in errs:
                print(f"  ERROR    {it.sku or '(no SKU)'}: {e}")
            blocked.append(it)
        elif not it.is_listable:
            skipped.append(it)
        else:
            listable.append(it)

    print()
    print(f"  {len(listable)} ready for the feed")
    if skipped:
        print(f"  {len(skipped)} skipped (status is not Active)")
    if blocked:
        print(f"  {len(blocked)} blocked by errors — fix these or Google will disapprove them")
    if warn_count:
        print(f"  {warn_count} warning(s)")

    in_stock = sum(1 for i in listable if i.availability == "in_stock")
    print(f"  {in_stock} in stock / {len(listable) - in_stock} out of stock")

    if args.validate_only:
        return

    if not listable:
        print("\nNothing to write.")
        return

    xml = build_xml(listable)
    Path(args.out).write_text(xml, encoding="utf-8")
    print(f"\nWrote {args.out} ({len(xml):,} bytes)")


if __name__ == "__main__":
    main()
