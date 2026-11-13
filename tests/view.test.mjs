// The sheet's view (module/sheets/character-view.mjs) for many characters and sheet UI states.
// Run: node tests/view.test.mjs — buildView must not throw, and lists must be lists.
import * as R from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { buildView } from "../module/sheets/character-view.mjs";

const UI = [
  {}, { pick: "perk" }, { pick: "feat", showAll: true, q: "а" }, { guide: true },
  { cat: true }, { cat: true, catQ: "граната" }, { cat: true, catSort: "name" }, { cat: true, catSort: "power", catSec: "w" },
  { cat: true, catSort: "pdesc", catSec: "c" },
];
let errors = 0;
let views = 0;
for (let i = 0; i < 200; i++) {
  R.setRandom(R.mulberry32(i + 1));
  const st = R.rollCharacter(null);
  if (i % 3 === 0) st.set.guns = true;
  if (i % 4 === 0) st.cons.l = "Подряпина";
  if (i % 5 === 0) st.hpCur = "0";
  const L = createLogic({ st });
  for (const ui of UI) {
    try {
      const v = buildView(st, R.compute(st), L, ui);
      views++;
      for (const k of ["attrs", "skills", "perks", "feats", "imps", "weapons", "armorList", "other", "chips", "defenses"]) {
        if (!Array.isArray(v[k])) throw new Error(`${k} is not a list`);
      }
      if (ui.cat && !Array.isArray(v.catalog?.groups)) throw new Error("catalog has no groups");
      // every weapon row carries what its fields show (a lost key leaves a field empty on the sheet)
      for (const w of v.weapons) {
        for (const k of ["n", "d", "en", "note", "price", "hand", "fav", "h", "dt"]) if (!(k in w)) throw new Error(`weapon row has no «${k}»`);
        if (w.note !== (st.weapons[w.i].note || "")) throw new Error(`weapon ${w.i}: note «${w.note}» ≠ «${st.weapons[w.i].note || ""}»`);
      }
    } catch (err) {
      errors++;
      if (errors < 5) console.log("FAIL", i, JSON.stringify(ui), err.message);
    }
  }
}
R.setRandom(null);
console.log(`views ${views}, errors ${errors}`);
console.log(errors ? "FAIL" : "OK");
process.exit(errors ? 1 : 0);
