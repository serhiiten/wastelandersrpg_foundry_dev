/**
 * A character's Жетони Долі changed by hand (author, 2026-11-15): a one-line chat card «Волті витрачає / отримує жетон
 * Долі» with the new count (`.pust-fdcard`, css/pust-ui.css). Posted by the players' «Витратити ЖД» / «Отримати ЖД» under
 * «Кістки» (map-dock.mjs), by the character sheet's counter (−/+ or a typed number) and by the rules themselves — an
 * aspect invoked with a token in «Зробити перевірку», +1 for dropping to 0 ОЗ, «Кінець сесії» bringing them back
 * (`fateSnap` before an action, `postFateIfChanged` after it). It follows the chat's mode menu.
 */
import { compute } from "../rules/core.mjs";
import { readState } from "./character-actions.mjs";
import { postChat } from "./chat.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
/** Ukrainian plural: 1 жетон, 2–4 жетони, 5–20 жетонів, 21 жетон… */
export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** The count as the sheet shows it: `fdCur`, blank = the maximum */
export const fdOf = (st, d) => (st.fdCur === "" || st.fdCur == null ? d.fd : parseInt(st.fdCur, 10) || 0);

/** The character's Fate tokens now (null when they can't be read) */
export function fateNow(actor) {
  try { const st = readState(actor); return fdOf(st, compute(st)); } catch (_) { return null; }
}

/** Before an action: the stored count and what it means (a blank count follows the maximum) */
export function fateSnap(actor) {
  try { const st = readState(actor); return { raw: String(st.fdCur ?? ""), n: fdOf(st, compute(st)) }; } catch (_) { return null; }
}

/**
 * After an action: a card when the stored count was set to another number. A blank count that only follows a changed
 * maximum (a perk taken, a new character) is not a token spent or gained, so it posts nothing.
 */
export async function postFateIfChanged(actor, before) {
  const after = fateSnap(actor);
  if (!before || !after || before.raw === after.raw) return null;
  return postFateChange(actor, before.n, after.n);
}

/* ----- Припаси (author, 2026-11-15): the same cards for supplies ----- */

/** The character's Припаси and their maximum */
export function supSnap(actor) {
  try { const st = readState(actor); return { n: parseInt(st.supplies, 10) || 0, max: compute(st).supMax }; } catch (_) { return null; }
}

/** The chat card for supplies changed from `was` to `now` (nothing when they didn't) */
export async function postSupChange(actor, was, now) {
  if (was == null || now == null || was === now) return null;
  const spend = now < was, n = Math.abs(now - was);
  const what = `${spend ? "витрачає" : "отримує"} ${n === 1 ? "Припас" : `${n} ${plural(n, "Припас", "Припаси", "Припасів")}`}`;
  const content = `<div class="pust-chat pust-fdcard pust-supcard ${spend ? "spend" : "gain"}"><i class="fa-solid fa-backpack"></i>`
    + `<span><b>${esc(actor.name)}</b> ${what}</span>`
    + `<span class="pust-fdcard-n" title="Припасів тепер">${now}</span></div>`;
  return postChat({ content, speaker: ChatMessage.getSpeaker({ actor }) });
}

/** After an action: a card when the supplies changed */
export async function postSupIfChanged(actor, before) {
  const after = supSnap(actor);
  if (!before || !after) return null;
  return postSupChange(actor, before.n, after.n);
}

/** The chat card for a change from `was` to `now` (nothing when it didn't change) */
export async function postFateChange(actor, was, now) {
  if (was == null || now == null || was === now) return null;
  const spend = now < was, n = Math.abs(now - was);
  const tokens = n === 1 ? "жетон Долі" : `${n} ${plural(n, "жетон", "жетони", "жетонів")} Долі`;
  const what = `${spend ? "витрачає" : "отримує"} ${tokens}`;
  const content = `<div class="pust-chat pust-fdcard ${spend ? "spend" : "gain"}"><i class="fa-solid fa-clover"></i>`
    + `<span><b>${esc(actor.name)}</b> ${what}</span>`
    + `<span class="pust-fdcard-n" title="Жетонів Долі тепер">${now}</span></div>`;
  return postChat({ content, speaker: ChatMessage.getSpeaker({ actor }) });
}
