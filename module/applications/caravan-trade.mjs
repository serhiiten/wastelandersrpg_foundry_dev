/**
 * The caravan's money and karma in chat (author, 2026-11-21; A3, A14).
 *   postSaleCard(actor, plan)      «Продати» / «Продати все» / «Плата за проїзд»: what went, for how much, the budget before → after
 *   postKarmaChange(actor, was, now)  every change of the karma by hand (−/+, typed, the aspect's list): +N green, −N red,
 *                                  and the karmic aspect when it changes with it
 * The HTML builders are pure (tests/caravan-trade.test.mjs); the cards follow the chat's mode menu (chat.mjs).
 */
import { postChat } from "./chat.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");

/** The sale card: one line a row («Вода ×2 · далека · пошк. — 16(к)»), the total and the budget */
export function saleCardHtml(name, plan) {
  const fare = plan.rows.length && plan.rows.every((r) => r.pass);
  const head = fare ? "плата за проїзд" : "продаж вантажу";
  const rows = plan.rows.map((r) => {
    const what = r.pass ? `Пасажир: ${esc(r.name || "без назви")}` : `${esc(r.name || "без назви")}${r.qty > 1 ? ` ×${r.qty}` : ""}`;
    const tags = r.pass ? "" : `${r.far ? ' <span class="pust-trade-tag far">далека</span>' : ""}${r.hurt ? ' <span class="pust-trade-tag hurt">пошк.</span>' : ""}`;
    return `<li><span>${what}${tags}</span><b>${r.sum}(к)</b></li>`;
  }).join("");
  return `<div class="pust-chat pust-tradecard"><div class="pust-trade-hd"><i class="fa-solid fa-coins"></i>`
    + `<span><b>${esc(name)}</b>: ${head}</span><span class="pust-trade-n">+${plan.total}(к)</span></div>`
    + `<ul class="pust-trade-rows">${rows}</ul>`
    + `<p class="pust-trade-budget">Бюджет: ${plan.before} → <b>${plan.after}(к)</b></p></div>`;
}

export function postSaleCard(actor, plan) {
  if (!plan?.rows?.length) return null;
  return postChat({ content: saleCardHtml(actor.name, plan), speaker: ChatMessage.getSpeaker({ actor }) });
}

/** The karma card: «Карма +2» (green) or «Карма −1» (red), the karma now; the aspect «А → Б» when it changed */
export function karmaCardHtml(name, was, now, aspWas = "", aspNow = "") {
  const d = now - was;
  const asp = aspWas !== aspNow && aspNow
    ? `<p class="pust-karma-asp"><span>Кармічний аспект:</span> ${aspWas ? `<s>${esc(aspWas)}</s> → ` : ""}<b>${esc(aspNow)}</b></p>` : "";
  return `<div class="pust-chat pust-karmacard ${d > 0 ? "gain" : "loss"}${asp ? " asp" : ""}">`
    + `<div class="pust-karma-hd"><i class="fa-solid fa-${d > 0 ? "arrow-trend-up" : "arrow-trend-down"}"></i>`
    + `<span><b>${esc(name)}</b>: карма ${signed(d)}</span><span class="pust-karma-n" title="Карма тепер">${signed(now)}</span></div>${asp}</div>`;
}

export function postKarmaChange(actor, was, now, aspWas, aspNow) {
  if (was == null || now == null || was === now) return null;
  return postChat({ content: karmaCardHtml(actor.name, was, now, aspWas, aspNow), speaker: ChatMessage.getSpeaker({ actor }) });
}
