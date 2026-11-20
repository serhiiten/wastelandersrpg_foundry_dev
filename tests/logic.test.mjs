// Chems, rest, defenses and the check / damage panel (logic.mjs) on generated characters.
// Run with: node tests/logic.test.mjs — nothing may throw, and every check must give a verdict.
import * as R from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";

const drugs = Object.keys(R.DRUGS);
let errors = 0;
let uses = 0;
let checks = 0;
let damage = 0;
const fail = (i, what, err) => {
  errors++;
  if (errors < 6) console.log("FAIL", i, what, err.message, (err.stack || "").split("\n")[1]);
};

for (let i = 0; i < 300; i++) {
  R.setRandom(R.mulberry32(i + 1));
  const st = R.rollCharacter(null);
  const L = createLogic({ st, ui: { restMedic: i % 2 === 0, restBed: i % 5 === 0, restRad: i % 3 === 0 } });

  // drugs, scene / day / session, rest, defenses
  try {
    const order = drugs.slice(i % drugs.length).concat(drugs.slice(0, i % drugs.length)).slice(0, 4);
    for (const name of order) {
      st.other.push({ n: name, q: "2", note: "" });
      L.useItem(st.other.length - 1);
      uses++;
    }
    L.endScene();
    L.newDay();
    L.endSession();
    L.doRest();
    L.defenses(R.compute(st));
  } catch (err) {
    fail(i, "chem", err);
  }

  // checks: every preset of the panel, then damage and Кістка Долі
  try {
    const presets = L.ROLL_PRESETS.concat(L.extraPresets());
    for (const p of presets.slice(0, 6)) {
      L.applyPreset(p);
      L.doRoll();
      checks++;
      if (!L.R.last || L.R.last.verdict == null) throw new Error(`no verdict for preset ${JSON.stringify(p).slice(0, 60)}`);
    }
    if (st.weapons.length) {
      L.R.type = "attack";
      L.doDamage();
      damage++;
    }
    L.rollFate();
  } catch (err) {
    fail(i, "roller", err);
  }
}
// F1, F8 of Fable's analysis (author, 2026-11-20): no «Ціль — робот чи електроніка (+1d6)» in Foundry (the hit adds it, once);
// the wiki's «кістка», never «кубик»
{
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../module/rules/logic.mjs", import.meta.url), "utf8");
  if (/tog\('robot'/.test(src)) { errors++; console.log("FAIL F1: the robot toggle is back in logic.mjs"); }
  if (/убик/.test(src)) { errors++; console.log("FAIL F8: «кубик» in logic.mjs"); }
}
R.setRandom(null);
console.log(`characters 300, drug uses ${uses}, checks ${checks}, damage rolls ${damage}, errors ${errors}`);
console.log(errors ? "FAIL" : "OK");
process.exit(errors ? 1 : 0);
