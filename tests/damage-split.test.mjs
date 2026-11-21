// The damage of a character's attack split between its targets (A8; author, 2026-11-21; module/rules/damage-split.mjs).
// Run: node tests/damage-split.test.mjs
import * as S from "../module/rules/damage-split.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// when: two targets or more, one type, not the whole zone (grenades stay full damage to all, A12)
eq([S.canSplit({ targets: 1 }), S.canSplit({ targets: 2 }), S.canSplit({ targets: 3, zone: true }), S.canSplit({ targets: 2, types: 2 })], [false, true, false, false], "canSplit");

// even, the remainder to the first
eq(S.evenSplit(13, ["a", "b", "c"]), { a: 5, b: 4, c: 4 }, "13 among 3");
eq(S.evenSplit(1, ["a", "b"]), { a: 1, b: 0 }, "1 among 2");
eq(S.evenSplit(0, ["a", "b"]), { a: 0, b: 0 }, "nothing to split");
eq(S.evenSplit(5, []), {}, "no targets");
eq([S.clampShare(-2, 9), S.clampShare(12, 9), S.clampShare("4", 9), S.clampShare(2.7, 9)], [0, 9, 4, 2], "a share set by hand");
eq([S.splitLeft({ a: 5, b: 4 }, 13), S.splitLeft({ a: 9, b: 9 }, 13)], [4, -5], "left");

// the GM's check: a bad split applies nothing
const T = ["a", "b"];
eq(S.splitError({ a: 6, b: 7 }, T, 13), "", "a good one");
eq(S.splitError({ a: 6, b: 0 }, T, 13), "", "less than the total is fine (на власний розсуд)");
ok(!!S.splitError({ a: 9, b: 9 }, T, 13), "more than the total");
ok(!!S.splitError({ a: 6, x: 1 }, T, 13), "a target not of the attack");
ok(!!S.splitError({ a: -1, b: 3 }, T, 13), "negative");
ok(!!S.splitError({ a: 1.5, b: 3 }, T, 13), "not whole");
ok(!!S.splitError({ a: 0, b: 0 }, T, 13), "nobody hit");
ok(!!S.splitError(null, T, 13) && !!S.splitError({}, T, 13) && !!S.splitError([1], T, 13), "no split");

// the dice in proportion (radiation that heals: +1 HP a die)
eq(S.shareCount(3, { a: 6, b: 3, c: 3 }), { a: 1, b: 1, c: 1 }, "3 dice by 6/3/3: the largest remainders");
eq(S.shareCount(1, { a: 3, b: 3 }), { a: 1, b: 0 }, "a tie goes to the first");
eq(S.shareCount(4, { a: 10, b: 0 }), { a: 4, b: 0 }, "all to the one with damage");
eq(S.shareCount(2, { a: 0, b: 0 }), { a: 0, b: 0 }, "nothing given");
const sc = S.shareCount(7, { a: 5, b: 4, c: 4 });
eq(Object.values(sc).reduce((x, y) => x + y, 0), 7, "the dice add up");

// one target's hit
const data = { total: 13, type: "phys", dice: 2, poison: 4, ignoreArmor: false, ignoreN: 1, parts: undefined };
const split = { shares: { a: 8, b: 5, c: 0 }, one: "b", fxIgnore: true };
const ha = S.splitHit(data, split, "a"), hb = S.splitHit(data, split, "b");
eq([ha.total, ha.poison, ha.ignoreArmor, ha.ignoreN], [8, 0, false, 1], "a: its share, no poison, the weapon's own «ігнорує 1» stays");
eq([hb.total, hb.poison, hb.ignoreArmor, hb.ignoreN], [5, 4, true, 0], "b, the effect's target: poison and the effect's «ігноруєш броню»");
eq(S.splitHit(data, split, "c"), null, "share 0: no hit at all");
eq(ha.dice + hb.dice, 2, "the dice split as the damage");
ok(!("parts" in ha), "no parts in a split hit");
// no effect target named: the first one with damage gets the poison
const h2 = S.splitHit(data, { shares: { a: 0, b: 3, c: 2 } }, "b");
eq([h2.poison, h2.ignoreArmor], [4, false], "the first with damage gets the poison by default");
// the effect's target may take 0 damage: the poison is simply not dealt (wiki: poison needs a hit)
eq(S.splitHit(data, { shares: { a: 13, b: 0 }, one: "b" }, "a").poison, 0, "effect target with 0: nobody else gets the poison");

// why not split (reviewer, author 2026-11-21): the panel says it for damage of several types
eq([S.splitBlock({ targets: 1 }), S.splitBlock({ targets: 2, zone: true }), S.splitBlock({ targets: 2, types: 2 }), S.splitBlock({ targets: 2 })], ["targets", "zone", "types", ""], "splitBlock");
// the effect's target with 0: the panel warns and waits (the chosen one, else the first)
eq([S.effectTargetIdle({ a: 0, b: 5 }, "a"), S.effectTargetIdle({ a: 0, b: 5 }, "b"), S.effectTargetIdle({ a: 0, b: 5 }, ""), S.effectTargetIdle({ a: 3, b: 0 }, "x"), S.effectTargetIdle({}, "a")],
  [true, false, true, false, false], "effectTargetIdle");

console.log(`${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
