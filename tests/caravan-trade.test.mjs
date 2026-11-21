// Money and karma that move by themselves (author, 2026-11-21; A3, A13, A14 of Fable's analysis):
//   A3  a cargo row added by hand is bought with «Купити за N(к)» (budget − price × quantity, or for free), then sold with
//       «Продати за N(к)» (×1,5 / ×2, damaged ×1,25 / ×1,5); «Продати все» sells every bought cargo row, no passengers;
//       a passenger's fare goes to the budget the same way; nothing is sold at ОЗ 0 (the cargo is destroyed)
//   A13 «Купити за N(к)» in the character's catalogue takes the price off the caps; an improvement past the two starting
//       ones costs 25(к)
//   A14 every change of the karma writes a card (+N green, −N red, the karmic aspect when it changes); Удача партії from
//       the УДЧ of the characters (wiki «Кістка Долі та Удача партії»)
// Run: node tests/caravan-trade.test.mjs
import { createCaravanLogic } from "../module/rules/caravan-logic.mjs";
import { createCaravanController, impCost, IMP_PRICE } from "../module/rules/caravan-controller.mjs";
import { caravanToState, rowCost, salePlan, stateToCaravan } from "../module/rules/caravan-adapter.mjs";
import { buildCaravanView } from "../module/sheets/caravan-view.mjs";
import { karmaCardHtml, saleCardHtml } from "../module/applications/caravan-trade.mjs";
import { partyLuckLine, partyLuckOf } from "../module/applications/party-luck.mjs";
import * as R from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { createController } from "../module/rules/controller.mjs";

let failures = 0, checks = 0;
const eq = (got, want, msg) => { checks++; if (JSON.stringify(got) !== JSON.stringify(want)) { failures++; console.log(`FAIL ${msg}: ${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`); } };
const ok = (v, msg) => eq(!!v, true, msg);

const caravan = (budget = 12) => {
  const L = createCaravanLogic({ S: null });
  const S = L.blankState();
  S.budget = budget;
  L.setS(S);
  const toasts = [];
  const C = createCaravanController(L, { toast: (m) => toasts.push(m) });
  return { L, C, S: () => L.getS(), toasts };
};

/* ---------- A3: buy ---------- */
{
  const { L, C, S, toasts } = caravan(12);
  C.act("addCargo");
  eq(S().cargo[0].unpaid, true, "a row added by hand is not bought yet");
  C.setField("cargo.0.name", "Набої"); C.setField("cargo.0.price", "5"); C.setField("cargo.0.qty", "2");
  eq(rowCost(S().cargo[0]), 10, "cost = price × quantity");
  let v = buildCaravanView(S(), L);
  eq([v.cargo[0].buy, v.cargo[0].sell], [10, 0], "not bought: «Купити за 10(к)», no «Продати»");
  eq(v.sellAll, 0, "«Продати все» skips rows not bought");
  eq(C.act("cg-sell", { i: "0" }), false, "a row not bought is not sold");
  eq(C.act("cg-buy", { i: "0", pay: "1" }), true, "bought");
  eq([S().budget, S().cargo[0].unpaid], [2, undefined], "budget 12 − 10 = 2, the row is bought");
  ok(toasts.includes("Списано 10(к) з бюджету"), "the toast names the price");
  v = buildCaravanView(S(), L);
  eq([v.cargo[0].buy, v.cargo[0].sell, v.sellAll], [0, 15, 15], "bought: «Продати за 15(к)» (10 × 1,5)");
  // the budget falls short: refused, nothing changes; «Ні, без списання»: bought for free
  C.act("addCargo"); C.setField("cargo.1.price", "8");
  eq(C.act("cg-buy", { i: "1", pay: "1" }), false, "8(к) with 2(к) in the budget: refused");
  eq([S().budget, S().cargo[1].unpaid], [2, true], "refused: nothing changed");
  eq(C.act("cg-buy", { i: "1", pay: "0" }), true, "«Ні, без списання»");
  eq([S().budget, S().cargo[1].unpaid], [2, undefined], "free: the budget stays, the row is bought");
  // «ще не куплено» survives the actor (normalize() of the shared rules keeps only the HTML keys)
  C.act("addCargo"); C.setField("cargo.2.price", "3");
  const actor = stateToCaravan(S());
  actor.items.forEach((it, k) => { it._id = `id${k}`; });
  const back = caravanToState(actor);
  eq(back.cargo.map((r) => !!r.unpaid), [false, false, true], "unpaid kept through the actor and back");
}

/* ---------- A3: sell ---------- */
{
  const { L, C, S, toasts } = caravan(0);
  const st = S();
  st.cargo = [
    { name: "Вода", kind: "cargo", price: "8", qty: "1", note: "", far: true },          // 16
    { name: "Набої", kind: "cargo", price: "5", qty: "2", note: "", hurt: true },        // 13 (12,5 ↑)
    { name: "Док", kind: "pass", price: "6", qty: "1", note: "" },                       // fare 6
    { name: "Нове", kind: "cargo", price: "4", qty: "1", note: "", unpaid: true },       // not bought
    { name: "", kind: "cargo", price: "", qty: "1", note: "" },                          // worth 0
  ];
  eq(salePlan(st, { all: true }).rows.map((r) => [r.name, r.sum]), [["Вода", 16], ["Набої", 13]], "«Продати все»: the bought cargo rows only");
  const v = buildCaravanView(st, L);
  eq(v.cargo.map((r) => r.sell), [16, 13, 6, 0, 0], "row buttons: sale price, fare, none");
  const fare = C.act("cg-sell", { i: "2" });
  eq([fare.total, fare.before, fare.after, fare.rows[0].pass], [6, 0, 6, true], "the fare to the budget");
  eq(S().cargo.map((r) => r.name), ["Вода", "Набої", "Нове", ""], "the passenger's row is gone");
  const all = C.act("cg-sell", { all: "1" });
  eq([all.total, all.before, all.after], [29, 6, 35], "«Продати все»: 16 + 13 to the budget");
  eq(S().cargo.map((r) => r.name), ["Нове", ""], "sold rows gone, the rest stay");
  eq(C.act("cg-sell", { all: "1" }), false, "nothing more to sell");
  ok(toasts.includes("Продавати нічого"), "…says so");
  // the card
  const html = saleCardHtml("Караван <Тест>", all);
  ok(html.includes("Караван &lt;Тест&gt;</b>: продаж вантажу"), "card head, the name escaped");
  ok(html.includes("+29(к)") && html.includes("Бюджет: 6 → <b>35(к)</b>"), "card total and budget");
  ok(html.includes("Вода <span class=\"pust-trade-tag far\">далека</span>") && html.includes("Набої ×2 <span class=\"pust-trade-tag hurt\">пошк.</span>"), "card rows with their ticks");
  ok(saleCardHtml("К", fare).includes(": плата за проїзд") && saleCardHtml("К", fare).includes("Пасажир: Док"), "the fare's card");
}
{
  // a double click on «Продати» (or the GM and a player at once): the second press is for a row already gone, and the row
  // that moved up into its place is not sold (the reviewer's finding, 2026-11-21)
  const { L, C, S } = caravan(0);
  S().cargo = [
    { name: "Вода", kind: "cargo", price: "4", qty: "1", note: "" },
    { name: "Сталь", kind: "cargo", price: "10", qty: "1", note: "" },
    { name: "Док", kind: "pass", price: "6", qty: "1", note: "" },
  ];
  const key = buildCaravanView(S(), L).cargo[0].key;
  ok(C.act("cg-sell", { i: "0", key }), "the first press sells «Вода»");
  eq(C.act("cg-sell", { i: "0", key }), false, "the second press of the same button sells nothing");
  eq([S().cargo.map((r) => r.name), S().budget], [["Сталь", "Док"], 6], "«Сталь» and «Док» stay, the budget only from «Вода»");
}
{
  // ОЗ 0: the cargo is destroyed, nothing to sell (players remove it themselves: author's decision on F3)
  const { L, C, S } = caravan(0);
  S().cargo = [{ name: "Вода", kind: "cargo", price: "8", qty: "1", note: "" }];
  S().hpCurrent = 0;
  eq(C.act("cg-sell", { all: "1" }), false, "ОЗ 0: no sale");
  const v = buildCaravanView(S(), L);
  eq([v.cargo[0].sell, v.sellAll], [0, 0], "ОЗ 0: no buttons");
}

/* ---------- A13: improvements, 25(к) past the first two ---------- */
{
  const { L, C, S } = caravan(60);
  eq(IMP_PRICE, 25, "an improvement costs 25(к)");
  eq(impCost(S(), 0, "structure", 0), 0, "the first improvement is free");
  C.act("imp", { id: "structure", k: "0" });
  C.act("imp", { id: "trunk", k: "0" });
  eq(L.derived().impCount, 2, "two starting improvements");
  eq(impCost(S(), 2, "brahmins", 0), 25, "the third costs 25(к)");
  eq(impCost(S(), 2, "trunk", 0), 0, "taking one off costs nothing");
  eq(impCost(S(), 1, "trunk", 1), 0, "a second level as the second improvement is free");
  eq(impCost(S(), 2, null, 0), 25, "a custom one past two costs 25(к)");
  eq(C.act("imp", { id: "brahmins", k: "0", pay: "1" }), true, "bought");
  eq(S().budget, 35, "60 − 25");
  eq(C.act("imp", { id: "lead", k: "0", pay: "0" }), true, "taken for free");
  eq(S().budget, 35, "for free: the budget stays");
  S().budget = 10;
  eq(C.act("addCustomImp", { pay: "1" }), false, "10(к) for 25(к): refused");
  eq(S().customImps.length, 0, "refused: no custom improvement");
}

/* ---------- A13: «Купити за N(к)» in the character's catalogue ---------- */
{
  R.setRandom(R.mulberry32(7));
  const st = R.rollCharacter(null);
  const L = createLogic({ st });
  const toasts = [];
  const C = createController(st, L, { toast: (m) => toasts.push(m) });
  const e = R.catalogAll(false).find((x) => x.kind === "o" && (parseInt(x.price, 10) || 0) >= 2);
  const price = parseInt(e.price, 10);
  st.caps = price + 1;
  const n0 = st.other.length + st.weapons.length + st.armor.length;
  eq(C.act("cat-add", { id: e.id, pay: "1" }), true, `bought «${e.n}» for ${price}(к)`);
  eq(st.caps, 1, "the price off the caps");
  ok(st.other.length + st.weapons.length + st.armor.length >= n0, "the thing is in the gear");
  eq(C.act("cat-add", { id: e.id, pay: "1" }), false, "1(к) left: refused");
  eq(st.caps, 1, "refused: the caps stay");
  eq(C.act("cat-add", { id: e.id }), true, "«Додати» still adds for free");
  eq(st.caps, 1, "«Додати» spends nothing");
}

/* ---------- A14: the karma card ---------- */
{
  const up = karmaCardHtml("Ватага", 3, 5, "Прості волоцюги", "Гідні люди");
  ok(up.includes("pust-karmacard gain asp") && up.includes(": карма +2") && up.includes(">+5<"), "+2: green, the karma now");
  ok(up.includes("<s>Прості волоцюги</s> → <b>Гідні люди</b>"), "the aspect changed: old → new");
  const down = karmaCardHtml("Ватага", 0, -1, "Прості волоцюги", "Прості волоцюги");
  ok(down.includes("pust-karmacard loss\"") && down.includes(": карма −1") && !down.includes("Кармічний аспект"), "−1: red, no aspect line");
}

/* ---------- A14: Удача партії (wiki table) ---------- */
eq([-6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 9].map(partyLuckOf), [-2, -2, -1, -1, 0, 0, 0, 1, 1, 2, 2], "the wiki's table");
eq(partyLuckLine([{ name: "Волті", v: 1 }, { name: "Бабай", v: 2 }]), "Волті 1 + Бабай 2 = +3 → +1", "the tooltip line");
eq(partyLuckLine([{ name: "А", v: -2 }, { name: "Б", v: -2 }]), "А (−2) + Б (−2) = −4 → −2", "negative УДЧ");

console.log(failures ? `${failures} of ${checks} checks FAILED` : `OK (${checks} checks)`);
process.exit(failures ? 1 : 0);
