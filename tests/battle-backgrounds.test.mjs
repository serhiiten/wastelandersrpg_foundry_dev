// Battle backgrounds by place (module/rules/battle-backgrounds.mjs). Run: node tests/battle-backgrounds.test.mjs
import { readFileSync, existsSync } from "node:fs";
import * as B from "../module/rules/battle-backgrounds.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };
const root = new URL("..", import.meta.url);

// the table is the terminal's, row for row
const src = readFileSync(new URL("module/rules/terminal.mjs", root), "utf8");
const m = /const places = \[([\s\S]*?)\];/.exec(src);
const terminalPlaces = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
ok(terminalPlaces.length === 36, "terminal has 36 places: " + terminalPlaces.length);
ok(JSON.stringify(terminalPlaces) === JSON.stringify(B.PLACE_NAMES), "PLACE_NAMES = the terminal's places");

// every row: its own key, found by its own name (and by the generators' shapes of it)
const keys = B.BATTLE_BACKGROUNDS.map((b) => b.key);
ok(new Set(keys).size === 36, "36 distinct keys");
ok(keys[0] === "11" && keys[5] === "16" && keys[6] === "21" && keys[35] === "66", "keys are 2d6 numbers: " + keys.join(","));
B.PLACE_NAMES.forEach((n, i) => ok(B.placeBgKey(n) === B.keyOf(i), `name → key: ${n} → ${B.placeBgKey(n)}`));
for (const t of ["Сховище 47", "Сховище номер (d100)", "Сховище номер(d100)", "сховище 3", "Сховище (d100)"]) ok(B.placeBgKey(t) === "23", "vault: " + t);
ok(B.placeBgKey("  мотель   з БАРОМ ") === "54", "case and spaces");
ok(B.placeBgKey("Водойма, що світиться від радіації") === "64", "comma kept");
ok(B.placeBgKey("Руїни вежі") === null && B.placeBgKey("") === null && B.placeBgKey(null) === null, "no match → null");
ok(B.placeBgKey("Сховище 47 і ферма") === null, "a longer text is not a place");

// the choice
ok(B.wantedBg(undefined, "Ферма") === "11" && B.wantedBg("auto", "Сховище 13") === "23", "auto → the place's");
ok(B.wantedBg("auto", "Руїни вежі") === B.SAND && B.wantedBg("auto", "") === B.SAND, "auto, no match → sand");
ok(B.wantedBg("54", "Ферма") === "54" && B.wantedBg("sand", "Ферма") === B.SAND, "a manual choice wins");
ok(B.wantedBg("99", "Ферма") === "11", "a bad flag counts as auto");

// files
ok(B.bgSrc("wastelanders-dev", "54") === "systems/wastelanders-dev/assets/maps/battle/p54.webp", "src");
ok(B.bgSrc("wastelanders", B.SAND) === "systems/wastelanders/assets/maps/battle-sand.webp", "sand src");
ok(B.bgThumb("x", "11") === "systems/x/assets/maps/battle/p11-thumb.webp", "thumb");
ok(B.isOwnBackground("") && B.isOwnBackground(null), "none counts as ours");
ok(B.isOwnBackground("systems/wastelanders/assets/maps/battle/p66.webp") && B.isOwnBackground("systems/wastelanders-dev/assets/maps/battle-sand.webp"), "ours, any system id");
ok(!B.isOwnBackground("worlds/w/maps/cave.webp") && !B.isOwnBackground("systems/x/assets/maps/battle/p77.webp") && !B.isOwnBackground("systems/x/assets/maps/pustka.webp"), "the GM's own picture isn't ours");
ok(B.bgKeyOfSrc("systems/wastelanders/assets/maps/battle/p54.webp") === "54" && B.bgKeyOfSrc("systems/x/assets/maps/battle-sand.webp?123") === "sand", "key of a picture");
ok(B.bgKeyOfSrc("worlds/w/cave.webp") === null && B.bgKeyOfSrc("") === null, "not ours → null");
ok(B.bgName("auto") === "Авто за місцем" && B.bgName("sand") === "Стандартний (пісок)" && B.bgName("23") === "Сховище", "names");
ok(B.BATTLE_BACKGROUNDS.every((b) => /^#[0-9a-f]{6}$/i.test(b.color)), "every background has an edge colour");

// the files are shipped (once made)
const dir = new URL("assets/maps/battle/", root);
if (existsSync(dir)) for (const k of keys) {
  ok(existsSync(new URL(`p${k}.webp`, dir)), `file p${k}.webp`);
  ok(existsSync(new URL(`p${k}-thumb.webp`, dir)), `file p${k}-thumb.webp`);
}
ok(existsSync(new URL("assets/maps/battle-sand-thumb.webp", root)), "sand thumb");

console.log(failures ? `${failures} FAILED` : "battle-backgrounds: all ok");
process.exit(failures ? 1 : 0);
