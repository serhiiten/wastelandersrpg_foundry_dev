// 3D dice for the system's rolls (author, 2026-11-19): the Roll data built from dice the rules code already rolled
// (module/helpers/dice-rolls.mjs), so Dice So Nice throws the very dice the chat card shows. Run: node tests/dice-rolls.test.mjs
import { diceData, rollFromDice, rollList, seriesGroups, checkDiceGroups, damageDiceGroups, poisonSidesOf, waitDice } from "../module/helpers/dice-rolls.mjs";
import { dieSides } from "../module/rules/damage-types.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
/** a group as «faces:values, dropped» for short comparisons */
const short = (gs) => gs.map((g) => `${g.values.length}d${g.faces}:${g.values.join(",")}${g.dropped?.length ? ` x${[...g.dropped].join(",")}` : ""}`);

/* ---------- diceData: the shape Roll.fromData takes ---------- */
{
  const d = diceData([{ faces: 10, values: [7, 2, 9], dropped: [1] }, { faces: 8, values: [5] }]);
  eq(d.class, "Roll", "class");
  eq(d.formula, "3d10 + 1d8", "formula without kh/kl");
  eq(d.total, 21, "total: the active dice only");
  eq(d.evaluated, true, "evaluated");
  eq(d.terms.map((t) => t.class), ["Die", "OperatorTerm", "Die"], "terms joined by +");
  eq(d.terms[0].number, 3, "number = results");
  eq(d.terms[0].results, [{ result: 7, active: true }, { result: 2, active: false, discarded: true }, { result: 9, active: true }], "dropped die is discarded");
  eq(d.terms.every((t) => t.evaluated), true, "every term evaluated");
  eq(d.terms[1].operator, "+", "operator");
}
eq(diceData([]), null, "no groups → null");
eq(diceData([{ faces: 6, values: [] }, { faces: 0, values: [3] }]), null, "empty groups and no faces → null");
eq(diceData([{ faces: 6, values: [] }, { faces: 6, values: [4] }]).formula, "1d6", "an empty group is skipped");
eq(diceData([{ faces: 6, values: [0, "x", 3] }]).terms[0].results, [{ result: 3, active: true }], "values that are no die results are dropped");
eq(rollFromDice([{ faces: 6, values: [3] }]), null, "outside Foundry: no Roll");
{
  // with a Roll class: fromData gets the data
  let got = null;
  globalThis.Roll = { implementation: { fromData: (x) => (got = x, { rolled: x.total }) } };
  eq(rollFromDice([{ faces: 6, values: [3, 4] }]), { rolled: 7 }, "Roll.implementation.fromData is used");
  eq(got.formula, "2d6", "its data");
  eq(rollFromDice([]), null, "no dice → no Roll even in Foundry");
  globalThis.Roll = { fromData: () => { throw new Error("bad"); } };
  const warn = console.warn; console.warn = () => {};
  eq(rollFromDice([{ faces: 6, values: [3] }]), null, "a failing Roll → null, no throw");
  console.warn = warn;
  delete globalThis.Roll;
}
eq(rollList(null, [1, null], 2, undefined), [1, 2], "rollList drops the empty ones");

/* ---------- seriesGroups ---------- */
eq(short(seriesGroups([6, 6, 8], [1, 2, 3])), ["2d6:1,2", "1d8:3"], "mixed sides in order");
eq(short(seriesGroups([6, 6], [4, 5], (i) => i === 0)), ["2d6:4,5 x0"], "dropped index within its group");

/* ---------- a check ---------- */
eq(short(checkDiceGroups({ dice: [3, 8], keep: [0, 1] })), ["2d10:3,8"], "plain check: 2d10, both counted");
eq(short(checkDiceGroups({ dice: [3, 8, 6], keep: [1, 2] })), ["3d10:3,8,6 x0"], "Посилення: 3d10, the lowest dropped");
eq(short(checkDiceGroups({ dice: [3, 8, 6, 9], keep: [0, 2] })), ["4d10:3,8,6,9 x1,3"], "two Послаблення: the two highest dropped");
eq(short(checkDiceGroups({ dice: [2, 5], keep: [0, 1], skill: { sides: 8, v: 7, replaced: true } })), ["2d10:2,5", "1d8:7"], "skill die that replaced one");
eq(short(checkDiceGroups({ dice: [9, 9], keep: [0, 1], skill: { sides: 6, v: 1, replaced: false } })), ["2d10:9,9", "1d6:1 x0"], "skill die that replaced nothing: discarded");
eq(checkDiceGroups(null), [], "no check");
// an aspect: the new die only
{
  const before = { dice: [2, 5], keep: [0, 1] };
  const after = { ...before, aspect: { v: 9, replaced: true, oldV: 2 } };
  eq(short(checkDiceGroups(after, before)), ["1d10:9"], "aspect: only the new d10");
  eq(short(checkDiceGroups({ ...before, aspect: { v: 1, replaced: false } }, before)), ["1d10:1 x0"], "aspect die that replaced nothing");
  eq(checkDiceGroups(after, after), [], "same aspect as before: no die");
  eq(checkDiceGroups(before, before), [], "no aspect: no die");
  eq(short(checkDiceGroups(after, null)), ["1d10:9"], "no check before: the aspect die");
}

/* ---------- damage ---------- */
const p2d6 = { terms: [{ n: 2, s: 6 }] };
const pMix = { terms: [{ n: 1, s: 6 }, { n: 1, s: 8 }] };
const pLow = { low: true, terms: [] };
eq(dieSides(pLow), [6, 6], "sanity: low is 2d6");
eq(short(damageDiceGroups({ dmg: { p: p2d6, r1: { vals: [3, 4], sum: 7 }, extra: {} } }, [["2d6", 7]], dieSides(p2d6))), ["2d6:3,4"], "plain 2d6");
eq(short(damageDiceGroups({ dmg: { p: pMix, r1: { vals: [3, 7], sum: 10 }, extra: {} } }, [["1d6+1d8", 10]], dieSides(pMix))), ["1d6:3", "1d8:7"], "mixed dice");
eq(short(damageDiceGroups({ dmg: { p: pLow, r1: { vals: [5, 2], sum: 2, low: true }, extra: {} } }, [["менша з 2d6", 2]], [6, 6])), ["2d6:5,2 x0"], "«менша з 2d6»: the higher dropped");
eq(short(damageDiceGroups({ dmg: { p: pLow, r1: { vals: [4, 4], sum: 4, low: true }, extra: {} } }, [["менша з 2d6", 4]], [6, 6])), ["2d6:4,4 x1"], "«менша з 2d6», equal: one dropped");
{
  // «Автоматний псих»: two series, the worse dropped whole
  const L = { dmg: { p: p2d6, r1: { vals: [1, 2], sum: 3 }, r2: { vals: [5, 6], sum: 11 }, extra: {} } };
  eq(short(damageDiceGroups(L, [["2d6 (краща з двох)", 11]], [6, 6])), ["2d6:1,2 x0,1", "2d6:5,6"], "two series: the first, worse, dropped");
  L.dmg.r2 = { vals: [1, 1], sum: 2 };
  eq(short(damageDiceGroups(L, [["2d6 (краща з двох)", 3]], [6, 6])), ["2d6:1,2", "2d6:1,1 x0,1"], "two series: the second, worse, dropped");
}
{
  // extras: only those the parts count; «Тиха смерть» throws no weapon dice
  const L = { dmg: { p: p2d6, r1: { vals: [3, 4], sum: 7 }, extra: { silent: 5, crit: 2, robot: 6 } } };
  eq(short(damageDiceGroups(L, [["2d6", 7], ["Критичний ефект +1d6", 2]], [6, 6])), ["2d6:3,4", "1d6:2"], "crit counted; silent and robot not in the parts");
  eq(short(damageDiceGroups(L, [["Максимум кісток (Тиха смерть)", 12], ["Тиха смерть +1d6", 5], ["Електрична: робот чи електроніка +1d6", 6]], [6, 6])), ["1d6:5", "1d6:6"], "Тиха смерть: no weapon dice, its d6 and the robot's");
  // an option changed the damage: only the extra drawn since
  eq(short(damageDiceGroups(L, [["2d6", 7], ["Критичний ефект +1d6", 2], ["Електрична: робот чи електроніка +1d6", 6]], [6, 6], { prevExtra: { crit: 2 } })), ["1d6:6"], "updated: only the new robot d6");
  eq(damageDiceGroups(L, [["2d6", 7], ["Критичний ефект +1d6", 2]], [6, 6], { prevExtra: { crit: 2 } }), [], "updated without new dice: none");
  eq(short(damageDiceGroups(L, [["2d6", 7], ["Критичний ефект +1d6", 2]], [6, 6], { prevExtra: null })), ["1d6:2"], "updated, no extra before: the new one");
}
{
  const L = { poison: { n: "Отрута", dice: "1d6" }, poisonRoll: { vals: [4], sum: 4 }, dmg: { p: p2d6, r1: { vals: [3, 4], sum: 7 }, extra: {} } };
  eq(short(damageDiceGroups(L, [["2d6", 7]], [6, 6], { poisonSides: poisonSidesOf(L.poison.dice) })), ["2d6:3,4", "1d6:4"], "the weapon's poison");
  eq(short(damageDiceGroups(L, [["2d6", 7]], [6, 6], { prevExtra: {}, poisonSides: 6 })), [], "updated: the poison is not thrown again");
}
eq(damageDiceGroups({}, [], []), [], "no damage");
eq(poisonSidesOf("2d8"), 8, "poison sides");
eq(poisonSidesOf(""), 0, "poison sides unreadable");

/* ---------- waitDice ---------- */
{
  await waitDice(null); // no message, no dice module: returns
  await waitDice({ id: "a", rolls: [1] });
  let asked = null;
  globalThis.game = { dice3d: { waitFor3DAnimationByMessageID(id) { asked = id; return Promise.resolve(true); } } };
  await waitDice({ id: "m1", rolls: [] });
  eq(asked, null, "no rolls on the message: nothing to wait for");
  await waitDice({ id: "m1", rolls: [{}] });
  eq(asked, "m1", "waits for the message's dice");
  globalThis.game = { dice3d: { waitFor3DAnimationByMessageID: () => Promise.reject(new Error("x")) } };
  await waitDice({ id: "m2", rolls: [{}] }); // a failing dice module does not throw
  ok(true, "failing dice module");
  delete globalThis.game;
}

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`dice-rolls: OK (${checks} checks)`);
