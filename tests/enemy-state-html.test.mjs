// What an online player sees of an enemy the GM revealed (4.3, variant а; HTML backport stage 4, part 2, 2026-11-25): the
// terminal's tracker.js keeps a word-for-word copy of hpLevel / HP_STATES / hpState of module/sheets/enemy-view.mjs between the
// marks «enemy-state» and shows the state in words instead of HP; «Спостережливість» shows HP and attacks (enemy-sheet.mjs
// observant). This binds the copy, runs both on a grid, and checks the terminal knows an icon for every state and the perk's name.
// Run: node tests/enemy-state-html.test.mjs
import vm from "node:vm";
import { hpLevel, hpState, HP_STATES } from "../module/sheets/enemy-view.mjs";
import { hasTerminal, termSrc, modSrc, marked } from "./html-copy.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 20) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);

if (!hasTerminal("tracker.js")) { console.log("enemy-state-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const src = termSrc("tracker.js");
const copy = marked(src, "enemy-state");
// the module's lines from «/** The HP bar class» to the end of hpState, without «export »
const mod = modSrc("module/sheets/enemy-view.mjs");
const a = mod.indexOf("/** The HP bar class"), b = mod.indexOf("\n}\n", mod.indexOf("export function hpState(")) + 2;
ok(a > 0 && b > a, "enemy-view.mjs: hpLevel … hpState found");
ok(copy === mod.slice(a, b).replace(/^export /gm, ""), "tracker.js «enemy-state» differs from enemy-view.mjs hpLevel / HP_STATES / hpState (copy it again, without «export »)");

const H = vm.runInNewContext(copy + "\n({ hpLevel, hpState, HP_STATES })", {});
ok(J(H.HP_STATES) === J(HP_STATES), "HP_STATES: words, icons and colours as Foundry's");
for (let max = 0; max <= 40; max++) for (let v = -2; v <= max + 2; v++) {
  ok(J(H.hpState(v, max)) === J(hpState(v, max)), `hpState(${v}, ${max})`);
  ok(J(H.hpLevel(v, max)) === J(hpLevel(v, max)), `hpLevel(${v}, ${max})`);
}
// every state's Font Awesome icon has the terminal's own (ENS_ICON), and that icon is in icons.json
const icons = JSON.parse(termSrc("icons.json"));
const map = /const ENS_ICON = (\{[^}]*\})/.exec(src)?.[1];
const ENS_ICON = map && vm.runInNewContext(`(${map})`, {});
for (const [k, s] of Object.entries(HP_STATES)) ok(ENS_ICON && ENS_ICON[s.icon] && icons[ENS_ICON[s.icon]], `state ${k}: icon ${s.icon} → the terminal's icon`);
// the chip's tooltip as Foundry's template («Стан ворога»); the perk found by the same pattern as observantUser()
ok(modSrc("templates/actor/enemy.hbs").includes('title="Стан ворога"') && src.includes('title="Стан ворога"'), "the chip's tooltip «Стан ворога»");
ok(modSrc("module/sheets/enemy-sheet.mjs").includes("/^Спостережливість/") && termSrc("sync.js").includes("/^Спостережливість/"), "«Спостережливість» found by the same pattern");

// The log online (4.3 in the log, 2026-11-25): the GM's full entry carries Foundry's chip «Доглядачу» («Бачить лише Доглядач»,
// apply-damage.mjs postSplit); players get the short one with the state's word (trLogSplit)
const ad = modSrc("module/applications/apply-damage.mjs");
ok(ad.includes('title="Бачить лише Доглядач"') && ad.includes("Доглядачу</span>") && src.includes('<span title="Бачить лише Доглядач">') && src.includes("<i>Доглядачу</i>"), "the GM's entry: the chip «Доглядачу» of postSplit");
ok(src.includes("ENS.hpState(u.hp, u.maxHp).label"), "the short entry: the state's word from the copy of hpState");

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`enemy-state-html: OK (${checks} checks)`);
