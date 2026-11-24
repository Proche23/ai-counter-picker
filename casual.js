"use strict";
const challenges = {
  ARAM: ["Ping a health relic and collect it with two teammates in range.", "Chain two different crowd-control abilities on the same opponent.", "Escort a cannon wave to the enemy tower with a teammate.", "Peel for your lowest-health teammate and help them escape a fight."],
  Arena: ["Choose augments that support one shared plan with your partner.", "Call a target before the round and coordinate your opening abilities.", "Use a power flower while your partner keeps an opponent busy.", "After a lost round, change one thing together in the rematch."],
  URF: ["Land the same skillshot twice in one fight.", "Coordinate a cannon landing with a teammate and escape together.", "Chain a mobility spell into a teammate’s crowd control.", "Use your short cooldowns to save an ally twice in one fight."],
  Other: ["Let a teammate choose your champion from two you enjoy.", "Set up an elimination for a different teammate in each fight.", "Call a retreat together and get everyone out.", "Trade jobs for one fight: have a different teammate call the engage."]
};
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
document.querySelector("fieldset").onchange = event => { mode = event.target.value; draw(); };
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
