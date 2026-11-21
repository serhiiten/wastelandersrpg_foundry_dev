/**
 * «Списати N(к) з бюджету?» (author, 2026-11-21; A3, A13): asked when a cargo row is bought and when an improvement past the
 * two starting ones is taken. Three ways out: «Так, списати» (off when the budget is short), «Ні, без списання» (the thing
 * is taken for free: a find, a gift, the start of the game), × / Esc (nothing happens).
 *   await askSpend({ title: "Купити вантаж", what: "«Вода»", cost: 10, have: 12 }) → "pay" | "free" | null
 */
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** The dialog's text: what is bought, the question and what the budget becomes (pure, testable) */
export function spendText({ what = "", cost = 0, have = 0 } = {}) {
  const short = cost > have;
  return {
    short,
    html: `${what ? `<p>${esc(what)}</p>` : ""}<p><b>Списати ${cost}(к) з бюджету?</b></p>`
      + (short
        ? `<p class="pust-sub pust-spend-short">У бюджеті ${have}(к): бракує ${cost - have}(к).</p>`
        : `<p class="pust-sub">Бюджет: ${have} → ${have - cost}(к)</p>`),
  };
}

export async function askSpend({ title, what, cost, have }) {
  const t = spendText({ what, cost, have });
  const r = await foundry.applications.api.DialogV2.wait({
    window: { title },
    position: { width: 380 },
    classes: ["wastelanders", "pust-spend-ask"],
    content: t.html,
    modal: true,
    rejectClose: false,
    buttons: [
      { action: "pay", label: "Так, списати", icon: "fa-solid fa-coins", default: !t.short, disabled: t.short },
      { action: "free", label: "Ні, без списання", default: t.short },
    ],
  });
  return r === "pay" || r === "free" ? r : null;
}
