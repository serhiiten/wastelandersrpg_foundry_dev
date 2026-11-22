// A grenade or explosive on a failure (П3 3.4, author 2026-11-22; module/rules/grenade-fail.mjs). Run: node tests/grenade-fail.test.mjs
import { blastPlan, chipsLeft, directedHalf, isBlast, leftOf, spendOne } from "../module/rules/grenade-fail.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// isBlast: a failed attack with a grenade only
ok(isBlast({ type: "attack", verdict: 0 }, "explosive"), "failed grenade attack → blast");
ok(!isBlast({ type: "attack", verdict: 1 }, "explosive"), "partial success → no blast");
ok(!isBlast({ type: "attack", verdict: 0 }, "ranged"), "failed gun attack → no blast");
ok(!isBlast({ type: "gen", verdict: 0 }, "explosive") && !isBlast(null, "explosive"), "not an attack / no roll → no blast");

// leftOf / chipsLeft
eq([leftOf({ q: "" }), leftOf({ q: "3" }), leftOf({ q: "0" }), leftOf({}), leftOf({ q: "x" })], [1, 3, 0, 1, 1], "how many are left");
const ch = [
  { key: "w0", name: "Пістолет", w: {} },
  { key: "o0", name: "Граната ×2", o: { n: "Граната", q: "2" }, expl: true },
  { key: "o1", name: "Динаміт ×0", o: { n: "Динаміт", q: "0" }, expl: true },
  { key: "gone", name: "Молотов ×0", o: { n: "Молотов", q: "0" }, expl: true },
  { key: "unarmed", name: "Беззбройні атаки" },
];
eq(chipsLeft(ch).map((c) => c.key), ["o0"], "only the grenades still in the gear");

// spendOne
eq(spendOne({ n: "Граната", q: "2" }), { ok: true, remove: false, q: "1", msg: "Витрачено: Граната, лишилося 1." }, "2 → 1");
eq(spendOne({ n: "Граната", q: "1" }).remove, true, "the last one: the row goes");
eq(spendOne({ n: "Граната", q: "" }).remove, true, "no quantity is one: the row goes");
eq(spendOne({ n: "Граната", q: "0" }).ok, false, "none left: nothing written off");

// blastPlan: everyone with HP in the zone, a linked actor once; no token or zone → only the thrower
const T = [
  { uuid: "t-me", key: "a-me", type: "character", zone: "z1", hp: true },
  { uuid: "t-ally", key: "a-ally", type: "character", zone: "z1", hp: true },
  { uuid: "t-foe1", key: "t-foe1", type: "enemy", zone: "z1", hp: true },
  { uuid: "t-foe2", key: "t-foe2", type: "enemy", zone: "z2", hp: true },
  { uuid: "t-ally2", key: "a-ally", type: "character", zone: "z1", hp: true },
  { uuid: "t-place", key: "t-place", type: "place", zone: "z1", hp: false },
  { uuid: "t-car", key: "a-car", type: "caravan", zone: "z1", hp: true },
];
eq(blastPlan(T, { selfToken: "t-me", selfActor: "a-me", zone: "z1" }), { targets: ["t-me", "t-ally", "t-foe1"], self: "t-me", alone: false }, "the zone's creatures, the ally once");
eq(blastPlan(T, { selfToken: "", selfActor: "a-me", zone: null }), { targets: ["a-me"], self: "a-me", alone: true }, "no token → only the thrower");
eq(blastPlan(T, { selfToken: "t-me", selfActor: "a-me", zone: null }).targets, ["a-me"], "no zone under the token → only the thrower");

// directedHalf: the thrower and the characters
const hit = [{ uuid: "t-me", type: "character" }, { uuid: "t-ally", type: "character" }, { uuid: "t-foe1", type: "enemy" }];
eq(directedHalf(hit, "t-me", true), ["t-me", "t-ally"], "Спрямована дія: me and the ally ½, the enemy in full");
eq(directedHalf(hit, "t-me", false), [], "no perk → nobody");
eq(directedHalf([{ uuid: "t-foe1", type: "enemy" }], "", true), [], "an ordinary throw at an enemy → full");

console.log(failures ? `grenade-fail: ${failures} of ${checks} FAILED` : `grenade-fail: all ${checks} passed`);
process.exit(failures ? 1 : 0);
