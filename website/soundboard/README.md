# Chivalry voice soundboard

Open **../index.html** directly in a browser, or serve the project root with any static server. Desktop and mobile use the same page and assets. The full collection browser is available at `../full-list.html`.

## Interaction

Choose Agatha or Masons, then Archer, Man-at-Arms, Vanguard, or Knight. The URL records the selection, so links can be bookmarked and browser Back/Forward work.

The voice page has both ten-command menus and a separate Battle cry. Every click starts an independent recording, so different commands and repeated copies of one command can overlap. By default, random playback avoids the immediately previous take when alternatives exist.

Playback feedback lives beside each command: its version number and a small animated equalizer appear while playing. Random-version feedback disappears when the recording ends. Multiple copies show a playing count and the active version numbers; the count updates as each finishes. Loading recordings have a text-only indicator. Reduced-motion users get static equalizer bars. There is no separate player dashboard.

The compact floating sound-control bar sits at the bottom of the screen and provides master volume, mute, and **Stop all**, including on mobile. The page reserves space below the content and respects mobile safe areas. Volume changes affect all current voices and future clicks, and are remembered when browser storage is available. Use **Stop all** to silence the active recordings. Navigation or leaving the page releases all playing and pending media. A failed recording cleans up without stopping other voices.

Choosing a specific recording in the three-dot menu saves it in local storage for that faction, class, and command (including Battle cry). A gold “Version 3” label stays beside the command name, even after playback ends. Subsequent clicks start that chosen take again, and the selection survives reloads. Choose “Random version” to clear the saved choice and restore random playback; the picker replaces existing playback with a single random preview. Saved choices use recording paths so catalog reordering cannot silently change the chosen take. Unavailable saved recordings fall back to random playback. If browser storage is disabled, selections still work for the current session.

The version picker stays open while auditioning recordings. Picker previews play one at a time: selecting any numbered option or Random version stops all current and pending recordings before starting the chosen take. This keeps previews isolated, while the main command buttons continue to allow overlapping playback. Each numbered option has a reserved indicator slot before its name. Only the equalizer animation appears there during playback, including recordings started through Random version. There is no visible Playing text or separate active-recordings section, so auditioning does not change the dialog height. Playback counts and loading states remain available to screen readers. The saved favorite remains marked separately from playback activity. Close the picker with its close button, by clicking the shaded area outside it, or with Escape; closing it does not stop recordings. The floating dashboard remains undimmed and usable, and dashboard clicks do not dismiss the picker. On desktop the picker is centered above the dashboard area; on mobile it floats above the dashboard with its height and safe area reserved. The page behind is inert, while keyboard focus can cycle between the picker and sound controls. Keyboard users can start voices, select recordings, use Stop all through the regular buttons.

The 168 command slots follow the game's class definitions, but their recording lists include every extracted take assigned to that faction/class category: normal, map-specific objective, alternate, barbarian, and legacy recordings. Battle cry includes all clips labeled as battle cries. The original menu recordings remain first so existing version numbers and saved favorites stay stable. Additional category recordings are appended, with identical source audio deduplicated. Unclassified recordings remain available through **Full collection**.

On an HTTP(S) server, the first use of a command checks its catalogued audio URLs before listing variants or choosing a random recording. Only confirmed files appear or play; files absent from the catalog are never offered. Static servers need no directory-listing support: the intersection is obtained using HEAD requests, with a ranged GET fallback when HEAD is unsupported. HTML fallback pages are rejected. Checks run at most six at a time, without downloading full recordings, and results are cached for the page session. Reload after changing deployed audio files. Temporary network/server failures show a retry option rather than being treated as missing files. Version numbers retain their catalog positions even if some files are absent. Missing favorites fall back to available random recordings without erasing the saved file identity. Closing the picker, stopping all, or navigating away prevents delayed checks from reopening the picker or starting canceled playback. Direct file:// use checks each recording silently with an audio element loading metadata, because browsers block local fetch requests. Successful metadata loads confirm availability; missing or unreadable files are excluded. Each probe is released immediately and never played. These local checks share the same concurrency limit and session cache as HTTP checks.

## Files and shared artwork

- `app.js`: rendering, hash navigation, saved preferences, and inline playback feedback.
- `playback.js`: independent media instances, shared volume, lifecycle cleanup, and per-instance/all-instance stopping.
- `availability.js`: bounded, session-cached HTTP checks for catalogued recordings.
- `style.css`: responsive layout, materials, and typography.
- `catalog.js`: generated, compact command/recording data; no fetch or server required.
- `assets/castle.png`: clean backdrop, generated with the built-in image tool from the approved faction-design reference. Prompt: “Remove all interface panels, typography, logos, characters, heraldic overlays, cards, borders, buttons and triquetras; only a moonlit medieval castle courtyard and ramparts matching the approved design, dim navy center space for HTML controls.”
- `assets/ringbearer.ttf`: the installed game's Ringbearer display font.
- `assets/frame.svg`, `assets/knot.svg`: small shared interface ornaments.

Character portraits use responsive transparent WebP files in `assets/optimized/`, generated from the original PNG cutouts in `assets/`. Each contains the entire character with clear padding. The browser selects a 384px, 640px, or 1024px image based on the displayed size and pixel density; the compact identity panel requests smaller images than the class cards. CSS `object-fit: contain` fits them into both desktop and mobile panels without clipping. The same portrait file is reused in class selection and the selected-character panel. The two faction emblems share a compressed transparent two-cell WebP sheet with unchanged coordinates. None of these production assets contain screenshot backgrounds, text or buttons, so the panel colors remain consistent. The logo is one HTML wordmark using the shared local font, rendered consistently on every screen.

## Rebuild and checks

Refresh the catalog after extracting or reorganizing audio:

```sh
python3 scripts/build_soundboard.py
```

The builder defaults to the project’s `website/` directory (`--root` can select another site root). It verifies every recording path, all eight voices, and all 21 commands per voice. Interaction tests independently compare the resulting catalog against every categorized recording in `taunts.json`, including all 91 Agatha Knight objective versions. It reads `taunts.json` without changing the original collection or its HTML.

Run the interaction tests from the project root with Node 20 or newer:

```sh
npm install
npm test
```

The only npm dependency is a development-only DOM implementation. The website itself has no framework, third-party scripts, CDN requests, or installation step. The tests check the actual DOM, menu coverage, audio paths, random selection, exact-version playback, navigation cleanup, picker focus, overlapping instances, inline status cleanup, global sound controls, loading/error recovery, late media events, persistent auditioning, per-version feedback and stable dialog structure, dashboard access with the picker open, keyboard focus across picker and dashboard, preference persistence across reloads, character isolation, restoring random playback, and unavailable or malformed storage. They simulate media events; real browser rendering and media-device playback require browser QA.

## Mobile rendering performance

The scenery is painted in one fixed compositing candidate layer, using `100lvh` so the background size does not continually change as mobile browser chrome collapses. The body no longer uses `background-attachment: fixed`. The large blurred vignette shadow is replaced with a gradient. The floating sound bar is opaque and has no backdrop blur. Touch layouts simplify blurred card/button shadows and omit full-screen picker blur while retaining its dark shade. Hover shadow transitions are disabled on touch layouts.

The toolbar's height is observed directly with `ResizeObserver`. Viewport-height changes no longer run a window resize layout read on browsers that support it, and unchanged toolbar heights do not rewrite the clearance CSS variable. There are no scroll event handlers.

Artwork delivery files are built with Pillow (with WebP support):

```sh
python3 scripts/optimize_soundboard_assets.py
```

The script leaves source PNGs intact. All 27 delivery files, including all portrait sizes, total 3,312,792 bytes versus 19,158,175 bytes for the source PNGs. As an example, the four Agatha class portraits at 640px total 432,184 bytes versus 7,999,004 bytes for their original PNGs. These are file-size measurements, not measured network traffic or frame-rate improvements. Smaller portrait variants also decode to fewer pixels. Their alpha channels are preserved exactly relative to the resized originals.

Deploy the complete contents of the project’s `website/` directory. The public pages, soundboard, optimized assets, and `audio/` recordings are all self-contained there. The HTML uses a new CSS/JS query version to avoid reusing stale cached files. No new runtime dependencies are required.

Phone frame rates still need an on-device check. These changes target likely paint/compositing and image-memory costs identified in the code; a Motorola G72 trace was not available. For further diagnosis, Chrome's [rendering performance tools](https://developer.chrome.com/docs/devtools/rendering/performance) can highlight repaint regions. Browser guidance also covers [responsive background images](https://web.dev/articles/optimize-css-background-images-with-media-queries).

## Shared-link preview

The static `<head>` in `index.html` contains Open Graph metadata and a large-image sharing card, pointing to `https://tmp.firzen.net/soundboard/assets/link-preview.png`. Deploy `index.html` together with `soundboard/assets/link-preview.png`. The image dimensions, PNG media type, and descriptive alternative text are included so crawlers can read them without running JavaScript.

The configured site address is `https://tmp.firzen.net/`. When moving to a different host, update the canonical URL, `og:url`, `og:image`, and `twitter:image` URLs in `index.html` to the new public HTTPS address. The Open Graph fields follow the [Open Graph protocol](https://ogp.me/).

## Folder layout

This folder lives under `website/soundboard/`. Audio paths in the catalog and collection metadata are relative to `website/`, under `audio/agatha/` and `audio/masons/`. The extractor, catalog builder, and artwork optimizer all target `website/` by default. Public metadata and extraction notes are `website/taunts.json` and `website/README.md`. Existing saved choices using the former faction paths are migrated automatically to their corresponding `audio/` paths.
