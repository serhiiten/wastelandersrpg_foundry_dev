// Chems, addictions, rest and defenses (chem.mjs) on generated characters, run with: node tests/chem.test.mjs
// Every drug is used, scenes/days/sessions end and the character rests; nothing may throw.
import * as R from "../module/rules/core.mjs";
import { createChem } from "../module/rules/chem.mjs";

const drugs = Object.keys(R.DRUGS);
let errors = 0;
let uses = 0;
for (let i = 0; i < 300; i++) {
  R.setRandom(R.mulberry32(i + 1));
  const st = R.rollCharacter(null);
  const C = createChem({ st, toast: () => {}, ui: { restMedic: i % 2 === 0, restBed: i % 5 === 0, restRad: i % 3 === 0 } });
  try {
    const order = drugs.slice(i % drugs.length).concat(drugs.slice(0, i % drugs.length)).slice(0, 4);
    for (const name of order) {
      st.other.push({ n: name, q: "2", note: "" });
      C.useItem(st.other.length - 1);
      uses++;
    }
    C.endScene();
    C.newDay();
    C.endSession();
    C.doRest();
    C.defenses(R.compute(st));
  } catch (err) {
    errors++;
    if (errors < 5) console.log("FAIL", i, err.message);
  }
}
R.setRandom(null);
console.log(`characters 300, drug uses ${uses}, errors ${errors}`);
console.log(errors ? "FAIL" : "OK");
process.exit(errors ? 1 : 0);
