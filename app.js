"use strict";
/* AI Counter Picker - champ-select style draft board.
   State lives here; every change POSTs to /api/analyze and the server's
   "next" step decides where the next Enter goes. */

const $ = (s) => document.querySelector(s);
const ROLES = ["TOP", "JNG", "MID", "BOT", "SUP"];
const ROLE_NAME = { TOP: "Top", JNG: "Jungle", MID: "Mid", BOT: "Bot", SUP: "Support" };
const SIDE = { B: "Blue", R: "Red" };
const LEAGUE_SHORT = {
  "LoL Champions Korea": "LCK", "Tencent LoL Pro League": "LPL", "First Stand": "First Stand",
  "Mid-Season Invitational": "MSI", "Esports World Cup": "EWC", "World Championship": "Worlds",
};
const DRIVER_LABEL = {
  vs_their_picks: "vs their picks", vs_their_likely_picks: "vs what they'll likely pick",
  with_your_picks: "with your picks", champion: "champion strength", player_comfort: "player comfort",
};

// opened on your phone (phone mode: the site reached over your home Wi-Fi, not on this PC itself)
const PHONE_VIEW = !["127.0.0.1", "localhost", "::1", "[::1]"].includes(location.hostname);
// the compact phone layout: on your phone (phone mode), and on any narrow screen
const NARROW = matchMedia("(max-width: 640px)");
const phoneLayout = () => document.body.classList.toggle("phone", PHONE_VIEW || NARROW.matches);
phoneLayout();
NARROW.addEventListener?.("change", () => { phoneLayout(); if (typeof RES !== "undefined" && RES) placeLive(); });

let META = null, VER = "", CHAMPS = [], BY_NAME = {}, KEY = {}, ALIAS = {};
let POOL = null;   // your saved account's champions per role (from the Players page look-ups)
let SWAP = null;      // {side, idx}: the pick being swapped; the next champion typed replaces it
let CLEARED = null;   // the draft before "Clear draft", so Undo can bring it back
let S = loadState() || freshState();
let SHARED = null;   // a draft opened from a link (#d=...), applied once the champion list is in
let RES = null;
let LAST_P = 0.5;
let roleFilter = "ALL";
let sugg = [], suggIdx = 0;
let busy = false, pending = false;
const queue = [];  // locks typed while the server is still answering are applied in order
const BORN = new Map();   // "B2Graves" -> when that champion appeared on the board (for the lock-in flash)
let BOARD_SEEN = false;   // champions already there when the page opens don't flash
function born(key, present) {   // a champion locked in under 0.7 s ago keeps its flash going across re-renders
  present.add(key);
  const now = performance.now();
  if (!BORN.has(key)) BORN.set(key, BOARD_SEEN ? now : -1e9);
  const age = now - BORN.get(key);
  return age < 700 ? { cls: " fresh", css: `--born:-${Math.round(age)}ms;` } : { cls: "", css: "" };
}

/* ------------------------------------------------------------ helpers */
function freshState(keep) {
  return {
    blue: [], red: [], blueBans: [], redBans: [], fearless: [], history: [], game: 1,
    blueTeam: keep?.blueTeam || "", redTeam: keep?.redTeam || "", us: keep?.us || "", skipBans: keep?.skipBans || false,
    fpSide: keep?.fpSide || "",
    // solo queue: your role, your place in your team's pick order, your champions; bans are optional
    // (typeBans: type all 10 first; otherwise straight to picks, and a banned suggestion is marked with one click)
    solo: keep?.solo || false, myRole: keep?.myRole || "", slot: "",   // your pick number changes every game
    poolOn: keep?.poolOn ?? true, poolOff: keep?.poolOff || [], typeBans: keep?.typeBans || false,
    banStage: !!keep?.solo && !!keep?.typeBans,
    sideChosen: false,   // each new draft starts by asking which team you're on
    loaded: keep?.loaded || false,   // loading screen / game started: skip bans, just type the 10 champions
    follow: keep?.follow ?? true,    // fill the board in from your League client by itself
    clientKey: "",                   // which champ select (or game) this board was filled from
  };
}
function saveState() { try { localStorage.setItem("acp-draft-v1", JSON.stringify(S)); } catch (e) { /* private mode */ } }
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem("acp-draft-v1") || "null");
    if (!s || !Array.isArray(s.blue)) return null;
    const d = freshState(s);   // a draft saved by an older version: fill in settings added since
    for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
    if (!Array.isArray(s.poolOff)) s.poolOff = [];
    return s;
  }
  catch (e) { return null; }
}
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const key = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
const pct = (x) => (x == null ? "-" : `${Math.round(x * 100)}%`);
const pct1 = (x) => (x == null ? "-" : `${(x * 100).toFixed(1)}%`);
const signed = (x, d = 1) => `${x >= 0 ? "+" : ""}${x.toFixed(d)}`;
const champImg = (n) => (BY_NAME[n] ? `https://ddragon.leagueoflegends.com/cdn/${VER}/img/champion/${BY_NAME[n].id}.png` : "");
const splashImg = (n) => (BY_NAME[n] ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${BY_NAME[n].id}_0.jpg` : "");
const itemImg = (n) => (META.items[n] ? `https://ddragon.leagueoflegends.com/cdn/${VER}/img/item/${META.items[n]}.png` : "");
const runeImg = (n) => (META.runes[n] ? `https://ddragon.leagueoflegends.com/cdn/img/${META.runes[n]}` : "");
const spellImg = (n) => (META.spells[n] ? `https://ddragon.leagueoflegends.com/cdn/${VER}/img/spell/${META.spells[n]}` : "");
const img = (src, alt, cls = "") => (src ? `<img src="${esc(src)}" alt="${esc(alt)}" class="${cls}" loading="lazy">` : "");
const chip = (n, extra = "") => `<span class="chip">${img(champImg(n), n)}${esc(n)}${extra ? ` <span class="muted">${esc(extra)}</span>` : ""}</span>`;

function used() {
  const u = new Set(S.fearless);
  [...S.blue, ...S.red].forEach((p) => u.add(p.champ));
  [...S.blueBans, ...S.redBans].forEach((b) => u.add(b));
  return u;
}
function toast(msg, opt) {   // (fx.js draws it: a note at the bottom, with an action button when given)
  if (window.acpToast) return window.acpToast(msg, opt);
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}
function roleMap(side) {
  const m = {};
  (RES?.draft?.[side]?.picks || []).forEach((p) => { m[p.champ] = p.role; });
  return m;
}

/* --------------------------------------------------------------- init */
async function init() {
  try {
    const r = await fetch("/api/meta");
    META = await r.json();
  } catch (e) {
    $("#dataBadge").textContent = "Can't reach the server. Start it with: py serve.py";
    return;
  }
  VER = META.version;
  CHAMPS = META.champions;
  ALIAS = META.aliases || {};
  CHAMPS.forEach((c) => { BY_NAME[c.name] = c; KEY[key(c.name)] = c.name; if (!KEY[key(c.id)]) KEY[key(c.id)] = c.name; });
  Object.entries(ALIAS).forEach(([a, n]) => { if (BY_NAME[n] && !KEY[key(a)]) KEY[key(a)] = n; });

  const sm = META.summary;
  const leagues = Object.keys(sm.leagues).map((l) => LEAGUE_SHORT[l] || l).join(" · ");
  $("#dataBadge").textContent = `${sm.games.toLocaleString()} pro games · ${leagues}${sm.region_games ? ` · +${sm.region_games.toLocaleString()} from other regions` : ""} · newest: ${sm.latest_event}, patch ${sm.latest_patch}`;
  const m = META.model || {};
  const acc = m.oos_accuracy || {};
  const tk = m.predictor_topk || {};
  $("#modelBadge").textContent = [
    acc.draft ? `Win model: ${pct1(acc.draft)} correct on unseen games (${pct1(acc.players)} with teams set)` : "",
    tk["5"] ? `Enemy-pick predictor: real pick in its top 5 ${pct(tk["5"])} of the time` : "",
    m.fitted ? `Learned ${m.fitted}` : "",
  ].filter(Boolean).join(" · ");

  for (const id of ["#blueTeam", "#redTeam"]) {
    const el = $(id);
    META.teams.forEach((t) => el.add(new Option(t, t)));
    const want = id === "#blueTeam" ? S.blueTeam : S.redTeam;  // e.g. a replayed game with an older team
    if (want && !META.teams.includes(want)) el.add(new Option(want, want));
  }
  $("#blueTeam").value = S.blueTeam;
  $("#redTeam").value = S.redTeam;
  $("#us").value = S.us;
  $("#fpSide").value = S.fpSide || "";
  $("#skipBans").checked = !!S.skipBans;
  await loadPool();

  const tabs = $("#roleTabs");
  ["ALL", ...ROLES].forEach((r) => {
    const b = document.createElement("button");
    b.textContent = r === "ALL" ? "All" : ROLE_NAME[r];
    b.dataset.role = r;
    b.onclick = () => { roleFilter = r; renderGrid(); };
    tabs.appendChild(b);
  });

  bindEvents();
  openSharedDraft();
  await refresh();
  if (!PHONE_VIEW) $("#champInput").focus({ preventScroll: true });   // (no jump: the draft at the top stays in view; on a phone it would pop the keyboard up)
  clientLoop();   // follow the League client from here on
}

/* -------------------------------------------------------- draft links */
// A draft link (http://127.0.0.1:8765/#d=<code>, made by the old "Link" button) holds the picks with
// roles, bans and settings of a draft, and still opens it on any copy of the site. Opening one keeps your
// own draft one Undo away.
function openSharedDraft() {
  const m = location.hash.match(/^#d=([\w-]+)$/);
  if (!m) return;
  history.replaceState(null, "", location.pathname);   // (a reload shouldn't open it again)
  try {
    const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    const ok = (c) => typeof c === "string" && BY_NAME[c];
    const picks = (a) => (Array.isArray(a) ? a : []).filter((p) => ok(p?.champ)).slice(0, 5)
      .map((p) => ({ champ: p.champ, role: ROLES.includes(p.role) ? p.role : null, ...(p.me ? { me: true } : {}) }));
    const had = S.blue.length + S.red.length + S.blueBans.length + S.redBans.length;
    CLEARED = had ? JSON.parse(JSON.stringify(S)) : null;
    S = freshState(S);
    Object.assign(S, {
      blue: picks(d.blue), red: picks(d.red),
      blueBans: (d.blueBans || []).filter(ok).slice(0, 5), redBans: (d.redBans || []).filter(ok).slice(0, 5),
      fearless: (d.fearless || []).filter(ok), game: Number(d.game) || 1,
      blueTeam: String(d.blueTeam || ""), redTeam: String(d.redTeam || ""), us: ["B", "R"].includes(d.us) ? d.us : "",
      fpSide: ["blue", "red"].includes(d.fpSide) ? d.fpSide : "", skipBans: !!d.skipBans, solo: !!d.solo,
      myRole: ROLES.includes(d.myRole) ? d.myRole : S.myRole, slot: /^[1-5]$/.test(String(d.slot)) ? String(d.slot) : "",
      loaded: !!d.loaded, sideChosen: true, clientKey: "link",
    });
    SHARED = true;
    toast(had ? "Opened the draft from the link. Undo brings yours back." : "Opened the draft from the link");
  } catch (e) {
    toast("That draft link is damaged: ask for it again");
  }
}

function bindEvents() {
  const input = $("#champInput");
  input.addEventListener("input", () => { updateSuggest(); renderGrid(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!sugg.length) return;
      e.preventDefault();
      suggIdx = (suggIdx + (e.key === "ArrowDown" ? 1 : -1) + sugg.length) % sugg.length;
      renderSuggest();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const q = input.value.trim();
      if (!q) return lockTop();
      const banIt = e.shiftKey && S.solo && !S.loaded;   // Shift+Enter in solo queue: that champion was banned
      if (MULTI) {   // several champions typed in one go ("zed yas lee"): lock them in order
        const names = MULTI;
        input.value = "";
        updateSuggest();
        return names.forEach((n) => (banIt ? markBanned(n) : lock(n)));
      }
      if (sugg.length) return banIt ? markBanned(sugg[suggIdx].name) : lock(sugg[suggIdx].name);
      const exact = KEY[key(q)];
      toast(exact && used().has(exact) ? `${exact} is already taken` : `No champion matches “${q}”`);
    } else if (e.key === "Tab" && sugg.length && input.value.trim()) {
      e.preventDefault();
      input.value = sugg[suggIdx].name;
      updateSuggest();
    } else if (e.key === "Escape") {
      input.value = "";
      updateSuggest();
      renderGrid();
    } else if (e.key === "Backspace" && !input.value) {
      e.preventDefault();
      undo();
    }
  });
  input.addEventListener("blur", () => setTimeout(() => $("#suggest").classList.remove("open"), 150));
  // the search box stays at the top of the board while you scroll; give it a backing only while it's pinned there
  const bar = $(".search"), head = $("header.top");
  const pinned = () => bar.classList.toggle("stuck", window.scrollY > 0 && bar.getBoundingClientRect().top <= head.getBoundingClientRect().bottom + 2);
  if (typeof ResizeObserver !== "undefined") {   // the header can wrap onto two rows in a narrow window
    new ResizeObserver(() => document.documentElement.style.setProperty("--head-h", `${Math.round(head.getBoundingClientRect().height)}px`)).observe(head);
  }
  window.addEventListener("scroll", pinned, { passive: true });
  window.addEventListener("load", () => requestAnimationFrame(pinned));   // the page can open already scrolled down
  document.addEventListener("keydown", (e) => {
    // start typing anywhere and it goes into the champion box
    if (document.activeElement !== input && e.key.length === 1 && /[a-z0-9']/i.test(e.key)
        && !e.ctrlKey && !e.metaKey && !e.altKey && !["SELECT", "INPUT"].includes(document.activeElement?.tagName)) {
      input.focus();
    }
  });
  $("#undoBtn").onclick = undo;
  $("#modalClose").onclick = closeProfile;
  $("#modal").onclick = (e) => { if (e.target.id === "modal") closeProfile(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && $("#modal").classList.contains("open")) closeProfile(); });
  $("#resetBtn").onclick = clearDraft;
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && SWAP && !$("#modal").classList.contains("open")) cancelSwap();
  });
  $("#nextGameBtn").onclick = nextGame;
  $("#blueTeam").onchange = (e) => { S.blueTeam = e.target.value; refresh(); };
  $("#redTeam").onchange = (e) => { S.redTeam = e.target.value; refresh(); };
  $("#us").onchange = (e) => {
    if (S.solo && !e.target.value) { e.target.value = S.us || "B"; return toast("Solo queue needs your side: Blue or Red"); }
    S.us = e.target.value; S.sideChosen = true; refresh();
  };
  $("#skipBans").onchange = (e) => { S.skipBans = e.target.checked; refresh(); };
  $("#fpSide").onchange = (e) => { S.fpSide = e.target.value; refresh(); };
  $("#soloMode").onchange = (e) => {
    S.solo = e.target.checked;
    if (S.solo) {
      if (!S.us) S.us = "B";
      if (!S.myRole) S.myRole = POOL?.main_role || "MID";
      S.banStage = S.typeBans && !S.blue.length && !S.red.length && S.blueBans.length + S.redBans.length < 10;
      toast(`Solo queue: you're ${SIDE[S.us]} side, playing ${ROLE_NAME[S.myRole]}. Change either above.`);
    } else S.banStage = false;
    refresh();
  };
  $("#myRole").onchange = (e) => { S.myRole = e.target.value; refresh(); };
  $("#mySlot").onchange = (e) => { S.slot = e.target.value; refresh(); };
  $("#poolOn").onchange = (e) => { S.poolOn = e.target.checked; pushPrefs(); refresh(); };
  $("#phoneBtn").onclick = openPhone;
  $("#leagueBtn").onclick = openLeague;
  $("#trackerBtn").onclick = openTracker;
  wireSegs();
  $("#followOn").onchange = (e) => {
    S.follow = e.target.checked;
    saveState();
    toast(S.follow ? "Following your League client: the board fills itself in" : "Not following the client: type the draft yourself");
    if (S.follow && CL.st) applyClient(CL.st, true);
    else { clearTurn(); renderClient(); if (RES) render(); }
  };
}

/* the big one-click buttons for your side, role and pick order: each row stands for a dropdown kept out
   of sight, which still holds the value (so everything else reads it as before) */
function wireSegs() {
  document.querySelectorAll(".seg[data-for]").forEach((g) => {
    const sel = document.getElementById(g.dataset.for);
    g.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-v]");
      if (!b || !sel || b.classList.contains("on")) return;
      sel.value = b.dataset.v;
      sel.dispatchEvent(new Event("change"));
      syncSegs();
    });
  });
  syncSegs();
}
function syncSegs() {   // light the button of each row's current value
  document.querySelectorAll(".seg[data-for]").forEach((g) => {
    const v = document.getElementById(g.dataset.for)?.value ?? "";
    g.querySelectorAll("button[data-v]").forEach((b) => {
      const on = b.dataset.v === v;
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
    });
  });
}

/* --------------------------------------------------------- solo queue */
async function loadPool() {
  try { POOL = await (await fetch("/api/my-pool")).json(); } catch (e) { POOL = null; }
}
function myChamps() {   // your champions for your role, minus the ones you switched off
  return (POOL?.roles?.[S.myRole] || []).map(([c]) => c).filter((c) => !S.poolOff.includes(c));
}
function renderPool() {
  const bar = $("#soloBar");
  document.body.classList.toggle("solo", !!S.solo);
  bar.hidden = !S.solo;
  if (!S.solo) return;
  if (!ROLE_NAME[S.myRole]) S.myRole = POOL?.main_role || "MID";   // (solo queue always has a role)
  $("#myRole").value = S.myRole;
  $("#mySlot").value = S.slot || "";
  $("#poolOn").checked = !!S.poolOn;
  syncSegs();
  const list = POOL?.roles?.[S.myRole] || [];
  const el = $("#poolChips");
  let html;
  if (!POOL?.riot_id || !POOL.games) {
    html = `No champion list yet: compare your account on <a href="./">Player Search</a> (with "Remember" ticked) and it fills in here.`;
  } else if (!list.length) {
    html = `${esc(POOL.riot_id)} has no ${ROLE_NAME[S.myRole] || ""} games in the last ${POOL.games}, so every champion is suggested.`;
  } else {
    // one line of your champions; when it's wider than the bar it slides slowly back and forth (hover pauses it)
    html = `<div class="pool-track">${list.map(([c, n]) => `<span class="chip ${S.poolOff.includes(c) ? "off" : ""}" data-c="${esc(c)}"
      title="${n} game${n === 1 ? "" : "s"} as ${ROLE_NAME[S.myRole]} · click to ${S.poolOff.includes(c) ? "include" : "leave out"}">${img(champImg(c), c)}${esc(c)} <span class="n">${n}</span></span>`).join("")}
      <span class="pool-src" title="Updated each time you compare your account on Player Search">from ${esc(POOL.riot_id)}'s last ${POOL.games} games</span></div>`;
  }
  if (el.dataset.html !== html) {   // only rebuild when it changed, so the sliding doesn't restart after every pick
    el.dataset.html = html;
    el.innerHTML = html;
    el.querySelectorAll(".chip[data-c]").forEach((ch) => {
      ch.onclick = () => {
        const c = ch.dataset.c;
        S.poolOff = S.poolOff.includes(c) ? S.poolOff.filter((x) => x !== c) : [...S.poolOff, c];
        pushPrefs();   // (the same on your phone)
        refresh();
      };
    });
    if (POOL_RO) {   // re-measure whenever the bar or the line changes size (window, fonts loading in)
      POOL_RO.disconnect();
      POOL_RO.observe(el);
      const tr = el.querySelector(".pool-track");
      if (tr) POOL_RO.observe(tr);
    }
  }
  fitPool();
}
const POOL_RO = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => fitPool()) : null;
function fitPool() {   // slide the champion line only when it doesn't fit; slower for a longer line
  const box = $("#poolChips"), track = box.querySelector(".pool-track");
  let over = 0;
  if (track && !$("#soloBar").hidden) {
    const cs = getComputedStyle(track);   // leave out the side padding that's only there while sliding
    over = track.offsetWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - box.clientWidth;
  }
  box.classList.toggle("moving", over > 4);
  if (over > 4) {
    const shift = `${-Math.round(over)}px`;
    if (track.style.getPropertyValue("--shift") !== shift) {
      track.style.setProperty("--shift", shift);
      track.style.setProperty("--dur", `${Math.max(5, over / 24).toFixed(1)}s`);   // ~32 px a second while moving
    }
  }
}

/* ------------------------------------------------------------- actions */
function lock(name, role = null, fromRec = false) {
  if (!RES) return;
  if (busy) {
    queue.push([name, role, fromRec]);
    $("#champInput").value = "";
    updateSuggest();
    return;
  }
  const nxt = RES.next;
  if (used().has(name)) return toast(`${name} is not available`);
  CLEARED = null;   // a new draft has started: Undo no longer brings the cleared one back
  if (SWAP) {   // swapping a pick: replace it in place, keep its slot (and your own pick's role)
    const arr = SWAP.side === "B" ? S.blue : S.red, old = arr[SWAP.idx];
    SWAP = null;
    if (old) {
      const keep = old.me || old.manual;
      arr[arr.indexOf(old)] = { champ: name, role: keep ? old.role : null, ...(old.me ? { me: true } : {}), ...(old.manual ? { manual: true } : {}) };
      toast(`Swapped ${old.champ} for ${name}`);
      $("#champInput").placeholder = "Search a champion: a few letters, then Enter";
      $("#champInput").value = "";
      updateSuggest();
      renderTeams(true);
      return refresh();
    }
  }
  if (S.loaded) {   // loading screen / game started: no bans, your team's 5 then the enemy's 5
    const side = loadSide();
    if (!side) return toast("All 10 champions are in. Swap or remove one, or ✕ Clear draft for a new game.");
    (side === "B" ? S.blue : S.red).push({ champ: name, role: null });
    S.history.push({ t: "pick", side });
    $("#champInput").value = "";
    updateSuggest();
    renderTeams(true);
    return refresh(true);
  }
  if (!nxt) return toast("Draft complete. Undo a step, or press Next game.");
  let side = nxt.side;
  if (nxt.action === "ban") {
    if (S.solo) {   // solo queue: the 10 bans in any order, shown 5 a side
      side = S.blueBans.length <= S.redBans.length ? "B" : "R";
      if (S.blueBans.length + S.redBans.length >= 9) S.banStage = false;
    }
    (side === "B" ? S.blueBans : S.redBans).push(name);
  } else {
    const pick = { champ: name, role };
    // solo queue: on your turn the pick is yours (typed picks count only when you've set your pick number)
    if (S.solo && RES.solo_turn === "me" && (S.slot || fromRec)) Object.assign(pick, { role: S.myRole, me: true });
    (side === "B" ? S.blue : S.red).push(pick);
  }
  S.history.push({ t: nxt.action, side });
  $("#champInput").value = "";
  updateSuggest();
  renderTeams(true);   // show the champion on the board right away; the advice follows a moment later
  refresh(true);
}
function loadSide() {   // loading-screen mode: which team's champions are being typed now (yours first)
  const first = S.us === "R" ? "R" : "B", second = first === "B" ? "R" : "B";
  const n = (s) => (s === "B" ? S.blue : S.red).length;
  return n(first) < 5 ? first : n(second) < 5 ? second : null;
}
function lockTop() {
  if (busy) { queue.push(["__top__", null]); return; }
  if (S.loaded) return toast("Type a champion's name");
  if (!RES || !RES.next) return toast("Draft complete.");
  if (S.solo && RES.next.action === "ban") { S.banStage = false; return refresh(); }   // Enter on empty = bans done
  if (RES.next.action === "ban" && RES.bans?.length) return lock(RES.bans[0].champ, null, true);
  if (RES.recs?.length) return lock(RES.recs[0].champ, RES.recs[0].role, true);
  toast("Type a champion name first");
}
function markBanned(name) {   // solo queue: a champion banned in your game, added any time (one click on a suggestion)
  if (!name || used().has(name)) return;
  if (S.blueBans.length + S.redBans.length >= 10) return toast("All 10 bans are in already");
  const side = S.blueBans.length <= S.redBans.length ? "B" : "R";
  (side === "B" ? S.blueBans : S.redBans).push(name);
  S.history.push({ t: "ban", side });
  CLEARED = null;
  toast(`${name} marked as banned`);
  $("#champInput").value = "";
  updateSuggest();
  renderTeams(true);
  refresh();
}
function clearDraft() {   // empty the board (bans, picks) but keep your settings; Undo brings it back
  const had = S.blue.length + S.red.length + S.blueBans.length + S.redBans.length;
  if (had) CLEARED = JSON.parse(JSON.stringify(S));
  SWAP = null;
  S = freshState(S);
  refresh();
  if (had) toast("Draft cleared: ready for the next game.", { action: "Undo", run: undo });
}
function removeAt(kind, side, idx) {   // take out one pick or ban anywhere in the draft
  const before = JSON.parse(JSON.stringify(S));   // (the toast's Undo puts it back)
  const arr = kind === "ban" ? (side === "B" ? S.blueBans : S.redBans) : (side === "B" ? S.blue : S.red);
  const [gone] = arr.splice(idx, 1);
  if (!gone) return;
  // drop that side's newest matching step too, so Undo keeps taking back what's left
  for (let i = S.history.length - 1; i >= 0; i--) {
    if (S.history[i].t === kind && S.history[i].side === side) { S.history.splice(i, 1); break; }
  }
  SWAP = null;
  CLEARED = null;
  toast(`${kind === "ban" ? `Ban on ${gone}` : gone.champ} removed: type a champion to fill the gap`, {
    action: "Undo", run: () => { S = before; SWAP = null; refresh(); } });
  refresh();
}
function startSwap(side, idx) {
  if (SWAP && SWAP.side === side && SWAP.idx === idx) return cancelSwap();
  SWAP = { side, idx };
  const p = (side === "B" ? S.blue : S.red)[idx];
  renderTeams();
  renderPhase();
  const input = $("#champInput");
  input.placeholder = `Type the champion to put in place of ${p.champ} (Esc cancels)`;
  input.value = "";
  updateSuggest();
  input.focus();
}
function cancelSwap() {
  SWAP = null;
  $("#champInput").placeholder = "Search a champion: a few letters, then Enter";
  renderTeams();
  renderPhase();
}
function undo() {
  if (SWAP) return cancelSwap();
  if (!S.history.length && CLEARED) {   // Undo right after Clear draft: bring the draft back
    S = CLEARED; CLEARED = null;
    refresh();
    return toast("Draft brought back", { kind: "good" });
  }
  const h = S.history.pop();
  if (!h) return toast("Nothing to undo");
  if (h.t === "ban" && S.solo && S.typeBans && !S.blue.length && !S.red.length) S.banStage = true;
  if (h.t === "ban") (h.side === "B" ? S.blueBans : S.redBans).pop();
  else (h.side === "B" ? S.blue : S.red).pop();
  refresh();
}
function nextGame() {
  const picks = [...S.blue, ...S.red].map((p) => p.champ);
  if (picks.length < 10 && !confirm("This game's draft isn't finished. Lock its picks for Fearless anyway?")) return;
  S.fearless = [...new Set([...S.fearless, ...picks])];
  Object.assign(S, { blue: [], red: [], blueBans: [], redBans: [], history: [], game: (S.game || 1) + 1, replay: null, asOf: null });
  refresh();
  toast(`Game ${S.game}: ${picks.length} champions locked by Fearless`);
}
function cycleRole(side, idx) {
  const arr = side === "B" ? S.blue : S.red;
  const p = arr[idx];
  const cur = p.role || roleMap(side)[p.champ] || "TOP";
  p.role = ROLES[(ROLES.indexOf(cur) + 1) % ROLES.length];
  p.manual = true;
  refresh();
}

async function refresh(afterLock = false) {
  if (busy) { pending = true; return; }
  busy = true;
  $("#analysis").classList.add("loading");
  try {
    const body = {
      blue: S.blue, red: S.red, blueBans: S.blueBans, redBans: S.redBans, fearless: S.fearless,
      blueTeam: S.blueTeam || null, redTeam: S.redTeam || null, us: S.us || null, skipBans: S.skipBans,
      fpSide: S.fpSide || null, asOf: S.asOf || null,
    };
    if (S.loaded) Object.assign(body, { skipBans: true, blueBans: [], redBans: [] });
    else if (S.solo) Object.assign(body, {
      solo: true, us: S.us || "B", role: S.myRole || "MID", slot: S.slot ? Number(S.slot) : null,
      pool: S.poolOn && myChamps().length ? myChamps() : null, banStage: !!S.banStage, skipBans: true,
      now: clientNow(),   // from the League client: is your own pick in progress right now?
      keep: following() ? (CL.hover[S.us] || []).filter(Boolean) : [],   // teammates' planned picks: don't suggest banning them
      hover: following() && CL.cs.turn?.mine ? CL.myHover : null,         // what you're hovering: how it ranks
    });
    const r = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await r.json();
    if (!r.ok) {
      toast(data.error || "Server error");
      if (afterLock) { const h = S.history.pop(); if (h) (h.t === "ban" ? (h.side === "B" ? S.blueBans : S.redBans) : (h.side === "B" ? S.blue : S.red)).pop(); }
      if (RES) renderTeams();   // take back a champion that was drawn before the server answered
    } else {
      RES = data;
      render();
    }
  } catch (e) {
    toast("Can't reach the server. Is serve.py running?");
  } finally {
    busy = false;
    $("#analysis").classList.remove("loading");
    saveState();
    if (pending) { pending = false; refresh(); }
    else if (queue.length) {
      const [name, role, fromRec] = queue.shift();
      if (name === "__top__") lockTop(); else lock(name, role, fromRec);
    }
  }
}

/* ------------------------------------------------------------ suggest */
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function matches(q) {
  const k = key(q);
  if (!k) return [];
  const u = used(), out = [], seen = new Set();
  const add = (n) => { if (n && BY_NAME[n] && !seen.has(n) && !u.has(n)) { seen.add(n); out.push(BY_NAME[n]); } };
  add(KEY[k]);
  // most likely first, so a few letters + Enter is usually right: the suggestions on screen, what pros pick
  // in this spot, your champions (on your turn), champions for a role still open, then pro presence
  const rank = new Map();
  if (!S.loaded) {   // (loading screen: no turn-by-turn advice to rank by)
    [...(RES?.recs || []), ...(RES?.bans || [])].forEach((x, i) => { if (!rank.has(x.champ)) rank.set(x.champ, i); });
    (RES?.likely_now || []).forEach((x, i) => { if (!rank.has(x[0])) rank.set(x[0], 20 + i); });
  }
  const mine = new Set(S.solo && RES?.solo_turn === "me" && !S.loaded ? myChamps() : []);
  const nxt = RES?.next, fillSide = S.loaded ? loadSide() : nxt?.side;
  const filled = new Set((RES?.draft?.[fillSide]?.picks || []).map((p) => p.role));
  const fits = (c) => !fillSide || (!S.loaded && nxt?.action !== "pick") || c.roles.some((r) => !filled.has(r));
  const score = (c) => [rank.has(c.name) ? rank.get(c.name) : 99, mine.has(c.name) ? 0 : 1, fits(c) ? 0 : 1, -c.presence];
  const cmp = (a, b) => { const x = score(a), y = score(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
  const pool = [...CHAMPS].sort(cmp);
  pool.filter((c) => key(c.name).startsWith(k)).forEach((c) => add(c.name));
  Object.entries(ALIAS).filter(([a]) => key(a).startsWith(k)).forEach(([, n]) => add(n));
  pool.filter((c) => key(c.name).includes(k)).forEach((c) => add(c.name));
  if (out.length < 3 && k.length >= 3) {
    pool.map((c) => [lev(k, key(c.name).slice(0, k.length + 1)), c]).filter(([d]) => d <= 2)
      .sort((a, b) => a[0] - b[0]).forEach(([, c]) => add(c.name));
  }
  return out.slice(0, 8);
}
function splitNames(q) {   // "zed yas lee sin" -> Zed, Yasuo, Lee Sin: several champions typed in one go
  if (!/[\s,;]/.test(q.trim())) return null;
  const k = key(q);
  // one champion with a space in its name ("lee sin", "miss f") stays one champion
  if (CHAMPS.some((c) => key(c.name).startsWith(k)) || Object.keys(ALIAS).some((a) => key(a).startsWith(k))) return null;
  const words = q.split(/[\s,;]+/).filter((w) => key(w));
  const out = [], u = used();
  for (let i = 0; i < words.length;) {
    const two = i + 1 < words.length ? KEY[key(words[i] + words[i + 1])] : null;
    if (two && !u.has(two) && !out.includes(two)) { out.push(two); i += 2; continue; }
    const hit = matches(words[i]).find((c) => !out.includes(c.name));
    if (!hit) return null;   // a word that isn't a champion: leave it to the normal box
    out.push(hit.name); i++;
  }
  return out.length > 1 ? out : null;
}
let MULTI = null;   // the champions in the box when several are typed at once
function updateSuggest() {
  const q = $("#champInput").value;
  MULTI = splitNames(q);
  sugg = MULTI ? [] : matches(q);
  suggIdx = 0;
  renderSuggest();
}
function renderSuggest() {
  const ul = $("#suggest");
  if (MULTI) {
    const ban = S.solo && !S.loaded && RES?.next?.action !== "ban" && S.blueBans.length + S.redBans.length + MULTI.length <= 10
      ? " · Shift+Enter = all banned" : "";
    ul.innerHTML = `<li class="active multi">${MULTI.map((n) => img(champImg(n), n)).join("")}
      <span>${MULTI.map(esc).join(", ")}</span><span class="enter">↵ Enter locks all ${MULTI.length}${ban}</span></li>`;
    ul.classList.add("open");
    ul.querySelector("li").onmousedown = (e) => {
      e.preventDefault();
      const names = MULTI;
      $("#champInput").value = "";
      updateSuggest();
      names.forEach((n) => lock(n));
    };
    return;
  }
  if (!sugg.length) { ul.classList.remove("open"); ul.innerHTML = ""; return; }
  ul.innerHTML = sugg.map((c, i) => `<li class="${i === suggIdx ? "active" : ""}" data-name="${esc(c.name)}">
      ${img(champImg(c.name), c.name)}<span>${esc(c.name)}</span>
      <span class="meta">${c.roles.map((r) => ROLE_NAME[r]).join(" / ") || "no pro games"} · ${pct(c.presence)}</span>${i === suggIdx ? '<span class="enter">↵ Enter</span>' : ""}</li>`).join("");
  ul.classList.add("open");
  ul.querySelectorAll("li").forEach((li) => { li.onmousedown = (e) => { e.preventDefault(); lock(li.dataset.name); }; });
}

/* ------------------------------------------------------------- render */
function renderReplay() {
  const bar = $("#replayBar");
  if (!S.replay) { bar.hidden = true; return; }
  bar.hidden = false;
  bar.innerHTML = `<span>🎬 Replaying <b>${esc(S.replay.title)}</b></span>
    <span>Winner: <b>${esc(S.replay.winner)}</b></span>
    ${S.replay.pre ? `<span class="muted">AI before the game: ${esc(S.replay.pre)}</span>` : ""}
    <span class="muted">AI sees only games before this one · Undo to rewind</span><button id="leaveReplay">Leave replay</button>`;
  $("#leaveReplay").onclick = () => { S = freshState(); refresh(); };
}

function syncSettings() {
  for (const [id, val] of [["#blueTeam", S.blueTeam], ["#redTeam", S.redTeam]]) {
    const el = $(id);
    if (val && ![...el.options].some((o) => o.value === val)) el.add(new Option(val, val));
    el.value = val || "";
  }
  $("#us").value = S.us || "";
  $("#fpSide").value = S.fpSide || "";
  $("#skipBans").checked = !!S.skipBans;
  $("#soloMode").checked = !!S.solo;
  syncSegs();
}

function renderStart() {   // a new draft: which team are you on? (then you only type champions)
  const card = $("#startCard");
  const empty = !S.blue.length && !S.red.length && !S.blueBans.length && !S.redBans.length;
  const show = empty && !S.sideChosen && !S.replay;
  card.hidden = !show;
  $("#phase").hidden = show;
  $("#clock").hidden = show || !following() || !CL.deadline;
  const waiting = show && S.follow && CL.st?.status === "on" && !CL.manual;
  document.body.classList.toggle("waiting", waiting);   // (the phone shows only the waiting card then)
  if (!show) return;
  if (waiting) return waitingCard(card);   // the client fills it in
  const slots = S.solo && !S.loaded ? `<div class="row"><span>Your pick number in champ select:</span>
      ${[1, 2, 3, 4, 5].map((n) => `<button class="slot-btn ${String(S.slot) === String(n) ? "on" : ""}" data-slot="${n}">${n}</button>`).join("")}
      <button class="slot-btn ${!S.slot ? "on" : ""}" data-slot="">Not sure</button></div>` : "";
  const bans = S.solo && !S.loaded ? `<div class="row"><span>Bans:</span>
      <button class="slot-btn ${S.typeBans ? "" : "on"}" data-bans="skip" title="Go straight to the picks. If a suggestion turns out to be banned, click ⊘ on it.">Skip, straight to picks</button>
      <button class="slot-btn ${S.typeBans ? "on" : ""}" data-bans="type" title="Type the 10 bans first (several at once works: zed yas lee)">Type the 10 bans</button></div>` : "";
  const how = S.loaded
    ? "Skip the bans: type your team's 5 champions, then the enemy's 5 (a few letters, then Enter). You get the win chance and each team's ways to win and lose."
    : S.solo
      ? `Solo queue · you play ${esc(ROLE_NAME[S.myRole] || "?")}. After that, just type each champion as it's ${S.typeBans ? "banned or " : ""}picked: a few letters, then Enter.${S.typeBans ? "" : " A suggestion that's banned in your game: click ⊘ on it."}`
      : "After that, just type each champion as it's picked: a few letters, then Enter.";
  card.innerHTML = `<div class="row modes">
      <button class="mode-btn ${S.loaded ? "" : "on"}" data-mode="draft">Champ select<small>bans and picks, the best pick each turn</small></button>
      <button class="mode-btn ${S.loaded ? "on" : ""}" data-mode="loaded">Loading screen / in game<small>skip bans: just the 10 champions</small></button>
    </div>
    <h2>Which team are you on?</h2>
    <p>${how}</p>
    ${slots}
    ${bans}
    <div class="row">
      <button class="team-btn blue" data-us="B">BLUE<small>left side · picks first</small></button>
      <button class="team-btn red" data-us="R">RED<small>right side · picks second</small></button>
      ${S.solo ? "" : `<button class="team-btn" data-us="">BOTH<small>just analysing</small></button>`}
    </div>`;
  card.querySelectorAll("[data-slot]").forEach((b) => {
    b.onclick = () => { S.slot = b.dataset.slot; saveState(); renderPool(); renderStart(); };
  });
  card.querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => { S.loaded = b.dataset.mode === "loaded"; saveState(); renderStart(); };
  });
  card.querySelectorAll("[data-bans]").forEach((b) => {   // remembered for the next drafts
    b.onclick = () => { S.typeBans = b.dataset.bans === "type"; saveState(); renderStart(); };
  });
  card.querySelectorAll("[data-us]").forEach((b) => {
    b.onclick = () => {
      S.us = b.dataset.us; S.sideChosen = true;
      S.banStage = S.solo && !S.loaded && S.typeBans;
      refresh();
      $("#champInput").focus({ preventScroll: true });   // (the draft stays in view: the box is right under it)
    };
  });
}

function render() {
  syncSettings();
  renderPool();
  renderStart();
  renderReplay();
  renderPhase();
  renderTeams();
  renderWinbar();
  renderRecs();
  renderGrid();
  renderMyBuild();
  renderAnalysis();
  $("#gameNo").textContent = `Game ${S.game || 1}`;
  $("#fearlessList").innerHTML = S.fearless.length ? S.fearless.map((c) => chip(c)).join("") : "none";
}

function renderPhase() {
  syncFlags();
  const el = $("#phase");
  const nxt = RES.next;
  el.className = "phase";
  const sw = SWAP && (SWAP.side === "B" ? S.blue : S.red)[SWAP.idx];
  if (sw) {
    el.classList.add(`side-${SWAP.side}`);
    el.innerHTML = `<span>SWAP ${esc(sw.champ.toUpperCase())}</span><span class="sub">type the replacement · Esc cancels</span>`;
    return;
  }
  if (following()) return clientPhase(el);
  const q = S.follow && CL.st?.status === "on" ? CL.st.phase : "";
  if (q === "Matchmaking" || q === "ReadyCheck") {   // queued again with last game's board still up
    el.innerHTML = q === "Matchmaking"
      ? `<span>IN QUEUE</span><span class="sub"><span class="qclock">0:00</span> · the next champ select replaces this board</span>`
      : `<span>MATCH FOUND</span><span class="sub">accept it in the client</span>`;
    tickQueue();
    return;
  }
  if (S.loaded) {
    const side = loadSide();
    if (!side) { el.innerHTML = `<span>ALL 10 IN</span><span class="sub">win chance and ways to win below</span>`; return; }
    const arr = side === "B" ? S.blue : S.red;
    el.classList.add(`side-${side}`);
    el.innerHTML = `<span>${SIDE[side].toUpperCase()} ${arr.length}/5</span>
      <span class="sub">loading screen · type ${S.us === side ? "your team's" : S.us ? "the enemy's" : `${SIDE[side]}'s`} champions</span>`;
    return;
  }
  if (!nxt) { el.innerHTML = `<span>DRAFT COMPLETE</span><span class="sub">verdict below${S.solo ? "" : " · Next game for Fearless"}</span>`; return; }
  el.classList.add(`side-${nxt.side}`);
  if (S.solo && nxt.action === "ban") {
    const n = S.blueBans.length + S.redBans.length;
    el.innerHTML = `<span>BANS ${n}/10</span><span class="sub">several at once: zed yas lee · Enter on an empty box = picks
      <button class="done-bans" id="doneBans" title="Start the picks now (any bans you skip can be marked later with ⊘ on a suggestion)">Start picks ▸</button></span>`;
    $("#doneBans").onclick = () => { S.banStage = false; refresh(); };
    return;
  }
  const phase = S.solo ? "Solo queue" : nxt.seq && nxt.seq <= 12 ? "Phase 1" : "Phase 2";
  const code = nxt.action === "pick" ? ` · ${nxt.side}${nxt.n}` : "";
  const who = { me: " · your pick", teammate: " · a teammate's pick", enemy: " · enemy pick" }[RES.solo_turn] || "";
  el.innerHTML = `<span>${SIDE[nxt.side].toUpperCase()} ${nxt.action.toUpperCase()} ${nxt.n}</span>
    <span class="sub">${phase}${code}${who}${nxt.double ? " · double pick" : ""}</span>`;
}

function renderTeams(instant = false) {   // instant: draw a just-typed champion before the server answers
  document.body.classList.toggle("swapping", !!SWAP);
  const nxt = instant ? null : RES.next;
  const likely = RES.plan?.their_likely || {};
  const likelySide = RES.plan_side ? (RES.plan_side === "B" ? "R" : "B") : null;
  const taken = used(), present = new Set();
  for (const side of ["B", "R"]) {
    const lower = side === "B" ? "blue" : "red";
    const bans = side === "B" ? S.blueBans : S.redBans;
    const picks = side === "B" ? S.blue : S.red;
    $(`#${lower}TeamName`).textContent = (side === "B" ? S.blueTeam : S.redTeam) || "";
    let bh = "";
    for (let i = 0; i < 5; i++) {
      const c = bans[i];
      const cur = nxt && nxt.side === side && nxt.action === "ban" && i === bans.length;
      const fx = c ? born(`ban${side}${i}${c}`, present) : { cls: "", css: "" };
      bh += `<div class="ban ${c ? "filled" : ""}${fx.cls} ${cur ? "current" : ""}" ${c ? `data-side="${side}" data-idx="${i}"` : ""}
        title="${esc(c ? `${c}: click to remove this ban` : "ban " + (i + 1))}"
        style="${fx.css}${c ? `background-image:url('${champImg(c)}')` : ""}"></div>`;
    }
    $(`#${lower}Bans`).innerHTML = bh;
    const roles = roleMap(side);
    const ghosts = side === likelySide && !S.loaded ? Object.entries(likely).filter(([, [c]]) => !taken.has(c)) : [];
    // each pick sits in its own row: picks from the League client carry their slot (a teammate can lock
    // before the player above them), typed picks fill the rows from the top
    const rows = new Array(5).fill(null);
    picks.forEach((p, idx) => {
      let r = p.slot >= 1 && p.slot <= 5 && !rows[p.slot - 1] ? p.slot - 1 : -1;
      if (r < 0) r = rows.findIndex((x) => !x);
      if (r >= 0) rows[r] = { p, idx };
    });
    const live = following();   // the client says who is picking and what teammates are hovering
    let ph = "", g = 0;
    for (let i = 0; i < 5; i++) {
      const p = rows[i]?.p, idx = rows[i]?.idx;
      const cur = live ? !!CL.picking[side]?.[i]
        : S.loaded ? !instant && loadSide() === side && i === picks.length
          : nxt && nxt.side === side && nxt.action === "pick" && i === picks.length;
      const hov = live && !p ? CL.hover[side]?.[i] : null;
      if (p) {
        const role = p.role || roles[p.champ];
        const swapping = SWAP && SWAP.side === side && SWAP.idx === idx;
        const fx = born(`${side}${i}${p.champ}`, present);
        ph += `<div class="pick filled${fx.cls} ${swapping ? "swapping" : ""}" style="${fx.css}--splash:url('${splashImg(p.champ)}')">
          <div class="pick-tools">
            <button class="mini" data-act="swap" data-side="${side}" data-idx="${idx}" title="Swap ${esc(p.champ)}: type another champion for this slot to see the new odds">⇄</button>
            <button class="mini del" data-act="del" data-side="${side}" data-idx="${idx}" title="Remove ${esc(p.champ)} from the draft">✕</button>
          </div>
          <div class="portrait" style="background-image:url('${champImg(p.champ)}')"></div>
          <div><div class="slot">${side}${i + 1}${p.me ? " · you" : ""}</div><div class="cname">${esc(p.champ)}</div>
          <span class="role" data-side="${side}" data-idx="${idx}" title="Click to change role">${ROLE_NAME[role] || (instant ? "…" : "?")}${p.manual ? " ✎" : ""}</span></div></div>`;
      } else if (hov && BY_NAME[hov]) {   // a teammate hovering (or planning) a champion, or you
        const mine = S.slot && String(i + 1) === String(S.slot) && side === S.us;
        ph += `<div class="pick hovering ${cur ? "current" : ""}" title="${mine ? "You're" : "Your teammate is"} hovering ${esc(hov)} in the client">
          <div class="portrait" style="background-image:url('${champImg(hov)}')"></div>
          <div><div class="slot">${side}${i + 1}${mine ? " · you" : ""} · ${cur ? "hovering" : "planning"}</div><div class="cname">${esc(hov)}</div></div></div>`;
      } else if (!cur && g < ghosts.length) {
        const [r, [c, pr]] = ghosts[g++];
        ph += `<div class="pick likely" title="Predicted from pro draft patterns">
          <div class="portrait" style="background-image:url('${champImg(c)}')"></div>
          <div><div class="slot">${side}${i + 1} · likely</div><div class="cname">${esc(c)}</div>
          <span class="muted">${ROLE_NAME[r]} · ${pct(pr)}</span></div></div>`;
      } else {
        ph += `<div class="pick ${cur ? "current" : ""}"><div class="portrait"></div>
          <div><div class="slot">${side}${i + 1}</div><div class="cname muted">${cur ? "Picking…" : ""}</div></div></div>`;
      }
    }
    $(`#${lower}Picks`).innerHTML = ph;
  }
  document.querySelectorAll(".pick .role[data-side]").forEach((el) => {
    el.onclick = () => cycleRole(el.dataset.side, +el.dataset.idx);
  });
  document.querySelectorAll(".pick-tools button").forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      if (b.dataset.act === "del") removeAt("pick", b.dataset.side, +b.dataset.idx);
      else startSwap(b.dataset.side, +b.dataset.idx);
    };
  });
  document.querySelectorAll(".ban.filled[data-side]").forEach((el) => {
    el.onclick = () => removeAt("ban", el.dataset.side, +el.dataset.idx);
  });
  for (const k of BORN.keys()) if (!present.has(k)) BORN.delete(k);   // removed champions flash again if re-added
  BOARD_SEEN = true;
}

function renderWinbar() {
  let pBlue = LAST_P, label = "";
  if (RES.complete) {
    pBlue = RES.verdict.p_blue;
    label = `Blue ${pct1(pBlue)} · Red ${pct1(1 - pBlue)} (final draft)`;
  } else if (RES.recs?.length) {
    const ev = RES.recs[0].evidence;
    const side = RES.acting;
    pBlue = side === "B" ? ev.win_before : 1 - ev.win_before;
    label = S.loaded ? `Blue ${pct1(pBlue)} · Red ${pct1(1 - pBlue)} (so far)`
      : `Blue ${pct1(pBlue)} · Red ${pct1(1 - pBlue)}  →  ${SIDE[side]} ${pct1(ev.win_after)} with ${RES.recs[0].champ}`;
  } else {
    if (RES.p_blue_now != null) pBlue = RES.p_blue_now;
    label = `Blue ${pct1(pBlue)} · Red ${pct1(1 - pBlue)}`;
  }
  LAST_P = pBlue;
  $("#wbBlue").style.width = `${pBlue * 100}%`;
  $("#wbRed").style.width = `${(1 - pBlue) * 100}%`;
  $("#wbLabel").textContent = label;
  $("#bluePct").textContent = pct(pBlue);
  $("#redPct").textContent = pct(1 - pBlue);
  const elo = RES.elo || {};
  $("#wbNote").textContent = RES.model_key === "team"
    ? `Includes team strength: ${S.blueTeam} ${Math.round(elo.B)} vs ${S.redTeam} ${Math.round(elo.R)} rating`
    : RES.model_key === "players" ? "Includes your players' pro records on each champion" : "Draft only: pick both teams for the full model";
}

function renderRecs() {
  const box = $("#recs"), title = $("#recsTitle");
  $("#poolNote").innerHTML = S.loaded ? "" : soloNote();
  if (!RES.next || S.loaded) { title.textContent = ""; box.innerHTML = ""; return; }   // loading screen: no turn-by-turn advice
  const side = SIDE[RES.next.side];
  if (RES.next.action === "ban") {
    title.textContent = S.solo ? "Best bans for you" : `${side} should ban`;
    const hv = following() ? CL.myHover : null;
    box.innerHTML = (RES.bans || []).map((b, i) => `<div class="rec ${i === 0 ? "top" : ""} ${b.champ === hv ? "hovered" : ""}" data-name="${esc(b.champ)}"
      title="${b.likely != null ? `${pct(b.likely)} likely to be picked by them; ` : ""}${signed(b.components.win)} pts win chance for them">
      ${img(champImg(b.champ), b.champ)}<div><div class="rname">${esc(b.champ)}${b.champ === hv ? ' <span class="hov" title="You\'re hovering this ban in the client">HOVER</span>' : ""}</div>
      <div class="rrole">${ROLE_NAME[b.role]} · ${pct(b.evidence.presence)} presence</div>
      <div class="rscore">${b.likely != null ? `${pct(b.likely)} likely` : `threat ${b.rating.toFixed(1)}`}${b.components.win > 0.05 ? ` <span class="rdelta pos">+${b.components.win.toFixed(1)}</span>` : ""}</div></div></div>`).join("");
  } else {
    const mine = S.poolOn && RES.pool && !RES.pool.fallback ? " · your champions" : "";
    title.textContent = {
      me: `Your pick · ${ROLE_NAME[S.myRole]}${mine}`,
      teammate: `Teammate's pick · best for your team (not ${ROLE_NAME[S.myRole]})`,
      enemy: `${side}'s best picks (they're up)`,
    }[RES.solo_turn] || (RES.perspective === "enemy" ? `${side}'s best picks (they're up)` : `${side} should pick`);
    const proTop = new Set((RES.likely_now || []).slice(0, 3).map((x) => x[0]));
    const canBan = S.solo && S.blueBans.length + S.redBans.length < 10 && !following();
    const hv = following() && RES.solo_turn === "me" ? CL.myHover : null;
    box.innerHTML = (RES.recs || []).map((r, i) => {
      const d = r.components.win;
      const pro = proTop.has(r.champ) ? `<span class="pro" title="Also one of the 3 picks pro teams most often make here">PROS</span>` : "";
      const hov = r.champ === hv ? `<span class="hov" title="You're hovering this champion in the client">HOVER</span>` : "";
      const ban = canBan ? `<button class="mini ban-it" data-ban="${esc(r.champ)}" title="${esc(r.champ)} is banned in your game: take it out of the suggestions">⊘</button>` : "";
      const sq = r.evidence.solo ? `<span class="sq" title="Few pro games as ${ROLE_NAME[r.role]} (${r.evidence.games || 0}), so solo queue games help rate it: ${pct(r.evidence.solo.wr)} win rate in ${r.evidence.solo.games.toLocaleString()} high-elo solo queue games. Pro records are untouched.">SOLO Q</span>` : "";
      return `<div class="rec ${i === 0 ? "top" : ""} ${hov ? "hovered" : ""}" data-name="${esc(r.champ)}" data-role="${r.role}">${ban}
        ${img(champImg(r.champ), r.champ)}<div><div class="rname">${esc(r.champ)} ${pro}${sq}${hov}</div>
        <div class="rrole">${ROLE_NAME[r.role]}</div>
        <div class="rscore">${r.rating.toFixed(1)} <span class="rdelta ${d >= 0 ? "pos" : "neg"}">${signed(d)}% win</span></div></div></div>`;
    }).join("");
  }
  box.querySelectorAll(".rec").forEach((el) => { el.onclick = () => lock(el.dataset.name, el.dataset.role || null, true); });
  box.querySelectorAll(".ban-it").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); markBanned(b.dataset.ban); }; });
}

function soloNote() {   // under the suggestions in solo queue: what the champion filter did
  if (!S.solo || !RES?.next || RES.next.action !== "pick") return "";
  const tip = S.blueBans.length + S.redBans.length < 10 && !following()
    ? "Banned in your game? Click <b>⊘</b> on that suggestion, or type it and press Shift+Enter." : "";
  if (RES.solo_turn !== "me") return tip;
  const parts = [];
  const pl = RES.pool;
  if (pl) {
    const role = ROLE_NAME[S.myRole];
    if (pl.fallback) parts.push(`None of your ${role} champions is open, so these are the best ${role} picks overall.`);
    const shown = new Set((RES.recs || []).map((r) => r.champ));
    const better = (pl.best_any || []).filter((x) => !shown.has(x.champ)).map((x) => x.champ);
    if (!pl.fallback && better.length) parts.push(`Best ${role} picks overall: <b>${better.map(esc).join(", ")}</b>.`);
    if (pl.taken?.length) parts.push(`Banned or taken: ${pl.taken.map(esc).join(", ")}.`);
    if (pl.no_pro_data?.length) parts.push(`Too few pro games as ${role} to judge: ${pl.no_pro_data.map(esc).join(", ")}${RES.solo_db ? "" : ' (a <a href="soloq.html">solo queue database</a> would rate them)'}.`);
  }
  if (!S.slot) parts.push("Your pick number isn't set, so champions you type count as teammates' picks: click a suggestion (or press Enter on an empty box) to lock yours.");
  if (tip) parts.push(tip);
  return parts.join(" ");
}

function renderGrid() {
  if (!META) return;
  const q = key($("#champInput").value);
  const u = used();
  const hot = new Set([...(RES?.recs || []), ...(RES?.bans || [])].map((x) => x.champ));
  const list = CHAMPS.filter((c) => (roleFilter === "ALL" || c.roles.includes(roleFilter))
    && (!q || key(c.name).includes(q) || Object.entries(ALIAS).some(([a, n]) => n === c.name && key(a).startsWith(q))));
  $("#grid").innerHTML = list.map((c) => `<div class="cell ${u.has(c.name) ? "used" : ""} ${hot.has(c.name) ? "hot" : ""}"
      data-name="${esc(c.name)}" title="${esc(c.name)} · ${c.roles.map((r) => ROLE_NAME[r]).join("/") || "no pro games"} · ${pct(c.presence)} presence">
      ${c.presence >= 0.25 ? `<span class="pres">${pct(c.presence)}</span>` : ""}${c.games ? '<span class="info" title="Pro profile (or right-click)">i</span>' : ""}
      ${img(champImg(c.name), c.name)}<span>${esc(c.name)}</span></div>`).join("");
  $("#gridCount").textContent = `${list.length} champions`;
  document.querySelectorAll("#roleTabs button").forEach((b) => b.classList.toggle("on", b.dataset.role === roleFilter));
  $("#grid").querySelectorAll(".cell:not(.used)").forEach((el) => { el.onclick = () => lock(el.dataset.name); });
  $("#grid").querySelectorAll(".cell").forEach((el) => {
    el.oncontextmenu = (e) => { e.preventDefault(); openProfile(el.dataset.name); };
    const i = el.querySelector(".info");
    if (i) i.onclick = (e) => { e.stopPropagation(); openProfile(el.dataset.name); };
  });
}

/* ------------------------------------------------------ champion profile */
async function openProfile(name, role = null) {
  const modal = $("#modal"), body = $("#modalBody");
  body.innerHTML = `<p class="muted">Loading ${esc(name)}…</p>`;
  modal.classList.add("open");
  try {
    const q = new URLSearchParams({ name });
    if (role) q.set("role", role);
    const r = await fetch(`/api/champion?${q}`);
    const p = await r.json();
    if (!r.ok || p.error) { body.innerHTML = `<p>${esc(p.error || "No pro games for this champion.")}</p>`; return; }
    const lanes = (lst) => lst.map(([, o, rec]) => chip(o, rec)).join("") || '<span class="muted">not enough games</span>';
    const len = p.length || {};
    body.innerHTML = `<div class="profile-head">${img(champImg(p.champ), p.champ)}<div><h2 id="modalTitle">${esc(p.champ)}</h2>
        <div class="muted">${(p.roles || []).filter(([, s]) => s >= 0.03).map(([r, s]) => `${ROLE_NAME[r]} ${pct(s)}`).join(" · ")}</div></div></div>
      <div class="kv"><b>Meta</b><div>${pct(p.presence)} presence (${pct(p.pick)} pick, ${pct(p.ban)} ban) · ${esc(p.record)} overall as ${ROLE_NAME[p.role]}${p.recent_n ? ` · ${esc(p.recent_record)} recently` : ""}</div>
        <b>Blind pick</b><div>${pct(p.blind_share)} of pro picks came before the enemy laner was known</div>
        <b>Best vs</b><div>${lanes(p.best_lanes || [])}</div><b>Worst vs</b><div>${lanes(p.worst_lanes || [])}</div>
        <b>Partners</b><div>${lanes(p.best_synergy || [])}</div>
        <b>By length</b><div>under 28 min ${esc(len.short?.[0] || "-")} · 28-35 ${esc(len.mid?.[0] || "-")} · over 35 ${esc(len.long?.[0] || "-")}</div></div>
      <div style="margin-top:14px">${buildHTML(p.build)}</div>`;
  } catch (e) { body.innerHTML = "<p>Couldn't load the profile.</p>"; }
}
function closeProfile() {
  $("#modal").classList.remove("open", "phone-modal", "league-modal");
  LG.open = false;
  clearInterval(LG.timer);
  PH.open = false;
  clearInterval(PH.timer);
  if (!PHONE_VIEW) $("#champInput").focus({ preventScroll: true });   // (no jump: the draft at the top stays in view)
}

/* ----------------------------------------------------------- analysis */
function recordWin(rec) {
  const [w, l] = String(rec).split("-").map(Number);
  return w > l;
}
function reasonsHTML(rec) {
  const ev = rec.evidence, k = rec.components, out = [];
  const drv = Object.entries(ev.drivers || {}).filter(([, v]) => Math.abs(v) >= 0.1).sort((a, b) => b[1] - a[1]).slice(0, 3);
  out.push(["Win model", `${pct1(ev.win_before)} → <b>${pct1(ev.win_after)}</b> <span class="delta ${k.win >= 0 ? "pos" : "neg"}">(${signed(k.win)} pts)</span>
    ${drv.length ? `<div class="muted">${drv.map(([n, v]) => `${DRIVER_LABEL[n]} ${signed(v)}`).join(" · ")}</div>` : ""}`]);
  const recent = ev.recent_n ? `${ev.recent_record} recently` : "no recent games";
  out.push(["Meta", `${pct(ev.presence)} presence (${pct(ev.pick)} pick, ${pct(ev.ban)} ban) · ${recent} · ${ev.record} overall`]);
  if (ev.solo) out.push(["Solo queue", `only ${ev.games || 0} pro game${ev.games === 1 ? "" : "s"} in this role, so solo queue counts too: <b>${pct(ev.solo.wr)}</b> win rate in ${ev.solo.games.toLocaleString()} games (<a href="soloq.html#${encodeURIComponent(rec.champ)}/${rec.role}">matchups</a>)`]);
  if (ev.lane) out.push(["Lane", `${ev.lane.record} vs ${esc(ev.lane.opp)}`]);
  if (ev.duo && ev.duo.n >= 3) out.push(["2v2", `${ev.duo.record} vs ${esc(ev.duo.opp)}`]);
  const syn = rec.synergy.filter((s) => s[0] >= 0.015 && s[3] >= 3 && recordWin(s[2])).slice(0, 2);
  if (syn.length) out.push(["Synergy", syn.map((s) => `${s[2]} with ${esc(s[1])}`).join(", ")]);
  const cnt = rec.counters.filter((c) => c[0] >= 0.02 && c[3] >= 3 && recordWin(c[2])).slice(0, 2);
  if (cnt.length) out.push(["Counters", cnt.map((c) => `${c[2]} vs ${esc(c[1])}`).join(", ")]);
  if (rec.fit_notes.length) out.push(["Comp", esc(rec.fit_notes.join("; "))]);
  if (ev.blind_share != null) {
    if (ev.blind_share >= 0.6) out.push(["Draft", `safe blind pick (${pct(ev.blind_share)} of pro picks came before the enemy laner)`]);
    else if (ev.blind_share <= 0.35) out.push(["Draft", `usually a counter-pick (${pct(ev.blind_share)} blind)`]);
  }
  if (k.flex > 0) out.push(["Flex", rec.flex_roles.map((r) => ROLE_NAME[r]).join(" / ")]);
  if (k.denial >= 0.5) out.push(["Denial", "also one of the enemy's best picks"]);
  if (ev.comfort) out.push(["Comfort", ev.comfort.games >= 0.05 ? `${esc(ev.comfort.player)}: ${ev.comfort.record} on it` : `not in ${esc(ev.comfort.player)}'s pro pool`]);
  return `<div class="kv">${out.map(([a, b]) => `<b>${a}</b><div>${b}</div>`).join("")}</div>`;
}

function whyHTML() {
  if (RES.complete) return verdictHTML();
  if (RES.next.action === "ban") {
    const bans = RES.bans || [];
    const own = (RES.own_targets || []).filter((o) => !bans.some((b) => b.champ === o.champ)).slice(0, 4);
    return `<h2>Ban priorities</h2><p class="muted">What ${SIDE[RES.acting === "B" ? "R" : "B"]} would most like to pick right now.</p>
      <ol>${bans.map((b) => `<li>${chip(b.champ, ROLE_NAME[b.role])} ${b.likely != null ? `<b>${pct(b.likely)}</b> likely to be picked · ` : ""}${b.components.win > 0.05 ? `+${b.components.win.toFixed(1)} pts for them · ` : ""}${pct(b.evidence.presence)} presence${b.evidence.lane ? ` · ${b.evidence.lane.record} vs your ${esc(b.evidence.lane.opp)}` : ""}</li>`).join("")}</ol>
      <p class="muted">Ranked by expected damage: how likely they are to pick it × how much it helps them. This matched real pro bans far better than strength alone.</p>
      ${own.length ? `<h3>Keep for yourself</h3>${own.map((o) => chip(o.champ, ROLE_NAME[o.role])).join("")}` : ""}`;
  }
  const best = RES.recs?.[0];
  if (!best) return `<h2>No pick</h2><p>${esc(RES.error || "No pro-proven champion fits the open roles.")}</p>`;
  const then = Object.entries(RES.then || {}).filter(([, xs]) => xs.length);
  const needs = RES.plan?.needs || [];
  const likelyNow = RES.likely_now || [];
  return `<h2>${RES.perspective === "enemy" ? `${SIDE[RES.acting]}'s best pick` : "Why"} ${esc(best.champ)} <span class="muted">(${ROLE_NAME[best.role]})</span></h2>
    <div class="big">${pct1(best.evidence.win_after)}</div><div class="muted">${SIDE[RES.acting]} win chance after this pick</div>
    ${reasonsHTML(best)}
    ${likelyNow.length ? `<h3>Pros in this spot usually pick</h3>${likelyNow.map(([c, r, p]) => chip(c, `${ROLE_NAME[r]} ${pct(p)}`)).join("")}` : ""}
    ${then.length ? `<h3>To finish the comp${needs.length ? ` (needs ${esc(needs.join(", "))})` : ""}</h3>${then.map(([r, xs]) => `<div>${ROLE_NAME[r]}: ${xs.map((x) => chip(x.champ)).join("")}</div>`).join("")}` : ""}
    ${(RES.threats || []).length ? `<h3>Enemy's likely next pick</h3>${RES.threats.map(([c, r, p]) => chip(c, `${ROLE_NAME[r]} ${pct(p)}`)).join("")}` : ""}`;
}

function verdictHTML() {
  const v = RES.verdict, pb = v.p_blue;
  const acc = (v.info?.oos_accuracy || {})[v.model];
  const drivers = (side) => (v.drivers?.[side] || []).filter((d) => d[2] > 0).slice(0, 3)
    .map(([r, c, d]) => chip(c, signed(d))).join("") || '<span class="muted">no clear edges</span>';
  const ci = v.ci ? `<div class="muted">90% range: Blue ${pct(v.ci[0])}-${pct(v.ci[1])}</div>` : "";
  const team = v.team_only != null
    ? `<p>Teams${v.map_side ? " + map side" : ""} alone: <b>Blue ${pct(v.team_only)}</b> (ratings ${Math.round(v.elo.B)} vs ${Math.round(v.elo.R)}). With this draft: <b>${pct(pb)}</b>.</p>` : "";
  return `<h2>Verdict</h2>
    <div class="two"><div><div class="big" style="color:var(--blue)">${pct1(pb)}</div><div class="muted">Blue win chance</div></div>
    <div><div class="big" style="color:var(--red)">${pct1(1 - pb)}</div><div class="muted">Red win chance</div></div></div>
    ${ci}${team}
    <h3>Blue's edges</h3>${drivers("B")}<h3>Red's edges</h3>${drivers("R")}
    ${acc ? `<p class="muted">The win model predicted ${(v.info?.games || 0).toLocaleString()} pro games before their results and called ${pct1(acc)} correctly. Draft is one part of a pro game; execution decides the rest. <a href="lab.html">See the lab report</a>.</p>` : ""}
    ${v.calibration ? `<p class="muted">At this confidence (${esc(v.calibration.bucket)}) the favored side won ${v.calibration.won}/${v.calibration.games} backtested games.</p>` : ""}`;
}

function waysHTML() {   // the finished draft: how each team wins and how it loses
  const plans = RES.plans || {}, pb = RES.verdict?.p_blue ?? 0.5;
  const list = (arr) => arr.map((x) => `<li>${esc(x)}</li>`).join("");
  const col = (s) => {
    const p = plans[s];
    if (!p) return "";
    const you = S.us === s ? `<span class="you">${S.solo ? "your team" : "you"}</span>` : "";
    return `<div class="team-ways ${s}">
      <h3><span>${SIDE[s].toUpperCase()}${you}</span><span class="p">${pct(s === "B" ? pb : 1 - pb)}</span></h3>
      <div class="plan-name">“${esc(p.name)}” · ${esc(p.label.toLowerCase())}</div>
      <h4 class="win">✅ Ways to win</h4><ul>${list(p.win)}</ul>
      <h4 class="lose">❌ Ways to lose</h4><ul>${p.lose.length ? list(p.lose) : '<li class="muted">Nothing stands out.</li>'}</ul>
    </div>`;
  };
  return `<h2>Ways to win and lose</h2>
    <p class="muted">For each team, from how pro games with these champions went. The % is the draft's win chance; how the game is played decides the rest.</p>
    <div class="ways">${col("B")}${col("R")}</div>`;
}

function planHTML(plan, title) {
  if (!plan) return "";
  const likely = Object.entries(plan.their_likely || {});
  return `<h2>${esc(title)}</h2><div class="wincon-name">“${esc(plan.name)}”</div>
    <div class="labels"><span class="label">${esc(plan.label)}</span><span class="label">also ${esc(plan.secondary.toLowerCase())}</span>
      <span class="label tempo-${esc(plan.tempo)}">tempo: ${esc(plan.tempo)}</span>${plan.partial ? '<span class="label">draft in progress</span>' : ""}</div>
    <p class="story">${esc(plan.story)} ${plan.tempo_line ? `<span class="muted">${esc(plan.tempo_line)}</span>` : ""}</p>
    <div class="timeline">
      <div class="phase-row"><b>Early<br>0-14</b><div>${esc(plan.early)}</div></div>
      <div class="phase-row"><b>Mid<br>14-25</b><div>${esc(plan.mid)}</div></div>
      <div class="phase-row"><b>Late<br>25+</b><div>${esc(plan.late)}</div></div>
    </div>
    <div class="two"><div><h3>✅ Win conditions</h3><ol class="cond win">${plan.win.map((w) => `<li>${esc(w)}</li>`).join("")}</ol></div>
      <div><h3>❌ Lose conditions</h3><ol class="cond lose">${plan.lose.length ? plan.lose.map((l) => `<li>${esc(l)}</li>`).join("") : '<li class="muted">Enemy comp not known yet</li>'}</ol></div></div>
    ${plan.tested?.length ? `<h3>📊 Tested in pro games</h3><ul class="tested">${plan.tested.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    ${likely.length ? `<p class="muted">Their side includes the predicted picks: ${likely.map(([r, [c, p]]) => `${esc(c)} (${ROLE_NAME[r]}, ${pct(p)})`).join(", ")}.</p>` : ""}`;
}

/* ------------------------------------------------ live in-game win chance */
const LIVE_NUM = [["kills", "Kills"], ["towers", "Towers"], ["dragons", "Dragons"], ["grubs", "Void Grubs"],
                  ["herald", "Heralds"], ["barons", "Barons taken"], ["inhibs", "Inhibitors"]];
const LIVE_BUFF = [["soul", "Dragon Soul"], ["baron", "Baron buff now"], ["elder", "Elder buff now"]];

function ingameP(st, minute, goldOnly = false) {
  const ig = RES.ingame, feats = ig.features, nState = feats.length - 3;
  const models = goldOnly && ig.gold_models ? ig.gold_models : ig.models;
  const mins = Object.keys(models).map(Number).sort((a, b) => a - b);
  const t = Math.max(mins[0], Math.min(mins[mins.length - 1], minute));
  const lo = Math.max(...mins.filter((m) => m <= t)), hi = Math.min(...mins.filter((m) => m >= t));
  const g = st.gold || 0;
  const x = models === ig.gold_models ? [g, ig.prior, ig.tempo, g * ig.tempo]
    : feats.slice(0, nState).map((f) => st[f] || 0).concat([ig.prior, ig.tempo, g * ig.tempo]);
  const z = (m) => { const mm = models[String(m)]; return mm.b + mm.w.reduce((acc, w, i) => acc + w * x[i], 0); };
  const zz = lo === hi ? z(lo) : (1 - (t - lo) / (hi - lo)) * z(lo) + ((t - lo) / (hi - lo)) * z(hi);
  return 1 / (1 + Math.exp(-zz));
}

function liveHTML() {
  const ig = RES.ingame;
  if (!RES.complete || !ig?.models || !Object.keys(ig.models).length) return "";
  const wi = ig.whatif || {};
  const G = ["-3", "-1.5", "0", "1.5", "3"];
  const rows = Object.entries(wi).map(([m, row]) => `<tr><td>${esc(m)} min</td>${G.map((g) => `<td>${pct(row[g])}</td>`).join("")}</tr>`).join("");
  return `<h2>Live game</h2>
    <p class="muted">Follow the game: enter the score as it stands (Blue minus Red). The win chance comes from the lab's minute-by-minute models, trained on LCK and international games, and starts from this draft's prediction.</p>
    <div class="live-grid">
      <div class="live-inputs" id="live">
        <div class="wide seg" role="group" aria-label="Score detail">
          <button id="lvModeGold" class="on" aria-pressed="true">Gold only</button><button id="lvModeFull" aria-pressed="false">Full score</button></div>
        <label class="wide">Game time <span><b id="lvMinV">15 min</b></span><input type="range" id="lvMin" min="5" max="35" step="1" value="15"></label>
        <label class="wide">Gold difference <span><b id="lvGoldV">even</b></span><input type="range" id="lvGold" min="-10" max="10" step="0.5" value="0"></label>
        <div class="wide live-full" id="lvFull" hidden>
          ${LIVE_NUM.map(([k, l]) => `<label>${l} <input type="number" id="lv_${k}" value="0" step="1" min="-15" max="15" inputmode="numeric"></label>`).join("")}
          ${LIVE_BUFF.map(([k, l]) => `<label>${l} <select id="lv_${k}"><option value="0">nobody</option><option value="1">Blue</option><option value="-1">Red</option></select></label>`).join("")}
        </div>
        <div class="wide"><button id="lvReset">Reset score</button></div>
      </div>
      <div class="live-out"><div class="lv-sum" id="lvSum"></div><div class="big" id="lvP"></div><div class="muted" id="lvNote"></div>
        <div class="winbar mini"><div class="wb-blue" id="lvBlue" style="width:50%"></div><div class="wb-red" id="lvRed" style="width:50%"></div></div></div>
      <div><h3>If the game goes like this</h3>
        <table class="mini"><thead><tr><th>Gold at</th><th>Blue 3k down</th><th>1.5k down</th><th>Even</th><th>1.5k up</th><th>3k up</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="muted">Blue's win chance from the gold difference alone (the lab's gold-only model, which already counts the towers and dragons that usually come with a lead).</p></div>
    </div>`;
}

function bindLive() {
  const root = $("#live");
  if (!root) return;
  let goldOnly = true;
  const setMode = (g) => {
    goldOnly = g;
    $("#lvModeGold").classList.toggle("on", g); $("#lvModeGold").setAttribute("aria-pressed", String(g));
    $("#lvModeFull").classList.toggle("on", !g); $("#lvModeFull").setAttribute("aria-pressed", String(!g));
    $("#lvFull").hidden = g;
    upd();
  };
  const upd = () => {
    const st = { gold: Number($("#lvGold").value) };
    for (const [k] of LIVE_NUM) st[k] = Number($(`#lv_${k}`).value) || 0;
    for (const [k] of LIVE_BUFF) st[k] = Number($(`#lv_${k}`).value) || 0;
    const m = Number($("#lvMin").value);
    $("#lvMinV").textContent = `${m} min`;
    const g = st.gold;
    $("#lvGoldV").textContent = g === 0 ? "even" : `${g > 0 ? "Blue" : "Red"} +${Math.abs(g).toFixed(1)}k`;
    const p = ingameP(st, m, goldOnly), pre = RES.verdict.p_blue;
    $("#lvP").innerHTML = `<div><span class="lv-side">Blue</span> <span style="color:var(--blue)">${pct1(p)}</span></div>
      <div><span class="lv-side">Red</span> <span style="color:var(--red)">${pct1(1 - p)}</span></div>`;
    const d = p - pre;
    $("#lvNote").textContent = `Win chance at ${m} min${goldOnly ? " from the gold difference" : " from the full score"}. Before the game: Blue ${pct1(pre)}` +
      (Math.abs(d) >= 0.005 ? `; ${d > 0 ? "Blue" : "Red"} has gained ${pct1(Math.abs(d))} since.` : ".");
    $("#lvBlue").style.width = `${p * 100}%`;
    $("#lvRed").style.width = `${(1 - p) * 100}%`;
  };
  root.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", upd));
  $("#lvModeGold").onclick = () => setMode(true);
  $("#lvModeFull").onclick = () => setMode(false);
  if (!RES.ingame.gold_models) { $("#lvModeGold").parentElement.hidden = true; goldOnly = false; $("#lvFull").hidden = false; }
  $("#lvReset").onclick = () => {
    $("#lvGold").value = 0;
    for (const [k] of LIVE_NUM) $(`#lv_${k}`).value = 0;
    for (const [k] of LIVE_BUFF) $(`#lv_${k}`).value = 0;
    upd();
  };
  LIVE.upd = upd;
  LIVE.setMode = setMode;
  upd();
  applyLiveCard();   // a game running in your client: its score goes straight in
}
const LIVE = { upd: null, setMode: null, auto: false };
function applyLiveCard() {   // the running game's score (from the client) into the live card's controls
  const g = following() ? null : CL.game;
  const head = $("#liveCard h2");
  if (!$("#live") || !g || !S.follow) { LIVE.auto = false; $("#liveCard").classList.remove("auto"); return; }
  $("#liveCard").classList.add("auto");
  const sum = $("#lvSum");   // the score in one line (the phone shows this instead of the controls)
  if (sum) {
    const lead = (v, what) => `<span class="${v > 0 ? "b" : "r"}">${v > 0 ? "Blue" : "Red"} +${what}</span>`;
    const bits = [`<b>${fmtClock(g.time)}</b>`, g.state.gold ? lead(g.state.gold, `${Math.abs(g.state.gold).toFixed(1)}k gold`) : "gold even"];
    for (const [k, l] of LIVE_NUM) if (g.state[k]) bits.push(lead(g.state[k], `${Math.abs(g.state[k])} ${l.toLowerCase()}`));
    for (const [k, l] of LIVE_BUFF) if (g.state[k]) bits.push(`<span class="${g.state[k] > 0 ? "b" : "r"}">${l}: ${g.state[k] > 0 ? "Blue" : "Red"}</span>`);
    sum.innerHTML = bits.join(" · ");
  }
  const set = (id, v) => { const el = $(id); if (el && String(el.value) !== String(v)) { el.value = v; if (el.type === "range") window.fxFill?.(el); } };
  const st = g.state, mins = g.time / 60;
  set("#lvMin", Math.max(5, Math.min(35, Math.round(mins))));
  set("#lvGold", Math.max(-10, Math.min(10, Math.round(st.gold * 2) / 2)));
  for (const [k] of LIVE_NUM) set(`#lv_${k}`, Math.max(-15, Math.min(15, Math.round(st[k] || 0))));
  for (const [k] of LIVE_BUFF) set(`#lv_${k}`, st[k] > 0 ? 1 : st[k] < 0 ? -1 : 0);
  if (!LIVE.auto) { LIVE.auto = true; LIVE.setMode?.(false); }   // the full score: the client gives all of it
  else LIVE.upd?.();
  if (head) head.innerHTML = `Live game <span class="live-badge" title="Read from the game running on this PC every 2 seconds. Gold is the value of the items each team has bought (the game doesn't show the enemy's gold).">from your game · ${fmtClock(g.time)}${mins < 5 ? " (the model starts at 5 min)" : ""}</span>`;
}

function buildHTML(bd) {
  if (!bd) return "<h2>Runes &amp; items</h2><p class='muted'>No pro games for this champion in this role.</p>";
  return `<h2>Runes · ${esc(bd.champion)} <span class="muted">(${ROLE_NAME[bd.role]}, ${bd.n} pro games)</span></h2>`
    + runesHTML(bd) + spellsHTML(bd) + itemsHTML(bd) + skillsHTML(bd.skills);
}
function runesHTML(bd) {   // the rune page, other keystones, and lane-dependent choices
  const pg = bd.page;
  let h = "";
  if (pg) {
    h += `<div class="runes">
      <div class="tree"><div class="tname">${img(runeImg(pg.primary), pg.primary)}${esc(pg.primary)}</div>
        <div class="rune key">${img(runeImg(pg.keystone), pg.keystone)}${esc(pg.keystone)}</div>
        ${pg.primary_runes.map((r) => `<div class="rune">${img(runeImg(r), r)}${esc(r)}</div>`).join("")}</div>
      <div class="tree"><div class="tname">${img(runeImg(pg.secondary), pg.secondary)}${esc(pg.secondary)}</div>
        ${pg.secondary_runes.map((r) => `<div class="rune">${img(runeImg(r), r)}${esc(r)}</div>`).join("")}
        <div class="muted" style="margin-top:8px">Shards: ${esc((pg.shards || []).join(" · "))}</div></div></div>`;
  }
  const ks = (bd.keystones || []).filter(([, v]) => v >= 0.03);
  if (ks.length) h += `<p class="muted">Keystones: ${ks.map(([k, v]) => `${esc(k)} ${pct(v)}`).join(" · ")}</p>`;
  const kr = bd.keystone_by_range || {};
  if (kr.M && kr.R && kr.M[0] !== kr.R[0]) h += `<p class="muted">Lane-dependent: <b>${esc(kr.M[0])}</b> vs melee, <b>${esc(kr.R[0])}</b> vs ranged</p>`;
  if (bd.vs_runes) h += `<p class="muted">vs ${esc(bd.vs_runes.opp)} (${bd.vs_runes.n} games): ${bd.vs_runes.keystones.map(([k, v]) => `${esc(k)} ${pct(v)}`).join(" · ")}</p>`;
  return h;
}
function spellsHTML(bd) {
  const spells = (bd.spells || []).filter(([, v], i) => i === 0 || v >= 0.05);
  if (!spells.length) return "";
  return `<h3>Summoner spells</h3>${spells.map(([s, v]) => `<div class="spells">${s.split(" + ").map((n) => img(spellImg(n), n)).join("")}<span>${esc(s)} <span class="muted">${pct(v)}</span></span></div>`).join("")}`;
}
function itemsHTML(bd) {   // start, buying order, the other keystone's build, support item, situational
  const tl = bd.order_source === "timeline" ? bd.timeline : null;
  let h = tl ? timelineItemsHTML(bd, tl) : inferredItemsHTML(bd);
  if (bd.items_for) h += `<p class="muted">Items and skills are from games with ${esc(bd.items_for)}, the page shown above.</p>`;
  const ab = bd.alt_build;
  if (ab) {
    h += `<div class="buyrow altbuild"><span class="buylabel">With ${esc(ab.keystone)}<b>${pct(ab.share)} of games</b></span>${img(runeImg(ab.keystone), ab.keystone)}<div class="items small">${ab.items.map((n) => itemTile(n)).join('<span class="arrow">›</span>')}</div></div>`;
  }
  if (bd.support_item) h += `<p class="muted">Support item: ${esc(bd.support_item.item)} (${pct(bd.support_item.share)})</p>`;
  const sit = (bd.situational || []).filter((s) => s.share >= 0.08);
  if (sit.length) {
    h += `<h3>Situational</h3><div class="items">${sit.map((s) => `<div class="item" title="${esc(s.item)}">${img(itemImg(s.item), s.item)}<span>${esc(s.item)}</span><b>${pct(s.share)}${s.note ? " · " + esc(s.note) : ""}</b></div>`).join("")}</div>`;
  }
  return h;
}

const mmss = (t) => (t == null ? "?" : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`);
const mins = (t) => (t == null ? "" : `~${Math.max(1, Math.round(t / 60))} min`);
const comboText = (combo) => combo.map(([n, c]) => (c > 1 ? `${n} ×${c}` : n)).join(" + ");
const itemTile = (n, label = "", extra = "") =>
  `<div class="item" title="${esc(n)}">${img(itemImg(n), n)}<span>${esc(n)}</span>${extra}${label ? `<b>${label}</b>` : ""}</div>`;

// real purchase order from Riot timelines: start, first back, finished items with their minute
function timelineItemsHTML(bd, tl) {
  let h = `<h3>Items <span class="h3note">real purchase order · ${tl.games} LCK/international games</span></h3>`;
  const st = tl.start || [];
  if (st.length) {
    const tiles = st[0].items.map(([n, c]) => itemTile(n, c > 1 ? `×${c}` : "")).join("");
    const alt = st[1] ? `<span class="muted buyalt">or ${esc(comboText(st[1].items))} (${pct(st[1].share)})</span>` : "";
    h += `<div class="buyrow"><span class="buylabel">Start<b>${pct(st[0].share)}</b></span><div class="items small">${tiles}</div>${alt}</div>`;
  }
  const now = tl.start_now;
  if (now && st.length && comboText(now.items) !== comboText(st[0].items)) {
    h += `<p class="muted">vs ${esc(now.opp)} (${now.range === "R" ? "ranged" : "melee"} lane): start <b>${esc(comboText(now.items))}</b> (${pct(now.share)} of ${now.games} games)</p>`;
  }
  const fb = tl.first_back;
  if (fb && (fb.combo || fb.items.length)) {
    const tiles = fb.combo ? fb.combo.map(([n, c]) => itemTile(n, c > 1 ? `×${c}` : "")).join("")
      : fb.items.map(([n, x]) => itemTile(n, pct(x))).join("");
    const share = fb.combo ? `<span class="muted buyalt">${pct(fb.combo_share)} of games</span>` : "";
    h += `<div class="buyrow"><span class="buylabel">First back<b>~${mmss(fb.t)}</b></span><div class="items small">${tiles}</div>${share}</div>`;
  }
  const steps = (tl.order || []).map((s) => {
    const alt = s.alt?.length ? s.alt[0][0] : "";
    const up = s.kind === "boots" ? bd.boots?.upgrade : "";
    const title = `${s.item}${alt ? " / " + alt : ""}${up ? " → later " + up : ""}`;
    return `<div class="item" title="${esc(title)}">${img(itemImg(s.item), s.item)}<span>${esc(s.item)}${alt ? ` <em>or ${esc(alt)}</em>` : ""}</span><i class="when">${mins(s.t)}</i>${s.kind === "boots" ? "" : `<b>${pct(s.share)}</b>`}</div>`;
  });
  if (steps.length) h += `<div class="items order">${steps.join('<span class="arrow">›</span>')}</div>`;
  if (tl.trinket) h += `<p class="muted">Trinket: ${esc(tl.trinket.item)} at ~${mmss(tl.trinket.t)} (${pct(tl.trinket.share)} of games)</p>`;
  return h;
}

// no (or too few) timeline games: build order inferred from final inventories
function inferredItemsHTML(bd) {
  let h = `<h3>Items <span class="h3note">order inferred from final items</span></h3>`;
  const start = bd.start?.length ? bd.start.join(" or ") : ({ TOP: "Doran's Blade", JNG: "jungle pet", MID: "Doran's Ring", BOT: "Doran's Blade", SUP: "World Atlas" }[bd.role]);
  h += `<p><b>Start:</b> ${esc(start)}${bd.start?.length ? "" : ' <span class="muted">(standard start)</span>'}</p>`;
  const steps = [];
  let placed = false;
  const boots = bd.boots;
  const bootsItem = boots ? `<div class="item" title="${esc(boots.item)}${boots.upgrade ? " → " + esc(boots.upgrade) : ""}">${img(itemImg(boots.item), boots.item)}<span>${esc(boots.item)}</span><b>${pct(boots.type_share)} of boots</b></div>` : "";
  (bd.path || []).forEach((p) => {
    steps.push(`<div class="item" title="${esc(p.item)}${p.alt?.length ? " / " + esc(p.alt[0][0]) : ""}">${img(itemImg(p.item), p.item)}<span>${esc(p.item)}${p.alt?.length ? ` / ${esc(p.alt[0][0])}` : ""}</span><b>${pct(p.share)}</b></div>`);
    if (boots && !placed && p.slot >= boots.after_slot) { steps.push(bootsItem); placed = true; }
  });
  if (boots && !placed) steps.push(bootsItem);
  h += `<div class="items">${steps.join('<span class="arrow">›</span>')}</div>`;
  return h;
}

// skill order as the client shows it: one row per ability, one column per level
function skillsHTML(sk) {
  if (!sk || !sk.max?.length || !sk.seq) return "";
  const seq = [...sk.seq];
  let h = `<h3>Skill order <span class="h3note">${sk.games} games with Riot timelines</span></h3>`;
  h += `<div class="skillgrid" style="grid-template-columns:minmax(26px,auto) repeat(${seq.length},minmax(13px,1fr))" role="img" aria-label="Skill order, levels 1 to ${seq.length}: ${seq.join(" ")}">`;
  h += `<div class="hdr"></div>${seq.map((_, i) => `<div class="hdr">${i + 1}</div>`).join("")}`;
  for (const k of "QWER") {
    if (k === "R" && !seq.includes("R")) continue; // e.g. Jayce puts no points in R
    const nm = sk.names?.[k] || "";
    h += `<div class="sk" title="${esc(nm)}">${k}<small>${esc(nm)}</small></div>`;
    h += seq.map((c, i) => `<div class="lv${c === k ? " on" : ""}${k === "R" ? " r" : ""}" title="Level ${i + 1}${c === k ? ": " + k + (nm ? " (" + esc(nm) + ")" : "") : ""}">${c === k ? k : ""}</div>`).join("");
  }
  h += "</div>";
  const parts = [`Start <b>${sk.start.split("").join(" ")}</b> (${pct(sk.start_share)})`, `max <b>${sk.max.join(" › ")}</b>`];
  if (sk.r_levels?.length) parts.push(`R at ${sk.r_levels.join("/")}`);
  if (sk.max_share != null) parts.push(`${sk.max[0]} maxed first in ${pct(sk.max_share)} of games`);
  h += `<p class="muted">${parts.join(" · ")}</p>`;
  return h;
}

function teamBuildsHTML() {
  const tb = RES.team_builds || {};
  let h = "<h2>Builds</h2>";
  for (const side of Object.keys(tb)) {
    h += `<h3>${SIDE[side]}</h3>`;
    for (const r of ROLES) {
      const bd = tb[side][r];
      if (!bd || !bd.page) continue;
      const items = (bd.path || []).slice(0, 3).map((p) => img(itemImg(p.item), p.item)).join("");
      const mx = bd.skills?.max?.length ? `<span class="skmax" title="Skill max order">${bd.skills.max.join("›")}</span>` : "";
      h += `<div class="spells" style="margin:6px 0">${img(champImg(bd.champion), bd.champion)}${img(runeImg(bd.page.keystone), bd.page.keystone)}
        <span class="tbname">${esc(bd.champion)} <span class="muted">${esc(bd.page.keystone)}</span></span>${items}${mx}</div>`;
    }
  }
  return h;
}

/* -------------------------------------------- League client (auto-follow) */
// The server follows your League client (acp/leagueclient.py). This page long-polls /api/client and
// fills the board in by itself: a new draft when champ select starts, each ban and pick as it locks,
// teammates' hovers, whose turn it is and the timer; then the live score while the game runs.
const CL = {
  v: -1, st: null, web: null, cs: null, game: null, manual: false,
  hover: { B: [], R: [] }, picking: { B: [], R: [] }, myHover: null, mine: null,
  deadline: null, total: null, timerSide: null, tick: null, qtick: null, warned: "",
};
const following = () => !!(S.follow && CL.cs && S.clientKey === CL.cs.key);
function clientNow() {   // your pick in progress (true), a teammate's (false), or no word from the client (null)
  return following() && CL.cs.turn?.type === "pick" ? !!CL.cs.turn.mine : null;
}
const fmtClock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

async function clientLoop() {
  for (;;) {
    try {
      const r = await fetch(`/api/client?v=${CL.v}`, { cache: "no-store" });
      if (r.status === 404) { CL.st = { status: "outdated" }; renderClient(); return; }   // an older copy of the server
      const st = await r.json();
      if (!r.ok) {
        if (st.unpaired && PHONE_VIEW) return unpaired();
        CL.st = { status: "error", error: st.error }; renderClient(); return;
      }
      if (CL.web == null) CL.web = st.web;
      else if (st.web && st.web !== CL.web && !$("#champInput").value && !$("#modal").classList.contains("open")) {
        location.reload();   // the page itself was updated: pick up the new version (the draft is saved)
        return;
      }
      applyPrefs(st.prefs);
      const back = CL.st?.status === "server";   // reachable again (the same server may not have moved on)
      if (st.v !== CL.v || back) { CL.v = st.v; applyClient(st, back); }
    } catch (e) {
      if (CL.st?.status !== "server") { CL.st = { status: "server" }; renderClient(); syncFlags(); }
      CL.v = -1;   // (so the first answer once it's back comes at once, not after the next change)
      await new Promise((res) => setTimeout(res, 2000));
    }
  }
}

function unpaired() {   // phone mode: this phone's pairing was reset on the PC. The page then says how to pair again.
  let last = 0;
  try { last = Number(sessionStorage.getItem("acp-unpaired")) || 0; sessionStorage.setItem("acp-unpaired", String(Date.now())); } catch (e) { /* */ }
  if (Date.now() - last > 30000) return location.reload();
  CL.st = { status: "error", error: "this phone isn't paired any more: on your PC click Phone and scan the code" };
  renderClient();
}

function applyClient(st, force = false) {
  CL.st = st;
  CL.cs = st.status === "on" && st.phase === "ChampSelect" && st.champ_select ? st.champ_select : null;
  CL.game = st.status === "on" && st.game ? st.game : null;
  renderClient();
  syncFlags();
  keepAwake();
  if (PH.open && (st.phone?.watching || 0) !== PH.watching) refreshPhone();   // a phone just connected (or left)
  if (!RES) return;
  if (S.follow && CL.cs) return followDraft(CL.cs, force);
  clearTurn();
  if (S.follow && CL.game && followGame(CL.game)) return;
  renderStart(); renderPhase(); renderTeams(); renderRecs();
  applyLiveCard();
}

function clearTurn() {
  CL.hover = { B: [], R: [] }; CL.picking = { B: [], R: [] }; CL.myHover = null; CL.mine = null; CL.deadline = null;
  startClock();
}

function draftFromClient(cs) {   // the board as the client has it: bans, locked picks (with their slots), your role
  const seen = new Set();
  const bans = (side) => cs.bans[side].filter((c) => BY_NAME[c] && !seen.has(c) && seen.add(c)).slice(0, 5);
  const blueBans = bans("B"), redBans = bans("R");
  const picks = (side) => cs.picks[side].filter((p) => p.champ && BY_NAME[p.champ] && !seen.has(p.champ) && seen.add(p.champ))
    .map((p) => (p.me ? { champ: p.champ, role: p.role || S.myRole || null, slot: p.slot, me: true }
      : { champ: p.champ, role: p.role || null, slot: p.slot }));
  return {
    us: cs.side, myRole: cs.me.role || S.myRole || "MID", slot: cs.me.slot ? String(cs.me.slot) : "",
    blueBans, redBans, blue: picks("B"), red: picks("R"),
    banStage: cs.stage === "planning" || cs.stage === "bans",
  };
}

function followDraft(cs, force) {
  let fresh = false;
  if (S.clientKey !== cs.key) {   // a new champ select: a new board (Undo brings the old one back)
    const had = S.blue.length + S.red.length + S.blueBans.length + S.redBans.length;
    CLEARED = had ? JSON.parse(JSON.stringify(S)) : null;
    SWAP = null;
    S = freshState(S);
    Object.assign(S, { solo: true, loaded: false, sideChosen: true, clientKey: cs.key, myChamp: null, replay: null, asOf: null });
    fresh = true;
  }
  const sig = () => JSON.stringify([S.us, S.myRole, S.slot, S.blue, S.red, S.blueBans, S.redBans, S.banStage, clientNow(),
    S.banStage ? CL.hover[S.us] : null, CL.cs?.turn?.mine ? CL.myHover : null]);   // (teammates' plans and your hover change the advice)
  const before = sig();
  Object.assign(S, draftFromClient(cs), { history: [] });
  CL.hover = { B: cs.picks.B.map((p) => p.hover || null), R: cs.picks.R.map((p) => p.hover || null) };
  CL.picking = { B: cs.picks.B.map((p) => p.picking), R: cs.picks.R.map((p) => p.picking) };
  CL.myHover = cs.me.hover && !cs.me.champ ? cs.me.hover : null;
  CL.deadline = cs.timer?.deadline || null;
  CL.total = cs.timer?.total_ms || null;
  CL.timerSide = cs.turn?.side || cs.side;
  const after = sig();
  if (fresh) {
    toast(`Champ select: you're ${SIDE[cs.side]} side${cs.me.role ? ` · ${ROLE_NAME[cs.me.role]}` : ""}${cs.me.slot ? ` · pick ${cs.me.slot}` : ""}. The board follows your client.`);
    if (!cs.draft) setTimeout(() => toast("Not a draft game (no bans): the board shows the picks the client shares"), 2800);
  }
  const unknown = (cs.unknown || []).join(",");
  if (unknown && CL.warned !== unknown) { CL.warned = unknown; toast("A champion newer than this site's champion list was picked: run update.bat"); }
  startClock();
  if (fresh || force || before !== after) {
    saveState();
    renderStart(); renderPhase(); renderTeams(true);
    return refresh();
  }
  renderPhase(); renderTeams(); renderRecs();   // only hovers or the timer changed: no new analysis needed
}

function followGame(g) {   // a game running in your client: make sure its 10 champions are on the board
  const want = { B: g.champs.B.filter((c) => BY_NAME[c.champ]), R: g.champs.R.filter((c) => BY_NAME[c.champ]) };
  if (want.B.length !== 5 || want.R.length !== 5) return false;
  const have = new Set([...S.blue, ...S.red].map((p) => p.champ));
  if ([...want.B, ...want.R].every((c) => have.has(c.champ))) return false;   // already there (followed from champ select)
  const had = S.blue.length + S.red.length + S.blueBans.length + S.redBans.length;
  CLEARED = had ? JSON.parse(JSON.stringify(S)) : null;
  SWAP = null;
  S = freshState(S);
  const mine = (c) => c.champ === g.me;
  const me = [...want.B, ...want.R].find(mine);
  Object.assign(S, {
    solo: true, loaded: true, sideChosen: true, us: g.my_side || S.us || "B", clientKey: `game-${Date.now()}`, myChamp: null,
    myRole: me?.role || S.myRole || POOL?.main_role || "MID",
    blue: want.B.map((c) => ({ champ: c.champ, role: c.role || null, ...(mine(c) ? { me: true } : {}) })),
    red: want.R.map((c) => ({ champ: c.champ, role: c.role || null, ...(mine(c) ? { me: true } : {}) })),
  });
  toast("Your game is running: its 10 champions are on the board, and the live score follows the game");
  saveState();
  refresh();
  return true;
}

function renderClient() {   // the status pill in the settings bar
  const el = $("#client"), st = CL.st || {};
  if (!el) return;
  if (st.status === "disabled") { el.hidden = true; return; }
  el.hidden = false;
  let state = "off", main = "League client", sub = "not running · open League and the board follows your games";
  const q = st.queue?.name ? ` · ${esc(st.queue.name)}` : "";
  const tb = $("#trackerBtn");   // (the PC: is the draft tracker window open?)
  if (tb && !PHONE_VIEW) {
    tb.classList.toggle("open", !!st.tracker);
    tb.title = st.tracker ? "The draft tracker is open. Click to open another one."
      : "Draft tracker: a small window that sits on top of the League client in champ select and shows every player's hover, the timer and the best picks, live";
  }
  const btn = $("#phoneBtn"), watching = st.phone?.watching || 0;   // (the PC: is your phone watching?)
  if (btn && !PHONE_VIEW) {
    btn.classList.toggle("watching", watching > 0);
    btn.title = watching ? `Your phone is watching this board (${watching === 1 ? "1 phone" : `${watching} phones`}). Click for the pairing code.`
      : "Watch this board on your phone (same Wi-Fi): scan a code once and it follows every pick there too";
  }
  if (st.status === "server") {
    state = "lost";
    main = PHONE_VIEW ? "Lost your PC" : "League client";
    sub = PHONE_VIEW ? "trying again… Is website.bat still open there, and this phone on the same Wi-Fi?"
      : "can't reach this site's server · is website.bat still open?";
  }
  else if (st.status === "outdated") sub = "close website.bat and open it again to follow your games";
  else if (st.status === "nohelper") sub = "not connected · click <b>League</b> at the top to connect it";
  else if (st.status === "error") sub = esc(st.error || "something went wrong");
  else if (st.status === "on") {
    switch (st.phase) {
      case "Matchmaking": state = "queue"; main = "In queue"; sub = `<span class="qclock">0:00</span>${q}`; break;
      case "ReadyCheck":
        state = "found"; main = "Match found!";
        sub = st.ready === "Accepted" ? "accepted · waiting for the others" : "accept it in the client"; break;
      case "ChampSelect": state = "select"; main = "Champ select"; sub = S.follow ? `following every pick${q}` : `follow is off${q}`; break;
      case "GameStart": case "InProgress": case "Reconnect":
        state = "game"; main = "In game";
        sub = st.paused ? "quiet while you play: nothing reads League until the game ends"
          : !S.follow ? "follow is off · switch on Follow and the live score fills itself in"
          : st.game ? `live score · ${fmtClock(st.game.time)}` : "waiting for the game to load"; break;
      case "WaitingForStats": case "PreEndOfGame": case "EndOfGame":
        state = "idle"; main = "Game over"; sub = "queue again and the next draft starts by itself"; break;
      default:
        state = "idle"; main = "Connected"; sub = `${st.account ? `${esc(st.account)} · ` : ""}queue up and the board fills itself in${q}`;
    }
  }
  el.dataset.state = state;
  el.classList.toggle("paused", !S.follow);
  $("#clientTxt").innerHTML = `<b>${esc(main)}</b>${sub}`;
  $("#clientTxt").title = $("#clientTxt").textContent;
  $("#followOn").checked = !!S.follow;
  tickQueue();
  renderLeagueBtn();
}

/* The League button (top right): whether the board can see your League client, and on the website
   (which can't see programs on your PC by itself) how to connect it with the League helper. */
const LG = { open: false, timer: 0, shown: "" };
const QUIET = { value: null };   // quiet during games (shared setting "quietInGame": an opt-in, off unless switched on)
function quietInGame() {
  if (QUIET.value !== null) return QUIET.value;
  return (CL.st?.prefs || {}).quietInGame === true;
}
const isWeb = () => document.documentElement.classList.contains("web");
const olderVersion = (a, b) => {   // "1.3" before "1.4"?
  const x = String(a).split(".").map(Number), y = String(b).split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
};
function helperOutdated() {   // the website: a League helper older than the newest one is connected
  const have = CL.st?.helper, newest = window.acpClient?.helperNewest;
  return !!(isWeb() && have && newest && olderVersion(have, newest));
}
function leagueStatus() {   // [state, button label, what to say]
  const st = CL.st || {};
  if (st.status === "on" && st.paused) {
    return ["paused", "Quiet in game", `Your game is on, so nothing reads League or the game until it ends${st.account ? ` (<b>${esc(st.account)}</b>)` : ""}: the only thing checked is Windows' list of running programs (what Task Manager shows), to see when the game closes. Then it follows your client again by itself.`];
  }
  if (st.status === "on") {
    const where = { Matchmaking: "in queue", ReadyCheck: "match found", ChampSelect: "in champ select", GameStart: "in game",
      InProgress: "in game", Reconnect: "in game" }[st.phase] || "in the client";
    const label = { Matchmaking: "In queue", ReadyCheck: "Match found", ChampSelect: "Champ select", GameStart: "In game",
      InProgress: "In game", Reconnect: "In game" }[st.phase] || "Connected";
    const intro = `Connected to your League client${st.account ? ` as <b>${esc(st.account)}</b>` : ""}, ${where}.`;
    if (!S.follow) return ["off", "Follow off", `${intro} <b>Follow is off</b>, so the board doesn't fill itself in (no picks, no live score): switch it on below.`];
    return ["on", label, `${intro} The board follows it by itself: the queue, bans, picks, your team's hovers, the timer, then the live game.`];
  }
  if (st.status === "off") return ["off", "Open League", isWeb()
    ? "The League helper is running. Open the League client and it connects by itself."
    : "The League client isn't open. Open it and the board connects by itself."];
  if (st.status === "nohelper") return ["none", "Connect League",
    "Not connected. A website can't see programs on your PC by itself, so a small helper passes along what your League client shows."];
  if (st.status === "disabled") return ["none", "League", "Following the League client is switched off on this copy of the site (it was started with --no-client)."];
  if (st.status === "server") return ["lost", "League", "Can't reach this site's server: is website.bat still open?"];
  if (st.status === "error") return ["lost", "League", esc(st.error || "Something went wrong.")];
  return ["none", "League", "Looking for your League client…"];
}
function renderLeagueBtn() {
  const b = $("#leagueBtn");
  if (!b) return;
  const [state, label, text] = leagueStatus();
  const old = helperOutdated();
  b.dataset.state = state;
  b.classList.toggle("lg-update", old);
  b.querySelector(".lg-txt").textContent = label;
  b.title = text.replace(/<[^>]+>/g, "") + (old ? " A newer League helper is out: click for it." : "");
  if (old && !LG.toldUpdate) {   // (once per browser for each new helper, so it's never a nag)
    LG.toldUpdate = true;
    let told = "";
    try { told = localStorage.getItem("acp-helper-told") || ""; localStorage.setItem("acp-helper-told", window.acpClient.helperNewest); } catch (e) { /* */ }
    if (told !== window.acpClient.helperNewest) toast("A newer League helper is out: click League (top right) to get it");
  }
  if (LG.open && LG.shown !== state + text + S.follow + old) renderLeagueModal();
}
function openLeague() {
  LG.open = true;
  $("#modal").classList.add("open", "league-modal");
  renderLeagueModal();
  if (window.acpClient && CL.st?.status !== "on") window.acpClient.retry();
  clearInterval(LG.timer);
  LG.timer = setInterval(() => {   // (looking again every few seconds while the window is open: the helper may just have started)
    if (!LG.open) { clearInterval(LG.timer); return; }
    if (window.acpClient && CL.st?.status === "nohelper") window.acpClient.retry();
  }, 3000);
}
function renderLeagueModal() {
  const [state, , text] = leagueStatus();
  const old = helperOutdated();
  LG.shown = state + text + S.follow + old;
  const update = old ? `<p class="lg-upd"><b>A newer League helper is out</b> (${esc(window.acpClient.helperNewest)}; yours is ${esc(CL.st.helper)}).
      It keeps following your games even if its window gets clicked or the game is slow to answer.
      <a class="lg-dl" href="${esc(window.acpClient.helperUrl)}" download>Download it</a>, extract it over the old one (right-click, <i>Extract All</i>),
      then close the old helper's window and double-click <b>Start League Helper.cmd</b> again.</p>` : "";
  const steps = isWeb() && state === "none" ? `<ol class="lg-steps">
      <li><a class="lg-dl" href="${esc(window.acpClient?.helperUrl || "league-helper.zip")}" download>Download the League helper</a> (Windows, about 6 KB) and extract it: right-click the zip, <i>Extract All</i>. (Started from inside the zip, its window closes at once.)</li>
      <li>Double-click <b>Start League Helper.cmd</b>. If Windows says it protected your PC: <i>More info</i>, then <i>Run anyway</i>. Keep the small window it opens running while you play.</li>
      <li>That's all: this button turns teal and the board follows your client by itself. Your browser may ask once whether this site may connect to apps on this device: choose <b>Allow</b>.</li></ol>
    ${/^(127\.0\.0\.1|localhost)$/.test(location.hostname) ? "" : `<p class="lg-alt">Started it and this still says <i>not connected</i>? Your browser may be stopping this page from reaching apps on your PC. Open the board through the helper instead: <a href="http://127.0.0.1:8799/" target="_blank" rel="noopener"><b>127.0.0.1:8799</b></a> (the same site, and it always connects).</p>`}
    <p class="muted">The helper only reads, through the same local connection tools like Porofessor and Blitz use, and never clicks, picks or changes anything. It answers only on this PC, and only to this website.</p>` : "";
  $("#modalBody").innerHTML = `<div class="lg-panel"><h2><span class="lg-gem big" data-state="${state}" aria-hidden="true"></span>League client</h2>
    <p class="lg-now">${text}</p>${steps}${update}
    <div class="lg-row"><label class="chk"><input type="checkbox" id="lgFollow"${S.follow ? " checked" : ""}> Follow the client: the board fills itself in</label>
      ${isWeb() && CL.st?.status !== "on" ? '<button type="button" id="lgRetry">Check again</button>' : ""}</div>
    <div class="lg-row lg-quiet"><label class="chk"><input type="checkbox" id="lgQuiet"${quietInGame() ? " checked" : ""}> Quiet during games <span class="muted">(optional)</span></label>
      <span class="muted">${quietInGame() ? "While your game runs, nothing reads League or the game; it picks up again by itself when the game ends. (The live score isn't filled in by itself: type it in if you want it.)"
        : "Off: during games the live score is read from the game (Riot's official live-game data) and the win chance updates in real time."}</span></div></div>`;
  $("#lgFollow").onchange = (e) => { $("#followOn").checked = e.target.checked; $("#followOn").dispatchEvent(new Event("change")); };
  $("#lgRetry")?.addEventListener("click", () => { window.acpClient?.retry(); toast("Looking for the League helper…"); });
  $("#lgQuiet").onchange = (e) => {
    const on = e.target.checked;
    QUIET.value = on;
    fetch("/api/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quietInGame: on }) }).catch(() => {});
    toast(on ? "Quiet during games: nothing reads League while you play" : "Following the live score during games");
    LG.shown = "";
    renderLeagueModal();
  };
}

function tickQueue() {   // the queue timer, counting up like the client's
  clearInterval(CL.qtick);
  const since = CL.st?.status === "on" && CL.st.phase === "Matchmaking" ? CL.st.queue_since : null;
  const draw = () => document.querySelectorAll(".qclock").forEach((el) => { el.textContent = fmtClock(Math.max(0, (Date.now() - since) / 1000)); });
  if (since) { draw(); CL.qtick = setInterval(draw, 500); }
}

function waitingCard(card) {   // before champ select: what the client is doing, instead of "which team are you on?"
  const st = CL.st, ph = st.phase;
  const est = st.queue_estimate ? ` · usually about ${fmtClock(st.queue_estimate)}` : "";
  let body;
  if (ph === "Matchmaking") {
    body = `<div class="waiting"><span class="sigil"><i></i></span><h2>In queue${st.queue?.name ? ` · ${esc(st.queue.name)}` : ""}</h2>
      <div class="q-time qclock">0:00</div><p>${est ? `Estimated wait${est.replace(" · usually", "")}. ` : ""}When champ select starts, this board fills itself in.</p></div>`;
  } else if (ph === "ReadyCheck") {
    body = `<div class="waiting found"><span class="sigil"><i></i></span><h2>Match found!</h2>
      <p>${st.ready === "Accepted" ? "Accepted. Waiting for the other players…" : "Accept it in the League client."}</p></div>`;
  } else if (st.paused) {   // quiet during games: nothing is read while it runs
    body = `<div class="waiting"><span class="sigil"><i></i></span><h2>Good luck: quiet while you play</h2>
      <p>Nothing reads League or the game until it ends; then the board follows your client again by itself.
      Want the win chance? Type the score into Live game below.</p></div>`;
  } else if (["GameStart", "InProgress", "Reconnect"].includes(ph)) {
    body = `<div class="waiting"><span class="sigil"><i></i></span><h2>Your game is loading</h2>
      <p>${quietInGame() ? "The board goes quiet as soon as the game is running: nothing reads League or the game until it ends."
        : "Its 10 champions and the live score appear here as soon as the game is running."}</p></div>`;
  } else {
    body = `<div class="waiting"><span class="sigil"><i></i></span><h2>Ready when you are</h2>
      <p>Queue up in League. From champ select on, this board fills itself in: bans, every pick, your turn, the timer.</p>
      <p class="muted">${st.account ? `Signed in as ${esc(st.account)}. ` : ""}Nothing to type, and nothing is ever clicked in your client.</p></div>`;
  }
  card.innerHTML = `${body}<div class="row"><button class="linkish" id="manualStart">Set up a draft by hand instead</button></div>`;
  $("#manualStart").onclick = () => { CL.manual = true; renderStart(); };
  tickQueue();
}

function clientPhase(el) {   // the phase banner while following champ select
  const cs = CL.cs, t = cs.turn;
  const secs = CL.deadline ? `<span class="secs" id="clockSec"></span>` : "";
  const bansIn = S.blueBans.length + S.redBans.length;
  let main, sub, side = t?.side || cs.side;
  if (cs.stage === "planning") {
    main = "DECLARE YOUR PICK"; sub = "planning · bans come next";
  } else if (cs.stage === "bans") {
    main = "BAN PHASE"; side = cs.side;
    sub = `${bansIn ? `${bansIn} banned so far` : "nobody has banned yet"} · the enemy's bans show when all are in`;
  } else if (cs.stage === "finalization") {
    main = "FINALIZING"; sub = "trades, runes and spells · the game starts when the timer runs out";
  } else if (cs.stage === "starting") {
    main = "GAME STARTING"; sub = "the live score follows once you're in";
  } else if (t) {
    const slots = (t.slots[t.side] || []).filter(Boolean).sort();
    main = `${SIDE[t.side].toUpperCase()} PICK${slots.length ? ` ${slots.join(" & ")}` : ""}`;
    sub = t.mine ? "your pick" : t.side === cs.side ? "a teammate's pick" : "enemy pick";
  } else if (RES.next?.action === "pick") {   // between two turns: who's up next
    side = RES.next.side;
    main = `${SIDE[side].toUpperCase()} PICK ${RES.next.n}`; sub = "up next";
  } else {
    main = "CHAMP SELECT"; sub = "all picks are in";
  }
  el.className = `phase side-${side}`;
  let note = "";
  if (CL.myHover && t?.mine) note = `<span class="hover-note">${hoverNote(t.type)}</span>`;
  else if (t?.type === "pick" && t.side === cs.side) {   // a teammate hovering: is it one of the suggestions?
    const hv = (t.slots[t.side] || []).map((sl) => CL.hover[t.side]?.[sl - 1]).filter((c) => c && BY_NAME[c]);
    if (hv.length) {
      const bits = hv.map((c) => {
        const i = (RES.recs || []).findIndex((x) => x.champ === c);
        return `${esc(c)}${i === 0 ? " (the top suggestion ✓)" : i > 0 ? ` (suggestion #${i + 1})` : ""}`;
      });
      note = `<span class="hover-note">Teammate hovering ${bits.join(" and ")}</span>`;
    }
  }
  el.innerHTML = `<span>${main}</span><span class="sub">${sub}</span>${secs}${note}`;
  startClock();
}

function hoverNote(kind) {   // what the advice thinks of the champion (or ban) you're hovering in the client
  const c = CL.myHover, h = RES.hover?.champ === c ? RES.hover : null;
  const list = kind === "ban" ? RES.bans || [] : RES.recs || [];
  const shown = list.findIndex((x) => x.champ === c);
  if (shown === 0) return `Hovering ${esc(c)}: the top ${kind === "ban" ? "ban" : "pick"} ✓`;
  if (!h) return `Hovering ${esc(c)}${shown > 0 ? `: suggestion #${shown + 1}` : ""}`;   // (the advice is still loading)
  if (!h.rank) return `Hovering ${esc(c)}: too few pro games ${kind === "ban" ? "to rate this ban" : `as ${ROLE_NAME[S.myRole]} to rate it`}`;
  if (kind === "ban") return `Hovering ${esc(c)}: #${h.rank} of ${h.of} bans by threat · best: ${esc(h.best)}`;
  const where = h.pool_rank ? `#${h.pool_rank} of your ${h.pool_of} ${ROLE_NAME[S.myRole]} champions` : `#${h.rank} of ${h.of} ${ROLE_NAME[S.myRole]} picks`;
  const win = h.win != null ? ` · ${signed(h.win)}% win` : "";
  return `Hovering ${esc(c)}: ${where}${win} · best: ${esc(list[0]?.champ || h.best)}`;
}

function startClock() {   // the timer bar under the phase banner, emptying in step with the client
  const el = $("#clock");
  clearInterval(CL.tick);
  CL.tick = null;
  if (!el) return;
  if (!CL.deadline || !following() || !$("#startCard").hidden) { el.hidden = true; return; }
  el.hidden = false;
  el.className = `clock side-${CL.timerSide || "B"}`;
  const total = CL.total || 30000;
  const step = () => {
    const left = Math.max(0, CL.deadline - Date.now());
    el.firstElementChild.style.transform = `scaleX(${Math.min(1, left / total).toFixed(4)})`;
    el.classList.toggle("low", left > 0 && left < 6000);
    const s = $("#clockSec");
    if (s) { s.textContent = `${Math.ceil(left / 1000)}`; s.classList.toggle("low", left < 6000); }
    if (!left) { clearInterval(CL.tick); CL.tick = null; }
  };
  step();
  CL.tick = setInterval(step, 250);
}

function syncFlags() {   // page-wide states the layout follows (the phone view puts the typing tools away)
  const b = document.body.classList, on = S.follow && CL.st?.status === "on", lost = CL.st?.status === "server";
  b.toggle("lost", lost);   // (the server is out of reach: keep the layout, dim what's shown until it's back)
  if (lost) return;
  b.toggle("following", following());
  b.toggle("linked", !!(on && (!CL.manual || following())));   // the League client fills the board in
  b.toggle("ingame", !!(S.follow && CL.game));
}

/* -------------------------------------------- settings shared with your phone */
// Your champion filter ("Only my champions" and the champions you switched off) is the same on the PC
// and on your phone: each screen sends a change to the server, the other picks it up from its long poll.
const PREFS = { seen: null };
function prefsOf() { return { poolOn: !!S.poolOn, poolOff: [...S.poolOff] }; }
function pushPrefs() {
  fetch("/api/prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(prefsOf()) })
    .then((r) => (r.ok ? r.json() : null))
    .then((p) => { if (p) PREFS.seen = JSON.stringify({ poolOn: p.poolOn, poolOff: p.poolOff }); })
    .catch(() => { /* the next change tries again */ });
}
function applyPrefs(p) {
  if (!p) return;
  window.ACPTheme?.fromServer(p);   // a theme picked on another screen (the tracker, your phone)
  if (!("poolOn" in p) && !("poolOff" in p)) {   // nothing shared yet: share this screen's
    if (PREFS.seen === null) { PREFS.seen = ""; if (!S.poolOn || S.poolOff.length) pushPrefs(); }
    return;
  }
  const theirs = { poolOn: p.poolOn ?? true, poolOff: Array.isArray(p.poolOff) ? p.poolOff : [] };
  const sig = JSON.stringify(theirs);
  if (sig === PREFS.seen) return;   // nothing new (or just our own change coming back)
  PREFS.seen = sig;
  if (sig === JSON.stringify(prefsOf())) return;
  S.poolOn = theirs.poolOn;
  S.poolOff = [...theirs.poolOff];
  saveState();
  if (RES) refresh();
}

/* ------------------------------------------------------- phone mode: the phone */
// Keep the screen on while there's something to watch. Browsers only allow that on secure (https)
// pages, which a page from your own PC over Wi-Fi isn't, so most phones get a one-time tip instead.
const WAKE = { lock: null, asking: false };
async function keepAwake() {
  if (!PHONE_VIEW) return;
  const st = CL.st || {};
  const want = document.visibilityState === "visible" && st.status === "on"
    && ["Matchmaking", "ReadyCheck", "ChampSelect", "GameStart", "InProgress", "Reconnect"].includes(st.phase);
  if (!("wakeLock" in navigator) || WAKE.denied) return wakeTip(want);
  if (want && !WAKE.lock && !WAKE.asking) {
    WAKE.asking = true;
    try {
      WAKE.lock = await navigator.wakeLock.request("screen");
      WAKE.lock.addEventListener("release", () => { WAKE.lock = null; });
    } catch (e) { WAKE.lock = null; WAKE.denied = true; wakeTip(want); }   // (not asked again)
    WAKE.asking = false;
  } else if (!want && WAKE.lock) {
    WAKE.lock.release().catch(() => {});
    WAKE.lock = null;
  }
}
document.addEventListener("visibilitychange", () => keepAwake());
function wakeTip(want) {
  const el = $("#wakeTip");
  let off = false;
  try { off = localStorage.getItem("acp-waketip-off") === "1"; } catch (e) { /* */ }
  el.hidden = off || !want;
  if (el.hidden || el.dataset.ready) return;
  el.dataset.ready = "1";
  const ios = /iPhone|iPad/.test(navigator.userAgent);
  el.innerHTML = `<span class="wt-gem" aria-hidden="true"></span><span><b>Keep this screen on:</b> your phone may lock while you play.
    Set ${ios ? "<i>Settings › Display &amp; Brightness › Auto-Lock</i>" : "<i>Settings › Display › Screen timeout</i>"} to 5 minutes or more for your games.</span>
    <button class="mini" id="wakeTipX" title="Got it">✕</button>`;
  $("#wakeTipX").onclick = () => { try { localStorage.setItem("acp-waketip-off", "1"); } catch (e) { /* */ } el.hidden = true; };
}

/* ------------------------------------------------------------ draft tracker */
// Tracker: champ select in a small window of its own (an Edge/Chrome app window, opened by the site,
// which can stay on top of the League client); a popup when the PC has neither; on a phone, this tab.
async function openTracker() {
  if (PHONE_VIEW) { location.href = "/tracker.html"; return; }
  try {
    const r = await fetch("/api/window", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ open: "tracker" }) });
    const d = await r.json();
    if (r.ok && d.opened) { toast("Draft tracker opened in a window of its own: it wakes up in champ select"); return; }
  } catch (e) { /* an older copy of the server: a popup instead */ }
  const w = window.open("/tracker.html", "acp-tracker", "popup,width=480,height=900");
  if (!w) location.href = "/tracker.html";
}

/* ---------------------------------------------------------- phone mode: the PC */
// The Phone button: turn phone mode on, show the pairing QR code, see when your phone is watching.
const PH = { open: false, timer: null, st: null, watching: 0, forgetArmed: 0, busy: false, mode: "" };
async function phoneApi(body) {
  const r = await fetch("/api/phone", body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || `the server answered ${r.status}`);
  return d;
}
async function openPhone() {
  const modal = $("#modal");
  PH.open = true;
  PH.mode = "";
  $("#modalBody").innerHTML = `<div class="phone-pair"><h2 class="pp-title">Watch on your phone</h2><p class="muted">Loading…</p></div>`;
  modal.classList.add("open", "phone-modal");
  await refreshPhone(true);
  clearInterval(PH.timer);
  PH.timer = setInterval(() => (PH.open ? refreshPhone() : clearInterval(PH.timer)), 2500);
}
async function refreshPhone(full = false) {
  if (PH.busy) return;   // (a button's request is on its way: its answer redraws the window)
  try { PH.st = await phoneApi(); } catch (e) { PH.st = { error: e.message }; }
  if (!PH.busy) renderPhonePair(full);
}
async function phoneAction(body) {
  PH.busy = true;
  try { PH.st = await phoneApi(body); } catch (e) { PH.st = { error: e.message }; }
  PH.busy = false;
  renderPhonePair(true);
}
const agoText = (s) => (s < 15 ? "just now" : s < 90 ? "a minute ago" : s < 3600 ? `${Math.round(s / 60)} min ago` : `${Math.round(s / 3600)} h ago`);
function renderPhonePair(full) {
  if (!PH.open) return;
  const st = PH.st || {}, box = $("#modalBody");
  const head = `<h2 class="pp-title">Watch on your phone</h2>`;
  const mode = st.error ? `error:${st.error}` : st.on ? `on:${st.url}` : "off";
  if (!full && mode === PH.mode && mode !== `on:${st.url}`) return;   // nothing new to draw
  if (mode !== PH.mode) full = true;
  PH.mode = mode;
  if (st.error) {
    box.innerHTML = `<div class="phone-pair">${head}<p class="pp-lead">Couldn't reach phone mode: ${esc(st.error)}.</p>
      <p class="muted">Close website.bat and open it again (the site may be an older copy), then try once more.</p></div>`;
    return;
  }
  if (!st.on) {
    PH.watching = 0;
    box.innerHTML = `<div class="phone-pair">${head}
      <p class="pp-lead">Your phone shows this same board, live: every ban and pick, whose turn it is and the timer, then your game's win chance. Handy while League is full screen.</p>
      <div class="pp-off"><button class="gold pp-big" id="ppOn">Turn on phone mode</button></div>
      <ul class="pp-notes">
        <li>Your phone needs to be on the <b>same Wi-Fi</b> as this PC.</li>
        <li>Windows may ask whether <b>Python</b> can use your network: click <b>Allow access</b>.</li>
        <li>Only a phone that scans your code gets in, and your Riot key and account stay on this PC.</li>
      </ul></div>`;
    $("#ppOn").onclick = (e) => { e.target.disabled = true; e.target.textContent = "Turning on…"; phoneAction({ on: true }); };
    return;
  }
  if (full || !$("#ppStatus")) {
    const others = (st.others || []).map((u) => `<code>${esc(u.replace(/^http:\/\//, ""))}</code>`).join(" or ");
    box.innerHTML = `<div class="phone-pair">${head}
      <div class="pp-grid">
        ${st.url ? `<div class="pp-qr" title="Scan this with your phone's camera">${st.qr}</div>`
          : `<div class="pp-qr none"><span>No code yet</span></div>`}
        <div class="pp-side">
          <ol class="pp-steps"><li><span>Open your phone's <b>camera</b></span></li><li><span>Point it at the code</span></li><li><span>Tap the link that pops up</span></li></ol>
          <div id="ppStatus"></div>
        </div>
      </div>
      ${st.url ? `<p class="pp-type">Can't scan it? Type this into your phone's browser:<br><code>${esc(st.url.replace(/^http:\/\//, ""))}</code></p>` : ""}
      <details class="pp-help"><summary>Phone can't open it?</summary><ul>
        <li><b>Same Wi-Fi.</b> The phone has to be on the same network as this PC: not on mobile data, and not on a guest Wi-Fi (those keep devices apart).</li>
        <li><b>Windows Firewall.</b> If Windows asked about Python and you clicked Cancel: open <i>Windows Security › Firewall &amp; network protection › Allow an app through firewall</i>, click <i>Change settings</i> and tick <b>Python</b> under <b>Private</b>.</li>
        <li><b>Network set to Public.</b> Windows keeps phones out on a Public network: <i>Settings › Network &amp; internet › Wi-Fi</i> (or <i>Ethernet</i>) › your network, and choose <b>Private network</b>.</li>
        ${others ? `<li><b>Another network.</b> This PC has more than one address. If your phone is on the other network, type ${others}</li>` : ""}
        <li><b>It worked before.</b> A paired phone stays paired: bookmark the page to open it again. If your router gives this PC a new address (after a restart, say), scan the code once more.</li>
      </ul></details>
      <div class="pp-foot">
        <button class="linkish" id="ppForget" title="Makes a new code: phones paired so far have to scan again">New code (unpair phones)</button>
        <button class="linkish" id="ppOff" title="The site is only on this PC again (phones are kept paired for next time)">Turn off phone mode</button>
      </div></div>`;
    $("#ppForget").onclick = (e) => {
      if (Date.now() - PH.forgetArmed > 4000) {   // two clicks: it unpairs every phone
        PH.forgetArmed = Date.now();
        e.target.textContent = "Click again to unpair your phones";
        setTimeout(() => { if ($("#ppForget")) $("#ppForget").textContent = "New code (unpair phones)"; }, 4000);
        return;
      }
      PH.forgetArmed = 0;
      phoneAction({ forget: true }).then(() => toast("New code: phones have to scan it again"));
    };
    $("#ppOff").onclick = () => phoneAction({ on: false }).then(() => toast("Phone mode is off: the site is only on this PC again"));
  }
  const devices = st.devices || [], live = devices.filter((d) => d.watching);
  let html;
  if (!st.url) {
    const errs = Object.entries(st.errors || {});
    html = `<div class="pp-status warn"><span class="pp-gem"></span><span>${!(st.addresses || []).length
      ? "This PC doesn't seem to be on a network. Connect it to your Wi-Fi or router."
      : `Can't open the site to your network${errs.length ? ` on ${esc(errs.map(([ip]) => `${ip}:${st.port}`).join(", "))}` : ""}: another program may be using port ${st.port}.`}</span></div>
      <button id="ppRetry">Try again</button>`;
  } else if (live.length) {
    html = `<div class="pp-status live"><span class="pp-gem"></span><span><b>${esc(live.map((d) => d.name).join(", "))}</b> ${live.length > 1 ? "are" : "is"} watching.
      It follows every pick from here on.</span></div>`;
  } else {
    html = `<div class="pp-status wait"><span class="pp-gem"></span><span>Waiting for your phone…</span></div>`;
  }
  const past = devices.filter((d) => !d.watching).slice(0, 3);
  if (past.length) html += `<div class="pp-seen">Seen earlier: ${past.map((d) => `${esc(d.name)} (${agoText(d.ago)})`).join(", ")}</div>`;
  const el = $("#ppStatus");
  if (el.dataset.html !== html) {
    el.dataset.html = html;
    el.innerHTML = html;
    if ($("#ppRetry")) $("#ppRetry").onclick = () => phoneAction({ on: true });
  }
  if (live.length > PH.watching && !full) {   // it just connected
    toast(`${live[0].name} connected: it shows this board now`);
    el.querySelector(".pp-status")?.classList.add("just");
  }
  PH.watching = live.length;
}

/* ------------------------------------------------------- your build */
// under the board: click the champion you're playing and get its pro build for this game
// (runes, spells, items in buying order, skill order; against your lane opponent once they're picked)
const MB = { key: "", req: 0 };
function myBuildPicks() {   // the champions you could be playing: your team's (both teams when you're analysing)
  const sides = S.us ? [S.us] : ["B", "R"];
  return sides.flatMap((side) => (side === "B" ? S.blue : S.red).map((p) => ({ ...p, side })));
}
function renderMyBuild() {
  const sec = $("#myBuild"), picks = myBuildPicks();
  sec.hidden = !RES || !picks.length;
  if (sec.hidden) { MB.key = ""; return; }
  // the champion you clicked; in solo queue your own pick is chosen for you
  const cur = picks.find((p) => p.champ === S.myChamp) || picks.find((p) => p.me) || null;
  const roleOf = (p) => p.role || roleMap(p.side)[p.champ] || "";
  $("#mbChamps").innerHTML = picks.map((p) => `<button class="mb-champ side-${p.side}${cur && p.champ === cur.champ ? " on" : ""}" data-c="${esc(p.champ)}"
      title="Show the build for ${esc(p.champ)}">${img(champImg(p.champ), p.champ)}<span>${esc(p.champ)}<small>${S.us ? "" : `${SIDE[p.side]} · `}${ROLE_NAME[roleOf(p)] || ""}${p.me ? " · you" : ""}</small></span></button>`).join("");
  $("#mbChamps").querySelectorAll("[data-c]").forEach((b) => {
    b.onclick = () => { S.myChamp = b.dataset.c; saveState(); renderMyBuild(); };
  });
  $("#mbHint").textContent = cur ? "Click another champion to switch" : "Click the champion you're playing";
  if (!cur) { MB.key = ""; $("#mbBody").innerHTML = ""; return; }
  const other = cur.side === "B" ? "R" : "B", role = roleOf(cur);
  const theirRoles = roleMap(other);
  const vs = Object.keys(theirRoles).find((c) => theirRoles[c] === role) || "";
  const enemies = (other === "B" ? S.blue : S.red).map((p) => p.champ);
  const key = [cur.champ, role, vs, enemies.join(",")].join("|");
  if (key === MB.key) return;   // same champion, same lane opponent, same enemy team: keep what's shown
  MB.key = key;
  const req = ++MB.req;
  $("#mbBody").classList.add("loading");
  const q = new URLSearchParams({ name: cur.champ, role, vs, enemies: enemies.join(",") });
  fetch(`/api/my-build?${q}`).then((r) => r.json()).then((d) => {
    if (req !== MB.req) return;   // a newer click or pick came in meanwhile
    $("#mbBody").innerHTML = myBuildHTML(d);
  }).catch(() => {
    if (req === MB.req) { MB.key = ""; $("#mbBody").innerHTML = `<p class="muted">Couldn't load the build. Is serve.py running?</p>`; }
  }).finally(() => { if (req === MB.req) $("#mbBody").classList.remove("loading"); });
}
function myBuildHTML(d) {
  if (d.error || !d.build) return `<p class="muted">${esc(d.error || "No pro games for this champion in this role yet.")}</p>`;
  const bd = d.build;
  const lane = d.vs ? (d.lane ? ` · <b>${esc(d.lane.record)}</b> in pro games vs ${esc(d.vs)}` : ` · no pro games vs ${esc(d.vs)} yet`) : " · your lane opponent isn't picked yet";
  let h = `<div class="mb-title">${img(champImg(d.champ), d.champ)}<div>
      <div class="mb-name">${esc(d.champ)} <span>${ROLE_NAME[d.role] || ""}${d.vs ? ` vs ${esc(d.vs)}` : ""}</span></div>
      <div class="muted">${bd.n} pro games${lane}</div></div></div>`;
  const en = d.enemy;
  if (en) {
    const bits = [`${pct(1 - en.ap)} physical / ${pct(en.ap)} magic damage`];
    if (en.healers.length) bits.push(`healing: ${en.healers.map(esc).join(", ")}`);
    if (en.tanks.length) bits.push(`tanks: ${en.tanks.map(esc).join(", ")}`);
    h += `<p class="mb-enemy"><b>Enemy team${en.n < 5 ? ` (${en.n} of 5 picked)` : ""}:</b> ${bits.join(" · ")}</p>`;
    if (d.fits?.length) h += `<p class="mb-fit">Good buys this game: ${d.fits.map((f) => `<b>${esc(f.item)}</b> (they have ${esc(f.why)})`).join(", ")}</p>`;
  }
  h += `<div class="mb-grid"><div><h3>Runes</h3>${runesHTML(bd)}${spellsHTML(bd)}</div><div>${itemsHTML(bd)}${skillsHTML(bd.skills)}</div></div>`;
  return h;
}

/* every counter matchup between the two teams (web/matchups.js); your team on the left */
const MU = { open: true };
function matchHTML() {
  const mu = RES?.matchups;
  if (!mu || !window.ACPMatchups) return "";
  const lanes = mu.lanes.filter((l) => l.p != null).length;
  return `<h2>Every matchup</h2>
    <p class="muted">${lanes ? `${lanes} lane${lanes === 1 ? "" : "s"} set so far` : "No lane has both champions yet"}: who counters whom in pro games (LCK, LPL, internationals, plus other regions' games where they add evidence).</p>
    ${ACPMatchups.html(mu, { mine: S.us === "R" ? "R" : S.us === "B" ? "B" : null, img: champImg, gridOpen: MU.open })}`;
}
document.addEventListener("toggle", (e) => {   // remember whether the all-pairs grid is open
  if (e.target.matches?.("#matchCard .mu-all")) MU.open = e.target.open;
}, true);

/* A finished draft: the champion list folds away (Show champions brings it back) and the live game moves
   into the middle of the board, between the two teams, so the game itself is in view without scrolling.
   (On a phone the live game already leads the page in game, so it stays where it is there.) */
function placeLive() {
  const live = $("#liveCard"), center = document.querySelector(".center");
  if (!live || !center) return;
  const inBoard = !!RES?.complete && !document.body.classList.contains("phone");
  if (inBoard && live.parentElement !== center) $("#wbNote").after(live);
  else if (!inBoard && live.parentElement === center) $("#analysis").append(live);
}
function syncDone() {
  const done = !!RES?.complete;
  document.body.classList.toggle("draft-done", done);
  if (!done) document.body.classList.remove("show-grid");
  const b = $("#gridToggle");
  if (b) b.textContent = document.body.classList.contains("show-grid") ? "Hide champions" : "Show champions";
  placeLive();
}
document.addEventListener("click", (e) => {
  if (!e.target.closest?.("#gridToggle")) return;
  document.body.classList.toggle("show-grid");
  syncDone();
});

function renderAnalysis() {
  $("#analysis").classList.toggle("complete", !!RES.complete);
  syncDone();
  if (S.loaded && !RES.complete) {   // loading screen: nothing to advise until all 10 are in
    for (const id of ["#whyCard", "#liveCard", "#planCard", "#buildCard", "#matchCard"]) $(id).innerHTML = "";
    return;
  }
  $("#matchCard").innerHTML = matchHTML();
  $("#whyCard").innerHTML = whyHTML();
  $("#liveCard").innerHTML = liveHTML();
  bindLive();
  if (RES.complete) {
    $("#planCard").innerHTML = waysHTML();
    $("#buildCard").innerHTML = teamBuildsHTML();
  } else if (RES.next?.action === "ban") {
    $("#planCard").innerHTML = "";
    $("#buildCard").innerHTML = "";
  } else {
    const title = RES.perspective === "enemy" ? `${SIDE[RES.plan_side]} win con` : "Win con";
    $("#planCard").innerHTML = planHTML(RES.plan, title);
    $("#buildCard").innerHTML = buildHTML(RES.build);
  }
}

init();
