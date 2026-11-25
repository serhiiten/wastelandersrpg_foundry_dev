// «Завдати шкоди цілям» of the character sheet embedded in the HTML terminal (HTML backport stage 4, part 2, 2026-11-25): the
// sheet sends the tracker the damage parts by type (labelled terms «2d6[радіація]», electricity to robots) and the EMP grenade
// (empOnly), as Foundry's «Завдати цілям» does (check-panel.mjs: weaponDmgType, partType, splitDiceParts, applyParts,
// choiceEmpOnly). The terminal's cg_hit_types.js keeps word-for-word copies of rules/damage-types.mjs (all of it) and of diceIn /
// applyParts of rules/battle.mjs; cg_build.py puts it into the sheet's bridge. This binds the copies and runs them on a grid.
// Run: node tests/sheet-hit-types-html.test.mjs
import vm from "node:vm";
import * as DT from "../module/rules/damage-types.mjs";
import { applyParts, battleType } from "../module/rules/battle.mjs";
import { hasTerminal, termSrc, modSrc, unexport, marked } from "./html-copy.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 20) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);

if (!hasTerminal("cg_hit_types.js")) { console.log("sheet-hit-types-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const src = termSrc("cg_hit_types.js");
ok(marked(src, "damage-types") === unexport(modSrc("module/rules/damage-types.mjs")), "cg_hit_types.js «damage-types» differs from damage-types.mjs (copy it again, without «export »)");
const bt = modSrc("module/rules/battle.mjs");
const want = [/^const diceIn = .*$/m.exec(bt)[0], /^export function applyParts\(.*?\n\}/ms.exec(bt)[0].replace(/^export /, "")].join("\n");
ok(marked(src, "battle-parts") === want, "cg_hit_types.js «battle-parts» differs from battle.mjs diceIn / applyParts");
const H = vm.runInNewContext(src + "\nCG_DT", {});

// the sheet's damage choices: weapons, grenades of «Інший мотлох», unarmed
const choices = [
  { key: "w0", name: "Легка зброя", w: { n: "Легка зброя", d: "1d6" } },
  { key: "w1", name: "Товстун", w: { n: "Тактичний ядерний гранатомет «Товстун»", d: "4d6[фізична]+2d6[радіація]", note: "" } },
  { key: "w2", name: "Лазерна гвинтівка", w: { n: "Лазерна гвинтівка", d: "2d6", en: "laser" } },
  { key: "w3", name: "Пси", w: { n: "Пси-удар", d: "1d10", auto: "psi" } },
  { key: "w4", name: "Отруйний ніж", w: { n: "Ніж", d: "1d6+1d6", note: "частина шкоди (1d6) — отрутою" } },
  { key: "w5", name: "YK32", w: { n: "Імпульсний пістолет YK32", d: "1d10", dt: "electric" } },
  { key: "o0", name: "Електромагнітна граната ×1", o: { n: "Електромагнітна граната", note: "4d6 лише роботам та електроніці" } },
  { key: "o1", name: "Плазмова граната ×1", o: { n: "Плазмова граната", note: "3d6, уся зона" } },
  { key: "unarmed", name: "Беззбройні атаки" },
];
const ps = [null, { low: true, terms: [{ n: 2, s: 6 }], flat: 0 }, { low: false, terms: [{ n: 4, s: 6, t: "фізична" }, { n: 2, s: 6, t: "радіація" }], flat: 0 },
  { low: false, terms: [{ n: 1, s: 6 }, { n: 1, s: 6 }], flat: 2 }, { low: false, terms: [{ n: 2, s: 6 }], flat: 0 }];
const partsSets = [[["4d6+2d6", 20], ["Бонус зброї", 2]], [["2d6", 7], ["Електрична: робот чи електроніка +1d6", 4], ["Критичний ефект +1d6", 3]],
  [["Максимум кісток (Тиха смерть)", 12], ["Тиха смерть +1d6", 5]], [["1d6+1d6", 8], ["Звичайний ефект", 2], ["мод.", -1]]];
for (const c of choices) {
  ok(H.weaponDmgType(c) === DT.weaponDmgType(c), `weaponDmgType(${c.key})`);
  ok(H.choiceEmpOnly(c) === DT.choiceEmpOnly(c), `choiceEmpOnly(${c.key})`);
  const wt = DT.weaponDmgType(c);
  for (const p of ps) for (const set of partsSets) {
    const vals = p ? Array.from({ length: (p.terms || []).reduce((n, t) => n + t.n, 0) }, (_, i) => (i % 6) + 1) : [];
    const a = DT.splitDiceParts(set.map(([l, v]) => ({ l, v: String(v), t: DT.partType(l, wt) })), c, p, wt, vals);
    const b = H.splitDiceParts(set.map(([l, v]) => ({ l, v: String(v), t: H.partType(l, wt) })), c, p, wt, vals);
    ok(J(a) === J(b), `splitDiceParts(${c.key}, ${J(p)}, ${set[0][0]})`);
    ok(J(applyParts(a)) === J(H.applyParts(b)), `applyParts(${c.key}, ${J(p)}, ${set[0][0]})`);
  }
}
ok(H.choiceEmpOnly(choices[6]) === true && H.choiceEmpOnly(choices[7]) === false, "the EMP grenade is empOnly, the plasma one is not");

// the bridge uses the copies as check-panel.mjs does, and the tracker reads the chat types back as battleType does
const build = termSrc("cg_build.py"), cg = termSrc("cg.js");
ok(build.includes("(SP / 'cg_hit_types.js').read_text(encoding='utf-8')"), "cg_build.py puts cg_hit_types.js into the sheet's bridge");
for (const s of ["CG_DT.weaponDmgType(c)", "CG_DT.partType(p[0], wt)", "if(!/^Максимум/.test((tp[0] && tp[0].l) || '')) tp = CG_DT.splitDiceParts(tp, c, D.p, wt, best && best.vals)",
  "D.r2 && D.r2.sum > D.r1.sum ? D.r2 : D.r1", "CG_DT.applyParts(tp)", "CG_DT.choiceEmpOnly(c)"]) ok(build.includes(s), `cgHit: ${s}`);
const cpm = modSrc("module/applications/check-panel.mjs");
ok(cpm.includes("parts = splitDiceParts(parts, choice, D.p, wt, best.vals)") && cpm.includes("emp: choiceEmpOnly(choice)") && cpm.includes("applyParts(parts)"), "check-panel.mjs still builds the hit this way");
const RE = /x && x\.type === 'psi' \? 'psychic' : x && hitIsType\(x\.type\) \? x\.type : 'phys'/;
ok(RE.test(cg), "cg.js: chat types → the tracker's types as battleType");
const TR = ["phys", "laser", "plasma", "gauss", "electric", "cryo", "fire", "rad", "poison", "psychic"];
// «constructor» and the like: the terminal checks the type with Object.hasOwn (hitIsType) and gives «phys»; Foundry's battleType
// (DMG_TYPES[t]) would keep the word — a sheet never sends one, so the grid leaves it out
for (const t of [...Object.keys(DT.DMG_TYPES), "x", "", "Фізична"]) ok((t === "psi" ? "psychic" : TR.includes(t) ? t : "phys") === battleType(t), `battleType(${t})`);

// The tracker's damage field reads labelled terms («2d6[фізична]+1d6[радіація]», a weapon of the sheet; HTML backport stage 4,
// part 2, 2026-11-25): build.py puts cg_hit_types.js into the terminal too, the tracker reads a label with CG_DT.labelType;
// several types are not split (check-panel.mjs: the same words)
for (const l of ["фізична", "радіація", "Радіація", "кріо", "електрика", "пси", "психічна", "отрута", "вогонь", "лазерна", "плазмова", "гаус", "x", ""])
  ok(H.labelType(l) === DT.labelType(l), `labelType(${l})`);
const tr = termSrc("tracker.js");
ok(termSrc("build.py").includes("(SP / 'cg_hit_types.js').read_text(encoding='utf-8')"), "build.py puts cg_hit_types.js into the terminal (TRK)");
ok(tr.includes("CG_DT.labelType(l)") && tr.includes("t === 'psi' ? 'psychic' : t"), "tracker.js: a label → the tracker's type as labelType + battleType");
const SPLIT_TYPES = "Шкода вийшла кількох типів, тож розподілити її не вийде: кожна ціль отримує її повністю.";
ok(cpm.includes(SPLIT_TYPES) && tr.includes(SPLIT_TYPES), "the toast of a split of several types: check-panel.mjs's words");

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`sheet-hit-types-html: OK (${checks} checks)`);
