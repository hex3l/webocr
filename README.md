# webocr

A simple, fully client-side OCR web app built with [Tesseract.js](https://github.com/naptha/tesseract.js) and hosted on GitHub Pages. All processing happens in your browser — images and recognized text never leave your device.

## Features

- Drag & drop or browse to upload an image (PNG, JPG, WEBP, BMP).
- 80+ Tesseract languages, selectable on demand (data cached after first use).
- Live progress bar during OCR.
- Editable recognized text with copy-to-clipboard.
- Session history stored in IndexedDB (per-browser), with thumbnail + text preview. Click to reload, delete individually, or clear all. Capped at 50 sessions (oldest auto-pruned).
- Responsive, light/dark theme via `prefers-color-scheme`.
- No build step — plain HTML/CSS/JS.

## Local development

Serve the repo root with any static server, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed URL. A real HTTP server is required because Tesseract.js loads a Web Worker and WASM, which browsers block under `file://`.

## Deploy to GitHub Pages

A workflow is included at `.github/workflows/deploy.yml`. To enable:

1. Push the repo to GitHub on the `main` branch.
2. In repo **Settings → Pages**, set **Source** to **GitHub Actions**.
3. On the next push to `main` the workflow publishes the root directory. Your site will be live at `https://<user>.github.io/webocr/`.

No base path configuration is needed — all asset paths in `index.html` are relative.

## How it works

- `index.html` — layout and structure.
- `css/styles.css` — styling and responsive layout.
- `js/languages.js` — the list of available Tesseract languages, sorted alphabetically.
- `js/db.js` — IndexedDB wrapper for saving/listing/deleting OCR sessions (text + image + thumbnail blobs).
- `js/ocr.js` — Tesseract worker wrapper (auto-picks SIMD core where available, caches language data via the browser).
- `js/app.js` — UI wiring: upload handling, progress, result, history rendering, session load/delete.

### Notes

- Language data and the Tesseract WASM core are fetched on first use from jsDelivr / tessdata CDN and then cached by the browser. First run of a new language may take a few seconds to download.
- IndexedDB is per-browser and per-origin: history is private to each device and not synced.