#!/usr/bin/env python3
"""Generate Morandi squircle + 12-seat app icons (PNG) for 家庭分享計時 (family-timer).

Usage:  python3 scripts/make-icons.py
Requires Pillow. Output goes to ./icons/.
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS_DIR = os.path.join(ROOT, "icons")

BG = (243, 240, 233)      # #F3F0E9
PLATE = (255, 255, 255)
SAGE = (94, 127, 105)     # #5E7F69
INK = (38, 36, 31)        # #26241F
MUTED = (143, 138, 127)   # #8F8A7F
SS = 4


def draw_family_icon(size, scale=0.56, rounded=False):
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.24), fill=BG)
    else:
        d.rectangle([0, 0, s, s], fill=BG)

    cx, cy = s / 2, s / 2
    box = s * scale
    x0, y0 = cx - box / 2, cy - box / 2
    x1, y1 = cx + box / 2, cy + box / 2
    rad = int(box * 0.26)
    d.rounded_rectangle([x0, y0, x1, y1], radius=rad, fill=PLATE, outline=SAGE, width=max(4, int(s * 0.038)))

    dot_r = max(3, int(s * 0.024))
    off = s * 0.085
    positions = []
    for t in (-0.26, 0.0, 0.26):
        positions.append((cx + box * t, y0 - off, True))
        positions.append((x1 + off, cy + box * t, t < 0))
        positions.append((cx - box * t, y1 + off, False))
        positions.append((x0 - off, cy - box * t, False))

    for px, py, filled in positions:
        if filled:
            d.ellipse([px - dot_r, py - dot_r, px + dot_r, py + dot_r], fill=SAGE)
        else:
            d.ellipse([px - dot_r, py - dot_r, px + dot_r, py + dot_r], outline=MUTED, width=max(2, int(s * 0.012)))

    hw = max(3, int(s * 0.032))
    d.line([cx, cy, cx, cy - box * 0.23], fill=INK, width=hw)
    d.line([cx, cy, cx + box * 0.17, cy + box * 0.09], fill=SAGE, width=hw)
    cr = max(3, int(s * 0.026))
    d.ellipse([cx - cr, cy - cr, cx + cr, cy + cr], fill=INK)
    return img.resize((size, size), Image.LANCZOS)


def save_icon(img, name, flatten=True):
    p = os.path.join(ICONS_DIR, name)
    if flatten:
        bg = Image.new("RGB", img.size, BG)
        bg.paste(img, mask=img.split()[3])
        img = bg
    img.save(p, optimize=True)
    print("wrote", os.path.relpath(p, ROOT))


def main():
    os.makedirs(ICONS_DIR, exist_ok=True)
    save_icon(draw_family_icon(180, 0.56), "icon-180.png")
    save_icon(draw_family_icon(192, 0.56), "icon-192.png")
    save_icon(draw_family_icon(512, 0.56), "icon-512.png")
    save_icon(draw_family_icon(512, 0.46), "icon-maskable-512.png")
    save_icon(draw_family_icon(32, 0.64, rounded=True), "favicon-32.png", flatten=False)


if __name__ == "__main__":
    main()
