// The HTML terminal's copy of «Справа» → «Створити битву» (4.2; HTML backport stage 4, 2026-11-25). The terminal's
// case_battle.js keeps a word-for-word copy of rules/case-battle.mjs between the marks «case-battle»; this binds it to Foundry,
// runs both on real cases of the terminal's generator and the battle generator's database with the same dice, and checks the
// page's wiring (the button's words, the toasts, the same DB / ORDER, the case's state). Run: node tests/case-battle-html.test.mjs
import vm from "node:vm";
import * as F from "../module/rules/case-battle.mjs";
import { createTerminal } from "../module/rules/terminal.mjs";
import { hasTerminal, termSrc, modSrc, unexport, marked } from "./html-copy.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 20) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);

if (!hasTerminal("case_battle.js")) { console.log("case-battle-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const src = termSrc("case_battle.js");
const copy = marked(src, "case-battle");
ok(copy === unexport(modSrc("module/rules/case-battle.mjs")), "case_battle.js differs from case-battle.mjs (copy it again, without «export »)");
const NAMES = Object.keys(F);
const H = vm.runInNewContext(copy + `\n({ ${NAMES.join(", ")} })`, {});
ok(J(NAMES.sort()) === J(["CASE_DIFF", "CASE_KINDS", "CASE_KIND_DEFAULT", "caseBattle", "caseKind", "casePower"]), `exports: ${J(NAMES)}`);
ok(J(H.CASE_KINDS) === J(F.CASE_KINDS) && H.CASE_KIND_DEFAULT === F.CASE_KIND_DEFAULT && J(H.CASE_DIFF) === J(F.CASE_DIFF), "the maps");

// real cases of the terminal's generator, the battle generator's database, the same dice on both sides
const T = createTerminal({ toast: () => {} });
const { DB, ORDER } = T.battle.BT;
const seeded = (s) => () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
const groups = new Set(), powers = new Set();
let n = 0;
for (const diff of ["легка", "середня", "важка"]) for (let i = 0; i < 120; i++) {
  const cs = T.case.generate(diff);
  const g = cs.f.enemies, p = cs.f.enemyPower;
  groups.add(g); powers.add(p);
  ok(H.caseKind(g) === F.caseKind(g), `caseKind «${g}»`);
  ok(J(H.casePower(p)) === J(F.casePower(p)), `casePower «${p}»`);
  ok(F.casePower(p).length > 0, `«${p}» gives counts`);
  for (const deadly of [false, true]) {
    const a = F.caseBattle(DB, ORDER, F.caseKind(g), F.casePower(p), { deadly, rnd: seeded(n) });
    const b = H.caseBattle(DB, ORDER, H.caseKind(g), H.casePower(p), { deadly, rnd: seeded(n) });
    ok(a && J(a) === J(b), `caseBattle «${g}», «${p}», deadly ${deadly}`);
    n++;
  }
}
ok(groups.size >= 20 && powers.size >= 6, `cases met: ${groups.size} groups, ${powers.size} powers`);
for (const k of Object.keys(DB)) for (const p of ["1 бос", "2 боси", "3 елітні супротивники", "1 елітний супротивник і 4 рядові супротивники", "5 статистів"])
  ok(J(F.caseBattle(DB, ORDER, k, F.casePower(p), { rnd: seeded(7) })) === J(H.caseBattle(DB, ORDER, k, H.casePower(p), { rnd: seeded(7) })), `caseBattle ${k} «${p}»`);
for (const k of ["Пʼяниці", "П'яниці", "  Ши ", "", null]) ok(H.caseKind(k) === F.caseKind(k), `caseKind ${J(k)}`);

// the page's wiring: the button's words (Foundry's terminal.hbs), the toasts (Foundry's #caseBattle), the case's state
const hbs = modSrc("templates/apps/terminal.hbs");
const title = hbs.match(/data-action="caseBattle" title="([^"]+)"/)[1];
ok(title && termSrc("template.html").includes(`id="cs-battle" disabled title="${title}">{{I:skull}} Створити битву</button>`), "template.html: «Створити битву» with Foundry's tooltip, in «Супротивники»");
ok(/<div id="enemies" class="field-content"><\/div><div class="cs-battle-row"><button type="button" class="btn cs-battle" id="cs-battle"/.test(termSrc("template.html")), "the button under the «Супротивники» text");
ok(/window\.CaseGen = \{ generateCase: caseGenerate, regenerateField: caseReroll, state: \(\) => CS \};/.test(termSrc("template.html")), "template.html: CaseGen.state() — the case generator's CS");
const app = modSrc("module/applications/terminal.mjs");
ok(app.includes('notify.warn("Не вдалося зібрати битву з цієї справи.")') && src.includes("trToast('Не вдалося зібрати битву з цієї справи.')"), "the warning as Foundry's");
ok(app.includes("notify.info(`Битву зі справи перенесено на вкладку «Битви»: ${B.BT.kindName(kind)}, ${cs.f.enemyPower}.`)") && src.includes("trToast(`Битву зі справи перенесено на вкладку «Битви»: ${kindName(kind)}, ${cs.f.enemyPower}.`)"), "the notice as Foundry's");
ok(/CBT\.caseBattle\(DB, ORDER, kind, CBT\.casePower\(cs\.f\.enemyPower\)\)/.test(src) && /CBT\.CASE_DIFF\[cs\.diff\] \|\| 'easy'/.test(src), "case_battle.js: the battle generator's DB / ORDER, the difficulty as Foundry's");

// «Створити битву» from a case or a travel rolls a NEW reward for the battle's difficulty (author, 2026-11-27: the old one stayed
// from the previous battle). Both sides: Foundry's #caseBattle and the travel's fromTravel, the page's caseToBattle and exportTravel.
ok(/B\.BT\.renderBattle\(b\.factionKey, b\.pickedCase, b\.allocations\);\s*B\.BT\.rollReward\(\);/.test(app), "Foundry #caseBattle rolls the reward after renderBattle");
ok(/renderBattle\(b\.factionKey, b\.pickedCase, b\.allocations\)[^\n]*\n\s*rollReward\(\)/.test(src), "case_battle.js: caseToBattle rolls the reward after renderBattle");
ok(/BT\.renderBattle\(b\.factionKey, b\.pickedCase, b\.allocations\);\s*BT\.rollReward\(\);/.test(modSrc("module/rules/terminal.mjs")), "terminal.mjs fromTravel rolls the reward after renderBattle");
ok(/renderBattle\(b\.factionKey, b\.pickedCase, b\.allocations\)[^\n]*\n\s*rollReward\(\)/.test(termSrc("travel_export.js")), "travel_export.js: exportTravel rolls the reward after renderBattle");

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`case-battle-html: OK (${checks} checks)`);
