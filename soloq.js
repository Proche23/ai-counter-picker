"use strict";
/* Solo queue page: every champion in every role from the solo queue database (data/soloq.db, via
   /api/soloq/*), one champion's deep dive, and the download that fills the database (your Riot key). */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x, d = 1) => (x == null ? "–" : `${(x * 100).toFixed(d)}%`);
const num = (x) => (x == null ? "–" : Number(x).toLocaleString());
const ROLES = ["TOP", "JNG", "MID", "BOT", "SUP"];
const ROLE_NAME = { TOP: "Top", JNG: "Jungle", MID: "Mid", BOT: "Bot", SUP: "Support" };
const TIER_RANK = { S: 5, A: 4, B: 3, C: 2, D: 1 };
// lane glyphs: the map as a square, the lane drawn in it (own drawings, not Riot's icons)
const ROLE_ICON = {
  TOP: '<path d="M3 13V3h10" /><rect x="3" y="3" width="4" height="4" class="f"/>',
  JNG: '<path d="M8 2.5c2.6 2 3.6 4.4 3 7.4M8 2.5C5.4 4.5 4.4 6.9 5 9.9M8 13.5V7.5"/>',
  MID: '<path d="M3 13 13 3" /><rect x="6" y="6" width="4" height="4" class="f" transform="rotate(45 8 8)"/>',
  BOT: '<path d="M13 3v10H3" /><rect x="9" y="9" width="4" height="4" class="f"/>',
  SUP: '<path d="M8 2.5 13 4.5v3.2c0 2.9-2.1 5-5 5.8-2.9-.8-5-2.9-5-5.8V4.5Z"/>',
};
const roleSvg = (r) => `<svg class="ri" viewBox="0 0 16 16" aria-hidden="true">${ROLE_ICON[r]}</svg>`;
let META = null, ROLE = "MID", ROWS = [], SORT = { k: "tier", dir: -1 }, SEL = null, POLL = null, OPEN = null, seq = 0;

const ddv = () => META?.version || "16.23.1";
const champImg = (c) => (META?.champ_ids?.[c] ? `https://ddragon.leagueoflegends.com/cdn/${ddv()}/img/champion/${META.champ_ids[c]}.png` : "");
const itemImg = (id) => `https://ddragon.leagueoflegends.com/cdn/${ddv()}/img/item/${id}.png`;
const runeImg = (n) => (META?.runes?.[n] ? `https://ddragon.leagueoflegends.com/cdn/img/${META.runes[n]}` : "");
const spellImg = (n) => (META?.spells?.[n] ? `https://ddragon.leagueoflegends.com/cdn/${ddv()}/img/spell/${META.spells[n]}` : "");
const img = (src, alt = "", cls = "") => (src ? `<img class="${cls}" src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async">` : `<span class="${cls} noimg"></span>`);

async function getJSON(url, opts) {
  const res = await fetch(url, opts);
  let r;
  try { r = await res.json(); } catch (e) { r = { error: `Server error ${res.status}` }; }
  if (!res.ok && !r.error) r.error = `Server error ${res.status}`;
  return r;
}
const post = (url, body) => getJSON(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

// ------------------------------------------------------------------ the database + the download
const PHASE = {
  starting: () => "Starting…",
  ladder: (d) => `Reading the ${esc(d.tier_label || "")} ladder…`,
  players: (d) => `Finding games: <b>${num(d.found)}</b> new so far, from ${num(d.players_used || 0)} players`,
  games: (d) => (d.tier === "ranks" ? `Downloading every rank: <b>${num(d.added || 0)}</b> games so far (${num(d.timelines || 0)} minute by minute)`
    : `Downloading games: <b>${num(d.checked || 0)}</b> of ${num(Math.min(d.target, d.found || d.target))}`),
  learning: () => "The solo queue lab is learning from the new games (a few minutes)…",
  publishing: () => "Putting the new games on the website…",
  done: (d) => `Done: <b>${num(d.added)}</b> games added${d.tier === "ranks" ? `, and the lab ${d.lab_error ? `couldn't learn from them (${esc(d.lab_error)})` : "has learned from them"}` : ""}`,
  stopped: (d) => `Stopped: <b>${num(d.added || 0)}</b> games added${d.tier === "ranks" && d.added ? " and learned from" : ""} (the rest are remembered; download again to continue)`,
  error: (d) => `<span class="err">${esc(d.error || "Something went wrong.")}</span>`,
};
const eta = (s) => (s == null ? "" : s < 90 ? "about a minute left" : s < 3600 ? `about ${Math.round(s / 60)} min left` : `about ${(s / 3600).toFixed(1)} h left`);
const GAMES_OPTS = [[1000, "1,000", "~20 min"], [3000, "3,000", "~1 h"], [10000, "10,000", "~3.5 h"]];
// every rank, this season: games plus minute-by-minute timelines for part of them (~2,200 games an hour)
const RANK_GAMES_OPTS = [[8000, "8,000", "~4 h"], [24000, "24,000", "~11 h"], [400000, "As many as possible", "until stopped or the key runs out"]];
const RANKS = ["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master-only", "grandmaster", "challenger"];
const RANK_LABEL = { iron: "Iron", bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum", emerald: "Emerald", diamond: "Diamond", "master-only": "Master", grandmaster: "Grandmaster", challenger: "Challenger" };
let RANK = "silver", rankRequest = 0, rankTimer = null, rankLoading = false, detailRequest = 0;
let rankLab = {};
const DAYS_OPTS = [[7, "7 days"], [14, "14 days"], [21, "21 days"], [30, "30 days"]];
let FORM = { games: 24000, tier: "ranks", days: 21, platform: null, open: false };

function progressOf(d) {
  if (d.tier === "ranks") return d.phase === "learning" ? 0.99 : d.phase === "done" ? 1 : 0.01 + 0.98 * Math.min(1, (d.added || 0) / Math.max(1, d.target));
  if (d.phase === "games") return 0.06 + 0.94 * Math.min(1, (d.checked || 0) / Math.max(1, Math.min(d.target, d.found || d.target)));
  if (d.phase === "players") return 0.01 + 0.05 * Math.min(1, (d.found || 0) / Math.max(1, d.target));
  if (d.phase === "done") return 1;
  return 0.01;
}

function keyBox(why) {
  return `<div class="sq-key">${why ? `<p class="err">${why}</p>` : ""}
    <p>Solo queue games come from Riot's API, so this needs <b>your own Riot key</b>: sign in at
    <a href="https://developer.riotgames.com" target="_blank" rel="noopener">developer.riotgames.com</a>, copy the
    <b>Development API Key</b> (it starts with <code>RGAPI-</code>) and paste it here. It's kept on this PC and only ever sent to Riot.
    A development key works for 24 hours; a <b>Personal API Key</b> (free, apply on the same site) doesn't run out.</p>
    <div class="sq-keyrow"><input id="sqKey" type="password" autocomplete="off" spellcheck="false" placeholder="RGAPI-…" aria-label="Riot API key">
      <button id="sqKeySave" class="gold">Save key</button></div><p class="muted" id="sqKeyMsg"></p></div>`;
}

function formHTML() {
  const seg = (name, opts, cur) => `<div class="seg mid" data-f="${name}" role="group">${opts.map(([v, a, b]) =>
    `<button type="button" data-v="${v}" class="${String(v) === String(cur) ? "on" : ""}">${a}${b ? `<small>${b}</small>` : ""}</button>`).join("")}</div>`;
  const plats = Object.entries(META.platforms || {}).map(([k, n]) => `<option value="${k}"${k === FORM.platform ? " selected" : ""}>${esc(n)}</option>`).join("");
  return `<div class="sq-form">
    <div class="field"><span class="field-name">Players</span>${seg("tier", Object.entries(META.tiers).map(([k, v]) => [k, v]), FORM.tier)}</div>
    <div class="field"><span class="field-name">Games</span>${seg("games", FORM.tier === "ranks" ? RANK_GAMES_OPTS : GAMES_OPTS, FORM.games)}</div>
    ${FORM.tier === "ranks" ? `<div class="field"><span class="field-name">Played</span><span class="sq-season">this season, Iron to Challenger, shared evenly between the ranks</span></div>`
      : `<div class="field"><span class="field-name">Played in the last</span>${seg("days", DAYS_OPTS, FORM.days)}</div>`}
    <label class="field"><span class="field-name">Server</span><select id="sqPlat">${plats}</select></label>
    <button id="sqGo" class="gold big-go">${FORM.games >= 400000 ? "Download as many as possible" : `Download ${num(FORM.games)} games`}</button>
  </div>
  <p class="muted">${FORM.tier === "ranks"
    ? "Every rank gets its own games (and, for the board's live win chance, minute-by-minute data for about a third of them). When it finishes, or when you stop it, the solo queue lab learns from the new games: the draft board's Solo queue tab then answers from them."
    : ""} Riot lets a key make 100 requests every 2 minutes, so about ${FORM.tier === "ranks" ? "2,200" : "3,000"} games an hour. It runs in the background while this site is open,
  and you can stop it any time: what's downloaded stays, and the next download continues where it stopped.</p>`;
}

function renderDb() {
  const box = $("#dbCard"), s = META.summary, d = META.download || {}, riot = META.riot || {};
  const has = s.games > 0, running = !!d.running;
  const tiles = has ? `<div class="sq-tiles">
      <div class="tile"><div class="k">Games</div><div class="v">${num(s.games)}</div><div class="s">${s.oldest ? `${esc(s.oldest)} to ${esc(s.newest)}` : ""}</div></div>
      <div class="tile"><div class="k">Patches</div><div class="v">${s.patches.length ? esc(s.patches[0].name || s.patches[0].patch) : "–"}</div><div class="s">${s.patches.slice(0, 3).map((p) => `${esc(p.name || p.patch)}: ${num(p.games)}`).join(" · ")}</div></div>
      <div class="tile"><div class="k">Players</div><div class="v">${esc(tierMix(s.tiers))}</div><div class="s">${Object.keys(s.platforms || {}).map((p) => esc((META.platforms || {})[p] || p)).join(", ")}</div></div>
      <div class="tile"><div class="k">Kept apart</div><div class="v sm">Pro data untouched</div><div class="s">The draft board's <a href="/">Solo queue tab</a> answers from these, rank by rank</div></div>
    </div>` : "";
  let body;
  if (running) {
    const p = progressOf(d);
    body = `<div class="sq-run"><div class="sq-runhead"><span class="spin" aria-hidden="true"></span><span>${(PHASE[d.phase] || PHASE.starting)(d)}</span>
        <span class="muted">${eta(d.eta_s)}</span><button id="sqStop">Stop</button></div>
      <div class="sq-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><i style="width:${(p * 100).toFixed(1)}%"></i></div>
      <p class="muted">${esc(d.tier_label)} on ${esc((META.platforms || {})[d.platform] || d.platform)}, ${d.tier === "ranks" ? "this season" : `games from the last ${d.days} days`} · ${num(d.requests)} requests so far. You can keep using the site.</p>
      ${d.ranks ? `<div class="sq-ranks">${Object.entries(d.ranks).map(([r, x]) => `<span class="sq-rk rk-${r}"><i></i>${esc(x.label || RANK_LABEL[r])} <b>${num(x.added || 0)}</b><small>${num(x.timelines || 0)} timelines</small></span>`).join("")}</div>` : ""}</div>`;
  } else {
    const last = d.phase && d.phase !== "starting" ? `<p class="sq-last">${(PHASE[d.phase] || (() => ""))(d)}</p>` : "";
    let ctrl;
    if (META.web) ctrl = "";   // (the in-browser version: the data comes with the site)
    else if (riot.blocked) ctrl = `<p class="muted">Downloading only works on the PC (it uses your Riot key).</p>`;
    else if (!riot.configured) ctrl = keyBox("");
    else if (riot.ok === false) ctrl = keyBox("Riot no longer accepts your saved key (development keys stop working 24 hours after they're made): paste a fresh one.");
    else ctrl = has && !FORM.open ? `<button id="sqMore" class="gold">Download more games</button>` : formHTML();
    body = `${last}${ctrl}`;
  }
  if (!has && META.web) {
    box.innerHTML = `<div class="sq-hero"><div class="sq-hero-mark" aria-hidden="true">${roleSvg("MID")}</div><div>
        <h2>Solo queue stats aren't in this copy yet</h2>
        <p class="lead">This rank has no published match sample. Win rates, builds and teammate combinations appear when ranked game data is available.</p></div></div>`;
    return;
  }
  box.innerHTML = has
    ? `<div class="sq-dbhead"><h2>Solo queue database</h2></div>${tiles}${body}`
    : `<div class="sq-hero"><div class="sq-hero-mark" aria-hidden="true">${roleSvg("MID")}</div><div>
        <h2>Build your solo queue database</h2>
        <p class="lead">A database of its own for ranked solo queue: this season's games at every rank, Iron to Challenger, every champion in every role,
        each lane matchup, best teammates and common builds, and for part of the games the whole game minute by minute.</p></div></div>${body}`;
  wireDb();
}
function tierMix(t) {   // "Iron to Challenger", "Master+"...
  const k = Object.keys(t || {});
  if (!k.length) return "–";
  const order = ["IRON", "BRONZE", "SILVER", "GOLD", "PLATINUM", "EMERALD", "DIAMOND", "MASTER", "GRANDMASTER", "CHALLENGER"];
  const have = order.filter((x) => k.includes(x));
  if (!have.length) return k[0];
  const name = (x) => `${x[0]}${x.slice(1).toLowerCase()}`;
  const low = have[0], high = have[have.length - 1];
  if (high === "CHALLENGER" && ["MASTER", "GRANDMASTER", "DIAMOND", "EMERALD"].includes(low)) return `${name(low)}+`;
  return low === high ? name(low) : `${name(low)} to ${name(high)}`;
}

function wireDb() {
  $("#sqStop")?.addEventListener("click", async () => { $("#sqStop").disabled = true; await post("/api/soloq/download", { stop: true }); poll(true); });
  $("#sqMore")?.addEventListener("click", () => { FORM.open = true; renderDb(); });
  document.querySelectorAll("#dbCard .seg[data-f]").forEach((g) => g.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    const f = g.dataset.f, v = b.dataset.v;
    FORM[f] = f === "tier" ? v : Number(v);
    if (f === "tier") FORM.games = v === "ranks" ? 24000 : 3000;
    renderDb();
  }));
  $("#sqPlat")?.addEventListener("change", (e) => { FORM.platform = e.target.value; });
  $("#sqGo")?.addEventListener("click", async () => {
    const b = $("#sqGo");
    b.disabled = true;
    b.textContent = "Starting…";
    const r = await post("/api/soloq/download", { games: FORM.games, tier: FORM.tier, days: FORM.days, platform: FORM.platform || META.platform });
    if (r.error) {
      if (r.riot) META.riot = r.riot;
      renderDb();
      $("#dbCard").insertAdjacentHTML("beforeend", `<p class="err">${esc(r.error)}</p>`);
      return;
    }
    META.download = r.download;
    FORM.open = false;
    renderDb();
    poll();
  });
  const key = $("#sqKey");
  if (key) {
    const save = async () => {
      const v = key.value.trim(), m = $("#sqKeyMsg");
      if (!v) { m.textContent = "Paste the key first."; return; }
      m.textContent = "Asking Riot whether it accepts the key…";
      $("#sqKeySave").disabled = true;
      const r = await post("/api/players/riot-key", { key: v, platform: FORM.platform || META.platform || "na1" });
      if (r.error) { m.innerHTML = `<span class="err">${esc(r.error)}</span>`; $("#sqKeySave").disabled = false; return; }
      META.riot = r.riot_status;
      FORM.open = true;
      renderDb();
    };
    $("#sqKeySave").addEventListener("click", save);
    key.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); });
    key.addEventListener("input", () => { if (/^RGAPI-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key.value.trim())) save(); });
  }
}

async function poll(once) {
  clearTimeout(POLL);
  const before = META.summary.games;
  const query = qs();
  const m = await getJSON(`/api/soloq/meta?${query}`);
  if (query !== qs() || rankLoading) return;
  if (!m.error) {
    const was = META.download?.running;
    META = m;
    renderDb();
    renderHead();
    if (m.summary.games !== before || (was && !m.download.running)) { fillPatches(); renderTabs(); loadRole(); }
  }
  const busy = META.download?.running || META.download?.phase === "learning";
  if (busy) POLL = setTimeout(poll, 2000);
}

// ------------------------------------------------------------------ champions by role
const qs = () => `patch=${encodeURIComponent($("#patch").value)}${RANK ? `&rank=${RANK}` : ""}`;
function renderRankScope() {
  const label = RANK_LABEL[RANK];
  const slider = $("#rankSlider");
  slider.value = RANKS.indexOf(RANK);
  slider.setAttribute("aria-valuetext", label);
  $("#rankValue").textContent = label;
  $("#rankScope").textContent = rankLoading ? `Loading ${label} Solo/Duo games…`
    : META?.summary.games ? `${num(META.summary.games)} Ranked Solo/Duo games sampled through the ${label} ladder.`
    : `No Ranked Solo/Duo games available in the ${label} sample.`;
  $("#rankAuto").disabled = !rankTimer && RANKS.filter((r) => META?.ranks?.[r] > 0).length < 2;
  const comeback = rankLab[RANK]?.throws?.behind3_at15_won;
  const note = $("#rankComeback");
  note.hidden = rankLoading || !META?.summary.games || !comeback?.games || comeback.rate == null;
  note.textContent = note.hidden ? "" : `${label} timeline sample · Teams down 3,000+ gold at 15 min won ${pct(comeback.rate)} of ${num(comeback.games)} games across sampled patches.`;
}

function stopRankCycle() {
  clearInterval(rankTimer);
  rankTimer = null;
  $("#rankAuto").setAttribute("aria-pressed", "false");
  $("#rankAuto").textContent = "Auto-cycle ranks";
  renderRankScope();
}

async function selectRank(rank) {
  if (!RANKS.includes(rank) || rank === RANK) return;
  const request = ++rankRequest;
  RANK = rank;
  rankLoading = true;
  ++seq;
  ++detailRequest;
  OPEN = null;
  ROWS = [];
  $("#browse").hidden = true;
  $("#detail").textContent = "";
  renderRankScope();
  const m = await getJSON(`/api/soloq/meta?rank=${rank}`).catch(() => ({ error: "Couldn’t load this rank." }));
  if (request !== rankRequest) return;
  rankLoading = false;
  if (m.error) {
    $("#rankScope").textContent = m.error;
    return;
  }
  META = m;
  renderHead(); renderDb(); fillPatches(); renderTabs();
  if (m.summary.games) loadRole();
  if (m.download?.running) poll();
}
function renderHead() {
  const s = META.summary;
  $("#sqMeta").textContent = s.games ? `${num(s.games)} ranked solo queue games${RANK ? ` · ${RANK_LABEL[RANK]}` : ` · ${tierMix(s.tiers)}`} · ${s.patches.length ? `patch ${s.patches[0].name || s.patches[0].patch}` : ""}${s.newest ? ` · newest ${s.newest}` : ""}`
    : (RANK ? `No ${RANK_LABEL[RANK]} games yet` : "No solo queue games yet");
  renderRankScope();
  $("#browse").hidden = !s.games;
}
function fillPatches() {
  const sel = $("#patch"), cur = sel.value;
  sel.closest("label").hidden = !!META.web;
  if (META.web) { sel.value = ""; return; }
  sel.innerHTML = `<option value="">All patches</option>` + META.summary.patches.map((p) => `<option value="${esc(p.patch)}">Patch ${esc(p.name || p.patch)} (${num(p.games)})</option>`).join("");
  sel.value = META.summary.patches.some((p) => p.patch === cur) ? cur : "";
}
function renderTabs() {
  $("#roleTabs").innerHTML = ROLES.map((r) => `<button type="button" role="tab" data-v="${r}" aria-selected="${r === ROLE}" class="${r === ROLE ? "on" : ""}">
    ${roleSvg(r)}<span>${ROLE_NAME[r]}</span><small>${META.roles?.[r] || 0}</small></button>`).join("");
}

async function loadRole() {
  const my = ++seq;
  ++detailRequest;
  $("#detail").classList.remove("loading");
  $("#detail").textContent = "";
  OPEN = null;
  $("#rows").innerHTML = Array.from({ length: 8 }, () => `<tr class="skel"><td colspan="8"><i></i></td></tr>`).join("");
  const r = await getJSON(`/api/soloq/role?role=${ROLE}&${qs()}`);
  if (my !== seq) return;
  if (r.error) { $("#rows").innerHTML = `<tr><td colspan="8" class="err">${esc(r.error)}</td></tr>`; return; }
  ROWS = r.rows || [];
  const sampled = new Set(ROWS.map((row) => row.champ));
  ROWS.push(...Object.keys(META.champ_ids || {}).filter((champ) => !sampled.has(champ))
    .map((champ) => ({ champ, games: 0, score: -1 })));
  renderRows();
  const want = SEL && SEL.role === ROLE && ROWS.some((x) => x.champ === SEL.champ) ? SEL.champ : ROWS.find((x) => x.games)?.champ;
  if (want && (!SEL || SEL.champ !== want || SEL.role !== ROLE || !OPEN)) openChamp(want, ROLE);
  else if (!want) $("#detail").innerHTML = `<p class="muted">No games in this role${$("#patch").value ? " on this patch" : ""} yet.</p>`;
}

function sorted() {
  const q = $("#find").value.trim().toLowerCase();
  let rows = ROWS.filter((x) => !q || x.champ.toLowerCase().includes(q));
  const k = SORT.k, dir = SORT.dir;
  const val = (x) => (k === "tier" ? (TIER_RANK[x.tier] || 0) * 10 + x.score : k === "champ" ? x.champ : x[k] ?? -1);
  rows = rows.slice().sort((a, b) => {
    const A = val(a), B = val(b);
    return Number(b.games > 0) - Number(a.games > 0)
      || (typeof A === "string" ? A.localeCompare(B) : A - B) * dir || b.games - a.games || a.champ.localeCompare(b.champ);
  });
  return rows;
}

function wrCell(x) {
  const lo = 0.4, hi = 0.6, sc = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const tone = x.score >= 0.51 ? "up" : x.score <= 0.49 ? "down" : "";
  return `<div class="wrc" title="${pct(x.wr)} in ${num(x.games)} games (95% range ${pct(x.lo, 0)}–${pct(x.hi, 0)}); ${pct(x.score)} after allowing for the number of games">
    <div class="wrt"><i class="mid"></i><i class="ci" style="left:${sc(x.lo)}%;width:${Math.max(1, sc(x.hi) - sc(x.lo))}%"></i><i class="dot ${tone}" style="left:${sc(x.wr)}%"></i></div>
    <b class="${tone}">${pct(x.wr)}</b></div>`;
}

function renderRows() {
  const rows = sorted();
  document.querySelectorAll("#table th[data-k]").forEach((th) => {
    th.classList.toggle("sorted", th.dataset.k === SORT.k);
    th.setAttribute("aria-sort", th.dataset.k === SORT.k ? (SORT.dir > 0 ? "ascending" : "descending") : "none");
  });
  $("#rows").innerHTML = rows.map((x, i) => {
    return `<tr data-c="${esc(x.champ)}" class="${SEL && SEL.champ === x.champ && SEL.role === ROLE ? "sel" : ""}" tabindex="0">
      <td class="n">${x.games ? i + 1 : "–"}</td>
      <td class="l"><span class="cn">${img(champImg(x.champ), x.champ, "ci")}<span>${esc(x.champ)}</span></span></td>
      ${!x.games ? '<td colspan="6" class="muted">No games in this sample</td>' : `
      <td>${x.tier ? `<span class="tier t-${x.tier}">${x.tier}</span>` : `<span class="tier t-none" title="Too few games to rate">–</span>`}</td>
      <td class="wr">${wrCell(x)}</td>
      <td>${pct(x.pick)}</td><td>${pct(x.ban)}</td><td>${num(x.games)}</td><td>${x.kda.toFixed(1)}</td>`}
      </tr>`;
  }).join("") || `<tr><td colspan="8" class="muted empty">No champion matches.</td></tr>`;
  $("#listFoot").textContent = `${num(ROWS.filter((x) => x.games).length)} champions sampled as ${ROLE_NAME[ROLE]} in ${RANK_LABEL[RANK]}.`;
}

// ------------------------------------------------------------------ one champion
function bar(edge, max = 0.08) {
  const w = (Math.min(Math.abs(edge), max) / max) * 50;
  return `<span class="db"><i class="${edge >= 0 ? "pos" : "neg"}" style="${edge >= 0 ? `left:50%` : `left:${50 - w}%`};width:${w}%"></i></span>`;
}
function pairRow(x, role, base) {
  const tone = x.score >= base + 0.01 ? "up" : x.score <= base - 0.01 ? "down" : "";
  return `<button type="button" class="pr" data-c="${esc(x.champ)}" data-r="${x.role || role}" title="${esc(x.champ)}: ${x.wins}-${x.games - x.wins} (${pct(x.wr)}) in ${num(x.games)} games; ${pct(x.score)} after allowing for the number of games">
    ${img(champImg(x.champ), x.champ, "pi")}<span class="pn">${esc(x.champ)}${x.role && x.role !== role ? ` <small>${ROLE_NAME[x.role]}</small>` : ""}</span>
    <span class="pg">${num(x.games)}</span>${bar(x.score - base)}<b class="${tone}">${pct(x.wr)}</b></button>`;
}
function list(rows, role, base, empty) {
  return rows.length ? `<div class="pl">${rows.map((x) => pairRow(x, role, base)).join("")}</div>` : `<p class="muted">${empty}</p>`;
}

function buildHTML(b) {
  if (!b || (!b.items.length && !b.keystones.length)) return "";
  const chip = (src, name, share, wr, cls = "") => `<div class="bi ${cls}" title="${esc(name)}: in ${pct(share, 0)} of games, ${pct(wr)} win rate">${img(src, name)}<span>${esc(name)}</span><small>${pct(share, 0)} · ${pct(wr, 0)} wins</small></div>`;
  const ks = b.keystones.map((k) => chip(runeImg(k.rune), k.rune, k.share, k.wr)).join("");
  const sp = b.spells.map((s) => `<div class="bi" title="${esc(s.spells.join(" + "))}: ${pct(s.share, 0)} of games, ${pct(s.wr)} win rate"><span class="duo">${s.spells.map((n) => img(spellImg(n), n)).join("")}</span><span>${esc(s.spells.join(" + "))}</span><small>${pct(s.share, 0)} · ${pct(s.wr, 0)} wins</small></div>`).join("");
  const bt = b.boots.slice(0, 2).map((x) => chip(itemImg(x.id), x.item, x.share, x.wr)).join("");
  const it = b.items.slice(0, 6).map((x) => chip(itemImg(x.id), x.item, x.share, x.wr)).join("");
  return `<h3>Common build</h3><div class="sq-build">
    ${ks ? `<div><h4>Keystone</h4><div class="bl">${ks}</div></div>` : ""}${sp ? `<div><h4>Spells</h4><div class="bl">${sp}</div></div>` : ""}
    ${bt ? `<div><h4>Boots</h4><div class="bl">${bt}</div></div>` : ""}${it ? `<div class="wide"><h4>Finished items</h4><div class="bl">${it}</div></div>` : ""}</div>`;
}

async function openChamp(champ, role) {
  const request = ++detailRequest;
  SEL = { champ, role };
  OPEN = null;
  document.querySelectorAll("#rows tr").forEach((tr) => tr.classList.toggle("sel", tr.dataset.c === champ));
  history.replaceState(null, "", `#${encodeURIComponent(champ)}/${role}`);
  const box = $("#detail");
  box.classList.add("loading");
  const d = await getJSON(`/api/soloq/champ?name=${encodeURIComponent(champ)}&role=${role}&${qs()}`);
  if (request !== detailRequest) return;
  box.classList.remove("loading");
  OPEN = d;
  if (d.error || !d.games) {
    box.innerHTML = `<p class="muted">${esc(d.error || `No ${ROLE_NAME[role]} games for ${champ} here yet.`)}</p>`;
    return;
  }
  const base = d.score;
  const roles = (d.roles || []).map((r) => `<button type="button" class="rchip ${r.role === role ? "on" : ""}" data-r="${r.role}" title="${num(r.games)} games as ${ROLE_NAME[r.role]}">${roleSvg(r.role)}${ROLE_NAME[r.role]} <small>${pct(r.share, 0)}</small></button>`).join("");
  const all = d.lanes.slice().sort((a, b) => b.games - a.games);
  box.innerHTML = `
    <div class="dh">${img(champImg(champ), champ, "big")}<div class="dt">
      <h2>${esc(champ)}</h2>
      <div class="dsub">${d.tier ? `<span class="tier t-${d.tier}">${d.tier}</span>` : ""}<span>${ROLE_NAME[role]}</span><span class="muted">·</span><span class="muted">${num(d.games)} games</span></div></div></div>
    <div class="droles">${roles}</div>
    <div class="kp">
      <div><span>Win rate</span><b class="${base >= 0.51 ? "up" : base <= 0.49 ? "down" : ""}">${pct(d.wr)}</b><small>95% ${pct(d.lo, 0)}–${pct(d.hi, 0)}</small></div>
      <div><span>Pick</span><b>${pct(d.pick)}</b><small>of games</small></div>
      <div><span>Ban</span><b>${pct(d.ban)}</b><small>of games</small></div>
      <div><span>KDA</span><b>${d.kda.toFixed(2)}</b><small>${d.k.toFixed(1)} / ${d.d.toFixed(1)} / ${d.a.toFixed(1)}</small></div>
    </div>
    <div class="dstats"><span>CS / min <b>${d.cspm.toFixed(1)}</b></span><span>Gold / min <b>${Math.round(d.gpm)}</b></span><span>Damage / min <b>${Math.round(d.dpm)}</b></span><span>Vision / min <b>${d.vspm.toFixed(2)}</b></span></div>
    <h3>Lane matchups <small class="muted">vs the enemy ${ROLE_NAME[role]}, 8+ games</small></h3>
    <div class="two"><div><h4>Strong against</h4>${list(d.best.filter((x) => x.score > base), role, base, "No clear good matchup yet.")}</div>
      <div><h4>Struggles against</h4>${list(d.worst.filter((x) => x.score < base), role, base, "No clear bad matchup yet.")}</div></div>
    ${all.length ? `<details class="mall"><summary>Every lane opponent (${all.length})</summary>${list(all, role, base, "")}</details>` : ""}
    ${d.duo_threats?.length ? `<h3>Their bot lane <small class="muted">2 v 2: toughest first</small></h3>${list(d.duo_threats, role, base, "")}` : ""}
    ${d.mates?.length ? `<h3>Best teammates</h3>${list(d.mates, role, base, "")}` : ""}
    ${d.threats?.length ? `<h3>Toughest enemies <small class="muted">any role</small></h3>${list(d.threats, role, base, "")}` : ""}
    ${buildHTML(d.build)}
    <p class="muted dnote">The bars show each matchup against ${esc(champ)}'s own ${pct(base)} (after allowing for few games), so a long bar is a real difference, not noise.</p>`;
  box.querySelectorAll(".pr[data-c]").forEach((b) => b.addEventListener("click", () => {
    const r = b.dataset.r && ROLES.includes(b.dataset.r) ? b.dataset.r : role;
    if (r !== ROLE) { ROLE = r; renderTabs(); SEL = { champ: b.dataset.c, role: r }; loadRole(); } else openChamp(b.dataset.c, r);
    box.scrollTop = 0;
  }));
  box.querySelectorAll(".rchip[data-r]").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.r === ROLE) return;
    ROLE = b.dataset.r;
    SEL = { champ, role: ROLE };
    renderTabs();
    loadRole();
  }));
}

// ------------------------------------------------------------------ start
async function init() {
  META = await getJSON(`/api/soloq/meta?rank=${RANK}`);
  if (META.error) { $("#dbCard").innerHTML = `<p class="err">${esc(META.error)}</p>`; return; }
  FORM.platform = META.platform;
  const h = decodeURIComponent(location.hash.slice(1));
  const [hc, hr] = h.split("/");
  if (ROLES.includes(hr)) ROLE = hr;
  if (hc && hr) SEL = { champ: hc, role: ROLE };
  if (h === "download") FORM.open = true;   // (the draft board's "Download solo queue games" button)
  renderHead();
  renderDb();
  getJSON("/api/soloq/ranks").then((data) => { rankLab = data.lab?.ranks || {}; renderRankScope(); }).catch(() => {});
  if (h === "download") $("#dbCard").scrollIntoView({ block: "start" });
  fillPatches();
  renderTabs();
  if (META.summary.games) loadRole();
  if (META.download?.running) poll();
  $("#roleTabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b || b.dataset.v === ROLE) return;
    ROLE = b.dataset.v;
    renderTabs();
    loadRole();
  });
  $("#patch").addEventListener("change", () => { OPEN = null; loadRole(); });
  $("#find").addEventListener("input", renderRows);
  $("#find").addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = $("#rows tr[data-c]"); if (first) openChamp(first.dataset.c, ROLE); } });
  $("#rankSlider").addEventListener("input", (e) => {
    const rank = RANKS[Number(e.target.value)];
    stopRankCycle();
    selectRank(rank);
  });
  $("#rankAuto").addEventListener("click", () => {
    if (rankTimer) return stopRankCycle();
    $("#rankAuto").setAttribute("aria-pressed", "true");
    $("#rankAuto").textContent = "Pause rank cycling";
    rankTimer = setInterval(() => {
      if (document.hidden || rankLoading) return;
      const available = RANKS.filter((r) => META.ranks?.[r] > 0);
      if (available.length < 2) return stopRankCycle();
      selectRank(available[(available.indexOf(RANK) + 1) % available.length]);
    }, 12000);
  });
  document.querySelectorAll("#table th[data-k]").forEach((th) => th.addEventListener("click", () => {
    const k = th.dataset.k;
    SORT = SORT.k === k ? { k, dir: -SORT.dir } : { k, dir: k === "champ" ? 1 : -1 };
    renderRows();
  }));
  $("#rows").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-c]"); if (tr) openChamp(tr.dataset.c, ROLE); });
  window.addEventListener("hashchange", () => {   // a link to another champion (#Name/ROLE) while the page is open
    const [c, r] = decodeURIComponent(location.hash.slice(1)).split("/");
    if (!c || !ROLES.includes(r) || (SEL && SEL.champ === c && SEL.role === r)) return;
    SEL = { champ: c, role: r };
    if (r !== ROLE) { ROLE = r; renderTabs(); loadRole(); } else openChamp(c, r);
  });
  $("#rows").addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr[data-c]");
    if (!tr) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openChamp(tr.dataset.c, ROLE); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const nx = e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling;
      if (nx?.dataset.c) { nx.focus(); openChamp(nx.dataset.c, ROLE); }
    }
  });
}
init();
