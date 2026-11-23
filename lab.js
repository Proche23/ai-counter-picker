"use strict";
/* Model Lab: renders data/lab_report.json (walk-forward results) */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x, d = 0) => (x == null ? "-" : `${(x * 100).toFixed(d)}%`);
const SERIES = [["draft", "#3987e5", "Draft only"], ["team strength (Elo)", "#d95926", "Team strength"], ["team + draft", "#199e70", "Team + draft"]];
const MODEL_ORDER = ["coin flip", "map side only", "draft", "draft + players", "team strength (Elo)", "team + draft"];
const MODEL_NOTE = {
  "coin flip": "no information: always backs the first-pick side", "map side only": "blue-side advantage only", "draft": "champion records + map side",
  "draft + players": "+ each player's record on the champion",
  "team strength (Elo)": "team rating from results only", "team + draft": "used when you pick both teams",
};

function scale(x, lo, hi) { return Math.max(0, Math.min(100, ((x - lo) / (hi - lo)) * 100)); }

function barRow(name, value, { lo = 0.4, hi = 0.7, ci = null, ref = 0.5, said = null, label = null, dim = false, title = "" } = {}) {
  const w = scale(value, lo, hi);
  const whisk = ci ? `<div class="whisker" style="left:${scale(ci[0], lo, hi)}%;width:${scale(ci[1], lo, hi) - scale(ci[0], lo, hi)}%"></div>` : "";
  const refl = ref != null ? `<div class="ref" style="left:${scale(ref, lo, hi)}%"></div>` : "";
  const saidm = said != null ? `<div class="said" style="left:${scale(said, lo, hi)}%" title="model said ${pct(said, 1)}"></div>` : "";
  return `<div class="bar-row" title="${esc(title)}"><div class="name ${dim ? "dim" : ""}">${name}</div>
    <div class="track">${refl}<div class="fill ${dim ? "dim" : ""}" style="width:${w}%"></div>${whisk}${saidm}</div>
    <div class="val">${label ?? pct(value, 1)}</div></div>`;
}
const axis = (lo, hi, f = pct) => `<div class="axis-note"><span>${f(lo)}</span><span>${f((lo + hi) / 2)}</span><span>${f(hi)}</span></div>`;

// accuracy over the last three seasons, from the per-year table (games-weighted)
function recentAcc(lab, key, years = 3) {
  const ys = Object.keys(lab.by_year || {}).sort().slice(-years);
  let n = 0, hit = 0;
  for (const y of ys) { const v = lab.by_year[y]; n += v.games; hit += v[key] * v.games; }
  return n ? { acc: hit / n, from: ys[0], to: ys[ys.length - 1], games: n } : null;
}

function hero(lab) {
  const m = lab.models, info = lab.model_info || {};
  const rT = recentAcc(lab, "team + draft"), rD = recentAcc(lab, "draft");
  const multiYear = Object.keys(lab.by_year || {}).length > 3;
  const tk = info.predictor_topk || {}, bk = info.baseline_topk || {};
  const m15 = (lab.through_game?.minutes || []).find((x) => x.minute === 15);
  return `<section class="card"><h2>How the AI tests itself</h2>
    <p class="lead">It replays every pro game in order. Before each game it predicts the winner using only earlier games, again after every pick of the draft, and (for games with a Riot timeline) at every 5 minutes of the game. Then it checks the result, learns why the winner won and re-learns every ${lab.step_days} days. Nothing here is fitted to answers it already knew.</p>
    <div class="tiles">
      <div class="tile"><div class="v">${lab.games.toLocaleString()}</div><div class="k">pro games predicted before the result</div></div>
      <div class="tile"><div class="v">${pct(m["team + draft"].accuracy, 1)}</div><div class="k">called correctly with team strength + draft${multiYear && rT ? ` (${rT.from}-${rT.to}: ${pct(rT.acc, 1)})` : ""}</div></div>
      <div class="tile"><div class="v">${pct(m["draft"].accuracy, 1)}</div><div class="k">called correctly from the draft alone${multiYear && rD ? ` (${rD.from}-${rD.to}: ${pct(rD.acc, 1)})` : ""}</div></div>
      <div class="tile"><div class="v">${pct(tk["5"])}</div><div class="k">real next pick inside the predictor's top 5 (popularity guess: ${pct(bk["5"])})</div></div>
      ${m15 ? `<div class="tile"><div class="v">${pct(m15.state_draft.accuracy, 1)}</div><div class="k">called correctly at 15 minutes (game state + draft, ${m15.games.toLocaleString()} games)</div></div>` : ""}
    </div></section>`;
}

function models(lab) {
  const rows = MODEL_ORDER.filter((k) => lab.models[k]).map((k) => {
    const m = lab.models[k];
    return barRow(`${esc(k)}<div class="muted">${esc(MODEL_NOTE[k] || "")}</div>`, m.accuracy,
      { ci: m.acc_ci, title: `${k}: ${pct(m.accuracy, 1)} correct (95% range ${pct(m.acc_ci[0], 1)}-${pct(m.acc_ci[1], 1)}), log-loss ${m.logloss.toFixed(3)}, ${m.games} games` });
  });
  const exp = Object.keys(lab.models).filter((k) => !MODEL_ORDER.includes(k)).map((k) => {
    const m = lab.models[k];
    return barRow(`${esc(k)}<div class="muted">experiment: didn't beat the model above, not used</div>`, m.accuracy,
      { ci: m.acc_ci, dim: true, title: `${k}: ${pct(m.accuracy, 1)} (log-loss ${m.logloss.toFixed(3)})` });
  });
  return `<section class="card"><h2>Which model calls the winner best</h2>
    <p class="lead">Bar = share of games called correctly. White whisker = 95% range. Dashed line = coin flip.</p>
    <div class="bars">${rows.join("")}${exp.join("")}</div>${axis(0.4, 0.7)}</section>`;
}

function calibration(lab) {
  const block = (name) => {
    const cal = lab.calibration?.[name];
    if (!cal) return "";
    const rows = Object.entries(cal).filter(([, v]) => v.games).map(([k, v]) =>
      barRow(`Said ${esc(k)}<div class="muted">${v.games} games</div>`, v.won / v.games,
        { lo: 0.3, hi: 0.9, said: v.said, ref: null, label: pct(v.won / v.games), title: `model said ${pct(v.said, 1)} on average; the favorite won ${v.won}/${v.games}` }));
    const fix = lab.calibration_fix?.[name];
    return `<div><h3>${esc(name)}</h3><div class="bars">${rows.join("")}</div>${axis(0.3, 0.9)}
      ${fix ? `<p class="muted">Correction now applied: logit × ${fix[0].toFixed(2)}${fix[0] < 0.95 ? " (it was overconfident, so percentages are pulled toward 50%)" : ""}</p>` : ""}</div>`;
  };
  return `<section class="card"><h2>Calibration: when it says 65%, does the favorite win 65%?</h2>
    <p class="lead">Bar = how often the favorite actually won. White tick = what the model said on average. Tick on the bar's end = honest percentages.</p>
    <div class="twocol">${block("team + draft")}${block("draft")}</div></section>`;
}

function why(lab) {
  const rows = Object.entries(lab.why || {}).map(([k, v]) =>
    barRow(esc(k), v.share, { lo: 0, hi: 0.5, ref: null, label: `${pct(v.share)} · ${v.games}`, title: `${v.games} games` }));
  const up = Object.entries(lab.upset_patterns || {}).map(([k, n]) => `${esc(k)} (${n})`).join(" · ");
  return `<section class="card"><h2>Why the winner won</h2>
    <p class="lead">"Better draft" = the draft-only model favored them. "Stronger team" = the team rating favored them.</p>
    <div class="bars">${rows.join("")}</div>${axis(0, 0.5)}
    ${up ? `<p class="muted">Full upsets (worse draft and weaker team) mostly came from: ${up}.</p>` : ""}</section>`;
}

function swing(lab) {
  const v = lab.variability || {};
  return `<section class="card"><h2>How much does a draft swing one game?</h2>
    <p class="lead">Even a strong draft only tilts the odds. A 60% draft still loses 4 games in 10.</p>
    <div class="tiles">
      <div class="tile"><div class="v">${pct(v.draft_edge_median)}</div><div class="k">typical (median) draft favorite</div></div>
      <div class="tile"><div class="v">${pct(v.draft_edge_p90)}</div><div class="k">top 10% of drafts reach this</div></div>
      <div class="tile"><div class="v">${pct(v.draft_edge_max)}</div><div class="k">most lopsided draft seen</div></div>
      <div class="tile"><div class="v">±${pct((v.ci90_width_median || 0) / 2, 1)}</div><div class="k">typical 90% uncertainty on one draft's %</div></div>
      <div class="tile"><div class="v">${pct(v.strong_draft_favourite_wr)}</div><div class="k">win rate of drafts rated 58%+ (${v.strong_draft_games} games)</div></div>
    </div></section>`;
}

function identity(lab) {
  const rows = Object.entries(lab.identity || {}).map(([k, v]) =>
    barRow(`${esc(k)}<div class="muted">${v.games} team-games</div>`, v.wr, { lo: 0.4, hi: 0.6, ci: [v.lo, v.hi], title: `${pct(v.wr, 1)} (95% range ${pct(v.lo)}-${pct(v.hi)})` }));
  const mt = (lab.identity_matchups || []).slice(0, 10).map((m) =>
    `<tr><td>${esc(m.a)}</td><td>${esc(m.b)}</td><td class="num">${pct(m.a_wr)}</td><td class="num">${pct(m.lo)}-${pct(m.hi)}</td><td class="num">${m.games}</td></tr>`).join("");
  const tempo = ["under 28 min", "28-35 min", "over 35 min"].filter((k) => lab.tempo?.[k]).map((k) => {
    const t = lab.tempo[k];
    return barRow(`${k}<div class="muted">${t.games} games</div>`, t.early_comp_wr, { lo: 0.3, hi: 0.7, ci: [t.lo, t.hi] });
  }).join("");
  return `<section class="card"><h2>Comp identity: does the style itself win?</h2>
    <p class="lead">Win rate of each comp style, with 95% ranges. Ranges crossing the dashed 50% line are not proven edges. When the lab added identity matchups as a feature, out-of-sample accuracy did not improve, so the win model ignores them and only the written game plans use them.</p>
    <div class="twocol"><div><div class="bars">${rows.join("")}</div>${axis(0.4, 0.6)}</div>
    <div><div style="overflow-x:auto"><table class="t"><thead><tr><th>Style</th><th>vs</th><th>Won</th><th>95% range</th><th>Games</th></tr></thead><tbody>${mt}</tbody></table></div></div></div>
    <h3>Tempo check: the earlier-scaling comp's win rate by game length</h3><div class="bars">${tempo}</div>${axis(0.3, 0.7)}</section>`;
}

function sideAndFollow(lab) {
  const ms = Object.entries(lab.map_side || {}).map(([yr, x]) =>
    barRow(`${yr}<div class="muted">${x.games} games · first pick took blue ${pct(x.fp_took_blue)}</div>`, x.blue_wr,
      { lo: 0.4, hi: 0.6, ci: [x.lo, x.hi], title: `blue side won ${pct(x.blue_wr, 1)} (95% range ${pct(x.lo)}-${pct(x.hi)})` })).join("");
  const ft = lab.follow_test;
  let follow = "";
  if (ft) {
    const b = ft.win_rate_by_picks_in_ai_top3 || {};
    const rows = Object.entries(b).filter(([, v]) => v.games >= 20).map(([k, v]) =>
      barRow(`${k} of 5 picks in the AI's top 3<div class="muted">${v.games} team-games</div>`, v.wr, { lo: 0.3, hi: 0.7 })).join("");
    const adj = ft.adjusted || {};
    follow = `<h3>Do teams that draft like the AI win more? (${ft.games} games since ${esc(ft.since)})</h3>
      <div class="bars">${rows}</div>${axis(0.3, 0.7)}
      <p class="muted">Raw, yes: teams with 2-3 AI-style picks won more. But once team strength is controlled for, the win % a team "left on the table" by the AI's model is not a significant predictor (z = ${adj.z == null ? "-" : adj.z.toFixed(1)}). Pros picked the AI's #1 choice ${pct(ft.engine_top1_rate)} of the time (top 3: ${pct(ft.engine_top3_rate)}). Draft is a real but small edge.</p>`;
  }
  return `<section class="card"><h2>Map side and following the AI</h2>
    <p class="lead">Since 2026 the team with first selection can take first pick or a map side. Blue side has been the better choice, and the win model now includes it.</p>
    <h3>Blue side win rate by year</h3><div class="bars">${ms}</div>${axis(0.4, 0.6)}${follow}</section>`;
}

function agreement(lab) {
  const rows = Object.entries(lab.holdouts || {}).filter(([, h]) => h.ban_top).map(([name, h]) =>
    `<tr><td>${esc(name.split("/").slice(-2).join(" "))}</td>
      <td class="num">${pct(h.top["5"])} <span class="muted">(${pct(h.baseline_top["5"])})</span></td>
      <td class="num">${pct(h.ban_top["5"])} <span class="muted">(${pct(h.ban_baseline_top["5"])})</span></td>
      <td class="num">${h.verdict_accuracy != null ? pct(h.verdict_accuracy, 1) : "-"}</td></tr>`).join("");
  if (!rows) return "";
  return `<section class="card"><h2>Held-out events: agreement with pros</h2>
    <p class="lead">The whole event was hidden from the engine, then replayed. "Top 5" = the pro team's real pick or ban was in the engine's top 5. In brackets: a "most popular champion" guess. The engine's picks optimize win chance rather than copying pros, so pick agreement sits below the popularity guess on purpose. Bans are ranked by how likely the enemy is to take it × how much it helps them.</p>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Held-out event</th><th>Picks in top 5</th><th>Bans in top 5</th><th>Winner called</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function months(lab) {
  const legend = SERIES.map(([, c, l]) => `<span><i style="background:${c}"></i>${l}</span>`).join("");
  const long = Object.keys(lab.by_month || {}).length > 36;
  return `<section class="card"><h2>Accuracy over time</h2>
    <p class="lead">Each point is that ${long ? "quarter" : "month"}'s share of games called correctly, predicted live. Hover for numbers.</p>
    <div class="legend">${legend}</div><div class="chart-wrap" id="monthChart"></div></section>`;
}

function drawMonths(lab) {
  const host = $("#monthChart");
  if (!host) return;
  let data = Object.entries(lab.by_month || {}).filter(([, v]) => v.games >= 20);
  if (!data.length) return;
  if (data.length > 36) {  // long histories read better by quarter (games-weighted)
    const q = new Map();
    for (const [m, v] of data) {
      const key = `${m.slice(0, 4)}-Q${Math.floor((Number(m.slice(5, 7)) - 1) / 3) + 1}`;
      const acc = q.get(key) || { games: 0 };
      for (const [k] of SERIES) acc[k] = (acc[k] || 0) + v[k] * v.games;
      acc.games += v.games;
      q.set(key, acc);
    }
    data = [...q.entries()].map(([k, a]) => [k, Object.fromEntries([...SERIES.map(([s]) => [s, a[s] / a.games]), ["games", a.games]])]);
  }
  const W = Math.max(320, host.clientWidth), H = 260, P = { l: 40, r: 14, t: 12, b: 28 };
  const lo = 0.4, hi = 0.8;
  const x = (i) => P.l + (i * (W - P.l - P.r)) / Math.max(1, data.length - 1);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="Monthly accuracy by model">`;
  for (const g of [0.4, 0.5, 0.6, 0.7, 0.8]) {
    s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(g)}" y2="${y(g)}" stroke="${g === 0.5 ? "#8c8a82" : "#1d2635"}" ${g === 0.5 ? 'stroke-dasharray="4 4"' : ""}/>`;
    s += `<text x="${P.l - 6}" y="${y(g) + 4}" text-anchor="end">${pct(g)}</text>`;
  }
  // long histories: label each January with its year; short ones: every other month
  data.forEach(([m], i) => {
    const lbl = m.includes("-Q") ? (m.endsWith("Q1") ? m.slice(0, 4) : null) : (i % 2 === 0 || data.length < 12 ? m.slice(2) : null);
    if (lbl) s += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${lbl}</text>`;
  });
  for (const [key, color] of SERIES) {
    const pts = data.map(([, v], i) => `${x(i)},${y(v[key])}`).join(" ");
    s += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>`;
    if (data.length <= 48) data.forEach(([, v], i) => { s += `<circle cx="${x(i)}" cy="${y(v[key])}" r="4" fill="${color}" stroke="#0a1428" stroke-width="2"/>`; });
  }
  s += `<line id="xh" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" stroke="#c8aa6e" stroke-width="1" opacity="0"/>`;
  s += `<rect x="${P.l}" y="${P.t}" width="${W - P.l - P.r}" height="${H - P.t - P.b}" fill="transparent" id="hit"/></svg>`;
  host.innerHTML = s + `<div class="tip" id="tip"></div>`;
  const tip = $("#tip"), xh = $("#xh");
  $("#hit").addEventListener("mousemove", (e) => {
    const r = host.getBoundingClientRect();
    const i = Math.max(0, Math.min(data.length - 1, Math.round(((e.clientX - r.left - P.l) / (W - P.l - P.r)) * (data.length - 1))));
    const [m, v] = data[i];
    xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("opacity", "0.7");
    tip.innerHTML = `<b>${m}</b> · ${v.games} games<br>` + SERIES.map(([k, c, l]) => `<span style="color:${c}">●</span> ${l}: ${pct(v[k], 1)}`).join("<br>");
    tip.style.opacity = 1;
    tip.style.left = `${Math.min(x(i) + 12, W - 170)}px`;
    tip.style.top = `${P.t + 6}px`;
  });
  $("#hit").addEventListener("mouseleave", () => { tip.style.opacity = 0; xh.setAttribute("opacity", "0"); });
}

function seasons(lab) {
  const yr = Object.entries(lab.by_year || {}).map(([y, x]) =>
    `<tr><td>${esc(y)}</td><td class="num">${pct(x.draft, 1)}</td><td class="num">${pct(x["draft + players"], 1)}</td>
      <td class="num">${pct(x["team strength (Elo)"], 1)}</td><td class="num">${pct(x["team + draft"], 1)}</td><td class="num">${x.games}</td></tr>`).join("");
  const gn = Object.entries(lab.by_game_number || {}).map(([k, x]) =>
    barRow(`${esc(k)}<div class="muted">${x.games} games</div>`, x.draft.acc, { lo: 0.4, hi: 0.7, ci: [x.draft.lo, x.draft.hi],
      label: `${pct(x.draft.acc, 1)}`, title: `draft-only accuracy ${pct(x.draft.acc, 1)}; team + draft ${pct(x["team + draft"].acc, 1)}` })).join("");
  if (!yr) return "";
  return `<section class="card"><div class="twocol"><div><h2>By season</h2>
    <p class="lead">Is the AI stable from year to year? Columns: draft · + players · team · team + draft.</p>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Year</th><th>Draft</th><th>+ Players</th><th>Team</th><th>Team + draft</th><th>Games</th></tr></thead><tbody>${yr}</tbody></table></div></div>
    <div><h2>Game number in a series</h2><p class="lead">Draft-only accuracy by game in the series (95% range). In Fearless, later games force teams off their best champions.</p>
    <div class="bars">${gn}</div>${axis(0.4, 0.7)}</div></div></section>`;
}

function intervals(lab) {
  const iv = lab.intervals;
  if (!iv?.configs?.length) return "";
  const best = Math.min(...iv.configs.map((c) => c["team + draft"]["2024+"].logloss));
  const rows = iv.configs.map((c) => {
    const a = c["team + draft"], d = c.draft, top = a["2024+"].logloss === best;
    return `<tr><td>${esc(c.label)}${top ? ' <span class="verdict dim">lowest log-loss</span>' : ""}</td>
      <td class="num">${pct(a.all.accuracy, 1)}</td><td class="num">${pct(a["2024+"].accuracy, 1)}</td><td class="num">${a["2024+"].logloss.toFixed(4)}</td>
      <td class="num">${pct(d.all.accuracy, 1)}</td><td class="num">${pct(d["2024+"].accuracy, 1)}</td></tr>`;
  }).join("");
  return `<section class="card"><h2>How often should it re-learn, and how long should it remember?</h2>
    <p class="lead">The same walk-forward test over every game, run with different settings: how many days between re-learning, and how fast old games fade (half-life). Log-loss rewards honest percentages (lower is better). Differences under about 0.001 log-loss or half a point of accuracy are noise, so only re-learning as rarely as every 56 days clearly does worse; the default (every 14 days, 2-year half-life) stays.</p>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Setting</th><th>Team + draft (all years)</th><th>Team + draft (since Mar 2024)</th><th>Log-loss (since Mar 2024)</th><th>Draft only (all)</th><th>Draft only (since Mar 2024)</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

// ---- the regions test (py regions_test.py): other regions' games next to LCK / LPL / internationals
const REGION_SHORT = { Korea: "LCK", China: "LPL", International: "Worlds, MSI, EWC, First Stand", Europe: "LEC / EU LCS", "North America": "LCS / LTA North",
  Brazil: "CBLOL / LTA South", Pacific: "LCP / PCS / LMS", Vietnam: "VCS", Japan: "LJL", Americas: "LTA cross-conference",
  "Latin America": "LLA / LLN / CLS", Turkey: "TCL", CIS: "LCL", Oceania: "LCO / OPL", SEA: "GPL",
  "Cross-region": "Rift Rivals, Mid-Season Cup", Other: "teams seen only at internationals" };
const DOMESTIC_ORDER = ["Korea", "China", "International", "Europe", "North America", "Brazil", "Pacific", "Vietnam", "Japan",
  "Latin America", "Turkey", "CIS", "Oceania", "SEA"];
const rlabel = (r) => `${esc(r)}${REGION_SHORT[r] ? `<div class="muted">${esc(REGION_SHORT[r])}</div>` : ""}`;
const sgn4 = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(4)}`;
function regionsTest(lab) {
  const rt = lab.regions_test;
  if (!rt?.configs?.length) return "";
  const rec = rt.recommendation || {};
  const cfgRows = rt.configs.map((c) => {
    const d = c.vs_A, t = c.core["team + draft"], dr = c.core.draft;
    const better = d && d.d_logloss_ci[1] < 0, worse = d && d.d_logloss_ci[0] > 0;
    const v = !d ? '<span class="verdict dim">today</span>' : better ? '<span class="verdict good">better</span>'
      : worse ? '<span class="verdict bad">worse</span>' : '<span class="verdict dim">no clear change</span>';
    return `<tr><td><b>${esc(c.key)}</b> ${esc(c.label)}${rec.key === c.key && c.key !== "A" ? ' <span class="verdict warn">adopted</span>' : ""}</td>
      <td class="num">${pct(t.acc, 1)}</td><td class="num">${pct(dr.acc, 1)}</td><td class="num">${pct(c.intl.acc, 1)}</td><td class="num">${pct(c.intl_lcklpl.acc, 1)}</td>
      <td class="num">${d ? `${sgn4(d.d_logloss)}<div class="muted">${sgn4(d.d_logloss_ci[0])} to ${sgn4(d.d_logloss_ci[1])}</div>` : "-"}</td>
      <td class="num">${c.vs_A_draft ? `${sgn4(c.vs_A_draft.d_logloss)}<div class="muted">${sgn4(c.vs_A_draft.d_logloss_ci[0])} to ${sgn4(c.vs_A_draft.d_logloss_ci[1])}</div>` : "-"}</td><td>${v}</td></tr>`;
  }).join("");
  const tr = Object.entries(rt.transfer || {}).map(([r, x]) =>
    `<tr><td>${rlabel(r)}</td><td class="num">${x.games.toLocaleString()}</td><td class="num">${pct(x.C.draft, 1)}</td><td class="num">${pct(x.C["team + draft"], 1)}</td>
      <td class="num">${pct(x.own.draft, 1)} <span class="muted">${esc(x.own.draft_key)}</span></td><td class="num">${pct(x.own["team + draft"], 1)} <span class="muted">${esc(x.own.team_key)}</span></td></tr>`).join("");
  const offs = Object.entries(rt.region_offsets || {});
  const maxAbs = Math.max(50, ...offs.map(([, v]) => Math.abs(v)));
  const strength = offs.map(([r, v]) => {
    const w = (Math.abs(v) / maxAbs) * 50;
    return `<div class="bar-row" title="${esc(r)}: ${v >= 0 ? "+" : ""}${Math.round(v)} rating points vs the average region"><div class="name">${rlabel(r)}</div>
      <div class="track"><div class="ref" style="left:50%"></div><div class="fill ${v < 0 ? "dim" : ""}" style="left:${v >= 0 ? 50 : 50 - w}%;width:${w}%;border-radius:4px"></div></div>
      <div class="val">${v >= 0 ? "+" : ""}${Math.round(v)}</div></div>`;
  }).join("");
  const wc = rt.win_conditions || {};
  const order = DOMESTIC_ORDER.filter((r) => wc[r]);
  const bestId = (x) => {
    const ids = Object.entries(x.identity || {}).filter(([, v]) => v.games >= 60).sort((a, b) => b[1].wr - a[1].wr);
    return ids.length ? `${esc(ids[0][0])} <span class="muted">${pct(ids[0][1].wr)}</span>` : "-";
  };
  const wins = order.map((r) => {
    const x = wc[r];
    return `<tr><td>${rlabel(r)}</td><td class="num">${x.games.toLocaleString()}</td><td class="num">${pct(x.blue.wr, 1)}</td>
      <td class="num">${x.length_median ? x.length_median.toFixed(1) : "-"} min</td><td class="num">${x.kills_per_min == null ? "-" : x.kills_per_min.toFixed(2)}</td>
      <td class="num">${pct(x.draft_acc, 1)}</td><td class="num">${pct(x.team_acc, 1)}</td>
      <td class="num">${pct(x.fewer_dragons_won?.wr)}</td><td class="num">${pct(x.fewer_kills_won?.wr)}</td><td class="num">${pct(x.more_barons?.wr)}</td><td>${bestId(x)}</td></tr>`;
  }).join("");
  const tempo = order.filter((r) => wc[r].tempo && Object.keys(wc[r].tempo).length).map((r) => {
    const t = wc[r].tempo, cell = (k) => (t[k] ? `${pct(t[k].early_wr)} <span class="muted">(${t[k].games})</span>` : "-");
    return `<tr><td>${esc(r)}</td><td class="num">${cell("under 28 min")}</td><td class="num">${cell("28-35 min")}</td><td class="num">${cell("over 35 min")}</td></tr>`;
  }).join("");
  const meta = rt.meta?.regions || {};
  const champList = (arr) => arr.slice(0, 4).map(([c, a, b]) => `${esc(c)} <span class="muted">${pct(a)} vs ${pct(b)}</span>`).join(", ");
  const metaRows = Object.entries(meta).map(([r, x]) =>
    `<tr><td>${esc(r)}</td><td class="num">${x.corr.toFixed(2)}</td><td class="num">${x.top20_overlap}/20</td><td>${champList(x.more)}</td><td>${champList(x.less)}</td></tr>`).join("");
  const fw = rt.feature_weights || {};
  const feats = ["strength", "counter", "synergy", "comfort", "elo", "side"];
  const fwRows = Object.entries(fw).map(([r, x]) =>
    `<tr><td>${esc(r)} <span class="muted">${x.games.toLocaleString()}</span></td>${feats.map((f) => {
      const v = x.weights[f];
      return `<td class="num" title="z = ${v?.z == null ? "-" : v.z.toFixed(1)}">${v ? `×${v.odds_per_sd.toFixed(2)}` : "-"}${v && v.z != null && Math.abs(v.z) < 2 ? ' <span class="muted">?</span>' : ""}</td>`;
    }).join("")}</tr>`).join("");
  const ig = rt.ingame, igRegs = Object.keys(ig?.regions || {});
  const igRows = igRegs.length ? ["5", "10", "15", "20", "25", "30"].filter((m) => ig.core[m]).map((m) =>
    `<tr><td>${m} min</td><td class="num">${pct(ig.core[m].state_draft, 1)} <span class="muted">(${ig.core[m].games.toLocaleString()})</span></td>${igRegs.map((r) => {
      const x = ig.regions[r][m];
      return `<td class="num">${x ? `${pct(x.state_draft, 1)} <span class="muted">(${x.games})</span>` : "-"}</td>`;
    }).join("")}</tr>`).join("") : "";
  const igBlock = igRows ? `<h3>Through the game: the LCK/international-trained in-game model on other regions</h3>
    <p class="muted">Winner called from the score at each minute plus the draft (games with a Riot timeline; games in brackets).</p>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Minute</th><th>LCK + internationals</th>${igRegs.map((r) => `<th>${esc(r)}</th>`).join("")}</tr></thead><tbody>${igRows}</tbody></table></div>` : "";
  return `<section class="card" id="regions"><h2>Regions test: does what wins in LCK and LPL hold everywhere?</h2>
    <p class="lead">${(rt.games_total || 0).toLocaleString()} pro games from ${rt.regions_seen?.length || 0} regions (${esc(DOMESTIC_ORDER.slice(3).filter((r) => (rt.regions_seen || []).includes(r)).join(", ") || "other regions")}${(rt.regions_seen || []).includes("Cross-region") ? ", plus Rift Rivals and the Mid-Season Cup" : ""} next to LCK, LPL and internationals), each predicted before its result. The same walk-forward test ran under each setting below, and the settings are compared on the same games.</p>
    <p><b>Verdict:</b> ${esc(rec.text || "").replace(/\*\*/g, "")}</p>
    <h3>Does other regions' knowledge predict LCK / LPL / international games better?</h3>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Setting</th><th>Team + draft</th><th>Draft only</th><th>Inter&shy;national</th><th>LCK vs LPL</th><th>Team + draft log-loss vs today</th><th>Draft only log-loss vs today</th><th></th></tr></thead><tbody>${cfgRows}</tbody></table></div>
    <p class="muted">International = all Worlds / MSI / EWC / First Stand games; LCK vs LPL = the ones between an LCK and an LPL team. Log-loss rewards honest percentages; lower is better. Under each change: its 95% range. "Better" means the whole range is below zero.</p>
    <div class="twocol"><div><h3>How well LCK / LPL knowledge predicts each region</h3>
      <p class="muted">C = champion stats from LCK / LPL / internationals only; "own data" = the best setting that also learned from that region's games.</p>
      <div style="overflow-x:auto"><table class="t"><thead><tr><th>Region</th><th>Games</th><th>Draft only</th><th>Team + draft</th><th>Draft, own data</th><th>Team + draft, own data</th></tr></thead><tbody>${tr}</tbody></table></div></div>
      <div><h3>Region strength, learned from games between regions</h3><p class="muted">Rating points vs the average region, added to every team's own rating.</p>
      <div class="bars">${strength}</div></div></div>
    <h3>What wins where (${esc((rt.win_conditions && "2024") || "")}-2026)</h3>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Region</th><th>Games</th><th>Blue side won</th><th>Median length</th><th>Kills / min</th><th>Better draft won</th><th>Stronger team won</th><th>Won with fewer dragons</th><th>Won with fewer kills</th><th>More Barons won</th><th>Best comp style</th></tr></thead><tbody>${wins}</tbody></table></div>
    <p class="muted">Better draft / stronger team: the side the LCK/LPL-trained draft model or the team ratings favored before the game. Won with fewer dragons / kills: the winner ended the game with fewer than the loser.</p>
    <div class="twocol"><div><h3>Earlier-scaling comp's win rate by game length</h3>
      <div style="overflow-x:auto"><table class="t"><thead><tr><th>Region</th><th>Under 28 min</th><th>28-35 min</th><th>Over 35 min</th></tr></thead><tbody>${tempo}</tbody></table></div></div>
      <div><h3>What the win model weighs most in each region</h3><p class="muted">Odds multiplier per 1 standard deviation, fitted on each region's own games since 2022. ? = not proven (z under 2).</p>
      <div style="overflow-x:auto"><table class="t"><thead><tr><th>Region</th>${feats.map((f) => `<th>${f}</th>`).join("")}</tr></thead><tbody>${fwRows}</tbody></table></div></div></div>
    <h3>How close is each meta to LCK + LPL? (pick + ban presence since ${esc((rt.meta?.since || "").slice(0, 4))})</h3>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Region</th><th>Similarity</th><th>Top 20 shared</th><th>Played more there (there vs LCK+LPL)</th><th>Played less there</th></tr></thead><tbody>${metaRows}</tbody></table></div>
    ${igBlock}
    ${moreRegions(lab.regions_more)}
  </section>`;
}

// the leagues added later (LLA, TCL, LCL, OPL / LCO, GPL, Rift Rivals, Mid-Season Cup) and pick likelihood
function moreRegions(m) {
  if (!m?.regions) return "";
  const v = m.vs_before || {}, sgnp = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}`;
  const change = (x) => (x ? `${sgn4(x.d_logloss)} <span class="muted">(${sgn4(x.d_logloss_ci[0])} to ${sgn4(x.d_logloss_ci[1])})</span>` : "-");
  const order = ["Korea", "China", ...DOMESTIC_ORDER.slice(3), "Cross-region"];
  const rows = order.filter((r) => m.regions[r] || m.strength_vs_korea?.[r] != null).map((r) => {
    const x = m.regions[r];
    const s = m.strength_vs_korea?.[r];
    return `<tr${x?.new ? ' class="new"' : ""}><td>${rlabel(r)}${x?.new ? ' <span class="verdict warn">added</span>' : ""}</td>
      <td class="num">${x ? x.games.toLocaleString() : "-"}</td><td class="num">${x ? pct(x.draft, 1) : "-"}</td><td class="num">${x ? pct(x.team_draft, 1) : "-"}</td>
      <td class="num">${s == null ? "-" : s === 0 ? "0" : `${s > 0 ? "+" : "−"}${Math.abs(Math.round(s))}`}</td></tr>`;
  }).join("");
  const p = m.presence;
  const pk = p ? ["1", "3", "5", "10"].map((k) => `<tr><td>Top ${k}</td><td class="num">${pct(p.today[k], 1)}</td><td class="num">${pct(p.adopted[k], 1)}</td>
      <td class="num">${sgnp(p.change[k][0])} pt <span class="muted">(${sgnp(p.change[k][1])} to ${sgnp(p.change[k][2])})</span></td></tr>`).join("") : "";
  return `<h3>More regions (${esc(m.generated)}): LLA, TCL, LCL, OPL / LCO, GPL, Rift Rivals and the Mid-Season Cup</h3>
    <p>${m.games_added.toLocaleString()} more games, each predicted before its result. <b>Verdict:</b> ${esc(m.verdict)}
      On the same ${m.core_games.toLocaleString()} games: team + draft log-loss ${change(v["team + draft"])}, team ratings ${change(v["team strength (Elo)"])}, draft only ${change(v.draft)}.</p>
    <div class="twocol"><div><h3>How the AI does in each region, and how strong it is</h3>
      <p class="muted">Every region's games predicted before their result (with all regions loaded). Strength: rating points vs LCK, learned from games between regions (400 points ≈ 10-to-1 odds).</p>
      <div style="overflow-x:auto"><table class="t"><thead><tr><th>Region</th><th>Games</th><th>Draft only</th><th>Team + draft</th><th>vs LCK</th></tr></thead><tbody>${rows}</tbody></table></div></div>
      ${p ? `<div><h3>Pick likelihood: other regions' picks and bans now count (adopted)</h3>
      <p class="muted">The enemy-pick predictor on ${p.decisions.toLocaleString()} real LCK / LPL / international pick decisions (${p.windows} time windows): how often the real pick was among its top guesses, before and after.</p>
      <div style="overflow-x:auto"><table class="t"><thead><tr><th></th><th>Before</th><th>Now</th><th>Change (95% range)</th></tr></thead><tbody>${pk}</tbody></table></div></div>` : ""}</div>`;
}

function leagues(lab) {
  const rows = Object.entries(lab.by_league || {}).map(([k, v]) =>
    `<tr><td>${esc(k)}</td><td class="num">${pct(v.draft, 1)}</td><td class="num">${pct(v["team + draft"], 1)}</td><td class="num">${v.games}</td></tr>`).join("");
  return `<section class="card"><h2>By league</h2><div style="overflow-x:auto"><table class="t"><thead><tr><th>League</th><th>Draft only</th><th>Team + draft</th><th>Games</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function learned(lab) {
  const block = (name) => {
    const f = lab.importance?.[name];
    if (!f) return "";
    return `<h3>${esc(name)}</h3><div style="overflow-x:auto"><table class="t"><thead><tr><th>Signal</th><th>Odds × per 1 SD</th><th>Certainty (z)</th></tr></thead><tbody>${
      Object.entries(f).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="num">×${v.odds_per_sd.toFixed(2)}</td><td class="num">${v.z == null ? "-" : v.z.toFixed(1)}</td></tr>`).join("")}</tbody></table></div>`;
  };
  return `<section class="card"><h2>What it learned</h2>
    <p class="lead">How much each signal moves the odds. A z above about 2 is a reliable effect; below that it could be noise.</p>
    <div class="twocol"><div>${block("team + draft")}</div><div>${block("draft + players")}</div></div></section>`;
}

function calls(lab) {
  const li = (c, ok) => `<li>${ok ? "✅" : "❌"} ${esc(c.date)} · ${esc(c.game)} <span class="muted">(${esc(c.event)})</span>: ${esc(c.favourite)} ${pct(c.p)}${ok ? "" : `, but ${esc(c.winner)} won`}</li>`;
  return `<section class="card"><h2>Most confident calls</h2><div class="twocol">
    <div><h3>Right</h3><ul class="cond win">${(lab.best_calls || []).map((c) => li(c, true)).join("")}</ul></div>
    <div><h3>Wrong (the upsets)</h3><ul class="cond lose">${(lab.biggest_misses || []).map((c) => li(c, false)).join("")}</ul></div></div></section>`;
}

function history(lab) {
  const h = (lab.history || []).slice().reverse();
  const teams = (lab.top_teams || []).map(([t, r]) => `<tr><td>${esc(t)}</td><td class="num">${Math.round(r)}</td></tr>`).join("");
  const rows = h.map((x) => `<tr><td>${esc(x.fitted)}</td><td>${esc(x.data_through)}</td><td class="num">${x.games ?? "-"}</td>
    <td class="num">${pct(x.oos_accuracy?.draft, 1)}</td><td class="num">${pct(x.oos_accuracy?.team, 1)}</td><td class="num">${pct(x.predictor_topk?.["5"])}</td></tr>`).join("");
  return `<section class="card"><div class="twocol"><div><h2>Learning history</h2>
    <p class="lead">One row per re-learn (update.py runs it after every data refresh).</p>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Learned</th><th>Data through</th><th>Games</th><th>Draft</th><th>Team + draft</th><th>Pick top 5</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">First run</td></tr>'}</tbody></table></div></div>
    <div><h2>Team ratings now</h2><p class="lead">Elo from results only (1500 = average).</p><div style="overflow-x:auto"><table class="t"><tbody>${teams}</tbody></table></div></div></div></section>`;
}

/* ------------------------------------------------ generic line chart */
// series: [{label, color, values: [number|null]}]; labels: x tick labels; divider: index where a dashed
// vertical separator goes (e.g. "game starts"); tipExtra(i) adds a line to the tooltip.
function drawLines(host, { labels, series, lo, hi, ticks, fmt = (v) => pct(v), tickFmt = (v) => pct(v), height = 240, ref = 0.5,
                           divider = null, dividerLabel = "", tipExtra = null, aria = "chart" }) {
  if (!host) return;
  const W = Math.max(300, host.clientWidth), H = height, P = { l: 44, r: 96, t: 14, b: 30 };
  const n = labels.length;
  const x = (i) => P.l + (i * (W - P.l - P.r)) / Math.max(1, n - 1);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  let s = `<svg width="${W}" height="${H}" role="img" aria-label="${esc(aria)}">`;
  for (const g of ticks) {
    const isRef = ref != null && Math.abs(g - ref) < 1e-9;
    s += `<line x1="${P.l}" x2="${W - P.r}" y1="${y(g)}" y2="${y(g)}" stroke="${isRef ? "#8c8a82" : "#1d2635"}" ${isRef ? 'stroke-dasharray="4 4"' : ""}/>`;
    s += `<text x="${P.l - 6}" y="${y(g) + 4}" text-anchor="end">${tickFmt(g)}</text>`;
  }
  const every = Math.ceil(n / Math.max(4, Math.floor((W - P.l - P.r) / 42)));
  labels.forEach((l, i) => { if (i % every === 0 || i === n - 1) s += `<text x="${x(i)}" y="${H - 9}" text-anchor="middle">${esc(l)}</text>`; });
  if (divider != null) {
    const dx = (x(divider) + x(divider + 1)) / 2;
    s += `<line x1="${dx}" x2="${dx}" y1="${P.t}" y2="${H - P.b}" stroke="#785a28" stroke-dasharray="3 4"/>`;
    if (dividerLabel) s += `<text x="${dx + 5}" y="${P.t + 10}">${esc(dividerLabel)}</text>`;
  }
  for (const sr of series) {
    let seg = [];
    const segs = [];
    sr.values.forEach((v, i) => { if (v == null) { if (seg.length) segs.push(seg); seg = []; } else seg.push([x(i), y(Math.max(lo, Math.min(hi, v)))]); });
    if (seg.length) segs.push(seg);
    for (const sg of segs) s += `<polyline points="${sg.map((p) => p.join(",")).join(" ")}" fill="none" stroke="${sr.color}" stroke-width="2" stroke-linejoin="round"/>`;
    sr.values.forEach((v, i) => { if (v != null) s += `<circle cx="${x(i)}" cy="${y(Math.max(lo, Math.min(hi, v)))}" r="4" fill="${sr.color}" stroke="#0a1428" stroke-width="2"/>`; });
  }
  // direct labels at each line's last point, nudged apart so they never overlap
  const ends = series.map((sr) => {
    let i = sr.values.length - 1;
    while (i >= 0 && sr.values[i] == null) i--;
    return i < 0 ? null : { sr, i, yy: y(Math.max(lo, Math.min(hi, sr.values[i]))) };
  }).filter(Boolean).sort((a, b) => a.yy - b.yy);
  for (let k = 1; k < ends.length; k++) if (ends[k].yy - ends[k - 1].yy < 14) ends[k].yy = ends[k - 1].yy + 14;
  for (const e of ends) {
    s += `<circle cx="${W - P.r + 10}" cy="${e.yy - 4}" r="4" fill="${e.sr.color}"/>`;
    s += `<text x="${W - P.r + 18}" y="${e.yy}" style="fill:#cdbe91">${esc(e.sr.short || e.sr.label)}</text>`;
  }
  s += `<line class="xh" x1="0" x2="0" y1="${P.t}" y2="${H - P.b}" stroke="#c8aa6e" stroke-width="1" opacity="0"/>`;
  s += `<rect class="hit" x="${P.l - 10}" y="${P.t}" width="${W - P.l - P.r + 20}" height="${H - P.t - P.b}" fill="transparent"/></svg>`;
  host.innerHTML = s + `<div class="tip"></div>`;
  const tip = host.querySelector(".tip"), xh = host.querySelector(".xh");
  host.querySelector(".hit").addEventListener("mousemove", (e) => {
    const r = host.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - r.left - P.l) / (W - P.l - P.r)) * (n - 1))));
    xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("opacity", "0.7");
    tip.innerHTML = `<b>${esc(labels[i])}</b><br>` + series.filter((sr) => sr.values[i] != null)
      .map((sr) => `<span style="color:${sr.color}">●</span> ${esc(sr.label)}: ${fmt(sr.values[i])}`).join("<br>") +
      (tipExtra ? tipExtra(i) : "");
    tip.style.opacity = 1;
    tip.style.left = `${Math.min(x(i) + 12, W - 200)}px`;
    tip.style.top = `${P.t + 6}px`;
  });
  host.querySelector(".hit").addEventListener("mouseleave", () => { tip.style.opacity = 0; xh.setAttribute("opacity", "0"); });
}
const legendHTML = (series) => `<div class="legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div>`;
const rr = (d) => (d && d.rate != null ? `${pct(d.rate)} <span class="muted">(${pct(d.lo)}-${pct(d.hi)}, n=${d.n.toLocaleString()})</span>` : "-");

/* --------------------------------------------- through the draft */
const DRAFT_SERIES = [{ key: "team", label: "Team + draft", color: "#199e70" }, { key: "draft", label: "Draft only", color: "#3987e5" }];
function throughDraft(lab) {
  const td = lab.through_draft;
  if (!td?.stages?.length) return "";
  const slots = td.slots.map((s) => barRow(`${esc(s.slot)}<div class="muted">${s.side === "B" ? "first-pick team" : "second-pick team"}</div>`,
    s.draft_mean_abs, { lo: 0, hi: 0.05, ref: null, label: `±${pct(s.draft_mean_abs, 1)}`,
      title: `${s.slot} moves the draft-only win chance by ${pct(s.draft_mean_abs, 1)} on average; 1 game in 10 by more than ${pct(s.draft_p90_abs, 1)}` })).join("");
  const sw = td.draft_swing || {}, fl = td.flips || {}, ph = td.phase_share || {};
  const first = td.stages[0], last = td.stages[td.stages.length - 1];
  return `<section class="card"><h2>Through the draft: the win chance after every pick</h2>
    <p class="lead">Every game was re-predicted at each step of its own draft, with models that had not seen it. Before the draft, only the two teams and the map side are known. The line shows how often the favorite at that step went on to win.</p>
    ${legendHTML(DRAFT_SERIES)}<div class="chart-wrap" id="draftChart"></div>
    <div class="twocol"><div><h3>How much each pick moves the win chance</h3><div class="bars">${slots}</div>${axis(0, 0.05, (v) => pct(v, 1))}</div>
    <div><div class="tiles">
      <div class="tile"><div class="v">${pct(last.draft.accuracy, 1)}</div><div class="k">called right by the draft alone after the last pick (${pct(first.draft.accuracy, 1)} before it, from the map side). With team strength: ${pct(first.team.accuracy, 1)} → ${pct(last.team.accuracy, 1)}</div></div>
      <div class="tile"><div class="v">±${pct(sw.median, 1)}</div><div class="k">typical move from the pre-draft line to the locked draft (1 game in 10: ±${pct(sw.p90, 1)})</div></div>
      <div class="tile"><div class="v">${pct(fl.share)}</div><div class="k">of drafts flipped the pre-draft favorite; the new favorite then won ${pct(fl.new_favourite_won?.rate)}</div></div>
      <div class="tile"><div class="v">${pct(ph["last 4 picks (R4-R5)"])}</div><div class="k">of the draft's movement comes from the last four picks (R4-R5, the counter-picks)</div></div>
    </div></div></div></section>`;
}
function drawDraft(lab) {
  const st = lab.through_draft?.stages;
  if (!st?.length) return;
  const vals = st.flatMap((s) => [s.team.accuracy, s.draft.accuracy]);
  const lo = Math.floor(Math.min(...vals, 0.5) * 20) / 20, hi = Math.ceil(Math.max(...vals) * 20) / 20;
  const ticks = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.05) ticks.push(Math.round(t * 100) / 100);
  drawLines($("#draftChart"), {
    labels: st.map((s) => (s.k === 0 ? "Before" : s.label.replace("After ", ""))), lo, hi, ticks, aria: "Accuracy after each pick",
    series: DRAFT_SERIES.map((d) => ({ ...d, values: st.map((s) => s[d.key].accuracy) })),
    fmt: (v) => pct(v, 1), tipExtra: (i) => `<br><span class="muted">${st[i].team.games.toLocaleString()} games</span>`,
  });
}

/* ---------------------------------------------- through the game */
const GAME_SERIES = [
  { key: "pre_game", label: "Pre-game prediction (team + draft)", short: "Pre-game", color: "#199e70" },
  { key: "state", label: "Game state only", short: "State only", color: "#9085e9" },
  { key: "state_draft", label: "Game state + draft", short: "State + draft", color: "#c98500" },
];
function throughGame(lab) {
  const tg = lab.through_game;
  if (!tg?.minutes?.length) return "";
  const rows = tg.minutes.map((m) => `<tr><td>${m.minute} min</td><td class="num">${m.games.toLocaleString()}</td>
    <td class="num">${pct(m.pre_game.accuracy, 1)}</td><td class="num">${pct(m.gold_draft?.accuracy, 1)}</td><td class="num">${pct(m.state.accuracy, 1)}</td><td class="num"><b>${pct(m.state_draft.accuracy, 1)}</b></td>
    <td class="num">${pct(m.gold_leader_won.rate)}</td><td class="num">${pct(m.comeback_2k.rate)}</td><td class="num">${m.draft_weight == null ? "-" : pct(m.draft_weight)}</td></tr>`).join("");
  const m15 = tg.minutes.find((m) => m.minute === 15);
  const gb = m15 ? Object.entries(m15.gold_buckets).filter(([, v]) => v.n >= 20).map(([k, v]) =>
    barRow(`${esc(k)}<div class="muted">${v.n.toLocaleString()} team-games</div>`, v.rate, { lo: 0, hi: 1, ci: [v.lo, v.hi],
      title: `won ${pct(v.rate, 1)} (95% range ${pct(v.lo)}-${pct(v.hi)})` })).join("") : "";
  const bt = m15?.behind_1500_by_tempo || {};
  const bts = ["early", "even", "late"].filter((t) => bt[t]?.n >= 20).map((t) =>
    barRow(`${t === "late" ? "scaling" : t} comps<div class="muted">${bt[t].n.toLocaleString()} team-games</div>`, bt[t].rate,
      { lo: 0, hi: 0.5, ci: [bt[t].lo, bt[t].hi], ref: null, title: `came back ${pct(bt[t].rate, 1)} (95% range ${pct(bt[t].lo)}-${pct(bt[t].hi)})` })).join("");
  return `<section class="card"><h2>Through the game: how predictable is it at each minute?</h2>
    <p class="lead">LCK and international games, re-predicted at 5, 10, … 35 minutes from the score at that moment (gold, kills, towers, dragons, Soul, Elder, Void Grubs, Herald, Baron buff, inhibitors), with and without the pre-game prediction. LPL games have no public minute-by-minute data, so they are not in this test.</p>
    ${legendHTML(GAME_SERIES)}<div class="chart-wrap" id="gameChart"></div>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Minute</th><th>Games still going</th><th>Pre-game only</th><th>Gold + draft</th><th>Game state only</th><th>State + draft</th><th>Gold leader won</th><th>Came back from 2k+ down</th><th>Draft weight kept</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted">Draft weight kept: how much of the pre-game prediction still counts on top of the score (100% = all of it). The draft and the teams keep mattering long after the laning phase.</p>
    <div class="twocol"><div><h3>Win % by gold difference at 15 min</h3><div class="bars">${gb}</div>${axis(0, 1)}</div>
    <div><h3>1,500+ gold behind at 15: who comes back?</h3><div class="bars">${bts}</div>${axis(0, 0.5)}
      <p class="muted">Win rate of teams 1,500+ gold down at 15 min, by the tempo their game plan gave them.</p></div></div></section>`;
}
function drawGame(lab) {
  const ms = lab.through_game?.minutes;
  if (!ms?.length) return;
  drawLines($("#gameChart"), {
    labels: ms.map((m) => `${m.minute} min`), lo: 0.5, hi: 0.9, ticks: [0.5, 0.6, 0.7, 0.8, 0.9], aria: "Accuracy by game minute",
    series: GAME_SERIES.map((d) => ({ ...d, values: ms.map((m) => m[d.key]?.accuracy ?? null) })),
    fmt: (v) => pct(v, 1), tipExtra: (i) => `<br><span class="muted">${ms[i].games.toLocaleString()} games still going</span>`,
  });
}

/* ------------------------------------------------- how games are won */
function winPaths(lab) {
  const wp = lab.win_paths;
  if (!wp?.share) return "";
  const order = wp.order.filter((p) => wp.per_path?.[p]);
  const bars = order.map((p) => {
    const x = wp.per_path[p];
    return barRow(`${esc(p)}<div class="muted">${esc(wp.text[p])}</div>`, wp.share[p], { lo: 0, hi: 0.4, ref: null,
      label: `${pct(wp.share[p])} · ${x.games.toLocaleString()}`, title: `median ${Math.round(x.median_length)} min` });
  }).join("");
  const rows = order.map((p) => {
    const x = wp.per_path[p];
    return `<tr><td>${esc(p)}</td><td class="num">${Math.round(x.median_length)} min</td><td class="num">${pct(x.favourite_won.rate)}</td>
      <td class="num">${pct(x.winner_baron)}</td><td class="num">${pct(x.winner_soul)}</td><td class="num">${pct(x.winner_elder)}</td><td class="num">${x.locked_median} min</td></tr>`;
  }).join("");
  const bt = wp.by_winner_tempo || {};
  const trow = ["early", "even", "late"].filter((t) => bt[t]?.games).map((t) =>
    `<tr><td>${t === "late" ? "scaling" : t} comps <span class="muted">(${bt[t].games.toLocaleString()} wins)</span></td>${order.map((p) => `<td class="num">${pct(bt[t][p])}</td>`).join("")}</tr>`).join("");
  const fw = wp.favourite_wins || {}, up = wp.upsets || {};
  const urow = [["Favorite won", fw], ["Upset", up]].filter(([, d]) => d.games).map(([k, d]) =>
    `<tr><td>${k} <span class="muted">(${d.games.toLocaleString()})</span></td>${order.map((p) => `<td class="num">${pct(d[p])}</td>`).join("")}</tr>`).join("");
  const lk = wp.lead_locked || {};
  return `<section class="card"><h2>How pro games are won</h2>
    <p class="lead">Every game with a minute-by-minute timeline (${wp.games.toLocaleString()} games), sorted by the path the winner took, judged from the gold difference over the game.</p>
    <div class="bars">${bars}</div>${axis(0, 0.4)}
    <div style="overflow-x:auto;margin-top:12px"><table class="t"><thead><tr><th>Path</th><th>Median length</th><th>Pre-game favorite won</th><th>Winner took last Baron</th><th>Soul</th><th>Last Elder</th><th>Lead locked in by</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="twocol" style="margin-top:12px"><div><h3>How each tempo wins</h3><div style="overflow-x:auto"><table class="t"><thead><tr><th>Winner's comp</th>${order.map((p) => `<th>${esc(p)}</th>`).join("")}</tr></thead><tbody>${trow}</tbody></table></div></div>
    <div><h3>Favorites vs upsets</h3><div style="overflow-x:auto"><table class="t"><thead><tr><th></th>${order.map((p) => `<th>${esc(p)}</th>`).join("")}</tr></thead><tbody>${urow}</tbody></table></div>
      <p class="muted">When the winner's gold lead was locked in for good: ${Object.entries(lk).map(([k, v]) => `${esc(k)} ${pct(v)}`).join(" · ")}.</p></div></div></section>`;
}

/* --------------------------------------------- win conditions tested */
const VERDICT = { "holds": ["✔", "good"], "leans true": ["≈", "warn"], "no clear effect": ["–", "dim"], "opposite": ["✖", "bad"] };
function winConditions(lab) {
  const wc = lab.win_conditions;
  if (!wc?.tests?.length) return "";
  const rows = wc.tests.map((t) => {
    const [ic, cls] = VERDICT[t.verdict] || ["?", "dim"];
    return `<tr><td>${esc(t.claim)}<div class="muted">${esc(t.measure)}</div></td>
      <td>${esc(t.a_label)}: ${rr(t.a)}${t.b ? `<br>${esc(t.b_label)}: ${rr(t.b)}` : '<br><span class="muted">coin flip: 50%</span>'}</td>
      <td><span class="verdict ${cls}">${ic} ${esc(t.verdict)}</span><div class="muted">z = ${t.z.toFixed(1)}</div></td></tr>`;
  }).join("");
  const sig = (wc.signatures || []).slice().sort((a, b) => b.extra_lift - a.extra_lift).map((x) =>
    `<tr><td>${esc(x.identity)}</td><td>${esc(x.condition)}</td><td class="num">${pct(x.achieved.rate)}</td>
      <td class="num">${pct(x.win_if_done.rate)}</td><td class="num">${pct(x.win_if_not.rate)}</td>
      <td class="num">${x.extra_lift >= 0 ? "+" : ""}${pct(x.extra_lift)}</td></tr>`).join("");
  const gaps = (wc.gaps || []).map((g) => `<tr><td>${esc(g.gap)}</td><td class="num">${g.games.toLocaleString()}</td><td class="num">${pct(g.won.rate, 1)}</td>
      <td class="num">${pct(g.expected, 1)}</td><td class="num">${g.residual >= 0 ? "+" : ""}${pct(g.residual, 1)}</td><td class="num">${g.z.toFixed(1)}</td></tr>`).join("");
  return `<section class="card"><h2>Win conditions tested against real games</h2>
    <p class="lead">Each claim the game plans make, checked against what actually happened. Tempo and lane priority are relative (one team's "early" is the other team's "scaling"), so those claims are tested against a coin flip, never against their own mirror image. z above 2 = holds; 1-2 = leans true.</p>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Claim in the game plan</th><th>What happened</th><th>Verdict</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${sig ? `<h3>What decides games for each comp style</h3><p class="muted">Win % when the style's own condition happened vs. when it didn't. "Extra" = how much more it matters for this style than for comps in general, so the top rows are the conditions that are really that style's own.</p>
      <div style="overflow-x:auto"><table class="t"><thead><tr><th>Style</th><th>Condition</th><th>Happened</th><th>Won when it did</th><th>Won when it didn't</th><th>Extra</th></tr></thead><tbody>${sig}</tbody></table></div>` : ""}
    ${gaps ? `<h3>Comp gaps (lose conditions): do they hurt beyond what the win model expects?</h3>
      <div style="overflow-x:auto"><table class="t"><thead><tr><th>Gap</th><th>Team-games</th><th>Won</th><th>Model expected</th><th>Difference</th><th>z</th></tr></thead><tbody>${gaps}</tbody></table></div>` : ""}</section>`;
}

/* ------------------------------------------------------- lane phase */
const ROLE_FULL = { TOP: "Top", JNG: "Jungle", MID: "Mid", BOT: "Bot", SUP: "Support" };
function lanePhase(lab) {
  const ln = lab.lanes;
  if (!ln?.importance) return "";
  const bars = Object.entries(ln.importance).map(([ro, x]) => {
    const a = ln.ahead_1k_won?.[ro];
    return barRow(`${ROLE_FULL[ro] || ro}<div class="muted">won ${pct(a?.rate)} when 1k+ ahead at 15 (${a?.n ?? 0} games)</div>`, x.odds_per_1k,
      { lo: 1, hi: 2.4, ref: null, label: `×${x.odds_per_1k.toFixed(2)}`, title: `each 1,000 gold lead in this lane at 15 min multiplies the win odds by ${x.odds_per_1k.toFixed(2)} (z = ${x.z.toFixed(1)})` });
  }).join("");
  const best = (ln.best || []).slice(0, 10).map((b) => `<tr><td>${esc(ROLE_FULL[b.role] || b.role)}</td><td>${esc(b.champion)}</td><td>${esc(b.vs)}</td>
    <td class="num">+${b.gold15.toLocaleString()}</td><td class="num">${b.xp15 >= 0 ? "+" : ""}${b.xp15.toLocaleString()}</td><td class="num">${b.cs15 >= 0 ? "+" : ""}${b.cs15}</td><td class="num">${b.games}</td></tr>`).join("");
  return `<section class="card"><h2>The lane phase: which lane's lead decides games?</h2>
    <p class="lead">Each lane's gold lead at 15 minutes, all five measured together (${ln.games.toLocaleString()} games), so every number is that lane's own effect.</p>
    <div class="twocol"><div><h3>Win odds per 1,000 gold ahead at 15 min</h3><div class="bars">${bars}</div>${axis(1, 2.4, (v) => `×${v.toFixed(1)}`)}</div>
    <div><h3>Most one-sided lanes at 15 min</h3><p class="muted">Last two years, 8+ games, both teams' champions in the same role.</p>
      <div style="overflow-x:auto"><table class="t"><thead><tr><th>Lane</th><th>Champion</th><th>vs</th><th>Gold</th><th>XP</th><th>CS</th><th>Games</th></tr></thead><tbody>${best}</tbody></table></div></div></div></section>`;
}

/* ------------------------------------------- one game's whole story */
function drawStory(host, g) {
  const st = g.stages || [];
  const mins = Object.keys(g.minutes || {}).map(Number).sort((a, b) => a - b);
  if (!st.length && !mins.length) { host.innerHTML = '<p class="muted">No step-by-step prediction stored for this game.</p>'; return; }
  const DRAFT_LABELS = ["Before", "B1", "R1", "R2", "B2", "B3", "R3", "R4", "B4", "B5", "R5"];
  const labels = [...(st.length ? DRAFT_LABELS : []), ...mins.map((m) => `${m} min`)];
  const values = [...st, ...mins.map((m) => g.minutes[String(m)])];
  const order = g.order || [];
  drawLines(host, {
    labels, lo: 0, hi: 1, ticks: [0, 0.25, 0.5, 0.75, 1], height: 210, aria: `${g.fp} win chance through the draft and the game`,
    series: [{ label: `${g.fp} win chance`, short: g.fp, color: "#c98500", values }],
    divider: st.length && mins.length ? st.length - 1 : null, dividerLabel: "game starts",
    tipExtra: (i) => {
      if (st.length && i > 0 && i < st.length) return order[i - 1] ? `<br><span class="muted">${esc(order[i - 1])} picked</span>` : "";
      const m = mins[i - (st.length ? st.length : 0)];
      const gd = g.goldm?.[String(m)];
      return gd != null ? `<br><span class="muted">${esc(g.fp)} gold ${gd >= 0 ? "+" : ""}${gd.toFixed(1)}k</span>` : "";
    },
  });
}

/* ------------------------------------------- every game, predicted live */
let GAMES = [], META = null, shown = 40, CURRENT = [];
const champIcon = (n) => {
  const c = META?.champions?.find((x) => x.name === n);
  return c ? `<img src="https://ddragon.leagueoflegends.com/cdn/${META.version}/img/champion/${c.id}.png" alt="${esc(n)}" title="${esc(n)}" style="width:28px;height:28px;border-radius:2px;border:1px solid #3a4250">` : esc(n);
};

function gamesShell() {
  return `<section class="card" id="gamesCard"><h2>Every game, predicted before it was played</h2>
    <p class="lead">What the AI said before each game (team + draft model, 90% range) and what actually happened. Search a team or event; click a game for its comps and objectives.</p>
    <div class="settings" style="border:0;padding:0 0 10px;background:none;min-height:0">
      <label>Search <input id="gq" placeholder="T1, BLG, Worlds 2026…" style="width:220px"></label>
      <label class="chk"><input type="checkbox" id="gUpsets"> Only misses</label>
      <span class="muted" id="gSummary"></span>
    </div>
    <div style="overflow-x:auto"><table class="t" id="gTable"></table></div>
    <div style="text-align:center;margin-top:10px"><button id="gMore">Show more</button></div></section>`;
}

function renderGames() {
  const q = ($("#gq")?.value || "").toLowerCase();
  const onlyMiss = $("#gUpsets")?.checked;
  const list = GAMES.filter((g) => (!q || `${g.fp} ${g.sp} ${g.event} ${g.league}`.toLowerCase().includes(q))
    && (!onlyMiss || ((g.p_fp > 0.5) !== (g.winner === g.fp)))).reverse();
  const right = list.filter((g) => (g.p_fp > 0.5) === (g.winner === g.fp)).length;
  $("#gSummary").textContent = list.length ? `${list.length} games · AI called ${pct(right / list.length, 1)} correctly` : "no games";
  CURRENT = list.slice(0, shown);
  const rows = CURRENT.map((g, i) => {
    const favFp = g.p_fp >= 0.5;
    const fav = favFp ? g.fp : g.sp;
    const p = favFp ? g.p_fp : 1 - g.p_fp;
    const lo = favFp ? g.ci[0] : 1 - g.ci[1], hi = favFp ? g.ci[1] : 1 - g.ci[0];
    const ok = fav === g.winner;
    return `<tr class="grow" data-i="${i}" style="cursor:pointer"><td>${esc(g.date)}</td><td>${esc(g.event)}</td>
      <td>${esc(g.fp)} <span class="muted">(${g.fp_blue ? "blue" : "red"})</span> vs ${esc(g.sp)}</td>
      <td>${esc(fav)} <b>${pct(p)}</b> <span class="muted">${pct(lo)}-${pct(hi)}</span></td>
      <td>${ok ? "✅" : "❌"} ${esc(g.winner)}</td><td class="muted">${esc(g.why || "")}</td><td class="num">${g.length}m</td></tr>
      <tr class="gdetail" id="gd${i}" style="display:none"><td colspan="7">
        <div class="twocol"><div><b>${esc(g.fp)}</b> <span class="muted">${esc(g.ident.B)}</span><br>${g.champs.B.map(champIcon).join(" ")}</div>
        <div><b>${esc(g.sp)}</b> <span class="muted">${esc(g.ident.R)}</span><br>${g.champs.R.map(champIcon).join(" ")}</div></div>
        ${g.path ? `<p style="margin:8px 0 0">How it was won: <b>${esc(g.path)}</b>${g.locked != null ? ` <span class="muted">(${esc(g.winner)}'s gold lead locked in by ${g.locked} min)</span>` : ""}</p>` : ""}
        ${g.plans ? `<p class="muted" style="margin:4px 0 0">Game plans: ${esc(g.fp)} “${esc(g.plans.fp[0])}” (${esc(g.plans.fp[1])}, ${esc(g.plans.fp[2])} tempo) · ${esc(g.sp)} “${esc(g.plans.sp[0])}” (${esc(g.plans.sp[1])}, ${esc(g.plans.sp[2])} tempo)</p>` : ""}
        <div class="chart-wrap story" id="story${i}"></div>
        <p class="muted" style="margin:8px 0 0">From ${esc(g.fp)}'s side: gold ${g.gold >= 0 ? "+" : ""}${g.gold} · dragons ${g.dragons >= 0 ? "+" : ""}${g.dragons} · barons ${g.barons >= 0 ? "+" : ""}${g.barons} · towers ${g.towers >= 0 ? "+" : ""}${g.towers}.
        Draft alone said ${esc(g.p_draft_fp >= 0.5 ? g.fp : g.sp)} ${pct(Math.max(g.p_draft_fp, 1 - g.p_draft_fp))}; team strength alone said ${esc(g.p_team_fp >= 0.5 ? g.fp : g.sp)} ${pct(Math.max(g.p_team_fp, 1 - g.p_team_fp))}.</p>
        <button class="gold pc-only" data-open="${esc(g.id)}" style="margin-top:8px">Open in draft board ▸</button>
        <span class="muted"> then press Undo to rewind and see the AI's suggestion at every step</span></td></tr>`;
  }).join("");
  $("#gTable").innerHTML = `<thead><tr><th>Date</th><th>Event</th><th>First pick vs</th><th>AI said (90% range)</th><th>Winner</th><th>Why</th><th>Length</th></tr></thead><tbody>${rows}</tbody>`;
  $("#gMore").style.display = list.length > shown ? "" : "none";
  document.querySelectorAll("#gTable .grow").forEach((tr) => {
    tr.onclick = () => {
      const d = $(`#gd${tr.dataset.i}`);
      const open = d.style.display === "none";
      d.style.display = open ? "" : "none";
      if (open) drawStory($(`#story${tr.dataset.i}`), CURRENT[Number(tr.dataset.i)]);
    };
  });
  document.querySelectorAll("#gTable [data-open]").forEach((b) => { b.onclick = (e) => { e.stopPropagation(); openInBoard(b.dataset.open); }; });
}

async function openInBoard(id) {
  const g = await (await fetch(`/api/game?id=${encodeURIComponent(id)}`)).json();
  if (g.error) return alert(g.error);
  const row = GAMES.find((x) => x.id === id);
  const pre = row ? (row.p_fp >= 0.5 ? `${row.fp} ${pct(row.p_fp)}` : `${row.sp} ${pct(1 - row.p_fp)}`) : null;
  const S = { blue: [], red: [], blueBans: [], redBans: [], fearless: g.fearless || [], history: [], game: g.game || 1,
              blueTeam: g.fp, redTeam: g.sp, us: "", skipBans: false, fpSide: g.fp_side,
              asOf: g.date,
              replay: { title: `${row ? row.event : (g.event || "")} · ${g.fp} vs ${g.sp}, game ${g.game || 1}`, winner: g.winner, pre } };
  for (const a of g.actions) {
    if (a.action === "ban") (a.side === "B" ? S.blueBans : S.redBans).push(a.champion);
    else (a.side === "B" ? S.blue : S.red).push({ champ: a.champion, role: a.role || null });
    S.history.push({ t: a.action, side: a.side });
  }
  try { localStorage.setItem("acp-draft-v1", JSON.stringify(S)); } catch (e) { return alert("Your browser blocked local storage."); }
  location.href = "./";
}

async function loadGames() {
  try {
    [GAMES, META] = await Promise.all([(await fetch("/api/lab_games")).json(), (await fetch("/api/meta")).json()]);
  } catch (e) { return; }
  if (!GAMES.length) { $("#gamesCard").style.display = "none"; return; }
  $("#gq").addEventListener("input", () => { shown = 40; renderGames(); });
  $("#gUpsets").addEventListener("change", () => { shown = 40; renderGames(); });
  $("#gMore").onclick = () => { shown += 60; renderGames(); };
  renderGames();
}

function archiveShell() {
  return `<section class="card"><h2>Replay any stored game</h2>
    <p class="lead">Every pro game in the database: LCK, LPL, MSI and Worlds since 2017, plus First Stand and EWC. Opening one loads its exact draft into the board, judged only with games played before it, so there's no hindsight.</p>
    <div class="settings" style="border:0;padding:0 0 10px;background:none;min-height:0">
      <label>Find <input id="aq" placeholder="Worlds 2019, LPL 2021 Finals, SK Telecom…" style="width:260px"></label>
      <span class="muted" id="aCount"></span></div>
    <div style="overflow-x:auto"><table class="t" id="aTable"></table></div></section>`;
}

let aTimer = null;
async function searchArchive() {
  const q = $("#aq").value.trim();
  if (q.length < 2) { $("#aTable").innerHTML = ""; $("#aCount").textContent = ""; return; }
  const rows = await (await fetch(`/api/games?q=${encodeURIComponent(q)}`)).json();
  $("#aCount").textContent = `${rows.length}${rows.length === 60 ? "+" : ""} games`;
  $("#aTable").innerHTML = `<thead><tr><th>Date</th><th>Event</th><th>First pick vs</th><th>Game</th><th>Winner</th><th></th></tr></thead><tbody>${
    rows.map((r) => `<tr><td>${esc(r.date_utc.slice(0, 10))}</td><td>${esc(r.tournament)}</td><td>${esc(r.fp_team)} vs ${esc(r.sp_team)}</td>
      <td class="num">${r.game_in_match || 1}</td><td>${esc(r.winner)}</td>
      <td><button data-open="${esc(r.game_id)}">Open ▸</button></td></tr>`).join("")}</tbody>`;
  document.querySelectorAll("#aTable [data-open]").forEach((b) => { b.onclick = () => openInBoard(b.dataset.open); });
}

/* Solo queue by rank: the solo queue lab (soloq_lab.py), next to the pro numbers */
const RANK_ORDER = ["iron", "bronze", "silver", "gold", "platinum", "emerald", "diamond", "master"];
function soloSection(d) {
  const lab = d?.lab || {}, ranks = lab.ranks || {}, pro = lab.pro || {};
  const have = RANK_ORDER.filter((r) => ranks[r]);
  if (!have.length) {
    return `<section class="card" id="solo"><h2>Solo queue by rank</h2>
      <p class="lead">The board's Solo queue tab answers from this season's ranked games at your rank. Each rank is tested here the same way as the pro games once its games are downloaded (Solo queue page, your own Riot key): the lab runs after every download.</p>
      <p class="muted">No solo queue games yet.</p></section>`;
  }
  const plw = pro.lead_worth?.["15"]?.["3"];
  const leadBars = have.filter((r) => ranks[r].lead_worth?.["15"]).map((r) => {
    const x = ranks[r].lead_worth["15"];
    return barRow(`${esc(ranks[r].label)}<div class="muted">${(x.games || 0).toLocaleString()} games at 15 min</div>`, x["3"],
      { lo: 0.5, hi: 1, ref: plw ?? null, title: `${ranks[r].label}: a 3,000 gold lead at 15 minutes won ${pct(x["3"], 1)}${plw ? ` (pro games: ${pct(plw, 1)})` : ""}` });
  });
  const accBars = have.filter((r) => ranks[r].draft?.accuracy).map((r) => {
    const x = ranks[r].draft;
    return barRow(`${esc(ranks[r].label)}<div class="muted">${(x.games_tested || 0).toLocaleString()} unseen games · side alone ${pct(x.baseline_accuracy, 1)}</div>`, x.accuracy,
      { lo: 0.4, hi: 0.7, title: `${ranks[r].label}: the draft called ${pct(x.accuracy, 1)}, log-loss ${x.logloss} (side alone ${x.baseline_logloss})` });
  });
  const rows = have.map((r) => {
    const x = ranks[r], w = x.draft?.worth_5pct || {}, th = x.throws || {};
    return `<tr><td>${esc(x.label)}</td><td class="num">${(x.games || 0).toLocaleString()}</td><td class="num">${(x.timelines || 0).toLocaleString()}</td>
      <td class="num">${w.lane != null ? `${w.lane >= 0 ? "+" : ""}${w.lane.toFixed(1)}%` : "-"}</td><td class="num">${w.counter != null ? `${w.counter >= 0 ? "+" : ""}${w.counter.toFixed(1)}%` : "-"}</td>
      <td class="num">${w.strength != null ? `${w.strength >= 0 ? "+" : ""}${w.strength.toFixed(1)}%` : "-"}</td>
      <td class="num">${th.behind3_at15_won?.rate != null ? pct(th.behind3_at15_won.rate) : "-"}</td><td class="num">${th.lost_after_4k?.rate != null ? pct(th.lost_after_4k.rate) : "-"}</td>
      <td class="num">${x.blue_wr ? pct(x.blue_wr[0], 1) : "-"}</td><td class="num">${x.length ? `${x.length.avg} min` : "-"}</td></tr>`;
  });
  const pth = pro.throws || {};
  return `<section class="card" id="solo"><h2>Solo queue by rank</h2>
    <p class="lead">The board's Solo queue tab is tested here like the pro games: each rank's games are split by date into blocks, and every block is predicted with statistics from the games before it only (and weights fitted on the blocks before it). The lane matchups get a weight of their own, because solo lanes snowball. ${lab.made ? `Last run ${esc(String(lab.made).slice(0, 10))}.` : ""}</p>
    ${accBars.length ? `<h3>How well the draft calls solo queue games</h3><div class="bars">${accBars.join("")}</div>${axis(0.4, 0.7)}` : ""}
    ${leadBars.length ? `<h3>Leads get thrown: a 3,000 gold lead at 15 minutes wins…</h3><p class="muted">Dashed line: pro games${plw ? ` (${pct(plw)})` : ""}.</p><div class="bars">${leadBars.join("")}</div>${axis(0.5, 1)}` : ""}
    <h3>What matters at each rank</h3>
    <div style="overflow-x:auto"><table class="t"><thead><tr><th>Rank</th><th class="num">Games</th><th class="num">Minute by minute</th>
      <th class="num" title="win chance from one lane matchup 5 points in your favour">Lane +5%</th><th class="num" title="from one of the other matchups 5 points in your favour">Other matchup +5%</th>
      <th class="num" title="from a champion 5 points stronger">Champion +5%</th><th class="num" title="teams 3,000 gold behind at 15 minutes that still won">Won 3k behind</th>
      <th class="num" title="teams that led by 4,000+ gold after 10 minutes and still lost">Lost a 4k lead</th><th class="num">Blue side</th><th class="num">Length</th></tr></thead>
      <tbody>${rows.join("")}${pro.games ? `<tr class="pro-row"><td>Pro games</td><td class="num">${pro.games.toLocaleString()}</td><td class="num">${pro.games.toLocaleString()}</td><td class="num">-</td><td class="num">-</td><td class="num">-</td>
        <td class="num">${pth.behind3_at15_won?.rate != null ? pct(pth.behind3_at15_won.rate) : "-"}</td><td class="num">${pth.lost_after_4k?.rate != null ? pct(pth.lost_after_4k.rate) : "-"}</td><td class="num">-</td><td class="num">-</td></tr>` : ""}</tbody></table></div>
    <p class="muted">${esc(lab.min_games ? `A rank is fitted once it has ${lab.min_games} games, and gets its own live win-chance models at ${lab.min_timelines} games with a timeline.` : "")}</p></section>`;
}

async function init() {
  let lab;
  try { lab = await (await fetch("/api/lab")).json(); } catch (e) { $("#labMeta").textContent = "Can't reach the server."; return; }
  if (!lab.models) {
    $("#lab").innerHTML = '<section class="card"><h2>No lab report yet</h2><p>Run <code>py learn.py</code> to create one.</p></section>';
    return;
  }
  const proMeta = `${lab.games.toLocaleString()} pro games predicted before their result · ${lab.first} to ${lab.last} · re-learned every ${lab.step_days} days`;
  $("#labMeta").textContent = proMeta;
  // two tabs, like the board's: the pro report exactly as it was, and the solo queue lab on its own
  $("#lab").innerHTML = `<nav class="lab-tabs" role="tablist" aria-label="Which lab">
      <button type="button" role="tab" class="mode-tab on" data-lab="pro" aria-selected="true"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5 9.9 5.4l4.3.6-3.1 3 .7 4.3L8 11.3l-3.8 2 .7-4.3-3.1-3 4.3-.6Z"/></svg><span class="mt-name">Pro games</span><small>every pro game, tested in order</small></button>
      <button type="button" role="tab" class="mode-tab" data-lab="solo" aria-selected="false"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8 13.5 8 8 14.2 2.5 8Z"/><path d="M8 5.2 10.5 8 8 10.8 5.5 8Z"/></svg><span class="mt-name">Solo queue</span><small>each rank's games, tested the same way</small></button>
    </nav><div id="labPro"></div><div id="labSolo" hidden><section class="card"><p class="muted">Loading…</p></section></div>`;
  $("#labPro").innerHTML = [hero(lab), models(lab), throughDraft(lab), throughGame(lab), winPaths(lab), winConditions(lab), lanePhase(lab),
    calibration(lab), why(lab), swing(lab), sideAndFollow(lab), agreement(lab), identity(lab), months(lab), seasons(lab), intervals(lab), regionsTest(lab), leagues(lab),
    learned(lab), calls(lab), history(lab)].join("");
  const web = document.documentElement.classList.contains("web");   // (the in-browser version: no replays)
  $("#labPro").insertAdjacentHTML("beforeend", gamesShell() + (web ? "" : archiveShell()));
  $("#aq")?.addEventListener("input", () => { clearTimeout(aTimer); aTimer = setTimeout(searchArchive, 250); });
  const drawAll = () => { if (!$("#labPro").hidden) { drawMonths(lab); drawDraft(lab); drawGame(lab); } };
  drawAll();
  window.addEventListener("resize", drawAll);
  loadGames();
  let solo = null;
  const show = (which) => {
    document.querySelectorAll(".lab-tabs .mode-tab").forEach((b) => {
      const on = b.dataset.lab === which;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("#labPro").hidden = which !== "pro";
    $("#labSolo").hidden = which !== "solo";
    const games = Object.values(solo?.ranks || {}).reduce((n, r) => n + (r.games || 0), 0);
    $("#labMeta").textContent = which === "pro" ? proMeta
      : games ? `${games.toLocaleString()} solo queue games this season, every rank tested on games it hadn't seen` : "Solo queue: no games yet";
    if (which === "pro") drawAll();
  };
  $("#lab").querySelector(".lab-tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-lab]");
    if (b) show(b.dataset.lab);
  });
  if (location.hash === "#solo") show("solo");   // (the board's "How it was tested" link: straight to solo queue)
  try {
    solo = await (await fetch("/api/soloq/ranks")).json();
    $("#labSolo").innerHTML = soloSection(solo);
  } catch (e) {
    $("#labSolo").innerHTML = soloSection(null);
  }
  if (!$("#labSolo").hidden) show("solo");   // (its line under the header, now that the numbers are in)
}
init();
