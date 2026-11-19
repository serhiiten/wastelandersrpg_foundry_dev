// Layers of «Мапа Пустки»: «Фракції» and «Шляхи» (module/helpers/faction-layer.mjs). Run: node tests/faction-layer.test.mjs
import { existsSync, readFileSync } from "node:fs";

globalThis.CONST ??= { GRID_TYPES: { SQUARE: 1 } };
globalThis.game ??= { system: { id: "wastelanders-dev" }, user: { isGM: true } };
const L = await import("../module/helpers/faction-layer.mjs");

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };
const root = new URL("..", import.meta.url);

ok(JSON.stringify(Object.keys(L.LAYERS)) === '["factions","routes"]', "two layers: factions, routes");
ok(L.layerPicture("wastelanders", "factions") === "systems/wastelanders/assets/maps/pustka-factions.webp", "factions picture, stable id");
ok(L.layerPicture("wastelanders-dev", "routes") === "systems/wastelanders-dev/assets/maps/pustka-routes.webp", "routes picture, DEV id");

// each Tile lies exactly over the scene's picture (51 × 70 cells of 108 px, 5 % padding)
const dims = { sceneX: 324, sceneY: 432, sceneWidth: 5508, sceneHeight: 7560 };
for (const key of ["factions", "routes"]) {
  const t = L.layerTileData("wastelanders", key, dims, "pustkaMapLevel01");
  ok(t.x === 324 && t.y === 432 && t.width === 5508 && t.height === 7560, `${key}: laid over the scene's picture`);
  ok(t.texture.anchorX === 0 && t.texture.anchorY === 0, `${key}: anchored at the top-left corner (Foundry 14 places tiles by the anchor)`);
  ok(t.locked === true && t.hidden === false && t.alpha === 1, `${key}: locked, shown`);
  ok(t.flags.wastelanders.mapLayer === key, `${key}: flagged for its switch`);
  ok(JSON.stringify(t.levels) === '["pustkaMapLevel01"]', `${key}: on the map's level`);
}
ok(L.layerTileData("wastelanders", "factions", dims).name === "Положення сторін", "factions name");
ok(L.layerTileData("wastelanders", "routes", dims).name === "Торгові шляхи", "routes name");
ok(L.layerTileData("wastelanders", "routes", dims).sort > L.layerTileData("wastelanders", "factions", dims).sort, "routes above the factions");
ok(!("levels" in L.layerTileData("wastelanders", "factions", dims)), "no level field when the scene has none");

// a switch finds its own tile, no other
const tile = (v) => ({ getFlag: (s, k) => (s === "wastelanders-dev" && k === "mapLayer" ? v : undefined) });
ok(L.layerTile({ tiles: [tile(undefined), tile("routes"), tile("factions")] }, "factions") !== null, "finds the factions tile");
ok(L.layerTile({ tiles: [tile("routes")] }, "factions") === null, "the routes tile is not the factions one");
ok(L.layerTile({ tiles: [tile(undefined)] }, "routes") === null, "a GM's own tile is no layer");
ok(L.layerTile(null, "factions") === null, "no scene");

// the pictures ship, the map's size, see-through
for (const f of ["pustka-factions.webp", "pustka-routes.webp"]) {
  const p = `assets/maps/${f}`;
  ok(existsSync(new URL(p, root)), `${f} ships`);
  const b = readFileSync(new URL(p, root));
  const kind = b.toString("ascii", 12, 16);
  const size = kind === "VP8L" ? [1 + (b.readUInt32LE(21) & 0x3fff), 1 + ((b.readUInt32LE(21) >> 14) & 0x3fff)]
    : kind === "VP8X" ? [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)] : null;
  ok(size && size[0] === 3672 && size[1] === 5040, `${f} 3672 × 5040: ` + size);
  ok(kind === "VP8L" && ((b[24] >> 4) & 1) === 1 || kind === "VP8X" && (b[20] & 0x10), `${f} has transparency`);
}

// the GM's switches and their help
const dock = readFileSync(new URL("module/applications/map-dock.mjs", root), "utf8");
ok(dock.includes('class="pust-md-layers"') && dock.includes('pill("factions")') && dock.includes('pill("routes")'), "«Фракції» and «Шляхи» in the row «Шари»");
const tours = readFileSync(new URL("module/tours/tour-texts.mjs", root), "utf8");
ok(tours.includes('"gm-map__factions"') && tours.includes("«Шляхи»"), "tour step text names both switches");

console.log(failures ? `${failures} failed` : "faction-layer: all passed");
process.exit(failures ? 1 : 0);
