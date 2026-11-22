"use strict";
/* The in-browser version only (build_web.py puts it first on every page): the pages ask /api/...
   exactly as they ask the local site, and this answers right here in the browser instead of a server.
   The engine (the same Python as the local site, running in Pyodide) lives in a background worker
   (engine-worker.js); the champion list and the Lab report are plain files; settings stay in this
   browser. Following the League client, phone mode, the tracker window and Riot look-ups need the PC. */
(() => {
  const realFetch = window.fetch.bind(window);
  const V = "bf1da01a49";   // (build_web.py: this build's stamp, so a browser never mixes files from two builds)
  const BASE = new URL(".", document.currentScript?.src || location.href);   // where the site's files are
  const file = (p) => `${new URL(p, BASE).href}?v=${V}`;
  const STATIC = { "/api/meta": "data/meta.json", "/api/lab": "data/lab.json", "/api/lab_games": "data/lab_games.json" };
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  document.documentElement.classList.add("web");

  // ---- settings (theme, champion filter): this browser's own storage
  const PREFS = "acp-web-prefs";
  const prefs = () => { try { return JSON.parse(localStorage.getItem(PREFS) || "{}") || {}; } catch (e) { return {}; } };
  const savePrefs = (p) => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (e) { /* private window */ } };

  // ---- the engine, in a worker (so the page never freezes while it thinks)
  let worker = null, ready = null, n = 0;
  const waiting = new Map(), state = { stage: "Starting the engine…", error: null, done: false };
  function boot() {
    if (ready) return ready;
    worker = new Worker(file("engine-worker.js"));
    ready = new Promise((resolve, reject) => {
      worker.onmessage = (e) => {
        const m = e.data || {};
        if (m.progress) { state.stage = m.progress; banner(); return; }
        if (m.ready) { state.done = true; banner(); resolve(); return; }
        if (m.fatal) { state.error = m.fatal; banner(); reject(new Error(m.fatal)); return; }
        const w = waiting.get(m.id);
        if (w) { waiting.delete(m.id); w(m.out); }
      };
      worker.onerror = (e) => { state.error = e.message || "the engine didn't start"; banner(); reject(new Error(state.error)); };
    });
    ready.catch(() => {});
    return ready;
  }
  async function engine(method, path, query, body) {
    try { await boot(); } catch (e) { return json({ error: `The engine couldn't start in this browser (${e.message}). Reload the page to try again.` }, 503); }
    const id = ++n;
    const out = await new Promise((resolve) => { waiting.set(id, resolve); worker.postMessage({ id, method, path, query, body }); });
    const r = JSON.parse(out);
    return json(r.body, r.status);
  }

  // ---- a small note while the engine warms up (the first visit downloads Python once, then it's cached)
  let el = null, shownAt = 0;
  function banner() {
    if (!document.body) { addEventListener("DOMContentLoaded", banner, { once: true }); return; }
    if (!el) {
      el = document.createElement("div");
      el.className = "engine-note";
      el.setAttribute("role", "status");
      document.body.appendChild(el);
      shownAt = performance.now();
    }
    if (state.error) {
      el.className = "engine-note bad";
      el.innerHTML = "";
      el.append(Object.assign(document.createElement("b"), { textContent: "The engine couldn't start." }), ` ${state.error} `);
      const again = Object.assign(document.createElement("button"), { textContent: "Reload", type: "button" });
      again.onclick = () => location.reload();
      el.append(again);
      return;
    }
    if (state.done) {
      el.className = "engine-note done";
      el.textContent = "Engine ready";
      setTimeout(() => el && el.classList.add("gone"), performance.now() - shownAt < 1200 ? 300 : 1400);
      return;
    }
    el.className = "engine-note";
    el.innerHTML = '<i class="spin-inline" aria-hidden="true"></i>';
    el.append(state.stage, Object.assign(document.createElement("small"), { textContent: " first visit: about 15 MB, then it's cached" }));
  }

  // ---- every /api/... request the pages make
  let clientCalls = 0;
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const at = url.pathname.indexOf("/api/");
    if (at < 0 || url.origin !== location.origin) return realFetch(input, init);
    const path = url.pathname.slice(at);
    const method = (init.method || "GET").toUpperCase();
    if (STATIC[path]) return realFetch(file(STATIC[path]));
    if (path === "/api/client") {   // no League client in a browser: answer once, then like an idle long poll
      if (clientCalls++) await new Promise((r) => setTimeout(r, 25000));
      return json({ status: "disabled", v: 1, prefs: prefs() });
    }
    if (path === "/api/prefs") {
      if (method === "POST") {
        let add = {};
        try { add = JSON.parse(init.body || "{}") || {}; } catch (e) { /* ignore */ }
        const p = { ...prefs(), ...add };
        savePrefs(p);
        return json(p);
      }
      return json(prefs());
    }
    if (path === "/api/ping") return json({ app: "ai-counter-picker", web: true });
    if (path === "/api/games") return json([]);
    if (path === "/api/game") return json({ error: "Replaying a pro game (judged only with the games played before it) needs the desktop version." }, 400);
    if (path.startsWith("/api/players") || ["/api/phone", "/api/window", "/api/quit"].includes(path)) {
      return json({ error: "That needs the desktop version (it runs on your PC next to League)." }, 404);
    }
    return engine(method, path, url.search.slice(1), typeof init.body === "string" ? init.body : "");
  };
  boot();   // start warming up at once, while the page draws
})();
