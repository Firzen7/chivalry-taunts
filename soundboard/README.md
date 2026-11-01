# Chivalry voice soundboard

Open **../soundboard.html** directly in a browser, or serve the project root with any static server. Desktop and mobile use the same page and assets. The original `index.html` remains the full collection browser.

## Interaction

Choose Agatha or Masons, then Archer, Man-at-Arms, Vanguard, or Knight. The URL records the selection, so links can be bookmarked and browser Back/Forward work.

The voice page has both ten-command menus and a separate Battle cry. A command plays a random recording, avoiding the immediately previous take when alternatives exist. Each three-dot menu opens an accessible version picker with a random option and numbered individual recordings. Desktop uses a dialog; on narrow screens it becomes a bottom sheet. The player supports pause/resume, seeking, mute, volume, and stop. Volume is remembered when browser storage is available. Navigation stops audio and closes the picker. Space toggles playback when the page body has focus; Escape dismisses the picker.

The playable recordings follow the 168 verified assignments in the game's class definitions. Extra, unused, and barbarian takes remain available through **Full collection**, rather than being mixed into the original voice command sets.

## Files and shared artwork

- `app.js`: rendering, hash navigation, version selection, and the shared audio player.
- `style.css`: responsive layout, materials, and typography.
- `catalog.js`: generated, compact command/recording data; no fetch or server required.
- `assets/castle.png`: clean backdrop, generated with the built-in image tool from the approved faction-design reference. Prompt: “Remove all interface panels, typography, logos, characters, heraldic overlays, cards, borders, buttons and triquetras; only a moonlit medieval castle courtyard and ramparts matching the approved design, dim navy center space for HTML controls.”
- `assets/ringbearer.ttf`: the installed game's Ringbearer display font.
- `assets/frame.svg`, `assets/knot.svg`: small shared interface ornaments.

Character portraits are SVG viewports into the two approved desktop bitmap sheets in `../designs/`. Faction emblems reuse a third sheet. Only the art regions are displayed; the design screenshots are not used as clickable page backgrounds. Browsers cache each shared sheet once, and the same art is reused in class selection, the selected-character panel, and both screen sizes. The logo is one HTML wordmark using the shared local font, rendered consistently on every screen.

## Rebuild and checks

Refresh the catalog after extracting or reorganizing audio:

```sh
python3 scripts/build_soundboard.py
```

The builder verifies every recording path, all eight voices, and all 21 commands per voice. It reads `taunts.json` without changing the original collection or its HTML.

Run the interaction tests from the project root with Node 20 or newer:

```sh
npm install
npm test
```

The only npm dependency is a development-only DOM implementation. The website itself has no framework, third-party scripts, CDN requests, or installation step. The tests check the actual DOM, menu coverage, audio paths, random selection, exact-version playback, navigation cleanup, picker focus, player controls, and media-error recovery. They simulate media events; real browser rendering and media-device playback require browser QA.
