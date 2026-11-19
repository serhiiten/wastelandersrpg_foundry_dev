// «Положення сторін», the political layer of «Мапа Пустки» (module/helpers/faction-layer.mjs). Run: node tests/faction-layer.test.mjs
import { existsSync, readFileSync } from "node:fs";

globalThis.CONST ??= { GRID_TYPES: { SQUARE: 1 } };
globalThis.game ??= { system: { id: "wastelanders-dev" }, user: { isGM: true } };
const L = await import("../module/helpers/faction-layer.mjs");

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };
const root = new URL("..", import.meta.url);

ok(L.layerPicture("wastelanders") === "systems/wastelanders/assets/maps/pustka-factions.webp", "picture path, stable id");
ok(L.layerPicture("wastelanders-dev") === "systems/wastelanders-dev/assets/maps/pustka-factions.webp", "picture path, DEV id");

// the Tile lies exactly over the scene's picture (51 × 70 cells of 108 px, 5 % padding)
const dims = { sceneX: 324, sceneY: 432, sceneWidth: 5508, sceneHeight: 7560 };
const t = L.factionTileData("wastelanders", dims, "pustkaMapLevel01");
ok(t.x === 324 && t.y === 432 && t.width === 5508 && t.height === 7560, "laid over the scene's picture");
ok(t.locked === true && t.hidden === false && t.alpha === 1, "locked, shown");
ok(t.flags.wastelanders.factionLayer === 1, "flagged for the toggle");
ok(t.name === "Положення сторін", "name");
ok(JSON.stringify(t.levels) === '["pustkaMapLevel01"]', "on the map's level");
ok(!("levels" in L.factionTileData("wastelanders", dims)), "no level field when the scene has none");

// the toggle finds its own tile, no other
const tile = (flag) => ({ getFlag: (s, k) => (s === "wastelanders-dev" && k === "factionLayer" ? flag : undefined) });
ok(L.factionTile({ tiles: [tile(undefined), tile(1)] }) !== null, "finds the layer tile");
ok(L.factionTile({ tiles: [tile(undefined)] }) === null, "a GM's own tile is not the layer");
ok(L.factionTile(null) === null, "no scene");

// the picture ships, the map's size (the grid lies on both)
const p = "assets/maps/pustka-factions.webp";
ok(existsSync(new URL(p, root)), "layer file");
const b = readFileSync(new URL(p, root));
const kind = b.toString("ascii", 12, 16);
const size = kind === "VP8L" ? [1 + (b.readUInt32LE(21) & 0x3fff), 1 + ((b.readUInt32LE(21) >> 14) & 0x3fff)]
  : kind === "VP8X" ? [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)] : null;
ok(size && size[0] === 3672 && size[1] === 5040, "layer 3672 × 5040: " + size);
ok(kind === "VP8L" && ((b[24] >> 4) & 1) === 1 || kind === "VP8X" && (b[20] & 0x10), "layer has transparency");

// the GM's button and its help
const dock = readFileSync(new URL("module/applications/map-dock.mjs", root), "utf8");
ok(dock.includes('btn("factions", "fa-flag", "Фракції"'), "«Фракції» in the panel «Мапа Пустки»");
const tours = readFileSync(new URL("module/tours/tour-texts.mjs", root), "utf8");
ok(tours.includes('"gm-map__factions"'), "tour step text");

console.log(failures ? `${failures} failed` : "faction-layer: all passed");
process.exit(failures ? 1 : 0);
