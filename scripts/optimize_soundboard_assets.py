#!/usr/bin/env python3
"""Build smaller WebP delivery assets without changing the original PNG artwork.

Requires Pillow with WebP support. Run from any directory; outputs are local.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'website/soundboard/assets'
OUTPUT = ASSETS / 'optimized'
PORTRAIT_WIDTHS = (384, 640, 1024)


def encode(source, target, width, quality=86):
    with Image.open(source) as image:
        image.load()
        if image.width > width:
            height = round(image.height * width / image.width)
            image = image.resize((width, height), Image.Resampling.LANCZOS)
        image.save(target, 'WEBP', quality=quality, method=6)
    return target.stat().st_size


def main():
    OUTPUT.mkdir(exist_ok=True)
    total = 0
    for faction in ('agatha', 'masons'):
        for cls in ('archer', 'man_at_arms', 'vanguard', 'knight'):
            stem = f'{faction}-{cls}'
            for width in PORTRAIT_WIDTHS:
                total += encode(ASSETS / f'{stem}.png', OUTPUT / f'{stem}-{width}.webp', width)
    total += encode(ASSETS / 'faction-emblems.png', OUTPUT / 'faction-emblems.webp', 1774)
    for width in (960, 1672):
        total += encode(ASSETS / 'castle.png', OUTPUT / f'castle-{width}.webp', width, quality=82)
    print(f'Built 27 WebP delivery assets ({total:,} bytes across all sizes).')


if __name__ == '__main__':
    main()
