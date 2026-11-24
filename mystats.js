"use strict";
/* My Stats (the second tab on the board page): your recent games from the League client next to the
   average pro in your role, stat by stat. The numbers come from /api/mystats: serve.py on the PC; on the
   website the League helper reads the client's match history and the engine in the page works them out.
   app.js opens it (ACPMyStats.open) and closes it when you go back to the board. */
(() => {
  const ROLE_NAME = { TOP: "Top", JNG: "Jungle", MID: "Mid", BOT: "Bot", SUP: "Support" };
  const QUEUES = [["ranked", "Ranked Solo/Duo"], ["flex", "Ranked Flex"], ["draft", "Normal Draft"], ["all", "All Rift games"]];
  const COUNTS = [20, 50];
  const PREF = "acp-mystats-prefs";
  const load_ = () => { try { return JSON.parse(localStorage.getItem(PREF) || "{}") || {}; } catch (e) { return {}; } };
  const P = load_();
  const st = {
    queue: QUEUES.some(([q]) => q === P.queue) ? P.queue : "ranked", count: COUNTS.includes(P.count) ? P.count : 20,
    role: ROLE_NAME[P.role] ? P.role : "", res: null, error: null, loading: false, open: false, dirty: true, seq: 0, h: {},
  };
  const save = () => { try { localStorage.setItem(PREF, JSON.stringify({ queue: st.queue, count: st.count, role: st.role })); } catch (e) { /* private window */ } };
  const root = () => document.getElementById("myStats");
  const web = () => document.documentElement.classList.contains("web");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MINUS = "−";

  // ---- numbers
  function signed(v, d) {
    const r = Number(v.toFixed(d));
    const body = Math.abs(r).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
    return `${r > 0 ? "+" : r < 0 ? MINUS : "±"}${body}`;
  }
  function fmt(v, f) {
    if (v == null || !Number.isFinite(v)) return "–";
    switch (f) {
      case "pct": return `${Math.round(v * 100)}%`;
      case "f0": return Math.round(v).toLocaleString();
      case "f1": return v.toFixed(1);
      case "f2": return v.toFixed(2);
      case "sgn0": return signed(v, 0);
      case "sgn1": return signed(v, 1);
      default: return String(Math.round(v * 100) / 100);
    }
  }
  function gapText(x) {   // the difference: points for shares, the same units for leads and counts per game, else a percentage
    if (x.gap == null) return "";
    if (x.show === "pts" || x.fmt === "pct") { const p = Math.round(x.gap * 100); return `${p > 0 ? "+" : p < 0 ? MINUS : "±"}${Math.abs(p)} pts`; }
    if (x.show === "abs" || x.fmt === "sgn0" || x.fmt === "sgn1") return signed(x.gap, ["sgn1", "f1"].includes(x.fmt) ? 1 : x.fmt === "f2" ? 2 : 0);
    if (x.rel == null) return "";
    const p = Math.round(x.rel * 100);
    return `${p > 0 ? "+" : p < 0 ? MINUS : "±"}${Math.abs(p)}%`;
  }
  function ago(iso) {
    const t = Date.parse(iso || "");
    if (!Number.isFinite(t)) return "";
    const s = Math.max(0, (Date.now() - t) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    return `${Math.round(s / 86400)} days ago`;
  }
  const day = (d) => { const t = new Date(`${d}T12:00:00`); return Number.isFinite(t.getTime()) ? t.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : d; };
  const img = (name, cls = "") => { const src = st.h.champImg?.(name); return src ? `<img src="${esc(src)}" alt="" class="${cls}" loading="lazy">` : ""; };

  // ---- loading
  async function load(fresh = false) {
    const seq = ++st.seq;
    const { queue, count, role } = st;
    if (st.res && (st.res.queue !== queue || st.res.count !== count || (role && st.res.role !== role))) st.res = null;
    st.error = null;
    st.loading = true;
    render();
    const q = new URLSearchParams({ queue, count: String(count) });
    if (role) q.set("role", role);
    if (fresh) q.set("fresh", "1");
    let r = null, data = {};
    try {
      r = await fetch(`/api/mystats?${q}`, { cache: "no-store" });
      data = (await r.json().catch(() => null)) || {};
    } catch (e) {
      data = { error: `Couldn't load your stats (${e.message || e}).` };
    }
    if (seq !== st.seq) return;   // (a newer look-up took over)
    st.loading = false;
    if (r?.ok && data.groups && data.queue === queue && data.count === count) {
      st.res = data;
      st.error = null;
    } else {
      if (data.empty) st.res = null;
      st.error = data.error ? data : { error: r?.ok ? "The response didn't match this selection. Try Refresh."
        : `Couldn't load your stats (error ${r?.status ?? "?"}).` };
    }
    render();
  }

  // ---- drawing
  function controls() {
    const seg = (items, cur, attr) => `<div class="seg mid" role="group">${items.map(([v, label]) =>
      `<button type="button" ${attr}="${v}" class="${String(v) === String(cur) ? "on" : ""}" aria-pressed="${String(v) === String(cur)}">${esc(label)}</button>`).join("")}</div>`;
    return `<div class="ms-controls">
      <div class="field"><span class="field-name">Games from</span>${seg(QUEUES, st.queue, "data-q")}</div>
      <div class="field"><span class="field-name">How many</span>${seg(COUNTS.map((n) => [n, `Last ${n}`]), st.count, "data-n")}</div>
      <button type="button" class="gold" data-act="refresh" title="Read your games from League again"${st.loading ? " disabled" : ""}>↻ Refresh</button>
    </div>`;
  }

  function status() {
    const r = st.res, e = st.error;
    if (st.loading) {
      const queue = QUEUES.find(([id]) => id === st.queue)[1];
      return `<div class="ms-status" role="status"><i class="spin-inline" aria-hidden="true"></i>Loading ${esc(queue)} from League…</div>`;
    }
    if (e) {
      const why = esc(e.error || "Something went wrong.");
      if (!r) return `<div class="ms-status bad">${why}</div>`;   // (the card below has the buttons)
      const fix = e.no_helper || e.old_helper ? `<button type="button" data-act="league">League helper</button>` : "";
      return `<div class="ms-status warn">${why} Showing the last games read. ${fix}<button type="button" data-act="refresh">Try again</button></div>`;
    }
    if (!r) return "";
    const when = ago(r.fetched);
    return r.stale
      ? `<div class="ms-status warn">${esc(r.stale_why || "League isn't open.")} Showing the games read ${esc(when || "earlier")}; open League${web() ? " and the League helper" : ""}, then Refresh for your newest games.
        ${web() ? `<button type="button" data-act="league">League helper</button>` : ""}<button type="button" data-act="refresh">Try again</button></div>`
      : `<div class="ms-status">From your League client's match history${when ? ` · read ${esc(when)}` : ""} · no Riot key needed</div>`;
  }

  function head() {
    const r = st.res;
    const wr = r && r.games ? Math.round((100 * r.wins) / r.games) : null;
    return `<article class="card ms-head">
      <div class="ms-who">
        <h2>My Stats</h2>
        ${r ? `<div class="ms-name"><b>${esc(r.account?.name || "You")}</b>${r.rank ? `<span class="ms-rank">${esc(r.rank)}</span>` : ""}</div>
        <div class="ms-sub">Your last ${r.all_games} ${esc(r.queue_name)} game${r.all_games === 1 ? "" : "s"} · as ${esc(ROLE_NAME[r.role] || r.role)}: ${r.games} game${r.games === 1 ? "" : "s"}, ${r.wins}–${r.games - r.wins}${wr != null ? ` (${wr}% wins)` : ""}</div>`
        : `<div class="ms-sub">Every stat from your recent games next to the average pro in your role.</div>`}
      </div>
      ${controls()}
      ${status()}
    </article>`;
  }

  function roles(r) {
    const list = Object.entries(r.roles || {});
    if (list.length < 2) return "";
    return `<div class="ms-roles"><span class="field-name">Role</span><div class="seg mid" role="group" aria-label="Role">${list.map(([role, n]) =>
      `<button type="button" data-role="${role}" class="${role === r.role ? "on" : ""}" aria-pressed="${role === r.role}">${esc(ROLE_NAME[role] || role)} <small>${n}</small></button>`).join("")}</div></div>`;
  }

  function rowsByKey(r) {
    const by = {};
    r.groups.forEach((g) => g.rows.forEach((x) => { by[x.key] = x; }));
    return by;
  }

  function summary(r) {
    const by = rowsByKey(r);
    const item = (k) => {
      const x = by[k];
      if (!x) return "";
      return `<li class="v-${x.verdict}"><span class="ms-sl">${esc(x.label)}</span><span class="ms-sv"><b>${fmt(x.you, x.fmt)}</b> <i>vs</i> ${fmt(x.pro, x.fmt)} <em>${gapText(x)}</em></span></li>`;
    };
    return `<div class="ms-summary">
      <article class="card ms-best"><h2>Your strengths</h2><p class="muted">Where you're closest to (or past) pro ${esc(r.role_word)}</p>
        <ul>${r.best.map(item).join("") || `<li class="v-info"><span class="ms-sl">No stat at pro level yet: the closest ones are in the lists below.</span></li>`}</ul></article>
      <article class="card ms-worst"><h2>Biggest gaps</h2><p class="muted">Where pro ${esc(r.role_word)} pull furthest ahead</p>
        <ul>${r.worst.map(item).join("") || `<li class="v-info"><span class="ms-sl">No big gaps: every stat is close to the pros'.</span></li>`}</ul></article>
    </div>`;
  }

  function bar(x, r) {
    const band = x.band || [];
    const vals = [x.you, x.pro, ...band].filter((v) => v != null && Number.isFinite(v));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || Math.abs(hi) * 0.1 || 1;
    lo -= pad; hi += pad;
    const at = (v) => `${(((v - lo) / (hi - lo)) * 100).toFixed(1)}%`;
    const bandEl = band.length === 2 ? `<i class="band" style="left:${at(band[0])};width:calc(${at(band[1])} - ${at(band[0])})"></i>` : "";
    return `<span class="ms-bar" aria-hidden="true">${bandEl}<i class="pro" style="left:${at(x.pro)}"></i><i class="you" style="left:${at(x.you)}"></i></span>`;
  }

  function row(x, r) {
    const vs = x.champ_games ? (x.champ_games === x.games ? "pros on your champions" : `pros on your champions in ${x.champ_games} of ${x.games} games, all pro ${r.role_word} in the rest`)
      : `all pro ${r.role_word}`;
    const beats = x.beats != null ? ` You beat ${Math.round(x.beats * 100)}% of pro ${r.role_word} (their own averages).` : "";
    const tip = `${x.label}: you ${fmt(x.you, x.fmt)} over ${x.games} game${x.games === 1 ? "" : "s"}; ${vs}: ${fmt(x.pro, x.fmt)}.${beats}`
      + (x.better === 0 ? " Neither more nor less is better here: it depends on your champion." : "");
    return `<div class="ms-row v-${x.verdict}" title="${esc(tip)}">
      <span class="ms-label">${esc(x.label)}</span><span class="ms-you">${fmt(x.you, x.fmt)}</span><span class="ms-pro">${fmt(x.pro, x.fmt)}</span>
      <span class="ms-gap">${gapText(x)}</span>${bar(x, r)}</div>`;
  }

  function group(g, r) {
    return `<article class="card ms-group"><h2>${esc(g.label)}${g.note ? `<small>${esc(g.note)}</small>` : ""}</h2>
      <div class="ms-cols" aria-hidden="true"><span></span><span>You</span><span>Pros</span><span>Gap</span><span class="ms-cbar">pros <i class="band"></i> · avg <i class="pro"></i> · you <i class="you"></i></span></div>
      ${g.rows.map((x) => row(x, r)).join("")}</article>`;
  }

  function delta(you, pro, f, better) {   // a table cell's small "vs pros" line
    if (you == null || pro == null) return "";
    let txt, good;
    if (f === "sgn0") { if (Math.abs(pro) < 1) return ""; const d = you - pro; txt = signed(d, 0); good = d * better; }   // (against the role's 0 the lead says it all)
    else if (f === "pct") { const d = Math.round((you - pro) * 100); txt = `${d > 0 ? "+" : d < 0 ? MINUS : "±"}${Math.abs(d)} pts`; good = d * better; }
    else { if (!pro) return ""; const p = Math.round((you / pro - 1) * 100); txt = `${p > 0 ? "+" : p < 0 ? MINUS : "±"}${Math.abs(p)}%`; good = p * better; }
    const rel = f === "sgn0" ? Math.abs(you - pro) / 400 : f === "pct" ? Math.abs(you - pro) / 0.1 : Math.abs(you / pro - 1) / 0.1;
    return `<small class="${rel < 1 ? "flat" : good > 0 ? "up" : "down"}">${txt}</small>`;
  }

  const CHAMP_COLS = [["kda", "KDA", "f2", 1], ["cspm", "CS / min", "f1", 1], ["gpm", "Gold / min", "f0", 1], ["dpm", "Damage / min", "f0", 1],
    ["kp", "Kill part.", "pct", 1], ["vspm", "Vision / min", "f2", 1], ["gd15", "Gold lead @15", "sgn0", 1], ["deaths", "Deaths", "f1", -1]];

  function champs(r) {
    if (!r.by_champion?.length) return "";
    const head = `<tr><th>Champion</th><th>Games</th><th>Wins</th>${CHAMP_COLS.map(([, l]) => `<th>${esc(l)}</th>`).join("")}</tr>`;
    const rows = r.by_champion.map((c) => `<tr><td><span class="ms-ch">${img(c.champ)}<span>${esc(c.champ)}${c.pro_champ ? "" : `<small class="muted">vs all pro ${esc(r.role_word)}</small>`}</span></span></td>
      <td>${c.games}</td><td>${c.wins}–${c.games - c.wins}</td>${CHAMP_COLS.map(([k, , f, b]) => {
        const v = c.stats[k];
        return `<td>${v ? `${fmt(v[0], f)}${delta(v[0], v[1], f, b)}` : "–"}</td>`;
      }).join("")}</tr>`).join("");
    return `<article class="card ms-wide"><h2>Your champions<small>each next to pros on that champion (or all pro ${esc(r.role_word)} when pros rarely play it)</small></h2>
      <div class="ms-scroll"><table class="ms-table">${head}${rows}</table></div></article>`;
  }

  function games(r) {
    if (!r.recent?.length) return "";
    const head = "<tr><th>Date</th><th>Champion</th><th>Result</th><th>K / D / A</th><th>CS / min</th><th>Gold lead @15</th><th>Damage / min</th><th>Vision / min</th><th>Kill part.</th><th>Length</th></tr>";
    const rows = r.recent.map((g) => `<tr><td>${esc(day(g.date))}${g.queue ? `<div class="muted">${esc(g.queue)}</div>` : ""}</td>
      <td><span class="ms-ch">${img(g.champ)}<span>${esc(g.champ)}${g.opp ? `<small class="muted">vs ${esc(g.opp)}</small>` : ""}</span></span></td>
      <td class="${g.win ? "ms-win" : "ms-loss"}">${g.win ? "Win" : "Loss"}</td><td>${g.k} / ${g.d} / ${g.a}</td>
      <td>${fmt(g.cspm, "f1")}</td><td>${fmt(g.gd15, "sgn0")}</td><td>${fmt(g.dpm, "f0")}</td><td>${fmt(g.vspm, "f2")}</td><td>${fmt(g.kp, "pct")}</td>
      <td>${Math.round(g.length)} min</td></tr>`).join("");
    return `<article class="card ms-wide"><h2>Your games<small>as ${esc(ROLE_NAME[r.role] || r.role)}, newest first</small></h2>
      <div class="ms-scroll"><table class="ms-table">${head}${rows}</table></div></article>`;
  }

  function foot(r) {
    const p = r.pro || {};
    const tl = r.timeline_games < r.games ? ` ${r.games - r.timeline_games} of your games had no timeline in the client, so they count only for the end-of-game stats.` : "";
    return `<p class="ms-foot">The pros: ${esc(p.leagues)}, ${esc(day(p.from))} ${esc((p.from || "").slice(0, 4))} to ${esc(day(p.to))} ${esc((p.to || "").slice(0, 4))}
      (${(p.role_games || 0).toLocaleString()} games played by pro ${esc(r.role_word)}). Leads, vision, wards, objectives and the numbers at 10 and 15 minutes come from
      Riot's minute-by-minute timelines, which ${esc(p.tl_leagues)} have (${(p.role_tl_games || 0).toLocaleString()} of those games). Each of your games is held to pros on the same
      champion when they played it ${p.min_champ || 12}+ times, otherwise to all pro ${esc(r.role_word)}. In each bar the shaded part is where the middle 80% of pro
      ${esc(r.role_word)} are (their own averages), the gold line the pro average and the diamond you. Hover a stat for how many pros you beat.${tl}</p>`;
  }

  function emptyState() {
    if (st.loading) return "";
    const e = st.error;
    const pcText = "My Stats reads your last games from your League client's match history. Open League, sign in and press Refresh: no Riot key needed.";
    const webText = "My Stats reads your last games from your League client through the League helper (the same small program that lets the board follow champ select). Start it, open League, then press Refresh.";
    return `<div class="card ms-empty"><div class="ms-empty-icon" aria-hidden="true"></div>
      <h2>${e?.empty ? "No games in that queue" : "Your games, next to the pros"}</h2>
      <p>${e?.empty ? esc(e.error) : esc(web() ? webText : pcText)}</p>
      <div class="ms-empty-act">${web() ? `<button type="button" data-act="league">League helper</button>` : ""}<button type="button" class="gold" data-act="refresh">↻ Refresh</button></div></div>`;
  }

  function render() {
    const el = root();
    if (!el || !st.open) { st.dirty = true; return; }
    const r = st.res;
    el.innerHTML = head() + (r ? roles(r) + summary(r) + `<div class="ms-groups">${r.groups.filter((g) => g.rows.length).map((g) => group(g, r)).join("")}</div>`
      + champs(r) + games(r) + foot(r) : emptyState());
    st.dirty = false;
  }

  // ---- clicks
  document.addEventListener("click", (e) => {
    const el = root();
    if (!el || !st.open || !el.contains(e.target)) return;
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.q) { if (b.dataset.q !== st.queue) { st.queue = b.dataset.q; st.role = ""; save(); load(); } return; }
    if (b.dataset.n) { const n = Number(b.dataset.n); if (n !== st.count) { st.count = n; save(); load(); } return; }
    if (b.dataset.role) { if (b.dataset.role !== st.res?.role) { st.role = b.dataset.role; save(); load(); } return; }
    if (b.dataset.act === "refresh") return load(true);
    if (b.dataset.act === "league") return st.h.league?.();
  });

  window.ACPMyStats = {
    open(h = {}) {   // h: { champImg(name), league() } from the board page
      st.h = h;
      st.open = true;
      const el = root();
      if (el) el.hidden = false;
      if (!st.loading && !st.res && !st.error) load();
      else if (st.dirty) render();
    },
    close() {
      st.open = false;
      const el = root();
      if (el) el.hidden = true;
    },
  };
})();
