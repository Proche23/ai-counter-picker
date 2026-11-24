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
  const key = JSON.stringify([mode,cs?.key,auto,own,blocked]);
  box.hidden = false;
  if (box.dataset.key === key) return;
  const old = box.dataset.session === String(cs?.key) ? box.querySelector("input")?.value : "";
  box.dataset.session = String(cs?.key);
  box.dataset.key = key;
  box.innerHTML = '<h2></h2><div class="arena-controls"></div><div class="arena-results"></div><a>Open casual mode guide ↗</a>';
  box.querySelector("h2").textContent = mode + " lobby";
  box.querySelector("a").href = "casual.html?mode=" + encodeURIComponent(mode);
  if (own) {
    const champion = document.createElement("p");
    champion.textContent = (st.game ? "Playing " : "Your champion: ") + own;
    box.querySelector("h2").after(champion);
  }
  if (mode !== "Arena") return;
  box.querySelector(".arena-controls").innerHTML = '<label>Duo partner <input list="arenaChampions" placeholder="Choose or type a champion"></label><datalist id="arenaChampions"></datalist>';
  const input = box.querySelector("input");
  for (const c of CHAMPS) box.querySelector("datalist").append(new Option(c.name));
  input.value = auto || old || "";
  function update() {
    const ally = input.value.trim().toLowerCase();
    const mine = arenaPairs.find(r => r[0] === own);
    const eligible = arenaPairs.filter(r => r[0].toLowerCase() !== ally && !blocked.includes(r[0]));
    const fits = r => r[3].some(c => c.toLowerCase() === ally);
    const rows = mine ? [mine] : eligible.sort((a,b) => Number(fits(b))-Number(fits(a)) || b[1]-a[1]).slice(0,3);
    const out = box.querySelector(".arena-results");
    out.replaceChildren();
    for (const [champ,rate,n,partners,tip] of rows) {
      const line = document.createElement("p");
      line.textContent = champ + " · " + rate.toFixed(2) + "% first place (" + n + " games). Pair with " + partners.join(", ") + ". " + tip;
      out.append(line);
    }
    const source = document.createElement("a");
    source.href = "https://www.metasrc.com/lol/arena/na/tier-list";
    source.textContent = "NA Arena · patch 26.23 snapshot · individual champion rates";
    out.append(source);
  }
  input.oninput = update;
  update();
}
