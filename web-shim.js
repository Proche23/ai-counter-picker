"use strict";
/* The in-browser version only (build_web.py puts it first on every page): the pages ask /api/...
   exactly as they ask the local site, and this answers right here in the browser instead of a server.
   The engine (the same Python as the local site, running in Pyodide) lives in a background worker
   (engine-worker.js); the champion list and the Lab report are plain files; settings stay in this
   browser. Following the League client, phone mode, the tracker window and Riot look-ups need the PC. */
(() => {
  const realFetch = window.fetch.bind(window);
  const V = "d9fa9392c0";   // (build_web.py: this build's stamp, so a browser never mixes files from two builds)
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
  async function engine(method, path, query, body, timeout = 0) {   // (timeout: restart the engine if it never answers)
    try { await boot(); } catch (e) { return json({ error: `The engine couldn't start in this browser (${e.message}). Reload the page to try again.` }, 503); }
    const id = ++n;
    const out = await new Promise((resolve) => {
      waiting.set(id, resolve);
      worker.postMessage({ id, method, path, query, body });
      if (timeout) setTimeout(() => { if (waiting.has(id)) restart("the engine stopped answering"); }, timeout);
    });
    const r = JSON.parse(out);
    return json(r.body, r.status);
  }
  function restart(why) {   // the engine crashed or got stuck: answer everything waiting on it, and start it again
    try { worker?.terminate(); } catch (e) { /* already gone */ }
    worker = null; ready = null;
    Object.assign(state, { stage: "Restarting the engine…", error: null, done: false });
    const gone = JSON.stringify({ status: 503, body: { error: `${why}; it's starting again` } });
    for (const w of waiting.values()) w(gone);
    waiting.clear();
    boot();
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

  // ---- your League client, through the League helper on this PC (league-helper.zip, a small read-only
  // program: a website can't see programs on your PC by itself). It's asked what the client shows, the
  // engine turns that into the board's state (the same Python as the PC version), and the page's live
  // request (/api/client) is answered like the PC version's: at once when something changed, else when it does.
  const HELPER = "http://127.0.0.1:8799";
  const HELPER_NEWEST = "1.6";   // (build_web.py: web/league-helper.ps1's version; an older helper still works, and the League window offers this one)
  // Nothing may stop the board following for good: every look at the helper and every read by the engine has
  // a time limit, a look that never ends is given up on, and a hidden page looks again as soon as it's shown.
  const ASK_MS = 8000, PARSE_MS = 20000, GRACE_MS = 12000;   // (a read by the engine takes well under a second)
  const CL = { v: 0, st: { status: "nohelper" }, last: "", waiters: [], started: false, first: null, timer: 0,
               running: null, gen: 0, startedAt: 0, okAt: 0 };
  function publish(st) {
    const text = JSON.stringify(st);
    if (text === CL.last) return;
    CL.last = text;
    CL.st = st;
    CL.v += 1;
    CL.waiters.splice(0).forEach((wake) => wake());
  }
  async function askHelper() {   // what the client shows right now, through the helper
    const quiet = prefs().quietInGame === true ? 1 : 0;   // (the live score in game, unless "Quiet during games" is on)
    const stop = new AbortController(), t = setTimeout(() => stop.abort(), ASK_MS);
    try {
      const r = await realFetch(`${HELPER}/state?quiet=${quiet}`, { cache: "no-store", signal: stop.signal });
      if (!r.ok) throw new Error(`the helper answered ${r.status}`);
      const raw = await r.json();
      if (!raw || typeof raw !== "object") throw new Error("the helper's answer was empty");
      return raw;
    } finally {
      clearTimeout(t);
    }
  }
  async function look() {   // -> [the board's state (null: keep the last one), ms until the next look]
    let raw;
    try {
      raw = await askHelper();
    } catch (e) {   // not running, too slow, or this browser won't let the page reach it
      // a moment's hiccup while connected keeps what the board shows (and looks again soon); then "not connected"
      if (CL.st.status === "on" && Date.now() - CL.okAt < GRACE_MS) return [null, 1000];
      return [{ status: "nohelper" }, 3000];
    }
    CL.okAt = Date.now();
    if (!raw.client) return [{ status: "off", helper: raw.helper }, 3000];
    let st;
    try {
      const res = await engine("POST", "/api/client-parse", "", JSON.stringify(raw), PARSE_MS);
      st = await res.json();
      if (!res.ok) throw new Error(st.error || `error ${res.status}`);
    } catch (e) {
      return [{ status: "error", error: `couldn't read what the client shows (${e.message})`, helper: raw.helper }, 3000];
    }
    st.helper = raw.helper;
    const ph = st.phase;
    if (ph === "Matchmaking" && CL.st.phase === "Matchmaking" && CL.st.queue_since) st.queue_since = CL.st.queue_since;   // (a steady queue timer)
    return [st, st.paused ? 5000 : ph === "ChampSelect" ? 400 : (ph === "Matchmaking" || ph === "ReadyCheck") ? 700
      : ["GameStart", "InProgress", "Reconnect"].includes(ph) ? 2000 : 1500];
  }
  function pollHelper() {   // look now (one look at a time), then again in a moment, for as long as the page is open
    if (CL.running) return CL.running;
    clearTimeout(CL.timer);
    const gen = ++CL.gen;
    CL.startedAt = Date.now();
    CL.running = (async () => {
      let st = null, next = 3000;
      try {
        [st, next] = await look();
      } catch (e) {
        st = { status: "error", error: `couldn't follow the client (${(e && e.message) || e})` };
      }
      if (gen !== CL.gen) return;   // (given up on: a newer look has taken over)
      CL.running = null;
      if (st) publish(st);
      CL.timer = setTimeout(pollHelper, document.visibilityState === "hidden" && CL.st.status !== "on" ? 6000 : next);
    })();
    return CL.running;
  }
  setInterval(() => {   // the safety net: a look that never ended, or no look for a while, starts a fresh one
    if (!CL.started) return;
    const age = Date.now() - CL.startedAt;
    if (CL.running ? age > ASK_MS + PARSE_MS + 5000 : age > 20000) { CL.running = null; CL.gen += 1; pollHelper(); }
  }, 5000);
  const lookSoon = () => { if (CL.started && !CL.running) pollHelper(); };   // (back on the page: fresh at once)
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") lookSoon(); });
  addEventListener("focus", lookSoon);
  addEventListener("pageshow", lookSoon);
  function startClient() {
    if (!CL.started) { CL.started = true; CL.first = pollHelper(); }
    return CL.first;
  }
  window.acpClient = {   // for the League button: look again now (after starting the helper)
    retry: () => { CL.started = true; return pollHelper(); },
    state: () => CL.st,
    helperUrl: file("league-helper.zip"),
    helperNewest: HELPER_NEWEST,
  };

  // ---- My Stats: your recent games from the League client (through the helper), worked out by the engine
  // here. Your last look-up stays in this browser, so the tab still shows it while League is closed.
  const MS_NEED = "1.6";   // (the first helper that can read the match history)
  const MS_KEY = "acp-mystats-v1";
  const MS = { state: null, at: 0, chain: Promise.resolve() };
  const QUEUE_IDS = { ranked: [420], flex: [440], draft: [400], all: [400, 420, 430, 440, 480, 490, 700] };
  const msSaved = () => { try { return JSON.parse(localStorage.getItem(MS_KEY) || "null"); } catch (e) { return null; } };
  const msSave = (s) => { try { localStorage.setItem(MS_KEY, JSON.stringify(s)); } catch (e) { /* full, or a private window */ } };
  const olderThan = (a, b) => {
    const x = String(a || "0").split(".").map(Number), y = String(b).split(".").map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
    return false;
  };
  async function helperGet(path, ms = 20000) {
    const stop = new AbortController(), t = setTimeout(() => stop.abort(), ms);
    try {
      const r = await realFetch(`${HELPER}${path}`, { cache: "no-store", signal: stop.signal });
      if (!r.ok) throw new Error(`the helper answered ${r.status}`);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }
  function trimTimeline(tl) {   // what My Stats reads from a game's timeline (the same cut as leagueclient.trim_timeline)
    if (!tl || !Array.isArray(tl.frames)) return null;
    const KEEP = ["totalGold", "xp", "minionsKilled", "jungleMinionsKilled", "level"];
    return { frames: tl.frames.map((fr, i) => {
      const pf = {};
      if (i <= 16) {
        for (const [pid, f] of Object.entries(fr?.participantFrames || {})) {
          const o = {};
          KEEP.forEach((k) => { if (f?.[k] != null) o[k] = f[k]; });
          pf[pid] = o;
        }
      }
      const events = (fr?.events || []).filter((e) => e?.type === "CHAMPION_KILL").map((e) => ({ type: e.type, timestamp: e.timestamp,
        killerId: e.killerId, victimId: e.victimId, assistingParticipantIds: e.assistingParticipantIds }));
      return { timestamp: fr?.timestamp, participantFrames: pf, events };
    }) };
  }
  async function readClient(queue, count) {   // what the client shows about your games -> the engine's raw input
    const fail = (status, body) => Object.assign(new Error(body.error), { status, body });
    let ping;
    try { ping = await helperGet("/ping", 4000); } catch (e) {
      throw fail(409, { error: "Start the League helper (the League button at the top), open League, then press Refresh: "
        + "the website reads your games through it.", no_helper: true });
    }
    if (olderThan(ping.helper, MS_NEED)) {
      throw fail(409, { error: `Your League helper is version ${ping.helper}; My Stats needs ${MS_NEED} or newer. Get the new one with the `
        + "League button at the top (the same steps as before), then Refresh.", old_helper: true });
    }
    const me = await helperGet("/me");
    if (!me.client || !me.data?.puuid) {
      throw fail(409, { error: "The League helper is running, but League isn't open (or not signed in yet): open it, then Refresh.", no_client: true });
    }
    const ranked = await helperGet("/ranked").catch(() => null);
    const want = QUEUE_IDS[queue] || QUEUE_IDS.ranked;
    const hist = [];
    for (let page = 0; page < 5; page++) {
      const h = await helperGet(`/history?beg=${page * 20}&end=${page * 20 + 19}`);
      const chunk = h?.data?.games?.games || [];
      hist.push(...chunk);
      if (chunk.length < 20 || hist.filter((g) => want.includes(g.queueId)).length >= count) break;
    }
    const mine = hist.filter((g) => want.includes(g.queueId)).sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0)).slice(0, count);
    const games = {}, timelines = {};
    for (const g of mine) {   // (one at a time: the helper answers one thing at a time, and the board still needs it too)
      const id = String(g.gameId);
      if (!/^\d+$/.test(id)) continue;
      const full = await helperGet(`/game/${id}`).catch(() => null);
      if (full?.data) games[id] = full.data;
      const tl = await helperGet(`/timeline/${id}`).catch(() => null);
      const t = trimTimeline(tl?.data);
      if (t) timelines[id] = t;
    }
    return { me: me.data, ranked: ranked?.data || null, history: mine, games, timelines };
  }
  async function myStats(params) {
    const queue = QUEUE_IDS[params.get("queue")] ? params.get("queue") : "ranked";
    const count = Math.max(5, Math.min(Number(params.get("count")) || 20, 50));
    const role = params.get("role") || "";
    const fresh = params.get("fresh") === "1";
    if (!MS.state) MS.state = msSaved();
    let st = MS.state && MS.state.queue === queue ? MS.state : null;
    let stale = false, why = "";
    if (!(st && (st.count || 0) >= count && !fresh && Date.now() - MS.at < 300000)) {
      try {
        const raw = await readClient(queue, count);
        const res = await engine("POST", "/api/mystats-parse", "", JSON.stringify({ raw, queue, count, fetched: new Date().toISOString() }), 120000);
        const body = await res.json();
        if (!res.ok) {
          if (body.empty) return json(body, 404);
          throw Object.assign(new Error(body.error || `error ${res.status}`), { status: res.status, body });
        }
        st = body;
        MS.state = st;
        MS.at = Date.now();
        msSave(st);
      } catch (e) {
        const body = e.body || { error: `Couldn't read your games through the League helper (${e.message || e}): is it still running?`, no_helper: true };
        if (!st) return json(body, e.status || 409);
        stale = true;   // (League or the helper is closed: the last games read, marked as such, and why)
        why = body.no_helper ? "The League helper isn't running (or this browser can't reach it)." : body.error || "";
      }
    }
    return engine("POST", "/api/mystats-compare", "", JSON.stringify({ state: st, role, count, stale, why }), 60000);
  }

  // ---- every /api/... request the pages make
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const at = url.pathname.indexOf("/api/");
    if (at < 0 || url.origin !== location.origin) return realFetch(input, init);
    const path = url.pathname.slice(at);
    const method = (init.method || "GET").toUpperCase();
    if (STATIC[path]) return realFetch(file(STATIC[path]));
    if (path === "/api/client") {   // your League client (through the helper): answers when something changes
      await startClient();
      const v = Number(url.searchParams.get("v"));
      if (v === CL.v) await new Promise((wake) => { CL.waiters.push(wake); setTimeout(wake, 20000); });
      return json({ ...CL.st, v: CL.v, prefs: prefs() });
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
    if (path === "/api/mystats") {   // (one look-up at a time: a role switch waits for a read that's under way)
      const run = MS.chain.then(() => myStats(url.searchParams));
      MS.chain = run.catch(() => {});
      return run;
    }
    if (path === "/api/games") return json([]);
    if (path === "/api/game") return json({ error: "Replaying a pro game (judged only with the games played before it) needs the desktop version." }, 400);
    if (path.startsWith("/api/players") || ["/api/phone", "/api/window", "/api/quit"].includes(path)) {
      return json({ error: "That needs the desktop version (it runs on your PC next to League)." }, 404);
    }
    return engine(method, path, url.search.slice(1), typeof init.body === "string" ? init.body : "");
  };
  boot();   // start warming up at once, while the page draws
})();
