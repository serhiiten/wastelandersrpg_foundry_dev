// «Уникнення шкоди» bound to an enemy's attack (A1; author, 2026-11-20; module/rules/dodge.mjs): the attribute by damage type,
// the verdict's result (wiki «Стандартні дії»), the rows of a record and the answers that fit them.
// Run: node tests/dodge.test.mjs
import * as D from "../module/rules/dodge.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// the wiki: ВП from physical damage, ІН from psychic, ВТР from radiation and poisons
eq(["phys", "laser", "fire", "cryo", "electric"].map(D.dodgeAttr), ["VP", "VP", "VP", "VP", "VP"], "physical and energy → ВП");
eq(D.dodgeAttr("psi"), "IN", "psychic → ІН");
eq([D.dodgeAttr("poison"), D.dodgeAttr("rad")], ["VTR", "VTR"], "poison, radiation → ВТР");

// 9− full, 10–14 half, 15+ none
eq([0, 1, 2, 3].map(D.dodgeOutcome), ["full", "half", "none", "none"], "the verdicts' results");

// the rows: one an actor, its hits merged
const rows = D.pendRows([
  { uuid: "Scene.s.Token.a", actor: "Actor.v", name: "Волті", hits: [0] },
  { uuid: "Actor.v", actor: "Actor.v", name: "Волті", hits: [1] },
  { uuid: "Scene.s.Token.b", actor: "Actor.b", name: "Бабай" },
]);
eq(Object.keys(rows), ["r0", "r1"], "one row an actor");
eq(rows.r0.hits, [0, 1], "the same actor's hits merged");
eq([rows.r0.status, rows.r1.status, rows.r1.hits], ["wait", "wait", [0]], "rows start waiting, one hit by default");

// the answers
const w = rows.r0;
let a = D.answerRow(w, { op: "rolled", verdict: 2 });
eq([a.row.status, a.deal], ["none", null], "15–18 closes the row by itself, nothing dealt");
a = D.answerRow(w, { op: "rolled", verdict: 3 });
eq(a.row.status, "none", "19+ closes too");
ok(/Посиленням/.test(D.rowText(a.row)), "19+ reminds of the aspect with a free invoke");
a = D.answerRow(w, { op: "rolled", verdict: 1 });
eq([a.row.status, a.row.verdict, a.deal], ["rolled", 1, null], "10–14 waits for the button");
const up = D.answerRow(a.row, { op: "rolled", verdict: 2 });
eq(up.row.status, "none", "an aspect after the roll lifts it to 15+: closed, nothing dealt");
const ap = D.answerRow(a.row, { op: "apply" });
eq([ap.row.status, ap.deal], ["half", "half"], "the button on 10–14: half");
eq(D.answerRow(D.answerRow(w, { op: "rolled", verdict: 0 }).row, { op: "apply" }).deal, "full", "the button on 9−: full");
eq(D.answerRow(w, { op: "apply" }), null, "no button before a roll");
eq([D.answerRow(w, { op: "take" }).deal, D.answerRow(w, { op: "gm" }).row.by], ["full", "gm"], "«Прийняти» and «Без уникнення»: full");
eq(D.answerRow(w, { op: "cancel" }).deal, null, "«Скасувати»: nothing dealt");
eq(D.answerRow(ap.row, { op: "gm" }), null, "a closed row takes no answer (a second press, a late request)");
eq(D.answerRow(w, { op: "bogus" }), null, "an unknown answer does nothing");
eq(D.answerRow(w, { op: "rolled" }), null, "a roll without a verdict does nothing");

// the menu's states land only with the damage (author, 2026-11-20)
eq([D.statesLand("full"), D.statesLand("half"), D.statesLand(null)], [true, true, false], "states with the damage only");

// open rows, totals
const pend = { hits: [{ data: { total: 9 } }, { data: { total: 4 } }], rows: { r0: { ...w, hits: [0, 1] }, r1: { ...rows.r1, status: "none" } } };
eq(D.openRows(pend).map(([id]) => id), ["r0"], "open rows");
eq(D.rowTotal(pend, pend.rows.r0), 13, "a row's total over its hits");
{
  const two = { hits: [{ data: { total: 3 } }, { data: { total: 3 } }], rows: { r0: { hits: [0, 1] } } };
  eq(D.rowDeal(two, two.rows.r0, 1).n, 4, "10–14: each part halved and rounded up (2 + 2)");
  eq(D.rowDeal(two, two.rows.r0, 0).label, "Отримати повну шкоду: 6", "9−: the full damage");
  const h = { half: true, hits: [{ data: { total: 12 } }], rows: { r0: { hits: [0] } } };
  eq(D.rowDeal(h, h.rows.r0, 1).label, "Отримати: 0 (½ + ½)", "the menu's ½ with 10–14: nothing");
  eq(D.rowDeal(h, h.rows.r0, 0).label, "Отримати половину: 6", "the menu's ½ with 9−: half");
}
ok(D.rowText({ status: "wait" }).includes("чекає"), "waiting row's text");

console.log(`dodge: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
