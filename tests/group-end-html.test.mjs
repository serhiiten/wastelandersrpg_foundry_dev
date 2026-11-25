// The HTML terminal's group «Кінець сцени» / «Новий день» / «Кінець сесії» (row 5.4 of the HTML backport, Fable's verdict
// 2026-11-25). The terminal's group_end.js keeps word-for-word copies of rules/group-end.mjs (GROUP_END, ownPart), of
// applications/group-end.mjs `sentences`, of battle-panel.mjs END_KINDS and the values of rules/states.mjs STATE_ASPECTS /
// rules/cover.mjs COVER_PREFIX, and draws Foundry's endCard in its own markup (span / b / i / svg with classes: online the
// players' pages keep only those). The rules themselves stay in the character sheet: the bridge's CG_END runs the very line of
// the sheet's buttons (cg_build.py takes it from app.js). This binds the copies, the words of the header row, and runs
// Foundry's endCard and the terminal's geCardHtml on a grid: the same words in the same order, the same tooltips.
// Run: node tests/group-end-html.test.mjs
import vm from "node:vm";
import { GROUP_END, ownPart } from "../module/rules/group-end.mjs";
import { STATE_ASPECTS } from "../module/rules/states.mjs";
import { COVER_PREFIX } from "../module/rules/cover.mjs";
import { hasTerminal, termSrc, modSrc, unexport, marked, lines } from "./html-copy.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 20) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);

if (!hasTerminal("group_end.js")) { console.log("group-end-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const src = termSrc("group_end.js");
const rules = modSrc("module/rules/group-end.mjs"), app = modSrc("module/applications/group-end.mjs"), panel = modSrc("module/applications/battle-panel.mjs");

// ---------- the copies, word for word
ok(marked(src, "group-end") === unexport(lines(rules, "/** kind → ", "/** An enemy's moves")), "group_end.js «group-end» differs from rules/group-end.mjs GROUP_END / ownPart (copy them again, without «export »)");
ok(marked(src, "group-end-sentences") === lines(app, "/** The text split into sentences", "/**").replace(/\s+$/, ""), "group_end.js «group-end-sentences» differs from applications/group-end.mjs sentences");
ok(marked(src, "group-end-kinds") === lines(panel, "const END_KINDS = [", "/** the top rows").replace(/\s+$/, ""), "group_end.js «group-end-kinds» differs from battle-panel.mjs END_KINDS");
const C = vm.runInNewContext(marked(src, "group-end") + "\n" + marked(src, "group-end-sentences") + "\n" + marked(src, "group-end-kinds") + "\n" + marked(src, "state-aspects")
  + "\n({ GROUP_END, ownPart, sentences, END_KINDS, STATE_ASPECTS, COVER_PREFIX })", {});
ok(J(C.GROUP_END) === J(GROUP_END), "the copy's GROUP_END");
ok(J(C.STATE_ASPECTS) === J(STATE_ASPECTS), `the copy's STATE_ASPECTS = rules/states.mjs (${J(C.STATE_ASPECTS)})`);
ok(C.COVER_PREFIX === COVER_PREFIX, "the copy's COVER_PREFIX = rules/cover.mjs");
for (const t of ["", "Кінець сцени. Сценові ефекти скинуто.", "День 4. Лічильники стимпаків і порошку скинуто, можна знову відпочити; закінчилася дія: Ментати. Кінець сцени. Сценові ефекти скинуто. Аспекти зникли: «Палає».",
  "Кінець сесії 2. Жетони Долі відновлено до 3. Кінець сцени. Суперстимпак: 2d6 = 3 + 4 = 7 шкоди, що ігнорує броню."]) ok(C.ownPart(t) === ownPart(t), `ownPart «${t}»`);

// ---------- the header row (template.html) and the toasts: Foundry's words
const tpl = termSrc("template.html");
for (const [kind, , text, title] of C.END_KINDS) {
  ok(tpl.includes(`data-ge="${kind}" title="${title}. Натисни двічі">`), `template.html: «${text}» with Foundry's tooltip + «. Натисни двічі»`);
  ok(new RegExp(`data-ge="${kind}"[^>]*>\\{\\{I:[a-z]+\\}\\}<span>${text}</span>`).test(tpl), `template.html: the button says «${text}»`);
}
const tick = panel.match(/<label class="pust-end-mv" title="([^"]+)"><input type="checkbox" data-end-moves [^>]*> ([^<]+)<\/label>/);
ok(tick && tpl.includes(`<label class="tr-end-mv" title="${tick[1]}"><input type="checkbox" id="tr-end-mv"> ${tick[2]}</label>`), "template.html: the tick «Скинути ходи ворогів сцени», unchecked, Foundry's tooltip");
const reset = panel.match(/class="pust-end-reset" data-end="sessreset" title="([^"]+)" aria-label="([^"]+)"/);
ok(reset && tpl.includes(`data-ge="reset" title="${reset[1]}" aria-label="${reset[2]}"`), "template.html: ⟲ with Foundry's tooltip and aria-label");
const T = vm.runInNewContext(src.slice(src.indexOf("  var GE_T = {"), src.indexOf("\n  }\n", src.indexOf("  var GE_T = {")) + 4) + "\nGE_T", {});
const foundry = panel + app;
for (const k of ["sure", "twice", "moves", "movesTip", "sessTip", "sessNone", "resetTip", "resetAria", "resetArm", "resetDone", "bad", "gone"]) ok(foundry.includes(T[k]), `GE_T.${k} «${T[k]}» is Foundry's`);
ok(termSrc("tracker.js").includes(`trToast('${T.none}')`), "GE_T.none is the terminal's own toast of «fateset»");
ok(src.includes("${def.title}: ${n} ${n === 1 ? 'персонаж' : n < 5 && n > 1 ? 'персонажі' : 'персонажів'}. Коло дій 1, жетонів Долі Доглядача: ${fate}.")
  && app.includes('`${def.title}: ${chars.length} ${chars.length === 1 ? "персонаж" : chars.length < 5 && chars.length > 1 ? "персонажі" : "персонажів"}. Коло дій 1${fate != null ? `, жетонів Долі Доглядача: ${Math.max(0, fate)}` : ""}.`'),
  "the closing toast is Foundry's notification");

// ---------- the build: group_end.js in TRK, the bridge's CG_END from the sheet's own button line
ok(/\(SP \/ 'gm_moves\.js'\)\.read_text\(encoding='utf-8'\) \+ '\\n' \+ \(SP \/ 'group_end\.js'\)/.test(termSrc("build.py")), "build.py puts group_end.js into TRK after gm_moves.js");
const cgb = termSrc("cg_build.py");
ok(cgb.includes("case 'chem-scene': case 'chem-day': case 'chem-session': (.+?) break;") && cgb.includes('END_M[0] == "chemAct(a,b); sceneEndSheet();"') && cgb.includes("window.CG_END = function(kind, json)"), "cg_build.py: CG_END runs the sheet's button line taken from app.js");
const sheetApp = new URL("../../pustelnyky-character-generator/src/app.js", import.meta.url);
try {
  const a = (await import("node:fs")).readFileSync(sheetApp, "utf8");
  ok(a.includes("    case 'chem-scene': case 'chem-day': case 'chem-session': chemAct(a,b); sceneEndSheet(); break;"), "the sheet's app.js: the button line CG_END runs");
} catch (_) { console.log("group-end-html: the sheet's app.js not found, its line not checked"); }

// ---------- the card: Foundry's endCard and the terminal's geCardHtml, words and tooltips in order
const a0 = app.indexOf("function endCard("), a1 = app.indexOf("\n}\n", a0);
ok(a0 > 0 && a1 > a0, "group-end.mjs: endCard found");
const escF = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const endCard = vm.runInNewContext(`(${app.slice(a0, a1 + 2)})`, { esc: escF });
const g0 = src.indexOf("  function geCardHtml("), g1 = src.indexOf("\n  }\n", g0);
ok(g0 > 0 && g1 > g0, "group_end.js: geCardHtml found");
const geCardHtml = vm.runInNewContext(`(${src.slice(g0, g1 + 4).trim()})`, { PI: () => "", escHtml: escF, GE_ICON: { scene: "flag", day: "sun", session: "moon" } });
const words = (h) => h.replace(/<[^>]+>/g, "\n").split("\n").map((s) => s.trim()).filter(Boolean);
const titles = (h) => [...h.matchAll(/title="([^"]*)"/g)].map((m) => m[1]);
const rowSets = [
  [],
  [{ name: "Міккі <Ракета>", img: "x.png", items: [], hp: 0, hpNow: 12, fd0: 3, fd: 3 }],
  [{ name: "Міккі", img: "x.png", items: ["Жетони Долі відновлено до 3.", "Знову можна застосувати: «Залізячник»."], hp: -7, hpNow: 5, fd0: 0, fd: 3 },
   { name: "Без аркуша", items: ["Закінчилася дія: Психо.", "Аспекти зникли: «Збитий з ніг»."], hp: 4, hpNow: 14, fd0: 2, fd: 2 },
   { name: "Зіпсований", items: ["Не вдалося застосувати: аркуш пошкоджений."], bad: true, hp: 0, fd0: 1, fd: 1 },
   { name: "Протектрон & Ко", items: ["Аспекти зникли: «Палає», «На прицілі»."], hp: 0 }],
];
let n = 0;
for (const kind of Object.keys(GROUP_END)) for (const rows of rowSets) for (const movesN of [null, 0, 2]) for (const gm of [false, true]) {
  if (gm && movesN != null) continue;
  const f = endCard(kind, GROUP_END[kind], rows, movesN, { gm }), h = geCardHtml(kind, GROUP_END[kind], rows, movesN, { gm });
  const tag = `${kind} rows ${rows.length} moves ${movesN} gm ${gm}`;
  ok(J(words(h)) === J(words(f)), `${tag}: the card's words\n  foundry  ${J(words(f))}\n  terminal ${J(words(h))}`);
  ok(J(titles(h)) === J(titles(f)), `${tag}: the tooltips ${J(titles(f))} / ${J(titles(h))}`);
  ok(h.includes(`gec-${kind}`) && (rows.some((r) => r.bad) ? /gec-row bad/.test(h) : !/gec-row bad/.test(h)), `${tag}: kind's class, the bad row's class`);
  ok(!/<(?!\/?(span|b|i|em|svg|path|br)\b)[a-z]/i.test(h) && !/\s(style|src|href|on\w+)=/i.test(h), `${tag}: only span / b / i / em / svg, no style / src / handlers (syClean)`);
  n++;
}
ok(n >= 30, `the grid ran (${n})`);

console.log(failures ? `FAIL (${failures} of ${checks})` : `OK (${checks})`);
if (failures) process.exit(1);
