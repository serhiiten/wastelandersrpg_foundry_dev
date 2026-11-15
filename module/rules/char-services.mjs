/**
 * Paid services on the character sheet (author, 2026-11-15; Foundry only), paid from the character's caps, the same logic
 * as the caravan's «Поповнити» / «Відремонтувати» (caravan-range.mjs buyPlan): all of it if the caps allow, else as much
 * as they pay for; nothing to buy or no caps — the button is off. Prices from the wiki:
 *   - HP at a qualified medic: 1 cap for every 5 HP («Відновлення ОЗ та лікування наслідків»);
 *   - Припаси: 3 units for 1 cap («Гроші та речі, що їх коштують»);
 *   - consequences at a qualified medic: light 2, moderate 5, heavy 8 caps (both pages) — paid whole, the treatment
 *     starts («проліковано»).
 */
import { buyPlan } from "./caravan-range.mjs";

export const HP_PER_CAP = 5;
export const SUP_PER_CAP = 3;
export const CONS_PRICE = { l: 2, m: 5, m2: 5, h: 8 };

export const healPlan = (dmg, caps) => buyPlan(dmg, caps, HP_PER_CAP);
export const supPlan = (lack, caps) => buyPlan(lack, caps, SUP_PER_CAP);

/** A consequence's treatment: { price, can } — there is one, not treated yet, and the caps cover it */
export function consPlan(k, text, treated, caps) {
  const price = CONS_PRICE[k] ?? 0;
  return { price, can: !!String(text || "").trim() && !treated && price > 0 && (parseInt(caps, 10) || 0) >= price };
}

/** A button's view: { label, off, title } for a buy of `lack` with `caps` (`per` units a cap) */
export function buyButton(lack, caps, per, { verb, unit, full, rate }) {
  const r = buyPlan(lack, caps, per);
  const have = Math.max(0, parseInt(caps, 10) || 0);
  return {
    label: lack > 0 && r.cost ? `${verb} за ${r.cost}(к)` : verb,
    off: lack <= 0 || have <= 0,
    title: lack <= 0 ? full
      : have <= 0 ? "Кришок немає"
      : r.units < lack ? `Кришок вистачить на ${r.units} з ${lack} ${unit}: ${rate}`
      : `${verb} ${lack} ${unit} за ${r.cost}(к): ${rate}`,
  };
}
