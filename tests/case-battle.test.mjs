// A case's enemies as a battle (author, 2026-11-17): the group → kind map, «Міць супротивників» → counts, the battle built
// from the battle generator's database. Run: node tests/case-battle.test.mjs
import { CASE_KINDS, CASE_KIND_DEFAULT, caseKind, casePower, caseBattle, CASE_DIFF } from "../module/rules/case-battle.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// the groups
eq(caseKind("Ши"), "shi", "Ши");
eq(caseKind("Легіонери Цезаря"), "legion", "Легіонери Цезаря");
eq(caseKind("Агенти Братства Сталі"), "bos", "Агенти Братства Сталі");
eq(caseKind("Розумні Пазурі Смерті"), "beasts", "Пазурі");
eq(caseKind("Фермери"), CASE_KIND_DEFAULT, "civilians → bandits");
eq(caseKind("Пʼяниці"), CASE_KIND_DEFAULT, "apostrophe variant");
eq(caseKind("Рейдери"), "raiders", "raiders");
ok(Object.values(CASE_KINDS).every((k) => ["robots", "supermutants", "shi", "legion", "bos", "ghouls", "ncr", "beasts"].includes(k)), "known kinds only");

// the power
eq(casePower("3 елітні супротивники"), [{ cat: "elite", count: 3 }], "3 elites");
eq(casePower("1 бос і 2 елітні супротивники"), [{ cat: "boss", count: 1 }, { cat: "elite", count: 2 }], "boss and elites");
eq(casePower("1 елітний супротивник і 4 рядові супротивники"), [{ cat: "elite", count: 1 }, { cat: "regular", count: 4 }], "elite and regulars");
eq(casePower("2 боси"), [{ cat: "boss", count: 2 }], "2 bosses");
eq(casePower("5 елітних супротивників"), [{ cat: "elite", count: 5 }], "5 elites");
eq(CASE_DIFF["важка"], "hard", "difficulty");

// the battle
const ORDER = ["statists", "regular", "elite", "boss"];
const e = (name, hp = 10) => ({ name, hp });
const DB = {
  shi: { statists: [], regular: [e("A"), e("B")], elite: [e("C"), e("D")], boss: [e("Big", 50), e("Small", 30)] },
  bare: { statists: [e("S")], regular: [], elite: [], boss: [] },
};
const b = caseBattle(DB, ORDER, "shi", [{ cat: "elite", count: 3 }]);
const count = (bt, cat) => bt.allocations.find((a) => a.targetCat === cat).entries.reduce((n, x) => n + x.count, 0);
eq(count(b, "elite"), 3, "three elites in all");
ok(b.allocations.find((a) => a.targetCat === "elite").entries.length <= 2, "at most two kinds of a category");
eq(b.pickedCase, { elite: 3 }, "picked case");
const bb = caseBattle(DB, ORDER, "shi", [{ cat: "boss", count: 1 }], { rnd: () => 0.1 });
eq(bb.allocations.find((a) => a.targetCat === "boss").entries[0].enemy.name, "Small", "a boss under 40 HP unless deadly");
const near = caseBattle(DB, ORDER, "bare", [{ cat: "elite", count: 2 }]);
eq(count(near, "statists"), 2, "a missing category takes the nearest one");
eq(caseBattle(DB, ORDER, "nope", [{ cat: "elite", count: 1 }]), null, "unknown kind");
eq(caseBattle(DB, ORDER, "shi", []), null, "no power");

console.log(failures ? `case-battle: FAIL (${failures} of ${checks})` : `case-battle: OK (${checks} checks)`);
if (failures) process.exitCode = 1;
