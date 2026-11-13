// Damage types of «Зробити перевірку» (Foundry only, author 2026-11-14): the type of a weapon, a grenade or a psi power,
// the type of each part of the total, and the sides of each rolled die.
// Run: node tests/damage-types.test.mjs
import { damageEffects, dieSides, dieTypes, isDamageEffect, labelType, partType, splitDiceParts, termTypes, typeChips, weaponDmgType } from "../module/rules/damage-types.mjs";

let failures = 0;
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) { failures++; console.log(`FAIL ${msg}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); } };
const W = (n, extra = {}) => ({ w: { n, note: "", ...extra } });
const O = (n, note = "") => ({ o: { n, note }, expl: true });

eq(weaponDmgType(W("10мм пістолет")), "phys", "plain gun");
eq(weaponDmgType(W("Лазерний пістолет", { en: "laser" })), "laser", "energy: laser");
eq(weaponDmgType(W("Мисливська гвинтівка", { en: "plasma" })), "plasma", "energy set in Тип wins over the name");
eq(weaponDmgType(W("Гаус-гвинтівка", { en: "gauss" })), "gauss", "gauss");
eq(weaponDmgType(W("Шокова дубинка", { en: "electric" })), "electric", "electric");
eq(weaponDmgType(W("Кріолятор", { en: "cryo" })), "cryo", "cryo");
eq(weaponDmgType(W("Вогнемет")), "fire", "flamer by name");
eq(weaponDmgType(W("Товстун", { note: "міні-ядерна бомба" })), "rad", "radiation by note");
eq(weaponDmgType(W("Пси-удар", { auto: "psi" })), "psi", "psi power");
eq(weaponDmgType(W("Пси-вогонь", { auto: "psi" })), "fire", "psi power that burns");
eq(weaponDmgType(W("Пси-електрика", { auto: "psi" })), "electric", "psi power that shocks");
eq(weaponDmgType(W("Пси-кийок")), "psi", "«пси» in the name");
eq(weaponDmgType(W("Дивний шолом", { note: "завдає психічної шкоди" })), "psi", "«психічна» in the note");
eq(weaponDmgType(W("Пси-різак", { note: "психічний вогонь" })), "fire", "psychic fire by note is fire");
eq(weaponDmgType(W("Психо-кастет")), "phys", "«психо» is not «пси»");
eq(weaponDmgType(O("Плазмова граната", "2d6")), "phys", "plasma grenade deals physical damage (author)");
eq(weaponDmgType(O("Плазмова міна", "3d6")), "plasma", "other plasma explosives stay plasma");
eq(weaponDmgType(O("Коктейль Молотова", "1d10")), "fire", "molotov");
eq(weaponDmgType(O("Імпульсна граната", "2d6")), "electric", "pulse grenade");
eq(weaponDmgType(O("Армійська граната", "2d6")), "phys", "frag grenade");
eq(weaponDmgType({ key: "unarmed" }), "phys", "unarmed");
eq(weaponDmgType(null), "phys", "nothing chosen");

eq(partType("1d6", "laser"), "laser", "weapon dice take the weapon's type");
eq(partType("Психо", "plasma"), "plasma", "flat bonuses take the weapon's type");
eq(partType("Електрична: робот чи електроніка +1d6", "phys"), "electric", "robot bonus is electric");

eq(dieSides({ low: true, terms: [{ n: 2, s: 6 }] }), [6, 6], "менша з 2d6");
eq(dieSides({ terms: [{ n: 2, s: 6 }, { n: 1, s: 10 }] }), [6, 6, 10], "2d6+1d10 in rolling order");
eq(typeChips(["laser", "laser", "poison"]).match(/dtchip/g).length, 2, "one chip per type");

eq(damageEffects(["Ігнорує 2 фізичної броні супротивника.", "Дальність 1 — ближня зона"], W("Лазерна гвинтівка")), ["Ігнорує 2 фізичної броні супротивника."], "range is not a damage effect");
eq(damageEffects([], W("Пилоніж (ігнорує 1 броні)")), ["Ігнорує 1 фізичної броні супротивника."], "armour ignoring from the name");
eq(damageEffects(["Ігнорує 1 фізичної броні супротивника."], W("Пилоніж (ігнорує 1 броні)")).length, 1, "not twice");
eq(isDamageEffect("Кріо: на критичному успіху замість шкоди можна заморозити ціль."), true, "cryo");
eq(isDamageEffect("Модифікації: приціл."), false, "modifications");

eq(damageEffects([], W("Товстун", { note: "міні-ядерна бомба" })), ["Радіація ігнорує фізичну броню."], "radiation ignores armour");
eq(damageEffects(["Ігнорує 1 фізичної броні супротивника."], W("Отруйний ніж", { note: "отрута" })), ["Ігнорує 1 фізичної броні супротивника.", "Отрута ігнорує фізичну броню."], "poison: every effect, one after another");
// several types in the damage field: one line per type, in order
const mix = W("Дивний ствол", { d: "1d10[отрута]+2d6[пси]" });
eq(weaponDmgType(mix), "poison", "the first label is the main type");
eq(damageEffects([], mix, termTypes(mix, { terms: [{ n: 1, s: 10, t: "отрута" }, { n: 2, s: 6, t: "пси" }] }, "poison")),
  ["Отрута ігнорує фізичну броню.", "Психічна шкода: ігнорує фізичну броню, діє лише на живих істот."], "two types, two effects");
eq(damageEffects(["Ігнорує 1 фізичної броні супротивника."], W("Лазерний пістолет", { en: "laser" })), ["Ігнорує 1 фізичної броні супротивника."], "energy version: the sheet's own line only");

// a type chosen in «Тип» (Foundry only) wins; catalogue weapons the words would get wrong
eq(weaponDmgType(W("Лук", { dt: "poison" })), "poison", "chosen type");
eq(weaponDmgType(W("Голкостріл (легкий)", { note: "може доставити отруту" })), "phys", "needler is physical");
eq(weaponDmgType(W("Сонячний підпалювач")), "laser", "solar scorcher is a laser");
eq(weaponDmgType(W("Термічний спис (важкий)")), "fire", "thermal lance is fire");
eq(weaponDmgType(W("Тактичний ядерний гранатомет «Товстун»", { note: "частина шкоди (2d6) — радіацією, повз броню" })), "phys", "Fat Man: physical with a radiation part");
eq(weaponDmgType(W("Ядерна")), "rad", "a nuke by name is radiation");
// labelled terms and the radiation part
eq(labelType("радіація"), "rad", "label radiation"); eq(labelType("фізична"), "phys", "label physical");
const fat = { terms: [{ n: 4, s: 6, t: "фізична" }, { n: 2, s: 6, t: "радіація" }], flat: 0 };
eq(termTypes(W("Товстун"), fat, "phys"), ["phys", "rad"], "labelled terms");
const fatNote = W("Тактичний ядерний гранатомет «Товстун»", { note: "частина шкоди (2d6) — радіацією, повз броню" });
eq(termTypes(fatNote, { terms: [{ n: 4, s: 6 }, { n: 2, s: 6 }], flat: 0 }, "phys"), ["phys", "rad"], "radiation part from the note");
eq(dieTypes(W("Товстун"), fat, "phys"), ["phys", "phys", "phys", "phys", "rad", "rad"], "die types");
eq(splitDiceParts([{ l: "4d6+2d6", v: "20", t: "phys" }, { l: "Психо", v: "2", t: "phys" }], W("Товстун"), fat, "phys", [3, 4, 5, 2, 6, 0]),
  [{ l: "4d6", v: "14", t: "phys" }, { l: "2d6", v: "6", t: "rad" }, { l: "Психо", v: "2", t: "phys" }], "split dice parts");
eq(splitDiceParts([{ l: "1d10", v: "7", t: "laser" }], W("Лазер"), { terms: [{ n: 1, s: 10 }], flat: 0 }, "laser", [7]).length, 1, "one type: no split");

console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);
