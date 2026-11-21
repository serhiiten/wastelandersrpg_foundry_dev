// A .json file is played through «dry» before it touches an actor (author, 2026-11-16; module/rules/file-check.mjs):
// real sheets open, damaged files are refused. Run: node tests/file-check.test.mjs
import { fileStateOk } from "../module/rules/file-check.mjs";
import { QUICK_CHARS } from "../module/rules/quickstart.mjs";
import { QUICK_START } from "../module/rules/caravan.mjs";
import { blankState } from "../module/rules/core.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const clone = (o) => JSON.parse(JSON.stringify(o));

// real sheets open
for (const c of QUICK_CHARS) ok(fileStateOk(clone(c), "character"), `quick-start ${c.name} opens`);
ok(fileStateOk(blankState(), "character"), "an empty character opens");
ok(fileStateOk(clone(QUICK_START), "caravan"), "«Останній Шанс» opens");
ok(fileStateOk({ companyName: "Новий" }, "caravan"), "a caravan with only a name opens (the rules fill the rest)");
// what the import repairs by itself still opens
ok(fileStateOk({ ...blankState(), species: "dragon", name: "Д" }, "character"), "an unknown species falls back");
ok(fileStateOk({ ...blankState(), base: { SL: 0, VP: -50, VTR: 1e9 } }, "character"), "numbers out of range are clamped");
ok(fileStateOk({ ...blankState(), hpCur: "12", caps: "5", supMax: "" }, "character"), "numbers as text and empty fields open");
// damaged files are refused
ok(!fileStateOk({ ...blankState(), base: { SL: "abc" } }, "character"), "an attribute that is no number refused (stress test, 2026-11-17)");
ok(!fileStateOk({ ...blankState(), skills: { "Стрільба": "майстер" } }, "character"), "a skill level that is no number refused");
ok(!fileStateOk({ ...blankState(), caps: "багато" }, "character"), "caps that are no number refused");
ok(!fileStateOk({ ...blankState(), hpCur: true }, "character"), "HP that are no number refused");
ok(!fileStateOk({ ...clone(QUICK_START), budget: "багато" }, "caravan"), "a caravan budget that is no number refused");
ok(!fileStateOk({ ...clone(QUICK_START), imp: { armor: "так" } }, "caravan"), "an upgrade level that is no number refused");
ok(!fileStateOk({ base: null, skills: null, species: null }, "character"), "null attributes refused");
ok(!fileStateOk({ ...blankState(), perks: { a: 1 }, name: "x" }, "character"), "perks that are no list refused");
ok(!fileStateOk({ ...blankState(), feats: "так", name: "x" }, "character"), "feats that are no list refused");
ok(!fileStateOk({ ...clone(QUICK_START), counters: [null, 5] }, "caravan"), "broken caravan counters refused");
// the caravan's bonuses and defences (stage 3 of the backport, 2026-11-19): numbers and an object
ok(fileStateOk({ ...clone(QUICK_START), hpBonus: -3, armorBonus: "2", psiArmor: 1, defOv: { rad: "half" } }, "caravan"), "a caravan with bonuses and defences opens");
ok(!fileStateOk({ ...clone(QUICK_START), hpBonus: "багато" }, "caravan"), "a max HP bonus that is no number refused");
ok(!fileStateOk({ ...clone(QUICK_START), armorBonus: true }, "caravan"), "an armour bonus that is no number refused");
ok(!fileStateOk({ ...clone(QUICK_START), psiArmor: "x" }, "caravan"), "psychic armour that is no number refused");
ok(!fileStateOk({ ...clone(QUICK_START), defOv: "half" }, "caravan"), "defences that are no object refused");
ok(!fileStateOk({ ...clone(QUICK_START), defOv: ["half"] }, "caravan"), "defences as a list refused");

console.log(failures ? `${failures} of ${checks} checks FAILED` : `file-check OK (${checks} checks)`);
if (failures) process.exit(1);
