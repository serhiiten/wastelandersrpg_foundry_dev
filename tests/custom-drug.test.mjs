// Designer drugs in play (drug builder; author 2026-11-15): a recipe's def joins the rules' chems (st.customDrugs), «Вжити» applies
// its attributes, armour, psychic armour, +2 damage, temporary HP dice, the HP loss at the end of the scene, the aspect, the penalty
// «до кінця сесії», the reminders; the addiction roll uses the recipe's chance; ½ from radiation and poison reaches «Захист» and
// the target's profile. Run: node tests/custom-drug.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { createController } from "../module/rules/controller.mjs";
import { actorToState, stateToActor } from "../module/rules/character-adapter.mjs";
import { characterProfileFromState } from "../module/rules/target-profile.mjs";
import { syncAddictionNotes } from "../module/rules/prices.mjs";
import { designerPerks, recipeToDef } from "../module/rules/designer.mjs";

// dice: the engine rolls with crypto.getRandomValues; 0 → every die is 1, 2519 → every d6 and d10 is at its top
let die = 0;
Object.defineProperty(globalThis, "crypto", { value: { getRandomValues: (a) => { a[0] = die; return a; } }, configurable: true });

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures < 40) console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const NAME = "Нічна варка";
function setup(recipe, { species = "human", perks = [], feats = [], other = null, name = NAME } = {}) {
  const st = Rc.blankState();
  st.species = species;
  st.feats = feats;
  st.perks = perks.map((n) => ({ n }));
  st.customDrugs = [{ n: name, def: recipeToDef(recipe) }];
  st.other = other || [{ n: name, q: "9" }];
  const toasts = [];
  const L = createLogic({ st, toast: (m) => toasts.push(m) });
  return { st, L, toasts, d: () => Rc.compute(st) };
}
const R = (effects, sides = []) => ({ name: NAME, effects, sides });

// ---- registered like the book's chems ----
{
  const { st } = setup(R([{ k: "armor" }]));
  Rc.compute(st);
  ok(Rc.drugOf(NAME) === NAME && Rc.DRUGS[NAME].drug === true, "registered by compute()");
  ok(Rc.drugOf(NAME + " (2 дози)") === NAME, "found by a name with a tail");
  // a custom name that starts with a book's one: the exact name wins
  const st2 = Rc.blankState();
  st2.customDrugs = [{ n: "Джет Плюс", def: { ch: 4, drug: true, eff: { armor: 1, t: "+1 броні" } } }];
  Rc.compute(st2);
  eq(Rc.drugOf("Джет Плюс"), "Джет Плюс", "«Джет Плюс» isn't taken for «Джет»");
  eq(Rc.drugOf("Джет"), "Джет", "«Джет» is still «Джет»");
  // the book's chem is never replaced
  const st3 = Rc.blankState();
  st3.customDrugs = [{ n: "Стимпак", def: { ch: 9, drug: true } }];
  Rc.compute(st3);
  eq(Rc.DRUGS["Стимпак"].ch, 0, "a recipe can't replace «Стимпак»");
  // garbage is ignored
  const st4 = Rc.blankState();
  st4.customDrugs = [null, { n: "", def: {} }, { n: "Х" }, { n: "Ю", def: "no" }];
  Rc.compute(st4);
  ok(!Rc.DRUGS["Х"] && !Rc.DRUGS["Ю"], "garbage recipes are ignored");
  // the addiction chance goes into the gear row's note
  const s5 = Rc.blankState();
  s5.customDrugs = [{ n: "Нічна варка Б", def: { ch: 6, drug: true } }];
  s5.other = [{ n: "Нічна варка Б", q: "1", note: "" }];
  syncAddictionNotes(s5);
  ok(/залежність 6/.test(s5.other[0].note), "the row's note says «залежність 6»: " + s5.other[0].note);
}

// ---- attributes, armour, psychic armour ----
{
  const { st, L, d } = setup(R([{ k: "attr", attr: "SL" }, { k: "attr", attr: "IN" }, { k: "armor" }, { k: "psi" }]));
  const sl0 = L.effAttr(d(), "SL"), in0 = L.effAttr(d(), "IN");
  L.useItem(0);
  eq([L.effAttr(d(), "SL") - sl0, L.effAttr(d(), "IN") - in0], [1, 1], "+1 SL, +1 IN");
  eq([L.chemArmor(), L.chemPsi()], [1, 2], "armour +1, psychic armour +2");
  eq(st.other[0].q, "8", "a dose is spent");
  ok(L.chem().scene.length === 1 && L.chem().scene[0].drug === NAME, "one scene effect");
  // a second dose in the same scene doesn't stack
  L.useItem(0);
  eq([L.effAttr(d(), "SL") - sl0, L.chemArmor(), L.chem().scene.length], [1, 1, 1], "a repeated dose doesn't stack");
  // the effect ends with the scene
  L.endScene();
  eq([L.effAttr(d(), "SL") - sl0, L.chemArmor(), L.chemPsi()], [0, 0, 0], "gone at the end of the scene");
}
// an attribute at its limit is not raised further than the rules' +4
{
  const { st, L, d } = setup(R([{ k: "attr", attr: "SL" }]));
  st.base.SL = 3;
  const before = L.effAttr(d(), "SL");
  L.useItem(0);
  ok(L.effAttr(d(), "SL") >= before && L.effAttr(d(), "SL") <= 4, "attribute stays within −2…+4");
}

// ---- +2 damage, without counting Психо twice ----
{
  const { st, L, d } = setup(R([{ k: "dmg" }]));
  const names = () => L.dmgBonuses("melee", d(), {}, { key: "w0", name: "Ніж", w: { n: "Ніж" } });
  eq(names().length, 0, "no bonus before the dose");
  L.useItem(0);
  eq(names(), [[NAME, 2]], "+2 damage under the drug's name");
  // with Психо at the same time: Психо once (by its name), the designer drug once
  st.other.push({ n: "Психо", q: "1" });
  L.useItem(1);
  const b = names();
  eq(b.map((x) => x[0]).sort(), [NAME, "Психо"].sort(), "Психо and the designer drug are two bonuses");
  eq(b.reduce((s, x) => s + x[1], 0), 4, "…+4 together, Психо not counted twice");
  // Психо alone: one bonus, as before
  const s2 = setup(R([{ k: "armor" }]));
  s2.st.other = [{ n: "Психо", q: "1" }];
  s2.L.useItem(0);
  eq(s2.L.dmgBonuses("melee", s2.d(), {}, { key: "w0", name: "Ніж", w: { n: "Ніж" } }), [["Психо", 2]], "Психо alone: +2 once");
  // all damage, unarmed too
  eq(L.dmgBonuses("melee", d(), {}, { key: "unarmed", name: "Беззбройні атаки" }).some((x) => x[0] === NAME), true, "+2 damage works for unarmed attacks too");
}

// ---- temporary HP dice ----
for (const n of [1, 2, 3]) {
  const { st, L, d } = setup(R([{ k: "hp" + n }]));
  die = 2519;
  const hp0 = d().hp;
  L.useItem(0);
  eq([L.hpMaxNow(d()) - hp0, parseInt(st.hpCur, 10) - hp0], [6 * n, 6 * n], `${n}d6: max HP and current HP`);
  ok(new RegExp(n + "d6").test(L.chem().last), `${n}d6: the log shows the dice`);
  L.endScene();
  eq([L.hpMaxNow(d()), parseInt(st.hpCur, 10)], [hp0, hp0], `${n}d6: gone at the end of the scene`);
  die = 0;
  const r = setup(R([{ k: "hp" + n }]));
  r.L.useItem(0);
  eq(L.hpMaxNow(d()) - hp0, 0, "(reset)");
  eq(r.L.hpMaxNow(r.d()) - r.d().hp, n, `${n}d6 with every die 1: +${n}`);
}

// ---- the HP loss at the end of the scene ----
for (const n of [1, 2, 3]) {
  const { st, L, d } = setup(R([{ k: "armor" }], [{ k: "loss" + n }]));
  st.base.VTR = 3; // 24 HP: the loss never reaches 0
  die = 2519;
  L.useItem(0);
  eq(L.chem().endDice, n, `loss${n}: ${n}d6 laid aside`);
  const hp0 = d().hp;
  L.endScene();
  eq(parseInt(st.hpCur, 10), hp0 - 6 * n, `loss${n}: −${6 * n} HP at the end of the scene`);
  eq(L.chem().endDice, 0, `loss${n}: the dice are spent`);
  ok(/шкоди, що ігнорує броню/.test(L.chem().last), `loss${n}: the log says so`);
  // a second end of scene costs nothing
  L.endScene();
  eq(parseInt(st.hpCur, 10), hp0 - 6 * n, `loss${n}: only once`);
  die = 0;
}
{
  // a character already at 0 HP is not hit again
  const { st, L } = setup(R([{ k: "armor" }], [{ k: "loss2" }]));
  L.useItem(0);
  st.hpCur = "0";
  L.endScene();
  eq(st.hpCur, "0", "0 HP stays 0");
  eq(L.chem().endDice, 0, "…and the dice are spent");
}
{
  // two doses in one scene count once
  const { L } = setup(R([{ k: "armor" }], [{ k: "loss1" }]));
  L.useItem(0); L.useItem(0);
  eq(L.chem().endDice, 1, "two doses in one scene: 1d6 once");
}

// ---- the aspect ----
{
  const { st, L } = setup(R([{ k: "armor" }], [{ k: "berserk" }]));
  L.useItem(0);
  eq(st.sit, [{ t: "берсерк", inv: 0 }], "the aspect «берсерк» is laid on");
  L.endScene();
  eq(st.sit, [], "…and taken off at the end of the scene");
  ok(/Аспект «берсерк» зник/.test(L.chem().last), "the log says so");
  // an aspect the character already had stays
  const s2 = setup(R([{ k: "armor" }], [{ k: "berserk" }]));
  s2.st.sit = [{ t: "берсерк", inv: 2 }];
  s2.L.useItem(0);
  eq(s2.st.sit.length, 1, "no second «берсерк»");
  s2.L.endScene();
  eq(s2.st.sit, [{ t: "берсерк", inv: 2 }], "their own aspect isn't taken away");
  // «Новий день» and «Кінець сесії» end the scene first
  const s3 = setup(R([{ k: "armor" }], [{ k: "berserk" }]));
  s3.L.useItem(0);
  s3.L.chemAct("chem-day", { dataset: {} });
  eq(s3.st.sit, [], "«Новий день» takes it off");
}

// ---- the penalty until the end of the session ----
{
  const { st, L, d } = setup(R([{ k: "armor" }], [{ k: "attrSession", attr: "IN" }]));
  st.base.IN = 2;
  const in0 = L.effAttr(d(), "IN");
  L.useItem(0);
  eq(L.effAttr(d(), "IN") - in0, -1, "−1 IN");
  L.endScene();
  eq([L.effAttr(d(), "IN") - in0, L.chemArmor()], [-1, 0], "the penalty survives the end of the scene, the armour doesn't");
  L.chemAct("chem-day", { dataset: {} });
  eq(L.effAttr(d(), "IN") - in0, -1, "…and a new day");
  // a new dose in the next scene: the armour again, the penalty not doubled
  L.useItem(0);
  eq([L.effAttr(d(), "IN") - in0, L.chemArmor(), L.chem().scene.filter((e) => e.session).length], [-1, 1, 1], "a second dose: the penalty is one");
  L.chemAct("chem-session", { dataset: {} });
  eq([L.effAttr(d(), "IN") - in0, L.chem().scene.length], [0, 0], "gone at the end of the session");
  ok(/Штраф до кінця сесії минув/.test(L.chem().last), "the log says so: " + L.chem().last);
  eq(L.chem().session, 2, "the session moved on");
  // a scene penalty goes with the scene
  const s2 = setup(R([{ k: "armor" }], [{ k: "attrScene", attr: "IN" }]));
  const i0 = s2.L.effAttr(s2.d(), "IN");
  s2.L.useItem(0);
  eq(s2.L.effAttr(s2.d(), "IN") - i0, -1, "scene penalty −1");
  s2.L.endScene();
  eq(s2.L.effAttr(s2.d(), "IN") - i0, 0, "scene penalty gone");
  // +1 and −1 on one attribute cancel out in the def
  const net = recipeToDef(R([{ k: "attr", attr: "SL" }, { k: "armor" }], [{ k: "attrScene", attr: "SL" }]));
  ok(!net.eff.attr, "a +1 and a −1 on one attribute leave no attribute effect");
  // a penalty on VTR lowers the max HP while it lasts
  const s3 = setup(R([{ k: "armor" }], [{ k: "attrSession", attr: "VTR" }]));
  s3.st.base.VTR = 2;
  const max0 = s3.L.hpMaxNow(s3.d());
  s3.L.useItem(0);
  eq(s3.L.hpMaxNow(s3.d()), max0 - 3, "VTR −1: max HP −3");
  s3.L.endScene();
  eq(s3.L.hpMaxNow(s3.d()), max0 - 3, "…it stays over the scene");
  s3.L.chemAct("chem-session", { dataset: {} });
  eq(s3.L.hpMaxNow(s3.d()), max0, "…and is back after the session");
}

// ---- healing ----
{
  const { st, L, d } = setup(R([{ k: "stim" }]));
  st.hpCur = "2";
  L.useItem(0);
  eq(st.hpCur, "7", "stimpak effect: +5 HP");
  L.useItem(0);
  eq(st.hpCur, "11", "…the next one the same day: +4");
  const s2 = setup(R([{ k: "super" }]));
  s2.st.hpCur = "2";
  s2.L.useItem(0);
  eq(s2.L.chem().superDice, 1, "superstimpak effect: 1d6 laid aside");
  // a healing drug is not used at full HP, unless it does something more
  const s3 = setup(R([{ k: "stim" }]));
  s3.L.useItem(0);
  eq(s3.st.other[0].q, "9", "stimpak effect alone isn't taken at full HP");
  const s4 = setup(R([{ k: "stim" }, { k: "armor" }]));
  s4.L.useItem(0);
  eq([s4.st.other[0].q, s4.L.chemArmor()], ["8", 1], "stimpak + armour is taken at full HP");
  const s5 = setup(R([{ k: "stim" }, { k: "hp1" }]));
  s5.L.useItem(0);
  eq(s5.st.other[0].q, "8", "stimpak + temporary HP is taken at full HP");
}

// ---- the reminders ----
{
  const pk = designerPerks("combat")[0];
  const { L } = setup(R([{ k: "perkC", perk: pk }, { k: "hydra" }, { k: "adrenalin" }, { k: "armor" }]));
  L.useItem(0);
  const last = L.chem().last;
  ok(last.includes(pk) && /Гідра/.test(last) && /Адреналін/.test(last), "the log carries the perk's and the others' reminders");
  const s2 = setup(R([{ k: "armor" }], [{ k: "consH" }]));
  s2.L.useItem(0);
  ok(/тяжкий ментальний чи фізичний наслідок/.test(s2.L.chem().last), "the consequence reminder");
}

// ---- addiction: the recipe's chance ----
{
  const recipe = R([{ k: "dmg" }, { k: "hp1" }]); // chance 7
  const def = recipeToDef(recipe);
  eq(def.ch, 7, "the recipe's chance is 7");
  die = 6; // d10 = 7
  let s = setup(recipe);
  s.L.useItem(0);
  eq(s.L.chem().addictions.map((a) => a.drug), [NAME], "d10 = 7 ≤ 7: addicted");
  ok(/7 ≤ 7/.test(s.L.chem().last), "the log: " + s.L.chem().last.slice(-80));
  die = 7; // d10 = 8
  s = setup(recipe);
  s.L.useItem(0);
  eq(s.L.chem().addictions.length, 0, "d10 = 8 > 7: no addiction");
  // the perks that change the chance work as for any chem
  die = 4; // d10 = 5
  s = setup(recipe, { perks: ["Електрохімічний жокей"] });
  s.L.useItem(0);
  eq(s.L.chem().addictions.length, 0, "Електрохімічний жокей −3 → 4: d10 = 5 is safe");
  die = 3; // d10 = 4
  s = setup(recipe, { perks: ["Електрохімічний жокей"] });
  s.L.useItem(0);
  eq(s.L.chem().addictions.length, 1, "…d10 = 4 ≤ 4: addicted");
  die = 0;
  // «Опірність до хімії» −2
  die = 5; // d10 = 6
  s = setup(recipe, { feats: ["Опірність до хімії"] });
  s.L.useItem(0);
  eq(s.L.chem().addictions.length, 0, "Опірність до хімії −2 → 5: d10 = 6 is safe");
  die = 0;
  // a robot takes no drugs, nor does it get addicted
  s = setup(recipe, { species: "robot" });
  s.L.useItem(0);
  eq([s.st.other[0].q, s.L.chem().scene.length], ["9", 0], "a robot can't take a designer drug");
}

// ---- ½ damage from radiation and poison ----
{
  const { st, L, d } = setup(R([{ k: "halfRad" }, { k: "halfPoison" }]));
  eq([L.defAuto(d()).rad, L.defAuto(d()).poison], ["normal", "normal"], "before the dose");
  L.useItem(0);
  const A = L.defAuto(d());
  eq([A.rad, A.poison, A.psy], ["half", "half", "normal"], "defAuto: radiation and poison ½");
  ok(L.defensesAuto(d()).some((l) => /^Радіація: ½ шкоди/.test(l[1]) && l[1].includes(NAME)), "«Захист» names the drug");
  const prof = characterProfileFromState(st);
  eq([prof.rad, prof.poison, prof.psy], ["half", "half", "normal"], "the target's profile");
  // with a source of the rules it makes immunity; two halving drugs too
  const s2 = setup(R([{ k: "halfRad" }, { k: "halfPoison" }]), { perks: ["Свинцева шкіра"] });
  s2.L.useItem(0);
  eq([characterProfileFromState(s2.st).rad, characterProfileFromState(s2.st).poison], ["immune", "half"], "+ Свинцева шкіра: radiation immune, poison ½");
  const s3 = setup(R([{ k: "halfRad" }, { k: "halfPoison" }]));
  s3.st.other.push({ n: "Рад-Ікс", q: "2" });
  s3.L.useItem(0); s3.L.useItem(1);
  eq([characterProfileFromState(s3.st).rad, characterProfileFromState(s3.st).poison], ["immune", "half"], "+ Рад-Ікс: radiation immune");
  // one of the two only (author, 2026-11-15: two separate effects)
  const s5 = setup(R([{ k: "halfRad" }]));
  s5.L.useItem(0);
  eq([characterProfileFromState(s5.st).rad, characterProfileFromState(s5.st).poison], ["half", "normal"], "radiation only");
  const s6 = setup(R([{ k: "halfPoison" }]));
  s6.L.useItem(0);
  eq([characterProfileFromState(s6.st).rad, characterProfileFromState(s6.st).poison], ["normal", "half"], "poison only");
  // it ends with the scene
  L.endScene();
  eq(characterProfileFromState(st).rad, "normal", "gone at the end of the scene");
  // Рад-Ікс and Отрута-Ікс still work as before (now through eff.half)
  const s4 = setup(R([{ k: "armor" }]));
  s4.st.other = [{ n: "Рад-Ікс", q: "2" }, { n: "Отрута-Ікс", q: "2" }];
  s4.L.useItem(0); s4.L.useItem(1);
  const A4 = s4.L.defAuto(s4.d());
  eq([A4.rad, A4.poison], ["half", "half"], "Рад-Ікс and Отрута-Ікс: ½ each");
  ok(s4.L.chem().day.every((e) => Array.isArray(e.half)), "…through the effect's `half` field");
}

// ---- the controller adds a recipe ----
{
  const st = Rc.blankState();
  st.other = [];
  const L = createLogic({ st, toast: () => {} });
  const toasts = [];
  const C = createController(st, L, { toast: (m) => toasts.push(m) });
  const def = recipeToDef(R([{ k: "armor" }]));
  ok(C.act("drug-add-custom", { n: NAME, def }) === true, "drug-add-custom accepted");
  eq([st.customDrugs.length, st.customDrugs[0].n, st.other.length, st.other[0].n, st.other[0].q], [1, NAME, 1, NAME, "1"], "the recipe and a row");
  ok(/Додано в мотлох/.test(toasts.at(-1)), "toast: " + toasts.at(-1));
  // the row's note is the recipe's effects (author, 2026-11-15), without the heading and the production price
  ok(st.other[0].note === "Ефекти: фізична броня +1", "note: " + st.other[0].note);
  C.act("drug-add-custom", { n: NAME, def: recipeToDef(R([{ k: "psi" }])) });
  eq([st.customDrugs.length, st.other.length, st.other[0].q], [1, 1, "2"], "again: the recipe is replaced, a dose is added");
  ok(st.customDrugs[0].def.eff.psi === 2, "the newer recipe wins");
  ok(C.act("drug-add-custom", { n: "Стимпак", def }) === false && st.customDrugs.length === 1, "a book's name is refused");
  ok(C.act("drug-add-custom", { n: "", def }) === false && C.act("drug-add-custom", { n: "Х", def: null }) === false, "no name / no recipe is refused");
  // «Вжити» works at once
  L.useItem(0);
  eq(L.chemPsi(), 2, "the added drug can be used at once");
}

// ---- the adapter and the .json ----
{
  const { st } = setup(R([{ k: "armor" }, { k: "attr", attr: "SL" }], [{ k: "loss1" }]));
  const actor = stateToActor(st);
  const row = actor.items.find((i) => i.name === NAME);
  eq(row && row.type, "drug", "the row is a drug item");
  const back = actorToState(JSON.parse(JSON.stringify(actor)));
  eq(back.customDrugs, st.customDrugs, "customDrugs round trip");
  const L = createLogic({ st: back, toast: () => {} });
  L.useItem(0);
  eq(L.chemArmor(), 1, "the loaded character can use it");
}

die = 0;
console.log(failures ? `FAIL (${failures})` : `OK (${checks} checks)`);
if (failures) process.exit(1);
