// The paid services of the HTML sheets (row 3.1 / 3.6 of the backport, 2026-11-19) are hand-written copies of Foundry's
// formulas (module/rules/caravan-range.mjs buyPlan, char-services.mjs). This binds them: the same prices per unit and the
// same plan for every lack × caps on a grid, read from the HTML sources next to the repo.
// Run: node tests/services-html.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buyPlan, UNITS_PER_CAP, HP_PER_CAP as CAR_HP } from "../module/rules/caravan-range.mjs";
import { HP_PER_CAP, SUP_PER_CAP, CONS_PRICE } from "../module/rules/char-services.mjs";
import { needSiblings } from "./sibling.mjs";

let failures = 0;
let checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 12) console.log("FAIL", m); } };

/** The source text of `function buyPlan(...) {...}` and the line of constants before it */
function extract(file, constRe) {
  const src = readFileSync(new URL(file, import.meta.url), "utf8");
  const a = src.indexOf("function buyPlan(");
  if (a < 0) throw new Error(`${file}: buyPlan not found`);
  let i = src.indexOf("{", a), depth = 0;
  for (; i < src.length; i++) { if (src[i] === "{") depth++; else if (src[i] === "}" && --depth === 0) break; }
  const m = src.match(constRe);
  if (!m) throw new Error(`${file}: constants not found`);
  return m[0] + "\n" + src.slice(a, i + 1);
}

needSiblings(["pustelnyky-character-generator/src/app.js", "pustelnyky-caravan/src/caravan.src.html"]);
const sheets = {
  character: { code: extract("../../pustelnyky-character-generator/src/app.js", /const HP_PER_CAP=\d+, SUP_PER_CAP=\d+, CONS_PRICE=\{[^}]*\};/), read: "({ buyPlan, HP_PER_CAP, SUP_PER_CAP, CONS_PRICE })" },
  caravan: { code: extract("../../pustelnyky-caravan/src/caravan.src.html", /const UNITS_PER_CAP = \d+, HP_PER_CAP = \d+;/), read: "({ buyPlan, UNITS_PER_CAP, HP_PER_CAP })" },
};
const H = {};
for (const [k, s] of Object.entries(sheets)) H[k] = vm.runInNewContext(s.code + "\n" + s.read, {});

ok(H.character.HP_PER_CAP === HP_PER_CAP, `character HP_PER_CAP ${H.character.HP_PER_CAP} / Foundry ${HP_PER_CAP}`);
ok(H.character.SUP_PER_CAP === SUP_PER_CAP, `character SUP_PER_CAP ${H.character.SUP_PER_CAP} / Foundry ${SUP_PER_CAP}`);
ok(JSON.stringify(H.character.CONS_PRICE) === JSON.stringify(CONS_PRICE), `CONS_PRICE ${JSON.stringify(H.character.CONS_PRICE)} / Foundry ${JSON.stringify(CONS_PRICE)}`);
ok(H.caravan.UNITS_PER_CAP === UNITS_PER_CAP, `caravan UNITS_PER_CAP ${H.caravan.UNITS_PER_CAP} / Foundry ${UNITS_PER_CAP}`);
ok(H.caravan.HP_PER_CAP === CAR_HP, `caravan HP_PER_CAP ${H.caravan.HP_PER_CAP} / Foundry ${CAR_HP}`);

const lacks = [-3, 0, 1, 2, 3, 4, 5, 6, 7, 10, 11, 14, 15, 16, 29, 30, 31, 99, "4", "", null, undefined, 2.6];
const caps = [-1, 0, 1, 2, 3, 4, 5, 6, 10, 99, "3", "", null, undefined, 1.4];
for (const per of [3, 5]) for (const l of lacks) for (const c of caps) {
  const want = JSON.stringify(buyPlan(l, c, per));
  for (const k of Object.keys(H)) {
    const got = JSON.stringify(H[k].buyPlan(l, c, per));
    ok(got === want, `${k} buyPlan(${JSON.stringify(l)}, ${JSON.stringify(c)}, ${per}) = ${got}, Foundry ${want}`);
  }
}

console.log(failures ? `services-html: ${failures} of ${checks} failed` : `services-html OK (${checks} checks)`);
if (failures) process.exit(1);
