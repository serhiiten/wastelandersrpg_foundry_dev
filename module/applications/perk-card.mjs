/**
 * «Застосувати» of a perk (author, 2026-11-18; rules: module/rules/perk-uses.mjs): the check of the target (T) where the perk
 * needs one, the character's own change and mark (controller action `perk-use`), the chat card in the chat's mode (no forced
 * whisper: «потай» goes by the mode menu, author 2026-11-18), then the target's side.
 *   – «Цілющий дотик» (зцілення): 1d10 ОЗ to the one target (T); oneself too only as the target (author, 2026-11-18);
 *   – «Цілющий дотик» (повернення): the one target (T) with 0 ОЗ comes back with 1 ОЗ;
 *   – «Загадковий незнайомець»: the target enemy's category picks the outcome; the damage is the GM's to apply.
 * The target's side is written by the user when they own it, else by the active GM (the socket of chem-target.mjs).
 */
import { createController } from "../rules/controller.mjs";
import { USE_BY_ID, PER } from "../rules/perk-uses.mjs";
import { applyHeal, clearTargets } from "./apply-damage.mjs";
import { runAction } from "./character-actions.mjs";
import { postChat } from "./chat.mjs";
import { askGM } from "../helpers/gm-request.mjs";
import { notify } from "../helpers/notify.mjs";
import { rollDie } from "../helpers/dice.mjs";
import { warnDoomed } from "./battle-health.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const rng = rollDie; // not Roll#evaluateSync: Foundry 14 refuses it for dice (helpers/dice.mjs)

/** The chat card: who uses what, the limit, what the system did, the book's text */
export function perkCardHtml(who, res, cls) {
  const did = (res.lines || []).map((l) => `<p class="pust-pk-did">${esc(l)}</p>`).join("");
  const book = String(res.text || "").split("\n").map((l) => esc(l)).join("<br>");
  return `<div class="pust-chat pust-perkcard pk-${cls}"><div class="pust-pk-hd"><i class="fa-solid fa-star"></i>`
    + `<span class="pust-pk-title">${esc(who)}: «${esc(res.name)}»</span><span class="pust-pk-lim">${esc(res.lim)}</span></div>`
    + did + (book ? `<div class="pust-pk-book">${book}</div>` : "") + `</div>`;
}

/** The user's targets (T) with an actor */
const targetTokens = () => [...(game.user.targets ?? [])].filter((t) => t?.document?.actor).map((t) => t.document);

/**
 * The button «Застосувати» of `id` on `actor`'s sheet.
 * @returns {Promise<boolean>} true when the perk was used
 */
export async function applyPerkUse(actor, id) {
  const u = USE_BY_ID[id];
  if (!u) return false;
  // 1) the target, checked before anything is marked
  let target = null, cat = "";
  const tgs = targetTokens();
  if (u.auto === "heal" || u.auto === "back") {
    if (tgs.length !== 1) {
      notify.warn(u.auto === "back" ? "Познач ціллю (T) рівно одного — того, кого повернути в сцену." : "Познач ціллю (T) рівно одного — того, кого зцілити (себе теж: познач свій токен).");
      return false;
    }
    target = tgs[0];
    const ta = target.actor;
    if (!ta.system?.hp) { notify.warn("У цілі немає ОЗ."); return false; }
    if (u.auto === "back" && Number(ta.system.hp.value) > 0) { notify.warn(`${target.name} не вибув: ОЗ більше за 0.`); return false; }
    if (!(game.user.isGM || ta.isOwner) && !game.users.activeGM) { notify.warn("Чужу ціль лікує Доглядач, а його зараз немає в грі."); return false; }
  }
  if (u.auto === "stranger" && tgs.length === 1 && tgs[0].actor.type === "enemy") cat = tgs[0].actor.system?.cat || "";

  // 2) the character's own change and mark
  let res = null;
  const toast = (msg, kind) => (kind === "bad" ? notify.warn(msg) : notify.info(msg));
  await runAction(actor, (st, L) => {
    const C = createController(st, L, { toast, rng, cat });
    if (C.act("perk-use", { id })) res = C.lastPerk();
  }, { quiet: true });
  if (!res) return false;

  // 3) the card, in the chat's mode
  await postChat({ speaker: ChatMessage.getSpeaker({ actor }), content: perkCardHtml(actor.name, res, PER[u.per]?.cls || "free") });

  // 4) the target's side
  const amount = res.heal ?? (res.back ? 1 : 0);
  if (amount) {
    const uuid = target.uuid;
    const head = `${res.name} (${actor.name})`;
    const ta = target.actor;
    if (res.back) warnDoomed(ta, "Цілющий дотик (повернення)");
    if (game.user.isGM || ta.isOwner) await applyHeal([uuid], amount, { head });
    else askGM({ op: "chemHeal", token: uuid, amount, head }, "Цілющий дотик", "Перк використано, але ціль не зцілено.");
    clearTargets();
  }
  return true;
}
