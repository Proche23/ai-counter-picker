"use strict";
/* Region themes: Hextech (the default) and the regions of Runeterra. Each one recolors the whole site
   (frames, glows, backgrounds; the Blue and Red team colors never change) and puts that region's champion
   art behind everything, dimmed. Loaded in <head> on every page, so the saved theme is on before the page
   is drawn. The choice is shared by the board, the draft tracker window and your phone (/api/prefs). */
(() => {
  const SPLASH = (id) => `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${id}_0.jpg`;
  const THEMES = [
    { id: "hextech", name: "Hextech", tag: "Crystal power and gold · the default", art: "Jayce", pos: "center 18%",
      c: { accent: "#c8aa6e", accentHi: "#f0e6d2", accentDk: "#785a28", energy: "#0ac8b9", energyHi: "#cdfafa", energyDk: "#005a82",
           bg0: "#010a13", tone: "#1b2a3f", text: "#cdbe91", white: "#f0e6d2", glow1: "#12305a", glow2: "#04223a" } },
    { id: "piltover", name: "Piltover", tag: "City of Progress · brass and blue sky", art: "Caitlyn", pos: "center 25%",
      c: { accent: "#e2b25a", accentHi: "#fff0d4", accentDk: "#8a5a1e", energy: "#47c2ff", energyHi: "#d6f3ff", energyDk: "#13578a",
           bg0: "#0d0a07", tone: "#3a2a16", text: "#e2cfa3", white: "#fff3dc", glow1: "#4a3014", glow2: "#0e2a40" } },
    { id: "zaun", name: "Zaun", tag: "The undercity · chemtech glow", art: "Ekko", pos: "center 30%",
      c: { accent: "#8fd14f", accentHi: "#e8ffd2", accentDk: "#3f6a1f", energy: "#ff4fbf", energyHi: "#ffd8f1", energyDk: "#7d1a5c",
           bg0: "#050a06", tone: "#1c3220", text: "#bcd6a2", white: "#eaffdc", glow1: "#1d4313", glow2: "#3a0d2d" } },
    { id: "noxus", name: "Noxus", tag: "Strength above all · crimson steel", art: "Swain", pos: "center 20%",
      c: { accent: "#c9493c", accentHi: "#ffdcd2", accentDk: "#6a1913", energy: "#f0a040", energyHi: "#ffe8c6", energyDk: "#7a3a0c",
           bg0: "#0b0506", tone: "#2e1214", text: "#dcbcb0", white: "#ffe9e2", glow1: "#521016", glow2: "#1e0a0a" } },
    { id: "demacia", name: "Demacia", tag: "The shining kingdom · silver and gold", art: "Galio", pos: "center 20%",
      c: { accent: "#e8c97a", accentHi: "#ffffff", accentDk: "#8c6b2c", energy: "#5b8cff", energyHi: "#dfe8ff", energyDk: "#1f3b8f",
           bg0: "#070b15", tone: "#1d2c4f", text: "#d9d4c3", white: "#ffffff", glow1: "#1e3c7a", glow2: "#0b1838" } },
    { id: "freljord", name: "Freljord", tag: "The frozen north · ice and frost", art: "Ashe", pos: "center 25%",
      c: { accent: "#a9dcff", accentHi: "#f4fbff", accentDk: "#3d7297", energy: "#7ff3ff", energyHi: "#e6fdff", energyDk: "#1d7a8c",
           bg0: "#040b12", tone: "#16324a", text: "#c7dcea", white: "#f4fbff", glow1: "#1d4e70", glow2: "#0a2638" } },
    { id: "ionia", name: "Ionia", tag: "The First Lands · spirit blossoms", art: "Irelia", pos: "center 25%",
      c: { accent: "#f19ac6", accentHi: "#ffe9f4", accentDk: "#8c3b68", energy: "#5fe3b4", energyHi: "#dbfff1", energyDk: "#1c7a5b",
           bg0: "#0d0710", tone: "#331a35", text: "#e2c6d6", white: "#fff0f8", glow1: "#4b1f50", glow2: "#10302a" } },
    { id: "shurima", name: "Shurima", tag: "The sun empire · gold sands", art: "Azir", pos: "center 20%",
      c: { accent: "#f2bc3e", accentHi: "#fff3d2", accentDk: "#8c5d10", energy: "#2fd5c8", energyHi: "#d6fffb", energyDk: "#0d6c72",
           bg0: "#0e0904", tone: "#3a2810", text: "#e8d09c", white: "#fff6e2", glow1: "#6a4410", glow2: "#0c3a3a" } },
    { id: "targon", name: "Targon", tag: "The Mountain · starlit sky", art: "Leona", pos: "center 20%",
      c: { accent: "#c7a6ff", accentHi: "#f4ecff", accentDk: "#5a3f9e", energy: "#ffd76a", energyHi: "#fff6d6", energyDk: "#8a6a10",
           bg0: "#060514", tone: "#221a4a", text: "#d0c7ee", white: "#f7f2ff", glow1: "#2c1f6e", glow2: "#0f1a4a" } },
    { id: "shadowisles", name: "Shadow Isles", tag: "The Black Mist · haunted shores", art: "Viego", pos: "center 20%",
      c: { accent: "#6fe3c8", accentHi: "#e2fff7", accentDk: "#1f6b5c", energy: "#a6ffe4", energyHi: "#f0fffa", energyDk: "#2a8a72",
           bg0: "#020807", tone: "#10302a", text: "#aed3c8", white: "#eafff9", glow1: "#0f3a32", glow2: "#021412" } },
    { id: "bilgewater", name: "Bilgewater", tag: "Port of plunder · sea and rust", art: "Gangplank", pos: "center 25%",
      c: { accent: "#e0924e", accentHi: "#ffe6cf", accentDk: "#7a4519", energy: "#40c2b2", energyHi: "#d8fff9", energyDk: "#145a54",
           bg0: "#060a0b", tone: "#1e2c2e", text: "#dcc5a8", white: "#fff2e4", glow1: "#3d2610", glow2: "#0b3033" } },
    { id: "bandle", name: "Bandle City", tag: "Home of the yordles · bright and strange", art: "Lulu", pos: "center 25%",
      c: { accent: "#b8e36b", accentHi: "#f7ffe2", accentDk: "#5a7a22", energy: "#8bd7ff", energyHi: "#e6f7ff", energyDk: "#2a6a9a",
           bg0: "#070b0a", tone: "#1f3324", text: "#d6e4ba", white: "#fbffef", glow1: "#2a4a1a", glow2: "#1a2a4a" } },
    { id: "ixtal", name: "Ixtal", tag: "The hidden jungle · elemental green", art: "Qiyana", pos: "center 25%",
      c: { accent: "#52d88c", accentHi: "#e2fff0", accentDk: "#1d6a3f", energy: "#f2c94c", energyHi: "#fff5d4", energyDk: "#8a6614",
           bg0: "#030b07", tone: "#133524", text: "#bfdcc7", white: "#eefff4", glow1: "#0f4024", glow2: "#2a3a0a" } },
    { id: "void", name: "The Void", tag: "Beyond the world · violet hunger", art: "Belveth", pos: "center 25%",
      c: { accent: "#b870ff", accentHi: "#f2e4ff", accentDk: "#5a2b8f", energy: "#ff52da", energyHi: "#ffe2f8", energyDk: "#8a1a73",
           bg0: "#07030c", tone: "#26103d", text: "#d2c1e8", white: "#f8f0ff", glow1: "#3a1260", glow2: "#2a0a3a" } },
  ];
  // each region's crest, drawn as line art (24 x 24)
  const CREST = {
    hextech: '<path d="M12 2.6l8.1 4.7v9.4L12 21.4l-8.1-4.7V7.3z"/><path d="M12 7.4l3.3 4.6-3.3 4.6-3.3-4.6z"/>',
    piltover: '<path d="M10.3 5.0L10.6 2.5L13.4 2.5L13.7 5.0L15.7 5.8L17.8 4.3L19.7 6.2L18.2 8.3L19.0 10.3L21.5 10.6L21.5 13.4L19.0 13.7L18.2 15.7L19.7 17.8L17.8 19.7L15.7 18.2L13.7 19.0L13.4 21.5L10.6 21.5L10.3 19.0L8.3 18.2L6.2 19.7L4.3 17.8L5.8 15.7L5.0 13.7L2.5 13.4L2.5 10.6L5.0 10.3L5.8 8.3L4.3 6.2L6.2 4.3L8.3 5.8Z"/><circle cx="12" cy="12" r="3"/>',
    zaun: '<path d="M9 3h6M10.2 3v6.2L5 18.3A1.9 1.9 0 0 0 6.7 21h10.6a1.9 1.9 0 0 0 1.7-2.7L13.8 9.2V3"/><path d="M7.4 15.2h9.2"/><circle cx="10.6" cy="17.8" r=".7"/><circle cx="13.8" cy="18.4" r=".5"/>',
    noxus: '<path d="M12 2.2l2.1 7.3L12 21.5 9.9 9.5z"/><path d="M3.6 6.8l5.6 4.1-1.3 7.6M20.4 6.8l-5.6 4.1 1.3 7.6"/>',
    demacia: '<path d="M12 3v13.5M9.3 15.6h5.4M12 16.5V21"/><path d="M11 7.4C8.3 6.4 5.4 7 3.2 9.2c2.6.1 4.9.9 7.6 2.9M13 7.4c2.7-1 5.6-.4 7.8 1.8-2.6.1-4.9.9-7.6 2.9"/>',
    freljord: '<path d="M12 2.5v19M3.8 7.25l16.4 9.5M3.8 16.75l16.4-9.5"/><path d="M9.8 3.8 12 6l2.2-2.2M9.8 20.2 12 18l2.2 2.2M4.4 10.2l3-.8-.8-3M19.6 13.8l-3 .8.8 3M4.4 13.8l3 .8-.8 3M19.6 10.2l-3-.8.8-3"/>',
    ionia: '<ellipse cx="12" cy="7" rx="2.5" ry="4.3"/><ellipse cx="12" cy="7" rx="2.5" ry="4.3" transform="rotate(72 12 12)"/><ellipse cx="12" cy="7" rx="2.5" ry="4.3" transform="rotate(144 12 12)"/><ellipse cx="12" cy="7" rx="2.5" ry="4.3" transform="rotate(216 12 12)"/><ellipse cx="12" cy="7" rx="2.5" ry="4.3" transform="rotate(288 12 12)"/><circle cx="12" cy="12" r="1.2"/>',
    shurima: '<circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1.4"/><path d="M12 1.8v3.4M12 18.8v3.4M1.8 12h3.4M18.8 12h3.4M4.8 4.8l2.4 2.4M16.8 16.8l2.4 2.4M4.8 19.2l2.4-2.4M16.8 7.2l2.4-2.4"/>',
    targon: '<path d="M2.8 20.5 9.4 10l3 4.6 2.6-3.6 6.2 9.5z"/><path d="M15.6 2.8l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.5 2.1-.3z"/>',
    shadowisles: '<path d="M12 21.2c-3.9 0-6.4-2.8-6.4-6.2 0-3.7 3.1-5.3 3.8-9.8 1.9 1.6 2.8 3.4 3 5.2 1-1.4 1.3-2.8 1.2-4.2 2.6 2 4.8 5.1 4.8 8.8 0 3.4-2.5 6.2-6.4 6.2z"/><circle cx="10" cy="15.2" r=".9"/><circle cx="14" cy="15.2" r=".9"/>',
    bilgewater: '<circle cx="12" cy="4.6" r="2"/><path d="M12 6.6v14.6M8.2 10h7.6M4.6 13.6c.5 4.4 3.9 7.6 7.4 7.6s6.9-3.2 7.4-7.6"/><path d="M3 15.2l1.6-1.6 1.6 1.6M17.8 15.2l1.6-1.6 1.6 1.6"/>',
    bandle: '<path d="M3.8 12.4a8.2 7.4 0 0 1 16.4 0z"/><path d="M9.8 12.4v6.2a2.2 2.2 0 0 0 4.4 0v-6.2"/><circle cx="9" cy="8.8" r="1.1"/><circle cx="14.8" cy="7.6" r="1.3"/><circle cx="16.6" cy="10.6" r=".7"/>',
    ixtal: '<path d="M4.8 19.2C4.8 10.4 10 4.8 19.2 4.8c0 9.2-5.6 14.4-14.4 14.4z"/><path d="M4.8 19.2l9.4-9.4M9.6 14.4h3.6M12.4 11.6V8"/>',
    void: '<path d="M2.4 12S6 5.4 12 5.4 21.6 12 21.6 12 18 18.6 12 18.6 2.4 12 2.4 12z"/><path d="M12 8.2c1.3 1.3 1.3 6.3 0 7.6-1.3-1.3-1.3-6.3 0-7.6z"/>',
  };
  const BY_ID = Object.fromEntries(THEMES.map((t) => [t.id, t]));
  const KEY = "acp-theme";

  // ------------------------------------------------------------------ colours
  const parse = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const toHex = (c) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("")}`;
  const mix = (a, b, t) => { const x = parse(a), y = parse(b); return toHex(x.map((v, i) => v + (y[i] - v) * t)); };
  const rgb = (h) => parse(h).join(", ");
  const CHEV = (c) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath d='M1.5 1.5 6 6l4.5-4.5' fill='none' stroke='%23${c.slice(1)}' stroke-width='1.8' stroke-linecap='square'/%3E%3C/svg%3E")`;
  const LENS = (c) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23${c.slice(1)}' stroke-width='2.2' stroke-linecap='round'%3E%3Ccircle cx='10.5' cy='10.5' r='6.5'/%3E%3Cpath d='M15.5 15.5 21 21'/%3E%3C/svg%3E")`;

  function varsFor(t) {   // a theme's few colours -> every variable the stylesheet uses
    const c = t.c, at = (k) => mix(c.bg0, c.tone, k);
    const bg1 = at(0.42), deep = at(0.14), ink = mix(c.accentDk, "#000000", 0.55);
    return {
      "--bg0": c.bg0, "--bg0-rgb": rgb(c.bg0), "--bg1": bg1, "--bg1-rgb": rgb(bg1), "--bg2": at(0.6),
      "--bg-deep": deep, "--bg-deep-rgb": rgb(deep), "--veil-rgb": rgb(mix(c.bg0, "#000000", 0.3)),
      "--glow1": c.glow1, "--glow2": c.glow2, "--panel": `rgba(${rgb(at(0.4))}, 0.86)`,
      "--face": mix("#1e2328", c.tone, 0.35), "--face2": mix("#141a20", c.tone, 0.3),
      "--surface": at(0.58), "--surface2": at(0.38), "--surface-hi": at(0.9), "--surface-hi2": at(0.48),
      "--chip-bg": at(0.36), "--field": at(0.66), "--field2": at(0.25), "--rail": at(0.2), "--rail2": at(0.26), "--kbd": at(0.4),
      "--accent": c.accent, "--accent-rgb": rgb(c.accent), "--accent-hi": c.accentHi, "--accent-hi-rgb": rgb(c.accentHi),
      "--accent-dk": c.accentDk, "--accent-dk-rgb": rgb(c.accentDk),
      "--accent-mid": mix(c.accent, c.accentDk, 0.42), "--accent-soft": mix(c.accent, c.accentHi, 0.45),
      "--accent-shade": mix(c.accent, c.accentDk, 0.62), "--accent-deep": mix(c.accentDk, c.bg0, 0.5),
      "--accent-ink": ink, "--accent-ink-rgb": rgb(ink),
      "--accent-glint-rgb": rgb(mix(c.accentHi, "#ffffff", 0.5)), "--accent-lit-rgb": rgb(mix(c.accentHi, "#ffffff", 0.7)),
      "--energy": c.energy, "--energy-rgb": rgb(c.energy), "--energy-hi": c.energyHi, "--energy-hi-rgb": rgb(c.energyHi),
      "--energy-dk": c.energyDk, "--energy-dk-rgb": rgb(c.energyDk),
      "--energy-pale": mix(c.energyHi, "#ffffff", 0.6), "--energy-glint": mix(c.energyHi, "#ffffff", 0.4),
      "--energy-lit": mix(c.energyHi, "#ffffff", 0.7),
      "--energy-face": mix(c.energyDk, c.bg0, 0.62), "--energy-face2": at(0.45),
      "--energy-face-hi": mix(c.energyDk, c.bg0, 0.45), "--energy-face-hi2": at(0.6),
      "--energy-r": mix(c.energy, "#ffffff", 0.15), "--energy-r2": mix(c.energy, c.energyDk, 0.55),
      "--text": c.text, "--text-dim": mix(c.text, c.bg0, 0.36), "--white": c.white,
      "--chev": CHEV(c.accent), "--chev-hi": CHEV(c.accentHi), "--search-icon": LENS(c.accent),
    };
  }

  // -------------------------------------------------------------------- apply
  const root = document.documentElement;
  let current = "hextech", applied = [];
  let pending = null;   // a theme on its way in (its picture still loading)
  // A pick here goes to the server, which tells every screen (this one too) through its long poll.
  // While this page's own pick is on its way, and for a moment after, what the server says is older than
  // what's on screen: following it would switch the theme back and forth.
  let sending = 0, pickedAt = 0;
  function setVars(t) {
    for (const k of applied) root.style.removeProperty(k);
    applied = [];
    const v = t.id === "hextech" ? {} : varsFor(t);   // (Hextech is the stylesheet's own colours)
    v["--art"] = `url("${SPLASH(t.art)}")`;
    v["--art-pos"] = t.pos;
    for (const [k, val] of Object.entries(v)) { root.style.setProperty(k, val); applied.push(k); }
    root.dataset.theme = t.id;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t.c.bg0;
    current = t.id;
    document.querySelectorAll("[data-theme-btn]").forEach(paintButton);
    document.querySelectorAll(".th-tile").forEach((el) => el.classList.toggle("on", el.dataset.theme === t.id));
  }
  function apply(id, opts = {}) {
    const t = BY_ID[id] || BY_ID.hextech;
    if (opts.save !== false) { try { localStorage.setItem(KEY, t.id); } catch (e) { /* private mode */ } }
    if (opts.share) {   // the tracker window and your phone follow
      sending++;
      pickedAt = Date.now();
      fetch("/api/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: t.id }) })
        .catch(() => {}).finally(() => { sending--; pickedAt = Date.now(); });
    }
    if (t.id === (pending || current) && root.dataset.theme) return;   // already on, or on its way
    if (!opts.fade || !document.body) {
      pending = null;
      root.classList.remove("theme-swap");
      return setVars(t);
    }
    // fade the old picture out, get the new one ready (downloaded and decoded, so the switch itself
    // is a single quick frame), then recolour everything and fade the picture in
    pending = t.id;
    root.classList.add("theme-swap");
    const img = new Image();
    img.src = SPLASH(t.art);
    const ready = (img.decode ? img.decode() : new Promise((res, rej) => { img.onload = res; img.onerror = rej; })).catch(() => {});
    const faded = new Promise((res) => setTimeout(res, 200));   // (the fade-out's length)
    const late = new Promise((res) => setTimeout(res, 1600));   // a slow connection doesn't hold the colours up
    Promise.race([Promise.all([ready, faded]), late]).then(() => {
      if (pending !== t.id) return;   // another theme was picked meanwhile
      pending = null;
      setVars(t);
      requestAnimationFrame(() => root.classList.remove("theme-swap"));
    });
  }
  function fromServer(p) {   // the board, the tracker or your phone picked a theme: follow it here
    const id = typeof p === "string" ? p : p?.theme;
    if (sending || Date.now() - pickedAt < 2000) return;   // (this page's own pick: see above)
    if (id && BY_ID[id] && id !== (pending || current)) apply(id, { fade: true });
  }
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* */ }
  apply(saved || "hextech", { save: false });

  // ------------------------------------------------------------- the picker
  const crest = (id, cls = "") => `<svg class="crest ${cls}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${CREST[id] || CREST.hextech}</svg>`;
  function paintButton(b) {
    const t = BY_ID[current];
    b.innerHTML = `${crest(t.id)}<span class="th-btn-label">Theme</span>`;
    b.title = `Theme: ${t.name}. Choose a region: its colours and art for the whole site`;
  }
  let box = null;
  function openPicker() {
    if (!box) {
      box = document.createElement("div");
      box.className = "th-modal";
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-modal", "true");
      box.setAttribute("aria-label", "Choose a theme");
      box.innerHTML = `<div class="th-box"><button class="modal-x th-x" title="Close (Esc)">✕</button>
        <h2 class="th-title">Choose your region</h2>
        <p class="th-lead">Colours and art for the whole site: here, in the draft tracker and on your phone. The Blue and Red team colours stay the same.</p>
        <div class="th-grid">${THEMES.map((t) => `<button class="th-tile" data-theme="${t.id}" style="--t-a:${t.c.accent};--t-e:${t.c.energy};--t-bg:${t.c.bg0}">
          <span class="th-art" style="background-image:url('${SPLASH(t.art)}');background-position:${t.pos}"></span>
          <span class="th-crest">${crest(t.id)}</span>
          <span class="th-text"><span class="th-name">${t.name}</span><span class="th-tag">${t.tag}</span></span>
          <span class="th-check" aria-hidden="true"></span></button>`).join("")}</div></div>`;
      document.body.appendChild(box);
      box.addEventListener("click", (e) => {
        const tile = e.target.closest(".th-tile");
        if (tile) return apply(tile.dataset.theme, { fade: true, share: true });
        if (e.target === box || e.target.closest(".th-x")) closePicker();
      });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape" && box.classList.contains("open")) closePicker(); });
    }
    box.querySelectorAll(".th-tile").forEach((el) => el.classList.toggle("on", el.dataset.theme === current));
    box.classList.add("open");
    box.querySelector(".th-tile.on")?.focus({ preventScroll: true });
  }
  function closePicker() { box?.classList.remove("open"); }

  function wire() {
    document.querySelectorAll("[data-theme-btn]").forEach((b) => { paintButton(b); b.addEventListener("click", openPicker); });
    fetch("/api/prefs", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((p) => fromServer(p)).catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();

  window.ACPTheme = { THEMES, apply, fromServer, openPicker, current: () => current, crest };
})();
