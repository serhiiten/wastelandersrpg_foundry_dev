// Designer drugs' tables and sums (wiki «Дизайнерські наркотики»; author 2026-11-15): the price and the addiction chance of every
// row, the sums, the floor at 1, the limit 9, «заміняє попередній» groups, at most 3 attributes, consequences against Гідра /
// Меланжева кислота, the ranges of the perk effects, and the recipe → def conversion.
// Run: node tests/designer.test.mjs
import {
  EFFECTS, SIDES, addEffect, addSide, designerPerks, perkKind, perkNeedsLuck, recipeDescription, recipeToDef, recipeTotals, rollSide,
} from "../module/rules/designer.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures < 40) console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// the wiki's tables, as written there: [k, price, chance]
const WIKI_EFFECTS = [
  ["attr", 1, 3], ["stim", 2, 1], ["super", 3, 2], ["hp1", 1, 2], ["hp2", 3, 3], ["hp3", 5, 4], ["dmg", 3, 5], ["armor", 2, 3],
  ["psi", 2, 3], ["halfPoison", 2, 2], ["halfRad", 2, 2], ["hydra", 5, 2], ["melange", 5, 2], ["adrenalin", 3, 2],
];
const WIKI_SIDES = [
  [1, "chance", -2, 1], [2, "attrScene", -2, -1], [3, "attrSession", -3, -2], [4, "loss1", -1, -1], [5, "loss2", -2, -2],
  [6, "loss3", -3, -3], [7, "berserk", -3, -3], [8, "consL", -2, -2], [9, "consM", -4, -3], [10, "consH", -5, -4],
];
const combat = designerPerks("combat");
const other = designerPerks("other");

// ---- tables ----
ok(EFFECTS.length === WIKI_EFFECTS.length + 2, "effects: 13 fixed rows and 2 perk rows");
for (const [k, price, ch] of WIKI_EFFECTS) {
  const e = EFFECTS.find((x) => x.k === k);
  ok(e && e.price === price && e.ch === ch, `effect ${k}: ${e?.price}/${e?.ch}, want ${price}/${ch}`);
  // alone: the sums are the row's own (the chance 9 or below, the price at least 1)
  const r = { effects: [{ k, ...(k === "attr" ? { attr: "SL" } : {}) }] };
  const T = recipeTotals(r);
  eq([T.price, T.ch, T.errors], [price, ch, []], `effect ${k} alone`);
}
eq(EFFECTS.find((x) => x.k === "perkC").price, [3, 5], "combat perk price range");
eq(EFFECTS.find((x) => x.k === "perkC").ch, [2, 4], "combat perk chance range");
eq(EFFECTS.find((x) => x.k === "perkN").price, [2, 4], "other perk price range");
eq(EFFECTS.find((x) => x.k === "perkN").ch, [1, 3], "other perk chance range");
ok(SIDES.length === 10, "10 side effects");
for (const [d, k, price, ch] of WIKI_SIDES) {
  const s = SIDES.find((x) => x.d === d);
  ok(s && s.k === k && s.price === price && s.ch === ch, `side ${d}: ${s?.k} ${s?.price}/${s?.ch}, want ${k} ${price}/${ch}`);
  const side = rollSide(d, "SL");
  ok(side && side.k === k, `rollSide(${d}) → ${side?.k}`);
  ok(!!side.attr === (k === "attrScene" || k === "attrSession"), `rollSide(${d}) attribute only for the penalties`);
}
ok(rollSide(0) === null && rollSide(11) === null, "rollSide outside 1–10");

// ---- sums, floors, the limit ----
// «Психо»-like: +1 SL (1/3), +2 damage (3/5) = 4/8; a side effect brings it down
let r = { effects: [{ k: "attr", attr: "SL" }, { k: "dmg" }], sides: [] };
eq(recipeTotals(r).price + "/" + recipeTotals(r).ch, "4/8", "attr + dmg");
r = { ...r, sides: [{ k: "attrSession", attr: "VTR" }, { k: "loss1" }] };
eq(recipeTotals(r).price + "/" + recipeTotals(r).ch, "1/5", "side effects lower both (price 4 − 3 − 1 = 0 counts as 1, chance 8 − 2 − 1 = 5)");
// floors: sides alone go below 1 and count as 1
const lone = recipeTotals({ effects: [], sides: [{ k: "consH" }] });
eq([lone.price, lone.ch, lone.rawPrice, lone.rawCh], [1, 1, -5, -4], "floor at 1");
ok(lone.warnings.some((w) => /нижч/.test(w)), "floor is explained");
const floorDmg = recipeTotals({ effects: [{ k: "stim" }], sides: [{ k: "consH" }] });
eq([floorDmg.price, floorDmg.ch], [1, 1], "stim + heavy consequence floors both");
// exactly 9 is fine, 10 is not
let T = recipeTotals({ effects: [{ k: "dmg" }, { k: "hp3" }] }); // 5 + 4
eq([T.ch, T.errors.length], [9, 0], "chance 9 is allowed");
T = recipeTotals({ effects: [{ k: "dmg" }, { k: "hp3" }, { k: "stim" }] });
ok(T.ch === 10 && T.errors.some((e) => /вищий за 9/.test(e)), "chance 10 is an error");
T = recipeTotals({ effects: [{ k: "dmg" }, { k: "hp3" }, { k: "stim" }], sides: [{ k: "attrScene", attr: "IN" }] });
eq([T.ch, T.errors.length], [9, 0], "a side effect brings 10 back to 9");

// ---- «заміняє попередній» ----
for (const [a, b] of [["stim", "super"], ["hp1", "hp2"], ["hp1", "hp3"], ["hp2", "hp3"]]) {
  T = recipeTotals({ effects: [{ k: a }, { k: b }] });
  ok(T.errors.some((e) => /замінюють/.test(e)), `${a} + ${b}: error`);
  const rr = addEffect(addEffect({ effects: [] }, { k: a }), { k: b });
  eq(rr.effects.map((e) => e.k), [b], `addEffect ${a} then ${b} replaces`);
  ok(recipeTotals(rr).errors.length === 0, `${b} replaced ${a}: no error`);
}
const lossR = addSide(addSide({ sides: [] }, { k: "loss1" }), { k: "loss3" });
eq(lossR.sides.map((s) => s.k), ["loss3"], "loss3 replaces loss1");
T = recipeTotals({ effects: [{ k: "stim" }], sides: [{ k: "loss1" }, { k: "loss2" }] });
ok(T.errors.some((e) => /замінюють/.test(e)), "two HP-loss side effects: error");
// not mutated
const base = { effects: [{ k: "hp1" }] };
addEffect(base, { k: "hp2" });
eq(base.effects.map((e) => e.k), ["hp1"], "addEffect doesn't change its argument");

// ---- repeats and attributes ----
T = recipeTotals({ effects: [{ k: "dmg" }, { k: "dmg" }] });
ok(T.errors.some((e) => /лише раз/.test(e)), "the same effect twice: error");
T = recipeTotals({ effects: [{ k: "attr", attr: "SL" }, { k: "attr", attr: "SPR" }, { k: "attr", attr: "VTR" }] });
eq([T.price, T.ch, T.errors.length], [3, 9, 0], "3 different attributes");
T = recipeTotals({ effects: [{ k: "attr", attr: "SL" }, { k: "attr", attr: "SPR" }, { k: "attr", attr: "VTR" }, { k: "attr", attr: "IN" }] });
ok(T.errors.some((e) => /не більше ніж для трьох/.test(e)), "4 attributes: error");
T = recipeTotals({ effects: [{ k: "attr", attr: "SL" }, { k: "attr", attr: "SL" }] });
ok(T.errors.some((e) => /уже вибрано/.test(e)), "the same attribute twice: error");
T = recipeTotals({ effects: [{ k: "attr", attr: "UDCH" }] });
ok(T.errors.some((e) => /УДЧ/.test(e)), "УДЧ: error");
T = recipeTotals({ effects: [{ k: "attr" }] });
ok(T.errors.some((e) => /обери атрибут/.test(e)), "no attribute chosen: error");
T = recipeTotals({ effects: [{ k: "stim" }], sides: ["IN", "SL", "VTR", "PV"].map((attr) => ({ k: "attrScene", attr })) });
ok(T.errors.some((e) => /трьох/.test(e)), "4 scene penalties: error");
T = recipeTotals({ effects: [{ k: "stim" }], sides: [{ k: "attrScene", attr: "IN" }, { k: "attrSession", attr: "IN" }] });
eq(T.errors, [], "a scene and a session penalty on one attribute are different side effects");
T = recipeTotals({ effects: [{ k: "stim" }], sides: [{ k: "attrScene", attr: "IN" }, { k: "attrScene", attr: "IN" }] });
ok(T.errors.some((e) => /уже вибрано/.test(e)), "the same penalty on the same attribute twice: error");
T = recipeTotals({ effects: [{ k: "stim" }], sides: [{ k: "berserk" }, { k: "berserk" }] });
ok(T.errors.some((e) => /лише раз/.test(e)), "a side effect twice: error");

// ---- consequences against Гідра / Меланжева кислота ----
for (const k of ["hydra", "melange"]) for (const s of ["consL", "consM", "consH"]) {
  T = recipeTotals({ effects: [{ k }], sides: [{ k: s }] });
  ok(T.errors.some((e) => /не поєднується/.test(e)), `${k} + ${s}: error`);
}
T = recipeTotals({ effects: [{ k: "adrenalin" }], sides: [{ k: "consM" }] });
eq(T.errors, [], "Адреналін with a consequence is fine");
T = recipeTotals({ effects: [{ k: "hydra" }], sides: [{ k: "berserk" }] });
eq(T.errors, [], "Гідра with berserk is fine");

// ---- perk effects ----
ok(combat.length > 10 && other.length > 10, "perks to choose from");
ok(!combat.some(perkNeedsLuck) && !other.some(perkNeedsLuck), "no perk that needs УДЧ is offered");
ok(perkNeedsLuck("Снайпер"), "Снайпер needs УДЧ");
ok(!designerPerks().includes("Снайпер"), "Снайпер is not offered");
ok(combat.every((n) => perkKind(n) === "combat") && other.every((n) => perkKind(n) === "other"), "kinds");
const pc = combat[0], pn = other[0];
T = recipeTotals({ effects: [{ k: "perkC", perk: pc }] });
eq([T.price, T.ch, T.errors], [4, 3, []], "combat perk, default is the middle");
T = recipeTotals({ effects: [{ k: "perkC", perk: pc, price: 3, ch: 2 }] });
eq([T.price, T.ch], [3, 2], "combat perk, lowest");
T = recipeTotals({ effects: [{ k: "perkC", perk: pc, price: 5, ch: 4 }] });
eq([T.price, T.ch], [5, 4], "combat perk, highest");
T = recipeTotals({ effects: [{ k: "perkC", perk: pc, price: 6, ch: 1 }] });
ok(T.errors.length === 2, "combat perk out of ranges: 2 errors");
T = recipeTotals({ effects: [{ k: "perkN", perk: pn, price: 2, ch: 1 }] });
eq([T.price, T.ch, T.errors], [2, 1, []], "other perk, lowest");
T = recipeTotals({ effects: [{ k: "perkN", perk: pn, price: 4, ch: 3 }] });
eq([T.price, T.ch, T.errors], [4, 3, []], "other perk, highest");
T = recipeTotals({ effects: [{ k: "perkN", perk: pn, price: 5, ch: 4 }] });
ok(T.errors.length === 2, "other perk out of ranges: 2 errors");
T = recipeTotals({ effects: [{ k: "perkN", perk: pc }] });
ok(T.errors.some((e) => /бойовий перк/.test(e)), "a combat perk under the non-combat effect: error");
T = recipeTotals({ effects: [{ k: "perkC", perk: "Снайпер" }] });
ok(T.errors.some((e) => /вимагає УДЧ/.test(e)), "a perk that needs УДЧ: error");
T = recipeTotals({ effects: [{ k: "perkC" }] });
ok(T.errors.some((e) => /обери перк/.test(e)), "no perk chosen: error");
T = recipeTotals({ effects: [{ k: "perkC", perk: pc }, { k: "perkC", perk: combat[1] }] });
ok(T.errors.some((e) => /лише раз/.test(e)), "a perk effect twice: error");
T = recipeTotals({ effects: [{ k: "perkC", perk: pc }, { k: "perkN", perk: pn }] });
eq([T.price, T.ch, T.errors], [7, 5, []], "a combat and a non-combat perk effect");

// ---- recipe → def ----
let def = recipeToDef({ name: "Х", effects: [{ k: "attr", attr: "SL" }, { k: "attr", attr: "IN" }, { k: "armor" }, { k: "psi" }, { k: "dmg" }, { k: "halfPoison" }, { k: "halfRad" }, { k: "stim" }, { k: "hp2" }],
  sides: [{ k: "attrScene", attr: "IN" }, { k: "attrSession", attr: "VTR" }, { k: "loss3" }, { k: "berserk" }] });
eq(def.eff.attr, { SL: 1 }, "def: +1 IN and the scene −1 IN cancel");
eq([def.eff.armor, def.eff.psi, def.eff.dmg, def.eff.half], [1, 2, 2, ["poison", "rad"]], "def: armour, psi, damage, half");
eq([def.heal, def.hpDice, def.endDice, def.aspect, def.sessionAttr], [{ base: 5, dec: 1 }, 2, 3, "берсерк", { VTR: -1 }], "def: heal, dice, aspect, session");
ok(def.drug === true && def.ch >= 1 && def.ch <= 9 && typeof def.eff.t === "string" && /СЛ/.test(def.eff.t), "def: drug, ch, text");
def = recipeToDef({ effects: [{ k: "super" }] });
ok(def.superHeal === true && !def.heal && !def.eff, "def: superstimpak");
def = recipeToDef({ effects: [{ k: "perkC", perk: pc }, { k: "hydra" }, { k: "adrenalin" }, { k: "melange" }], sides: [{ k: "consL" }] });
ok(def.info.includes(pc) && /Гідра/.test(def.info) && /Адреналін/.test(def.info) && /Меланжева/.test(def.info) && /легкий/.test(def.info), "def: info carries the perk and the rest");
const desc = recipeDescription({ effects: [{ k: "dmg" }], sides: [{ k: "berserk" }], note: "Брудна варка." });
ok(/Ціна виробництва 1 \(к\)/.test(desc) && /шанс залежності 2 \(d10 ≤ 2\)/.test(desc) && /берсерк/.test(desc) && /Брудна варка/.test(desc), "description: " + desc);

console.log(failures ? `FAIL (${failures})` : `OK (${checks} checks)`);
if (failures) process.exit(1);
