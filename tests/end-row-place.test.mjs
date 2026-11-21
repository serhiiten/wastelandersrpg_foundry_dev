// The GM's end buttons: in the top row when they fit, under the plates only when they would cross a panel on the right
// (module/helpers/end-row-place.mjs; author, 2026-11-21). Run: node tests/end-row-place.test.mjs
import { endRowPlace, crosses } from "../module/helpers/end-row-place.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const box = (left, top, right, bottom) => ({ left, top, right, bottom });

// measured live 2026-11-21: plates 312–544 at 16–48, buttons 348 wide, 28 high, with the strip 63
const plates = box(312, 16, 544, 48), row = { width: 348, height: 63, btnHeight: 28 };
// 1440×900, sidebar folded: «Битва» from 1044 — top row
ok(endRowPlace(plates, row, [box(1044, 16, 1384, 463), box(1392, 0, 1440, 900)]) === "top", "1440, sidebar folded: top row");
// 1366×768, sidebar open: «Битва» from 670 — under the plates
ok(endRowPlace(plates, row, [box(670, 16, 1010, 463), box(1018, 0, 1366, 768)]) === "below", "1366, sidebar open: below");
// 1366, sidebar folded: «Битва» from 970 — 552 + 348 = 900, top row
ok(endRowPlace(plates, row, [box(970, 16, 1310, 463)]) === "top", "1366, sidebar folded: top row");
// a panel dragged low, under the row's height: no conflict
ok(endRowPlace(plates, row, [box(700, 200, 1040, 500)]) === "top", "a panel below the row doesn't count");
// the strip counts: a panel starting just under the buttons but within the strip
ok(endRowPlace(plates, row, [box(700, 60, 1040, 300)]) === "below", "the strip's room counts");
// a hidden panel (no size) doesn't count; touching edges don't cross
ok(endRowPlace(plates, row, [box(0, 0, 0, 0), null]) === "top", "empty panels ignored");
ok(!crosses(box(0, 0, 10, 10), box(10, 0, 20, 10)), "touching edges don't cross");
ok(crosses(box(0, 0, 12, 10), box(10, 0, 20, 10)), "2 px overlap crosses");

console.log(`end-row-place: ${checks - failures}/${checks} ok`);
if (failures) process.exit(1);
