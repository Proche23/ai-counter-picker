"use strict";
/* Every counter matchup between the two teams, from pro games (the server's res.matchups), drawn the
   same way on the board and in the draft tracker:
   - each lane: the two champions, a bar with each one's win rate in that lane, the record in LCK / LPL /
     internationals, how many other-region games add to it, and a verdict (who counters whom)
   - bot lane 2 v 2: each carry against the other support
   - all champion pairs, whatever their roles: a grid coloured by who has the edge, with the biggest
     counters on each side and how much the counters as a whole move the win chance
   The viewer's team is on the left (the board: Blue, unless you're Red). */
(() => {
  const ROLE_TAG = { TOP: "TOP", JNG: "JGL", MID: "MID", BOT: "BOT", SUP: "SUP" };
  const SIDE = { B: "Blue", R: "Red" };
  const RGB = { B: "10, 200, 185", R: "232, 64, 87" };
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => `${Math.round(x * 100)}%`;
  const flipRec = (rec) => { const m = /^(\d+)-(\d+)$/.exec(rec || ""); return m ? `${m[2]}-${m[1]}` : rec || ""; };
  const games = (n) => `${n} game${n === 1 ? "" : "s"}`;

  function verdict(p, a, b, total) {   // p = a's win rate against b
    if (!total) return "no pro games between them yet";
    if (total < 6) return `only ${games(total)}: too few to call`;
    const d = Math.abs(p - 0.5), win = p >= 0.5 ? a : b, lose = p >= 0.5 ? b : a;
    if (d < 0.02) return "even";
    if (d < 0.045) return `<b>${esc(win)}</b> slightly ahead`;
    return `<b>${esc(win)}</b> counters ${esc(lose)}`;
  }
  function evidence(rec, n, other) {
    const parts = [];
    if (n) parts.push(`${rec} in LCK/LPL/intl`);
    if (other) parts.push(`${n ? "+ " : ""}${games(other)} in other regions`);
    return parts.join(" ");
  }
  function shade(pLeft, L, R) {   // a cell tinted toward whoever has the edge
    const d = pLeft - 0.5, side = d >= 0 ? L : R, a = Math.min(0.5, Math.abs(d) * 4.5);
    return `background: rgba(${RGB[side]}, ${a.toFixed(3)})`;
  }

  function html(mu, { mine = null, img = () => "", compact = false, gridOpen = true } = {}) {
    if (!mu) return "";
    const flip = mine === "R";
    const L = flip ? "R" : "B", R = flip ? "B" : "R";
    const left = (p) => (flip ? 1 - p : p);
    const rec = (r) => (flip ? flipRec(r) : r);
    const pt = (c, hover) => `<span class="mu-pt${hover ? " hov" : ""}"${c && img(c) ? ` style="background-image:url('${img(c)}')"` : ""}></span>`;
    const name = (c, hover) => (c ? `<b>${esc(c)}</b>${hover ? '<small class="mu-hov">hover</small>' : ""}` : '<span class="mu-none">not picked</span>');

    // ---- lanes
    const lanes = mu.lanes.map((ln) => {
      const a = ln[L], b = ln[R], ha = ln.hover?.[L], hb = ln.hover?.[R];
      const has = ln.p != null;
      const p = has ? left(ln.p) : null;
      const total = has ? ln.n + (ln.other || 0) : 0;
      const bar = has
        ? `<span class="mu-bar" title="${esc(a)} won ${pct(p)} of this lane against ${esc(b)} (the record, pulled toward what both champions' overall strength predicts when there are few games)">
            <i class="s-${L}" style="width:${(p * 100).toFixed(1)}%"></i><i class="s-${R}" style="width:${((1 - p) * 100).toFixed(1)}%"></i>
            <em>${pct(p)}</em><em class="r">${pct(1 - p)}</em></span>`
        : '<span class="mu-bar empty"></span>';
      const why = has ? `${verdict(p, a, b, total)}${total ? ` · <span class="mu-ev">${evidence(rec(ln.record), ln.n, ln.other)}</span>` : ""}`
        : `<span class="mu-ev">${a || b ? "waiting for the other team's pick" : "no picks yet"}</span>`;
      return `<div class="mu-lane${has ? "" : " open"}">
        <span class="mu-role">${ROLE_TAG[ln.role]}</span>
        <span class="mu-c l">${pt(a, ha)}${name(a, ha)}</span>${bar}<span class="mu-c r">${name(b, hb)}${pt(b, hb)}</span>
        <span class="mu-why">${why}</span></div>`;
    }).join("");

    // ---- bot lane 2 v 2 (each carry against the other support)
    const duo = (mu.duo || []).map((d) => {
      const a = L === "B" ? d.B : d.R, b = L === "B" ? d.R : d.B;
      const ar = L === "B" ? d.role : d.rrole, br = L === "B" ? d.rrole : d.role;
      const p = left(d.p);
      return `<span class="mu-duo-i"><b>${esc(a)}</b> <small>${ROLE_TAG[ar]}</small> vs <b>${esc(b)}</b> <small>${ROLE_TAG[br]}</small>
        <span class="${p >= 0.52 ? "pos" : p <= 0.48 ? "neg" : ""}">${pct(p)}</span>${d.n ? ` <small>(${rec(d.record)})</small>` : ""}</span>`;
    }).join("");

    // ---- every pair: rows = your champions, columns = theirs
    const rows = flip ? mu.cols : mu.rows, cols = flip ? mu.rows : mu.cols;
    const cell = (i, j) => (flip ? mu.grid[j][i] : mu.grid[i][j]);
    const grid = `<table class="mu-grid"><thead><tr><th></th>${cols.map((c) => `<th title="${esc(c.champ)}">${pt(c.champ, c.hover)}<span>${esc(c.champ)}</span></th>`).join("")}</tr></thead>
      <tbody>${rows.map((r, i) => `<tr><th title="${esc(r.champ)}">${pt(r.champ, r.hover)}<span>${esc(r.champ)}</span></th>${cols.map((c, j) => {
        const x = cell(i, j), p = left(x.p), tot = x.n + (x.other || 0);
        return `<td style="${shade(p, L, R)}" title="${esc(r.champ)} vs ${esc(c.champ)}: ${esc(SIDE[L])} wins ${pct(p)}${tot ? ` · ${evidence(rec(x.record), x.n, x.other)}` : " · no pro games yet"}">${pct(p)}<small>${tot ? tot : "-"}</small></td>`;
      }).join("")}</tr>`).join("")}</tbody></table>`;
    const fx = left(mu.effect + 0.5) - 0.5;
    const top = (side) => (mu.best?.[side] || []).map((x) => {
      const a = side === "B" ? x.B : x.R, b = side === "B" ? x.R : x.B, p = side === "B" ? x.p : 1 - x.p;
      return `<span class="mu-top s-${side}"><b>${esc(a)}</b> over ${esc(b)} <span>${pct(p)}</span></span>`;
    }).join("") || '<span class="mu-ev">no clear edge</span>';
    const counters = `<p class="mu-fx">Counters as a whole: <b class="${fx >= 0.003 ? "pos" : fx <= -0.003 ? "neg" : ""}">${SIDE[L]} ${fx >= 0 ? "+" : "−"}${Math.abs(fx * 100).toFixed(1)}%</b> win chance
        <span class="mu-ev">(the win model's counter part: how each team does against every enemy champion, whatever the roles)</span></p>
      <div class="mu-tops"><div><small class="s-${L}">${SIDE[L]}'s biggest counters</small>${top(L)}</div><div><small class="s-${R}">${SIDE[R]}'s biggest counters</small>${top(R)}</div></div>`;

    return `<div class="mu${compact ? " compact" : ""}">
      <div class="mu-head"><span class="s-${L}">${SIDE[L]}${mine ? " (you)" : ""}</span><span class="s-${R}">${SIDE[R]}</span></div>
      <div class="mu-lanes">${lanes}</div>
      ${duo ? `<div class="mu-duo"><small>Bot lane 2 v 2</small>${duo}</div>` : ""}
      ${counters}
      <details class="mu-all"${gridOpen ? " open" : ""}><summary>Every matchup: all ${rows.length * cols.length} pairs</summary>${grid}
        <p class="mu-ev">Each cell: how often ${SIDE[L]}'s champion's team won against that enemy champion in pro games (small number: games). Teal or red shows who has the edge.</p></details>
    </div>`;
  }

  window.ACPMatchups = { html };
})();
