// «На ціль» (author, 2026-11-15): a medicine used on the user's one target.
// Run: node tests/chem-target.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { isMachineName, planHeal, spendDose, useCopyOn, MACHINE_WORDS, REVIVE } from "../module/rules/chem-target.mjs";

let checks = 0, failures = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const { DRUGS } = Rc;
const six = () => 3; // a fixed die

// machine names
for (const n of ["Робот-охоронець", "Протектрон", "Сек'юритрон", "Секʼюритрон", "Турель", "Вертиберд", "Містер Помічник", "Містер Сміливець", "Робомозок", "Бум-око", "Кіберпес", "Робо-скорпіон X-42", "РОБОТ"]) ok(isMachineName(n), "machine: " + n);
for (const n of ["Дикий гуль", "Рейдер", "Пазур Смерті", "", null]) ok(!isMachineName(n), "not a machine: " + n);
ok(MACHINE_WORDS.length === 13, "the word list");

// who is valid
const enemy = (machine, hp = 5, max = 20) => ({ kind: "enemy", machine, hp, max });
const caravan = (vehicle, hp = 5, max = 30) => ({ kind: "caravan", vehicle, hp, max });
let p = planHeal("Стимпак", DRUGS["Стимпак"], enemy(false), six);
ok(p.ok && p.amount === DRUGS["Стимпак"].heal.base, "stimpak heals a living enemy");
p = planHeal("Суперстимпак", DRUGS["Суперстимпак"], enemy(false), six);
ok(p.ok && p.amount === 7 && p.defer === 1, "super stimpak: 1d6 + 4, 1d6 deferred (the GM rolls an enemy's)");
p = planHeal("Хотфікс", DRUGS["Хотфікс"], enemy(true), six);
ok(p.ok && p.amount === DRUGS["Хотфікс"].heal.base, "Хотфікс heals a robot enemy");
p = planHeal("Критфікс", DRUGS["Критфікс"], caravan("tachka"), six);
ok(p.ok && p.amount === 7 && p.defer === 1, "Критфікс repairs a «Тачка», 1d6 deferred");
// any caravan takes the machines' meds and nothing else (author, 2026-11-18, after the playtest)
p = planHeal("Критфікс", DRUGS["Критфікс"], caravan("brahmins"), six);
ok(p.ok && p.amount === 7 && p.defer === 1, "Критфікс repairs a brahmins' caravan, 1d6 deferred");
p = planHeal("Хотфікс", DRUGS["Хотфікс"], caravan("brahmins"));
ok(p.ok && p.amount === DRUGS["Хотфікс"].heal.base, "Хотфікс repairs a brahmins' caravan");
ok(planHeal("Ребут", DRUGS["Ребут"], caravan("brahmins", 0)).ok, "Ребут brings back a brahmins' caravan at 0 ОЗ");
ok(!planHeal("Ребут", DRUGS["Ребут"], caravan("brahmins", 3)).ok, "Ребут: only at 0 ОЗ");
p = planHeal("Стимпак", DRUGS["Стимпак"], caravan("brahmins"));
ok(!p.ok && /ремонт або ліки для механізмів/.test(p.reason), `stimpak not on brahmins, says what does: «${p.reason}»`);
ok(!planHeal("Хотфікс", DRUGS["Хотфікс"], enemy(false)).ok, "Хотфікс not on a living enemy");
ok(!planHeal("Стимпак", DRUGS["Стимпак"], enemy(true)).ok, "stimpak not on a robot");
ok(!planHeal("Стимпак", DRUGS["Стимпак"], caravan("tachka")).ok, "stimpak not on a «Тачка»");
for (const k of Object.keys(DRUGS)) {
  if (!DRUGS[k].robot) ok(!planHeal(k, DRUGS[k], caravan("brahmins")).ok, "brahmins take no living meds: " + k);
  ok(!planHeal(k, DRUGS[k], { kind: "place", hp: 1, max: 1 }).ok, "a place takes nothing: " + k);
  const D = DRUGS[k];
  if (!D.heal && !D.superHeal && !REVIVE.has(k)) ok(!planHeal(k, D, enemy(!!D.robot)).ok, "non-healing, no effect: " + k);
}
ok(!planHeal("Стимпак", DRUGS["Стимпак"], enemy(false, 20, 20)).ok, "full HP: nothing to heal");
ok(planHeal("Стимпак", DRUGS["Стимпак"], enemy(false, 25, 20)).ok === false, "above max: nothing to heal, not cut");
ok(planHeal("Стимпак", DRUGS["Стимпак"], enemy(false, 0, 20)).ok, "from 0 HP");
// revive
p = planHeal("Адреналін", DRUGS["Адреналін"], enemy(false, 0, 20));
ok(p.ok && p.amount === 1, "Адреналін: 0 HP → 1");
ok(!planHeal("Адреналін", DRUGS["Адреналін"], enemy(false, 3, 20)).ok, "Адреналін: not for one that is up");
ok(!planHeal("Адреналін", DRUGS["Адреналін"], enemy(true, 0, 20)).ok, "Адреналін: not for a machine");
p = planHeal("Ребут", DRUGS["Ребут"], enemy(true, 0, 20));
ok(p.ok && p.amount === 1, "Ребут: 0 HP → 1");
ok(!planHeal("Ребут", DRUGS["Ребут"], enemy(false, 0, 20)).ok, "Ребут: not for the living");

// the user's dose
let st = { other: [{ n: "Стимпак", q: "3" }, { n: "Хотфікс", q: "1" }, { n: "Бухло", q: "" }, { n: "Порожнє", q: "0" }] };
ok(spendDose(st, 0) === "spent" && st.other[0].q === "2", "3 → 2");
ok(spendDose(st, 1) === "gone" && st.other.length === 3 && st.other[1].n === "Бухло", "the last: the row goes");
ok(spendDose(st, 1) === "none" && st.other[1].q === "", "blank quantity: not spent");
ok(spendDose(st, 2) === "empty", "0 left");
ok(spendDose(st, 9) === "empty", "no such row");

// the target's own rules engine
function pc(species, feats = [], extra = {}) {
  const s = Rc.rollCharacter(null);
  s.species = species;
  s.feats = (s.feats || []).filter((f) => f !== "Кіборг").concat(feats);
  s.other = [];
  s.hpCur = "1";
  s.loot = {};
  Object.assign(s, extra);
  const msgs = [];
  return { s, L: createLogic({ st: s, toast: (m) => m && msgs.push(m) }), msgs };
}
let t = pc("human");
ok(useCopyOn(t.s, t.L, { n: "Стимпак" }) && t.s.other.length === 0 && Number(t.s.hpCur) > 1, "human takes a stimpak: HP up, no row left behind");
ok(t.s.chem.uses["Стимпак"] === 1, "the daily counter is the target's");
t = pc("human");
t.s.other = [{ n: "Хотфікс", q: "2" }];
ok(!useCopyOn(t.s, t.L, { n: "Хотфікс" }) && t.s.other.length === 1 && t.s.other[0].q === "2", "Хотфікс refused on a human: nothing left behind");
ok(t.msgs.length && t.msgs.at(-1).includes("механізм"), "…with the reason");
t = pc("robot");
ok(!useCopyOn(t.s, t.L, { n: "Стимпак" }), "stimpak refused on a robot");
t = pc("robot");
ok(useCopyOn(t.s, t.L, { n: "Хотфікс" }), "Хотфікс works on a robot");
t = pc("robot", ["Кіборг"]);
ok(!useCopyOn(t.s, t.L, { n: "Хотфікс" }), "Хотфікс refused on a cyborg");
t = pc("human");
ok(useCopyOn(t.s, t.L, { n: "Суперстимпак" }) && t.s.chem.superDice === 1, "super stimpak: the deferred die lands on the target");
t = pc("human");
ok(useCopyOn(t.s, t.L, { n: "Бустер", attr: "SL" }) && t.s.chem.scene.some((e) => e.attr && e.attr.SL === 1), "booster: the user's attribute");
t = pc("human");
ok(!useCopyOn(t.s, t.L, { n: "Бустер" }) , "booster with no attribute: refused");
t = pc("human", [], { hpCur: "" });
ok(!useCopyOn(t.s, t.L, { n: "Стимпак" }), "full HP: the engine refuses the stimpak");

console.log(`${checks} checks, ${failures} failures`);
process.exit(failures ? 1 : 0);
