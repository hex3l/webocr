/* Tesseract.js wrapper.
 *
 * The Tesseract global is provided by dist/tesseract.min.js loaded in index.html.
 * In v5, `createWorker(langs, oem, options)` loads language data and initializes
 * the recognizer in one call (loadLanguage/initialize are no-ops). Worker, core,
 * and language data are fetched on demand from the CDN and cached by the browser.
 * Tesseract.js automatically selects the SIMD-enabled core build where available.
 */
const OCR = (function () {
  let worker = null;
  let workerLang = null;

  async function ensureWorker(lang, onProgress) {
    if (worker && workerLang === lang) return worker;
    if (worker) {
      try {
        await worker.terminate();
      } catch (_) {}
      worker = null;
      workerLang = null;
    }
    worker = await Tesseract.createWorker(lang, 1, {
      logger: (m) => onProgress && onProgress(m),
    });
    workerLang = lang;
    return worker;
  }

  async function recognize(image, lang, onProgress) {
    const w = await ensureWorker(lang, onProgress);
    const { data } = await w.recognize(image);
    return data.text;
  }

  async function terminate() {
    if (worker) {
      try {
        await worker.terminate();
      } catch (_) {}
    }
    worker = null;
    workerLang = null;
  }

  return { recognize, terminate };
})();

if (typeof window !== "undefined") {
  window.OCR = OCR;
}