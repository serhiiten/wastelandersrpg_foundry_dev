// U4 (author, 2026-11-21): a check whose result asks for the GM's move (rules/gm-move-alert.mjs) and what the active GM does
// with it (applications/gm-move-alert-ui.mjs): send «Зроби хід проти …», update it, or mark it done when the result improved.
// Run: node tests/gm-move-alert.test.mjs
import { asksMove, checkFlag, rollKey } from "../module/rules/gm-move-alert.mjs";
import { moveAction, moveRecord, gmMoveCardHtml } from "../module/applications/gm-move-alert-ui.mjs";
import fs from "node:fs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// the texts that ask for a move
ok(asksMove("У тебе не виходить, і настають наслідки фіаско. Доглядач робить проти тебе хід."), "робить проти тебе хід");
ok(asksMove("Ти досягаєш мети, але Доглядач може зробити хід."), "може зробити хід");
ok(!asksMove("Ти досягаєш мети."), "a success asks nothing");
ok(!asksMove("Доглядач робить ходи"), "not «ходи»");
ok(!asksMove(null), "no text");

const base = { actor: "Actor.abc", name: "Ліза", type: "skill", typeName: "Навичка", verdict: 1, verdictName: "Частковий успіх", total: 12, time: 1700, text: "Ти досягаєш мети, але Доглядач може зробити проти тебе хід." };
const f1 = checkFlag(base);
eq(f1.move, true, "partial success: a move");
eq(rollKey(f1), "Actor.abc|1700", "the roll's key");
const f2 = checkFlag({ ...base, verdict: 2, verdictName: "Успіх", total: 16, text: "Ти досягаєш мети." });
eq(rollKey(f2), rollKey(f1), "an aspect invoked: the same key");
eq(f2.move, false, "improved: no move");

// the decisions
eq(moveAction(f1, false), "send", "a move, no card yet: send");
eq(moveAction(f1, true), "update", "a move again on the same roll: update the card");
eq(moveAction(f2, true), "cancel", "improved: cancel the card");
eq(moveAction(f2, false), null, "no move, no card: nothing");
eq(moveAction(null, false), null, "not a check card");
eq(moveAction({ ...f1, time: 0 }, false), null, "no key: nothing");

// the card
const rec = moveRecord(f1);
eq([rec.key, rec.done], ["Actor.abc|1700", null], "the card's record");
let h = gmMoveCardHtml(rec, "<chip>");
ok(h.includes("fa-fire") && h.includes("Зроби хід проти Ліза"), "the title and icon");
ok(h.includes("Навичка: Частковий успіх (12)"), "the verdict line");
ok(h.includes("Доглядач може зробити проти тебе хід."), "the result's text");
ok(h.includes("<chip>") && !h.includes(" done"), "the chip; not done");
// «Твої ходи» (author, 2026-11-22, П5 5.2): under an open card, the whole width; a done card has none
ok(h.includes('data-pust-gmmoves="1"') && h.includes("Твої ходи") && h.indexOf("pust-gmmove-foot") > h.indexOf("pust-da-list"), "«Твої ходи» under the card");
ok((h.match(/<div/g) || []).length === (h.match(/<\/div>/g) || []).length, "open card: the divs are closed");
h = gmMoveCardHtml({ ...rec, done: { verdictName: "Успіх" } });
ok(h.includes("pust-gmmove done") && h.includes("Ліза покращує результат: Успіх. Хід не потрібен."), "done: the improved line");
ok(h.includes("Навичка: Частковий успіх (12)"), "done: the old line stays (struck through by CSS)");
ok(!h.includes("data-pust-gmmoves") && (h.match(/<div/g) || []).length === (h.match(/<\/div>/g) || []).length, "done: no «Твої ходи», the divs closed");
h = gmMoveCardHtml(moveRecord({ ...base, name: "<i>X</i>", text: "a & b" }));
ok(h.includes("&lt;i&gt;X&lt;/i&gt;") && h.includes("a &amp; b"), "escaped");

// the rules' result texts that name the GM's move are caught (logic.mjs: a guard against a wording change)
const src = fs.readFileSync(new URL("../module/rules/logic.mjs", import.meta.url), "utf8");
const texts = src.match(/[^'"`]*Доглядач (?:робить|може зробити)[^'"`]*хід[^'"`]*/g) ?? [];
ok(texts.length > 0, "logic.mjs has results naming the GM's move");
for (const t of texts) ok(asksMove(t), `caught: ${t.slice(0, 60)}`);

console.log(failures ? `gm-move-alert: ${failures} of ${checks} failed` : `gm-move-alert: OK (${checks} checks)`);
process.exit(failures ? 1 : 0);
