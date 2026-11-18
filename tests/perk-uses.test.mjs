// Perks with «Застосувати» (author, 2026-11-18; module/rules/perk-uses.mjs): the table's perks are the book's, their texts
// carry the limit; the marks are stamps cleared by «Кінець сцени» / «Новий день» / «Кінець сесії» and «Скинути лічильники»;
// what the buttons do by themselves. Run: node tests/perk-uses.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { createController } from "../module/rules/controller.mjs";
import { PERK_USES, USE_BY_ID, backLine, bookText, isUsed, maxDamage, perkSection, strangerOutcome, usedNames, usesFor, usePerk } from "../module/rules/perk-uses.mjs";
import { buildView } from "../module/sheets/character-view.mjs";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };

// 1) the table's keys are in the book (PERK; «Проклятий» in FEAT), and every text carries its limit's words
for (const u of PERK_USES) {
  const book = u.feat ? Rc.FEAT : Rc.PERK;
  ok(!!book[u.perk], `${u.id}: «${u.perk}» is not in ${u.feat ? "FEAT" : "PERK"}`);
  ok(bookText(u).toLowerCase().includes(u.phrase.toLowerCase()), `${u.id}: the book's text of «${u.perk}» has no «${u.phrase}»`);
  ok(!u.per || ["scene", "day", "session"].includes(u.per), `${u.id}: unknown limit ${u.per}`);
}
ok(new Set(PERK_USES.map((u) => u.id)).size === PERK_USES.length, "ids are unique");
// stage 2 and «Не робити» stay out
for (const n of ["Автоматний псих", "Найкращий друг", "Робо-друг", "Все на переробку", "Медик", "Старанний учень", "Бонсай"]) {
  ok(!PERK_USES.some((u) => u.perk === n), `«${n}» must not have a button in stage 1`);
}
// «Канібал» is once a day in the wiki (author, 2026-11-18)
ok(USE_BY_ID.cannibal.per === "day", "Канібал: раз на день");

const fresh = (perks = [], extra = {}) => {
  const st = Rc.rollCharacter(null);
  st.species = "human"; st.feats = []; st.other = []; st.weapons = [];
  st.perks = perks.map((n) => ({ n }));
  Object.assign(st, extra);
  Rc.syncAuto(st);
  return st;
};
const logic = (st) => createLogic({ st, toast: () => {}, ui: {} });
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

// 2) stamps: a scene use is used till «Кінець сцени», a day use till «Новий день», a session use till «Кінець сесії»
{
  const st = fresh(["Нагляд", "Ментальний щит", "Щасливець"]);
  const L = logic(st);
  ok(usePerk(st, L, "overwatch", { rng: () => 1 }).ok, "Нагляд applies");
  ok(isUsed(USE_BY_ID.overwatch, st.chem), "Нагляд marked");
  ok(!usePerk(st, L, "overwatch").ok, "Нагляд twice in a scene is refused");
  usePerk(st, L, "lucky");
  L.endScene();
  ok(!isUsed(USE_BY_ID.overwatch, st.chem), "Нагляд back after «Кінець сцени»");
  ok(isUsed(USE_BY_ID.lucky, st.chem), "Щасливець stays used after «Кінець сцени»");
  L.newDay();
  ok(isUsed(USE_BY_ID.lucky, st.chem), "Щасливець stays used after «Новий день»");
  L.endSession();
  ok(!isUsed(USE_BY_ID.lucky, st.chem), "Щасливець back after «Кінець сесії»");
}
{
  // a day use: back after «Новий день», not after «Кінець сесії»
  const st = fresh([], { feats: ["Здичавіння"], species: "ghoul" });
  Rc.syncAuto(st);
  const L = logic(st);
  const d = Rc.compute(st);
  ok(d.allPerks.includes("Канібал"), "Здичавіння gives Канібал");
  ok(usesFor(st, d).some((u) => u.id === "cannibal"), "the button of a free perk (no slot) is there");
  st.hpCur = "1";
  const r = usePerk(st, L, "cannibal", { rng: () => 4 });
  ok(r.ok && st.hpCur === "5", `Канібал: +1d10 ОЗ (${st.hpCur})`);
  ok(st.chem.scene.some((e) => e.key === "cannibal" && e.attr.SL === 1 && e.attr.VP === 1 && e.scenes === 2), "Канібал: +1 СЛ і ВП for two scenes");
  ok(st.chem.used.includes("Людська плоть"), "Здичавіння: the use counts as a dose of the incurable addiction");
  L.endScene();
  ok(st.chem.scene.some((e) => e.key === "cannibal"), "Канібал: the effect lasts through the next scene");
  L.endScene();
  ok(!st.chem.scene.some((e) => e.key === "cannibal"), "Канібал: the effect ends after the next scene");
  L.endSession();
  ok(isUsed(USE_BY_ID.cannibal, st.chem), "Канібал stays used after «Кінець сесії»");
  L.newDay();
  ok(!isUsed(USE_BY_ID.cannibal, st.chem), "Канібал back after «Новий день»");
}

// 3) «Скинути лічильники» (controller and the group): the marks and «Друге дихання» go
{
  const st = fresh(["Щасливець", "Друге дихання"]);
  const L = logic(st);
  const C = createController(st, L, {});
  ok(C.act("perk-use", { id: "lucky" }), "perk-use through the controller");
  ok(C.lastPerk()?.name === "Щасливець", "the controller keeps the card's data");
  st.chem.swSession = st.chem.session;
  ok(isUsed(USE_BY_ID["second-wind"], st.chem), "Друге дихання shows used from its own counter");
  C.act("chem-reset", {});
  ok(!isUsed(USE_BY_ID.lucky, st.chem), "chem-reset clears the perks' marks");
  ok(!isUsed(USE_BY_ID["second-wind"], st.chem) && !st.chem.swSession, "chem-reset clears «Друге дихання» (swSession)");
}
// one click takes a mark off; the bonus applied stays
{
  const st = fresh(["Хімік"], { supplies: 2 });
  const L = logic(st);
  const C = createController(st, L, {});
  C.act("perk-use", { id: "chemist" });
  ok(+st.supplies === 1, "Хімік: −1 Припас");
  C.act("perk-free", { id: "chemist" });
  ok(!isUsed(USE_BY_ID.chemist, st.chem) && +st.supplies === 1, "perk-free: mark off, Припас not returned");
  st.supplies = 0;
  C.act("perk-free", { id: "chemist" });
  const u = usesFor(st).find((x) => x.id === "chemist");
  ok(u.off && /Припас/.test(u.offWhy), "Хімік off without Припаси");
  ok(!C.act("perk-use", { id: "chemist" }), "Хімік refused without Припаси");
}
// «Лють ботана» keeps its own counter; one click frees it
{
  const st = fresh(["Лють ботана"]);
  const L = logic(st);
  st.hpCur = "2";
  ok(usePerk(st, L, "rage").ok, "Лють ботана applies");
  ok(st.chem.rageSession === st.chem.session && st.chem.scene.some((e) => e.rage), "Лють ботана runs the sheet's rage");
  ok(!st.chem.perkUse.rage, "Лють ботана: no stamp of its own");
  ok(!usePerk(st, L, "rage").ok, "Лють ботана twice refused");
}

// 4) the buttons' own effects
{
  const st = fresh(["Здобувач"], { supplies: 2 });
  const L = logic(st);
  const max = Rc.compute(st).supMax;
  st.supplies = max - 1;
  const r = usePerk(st, L, "forager", { rng: () => 6 });
  ok(+st.supplies === max && /Не влізло: 1/.test(r.lines.join(" ")), `Здобувач: up to the maximum, the rest told (${r.lines})`);
  ok(usePerk(st, L, "forager", { rng: () => 1 }).ok, "Здобувач has no mark");
}
{
  const st = fresh([], { feats: ["Проклятий"], fdCur: "1" });
  const L = logic(st);
  ok(usePerk(st, L, "cursed").ok && st.fdCur === "0", "Проклятий: −1 жетон Долі");
  ok(!usePerk(st, L, "cursed").ok, "Проклятий: refused with no Fate tokens");
}
{
  const st = fresh(["Тиха смерть"], { weapons: [{ n: "Ніж", d: "1d6+1", hand: true }] });
  const r = usePerk(st, logic(st), "silent", { rng: () => 3 });
  ok(/максимум 7 \+ 1d6 \(3\) = 10/.test(r.lines[0]), `Тиха смерть: max + 1d6 (${r.lines[0]})`);
}
{
  const st = fresh(["Цілющий дотик"]);
  const r = usePerk(st, logic(st), "touch-heal", { rng: () => 7 });
  ok(r.heal === 7, "Цілющий дотик: 1d10 for the target");
  ok(usePerk(st, logic(st), "touch-back").back === true, "Цілющий дотик: the return is a separate mark");
}
{
  const st = fresh(["Я — швидкість"], { feats: ["Точність"] });
  ok(usesFor(st).find((u) => u.id === "speed").off, "Я — швидкість off with «Точність»");
}
ok(maxDamage("2d6+1") === 13 && maxDamage("1к10") === 10 && maxDamage("4") === 4 && maxDamage("особлива") === null, "maxDamage");
ok(strangerOutcome(3, "boss").dice === "1d10", "незнайомець 1–5: 1d10");
ok(strangerOutcome(7, "regular").dice === null && strangerOutcome(7, "elite").dice === "2d6", "незнайомець 6–9");
ok(strangerOutcome(11, "elite").dice === null && strangerOutcome(11, "boss").dice === "3d6", "незнайомець 10+");

// the group's time cards name the uses that came back (playtest 2026-11-18, item 7)
{
  const st = fresh(["Нагляд", "Щасливець"]);
  const L = logic(st);
  usePerk(st, L, "overwatch", { rng: () => 1 });
  usePerk(st, L, "lucky");
  const was = usedNames(st);
  ok(was.length === 2, `two uses marked: ${was}`);
  L.endScene();
  const line = backLine(was, st);
  ok(/«Нагляд»/.test(line) && !/Щасливець/.test(line), `«Кінець сцени» names Нагляд only: «${line}»`);
  ok(backLine(usedNames(st), st) === "", "nothing marked came back: no line");
}

// Foundry 14 refuses Roll#evaluateSync for dice: «Застосувати» of every rolling perk died silently, and so did the electricity
// bonus, medicine on an enemy or caravan and an enemy's healing move (playtest 2026-11-18, item 5): none in module/ but the note
// of helpers/dice.mjs
{
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : /\.mjs$/.test(e.name) ? [join(dir, e.name)] : []));
  const root = fileURLToPath(new URL("../module", import.meta.url));
  const bad = walk(root).filter((f) => !f.endsWith(join("helpers", "dice.mjs")) && /\.evaluateSync\(/.test(readFileSync(f, "utf8")));
  ok(!bad.length, `Roll#evaluateSync in: ${bad.join(", ")}`);
}

// 9) the compact sheet (author, 2026-11-18; playtest item 8, mockup В): every status chip a perk or feat gives is tagged, and
// each passive perk / feat has ONE row with those texts (its name not repeated); the ones with cards have no row; nothing
// tagged is lost — it is in a row or the perk has its card
{
  const st = fresh(["Фух", "Емпатія", "Здоровань", "Залізячник", "Улюблений ворог", "Улюблений ворог"], { feats: ["Добра душа", "Виходець зі Сховища"] });
  st.perks[4].note = "рейдери"; st.perks[5].note = "мутанти"; st.cons = { ...(st.cons || {}), l: "Синець" };
  Rc.syncAuto(st);
  const d = Rc.compute(st);
  const v = buildView(st, d, logic(st), {});
  const tagged = v.chips.filter((c) => c.src);
  ok(tagged.some((c) => c.src === "p:Фух") && tagged.some((c) => c.src === "f:Добра душа"), "perk and feat chips are tagged");
  ok(v.chips.some((c) => !c.src && /Легкий наслідок/.test(c.t)), "a state (a consequence) stays untagged");
  const pk = perkSection(st, d, v.chips);
  const rows = Object.fromEntries(pk.passive.map((r) => [r.n, r]));
  ok(!rows["Залізячник"], "a perk with a card has no row");
  ok(rows["Улюблений ворог"] && rows["Улюблений ворог"].parts.length === 2 && pk.passive.filter((r) => r.n === "Улюблений ворог").length === 1, "one row for a perk taken twice, both notes in it");
  ok(rows["Здоровань"] && !/Здоровань/.test(rows["Здоровань"].parts[0].t), "the row's text does not repeat the name");
  ok(rows["Добра душа"]?.parts.some((p) => p.bad), "a feat's negative part keeps its colour");
  const withCard = new Set(pk.uses.map((u) => u.perk));
  for (const c of tagged) {
    const n = c.src.slice(2);
    ok(withCard.has(n) || (rows[n] && rows[n].parts.length), `chip of «${n}» is neither in a row nor on a card`);
  }
}

console.log(`perk-uses: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
