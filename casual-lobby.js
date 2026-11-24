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
const arenaBuilds = {
  Sion: { items: [[3084, "Heartsteel"], [3068, "Sunfire Aegis"], [3075, "Thornmail"]], plan: "Build health first. Pick Thornmail when opponents rely on healing and basic attacks." },
  Brand: { items: [[6653, "Liandry’s Torment"], [3116, "Rylai’s Crystal Scepter"], [3089, "Rabadon’s Deathcap"]], plan: "Start with burn and slows. Look for Magic Missile or Infernal Conduit." },
  Swain: { items: [[3116, "Rylai’s Crystal Scepter"], [4633, "Riftmaker"], [3065, "Spirit Visage"]], plan: "Keep enemies within your ultimate with Rylai’s. Look for Phenomenal Evil or Infernal Conduit." },
  Ezreal: { items: [[3078, "Trinity Force"], [3042, "Muramana"], [6694, "Serylda’s Grudge"]], plan: "Buy Tear early toward Muramana. Use Serylda’s when you need armor penetration." },
};
const arenaArt = (kind, file) => `https://ddragon.leagueoflegends.com/cdn/16.23.1/img/${kind}/${file}.png`;
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
  box.innerHTML = '<h2></h2><div class="arena-results"></div>';
  box.querySelector("h2").textContent = mode === "Arena" ? "Arena picks" : mode + " lobby";
  if (own && mode !== "Arena") {
    const champion = document.createElement("p");
    champion.textContent = (st.game ? "Playing " : "Your champion: ") + own;
    box.querySelector("h2").after(champion);
  }
  if (mode === "Arena") renderArenaStats(box.querySelector(".arena-results"), { own, partner: auto, blocked });
  else {
    const guide = document.createElement("a");
    guide.href = "casual.html?mode=" + encodeURIComponent(mode);
    guide.textContent = "Open casual mode guide";
    box.append(guide);
  }
}

function renderArenaStats(out, { own = "", partner = "", blocked = [] } = {}) {
  const rows = arenaPairs.filter(([champ]) => champ === own || (champ !== partner && !blocked.includes(champ)));
  const priority = ([champ, , , partners]) => champ === own ? 2 : Number(partners.includes(partner));
  rows.sort((a, b) => priority(b) - priority(a) || b[1] - a[1]);
  out.innerHTML = `<p class="arena-caption">NA Arena · patch 26.23 · first-place rate</p>
    <div class="arena-pick-grid">${rows.map(([champ, rate, games, partners]) => `
      <article class="arena-pick${champ === own ? " arena-own" : ""}">
        <img src="${arenaArt("champion", champ)}" alt="" width="48" height="48">
        <div><h3>${champ}${champ === own ? " <small>You</small>" : ""}</h3>
          <p><strong>${rate.toFixed(2)}%</strong> <span> · ${games} games</span></p></div>
        <p class="arena-partners">Pairs with ${partners.join(", ")}</p>
      </article>`).join("") || '<p>All featured picks are unavailable.</p>'}</div>
    ${rows.length ? `<section class="arena-builds"><h2>Arena builds</h2>
      <p class="arena-caption">Suggested item paths. Adapt to your opponents and Prismatic offer.</p>
      <div class="arena-build-grid">${rows.map(([champ, , , , tip]) => {
        const build = arenaBuilds[champ];
        return `<article class="arena-build${champ === own ? " arena-own" : ""}">
          <h3><img src="${arenaArt("champion", champ)}" alt="" width="32" height="32">${champ}</h3>
          <ol>${build.items.map(([id, item]) => `<li><img src="${arenaArt("item", id)}" alt="" width="28" height="28">${item}</li>`).join("")}</ol>
          <p>${build.plan}</p><p>${tip}</p></article>`;
      }).join("")}</div></section>` : ""}`;
  if (own && !rows.some(([champ]) => champ === own)) {
    const note = document.createElement("p");
    note.textContent = `${own} is outside this snapshot's shortlist.`;
    out.prepend(note);
  }
}
