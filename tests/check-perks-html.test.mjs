// The HTML character sheet's copy of the perks that change a rolled check (HTML backport 6.6, 2026-11-25): «Щасливець» and
// «Бісова штуковина!» as buttons left of «Інша перевірка» under the result. The sheet keeps a hand-written copy of
// module/rules/check-perks.mjs between the marks «check-perks» of its app.js; this binds the copy to Foundry's module on grids
// of inputs (when each is offered; the ОД a reroll takes back).
// Run: node tests/check-perks-html.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as CK from "../module/rules/check-perks.mjs";
import { needSiblings } from "./sibling.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 15) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);
const clone = (o) => (o === undefined ? undefined : JSON.parse(J(o)));

needSiblings(["pustelnyky-character-generator/src/app.js"]);
const src = readFileSync(new URL("../../pustelnyky-character-generator/src/app.js", import.meta.url), "utf8");
const a = src.indexOf("/* == check-perks: копія == */"), b = src.indexOf("/* == check-perks: кінець копії == */");
if (a < 0 || b < a) throw new Error("app.js: the marks «check-perks» not found");
const H = vm.runInNewContext(`${src.slice(a, b)}\n({ KICK_TYPES, kickOffer, luckOffer, dropRollXp })`, {});

/** Foundry's function and the sheet's on clones of the same input: results and the changed input equal */
function same(label, f, h, args) {
  const fa = clone(args), ha = clone(args);
  let ra, rb, ea = "", eb = "";
  try { ra = f(...fa); } catch (e) { ea = e.message; }
  try { rb = h(...ha); } catch (e) { eb = e.message; }
  ok(J(ra) === J(rb) && !!ea === !!eb && J(fa) === J(ha), `${label}(${J(args)?.slice(0, 160)}) = ${J(rb)} ${eb}, Foundry ${J(ra)} ${ea}`);
}

ok(J(H.KICK_TYPES) === J(CK.KICK_TYPES), `KICK_TYPES: HTML ${J(H.KICK_TYPES)}, Foundry ${J(CK.KICK_TYPES)}`);

// when each perk is offered: every check type, verdict, flag of the last roll, perk set and «used»
const TYPES = ["gen", "overcome", "advantage", "learn", "attack", "dodge", "med", "treat", "travel", "consq", "repair", "gmod", undefined];
const PERKS = [[], ["Щасливець"], ["Бісова штуковина!"], ["Щасливець", "Бісова штуковина!"], ["Проклятий"]];
const FLAGS = ["hx", "luckUp", "dmg", "dmgDone", "xpGiven", "savGiven"];
for (const type of TYPES) for (const verdict of [0, 1, 2, 3]) for (let mask = 0; mask < 1 << FLAGS.length; mask++) {
  if (mask && mask & (mask - 1) && mask !== (1 << FLAGS.length) - 1) continue; // none, each flag alone, all of them
  for (const cursed of [false, true]) {
    const last = { type, verdict, ci: { cursed } };
    FLAGS.forEach((k, i) => { if (mask & (1 << i)) last[k] = k === "dmg" ? { key: "w0" } : k === "hx" ? "Застосовано." : 1; });
    for (const perks of PERKS) for (const used of [false, true]) {
      same("kickOffer", CK.kickOffer, H.kickOffer, [last, perks, used]);
      same("luckOffer", CK.luckOffer, H.luckOffer, [last, perks, used]);
    }
  }
}
for (const last of [null, undefined, {}, { verdict: 1 }, { type: "gen", verdict: 1, ci: null }]) {
  same("kickOffer", CK.kickOffer, H.kickOffer, [last, ["Щасливець", "Бісова штуковина!"]]);
  same("luckOffer", CK.luckOffer, H.luckOffer, [last, ["Щасливець", "Бісова штуковина!"]]);
  same("kickOffer", CK.kickOffer, H.kickOffer, [last]);
  same("luckOffer", CK.luckOffer, H.luckOffer, [last]);
}

// the ОД a reroll takes back: the panel's own (xpAuto), the buttons', «Старанний учень»'s count of the session
const LASTS = [
  null, {}, { xpGiven: 1 }, { xpGiven: 2, savGiven: 1 }, { savGiven: "1" }, { xpAuto: { fail: 1 } }, { xpAuto: { fail: 2, sav: 1, stud: 1, sess: 3 } },
  { xpAuto: { fail: 1, stud: 1 } }, { xpAuto: { fail: 1, stud: 1, sess: 2 }, xpGiven: 1 },
];
const STS = [
  null, {}, { xp: 0 }, { xp: "3" }, { xp: 5, chem: { studFails: { n: 2, sess: 3 } } }, { xp: 1, chem: { studFails: { n: 1, sess: 2 } } }, { xp: 2, chem: {} },
  { xp: 4, chem: { studFails: { n: 0 } } },
];
for (const st of STS) for (const last of LASTS) same("dropRollXp", CK.dropRollXp, H.dropRollXp, [st, last]);

console.log(failures ? `check-perks-html: ${failures} of ${checks} checks FAILED` : `check-perks-html: OK (${checks} checks)`);
process.exit(failures ? 1 : 0);
