/**
 * The short chat card of a character sheet's action that changed the character in play (U7, author 2026-11-21): chems taken
 * by the character itself, rest, 0 ОЗ, purchases and services for caps, the sheet's own end of a scene / day / session.
 * Made like the card of «На ціль» (chem-target.mjs: `pust-dmgapply pust-healapply`): a header «Що: хто», the engine's line.
 * What goes where: module/rules/sheet-channels.mjs.
 */
import { postChat } from "./chat.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** The card's HTML (exported for the tests of the markup) */
export function sheetCardHtml(name, { title, text, icon }) {
  return `<div class="pust-chat pust-dmgapply pust-healapply pust-sheetcard"><div class="pust-da-hd"><i class="fa-solid ${esc(icon || "fa-circle-info")}"></i>`
    + `<span class="pust-da-title">${esc(title)}: ${esc(name)}</span></div><div class="pust-da-text">${esc(text)}</div></div>`;
}

/** Post it, spoken by the character */
export function postSheetCard(actor, card) {
  if (!card) return null;
  return postChat({ speaker: ChatMessage.getSpeaker({ actor }), content: sheetCardHtml(actor.name, card) });
}
