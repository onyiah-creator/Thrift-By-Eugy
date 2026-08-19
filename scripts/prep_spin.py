#!/usr/bin/env python3
"""
Thrift by Eugy — Spin Frame Prep
---------------------------------
Takes a folder of raw spin photos for one item and outputs an aligned,
consistently-cropped, web-ready frame sequence for the 360° viewer.

The key requirement a spin has that a single photo doesn't: every frame must
share the SAME crop box. Cropping each frame to its own bounding box makes the
garment jitter and pulse as it turns, which reads as a broken viewer. So this
script computes one crop box across all frames and applies it to every one.

Usage:
    python3 prep_spin.py TBE-0001                # reads spin_raw/TBE-0001/
    python3 prep_spin.py TBE-0001 --keep-bg      # skip background removal

Output: spin_out/TBE-0001/frame_00.jpg ... plus manifest.json
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

try:
    from rembg import remove, new_session
    HAS_REMBG = True
except ImportError:
    HAS_REMBG = False

RAW_DIR = Path(__file__).parent / "spin_raw"
OUT_DIR = Path(__file__).parent / "spin_out"

TARGET_WIDTH = 900       # master frame width; viewer requests smaller variants
JPEG_QUALITY = 85
CROP_PADDING = 30
BACKDROP_DARK = (10, 10, 12)
BACKDROP_LIGHT = (255, 255, 255)
MANNEQUIN_MAX_VALUE = 0.25
LIGHT_GARMENT_THRESHOLD = 0.55

_session = None


def session():
    global _session
    if _session is None:
        _session = new_session("u2net")
    return _session


def cut_out(im):
    """Remove background, keep only the largest connected subject."""
    out = remove(im, session=session())
    arr = np.array(out)
    mask = arr[:, :, 3] > 30
    labeled, num = ndimage.label(mask)
    if num:
        sizes = ndimage.sum(mask, labeled, range(1, num + 1))
        keep = labeled == (int(np.argmax(sizes)) + 1)
        arr[:, :, 3] = np.where(keep, arr[:, :, 3], 0).astype(np.uint8)
    return Image.fromarray(arr)


def bbox_of(im):
    arr = np.array(im)
    if arr.shape[2] == 4:
        ys, xs = np.where(arr[:, :, 3] > 30)
    else:
        return (0, 0, im.width, im.height)
    if len(xs) == 0:
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()))


def union_bbox(boxes, w, h, pad=CROP_PADDING):
    """One crop box covering every frame — this is what stops the jitter."""
    boxes = [b for b in boxes if b]
    if not boxes:
        return (0, 0, w, h)
    x0 = max(min(b[0] for b in boxes) - pad, 0)
    y0 = max(min(b[1] for b in boxes) - pad, 0)
    x1 = min(max(b[2] for b in boxes) + pad, w)
    y1 = min(max(b[3] for b in boxes) + pad, h)
    return (x0, y0, x1, y1)


def garment_lightness(images):
    """Judge brightness across the WHOLE sequence, not per-frame, so the
    backdrop never flips mid-spin."""
    vals = []
    for im in images[:: max(1, len(images) // 6)]:
        arr = np.array(im.convert("RGBA"))
        fg = arr[arr[:, :, 3] > 30][:, :3]
        if len(fg) == 0:
            continue
        sample = fg[:: max(1, len(fg) // 2000)]
        v = sample.max(axis=1) / 255.0
        garment = v[v >= MANNEQUIN_MAX_VALUE]
        if len(garment) > 20:
            vals.append(garment.mean())
    if not vals:
        return "light", 1.0
    mean_v = float(np.mean(vals))
    return ("light" if mean_v >= LIGHT_GARMENT_THRESHOLD else "dark"), mean_v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sku")
    ap.add_argument("--keep-bg", action="store_true", help="Skip background removal")
    args = ap.parse_args()

    src = RAW_DIR / args.sku
    if not src.is_dir():
        print(f"No folder at {src}\nCreate it and put this item's spin photos inside.")
        sys.exit(1)

    paths = sorted(
        p for p in src.iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")
    )
    if len(paths) < 8:
        print(f"Only {len(paths)} photos found. A spin needs at least 24 to feel smooth.")
        if len(paths) == 0:
            sys.exit(1)

    if not args.keep_bg and not HAS_REMBG:
        print("rembg not installed — run with --keep-bg, or:")
        print("  pip install rembg onnxruntime --break-system-packages")
        sys.exit(1)

    print(f"Preparing {len(paths)} frames for {args.sku}...")

    # Pass 1: cut out, collect bounding boxes
    processed = []
    boxes = []
    for i, p in enumerate(paths):
        im = Image.open(p).convert("RGBA")
        if not args.keep_bg:
            im = cut_out(im)
            boxes.append(bbox_of(im))
        processed.append(im)
        print(f"  read {i + 1}/{len(paths)}", end="\r")
    print()

    W, H = processed[0].size

    # Pass 2: one shared crop box, one shared backdrop
    if args.keep_bg:
        crop = (0, 0, W, H)
        backdrop = None
        kind, mean_v = "n/a", 0.0
    else:
        crop = union_bbox(boxes, W, H)
        kind, mean_v = garment_lightness(processed)
        backdrop = BACKDROP_DARK if kind == "light" else BACKDROP_LIGHT
        print(f"  {kind} garment (brightness {mean_v:.2f}) -> "
              f"{'dark' if kind == 'light' else 'white'} backdrop")

    out_dir = OUT_DIR / args.sku
    out_dir.mkdir(parents=True, exist_ok=True)

    scale = TARGET_WIDTH / (crop[2] - crop[0])
    size = (TARGET_WIDTH, int((crop[3] - crop[1]) * scale))

    for i, im in enumerate(processed):
        frame = im.crop(crop).resize(size, Image.LANCZOS)
        if backdrop:
            bg = Image.new("RGBA", frame.size, backdrop + (255,))
            bg.alpha_composite(frame)
            frame = bg
        frame.convert("RGB").save(out_dir / f"frame_{i:02d}.jpg", "JPEG", quality=JPEG_QUALITY)

    manifest = {
        "sku": args.sku,
        "frameCount": len(processed),
        "width": size[0],
        "height": size[1],
        "backgroundRemoved": not args.keep_bg,
        "garment": kind,
        "frames": [f"frame_{i:02d}.jpg" for i in range(len(processed))],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2))

    print(f"\nDone. {len(processed)} frames in {out_dir}/")
    print("Upload this folder via the admin panel to attach the spin to the product.")


if __name__ == "__main__":
    main()
