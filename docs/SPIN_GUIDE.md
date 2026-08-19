# Thrift by Eugy — 360° Spin Guide

## Why frames, not GIF or video

A spin is a sequence of still photos swapped as the shopper drags. This beats
both alternatives:

- **vs GIF** — GIF caps at 256 colors, so fabric bands and posterizes badly.
  It's also *larger* than a frame sequence for the same content.
- **vs video** — video can't be dragged frame-accurately, can't be paused on a
  specific angle, and autoplay is restricted on mobile.

Frames also flow through your existing image pipeline, so each one is served as
AVIF/WebP at the right size for the device.

## Shooting a spin

You already have the hard part: a fixed mannequin, consistent lighting, and a
clean setup.

**Setup**
1. Mark the floor where the mannequin stand sits. It must not move.
2. Mark the floor where you stand. The camera must not move either.
3. Put a piece of tape on the mannequin base as a rotation reference.
4. Lock your phone's exposure and focus (tap and hold on iPhone → AE/AF Lock).
   Auto-exposure between shots causes visible brightness flicker mid-spin.

**Shooting**
- **24 frames** = every 15° — good, slightly steppy
- **36 frames** = every 10° — smooth, recommended
- **48 frames** = every 7.5° — very smooth, diminishing returns

Rotate the mannequin by one interval, shoot, repeat. Don't move the camera.

**Time:** about 3–4 minutes per item at 36 frames once you're in a rhythm.

**Worth it for:** higher-value pieces, dresses, anything with interesting back
detail. Not worth it for basic tees. Most stores spin maybe 10–20% of catalog.

## Processing the shoot

Put the photos in `spin_raw/{SKU}/` then:

```
python3 prep_spin.py TBE-0001
```

Keep your styled background instead:
```
python3 prep_spin.py TBE-0001 --keep-bg
```

**The important thing this does:** it computes ONE crop box across all frames
and applies it to every one. Cropping each frame to its own bounding box makes
the garment jitter and pulse as it rotates — the single most common way
homemade spins look broken. It also judges garment brightness across the whole
sequence, so the backdrop never flips mid-spin.

Output goes to `spin_out/{SKU}/` with a `manifest.json`, ready to upload.

## Using the viewer

```jsx
<SpinViewer frames={frameUrls} />
```

Props:
| Prop | Default | Notes |
|---|---|---|
| `frames` | `[]` | Array of image URLs, in rotation order |
| `autoSpin` | `true` | Idle rotation; stops permanently once the shopper drags |
| `autoSpinSpeed` | `110` | ms per frame |
| `sensitivity` | `1` | Higher = less drag for a full turn |

Built in: drag (mouse + touch), arrow-key control, scrub bar, full preload with
progress, ARIA slider role, and a graceful empty state for items without a spin.

## Performance

A 36-frame spin at ~86KB per master frame is around 3MB — but shoppers never
download masters. Served through the image pipeline at card size in AVIF, a
full spin runs roughly 250–400KB total, comparable to two or three unoptimized
product photos.

Frames preload fully before the drag hint appears, because a spin that stutters
mid-drag reads as broken. Only load the spin on the product detail page — never
in the grid.
