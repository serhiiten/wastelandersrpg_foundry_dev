// A crit of an attack (author, 2026-11-15): without «Покращені критичні удари» either «+2» or «+1d6», not both; with it, both
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../module/rules/logic.mjs", import.meta.url), "utf8");
let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error("FAIL", m); process.exit(1); } };
// the rule, as rollerChange runs it: a plain model of its condition
const tick = (opt, k, on, verdict, perks) => {
  opt[k] = on;
  if (on && (k === "norm2" || k === "crit") && verdict === 3 && !perks.includes("Покращені критичні удари")) opt[k === "norm2" ? "crit" : "norm2"] = false;
  return opt;
};
ok(src.includes("R.last.verdict===3 && !compute(st).allPerks.includes('Покращені критичні удари')) R.dmgOpt[t.dataset.k==='norm2'?'crit':'norm2']=false"), "the patch is in logic.mjs");
let o = tick(tick({ norm2: false, crit: false }, "norm2", true, 3, []), "crit", true, 3, []);
ok(o.crit && !o.norm2, "crit after +2: +2 cleared");
o = tick(o, "norm2", true, 3, []);
ok(o.norm2 && !o.crit, "+2 after crit: crit cleared");
o = tick(tick({ norm2: false, crit: false }, "norm2", true, 3, ["Покращені критичні удари"]), "crit", true, 3, ["Покращені критичні удари"]);
ok(o.norm2 && o.crit, "with the perk: both");
o = tick(tick({ norm2: true, crit: false }, "psycho", true, 3, []), "norm2", true, 3, []);
ok(o.norm2 && o.psycho, "other options untouched");
console.log(`crit-effect OK (${n} checks)`);
