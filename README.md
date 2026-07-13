# webocr

A simple, private OCR web app built with [Tesseract.js](https://github.com/naptha/tesseract.js) and hosted on GitHub Pages. All processing happens in your browser — images and recognized text never leave your device.

**Available at:** https://hex3l.github.io/webocr/

## Features

- Drag & drop, browse, or paste from clipboard to upload an image (PNG, JPG, WEBP, BMP).
- 80+ Tesseract languages, selectable on demand (data cached after first use).
- Live progress bar during OCR.
- Editable recognized text with copy-to-clipboard.
- Session history stored in your browser, with thumbnail + text preview. Click to reload, delete individually, or clear all. Capped at 50 sessions (oldest auto-pruned).
- Light/dark theme with a manual toggle (remembers your choice; follows your system preference by default).
- Automatic reload banner when a newer version of the app is available.
- Responsive, no build step — plain HTML/CSS/JS.

## Local development

Serve the repo root with any static server, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL. A real HTTP server is required because Tesseract.js loads a Web Worker and WASM, which browsers block under `file://`.

The service worker is **disabled on `localhost` / `127.0.0.1` / `0.0.0.0`** during development so edits always hit the network. Any previously registered SW is auto-unregistered on those origins. If a stale SW is stuck from an earlier visit, unregister it once via DevTools → Application → Service Workers, or run in the console:

```js
navigator.serviceWorker.getRegistrations().then(r => r.forEach(s => s.unregister()))
```

then reload.

## How it works

- `index.html` — layout and structure.
- `css/styles.css` — styling and responsive layout.
- `js/languages.js` — the list of available Tesseract languages, sorted alphabetically.
- `js/db.js` — IndexedDB wrapper for saving/listing/deleting OCR sessions (text + image + thumbnail blobs).
- `js/ocr.js` — Tesseract v7 worker wrapper (`createWorker(lang, 1, {logger})`). Worker, core, and language data are fetched on demand from the jsDelivr CDN and cached by the browser; the SIMD-enabled core is auto-selected where supported.
- `js/app.js` — UI wiring: upload/drag-drop/paste, progress, copy, result, theme toggle, history rendering, session load/delete, service worker registration (skipped on localhost).
- `sw.js` — service worker for the app shell (stale-while-revalidate). On same-origin fetches it compares the network response byte-for-byte with the cached copy and, on a mismatch, updates the cache and notifies all clients to show a reload banner. Cross-origin requests (Tesseract CDN, language data) bypass the SW.

### Notes

- Language data and the Tesseract WASM core are fetched on first use from jsDelivr / tessdata CDN and then cached by the browser. First run of a new language may take a few seconds to download.
- IndexedDB is per-browser and per-origin: history is private to each device and not synced.