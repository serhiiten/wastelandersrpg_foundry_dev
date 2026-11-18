/**
 * «Дефібрилятор» of the caravan (author, 2026-11-18): «Застосувати» posts a chat card in the chat's mode and marks the upgrade
 * «використано» till the end of the scene. It spends no Припас by itself (the players take it off). The one target (T) with
 * 0 ОЗ comes back with 1 ОЗ, as «Цілющий дотик» (повернення) does (author, 2026-11-18, after the review); a target the user
 * doesn't own is healed by the active GM over the socket of chem-target.mjs. The mark is a flag of the
 * caravan (no scene counter of its own): the GM's group «Кінець сцени» / «Новий день» / «Кінець сесії» clear it on every
 * caravan (group-end.mjs), the owner and the GM with one click on the sheet.
 */
import { IMPS } from "../rules/caravan.mjs";
import { applyHeal, clearTargets } from "./apply-damage.mjs";
import { postChat } from "./chat.mjs";
import { askGM } from "../helpers/gm-request.mjs";
import { notify } from "../helpers/notify.mjs";

const FLAG = "defibUsed";
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** Is the caravan's «Дефібрилятор» used in this scene */
export const defibUsed = (actor) => !!actor?.getFlag?.(game.system.id, FLAG);

/** «Застосувати»: the target back with 1 ОЗ, the card and the mark */
export async function useDefib(actor) {
  if (defibUsed(actor)) return false;
  const tgs = [...(game.user.targets ?? [])].filter((t) => t?.document?.actor).map((t) => t.document);
  if (tgs.length !== 1) { notify.warn("Познач ціллю (T) рівно одного — того, кого повернути в сцену."); return false; }
  const target = tgs[0], ta = target.actor;
  if (!ta.system?.hp) { notify.warn("У цілі немає ОЗ."); return false; }
  if (Number(ta.system.hp.value) > 0) { notify.warn(`${target.name} не вибув: ОЗ більше за 0.`); return false; }
  const own = game.user.isGM || ta.isOwner;
  if (!own && !game.users.activeGM) { notify.warn("Чужу ціль лікує Доглядач, а його зараз немає в грі."); return false; }
  const imp = IMPS.find((i) => i.id === "defib");
  const content = `<div class="pust-chat pust-perkcard pk-scene"><div class="pust-pk-hd"><i class="fa-solid fa-heart-circle-bolt"></i>`
    + `<span class="pust-pk-title">${esc(actor.name)}: «Дефібрилятор»</span><span class="pust-pk-lim">раз за сцену</span></div>`
    + `<p class="pust-pk-did">${esc(target.name)}: повернуто в сцену з 1 ОЗ. Одиницю Припасів зніміть самі.</p>`
    + `<div class="pust-pk-book">${esc(imp?.desc || "")}</div></div>`;
  await postChat({ speaker: ChatMessage.getSpeaker({ actor }), content });
  await actor.setFlag(game.system.id, FLAG, true);
  const head = `Дефібрилятор (${actor.name})`;
  if (own) await applyHeal([target.uuid], 1, { head });
  else askGM({ op: "chemHeal", token: target.uuid, amount: 1, head }, "Дефібрилятор", "Дефібрилятор використано, але ціль не повернуто.");
  clearTargets();
  return true;
}

/** One click: the mark off */
export function freeDefib(actor) {
  return actor.unsetFlag(game.system.id, FLAG);
}

/** The GM's group time buttons: every caravan's mark off */
export async function clearDefibs() {
  // the world's caravans and the unlinked caravan tokens of every scene (their own synthetic actors)
  const unlinked = game.scenes.contents.flatMap((sc) => sc.tokens.filter((t) => !t.actorLink).map((t) => t.actor));
  for (const a of [...game.actors.contents, ...unlinked].filter((x) => x?.type === "caravan" && defibUsed(x))) await freeDefib(a);
}
