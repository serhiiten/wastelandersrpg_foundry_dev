// What the chips under a token show (module/rules/token-chips.mjs): situational aspects, a character's consequences
// first (author, 2026-11-22, П5 5.1), one limit of six with «+N».
// Run: node tests/token-chips.test.mjs
import { CHIPS_MAX, chipPlan, tokenAspects, tokenConsequences } from "../module/rules/token-chips.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const cons = (o = {}, treated = {}) => ({ light: "", moderate: "", secondModerate: "", heavy: "", ...o, treated: { light: false, moderate: false, secondModerate: false, heavy: false, ...treated } });
const hero = (situational = [], c = cons()) => ({ type: "character", system: { situational, consequences: c } });

// sources
eq(tokenAspects(null), [], "no actor");
eq(tokenAspects(hero([{ name: " Сховався ", invoked: 1 }, { name: "  ", invoked: 2 }])), [{ t: "Сховався", inv: 1 }], "a character's situational, empty dropped");
eq(tokenAspects({ type: "enemy", system: { aspects: [{ t: "Лютий", inv: -1 }] } }), [{ t: "Лютий", inv: 0 }], "an enemy's, invokes not below 0");
eq(tokenAspects({ type: "place", system: { aspects: [{ t: "Темно", inv: 2 }] } }), [{ t: "Темно", inv: 2 }], "a place's");

// consequences: characters only, heavy first, empty slots dropped, treated kept
eq(tokenConsequences({ type: "enemy", system: { consequences: cons({ light: "x" }) } }), [], "an enemy has none");
eq(tokenConsequences({ type: "place", system: {} }), [], "a place has none");
eq(tokenConsequences(hero()), [], "no consequences");
eq(tokenConsequences({ type: "character", system: {} }), [], "no consequences field");
eq(tokenConsequences(hero([], cons({ light: "Вивих коліна", moderate: "Зламані ребра", heavy: " Контузія " }, { light: true }))),
  [{ t: "Контузія", sev: "h", treated: false }, { t: "Зламані ребра", sev: "m", treated: false }, { t: "Вивих коліна", sev: "l", treated: true }],
  "heavy, moderate, light; trimmed; treated");
eq(tokenConsequences(hero([], cons({ moderate: "А", secondModerate: "Б" }, { secondModerate: true }))).map((x) => [x.t, x.sev, x.treated]),
  [["Б", "m", true], ["А", "m", false]], "the second moderate is moderate too");

// the plan: consequences first, one limit
eq(CHIPS_MAX, 6, "six chips at most");
const asp = (n) => Array.from({ length: n }, (_, i) => ({ t: `a${i}`, inv: 0 }));
const cs = (n) => Array.from({ length: n }, (_, i) => ({ t: `c${i}`, sev: "m", treated: false }));
eq(chipPlan([], []), { chips: [], more: 0 }, "nothing");
let p = chipPlan(asp(2), cs(2));
eq(p.chips.map((c) => c.t), ["c0", "c1", "a0", "a1"], "consequences before aspects");
ok(p.chips[0].cons && !p.chips[2].cons, "consequence chips are marked");
eq(p.more, 0, "four fit");
p = chipPlan(asp(3), cs(3));
eq([p.chips.length, p.more], [6, 0], "exactly six: no «+N»");
p = chipPlan(asp(4), cs(3));
eq([p.chips.map((c) => c.t), p.more], [["c0", "c1", "c2", "a0", "a1"], 2], "seven: five shown and «+2»");
p = chipPlan(asp(0), cs(4).concat(), 3);
eq([p.chips.map((c) => c.t), p.more], [["c0", "c1"], 2], "the limit cuts consequences too");
p = chipPlan(asp(43), []);
eq([p.chips.length, p.more], [5, 38], "the stress test of 2026-11-17");

console.log(`${checks - failures}/${checks} token-chips checks passed`);
if (failures) process.exit(1);
