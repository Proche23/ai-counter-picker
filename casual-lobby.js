"use strict";
function casualQueue(st) {
  const id = Number(st.queue?.id);
  const name = [st.queue?.name, st.game?.mode].join(" ");
  if ([1700,1710].includes(id) || /arena|cherry/i.test(name) || Number(st.game?.map) === 30) return "Arena";
  if (/mayhem/i.test(name) || id === 2400) return "Mayhem";
  if (/urf/i.test(name) || [900,1900].includes(id)) return "URF";
  if (/aram/i.test(name) || [450,720].includes(id)) return "ARAM";
  const teams = st.game?.champs || st.champ_select?.picks || {};
  return Object.values(teams).some(team => team.length > 5) ? "Other" : "";
}
const arenaPairs = [
  ["Sion",21.57,"3.8k",["Brand","Swain"],"Use your knock-up to keep opponents inside your partner’s area damage."],
  ["Brand",16.60,"3.6k",["Shyvana","Sion","Milio"],"Let your partner start the fight, then spread Blaze while the enemies are close together. Look for Magic Missile or Infernal Conduit."],
  ["Swain",15.95,"3.8k",["Seraphine","Zilean","Jinx","Sion"],"Chain your pull with allied crowd control and keep enemies in your ultimate. Look for Phenomenal Evil or Infernal Conduit."],
  ["Ezreal",14.84,"4.1k",["Leona","Nautilus"],"Fire skillshots into allied crowd control and save Arcane Shift to escape the return engage."]
];
function showCasualLobby(st, mode) {
  const box = document.querySelector("#casualLobby");
  document.body.classList.toggle("casual-lobby", !!mode);
  if (!mode) { box.hidden = true; box.dataset.key = ""; return; }
  const cs = st.champ_select;
  const allies = cs?.picks?.[cs.side] || [];
  const partner = allies.length === 2 ? allies.find(p => !p.me) : null;
  const auto = partner?.champ || partner?.hover || "";
  const own = st.game?.me || cs?.me?.champ || cs?.me?.hover || "";
  const blocked = [...(cs?.bans?.B || []), ...(cs?.bans?.R || [])];
  const key = JSON.stringify([mode,cs?.key,auto,own,blocked,!!st.game]);
  box.hidden = false;
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  box.innerHTML = '<h2></h2><div class="arena-results"></div><a>Open casual mode guide ↗</a>';
  box.querySelector("h2").textContent = mode + " lobby";
  box.querySelector("a").href = "casual.html?mode=" + encodeURIComponent(mode);
  if (own) {
    const champion = document.createElement("p");
    champion.textContent = (st.game ? "Playing " : "Your champion: ") + own;
    box.querySelector("h2").after(champion);
  }
  if (mode !== "Arena") return;
  renderArenaStats(box.querySelector(".arena-results"), { own, partner: auto, blocked });
}

function renderArenaStats(out, { own = "", partner = "", blocked = [] } = {}) {
  const rows = arenaPairs.filter(([champ]) => champ === own || (champ !== partner && !blocked.includes(champ)));
  const priority = ([champ, , , partners]) => champ === own ? 2 : Number(partners.includes(partner));
  rows.sort((a, b) => priority(b) - priority(a) || b[1] - a[1]);
  out.replaceChildren();
  for (const [champ, rate, games, partners, tip] of rows) {
    const line = document.createElement("p");
    const label = document.createElement("strong");
    label.textContent = champ + (champ === own ? " (you)" : "");
    line.append(label, ` · ${rate.toFixed(2)}% first place (${games} games). Pair with ${partners.join(", ")}. ${tip}`);
    out.append(line);
  }
  if (own && !rows.some(([champ]) => champ === own)) {
    const note = document.createElement("p");
    note.textContent = `${own} is outside this snapshot's shortlist.`;
    out.prepend(note);
  }
  const sourceLine = document.createElement("p");
  const source = document.createElement("a");
  source.href = "https://www.metasrc.com/lol/arena/na/tier-list";
  source.textContent = "NA Arena · patch 26.23 snapshot · individual champion rates";
  sourceLine.append(source);
  out.append(sourceLine);
}
