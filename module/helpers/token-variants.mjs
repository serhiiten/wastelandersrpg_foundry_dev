/**
 * Different faces for enemies of one kind (author, 2026-11-15; as the HTML battle tracker): a new unlinked token of an
 * enemy whose picture is the system's own takes the least used of its kind's archive variants on the scene
 * (module/rules/token-variants.mjs). The battle generator and «Битва» assign them for the whole batch
 * (`variantTextures`, created with the option `pustTokens`); a token dragged from the Actors directory gets one in
 * preCreateToken. A picture the GM set for the enemy (not the system's) is kept.
 */
import { mine } from "./main-window.mjs";
import { variantsFor, pickVariants } from "../rules/token-variants.mjs";
import { OPPONENT_ALIASES } from "../applications/terminal-battle.mjs";
import { pickKind } from "../rules/enemy-kinds.mjs";

const base = () => `systems/${game.system.id}/assets/tokens/`;
const isSystemPic = (src) => !src || String(src).startsWith(`systems/${game.system.id}/assets/`) || String(src).startsWith("icons/");

/** The token pictures for `count` new tokens of `actor` on `scene`; null when it has no variants or its own picture */
export function variantTextures(scene, actor, count) {
  if (actor?.type !== "enemy" || !isSystemPic(actor.prototypeToken?.texture?.src)) return null;
  const list = variantsFor(actor.name, OPPONENT_ALIASES).map((f) => base() + f);
  if (!list.length) return null;
  const used = {};
  for (const t of scene?.tokens ?? []) if (list.includes(t.texture?.src)) used[t.texture.src] = (used[t.texture.src] || 0) + 1;
  return pickVariants(list, count, used);
}

export function readyTokenVariants() {
  Hooks.on("createToken", (token, options, userId) => {
    const kind = token.getFlag(game.system.id, "kind");
    if (!mine(userId) || !kind || token.actorLink || token.actor?.name === kind) return;
    token.actor?.update({ name: kind, img: token.texture.src });
  });
  Hooks.on("preCreateToken", (token, data, options, userId) => {
    if (options?.pustTokens || userId !== game.user.id) return;
    // a group enemy («Маленькі тварини…», «Бандити, мафіозі…») dragged onto a scene (author, 2026-11-16): the token is one
    // concrete kind — its own name and picture, unlinked, its card under the kind's name (the actor stays the group)
    const group = game.actors.get(token.actorId);
    const kind = group?.type === "enemy" ? pickKind(group.name, OPPONENT_ALIASES) : null;
    if (kind) {
      const list = kind.tokens.map((f) => base() + f);
      const used = {};
      for (const t of token.parent?.tokens ?? []) if (list.includes(t.texture?.src)) used[t.texture.src] = (used[t.texture.src] || 0) + 1;
      const [src] = pickVariants(list, 1, used);
      // the token's own actor gets the kind's name right after it is made (a delta can't be written before)
      token.updateSource({ actorLink: false, name: kind.name, [`flags.${game.system.id}.kind`]: kind.name, ...(src ? { "texture.src": src } : {}) });
      return;
    }
    if (token.actorLink) return;
    const actor = group;
    if (!actor || token.texture?.src !== actor.prototypeToken?.texture?.src) return;
    const [src] = variantTextures(token.parent, actor, 1) ?? [];
    if (src) token.updateSource({ "texture.src": src });
  });
}
