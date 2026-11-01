# Chivalry voice soundboard

Open **../soundboard.html** directly in a browser, or serve the project root with any static server. Desktop and mobile use the same page and assets. The original `index.html` remains the full collection browser.

## Interaction

Choose Agatha or Masons, then Archer, Man-at-Arms, Vanguard, or Knight. The URL records the selection, so links can be bookmarked and browser Back/Forward work.

The voice page has both ten-command menus and a separate Battle cry. Every click starts an independent recording, so different commands and repeated copies of one command can overlap. By default, random playback avoids the immediately previous take when alternatives exist.

Playback feedback lives beside each command: its version number and a small animated equalizer appear while playing. Random-version feedback disappears when the recording ends. Multiple copies show a playing count and the active version numbers; the count updates as each finishes. Loading recordings have a text-only indicator. Reduced-motion users get static equalizer bars. There is no separate player dashboard.

The compact floating sound-control bar sits at the bottom of the screen and provides master volume, mute, and **Stop all**, including on mobile. The page reserves space below the content and respects mobile safe areas. Volume changes affect all current voices and future clicks, and are remembered when browser storage is available. Use **Stop all** to silence the active recordings. Navigation or leaving the page releases all playing and pending media. A failed recording cleans up without stopping other voices.

Choosing a specific recording in the three-dot menu saves it in local storage for that faction, class, and command (including Battle cry). A gold “Version 3” label stays beside the command name, even after playback ends. Subsequent clicks start that chosen take again, and the selection survives reloads. Choose “Random version” to clear the saved choice and restore random playback; recordings already playing continue until they finish or are stopped. Saved choices use recording paths so catalog reordering cannot silently change the chosen take. Unavailable saved recordings fall back to random playback. If browser storage is disabled, selections still work for the current session.

The version picker stays open while auditioning recordings. Each numbered option has a reserved indicator slot before its name. Only the equalizer animation appears there during playback, including recordings started through Random version. There is no visible Playing text or separate active-recordings section, so auditioning does not change the dialog height. Playback counts and loading states remain available to screen readers. The saved favorite remains marked separately from playback activity. Close the picker with its close button, by clicking the shaded area outside it, or with Escape; closing it does not stop recordings. The floating dashboard remains undimmed and usable, and dashboard clicks do not dismiss the picker. On desktop the picker is centered above the dashboard area; on mobile it floats above the dashboard with its height and safe area reserved. The page behind is inert, while keyboard focus can cycle between the picker and sound controls. Keyboard users can start voices, select recordings, use Stop all through the regular buttons.

The playable recordings follow the 168 verified assignments in the game's class definitions. Extra, unused, and barbarian takes remain available through **Full collection**, rather than being mixed into the original voice command sets.

## Files and shared artwork

- `app.js`: rendering, hash navigation, saved preferences, and inline playback feedback.
- `playback.js`: independent media instances, shared volume, lifecycle cleanup, and per-instance/all-instance stopping.
- `style.css`: responsive layout, materials, and typography.
- `catalog.js`: generated, compact command/recording data; no fetch or server required.
- `assets/castle.png`: clean backdrop, generated with the built-in image tool from the approved faction-design reference. Prompt: “Remove all interface panels, typography, logos, characters, heraldic overlays, cards, borders, buttons and triquetras; only a moonlit medieval castle courtyard and ramparts matching the approved design, dim navy center space for HTML controls.”
- `assets/ringbearer.ttf`: the installed game's Ringbearer display font.
- `assets/frame.svg`, `assets/knot.svg`: small shared interface ornaments.

Character portraits use dedicated transparent PNG cutouts in `assets/`, each containing the entire character with clear padding. CSS `object-fit: contain` fits them into both desktop and mobile panels without clipping. The same portrait file is reused in class selection and the selected-character panel. The two faction emblems share a transparent two-cell sheet. None of these production assets contain screenshot backgrounds, text or buttons, so the panel colors remain consistent. The logo is one HTML wordmark using the shared local font, rendered consistently on every screen.

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

The only npm dependency is a development-only DOM implementation. The website itself has no framework, third-party scripts, CDN requests, or installation step. The tests check the actual DOM, menu coverage, audio paths, random selection, exact-version playback, navigation cleanup, picker focus, overlapping instances, inline status cleanup, global sound controls, loading/error recovery, late media events, persistent auditioning, per-version feedback and stable dialog structure, dashboard access with the picker open, keyboard focus across picker and dashboard, preference persistence across reloads, character isolation, restoring random playback, and unavailable or malformed storage. They simulate media events; real browser rendering and media-device playback require browser QA.
