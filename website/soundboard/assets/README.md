# Shared visual assets

`castle.png` was generated with the built-in image generation tool using `designs/01-faction-selection.png` as the reference. The final prompt was:

> Create a clean BACKGROUND BITMAP ASSET for the Chivalry Medieval Warfare soundboard website, matching the attached approved design's atmospheric scenery and colors exactly. Remove ALL interface panels, typography, logos, characters, heraldic overlays, cards, borders, buttons and triquetras. Only a moonlit medieval castle courtyard and ramparts: stone wall on left, distant towers right, cool dark blue cloudy sky with moon upper right, restrained warm torches on both far sides, cobblestone ground. Center is very dim unobtrusive navy/charcoal negative space where real HTML controls will be overlaid. Texture is realistic Chivalry 1 game-engine environment art, not extravagant fantasy. Landscape 1920x1080, seamless-feeling vignette around edges, NO text, NO UI, NO foreground people. The source is a style reference, output only environmental background.

`ringbearer.ttf` is copied from the installed game's `Development/Src/AOC/Flash/FLA/RINGM__1.ttf`. The other SVG assets are small shared interface ornaments. The character cutouts (`agatha-*.png`, `masons-*.png`) and `faction-emblems.png` are dedicated transparent production assets generated from the approved desktop designs. Portraits are displayed whole, with `object-fit: contain`; the two emblems share a transparent sheet. Every asset is reused on desktop and mobile. Full prompts are recorded in `artwork-prompts.md`.


## Optimized delivery files

`optimized/` contains WebP encodings of these source PNGs. Generate them with `python3 scripts/optimize_soundboard_assets.py` (Pillow with WebP support). Portraits have 384px, 640px, and 1024px widths; the backdrop has 960px and 1672px widths; the emblem sheet keeps its original dimensions. The website uses these encodings, while the source PNGs remain available for future asset work. No artwork was regenerated for this optimization.
