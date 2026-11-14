/**
 * «Мапа Пустки» — the system's default scene (author, 2026-11-14).
 *
 * The map of the rulebook (Західне узбережжя США, 2277; the source is the HTML terminal's mapsrc/map.jpg, upscaled ×4
 * with Real-ESRGAN for crisp labels and lines up close) on the map layer — the level's background — with Foundry's grid
 * laid exactly over the map's own grid: the picture is cropped to the map's outer grid lines and scaled to CELL px a cell
 * (assets/maps/pustka.webp, 51 × 70 cells; tools/make_map_scene.py), so the scene grid needs no offsets.
 * Units: клітинки, a diagonal step counts as one cell (core world setting «gridDiagonals», EQUIDISTANT; its default is
 * set in wastelanders.mjs).
 *
 * A world gets the scene once (hidden world setting «mapSceneVersion»): it is created, made the active scene, and
 * Foundry's own starter scene is removed when nothing was put on it. Delete the scene and it stays deleted.
 * A newer MAP_SCENE_VERSION upgrades the world's scene in place (picture, size, grid); when the cell size changes,
 * tokens and journal notes on it are moved with the map, so they stay on their cells.
 * Versions: 1 — 72 px a cell; 2 — the Real-ESRGAN picture, 108 px a cell (author, 2026-11-14).
 */
export const MAP_SCENE_VERSION = 2;
export const CELL = 108;
export const COLS = 51;
export const ROWS = 70;
const LEVEL_ID = "pustkaMapLevel01";
const FOUNDRY_STARTER = "NUEDEFAULTSCENE0";

/** The scene's data (pure: tests can check it) */
export function mapSceneData(systemId) {
  const src = `systems/${systemId}/assets/maps/pustka.webp`;
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

/** Bring an older «Мапа Пустки» to this version: picture, size, grid; tokens and notes move with the map */
async function upgradeMapScene(scene, sys) {
  const data = mapSceneData(sys);
  const k = CELL / (scene.grid.size || CELL);
  await scene.update({
    width: data.width, height: data.height, padding: data.padding,
    grid: { size: CELL }, [`flags.${sys}.mapScene`]: MAP_SCENE_VERSION,
    levels: scene.levels.map((l) => (l.id === LEVEL_ID ? { _id: l.id, background: { src: data.levels[0].background.src } } : { _id: l.id })),
  });
  if (k !== 1) {
    // the padding is a whole number of cells, so every position on the canvas scales by the same factor
    const move = (c) => c.map((d) => ({ _id: d.id, x: Math.round(d.x * k), y: Math.round(d.y * k) }));
    if (scene.tokens.size) await scene.updateEmbeddedDocuments("Token", move(scene.tokens));
    if (scene.notes.size) await scene.updateEmbeddedDocuments("Note", move(scene.notes));
  }
  await thumbnail(scene);
}

/** Give the world its «Мапа Пустки» (the first GM, once), or bring the one it has to this version */
export async function ensureMapScene() {
  if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
  const sys = game.system.id;
  const had = game.settings.get(sys, "mapSceneVersion") ?? 0;
  if (had >= MAP_SCENE_VERSION) return;
  let scene = findMapScene();
  if (had > 0) {
    // the world got the map before: upgrade it in place (a deleted one stays deleted)
    if (scene) await upgradeMapScene(scene, sys);
  } else {
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
  }
  await game.settings.set(sys, "mapSceneVersion", MAP_SCENE_VERSION);
}
