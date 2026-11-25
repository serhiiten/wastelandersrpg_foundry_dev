// The caravan's money in the HTML sheet (stage 6в of the backport, 2026-11-25; A3, A13) is a hand-written copy of Foundry's:
// rowKey, rowCost, salePlan (caravan-adapter.mjs), IMP_PRICE, impCost (caravan-controller.mjs) and spendText (spend-ask.mjs,
// the question «Списати N(к) з бюджету?»). Fable's verdict: copies, no arithmetic of their own — this binds them on a grid.
// Run: node tests/caravan-trade-html.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { rowCost, rowKey, rowSale, salePlan } from "../module/rules/caravan-adapter.mjs";
import { IMP_PRICE, impCost } from "../module/rules/caravan-controller.mjs";
import { needSiblings } from "./sibling.mjs";

// spend-ask.mjs escapes with Foundry's helper; the same five characters as the sheet's esc()
globalThis.foundry = { utils: { escapeHTML: (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]) } };
const { spendText } = await import("../module/applications/spend-ask.mjs");

let failures = 0;
let checks = 0;
needSiblings(["pustelnyky-caravan/src/caravan.src.html"]);
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 12) console.log("FAIL", m); } };

/** The sheet's helpers (int, esc), its rowSale and the block of the copies, run on their own */
function sheetCopies() {
  const src = readFileSync(new URL("../../pustelnyky-caravan/src/caravan.src.html", import.meta.url), "utf8");
  const line = (re, what) => { const m = src.match(re); if (!m) throw new Error(`caravan sheet: ${what} not found`); return m[0]; };
  const block = (from, to, what) => {
    const a = src.indexOf(from);
    const b = src.indexOf(to, a);
    if (a < 0 || b < 0) throw new Error(`caravan sheet: ${what} not found`);
    return src.slice(a, b);
  };
  const code = [
    line(/const int = \(v, def = 0\) => .*;/, "int"),
    line(/const esc = s => .*;/, "esc"),
    block("function rowSale(r) {", "// Вантаж страждає", "rowSale"),
    block("const rowKey = ", "/* ================= Стан", "the copies (rowKey … spendText)"),
  ].join("\n");
  return vm.runInNewContext(code + "\n({ rowKey, rowCost, salePlan, IMP_PRICE, impCost, spendText })", {});
}
const H = sheetCopies();
const J = (v) => JSON.stringify(v);

ok(H.IMP_PRICE === IMP_PRICE, `IMP_PRICE ${H.IMP_PRICE} / Foundry ${IMP_PRICE}`);

// cargo rows: kinds, prices and quantities as typed (text, empty, negative, broken), the ticks, bought or not
const prices = ["", "0", "1", "3", "5", "7", "12", "-4", "2.5", "abc", 9, null, undefined];
const qtys = ["", "0", "1", "2", "3", "10", "-1", "x", 4, null, undefined];
const rows = [];
for (const kind of ["cargo", "pass", undefined]) for (const price of prices) for (const qty of qtys) for (const t of [0, 1, 2, 3, 4, 7]) {
  const r = { kind, name: t % 2 ? "Вода" : "", price, qty, note: "" };
  if (t & 1) r.far = true;
  if (t & 2) r.hurt = true;
  if (t & 4) r.unpaid = true;
  rows.push(r);
}
for (const r of rows) {
  ok(H.rowCost(r) === rowCost(r), `rowCost(${J(r)}) = ${H.rowCost(r)}, Foundry ${rowCost(r)}`);
  ok(H.rowKey(r) === rowKey(r), `rowKey(${J(r)}) = ${H.rowKey(r)}, Foundry ${rowKey(r)}`);
}

// sale plans over lists of rows: one row by index (in and out of the list) and «Продати все»
const pickRows = (seed, n) => Array.from({ length: n }, (_, k) => rows[(seed * 7919 + k * 104729) % rows.length]);
for (let seed = 0; seed < 400; seed++) {
  const S = { cargo: pickRows(seed, seed % 9) };
  for (const q of [{ all: true }, { i: -1 }, { i: 0 }, { i: 1 }, { i: 3 }, { i: 8 }, {}]) {
    const got = J(H.salePlan(S, q));
    const want = J(salePlan(S, q));
    ok(got === want, `salePlan(${J(S.cargo)}, ${J(q)}) = ${got}, Foundry ${want}`);
  }
}
ok(J(H.salePlan({}, { all: true })) === J(salePlan({}, { all: true })), "salePlan of a caravan without cargo");
// rowSale is bound by tests/caravan-sale.test.mjs; the plan's sums use it
ok(J(H.salePlan({ cargo: rows.slice(0, 50) }, { all: true }).rows.map((r) => r.sum)) === J(salePlan({ cargo: rows.slice(0, 50) }, { all: true }).rows.map((r) => r.sum)), "plan sums");
void rowSale;

// improvements: every level of every count, clicked up and down, and a new custom one (id null)
for (const impCount of [0, 1, 2, 3, 4, 5, 8]) for (const cur of [0, 1, 2, 3, undefined, "2"]) for (const k of [0, 1, 2, "1", "x"]) for (const id of ["structure", "feed", null, "nope"]) {
  const S = { imp: id && cur !== undefined ? { [id]: cur } : {} };
  const got = H.impCost(S, impCount, id, k);
  const want = impCost(S, impCount, id, k);
  ok(got === want, `impCost(${J(S)}, ${impCount}, ${id}, ${J(k)}) = ${got}, Foundry ${want}`);
}
ok(H.impCost({}, 2, null, 0) === IMP_PRICE && impCost({}, 2, null, 0) === IMP_PRICE, "the third improvement costs 25(к)");

// the question's text: a row (price × quantity), an improvement, short and enough budget, names to escape
for (const what of ["", "«Вода» ×2", "«Посилена конструкція»", "<b>&'\""]) for (const cost of [0, 1, 10, 25, 50]) for (const have of [0, 5, 10, 25, 99]) for (const [unit, qty] of [[0, 1], [5, 2], [5, 1], [0, 3], [undefined, undefined]]) {
  const o = { what, cost, have, unit, qty };
  if (unit === undefined) { delete o.unit; delete o.qty; }
  const got = J(H.spendText(o));
  const want = J(spendText(o));
  ok(got === want, `spendText(${J(o)}) = ${got}, Foundry ${want}`);
}
ok(J(H.spendText()) === J(spendText()), "spendText() with no arguments");

console.log(failures ? `caravan-trade-html: ${failures} of ${checks} failed` : `caravan-trade-html OK (${checks} checks)`);
if (failures) process.exit(1);
