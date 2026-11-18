// «Мапа Пустки», the default scene (module/helpers/default-scene.mjs). Run: node tests/default-scene.test.mjs
import { existsSync, readFileSync } from "node:fs";

globalThis.CONST ??= { GRID_TYPES: { SQUARE: 1 } };
const S = await import("../module/helpers/default-scene.mjs");

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };
const root = new URL("..", import.meta.url);

// the pixel map (author, 2026-11-18)
ok(S.MAP_SCENE_VERSION === 3, "version 3: worlds get the pixel map");
ok(S.mapPicture("wastelanders-dev") === "systems/wastelanders-dev/assets/maps/pustka-pixel.webp", "picture path");
const d = S.mapSceneData("wastelanders");
ok(d.levels[0].background.src === "systems/wastelanders/assets/maps/pustka-pixel.webp", "new scenes get the pixel map");
ok(d.width === S.COLS * S.CELL && d.height === S.ROWS * S.CELL, "scene size unchanged");

// only the system's old picture is replaced
ok(S.isOldMapPicture("systems/wastelanders/assets/maps/pustka.webp"), "old picture, stable id");
ok(S.isOldMapPicture("systems/wastelanders-dev/assets/maps/pustka.webp"), "old picture, DEV id");
ok(!S.isOldMapPicture("systems/wastelanders/assets/maps/pustka-pixel.webp"), "the pixel map isn't old");
ok(!S.isOldMapPicture("worlds/w/maps/pustka.webp") && !S.isOldMapPicture("") && !S.isOldMapPicture(null), "the GM's own picture stays");

// both pictures ship, same size (the grid lies on both)
const size = (p) => { const b = readFileSync(new URL(p, root)); return b.toString("ascii", 12, 16) === "VP8L"
  ? [1 + (b.readUInt32LE(21) & 0x3fff), 1 + ((b.readUInt32LE(21) >> 14) & 0x3fff)]
  : b.toString("ascii", 12, 16) === "VP8X" ? [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
  : b.toString("ascii", 12, 16) === "VP8 " ? [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff] : null; };
ok(existsSync(new URL("assets/maps/pustka-pixel.webp", root)), "pixel map file");
ok(existsSync(new URL("assets/maps/pustka.webp", root)), "old map file stays (the pixel map is made from it)");
const a = size("assets/maps/pustka-pixel.webp"), b = size("assets/maps/pustka.webp");
ok(a && a[0] === 3672 && a[1] === 5040, "pixel map 3672 × 5040: " + a);
ok(b && b[0] === 3672 && b[1] === 5040, "old map 3672 × 5040: " + b);

console.log(failures ? `${failures} failed` : "default-scene: all passed");
process.exit(failures ? 1 : 0);
