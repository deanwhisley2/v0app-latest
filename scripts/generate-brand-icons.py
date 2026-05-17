#!/usr/bin/env python3
"""Regenerate Nexus Pro favicons / PWA icons from public/logo.jpg. Bump SITE_BRAND.assetVersion after."""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "logo.jpg"
BRAND_DIR = ROOT / "public" / "brand" / "icons"
APP_DIR = ROOT / "app"


def center_square(img: Image.Image) -> Image.Image:
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return img.crop((left, top, left + side, top + side))


def save_square(img: Image.Image, size: int, path: Path, radius_pct: float = 0.0) -> None:
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    if radius_pct > 0:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size, size), radius=int(size * radius_pct), fill=255)
        out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        out.paste(resized, (0, 0), mask)
        resized = out
    path.parent.mkdir(parents=True, exist_ok=True)
    resized.save(path, optimize=True)


def main() -> None:
    square = center_square(Image.open(SRC).convert("RGBA"))
    specs = [
        ("icon-32.png", 32, 0.08),
        ("icon-64.png", 64, 0.1),
        ("icon-192.png", 192, 0.12),
        ("icon-512.png", 512, 0.18),
        ("apple-touch-icon.png", 180, 0.18),
    ]
    for name, sz, r in specs:
        save_square(square, sz, BRAND_DIR / name, r)

    save_square(square, 32, ROOT / "public" / "favicon.png", 0.08)
    save_square(square, 180, ROOT / "public" / "apple-touch-icon.png", 0.18)
    save_square(square, 32, APP_DIR / "icon.png", 0.08)
    save_square(square, 180, APP_DIR / "apple-icon.png", 0.18)

    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    ico_images = [square.resize(s, Image.Resampling.LANCZOS) for s in ico_sizes]
    for path in (APP_DIR / "favicon.ico", ROOT / "public" / "favicon.ico"):
        ico_images[0].save(
            path,
            format="ICO",
            sizes=[(i.width, i.height) for i in ico_images],
            append_images=ico_images[1:],
        )

    # Maskable PWA
    size = 512
    canvas = Image.new("RGBA", (size, size), (7, 10, 18, 255))
    inner = int(size * 0.62)
    logo = square.resize((inner, inner), Image.Resampling.LANCZOS)
    mask = Image.new("L", (inner, inner), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, inner, inner), radius=int(inner * 0.18), fill=255)
    layer = Image.new("RGBA", (inner, inner), (0, 0, 0, 0))
    layer.paste(logo, (0, 0), mask)
    canvas.paste(layer, ((size - inner) // 2, (size - inner) // 2), layer)
    canvas.save(BRAND_DIR / "icon-512-maskable.png", optimize=True)

    # OG
    og_w, og_h = 1200, 630
    og = Image.new("RGBA", (og_w, og_h), (7, 10, 18, 255))
    logo_og = square.resize((280, 280), Image.Resampling.LANCZOS)
    mask = Image.new("L", (280, 280), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, 280, 280), radius=48, fill=255)
    logo_layer = Image.new("RGBA", (280, 280), (0, 0, 0, 0))
    logo_layer.paste(logo_og, (0, 0), mask)
    og.paste(logo_layer, ((og_w - 280) // 2, (og_h - 280) // 2 - 20), logo_layer)
    og.save(BRAND_DIR / "og-image.png", optimize=True)
    og.save(ROOT / "public" / "brand" / "og-image.png", optimize=True)

    print("Brand icons generated. Bump lib/site-branding.ts assetVersion and manifest version.")


if __name__ == "__main__":
    main()
