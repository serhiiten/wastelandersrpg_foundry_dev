/**
 * «Списати N(к) з бюджету?» (author, 2026-11-21; A3, A13): asked when a cargo row is bought and when an improvement past the
 * two starting ones is taken. Three ways out: «Так, списати» (off when the budget is short), «Ні, без списання» (the thing
 * is taken for free: a find, a gift, the start of the game), × / Esc (nothing happens).
 *   await askSpend({ title: "Купити вантаж", what: "«Вода» ×2", cost: 10, have: 12, unit: 5, qty: 2 }) → "pay" | "free" | null
 */
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/**
 * The dialog's text (pure, testable): a receipt (author, 2026-11-22; 4.7, mockup А «Квитанція») — the thing with its price
 * (× quantity), «Разом» for more than one, the budget before → after or what it lacks, then the question.
 * `unit` / `qty`: a cargo row's price and quantity (an improvement has neither).
 */
export function spendText({ what = "", cost = 0, have = 0, unit = 0, qty = 1 } = {}) {
  const short = cost > have;
  const many = qty > 1 && unit > 0;
  const line = (l, r, cls = "") => `<div class="pust-rcpt-ln${cls}"><span>${l}</span><i aria-hidden="true"></i><span>${r}</span></div>`;
  const budget = short
    ? `<b class="pust-spend-short">${have}(к): бракує ${cost - have}(к)</b>`
    : `${have} → <b class="pust-spend-left">${have - cost}(к)</b>`;
  return {
    short,
    html: `<div class="pust-rcpt">`
      + line(`<b>${esc(what || "без назви")}</b>`, many ? `${unit}(к) × ${qty}` : `${cost}(к)`)
      + `<hr>`
      + (many ? line("Разом", `${cost}(к)`, " pust-rcpt-tot") : "")
      + line("Бюджет", budget)
      + `</div><p class="pust-spend-q"><b>Списати ${cost}(к) з бюджету?</b></p>`,
  };
}

export async function askSpend({ title, what, cost, have, unit, qty }) {
  const t = spendText({ what, cost, have, unit, qty });
  const r = await foundry.applications.api.DialogV2.wait({
    window: { title },
    position: { width: 380 },
    classes: ["wastelanders", "pust-spend-ask"],
    content: t.html,
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "pay", label: "Так, списати", icon: "fa-solid fa-coins", class: "pust-buy", default: !t.short, disabled: t.short },
      { action: "free", label: "Ні, без списання", default: t.short },
    ],
  });
  return r === "pay" || r === "free" ? r : null;
}
