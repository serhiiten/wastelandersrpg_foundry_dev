// The states enemies' moves put on characters and enemies (author, 2026-11-20; module/rules/states.mjs): in force while the
// aspect is on, put on again refreshes, the tick at ▶ «Коло дій», the armour, the stun once a scene.
// Run: node tests/states.test.mjs
import * as S from "../module/rules/states.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// the aspects are the quick aspects' words for the three of them (battle.mjs QUICK_ASPECTS), masculine
eq([S.STATES.down.aspect, S.STATES.stunned.aspect, S.STATES.disarmed.aspect], ["Збитий з ніг", "Приголомшений", "Без зброї"], "quick aspects' texts");
eq(S.STATE_ASPECTS.length, 10, "ten states");

// in force only while the aspect is on
let list = S.putState([], "poisoned", { dice: "1d6", left: 3, round: 2, by: "T1" });
eq(S.activeStates(list, ["Отруєний"]).length, 1, "poisoned in force with its aspect");
eq(S.activeStates(list, ["надійне укриття"]).length, 0, "the aspect deleted: the state is gone");

// again: the longer, the bigger, no stacking
list = S.putState(list, "poisoned", { dice: "1d10", left: 2, round: 3 });
eq([list.length, list[0].dice, list[0].left], [1, "1d10", 3], "refreshed: one state, 1d10, 3 rounds");
eq(S.biggerDice("2d6", "3d6"), "3d6", "bigger dice");

// the tick: not in the round it was put on, once a round, `left` down to 0
let t = S.tickStates(list, 2);
eq(t.hits.length, 0, "no tick in the round it was put on");
t = S.tickStates(list, 3);
eq([t.hits.length, t.next[0].left, t.gone.length], [1, 2, 0], "round 3: a hit, 2 left");
eq(S.tickStates(t.next, 3).hits.length, 0, "◀ ▶ to the same round ticks no more");
t = S.tickStates(S.tickStates(t.next, 4).next, 5);
eq([t.hits.length, t.gone], [1, ["poisoned"]], "the last tick takes it off");

// bleeding and the «Підпал» burn: once
t = S.tickStates(S.putState([], "bleeding", { dice: "1d10", left: 1, round: 1 }), 2);
eq([t.hits.length, t.hits[0].ignoreArmor, t.gone], [1, true, ["bleeding"]], "bleeding: one tick ignoring armour");

// stunned: skip at the first tick, gone at the second
const s1 = S.putState([], "stunned", { round: 1 });
t = S.tickStates(s1, 2);
ok(t.skip && !t.gone.length, "stunned: skips the action at the first tick");
t = S.tickStates(t.next, 3);
ok(!t.skip && t.gone[0] === "stunned", "stunned: gone at the second");

// grabbed: while the holder stands
const g = S.putState([], "grabbed", { dice: "2d6", by: "YAO", round: 1 });
eq(S.tickStates(g, 2, { holderOk: () => true }).hits[0].dice, "2d6", "grabbed: 2d6 while held");
eq(S.tickStates(g, 2, { holderOk: () => false }).gone, ["grabbed"], "grabbed: free when the holder is gone");

// knocked down, the acid: no tick
eq(S.tickStates(S.putState([], "down", { round: 1 }), 2).hits.length, 0, "down: no damage");
const acid = S.putState([], "acid", { round: 1 });
eq(S.withStates({ armor: 1 }, acid).armor, 0, "−2 armour, never below 0");
eq(S.withStates({ armor: 4 }, acid).armor, 2, "−2 armour");

// immunity, the stun once a scene
ok(S.immuneTo("down", { noKnockdown: true }) && !S.immuneTo("down", {}) && !S.immuneTo("poisoned", { noKnockdown: true }), "immunity");
const once = S.markStunned({}, "R1");
ok(S.stunnedBefore(once, "R1") && !S.stunnedBefore(once, "R2"), "the stun once a scene by the same enemy");

eq(S.stateWords({ key: "burning", dice: "1d6", type: "fire", left: 3 }), "«Палає» (1d6 вогнем щоразу, 3 кола)", "the card's words");
eq(S.stateWords({ key: "bleeding", dice: "1d6", left: 1, ignoreArmor: true }), "«Кровотеча» (1d6 раз, коли настане черга діяти, броня не рятує)", "once");

console.log(failures ? `FAILS: ${failures} of ${checks}` : `states: OK (${checks} checks)`);
if (failures) process.exit(1);
