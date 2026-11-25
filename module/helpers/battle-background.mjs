/**
 * A battle scene's background by its «Місце» (author, 2026-11-18; rules: module/rules/battle-backgrounds.mjs).
 * The scene flag `battleBg` is the truth ("auto" / none, "sand", a place's number), the level's picture follows it:
 *   – the flag changed (the «Битва» panel's picker, the scene's settings) → the window that changed it syncs the scene;
 *   – the shared «Місце» changed (sharedSet: the panel's die, the battle generator, a travel event) → the battle scene on
 *     view, else the battle map «Почати бій» would open, is synced by the window that wrote it;
 *   – «Почати бій» syncs the battle map before activating it (no second redraw for the players).
 * Auto never replaces the GM's own picture (author, 2026-11-18): only sand, our 36 or none. Entering a scene changes nothing.
 * No auto during a tour (a redraw mid-step loses its highlight).
 *
 * «Мапа» scenes (author, 2026-11-25; not «Мапа Пустки», which keeps its own picture, grid and layers): the same flag, but no
 * auto — "own" (also unset) changes nothing; a background sets the scene's size and grid too (`bgMapSize`: a card
 * 2000 × 1500 / 50, a pixel map 4000 × 3000 / 100), tokens, drawings and walls moved with it (`autoReposition`). The old
 * picture and size are not kept (Fable's verdict: a snapshot goes stale, scaling back rounds).
 */
import { AUTO, OWN, wantedBg, bgSrc, bgThumb, bgColor, bgMapSize, bgKeyOfSrc, isOwnBackground, isBgChoiceFor } from "../rules/battle-backgrounds.mjs";
import { isBattleScene } from "./default-scene.mjs";
import { mine } from "./main-window.mjs";

const sys = () => game.system.id;
const FLAG = "battleBg";

/** What kind of background a scene takes: "battle", "map" (a «Мапа» scene other than «Мапа Пустки») or null */
export const bgSceneKind = (scene) => {
  if (!scene) return null;
  if (isBattleScene(scene)) return "battle";
  return scene.getFlag(sys(), "mapScene") ? null : "map";
};

/** The picture now on the scene's first level */
export const bgNow = (scene) => scene?.initialLevel?.background?.src ?? "";

/**
 * The scene's choice. Battle: "auto" (also when unset or bad), "sand" or a background's key. «Мапа»: "own" (also unset or
 * bad), or the key of the picture it really shows when that is ours (the GM may have put another picture in its settings
 * since: then it is "own" again, whatever the flag says).
 */
export const bgChoice = (scene) => {
  const kind = bgSceneKind(scene);
  const v = scene?.getFlag(sys(), FLAG);
  if (kind !== "map") return isBgChoiceFor("battle", v) ? String(v) : AUTO;
  if (!isBgChoiceFor("map", v) || v === OWN) return OWN;
  return bgKeyOfSrc(bgNow(scene)) === String(v) ? String(v) : OWN;
};

/** Does a «Мапа» scene show a picture of the GM's own (not ours, not none)? A background then asks first. */
export const hasOwnPicture = (scene) => !!bgNow(scene) && !isOwnBackground(bgNow(scene));

/**
 * The scene's picture set by its choice and the place. Resolves once the viewed scene is drawn again (capped), so tokens are
 * placed on the new canvas, not mid-redraw.
 */
export async function syncBattleBackground(scene, place) {
  const kind = bgSceneKind(scene);
  if (!game.user.isGM || !kind) return false;
  if (document.body.classList.contains("pust-touring")) return false;
  const level = scene.initialLevel;
  if (!level) return false;
  const cur = bgNow(scene);
  let key;
  if (kind === "map") {
    const v = scene.getFlag(sys(), FLAG);
    if (!isBgChoiceFor("map", v) || v === OWN) return false; // no auto on a «Мапа» scene: own / unset changes nothing
    key = String(v);
  } else {
    const choice = bgChoice(scene);
    if (choice === AUTO && !isOwnBackground(cur)) return false; // the GM's own picture stays
    key = wantedBg(choice, place ?? (await import("./scene-shared.mjs")).sharedGet("place"));
  }
  const src = bgSrc(sys(), key);
  const size = kind === "map" ? bgMapSize(key) : null;
  const resize = size && (scene.width !== size.width || scene.height !== size.height || scene.grid?.size !== size.grid);
  if (cur === src && !resize) return false;
  const viewed = canvas?.scene?.id === scene.id;
  const drawn = viewed
    ? Promise.race([new Promise((r) => Hooks.once("canvasReady", r)), new Promise((r) => setTimeout(r, 8000))])
    : null;
  if (resize) {
    // one write (Fable): the picture, size and grid together, one redraw; the grid given always (else Foundry scales it itself)
    const upd = { thumb: bgThumb(sys(), key), grid: { size: size.grid }, levels: [{ _id: level.id, background: { src, color: bgColor(key) } }] };
    if (scene.width !== size.width || scene.height !== size.height) Object.assign(upd, { width: size.width, height: size.height, initial: { x: null, y: null, scale: null } });
    await scene.update(upd, { autoReposition: true });
  } else {
    await level.update({ "background.src": src, "background.color": bgColor(key) });
    await scene.update({ thumb: bgThumb(sys(), key) });
  }
  if (drawn) await drawn;
  return true;
}

/** Write the choice (the picker); the hook below syncs */
export async function setBgChoice(scene, choice) {
  const kind = bgSceneKind(scene);
  if (!game.user.isGM || !kind || !isBgChoiceFor(kind, choice)) return;
  // the flag already holds it (also a «Мапа» scene whose picture the GM changed since): no update, so sync here
  if (scene.getFlag(sys(), FLAG) === choice) return syncBattleBackground(scene);
  await scene.setFlag(sys(), FLAG, choice);
}

// the choice changed here (picker or the scene's settings): the picture follows
Hooks.on("updateScene", (scene, changed, _opts, userId) => {
  if (!mine(userId)) return;
  const f = changed?.flags?.[sys()];
  if (!f || !(FLAG in f || `-=${FLAG}` in f)) return;
  syncBattleBackground(scene);
});
