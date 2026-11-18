import { activeGmHere } from "./main-window.mjs";
/**
 * «Мапа Пустки» — the system's default scene (author, 2026-11-14).
 *
 * The map of the rulebook (Західне узбережжя США, 2277; the source is the HTML terminal's mapsrc/map.jpg, upscaled ×4
 * with Real-ESRGAN for crisp labels and lines up close) on the map layer — the level's background — with Foundry's grid
 * laid exactly over the map's own grid: the picture is cropped to the map's outer grid lines (assets/maps/pustka.webp,
 * 51 × 70 cells; tools/make_map_scene.py) and stretched over the scene's CELL px cells, so the scene grid needs no offsets.
 * The picture is 72 px a cell (author, 2026-11-17: players' video memory), the scene 108.
 * Units: клітинки, a diagonal step counts as one cell (core world setting «gridDiagonals», EQUIDISTANT; its default is
 * set in wastelanders.mjs).
 *
 * A world gets the scene once (hidden world setting «mapSceneVersion»): it is created, made the active scene, and
 * Foundry's own starter scene is removed when nothing was put on it. Delete the scene and it stays deleted.
 *
 * Version 3 (author, 2026-11-18): the picture is the pixel map (assets/maps/pustka-pixel.webp, tools/make_pixel_map.py,
 * made from pustka.webp, same size and grid). A world that has the scene with the old picture gets the new one once; a
 * scene whose picture the GM changed keeps it. pustka.webp stays in the system: the pixel map is made from it.
 */
export const MAP_SCENE_VERSION = 3;
export const CELL = 108;
export const COLS = 51;
export const ROWS = 70;
const LEVEL_ID = "pustkaMapLevel01";
const FOUNDRY_STARTER = "NUEDEFAULTSCENE0";

/** The map's picture */
export const mapPicture = (systemId) => `systems/${systemId}/assets/maps/pustka-pixel.webp`;
/** Is this the system's earlier map picture (any system id)? Only that one is replaced by the pixel map */
export const isOldMapPicture = (src) => /^systems\/[^/]+\/assets\/maps\/pustka\.webp$/.test(String(src ?? ""));

/** The scene's data (pure: tests can check it) */
export function mapSceneData(systemId) {
  const src = mapPicture(systemId);
  return {
    name: "Мапа Пустки",
    navName: "Мапа Пустки",
    navigation: true,
    width: COLS * CELL,
    height: ROWS * CELL,
    padding: 0.05,
    grid: { type: CONST.GRID_TYPES.SQUARE, size: CELL, style: "solidLines", thickness: 1, color: "#f4d11a", alpha: 0.25, distance: 1, units: "кл." },
    tokenVision: false,
    fog: { mode: 0 },
    initialLevel: LEVEL_ID,
    levels: [{
      _id: LEVEL_ID,
      name: "Мапа Пустки",
      elevation: { bottom: 0, top: 4 },
      background: { color: "#0b2a5c", src, tint: "#ffffff", alphaThreshold: 0.75 },
      foreground: { src: null, tint: "#ffffff", alphaThreshold: 0.75 },
      textures: { anchorX: 0.5, anchorY: 0.5, offsetX: 0, offsetY: 0, fit: "fill", scaleX: 1, scaleY: 1, rotation: 0 },
    }],
    flags: { [systemId]: { mapScene: MAP_SCENE_VERSION } },
  };
}

/** The world's «Мапа Пустки», if it has one */
export const findMapScene = () => game.scenes.find((s) => s.getFlag(game.system.id, "mapScene"));

async function thumbnail(scene) {
  try {
    const { thumb } = await scene.createThumbnail();
    if (thumb) await scene.update({ thumb });
  } catch (err) {
    console.warn("Пустельники | map scene thumbnail", err);
  }
}

/** Give the world its «Мапа Пустки» (the first GM, once; a world that got it doesn't get it again) */
export async function ensureMapScene() {
  if (!game.user.isGM || !activeGmHere()) return;
  const sys = game.system.id;
  const had = game.settings.get(sys, "mapSceneVersion") ?? 0;
  if (had >= MAP_SCENE_VERSION) return;
  if (had > 0) {
    // a world that got the scene earlier: only its picture changes, and only while it is still the system's old one
    const scene = findMapScene();
    const level = scene?.levels?.get?.(LEVEL_ID) ?? scene?.initialLevel;
    if (level && isOldMapPicture(level.background?.src)) {
      await level.update({ "background.src": mapPicture(sys) });
      await thumbnail(scene);
    }
    await game.settings.set(sys, "mapSceneVersion", MAP_SCENE_VERSION);
    return;
  }
  let scene = findMapScene();
  if (!scene) {
    scene = await Scene.implementation.create(mapSceneData(sys));
    await thumbnail(scene);
  }
  await scene.activate();
  // Foundry's starter scene goes, unless something was put on it
  const starter = game.scenes.get(FOUNDRY_STARTER);
  if (starter && starter.id !== scene.id && !starter.tokens.size && !starter.notes.size && !starter.drawings.size && !starter.walls.size) {
    await starter.delete();
  }
  await game.settings.set(sys, "mapSceneVersion", MAP_SCENE_VERSION);
}

/* ---------- «Бойова мапа» — the second default scene (author, 2026-11-14) ----------
 * Light sand (assets/maps/battle-sand.webp, tools/make_battle_bg.py) with a dark brown grid, 40 × 30 cells of 100 px, for
 * the battle's zones and tokens: zones are drawn on it (module/canvas/battle-zones.mjs), the panel «Битва» shows on it
 * (map-dock.mjs). A world gets it once, not activated (the GM switches to it when a fight starts); deleted, it stays deleted. */
export const BATTLE_SCENE_VERSION = 2;
export const BATTLE_CELL = 100;
export const BATTLE_COLS = 40;
export const BATTLE_ROWS = 30;
const BATTLE_LEVEL_ID = "pustBattleLevel1";

/** The battle scene's data (pure) */
export function battleSceneData(systemId) {
  const src = `systems/${systemId}/assets/maps/battle-sand.webp`;
  return {
    name: "Бойова мапа",
    navName: "Бойова мапа",
    navigation: true,
    width: BATTLE_COLS * BATTLE_CELL,
    height: BATTLE_ROWS * BATTLE_CELL,
    padding: 0.05,
    grid: { type: CONST.GRID_TYPES.SQUARE, size: BATTLE_CELL, style: "solidLines", thickness: 1, color: "#4a381e", alpha: 0.3, distance: 1, units: "кл." },
    tokenVision: false,
    fog: { mode: 0 },
    initialLevel: BATTLE_LEVEL_ID,
    levels: [{
      _id: BATTLE_LEVEL_ID,
      name: "Бойова мапа",
      elevation: { bottom: 0, top: 4 },
      background: { color: "#c8ad7f", src, tint: "#ffffff", alphaThreshold: 0.75 },
      foreground: { src: null, tint: "#ffffff", alphaThreshold: 0.75 },
      textures: { anchorX: 0.5, anchorY: 0.5, offsetX: 0, offsetY: 0, fit: "fill", scaleX: 1, scaleY: 1, rotation: 0 },
    }],
    flags: { [systemId]: { battleScene: BATTLE_SCENE_VERSION } },
  };
}

/** The world's «Бойова мапа», if it has one */
export const findBattleScene = () => game.scenes.find((s) => s.getFlag(game.system.id, "battleScene"));
/** Is this scene the battle map? */
export const isBattleScene = (scene) => !!scene?.getFlag(game.system.id, "battleScene");

/** Give the world its «Бойова мапа» (the first GM, once; a world that got it doesn't get it again) */
export async function ensureBattleScene() {
  if (!game.user.isGM || !activeGmHere()) return;
  const sys = game.system.id;
  if ((game.settings.get(sys, "battleSceneVersion") ?? 0) > 0) return;
  if (!findBattleScene()) {
    const made = await Scene.implementation.create(battleSceneData(sys));
    // in a new world Foundry makes the new scene active while the map's activation hasn't reached this client yet
    // (author, 2026-11-15: a fresh world opened on «Бойова мапа»); the map stays the active one
    const map = findMapScene();
    if (made.active && map) await map.activate();
    await thumbnail(made);
  }
  await game.settings.set(sys, "battleSceneVersion", BATTLE_SCENE_VERSION);
}
