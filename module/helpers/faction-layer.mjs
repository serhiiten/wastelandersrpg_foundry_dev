/**
 * Layers of «Мапа Пустки» (author, 2026-11-19): see-through pictures over the pixel map (tools/make_faction_layer.py; the
 * same size and grid), each on the map scene as one locked Tile flagged `mapLayer: <key>`. The GM's switches in the row
 * «Шари:» of the panel «Мапа Пустки» put a layer on and take it off for everyone (the Tile is created or deleted, so the
 * GM sees no ghost of a hidden tile). The clean map stays for one's own campaigns.
 * - «Фракції» (`pustka-factions.webp`): «Положення сторін» — territories in whole cells, contested lands double-hatched,
 *   the free tribes, Сяюче море, the factions' tokens on their settlements, the legend top right.
 * - «Шляхи» (`pustka-routes.webp`): the trade routes, above the factions' layer.
 */
import { notify } from "./notify.mjs";

export const FLAG = "mapLayer";
export const LAYERS = {
  factions: { name: "Положення сторін", file: "pustka-factions.webp", sort: 0 },
  routes: { name: "Торгові шляхи", file: "pustka-routes.webp", sort: 1 },
};
/** A layer's picture */
export const layerPicture = (systemId, key = "factions") => `systems/${systemId}/assets/maps/${LAYERS[key].file}`;

/** A layer's Tile, laid exactly over the scene's picture (pure: tests can check it) */
export function layerTileData(systemId, key, dims, levelId = null) {
  const L = LAYERS[key];
  return {
    name: L.name,
    // Foundry 14 places a tile by its texture's anchor: the top-left corner, so x / y are the picture's corner
    texture: { src: layerPicture(systemId, key), anchorX: 0, anchorY: 0 },
    x: dims.sceneX,
    y: dims.sceneY,
    width: dims.sceneWidth,
    height: dims.sceneHeight,
    elevation: 0,
    sort: L.sort,
    locked: true,
    hidden: false,
    alpha: 1,
    ...(levelId ? { levels: [levelId] } : {}),
    flags: { [systemId]: { [FLAG]: key } },
  };
}

/** The scene's Tile of a layer, if it is on */
export const layerTile = (scene, key) => scene?.tiles?.find?.((t) => t.getFlag?.(game.system.id, FLAG) === key) ?? null;
/** Is the layer on in the scene the GM is looking at? */
export const layerOn = (key) => !!layerTile(canvas?.scene, key);

/** A switch in «Шари:»: the layer on or off for everyone (GM only, on «Мапа Пустки» only) */
export async function toggleLayer(key) {
  if (!game.user.isGM || !LAYERS[key]) return;
  const sys = game.system.id;
  const scene = canvas?.scene;
  if (!scene?.getFlag(sys, "mapScene")) return notify.warn("Шари є лише на «Мапі Пустки».");
  const tile = layerTile(scene, key);
  if (tile) return tile.delete();
  const dims = scene.dimensions ?? canvas.dimensions;
  const levelId = canvas.level?.id ?? scene.initialLevel?.id ?? null;
  return scene.createEmbeddedDocuments("Tile", [layerTileData(sys, key, dims, levelId)]);
}
