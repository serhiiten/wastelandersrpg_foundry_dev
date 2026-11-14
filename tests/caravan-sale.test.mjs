// The caravan's sale price and «вантаж постраждав» (author, 2026-11-14), the same in the HTML caravan sheet and Foundry:
//   normal delivery ×1.5, long ×2; damaged cargo ×1.25 / ×1.5; rounded up from the total;
//   the cargo suffers when the caravan takes MORE than half its HP of damage (half rounded up), as on the wiki.
// Run: node tests/caravan-sale.test.mjs
import { createCaravanLogic } from "../module/rules/caravan-logic.mjs";
import { buildCaravanView } from "../module/sheets/caravan-view.mjs";
import { loadHtmlCaravan } from "./caravan-sandbox.mjs";

let failures = 0;
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) { failures++; console.log(`FAIL ${msg}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); } };

const L = createCaravanLogic({ S: null });
const caravan = (val, longHaul = false, hp = null) => {
  const S = L.blankState();
  S.cargo = [{ name: "Вантаж", kind: "cargo", price: String(val), qty: "1", note: "" }];
  S.longHaul = longHaul;
  L.setS(S);
  if (hp != null) S.hpCurrent = hp;
  return S;
};
const sale = (val, longHaul) => { const S = caravan(val, longHaul); return L.salePrices(L.derived(S), S); };

// the four cases, a round and an odd price (rounding up)
eq(sale(10, false), { sale: 15, saleHurt: 13 }, "10(к), normal: ×1.5 / damaged ×1.25");
eq(sale(10, true), { sale: 20, saleHurt: 15 }, "10(к), long: ×2 / damaged ×1.5");
eq(sale(7, false), { sale: 11, saleHurt: 9 }, "7(к), normal: 10.5→11 / 8.75→9");
eq(sale(7, true), { sale: 14, saleHurt: 11 }, "7(к), long: 14 / 10.5→11");
eq(sale(0, true), { sale: 0, saleHurt: 0 }, "no cargo");

// «вантаж постраждав»: damage > ceil(max/2)
const hurt = (hp) => { const S = caravan(10, false, hp); return !!buildCaravanView(S, createCaravanLogic({ S })).repair?.hurt; };
const max = L.derived(caravan(10)).maxHP; // 25
eq(max, 25, "a blank caravan has 25 ОЗ");
eq(hurt(12), false, "25 ОЗ, damage 13 (= half rounded up): not yet");
eq(hurt(11), true, "25 ОЗ, damage 14: suffered");
eq(hurt(0), false, "ОЗ 0: destroyed, not «suffered»");

// the HTML caravan sheet counts the same
const H = loadHtmlCaravan();
for (const [val, lh] of [[10, false], [10, true], [7, false], [7, true]]) {
  const S = caravan(val, lh);
  H.setState(S);
  const got = H.api.salePrices(H.api.derived(H.api.getS()), H.api.getS());
  eq(got, L.salePrices(L.derived(S), S), `HTML sheet, ${val}(к)${lh ? ", long" : ""}`);
}

// Foundry (author, 2026-11-14): «далека» and «пошкоджено» are ticks of each cargo row; «Сума продажу» adds the rows up
const { rowSale, cargoHurtAt, stateToCaravan, caravanToState } = await import("../module/rules/caravan-adapter.mjs");
const { createCaravanController } = await import("../module/rules/caravan-controller.mjs");
const row = (price, qty, far, hurt) => ({ name: "x", kind: "cargo", price: String(price), qty: String(qty), note: "", ...(far ? { far } : {}), ...(hurt ? { hurt } : {}) });
eq(rowSale(row(7, 1)), 11, "row 7: ×1.5");
eq(rowSale(row(7, 1, true)), 14, "row 7, far: ×2");
eq(rowSale(row(7, 1, false, true)), 9, "row 7, damaged: ×1.25");
eq(rowSale(row(7, 1, true, true)), 11, "row 7, far + damaged: ×1.5");
eq(rowSale(row(3, 3)), 14, "3×3 = 9 → 13.5 → 14");
eq(rowSale({ kind: "pass", price: "5", qty: "1" }), 5, "a passenger: the fare as is");
eq([cargoHurtAt(12, 25), cargoHurtAt(11, 25), cargoHurtAt(0, 25)], [false, true, false], "cargoHurtAt: 25 ОЗ");

const S2 = L.blankState();
S2.cargo = [row(10, 1, true), row(10, 1, false, true), { name: "Мо", kind: "pass", price: "4", qty: "1", note: "" }];
const back = caravanToState(stateToCaravan(S2));
eq(back.cargo.map((r) => [!!r.far, !!r.hurt]), [[true, false], [false, true], [false, false]], "ticks survive the actor round trip");
const v2 = buildCaravanView(back, createCaravanLogic({ S: back }));
eq(v2.cargo.map((r) => [r.sum, r.hurt]), [[20, false], [13, true], [4, false]], "row sums in the view");
eq([v2.cargoSummary.sale, v2.cargoSummary.hurt], [33, true], "«Сума продажу» = cargo rows only, red when a row is damaged");

// the controller's ticks
const L3 = createCaravanLogic({ S: back });
const C3 = createCaravanController(L3, { toast() {} });
C3.setField("cargo.0.far", false);
C3.setField("cargo.1.hurt", false);
C3.setField("cargo.0.hurt", true);
eq(L3.getS().cargo.slice(0, 2).map((r) => [!!r.far, !!r.hurt]), [[false, true], [false, false]], "ticks set and cleared by hand");

// an HTML sheet .json with «Далека доставка» on: every cargo row gets the tick
const S4 = L.blankState();
S4.cargo = [row(10, 1), { name: "Мо", kind: "pass", price: "4", qty: "1", note: "" }];
S4.longHaul = true;
const back4 = caravanToState(stateToCaravan(S4));
eq([back4.longHaul, back4.cargo.map((r) => !!r.far)], [false, [true, false]], "the HTML sheet's long haul → each cargo row");

console.log(failures ? `FAIL (${failures})` : "OK");
if (failures) process.exit(1);
