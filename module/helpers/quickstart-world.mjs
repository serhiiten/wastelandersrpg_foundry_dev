/**
 * «Швидкий старт» in a world (author, 2026-11-17).
 *
 * Spoilers: players don't see the adventure's Actors folders. «Вороги» (its battles' enemies) is hidden from them always;
 * «Швидкий старт» too, unless they own something in it (a quick-start character given to them, in «Останній Шанс»).
 * The folders are found by the adventure's ids (an Adventure import keeps them). Only the directory hides them: an enemy shown
 * on a scene stays visible there.
 *
 * Thumbnails: the adventure's scenes carry their place background's thumbnail (author, 2026-11-19: the four battles have
 * the backgrounds 22, 14, 21, 44); a world that imported an older copy, whose thumbnails pointed into the world it was made in,
 * gets the thumbnail of the picture its scene shows (the active GM, once on «ready»).
 */
import { activeGmHere } from "./main-window.mjs";
import { SAND, bgThumb, bgKeyOfSrc } from "../rules/battle-backgrounds.mjs";

const QS_ROOT = "vLmrcjwBv4MPXhWs";    // Actors folder «Швидкий старт»
const QS_ENEMIES = "vcwB7L4ude9BUYw6"; // «Швидкий старт / Вороги»
const QS_SCENES = ["ZxrqfNkXOLM6qUUk", "cRu1SDvxoGthxtzU", "OZg0SW4x9WXWt4wu", "KE83gT2jvXPYdR1G"]; // its four battle scenes

/** Is `folder` this folder or inside it */
function within(folder, id) {
  for (let f = folder; f; f = f.folder) if (f.id === id) return true;
  return false;
}

function hideFolders(app, html) {
  if (game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  if (!root) return;
  const hide = (id) => root.querySelector(`li.folder[data-folder-id="${id}"]`)?.classList.add("pust-qs-hidden");
  hide(QS_ENEMIES);
  const owns = game.actors.some((a) => a.isOwner && within(a.folder, QS_ROOT) && !within(a.folder, QS_ENEMIES));
  if (!owns) hide(QS_ROOT);
}

/** The thumbnail of the picture a scene shows: one of our backgrounds, else sand */
export const quickstartThumb = (scene) => bgThumb(game.system.id, bgKeyOfSrc(scene?.initialLevel?.background?.src) ?? SAND);

/** The quick-start scenes whose thumbnail points into another world get the system's own */
async function repairThumbs() {
  if (!activeGmHere()) return;
  const mine = `worlds/${game.world.id}/`;
  const updates = game.scenes
    .filter((s) => (QS_SCENES.includes(s.id) || s.getFlag(game.system.id, "battleScene")) && String(s.thumb ?? "").startsWith("worlds/") && !s.thumb.startsWith(mine))
    .map((s) => ({ _id: s.id, thumb: quickstartThumb(s) }));
  if (updates.length) await Scene.updateDocuments(updates);
}

export function initQuickstartWorld() {
  Hooks.on("renderActorDirectory", hideFolders);
  Hooks.once("ready", () => { repairThumbs().catch((err) => console.warn("Пустельники | quick start thumbnails", err)); });
}
