// The HTML terminal's copies of «Ходи Доглядача» (4.1) and «Зроби хід проти X» (U4, row 6.19; HTML backport stage 4,
// 2026-11-25). The terminal's gm_moves.js keeps word-for-word copies between marks: the moves of applications/gm-moves.mjs,
// rules/gm-move-alert.mjs, the pure part of applications/gm-move-alert-ui.mjs, and the check types' names and result texts of
// rules/logic.mjs (CHECK_TYPES, VERDICTS: the GM's side reads the result text the way check-panel.mjs does, T.d[verdict]).
// This binds the copies to Foundry, runs them against Foundry's functions, and checks the page's wiring (the plate's words, the
// «Доглядачу» chip, the sheet's check event, the online chk). Run: node tests/gm-moves-html.test.mjs
import vm from "node:vm";
import * as M from "../module/applications/gm-moves.mjs";
import * as A from "../module/rules/gm-move-alert.mjs";
import { moveAction, moveRecord, gmMoveCardHtml } from "../module/applications/gm-move-alert-ui.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { hasTerminal, termSrc, modSrc, unexport, marked, lines } from "./html-copy.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 20) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);

if (!hasTerminal("gm_moves.js")) { console.log("gm-moves-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const src = termSrc("gm_moves.js");

// ---- the copies, text for text
const fMoves = unexport(lines(modSrc("module/applications/gm-moves.mjs"), "/** When the GM makes a move", "let card = null;"));
ok(marked(src, "gm-moves") === fMoves, "gm_moves.js «gm-moves» differs from gm-moves.mjs (copy it again, without «export »)");
const fAlert = unexport(lines(modSrc("module/rules/gm-move-alert.mjs"), "/** Does the result's text"));
ok(marked(src, "gm-move-alert") === fAlert, "gm_moves.js «gm-move-alert» differs from rules/gm-move-alert.mjs");
const uiL = modSrc("module/applications/gm-move-alert-ui.mjs").split("\n");
const u0 = uiL.findIndex((l) => l.startsWith(" * What the active GM does")) - 1;
const u1 = uiL.findIndex((l) => l.startsWith("/* ---------------- the plate's glow"));
ok(u0 > 0 && uiL[u0] === "/**" && u1 > u0, "gm-move-alert-ui.mjs: the copied part found");
ok(marked(src, "gm-move-alert-ui") === unexport(uiL.slice(u0, u1).join("\n")), "gm_moves.js «gm-move-alert-ui» differs from gm-move-alert-ui.mjs");
const esc = uiL.find((l) => l.startsWith("const esc = "));
ok(src.includes(`// == gm-move-alert: кінець копії ==\n${esc}\n// == gm-move-alert-ui: копія ==`), "gm_moves.js: the escape of gm-move-alert-ui.mjs, word for word, before its copy");

// ---- the check types' names and result texts = logic.mjs
const L = createLogic({});
const H = vm.runInNewContext([marked(src, "gm-moves"), marked(src, "gm-move-alert"), esc, marked(src, "gm-move-alert-ui"), marked(src, "check-texts")].join("\n")
  + "\n({ GM_MOVE_WHEN, GM_MOVE_GROUPS, GM_MOVE_NOTE, gmMovesHtml, asksMove, checkFlag, rollKey, moveAction, moveRecord, gmMoveCardHtml, CHECK_TEXTS, VERDICTS })", {});
ok(J(Object.keys(H.CHECK_TEXTS)) === J(Object.keys(L.CHECK_TYPES)), `the check types: ${J(Object.keys(H.CHECK_TEXTS))}`);
for (const [k, T] of Object.entries(L.CHECK_TYPES)) ok(H.CHECK_TEXTS[k]?.n === T.n && J(H.CHECK_TEXTS[k]?.d) === J(T.d ?? null), `check type ${k}: name and results as logic.mjs`);
ok(J(H.VERDICTS) === J(L.VERDICTS), "VERDICTS as logic.mjs");
const moveTypes = Object.entries(L.CHECK_TYPES).filter(([, T]) => (T.d || []).some(A.asksMove)).map(([k]) => k).sort();
ok(J(moveTypes) === J(["advantage", "attack", "learn", "overcome"]), `types whose results ask for a move: ${J(moveTypes)}`);

// ---- the copies behave as Foundry's
ok(H.gmMovesHtml() === M.gmMovesHtml(), "gmMovesHtml");
ok(J(H.GM_MOVE_WHEN) === J(M.GM_MOVE_WHEN) && J(H.GM_MOVE_GROUPS) === J(M.GM_MOVE_GROUPS) && H.GM_MOVE_NOTE === M.GM_MOVE_NOTE, "the moves' data");
const texts = [...Object.values(L.CHECK_TYPES).flatMap((T) => T.d || []), ...L.EXPLOSIVE_D, "", null, "Доглядач робить ходи", "Доглядач може зробити проти тебе хід."];
for (const t of texts) ok(H.asksMove(t) === A.asksMove(t), `asksMove: ${String(t).slice(0, 50)}`);
let n = 0;
for (const [type, T] of Object.entries(L.CHECK_TYPES)) for (let v = 0; v < 4; v++) for (const name of ["Ліза", "<i>X</i> & Y"]) {
  const o = { actor: "12", name, type, typeName: T.n, verdict: v, verdictName: L.VERDICTS[v], total: 9 + v * 4, time: 1700 + n++, text: T.d?.[v] ?? "" };
  const f = A.checkFlag(o), h = H.checkFlag(o);
  ok(J(f) === J(h) && A.rollKey(f) === H.rollKey(h), `checkFlag ${type} ${v}`);
  for (const open of [false, true]) ok(moveAction(f, open) === H.moveAction(h, open), `moveAction ${type} ${v} ${open}`);
  const r = moveRecord(f), rh = H.moveRecord(h);
  ok(J(r) === J(rh), `moveRecord ${type} ${v}`);
  for (const chips of ["", "<chip>"]) for (const done of [null, { verdictName: "Успіх" }])
    ok(gmMoveCardHtml({ ...r, done }, chips) === H.gmMoveCardHtml({ ...rh, done }, chips), `gmMoveCardHtml ${type} ${v} ${chips} ${!!done}`);
}
ok(H.moveAction(null, false) === null && H.moveAction({ actor: "1", time: 0, move: true }, false) === null, "no check / no key: nothing");

// ---- the page's wiring
const tpl = termSrc("template.html");
const plate = modSrc("module/wastelanders.mjs");
ok(/moves\.setAttribute\("aria-label", "Ходи Доглядача"\)/.test(plate) && /<\/i> Ходи`;/.test(plate), "Foundry's plate: «Ходи», aria-label «Ходи Доглядача»");
ok(tpl.includes('id="hd-moves" aria-expanded="false" aria-label="Ходи Доглядача"') && tpl.includes('{{I:fire}}<span class="hd-l">Ходи</span></button>'), "template.html: the button «Ходи» with the same names");
const chip = modSrc("module/applications/states.mjs").match(/export const GM_CHIP = `(.*)`;/)[1];
ok(src.includes(`const GMM_CHIP = \`${chip}\``), "gm_moves.js: the «Доглядачу» chip = states.mjs GM_CHIP");
const cg = termSrc("cg.js");
ok(/syLogChk\(chk, \(\)=>syLogPublic\(/.test(cg) && /gmMoveCheck\(chk\)/.test(cg) && /type: String\(d\.type \|\| ''\), verdict: \+d\.verdict/.test(cg), "cg.js: the sheet's check goes to gmMoveCheck and, from a player online, as chk");
const sy = termSrc("sync.js");
ok(/const SY_PROTO = 5\b/.test(sy) && /doc\.chk = /.test(sy) && /chkNew\.reverse\(\)\.forEach\(gmMoveCheck\)/.test(sy) && /Object\.hasOwn\(GMM\.CHECK_TEXTS, c\.type\)/.test(sy), "sync.js: SY_PROTO 5, chk written by players, read by the GM, the type checked by hasOwn");

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`gm-moves-html: OK (${checks} checks)`);
