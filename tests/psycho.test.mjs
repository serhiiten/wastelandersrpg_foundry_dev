// Психо and Камікадзе on attacks (author, 2026-11-14): characters and enemies alike, «всім як у трекері» — +2 damage to every
// attack except unarmed ones and psychic powers; a robot without «Кіборг» gets no Психо (it can't take chems), not even
// with the toggle on; «Психо діє» isn't offered to such a robot nor for an unarmed attack. Enemies: the «Психо» move
// found by the whole word; +2, with Камікадзе +4. Run: node tests/psycho.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { attackDice } from "../module/rules/enemy-model.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures < 30) console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

function character(species, feats = []) {
  const st = Rc.rollCharacter(null);
  st.species = species;
  st.feats = [...(st.feats || []).filter((f) => !["Кіборг", "Камікадзе"].includes(f)), ...feats];
  st.loot = {};
  return st;
}
const bonuses = (st, choice, opt = {}, mode = "melee") => {
  const L = createLogic({ st, toast: () => {} });
  return L.dmgBonuses(mode, Rc.compute(st), opt, choice).map(([n]) => n);
};
const knife = { key: "w0", name: "Ніж", w: { n: "Ніж" } };
const unarmed = { key: "unarmed", name: "Беззбройні атаки" };
const fist = { key: "w1", name: "Кастет-кулак", w: { n: "Кастет-кулак" } };
const psiPower = { key: "w2", name: "Пси-удар", w: { n: "Пси-удар", auto: "psi" } };

for (let n = 0; n < 20; n++) {
  const human = character("human");
  ok(bonuses(human, knife, { psycho: true }).includes("Психо"), "human: Психо +2 with a knife");
  ok(!bonuses(human, unarmed, { psycho: true }).includes("Психо"), "human: no Психо unarmed");
  ok(!bonuses(human, fist, { psycho: true }).includes("Психо"), "human: no Психо with a fist weapon (the tracker's words)");
  ok(!bonuses(human, psiPower, { psycho: true }).includes("Психо"), "human: no Психо on a psychic power");
  ok(!bonuses(human, knife, {}).includes("Психо"), "human: no Психо unless it acts");
  const robot = character("robot");
  ok(!bonuses(robot, knife, { psycho: true }).includes("Психо"), "robot without Кіборг: no Психо even with the toggle on");
  const cyborg = character("robot", ["Кіборг"]);
  ok(bonuses(cyborg, knife, { psycho: true }).includes("Психо"), "robot with Кіборг: Психо +2");
  const kami = character("human", ["Камікадзе"]);
  ok(bonuses(kami, knife).includes("Камікадзе"), "Камікадзе +2 with a knife");
  ok(!bonuses(kami, unarmed).includes("Камікадзе"), "no Камікадзе unarmed");
  ok(!bonuses(kami, psiPower).includes("Камікадзе"), "no Камікадзе on a psychic power");
}

// (the «Психо діє» toggle itself needs the DOM: checked in Foundry, not here)

// enemies
{
  const sys = (kamikaze, used) => ({ flags: { kamikaze }, moves: [{ n: "Ін’єкція Психо", t: "", used }], attacks: [
    { name: "Важка зброя", dice: "2d6", note: "" }, { name: "Кулаки", dice: "1d6", note: "" }, { name: "Пси-удар", dice: "2d6", note: "" }, { name: "Укуси", dice: "2d6kl1", note: "" }] });
  const dice = (s) => s.attacks.map((_, i) => attackDice(s, i));
  eq(dice(sys(false, false)), ["2d6", "1d6", "2d6", "2d6kl1"], "enemy: no Психо yet");
  eq(dice(sys(false, true)), ["2d6+2", "1d6", "2d6", "2d6kl1+2"], "enemy: Психо +2, not unarmed / Пси-удар");
  eq(dice(sys(true, true)), ["2d6+4", "1d6", "2d6", "2d6kl1+4"], "enemy: Психо and Камікадзе +4");
  eq(dice(sys(true, false)), ["2d6+2", "1d6", "2d6", "2d6kl1+2"], "enemy: Камікадзе alone +2");
}

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`psycho: OK (${checks} checks)`);
