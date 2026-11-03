# Chivalry showcase

[Watch the GIF](chivalry-showcase.gif) · [View the storyboard](chivalry-showcase-storyboard.jpg)

A silent, 16.4-second looping promotional animation at 960 × 540, 20 fps,
approximately 4.8 MiB. It reuses the deployed site's artwork, colours and title
font. The UI is condensed for the animation; this is a motion graphic, not a
browser recording. Equalizer motion illustrates playback; GIF has no sound.

Sequence:

- Choose Agatha or Masons.
- See all four classes in both factions.
- Play overlapping taunts, laughter and a running battle cry.
- Reveal a personalized message with its attached voice.
- Finish on the existing Chivalry artwork and `chivalry.firzen.net`.

Rebuild from the project root with `python3 scripts/build_showcase_gif.py`.
Requires Python with Pillow, ffmpeg with palettegen/paletteuse support, and
DejaVu Sans/Serif fonts at the Linux paths specified in the script. Intermediate
frames are temporary and removed after encoding. No production files change.
