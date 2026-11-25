// The caravan moved on the HTML terminal's «Мапа Пустки» (4.4; HTML backport stage 4, part 2, 2026-11-25): map.js keeps a
// word-for-word copy of module/rules/caravan-range.mjs between the marks «caravan-range» and asks Foundry's question of
// canvas/caravan-move.mjs («Витратити запас ходу автоматично?», its second line, «Ні, просто перемістити», the cancel, the
// warning). This binds the copy, the texts and the plan's lines, and runs the rules of both on a grid.
// Run: node tests/caravan-move-html.test.mjs
import vm from "node:vm";
import * as CR from "../module/rules/caravan-range.mjs";
import { hasTerminal, termSrc, modSrc, unexport, marked } from "./html-copy.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 20) console.log("FAIL", m); } };

if (!hasTerminal("map.js")) { console.log("caravan-move-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const src = termSrc("map.js");
const copy = marked(src, "caravan-range");
ok(copy === unexport(modSrc("module/rules/caravan-range.mjs")), "map.js «caravan-range» differs from caravan-range.mjs (copy it again, without «export »)");
const H = vm.runInNewContext(copy + "\n({ brahminSaving, rangeCost })", {});
for (const taken of [false, true]) for (const pf of [false, true]) ok(H.brahminSaving(taken, pf) === CR.brahminSaving(taken, pf), `brahminSaving(${taken}, ${pf})`);
for (let cells = -1; cells <= 40; cells++) for (const t of [false, true]) for (const s of [0, 0.25, 0.5])
  ok(H.rangeCost(cells, t, s) === CR.rangeCost(cells, t, s), `rangeCost(${cells}, ${t}, ${s})`);

// the question and the plan, as caravan-move.mjs words them
const mv = modSrc("module/canvas/caravan-move.mjs");
const line = (re) => (re.exec(mv) || [])[0]?.trim();
for (const l of [line(/^\s*const notes = \[tachka.*$/m), line(/^\s*const sub = `\$\{cells\} кл\..*$/m)]) ok(l && src.includes(l), `movePlan's line in map.js: ${l}`);
for (const t of ["Витратити запас ходу автоматично?", "Ні, просто перемістити", "Скасувати переміщення", "Так</button>"])
  ok(mv.includes(t.replace("</button>", "")) && src.includes(t), `the question's text «${t}»`);
const warn = /`«\$\{actor\.name\}»: (на цей шлях треба \$\{cost\} од\. запасу ходу, а є \$\{have\}\. Караван лишається на місці\.)`/.exec(mv)?.[1];
ok(warn && src.includes(warn.replace("${cost}", "${Q.cost}").replace("${have}", "${Q.have}")), "the warning «на цей шлях треба … Караван лишається на місці.»");
// the brahmins' / regulator's saving read from the caravan sheet's state as Foundry reads its actor (imp.brahmins, «time», pathfinder)
ok(src.includes("CRG.brahminSaving((parseInt((S.imp || {}).brahmins, 10) || 0) > 0 && S.brahminBonus !== 'time', S.pathfinder === true)"), "map.js: the saving from imp.brahmins, brahminBonus, pathfinder");
ok(mv.includes('actor.getFlag(sys, "brahminBonus") !== "time", !!actor.getFlag(sys, "pathfinder")'), "caravan-move.mjs still reads brahminBonus «time» and pathfinder");

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`caravan-move-html: OK (${checks} checks)`);
