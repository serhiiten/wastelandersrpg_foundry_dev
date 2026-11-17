/**
 * «Дефібрилятор» of the caravan (author, 2026-11-18): «Застосувати» posts a chat card in the chat's mode and marks the upgrade
 * «використано» till the end of the scene. It spends no Припас by itself (the players take it off). The mark is a flag of the
 * caravan (no scene counter of its own): the GM's group «Кінець сцени» / «Новий день» / «Кінець сесії» clear it on every
 * caravan (group-end.mjs), the owner and the GM with one click on the sheet.
 */
import { IMPS } from "../rules/caravan.mjs";
import { postChat } from "./chat.mjs";

const FLAG = "defibUsed";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Is the caravan's «Дефібрилятор» used in this scene */
export const defibUsed = (actor) => !!actor?.getFlag?.(game.system.id, FLAG);

/** «Застосувати»: the card and the mark */
export async function useDefib(actor) {
  if (defibUsed(actor)) return false;
  const imp = IMPS.find((i) => i.id === "defib");
  const content = `<div class="pust-chat pust-perkcard pk-scene"><div class="pust-pk-hd"><i class="fa-solid fa-heart-circle-bolt"></i>`
    + `<span class="pust-pk-title">${esc(actor.name)}: «Дефібрилятор»</span><span class="pust-pk-lim">раз за сцену</span></div>`
    + `<p class="pust-pk-did">Персонажа з 0 ОЗ на ліжку для хворого повернуто в сцену з 1 ОЗ. Одиницю Припасів зніміть самі.</p>`
    + `<div class="pust-pk-book">${esc(imp?.desc || "")}</div></div>`;
  await postChat({ speaker: ChatMessage.getSpeaker({ actor }), content });
  await actor.setFlag(game.system.id, FLAG, true);
  return true;
}

/** One click: the mark off */
export function freeDefib(actor) {
  return actor.unsetFlag(game.system.id, FLAG);
}

/** The GM's group time buttons: every caravan's mark off */
export async function clearDefibs() {
  for (const a of game.actors.filter((x) => x.type === "caravan" && defibUsed(x))) await freeDefib(a);
}
