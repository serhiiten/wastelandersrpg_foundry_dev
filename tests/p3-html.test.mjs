// The HTML character sheet's copy of the П3 combat rules (HTML backport 6.7, 2026-11-25; «Притиснутий вогнем» stays in Foundry,
// author 2026-11-25): a partial attack is damage or an effect, a grenade on a failure, «Спрямована дія», the cover as an aspect.
// The sheet keeps hand-written copies of module/rules/attack-effects.mjs, grenade-fail.mjs and cover.mjs between the marks «p3» of
// its app.js (COVER_PREFIX between the marks «battle-health»); this binds the copies to Foundry's modules on grids of inputs.
// Run: node tests/p3-html.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as FX from "../module/rules/attack-effects.mjs";
import * as GF from "../module/rules/grenade-fail.mjs";
import * as CV from "../module/rules/cover.mjs";
import { needSiblings } from "./sibling.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 15) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);
const clone = (o) => (o === undefined ? undefined : JSON.parse(J(o)));

needSiblings(["pustelnyky-character-generator/src/app.js"]);
const src = readFileSync(new URL("../../pustelnyky-character-generator/src/app.js", import.meta.url), "utf8");
const block = (name) => {
  const a = src.indexOf(`/* == ${name}: копія == */`), b = src.indexOf(`/* == ${name}: кінець копії == */`);
  if (a < 0 || b < a) throw new Error(`app.js: the marks «${name}» not found`);
  return src.slice(a, b);
};
const NAMES = ["FX_EFFECTS", "FX_LEGS", "fxOffer", "fxEffectOf", "fxFits", "fxToggle", "fxKeep", "fxEffectText", "DIRECTED", "isBlast",
  "leftOf", "chipsLeft", "spendOne", "isCoverText", "coverText", "coverIndex", "activeCover", "COVER_PREFIX"];
const H = vm.runInNewContext(`${block("battle-health")}\n${block("p3")}\n({ ${NAMES.join(", ")} })`, {});

/** Foundry's function and the sheet's on clones of the same input: results (or both throwing) equal */
function same(label, f, h, args) {
  let ra, rb, ea = "", eb = "";
  try { ra = f(...clone(args)); } catch (e) { ea = e.message; }
  try { rb = h(...clone(args)); } catch (e) { eb = e.message; }
  ok(J(ra) === J(rb) && !!ea === !!eb, `${label}(${J(args)?.slice(0, 140)}) = ${J(rb)?.slice(0, 140)} ${eb}, Foundry ${J(ra)?.slice(0, 140)} ${ea}`);
}

// constants
ok(J(H.FX_EFFECTS) === J(FX.EFFECTS), "EFFECTS differ");
ok(J(H.FX_LEGS) === J(FX.LEGS), "LEGS differ");
ok(H.DIRECTED === GF.DIRECTED, `DIRECTED: HTML ${H.DIRECTED}, Foundry ${GF.DIRECTED}`);
ok(H.COVER_PREFIX === CV.COVER_PREFIX, "COVER_PREFIX differs");

// attack-effects: offer, effectOf, fits, toggle, keep, effectText on every mode, verdict and perk set
const PERKS = ["По ногах", "Прицільний постріл", "Точний удар", "Покращені критичні удари", "Експерт-сапер", "Чим більша шафа"];
const MODES = ["ranged", "melee", "explosive", "щось", undefined];
const KEYS = [...new Set(Object.values(FX.EFFECTS).flatMap((m) => [...m.normal, ...m.crit].map((e) => e.key))), "down", "nope"];
const ATK_FX = {
  ranged: { n: "Бій на відстані", normal: ["r0", "r1", "r2"], crit: ["rc0", "rc1", "rc2", "rc3"] },
  melee: { n: "Ближній бій", normal: ["m0", "m1", "m2"], crit: ["mc0", "mc1", "mc2", "mc3"] },
  explosive: { n: "Гранати й вибухівка", normal: ["e0", "e1", "e2"], crit: ["ec0", "ec1", "ec2", "ec3"] },
};
for (const mode of MODES) for (const verdict of [-1, 0, 1, 2, 3, 4]) for (let mask = 0; mask < 1 << PERKS.length; mask++) {
  const perks = PERKS.filter((_, i) => mask & (1 << i));
  const o = { mode, verdict, perks };
  same("offer", FX.offer, H.fxOffer, [o]);
  if (mask % 7 && mask !== (1 << PERKS.length) - 1) continue; // the grids below on a sample of perk sets
  const of = FX.offer(o);
  for (const k of KEYS) same("effectOf", FX.effectOf, H.fxEffectOf, [of, k]);
  const avail = [...of.normal, ...of.crit].map((e) => e.key);
  const pickSets = [[], ...avail.map((k) => [k]), avail.slice(0, 2), avail.slice(-2), avail, ["nope", ...avail.slice(0, 1)]];
  for (const picks of pickSets) {
    same("fits", FX.fits, H.fxFits, [of, picks]);
    same("keep", FX.keep, H.fxKeep, [of, picks]);
    for (const k of KEYS) for (const on of [true, false]) same("toggle", FX.toggle, H.fxToggle, [of, picks, k, on]);
  }
}
for (const mode of MODES) for (const tier of ["normal", "crit", "x"]) for (const k of KEYS) {
  same("effectText", FX.effectText, H.fxEffectText, [ATK_FX, mode, { key: k, tier }]);
  same("effectText", FX.effectText, H.fxEffectText, [{}, mode, { key: k, tier }]);
}
same("effectText", FX.effectText, H.fxEffectText, [ATK_FX, "ranged", null]);

// grenade-fail: isBlast, leftOf, chipsLeft, spendOne
const QS = [undefined, null, "", " ", "0", "1", "2", " 3 ", "-1", "abc", 5, 0, "2шт"];
for (const type of ["attack", "dodge", undefined]) for (const mode of ["explosive", "ranged", "melee", ""]) for (const v of [0, "0", 1, 2, 3, -1, undefined])
  same("isBlast", GF.isBlast, H.isBlast, [{ type, verdict: v }, mode]);
same("isBlast", GF.isBlast, H.isBlast, [null, "explosive"]);
for (const q of QS) {
  same("leftOf", GF.leftOf, H.leftOf, [{ q }]);
  for (const n of [undefined, "", "Осколкова граната"]) same("spendOne", GF.spendOne, H.spendOne, [{ n, q }]);
}
same("leftOf", GF.leftOf, H.leftOf, [undefined]);
same("spendOne", GF.spendOne, H.spendOne, [undefined]);
const choices = [null, { key: "w0", d: "1d10" }, { key: "o1", expl: true, o: { n: "Граната", q: "2" } }, { key: "o2", expl: true, o: { n: "Динаміт", q: "0" } },
  { key: "gone", expl: true, o: { n: "Граната", q: "0" } }, { key: "o3", expl: true }, { key: "o4", expl: true, o: { n: "C-4", q: "" } }, { key: "o5", expl: false, o: { q: "1" } },
  { key: "o6", expl: true, gas: true, o: { n: "Газова граната", q: "abc" } }];
for (let mask = 0; mask < 1 << choices.length; mask += 3) same("chipsLeft", GF.chipsLeft, H.chipsLeft, [choices.filter((_, i) => mask & (1 << i))]);
same("chipsLeft", GF.chipsLeft, H.chipsLeft, [undefined]);

// cover: isCoverText, coverText, coverIndex, activeCover on both list shapes
for (const t of [undefined, null, "", "Прикритий: Ада", "Прикритий:", "прикритий: Ада", " Прикритий: Ада", "Засідка", 5]) same("isCoverText", CV.isCoverText, H.isCoverText, [t]);
for (const b of [undefined, null, "", "  ", "Ада", " Бо "]) same("coverText", CV.coverText, H.coverText, [b]);
const LISTS = [undefined, null, [], [{ t: "Засідка", inv: 1 }], [{ t: "Прикритий: Ада", inv: 0 }, { t: "Прикритий: Бо", inv: 1 }],
  [{ t: "Прикритий: Ада", inv: "1" }, { t: "Прикритий: Бо", inv: 2 }], [{ name: "Прикритий: Ада", invoked: 1 }], [null, { t: "Прикритий: ", inv: 1 }],
  [{ t: "Прикритий: Ада", inv: -1 }, { name: "Прикритий: Бо", invoked: "x" }, { t: "Прикритий: Ві", invoked: 1 }]];
for (const l of LISTS) { same("coverIndex", CV.coverIndex, H.coverIndex, [l]); same("activeCover", CV.activeCover, H.activeCover, [l]); }

console.log(failures ? `p3-html: ${failures} of ${checks} FAILED` : `p3-html: ${checks} OK`);
if (failures) process.exit(1);
