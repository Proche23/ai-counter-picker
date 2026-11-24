"use strict";
const challenges = {
  ARAM: ["Ping a health relic and collect it with two teammates in range.", "Chain two different crowd-control abilities on the same opponent.", "Escort a cannon wave to the enemy tower with a teammate.", "Peel for your lowest-health teammate and help them escape a fight."],
  Arena: ["Choose augments that support one shared plan with your partner.", "Call a target before the round and coordinate your opening abilities.", "Use a power flower while your partner keeps an opponent busy.", "After a lost round, change one thing together in the rematch."],
  URF: ["Land the same skillshot twice in one fight.", "Coordinate a cannon landing with a teammate and escape together.", "Chain a mobility spell into a teammate’s crowd control.", "Use your short cooldowns to save an ally twice in one fight."],
  Other: ["Let a teammate choose your champion from two you enjoy.", "Set up an elimination for a different teammate in each fight.", "Call a retreat together and get everyone out.", "Trade jobs for one fight: have a different teammate call the engage."]
};
challenges.Mayhem = challenges.ARAM;
const sessions = new Map();
let mode = "ARAM";
function session() {
  if (!sessions.has(mode)) sessions.set(mode, {index: Math.floor(Math.random()*challenges[mode].length), count:0, done:false});
  return sessions.get(mode);
}
function draw() {
  const s = session();
  document.querySelector("#heading").textContent = (mode === "Other" ? "Party" : mode) + " challenge";
  document.querySelector("#prompt").textContent = challenges[mode][s.index];
  document.querySelector("#done").disabled = s.done;
  document.querySelector("#score").textContent = s.count + " completed in this mode this session";
}
document.querySelector("fieldset").onchange = event => { mode = event.target.value; draw(); showPicks(); };
document.querySelector("#roll").onclick = () => {
  const s = session(), size = challenges[mode].length;
  s.index = (s.index + 1 + Math.floor(Math.random()*(size-1))) % size;
  s.done = false;
  draw();
};
document.querySelector("#done").onclick = () => {
  const s = session();
  if (!s.done) s.count++;
  s.done = true;
  draw();
};
draw();

const guides = {
  ARAM: [
    ["Sona", "Take her when your bench offers sustain and your team already has damage. Pair with Jinx: shield her during poke, then save Crescendo for divers.", "", "https://u.gg/lol/champions/aram/Sona-aram"],
    ["Malphite", "Take him when your team needs a fight starter. With Miss Fortune, catch a group in Unstoppable Force as she channels Bullet Time.", "", ""],
    ["Miss Fortune", "Take her behind reliable area control. Wait for Malphite or Amumu to pin enemies before channeling your ultimate.", "", ""]
  ],
  Mayhem: [
    ["Sona", "Choose sustain for a team that fights grouped. Stand near your carry and keep shields cycling.", "Silver: Blue Barrier · Gold: Shrink Engine · Prismatic: Windspeaker’s Blessing", "https://u.gg/lol/champions/aram-mayhem/Sona-aram-mayhem"],
    ["Brand", "Choose area damage alongside Amumu. Spread Blaze while enemies are held together.", "Look for Magic Missile when offered.", "https://u.gg/lol/champions/aram-mayhem/brand-aram-mayhem"]
  ],
  URF: [
    ["Hecarim", "Pair with Zilean. Take his speed boost into a flank and use the revive to survive the counterattack.", "", ""],
    ["Leona", "Pair with Lucian. Chain your stuns so he can dash in and repeatedly trigger his passive.", "", ""]
  ]
};
const notes = {
  ARAM: "Choose from your roll or bench. Sona was S tier on U.GG in patch 26.23. The other picks are suggested teamfight combos.",
  Mayhem: "Patch 26.23 augment shortlist. Pick for the job your team needs, then look for these offers.",
  URF: "Suggested ability combos. Current patch win-rate data was unavailable."
};
const champion = document.querySelector("#champion");
function showAdvice() {
  const [name, combo, augments, source] = guides[mode][champion.selectedIndex];
  const box = document.querySelector("#advice");
  box.replaceChildren();
  for (const line of [combo, augments && "Augments · " + augments].filter(Boolean)) {
    const p = document.createElement("p");
    p.textContent = line;
    box.append(p);
  }
  if (source) {
    const link = document.createElement("a");
    link.href = source;
    link.textContent = name + " mode data ↗";
    box.append(link);
  }
}
function showPicks() {
  const arena = mode === "Arena";
  const picks = guides[mode];
  document.querySelector("#scout").hidden = !picks && !arena;
  document.querySelector("#championPicker").hidden = arena;
  document.querySelector("#scoutTitle").textContent = arena ? "Arena stats" : "Quick picks";
  document.querySelector("#pickNote").hidden = arena;
  if (arena) {
    renderArenaStats(document.querySelector("#advice"));
    return;
  }
  if (!picks) return;
  document.querySelector("#pickNote").textContent = notes[mode];
  champion.replaceChildren(...picks.map(([name]) => new Option(name)));
  showAdvice();
}
champion.onchange = showAdvice;
showPicks();
const requestedMode = new URLSearchParams(location.search).get("mode");
if (Object.hasOwn(challenges, requestedMode)) document.querySelector('input[value="' + requestedMode + '"]').click();
