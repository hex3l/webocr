/* UI wiring: upload, OCR execution, history rendering. */
(function () {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    dropZone: $("#dropZone"),
    fileInput: $("#fileInput"),
    previewWrap: $("#previewWrap"),
    preview: $("#preview"),
    changeImage: $("#changeImage"),
    langSelect: $("#langSelect"),
    runBtn: $("#runBtn"),
    copyBtn: $("#copyBtn"),
    progress: $("#progress"),
    progressFill: $("#progressFill"),
    progressText: $("#progressText"),
    resultWrap: $("#resultWrap"),
    resultText: $("#resultText"),
    historyList: $("#historyList"),
    clearHistory: $("#clearHistory"),
    updateBanner: $("#updateBanner"),
    reloadBtn: $("#reloadBtn"),
    dismissBtn: $("#dismissBtn"),
    themeToggle: $("#themeToggle"),
    iconSun: document.querySelector(".theme-icon-sun"),
    iconMoon: document.querySelector(".theme-icon-moon"),
    starCount: $("#starCount"),
  };

  const state = {
    file: null,
    imageBlob: null,
    thumbBlob: null,
    activeSessionId: null,
    busy: false,
  };

  const STATUS_LABELS = {
    loading_tesseract_core: "Loading OCR engine…",
    initializing_tesseract: "Initializing…",
    loading_language_traineddata: "Downloading language data…",
    initializing_api: "Preparing recognizer…",
    recognizing_text: "Recognizing text…",
  };

  function init() {
    populateLanguages();
    bindEvents();
    renderHistory();
    initTheme();
    registerServiceWorker();
    fetchStarCount();
  }

  function fetchStarCount() {
    const KEY = "webocr-stars";
    const ONE_HOUR = 60 * 60 * 1000;
    const cache = readStarCache();
    if (cache && Date.now() - cache.ts < ONE_HOUR) {
      els.starCount.textContent = String(cache.count);
      return;
    }
    if (cache) els.starCount.textContent = String(cache.count);
    fetch("https://api.github.com/repos/hex3l/webocr")
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data) => {
        if (typeof data.stargazers_count === "number") {
          els.starCount.textContent = String(data.stargazers_count);
          writeStarCache(data.stargazers_count);
        }
      })
      .catch(() => {
        if (!cache) els.starCount.textContent = "";
      });
  }

  function readStarCache() {
    try {
      const raw = localStorage.getItem("webocr-stars");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (typeof parsed.count === "number" && typeof parsed.ts === "number") {
        return parsed;
      }
    } catch (_) {}
    return null;
  }

  function writeStarCache(count) {
    try {
      localStorage.setItem("webocr-stars", JSON.stringify({ count, ts: Date.now() }));
    } catch (_) {}
  }

  function populateLanguages() {
    const codes = Object.keys(LANGUAGES).sort((a, b) =>
      LANGUAGES[a].localeCompare(LANGUAGES[b])
    );
    for (const code of codes) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = LANGUAGES[code];
      if (code === "eng") opt.selected = true;
      els.langSelect.appendChild(opt);
    }
  }

  function bindEvents() {
    els.dropZone.addEventListener("click", () => els.fileInput.click());
    els.dropZone.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        els.fileInput.click();
      }
    });
    els.fileInput.addEventListener("change", (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    ["dragenter", "dragover"].forEach((ev) =>
      els.dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        els.dropZone.classList.add("dragover");
      })
    );
    ["dragleave", "drop"].forEach((ev) =>
      els.dropZone.addEventListener(ev, (e) => {
        e.preventDefault();
        els.dropZone.classList.remove("dragover");
      })
    );
    els.dropZone.addEventListener("drop", (e) => {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    els.changeImage.addEventListener("click", () => {
      resetImage();
    });

    els.runBtn.addEventListener("click", runOcr);
    els.copyBtn.addEventListener("click", copyText);
    els.clearHistory.addEventListener("click", clearHistory);

    document.addEventListener("paste", (e) => {
      if (state.busy) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            return;
          }
        }
      }
    });
  }

  function initTheme() {
    const KEY = "webocr-theme";
    const stored = localStorage.getItem(KEY);
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
    updateToggleIcon();
    els.themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme");
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      const effective = current || (prefersDark ? "dark" : "light");
      const next = effective === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(KEY, next);
      updateToggleIcon();
    });
  }

  function updateToggleIcon() {
    const current = document.documentElement.getAttribute("data-theme");
    const prefersDark = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    const effective = current || (prefersDark ? "dark" : "light");
    const showSun = effective === "dark";
    els.iconSun.classList.toggle("hidden", !showSun);
    els.iconMoon.classList.toggle("hidden", showSun);
    els.themeToggle.setAttribute(
      "aria-label",
      showSun ? "Switch to light theme" : "Switch to dark theme"
    );
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    els.reloadBtn.addEventListener("click", () => location.reload());
    els.dismissBtn.addEventListener("click", () =>
      els.updateBanner.classList.add("hidden")
    );
    navigator.serviceWorker.addEventListener("message", (e) => {
      if (e.data && e.data.type === "UPDATE_AVAILABLE") {
        els.updateBanner.classList.remove("hidden");
      }
    });
    const isLocal =
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1" ||
      location.hostname === "0.0.0.0";
    if (isLocal) {
      navigator.serviceWorker.getRegistrations().then((regs) =>
        regs.forEach((r) => r.unregister())
      );
      return;
    }
    navigator.serviceWorker.register("sw.js").catch((err) =>
      console.warn("Service worker registration failed:", err)
    );
  }

  function handleFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please choose an image file (PNG, JPG, WEBP, or BMP).");
      return;
    }
    state.file = file;
    state.activeSessionId = null;
    const url = URL.createObjectURL(file);
    els.preview.src = url;
    els.preview.onload = () => {
      els.previewWrap.classList.remove("hidden");
      els.dropZone.classList.add("hidden");
      els.runBtn.disabled = false;
      els.resultWrap.classList.add("hidden");
      els.copyBtn.disabled = true;
      els.progress.classList.add("hidden");
    };
  }

  function resetImage() {
    state.file = null;
    state.imageBlob = null;
    state.thumbBlob = null;
    state.activeSessionId = null;
    els.preview.src = "";
    els.previewWrap.classList.add("hidden");
    els.dropZone.classList.remove("hidden");
    els.runBtn.disabled = true;
    els.copyBtn.disabled = true;
    els.resultWrap.classList.add("hidden");
    els.progress.classList.add("hidden");
    els.fileInput.value = "";
  }

  function setBusy(busy) {
    state.busy = busy;
    els.runBtn.disabled = busy;
    els.runBtn.textContent = busy ? "Working…" : "Extract text";
    els.fileInput.disabled = busy;
  }

  function setProgress(p) {
    els.progress.classList.remove("hidden");
    const pct = Math.round((p.progress || 0) * 100);
    els.progressFill.style.width = pct + "%";
    const label = STATUS_LABELS[p.status] || p.status || "Working…";
    els.progressText.textContent = `${label} ${pct}%`;
  }

  async function runOcr() {
    if (!state.file || state.busy) return;
    const lang = els.langSelect.value;
    setBusy(true);
    els.progress.classList.remove("hidden");
    els.progressFill.style.width = "0%";
    els.progressText.textContent = "Starting…";
    try {
      const text = await OCR.recognize(state.file, lang, setProgress);
      els.resultText.value = text;
      els.resultWrap.classList.remove("hidden");
      els.copyBtn.disabled = !text;
      await saveSession(text, lang);
    } catch (err) {
      console.error(err);
      alert("OCR failed: " + (err && err.message ? err.message : err));
    } finally {
      setBusy(false);
      els.progress.classList.add("hidden");
    }
  }

  async function saveSession(text, lang) {
    const imageBlob = await toBlob(els.preview);
    const thumbBlob = await makeThumbnail(els.preview, 200);
    state.imageBlob = imageBlob;
    state.thumbBlob = thumbBlob;
    const id =
      state.activeSessionId ||
      "s_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const session = {
      id,
      createdAt: Date.now(),
      lang,
      text,
      imageBlob,
      thumbBlob,
    };
    await OCR_DB.add(session);
    state.activeSessionId = id;
    renderHistory();
  }

  function toBlob(imgEl) {
    return new Promise((resolve) => {
      try {
        imgEl.toBlob((b) => resolve(b || new Blob()), "image/png");
      } catch (_) {
        resolve(new Blob());
      }
    });
  }

  function makeThumbnail(imgEl, max) {
    return new Promise((resolve) => {
      try {
        const scale = Math.min(1, max / Math.max(imgEl.naturalWidth, imgEl.naturalHeight));
        const w = Math.max(1, Math.round(imgEl.naturalWidth * scale));
        const h = Math.max(1, Math.round(imgEl.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(imgEl, 0, 0, w, h);
        canvas.toBlob((b) => resolve(b || new Blob()), "image/jpeg", 0.8);
      } catch (_) {
        resolve(new Blob());
      }
    });
  }

  async function copyText() {
    if (!els.resultText.value) return;
    try {
      await navigator.clipboard.writeText(els.resultText.value);
    } catch (_) {
      els.resultText.select();
      document.execCommand("copy");
    }
  }

  async function renderHistory() {
    const items = await OCR_DB.all();
    els.historyList.innerHTML = "";
    els.clearHistory.disabled = items.length === 0;
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "history-empty";
      li.textContent = "No sessions yet — your OCR history will appear here.";
      els.historyList.appendChild(li);
      return;
    }
    clearObjUrlCache();
    for (const s of items) {
      els.historyList.appendChild(renderHistoryItem(s));
    }
  }

  const objUrlCache = new Map();
  function cachedUrl(blob) {
    if (!blob || !blob.size) return null;
    if (objUrlCache.has(blob)) return objUrlCache.get(blob);
    const url = URL.createObjectURL(blob);
    objUrlCache.set(blob, url);
    return url;
  }
  function clearObjUrlCache() {
    for (const url of objUrlCache.values()) {
      if (url) URL.revokeObjectURL(url);
    }
    Map.prototype.clear.call(objUrlCache);
  }

  function renderHistoryItem(s) {
    const li = document.createElement("li");
    li.className = "history-item";
    li.dataset.id = s.id;

    const thumb = document.createElement("img");
    thumb.className = "history-thumb";
    const thumbUrl = cachedUrl(s.thumbBlob);
    if (thumbUrl) {
      thumb.src = thumbUrl;
    } else {
      thumb.classList.add("placeholder");
      thumb.removeAttribute("src");
      thumb.textContent = "—";
    }
    li.appendChild(thumb);

    const meta = document.createElement("div");
    meta.className = "history-meta";
    const time = document.createElement("div");
    time.className = "history-time";
    time.textContent = formatTime(s.createdAt);
    const lang = document.createElement("div");
    lang.className = "history-lang";
    lang.textContent = LANGUAGES[s.lang] || s.lang;
    const preview = document.createElement("div");
    preview.className = "history-preview";
    preview.textContent = (s.text || "").trim().slice(0, 80) || "(empty)";
    meta.appendChild(time);
    meta.appendChild(lang);
    meta.appendChild(preview);
    li.appendChild(meta);

    const del = document.createElement("button");
    del.className = "history-delete";
    del.setAttribute("aria-label", "Delete session");
    del.textContent = "×";
    del.addEventListener("click", async (e) => {
      e.stopPropagation();
      await OCR_DB.remove(s.id);
      renderHistory();
    });
    li.appendChild(del);

    li.addEventListener("click", () => loadSession(s.id));
    return li;
  }

  async function loadSession(id) {
    const session = await OCR_DB.get(id);
    if (!session) return;
    state.activeSessionId = session.id;
    if (session.imageBlob && session.imageBlob.size) {
      const url = URL.createObjectURL(session.imageBlob);
      els.preview.src = url;
      els.previewWrap.classList.remove("hidden");
      els.dropZone.classList.add("hidden");
      els.runBtn.disabled = true;
      state.file = null;
    } else {
      resetImage();
    }
    els.langSelect.value = session.lang;
    els.resultText.value = session.text || "";
    els.resultWrap.classList.remove("hidden");
    els.copyBtn.disabled = !session.text;
    els.progress.classList.add("hidden");
  }

  async function clearHistory() {
    if (!confirm("Delete all saved OCR sessions? This cannot be undone.")) return;
    await OCR_DB.clear();
    renderHistory();
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return "Today " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
      " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  document.addEventListener("DOMContentLoaded", () => {
    const y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());
    init();
  });
})();