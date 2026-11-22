// What the chips under a token show (module/rules/token-chips.mjs): situational aspects, a character's consequences
// first (author, 2026-11-22, П5 5.1), one limit of six with «+N».
// Run: node tests/token-chips.test.mjs
import { CHIPS_MAX, chipPlan, markImmune, tokenAspects, tokenConsequences } from "../module/rules/token-chips.mjs";

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

// П3 3.5: an aspect its bearer is immune to is marked red; no state's aspect → the profile isn't even asked for
{
  let asked = 0;
  const prof = () => { asked++; return { noDisarm: true }; };
  const m = markImmune([{ t: "Без зброї", inv: 0 }, { t: "Збитий з ніг", inv: 0 }, { t: "Мокрий", inv: 1 }], prof);
  ok(m[0].imm === true && !m[1].imm && !m[2].imm && asked === 1, `immune marked: ${JSON.stringify(m)}`);
  markImmune([{ t: "Мокрий", inv: 1 }], prof);
  ok(asked === 1, "no state's aspect: no profile");
}
// П3 3.5 on the sheets (w3 check, 2026-11-22): the character sheet's and the enemy card's chip of an immune aspect is the token's
// red (#a8121a, text #fff3e8), with !important over the shared yellow aspect look of pust-ui.css; its inner text has no yellow
{
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../css/pust-sheet.css", import.meta.url), "utf8");
  const tok = readFileSync(new URL("../module/canvas/token.mjs", import.meta.url), "utf8");
  ok(/0xa8121a/.test(tok) && /0xfff3e8/.test(tok), "the token's red chip colours");
  ok(/:is\(\.pust-sitchip, \.pust-en-chip\)\.imm \{[^}]*background: #a8121a !important;[^}]*color: #fff3e8 !important;/.test(css), "sheet / enemy card chip red with !important");
  ok(/:is\(\.pust-sitchip, \.pust-en-chip\)\.imm > span:first-child \{[^}]*background: transparent !important;[^}]*color: #fff3e8 !important;/.test(css), "its text without the yellow highlight");
}
console.log(`${checks - failures}/${checks} token-chips checks passed`);
if (failures) process.exit(1);
