/**
 * «Положення сторін» — the political layer of «Мапа Пустки» (author, 2026-11-19).
 *
 * A see-through picture over the pixel map (assets/maps/pustka-factions.webp, tools/make_faction_layer.py; the same
 * size and grid): faction territories in whole cells, contested lands double-hatched, the free tribes' lands, Сяюче
 * море, trade routes, a legend top right. It lives on the map scene as one locked Tile, flagged `factionLayer`; the
 * GM's «Фракції» in the panel «Мапа Пустки» puts it on and takes it off (the Tile is created or deleted, so the GM
 * sees no ghost of a hidden tile and everyone sees the same map). The clean map stays for one's own campaigns.
 */
import { notify } from "./notify.mjs";

export const FLAG = "factionLayer";
export const LAYER_NAME = "Положення сторін";
/** The layer's picture */
export const layerPicture = (systemId) => `systems/${systemId}/assets/maps/pustka-factions.webp`;

/** The Tile's data, laid exactly over the scene's picture (pure: tests can check it) */
export function factionTileData(systemId, dims, levelId = null) {
  return {
    name: LAYER_NAME,
    texture: { src: layerPicture(systemId) },
    x: dims.sceneX,
    y: dims.sceneY,
    width: dims.sceneWidth,
    height: dims.sceneHeight,
    elevation: 0,
    sort: 0,
    locked: true,
    hidden: false,
    alpha: 1,
    ...(levelId ? { levels: [levelId] } : {}),
    flags: { [systemId]: { [FLAG]: 1 } },
  };
}

/** The scene's layer Tile, if it is on */
export const factionTile = (scene) => scene?.tiles?.find?.((t) => t.getFlag?.(game.system.id, FLAG)) ?? null;
/** Is the layer on in the scene the GM is looking at? */
export const factionLayerOn = () => !!factionTile(canvas?.scene);

/** «Фракції»: on or off for everyone (GM only, on «Мапа Пустки» only) */
export async function toggleFactionLayer() {
  if (!game.user.isGM) return;
  const sys = game.system.id;
  const scene = canvas?.scene;
  if (!scene?.getFlag(sys, "mapScene")) return notify.warn(`Шар «${LAYER_NAME}» є лише на «Мапі Пустки».`);
  const tile = factionTile(scene);
  if (tile) return tile.delete();
  const dims = scene.dimensions ?? canvas.dimensions;
  const levelId = canvas.level?.id ?? scene.initialLevel?.id ?? null;
  return scene.createEmbeddedDocuments("Tile", [factionTileData(sys, dims, levelId)]);
}
