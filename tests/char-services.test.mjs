// Paid services on the character sheet (author, 2026-11-15): HP 5 a cap, Припаси 3 a cap, consequences 2 / 5 / 8
import { CONS_PRICE, buyButton, consPlan, healPlan, supPlan } from "../module/rules/char-services.mjs";
let n = 0, bad = 0;
const ok = (c, m) => { n++; if (!c) { bad++; console.error("FAIL", m); } };
const eq = (a, b) => a.units === b.units && a.cost === b.cost;
ok(eq(healPlan(12, 10), { units: 12, cost: 3 }) && eq(healPlan(12, 2), { units: 10, cost: 2 }) && eq(healPlan(0, 5), { units: 0, cost: 0 }), "HP: 5 a cap, as much as the caps pay");
ok(eq(supPlan(3, 4), { units: 3, cost: 1 }) && eq(supPlan(5, 1), { units: 3, cost: 1 }) && eq(supPlan(2, 0), { units: 0, cost: 0 }), "Припаси: 3 a cap");
ok(CONS_PRICE.l === 2 && CONS_PRICE.m === 5 && CONS_PRICE.m2 === 5 && CONS_PRICE.h === 8, "consequence prices from the wiki");
ok(consPlan("m", "зламана рука", false, 5).can && !consPlan("m", "зламана рука", false, 4).can && !consPlan("h", "", false, 9).can && !consPlan("l", "синець", true, 9).can, "a consequence: there, untreated, paid whole");
const b = buyButton(12, 2, 5, { verb: "Вилікувати", unit: "ОЗ", full: "ОЗ повні", rate: "1(к) за 5 ОЗ" });
ok(b.label === "Вилікувати за 2(к)" && !b.off && /10 з 12/.test(b.title), "button: partial");
ok(buyButton(0, 9, 5, { verb: "Вилікувати", unit: "ОЗ", full: "ОЗ повні", rate: "" }).off && buyButton(5, 0, 5, { verb: "Вилікувати", unit: "ОЗ", full: "", rate: "" }).off, "button off: full or no caps");
console.log(bad ? `char-services: ${bad} of ${n} failed` : `char-services: OK (${n} checks)`);
if (bad) process.exit(1);
