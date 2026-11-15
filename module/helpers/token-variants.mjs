/**
 * Different faces for enemies of one kind (author, 2026-11-15; as the HTML battle tracker): a new unlinked token of an
 * enemy whose picture is the system's own takes the least used of its kind's archive variants on the scene
 * (module/rules/token-variants.mjs). The battle generator and «Битва» assign them for the whole batch
 * (`variantTextures`, created with the option `pustTokens`); a token dragged from the Actors directory gets one in
 * preCreateToken. A picture the GM set for the enemy (not the system's) is kept.
 */
import { variantsFor, pickVariants } from "../rules/token-variants.mjs";
import { OPPONENT_ALIASES } from "../applications/terminal-battle.mjs";

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
  Hooks.on("preCreateToken", (token, data, options, userId) => {
    if (options?.pustTokens || userId !== game.user.id || token.actorLink) return;
    const actor = game.actors.get(token.actorId);
    if (!actor || token.texture?.src !== actor.prototypeToken?.texture?.src) return;
    const [src] = variantTextures(token.parent, actor, 1) ?? [];
    if (src) token.updateSource({ "texture.src": src });
  });
}
