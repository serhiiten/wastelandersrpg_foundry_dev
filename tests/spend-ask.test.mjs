// «Списати N(к) з бюджету?» (author, 2026-11-22; 4.7): the receipt's text — spendText is pure but for Foundry's escapeHTML
globalThis.foundry = { utils: { escapeHTML: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") } };
const { spendText } = await import("../module/applications/spend-ask.mjs");

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log("FAIL " + m); } };
const txt = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// a cargo row of two: price × quantity, «Разом», the budget after
let t = spendText({ what: "«Вода» ×2", cost: 10, have: 12, unit: 5, qty: 2 });
ok(!t.short, "enough: not short");
ok(txt(t.html) === "«Вода» ×2 5(к) × 2 Разом 10(к) Бюджет 12 → 2(к) Списати 10(к) з бюджету?", `two: ${txt(t.html)}`);
// short: what is lacking, no «after»
t = spendText({ what: "«Набої 10мм» ×4", cost: 12, have: 8, unit: 3, qty: 4 });
ok(t.short && /pust-spend-short/.test(t.html), "short: flagged");
ok(/Бюджет 8\(к\): бракує 4\(к\)/.test(txt(t.html)) && !/→/.test(t.html), `short: ${txt(t.html)}`);
// one thing / an improvement: its price on the line, no «Разом»
t = spendText({ what: "«Броньовані борти»", cost: 25, have: 30 });
ok(txt(t.html) === "«Броньовані борти» 25(к) Бюджет 30 → 5(к) Списати 25(к) з бюджету?", `one: ${txt(t.html)}`);
ok(!/Разом/.test(t.html), "one: no «Разом»");
// no name; the name is escaped
ok(/без назви/.test(spendText({ cost: 25, have: 30 }).html), "no name");
ok(!/<script>/.test(spendText({ what: "<script>", cost: 1, have: 1 }).html), "escaped");

if (failures) { console.log(`${failures} failures`); process.exit(1); }
console.log("spend-ask: OK");
