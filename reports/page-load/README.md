# Initial page download simulation

Measured on 5 November 2026 from the current local `website/` files.

**These are simulated resource payloads, not a real browser network capture.** Chromium could not start because the execution sandbox denies sockets. The project's existing DOM test harness executed the actual page JavaScript. A resource inventory then counted the files referenced by the resulting DOM and the active CSS; responsive image and media-query choices were resolved manually.

Each scenario is a separate cold visit with no cached assets. Desktop: 1440 CSS pixels wide, DPR 1, fine pointer. Mobile: 412 CSS pixels wide, DPR 2, coarse pointer. Browser source selection can vary with device and connection.

| Page | Device | Resource requests | No compression | Gzip estimate | Brotli estimate |
|---|---|---:|---:|---:|---:|
| `index.html` | Desktop | 14 | 894.6 kB | 583.2 kB | 578.2 kB |
| `message.html` | Desktop | 11 | 620.5 kB | 353.5 kB | 349.3 kB |
| `index.html` | Mobile | 14 | 848.5 kB | 537.1 kB | 532.1 kB |
| `message.html` | Mobile | 11 | 672.9 kB | 406.0 kB | 401.8 kB |

kB means 1,000 bytes. Compression estimates apply gzip level 6 or Brotli quality 5 to HTML, CSS, JavaScript and SVG. Fonts, WebP and MP3 are counted at their existing file sizes. A server that also compresses the TTF can transfer less. HTTP headers, TLS/network overhead, favicon probes, speculative loads and cache revalidation are excluded. No server configuration was inspected.

The message uses Agatha Knight, nickname **Firzen**, text **See you on the battlefield!**, and `thank_you_brother_01.mp3`. Its exact link is in [the detailed JSON report](measurement.json). The rendered title and two faction cards were verified by the DOM simulation.

Neither page requests audio during the simulated initial load. Revealing the test message triggered playback of the selected recording, whose complete file is **8,198 bytes** (8.2 kB). The transfer timing and range-request behaviour were not measured.

The largest homepage asset is `faction-emblems.webp` at **343,628 bytes**. Both pages load `catalog.js` (260,111 bytes before compression, about 19.4 kB with gzip) and `ringbearer.ttf` (110,460 bytes). The desktop message portrait is 100,404 bytes; the selected DPR-2 mobile portrait is 198,974 bytes. Open Graph preview images are metadata and are not included in normal page rendering.

See [measurement.json](measurement.json) for every resource and exact byte counts. Production files were not changed.
