/**
 * A battle scene's background by its «Місце» (author, 2026-11-18; rules: module/rules/battle-backgrounds.mjs).
 * The scene flag `battleBg` is the truth ("auto" / none, "sand", a place's number), the level's picture follows it:
 *   – the flag changed (the «Битва» panel's picker, the scene's settings) → the window that changed it syncs the scene;
 *   – the shared «Місце» changed (sharedSet: the panel's die, the battle generator, a travel event) → the battle scene on
 *     view, else the battle map «Почати бій» would open, is synced by the window that wrote it;
 *   – «Почати бій» syncs the battle map before activating it (no second redraw for the players).
 * Auto never replaces the GM's own picture (author, 2026-11-18): only sand, our 36 or none. Entering a scene changes nothing.
 * No auto during a tour (a redraw mid-step loses its highlight).
 */
import { AUTO, wantedBg, bgSrc, bgThumb, bgColor, isOwnBackground, isBgChoice } from "../rules/battle-backgrounds.mjs";
import { isBattleScene } from "./default-scene.mjs";
import { mine } from "./main-window.mjs";

const sys = () => game.system.id;
const FLAG = "battleBg";

/** The scene's choice: "auto" (also when unset or bad), "sand" or a place's number */
export const bgChoice = (scene) => {
  const v = scene?.getFlag(sys(), FLAG);
  return isBgChoice(v) ? String(v) : AUTO;
};

/** The picture now on the scene's first level */
export const bgNow = (scene) => scene?.initialLevel?.background?.src ?? "";

/**
 * The scene's picture set by its choice and the place. Resolves once the viewed scene is drawn again (capped), so tokens are
 * placed on the new canvas, not mid-redraw.
 */
export async function syncBattleBackground(scene, place) {
  if (!game.user.isGM || !isBattleScene(scene)) return false;
  if (document.body.classList.contains("pust-touring")) return false;
  const level = scene.initialLevel;
  if (!level) return false;
  const choice = bgChoice(scene);
  const cur = bgNow(scene);
  if (choice === AUTO && !isOwnBackground(cur)) return false; // the GM's own picture stays
  const key = wantedBg(choice, place ?? (await import("./scene-shared.mjs")).sharedGet("place"));
  const src = bgSrc(sys(), key);
  if (cur === src) return false;
  const viewed = canvas?.scene?.id === scene.id;
  const drawn = viewed
    ? Promise.race([new Promise((r) => Hooks.once("canvasReady", r)), new Promise((r) => setTimeout(r, 8000))])
    : null;
  await level.update({ "background.src": src, "background.color": bgColor(key) });
  await scene.update({ thumb: bgThumb(sys(), key) });
  if (drawn) await drawn;
  return true;
}

/** Write the choice (the picker); the hook below syncs */
export async function setBgChoice(scene, choice) {
  if (!game.user.isGM || !scene || !isBgChoice(choice)) return;
  if (bgChoice(scene) === choice) return syncBattleBackground(scene);
  await scene.setFlag(sys(), FLAG, choice);
}

// the choice changed here (picker or the scene's settings): the picture follows
Hooks.on("updateScene", (scene, changed, _opts, userId) => {
  if (!mine(userId)) return;
  const f = changed?.flags?.[sys()];
  if (!f || !(FLAG in f || `-=${FLAG}` in f)) return;
  syncBattleBackground(scene);
});
