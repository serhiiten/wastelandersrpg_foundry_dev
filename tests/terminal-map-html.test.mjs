// «Мапа Пустки» of the HTML terminal (HTML backport stage 5: 5.5, 5.6, 6.20; 2026-11-25). The terminal's map_img.js holds the very
// bytes of Foundry's pixel map and of its two layers (tools/make_terminal_map.py), map.js copies the layers' switches
// (LAYER_TIP of map-dock.mjs: labels and tooltips, keys of faction-layer.mjs LAYERS) and the place card's free invokes
// (templates/actor/place.hbs, place-sheet.mjs #onAspInv: 0…9). This binds the copies.
// Run: node tests/terminal-map-html.test.mjs
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { hasTerminal, termSrc, modSrc } from "./html-copy.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 20) console.log("FAIL", m); } };

if (!hasTerminal("map.js") || !hasTerminal("map_img.js")) { console.log("terminal-map-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const asset = (f) => readFileSync(new URL(`../assets/maps/${f}`, import.meta.url));
const webpSize = (b) => {
  const kind = b.toString("ascii", 12, 16);
  return kind === "VP8L" ? [1 + (b.readUInt32LE(21) & 0x3fff), 1 + ((b.readUInt32LE(21) >> 14) & 0x3fff)]
    : kind === "VP8X" ? [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
    : kind === "VP8 " ? [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff] : null;
};

// 5.5 / 6.20: the pictures are Foundry's own bytes
const img = vm.runInNewContext(termSrc("map_img.js") + "\n;({ MAP_IMG, MAP_LAYER_IMG, MAP_W, MAP_H })", {});
const bytes = (url) => Buffer.from(String(url).replace(/^data:image\/webp;base64,/, ""), "base64");
ok(img.MAP_IMG.startsWith("data:image/webp;base64,") && bytes(img.MAP_IMG).equals(asset("pustka-pixel.webp")),
  "map_img.js MAP_IMG differs from assets/maps/pustka-pixel.webp (python tools/make_terminal_map.py)");
for (const [k, f] of [["factions", "pustka-factions.webp"], ["routes", "pustka-routes.webp"]])
  ok(img.MAP_LAYER_IMG?.[k] && bytes(img.MAP_LAYER_IMG[k]).equals(asset(f)), `map_img.js MAP_LAYER_IMG.${k} differs from assets/maps/${f}`);
const [w, h] = webpSize(asset("pustka-pixel.webp"));
ok(w % 72 === 0 && h % 72 === 0, `the pixel map is whole 72 px cells: ${w} × ${h}`);
ok(img.MAP_W === (w / 72) * 36 && img.MAP_H === (h / 72) * 36, `MAP_W × MAP_H = the picture's cells × 36: ${img.MAP_W} × ${img.MAP_H}`);
const map = termSrc("map.js");
ok(map.includes("var MG = {ox:0, oy:0, p:36}"), "map.js: the grid has no offset, 36 px a cell (the pixel map is cut at the grid)");

// 6.20: the layers' keys, switches' labels and tooltips are Foundry's
const FL = modSrc("module/helpers/faction-layer.mjs");
const layersSrc = /export const LAYERS = (\{[\s\S]*?\n\});/.exec(FL)?.[1];
const LAYERS = vm.runInNewContext(`(${layersSrc})`, {});
const dock = modSrc("module/applications/map-dock.mjs");
const tipSrc = /const LAYER_TIP = (\{[\s\S]*?\n\});/.exec(dock)?.[1];
const TIP = vm.runInNewContext(`(${tipSrc})`, {});
const mlSrc = /var MAP_LAYERS = (\{[\s\S]*?\n {2}\})/.exec(map)?.[1];
const ML = mlSrc ? vm.runInNewContext(`(${mlSrc})`, {}) : null;
ok(ML && JSON.stringify(Object.keys(ML)) === JSON.stringify(Object.keys(LAYERS)), `map.js MAP_LAYERS keys = faction-layer.mjs LAYERS: ${ML && Object.keys(ML)}`);
for (const k of Object.keys(LAYERS)) {
  for (const f of ["label", "off", "on"]) ok(ML?.[k]?.[f] === TIP[k]?.[f], `map.js MAP_LAYERS.${k}.${f} ≠ map-dock.mjs LAYER_TIP: «${ML?.[k]?.[f]}» / «${TIP[k]?.[f]}»`);
}
// «Шляхи» above «Фракції» (LAYERS sort), both under the grid
const tpl = termSrc("template.html");
const at = (s) => tpl.indexOf(s);
const sorted = Object.keys(LAYERS).sort((a, b) => LAYERS[a].sort - LAYERS[b].sort);
ok(at('id="map-img"') < at(`id="map-lay-${sorted[0]}"`) && at(`id="map-lay-${sorted[0]}"`) < at(`id="map-lay-${sorted[1]}"`) && at(`id="map-lay-${sorted[1]}"`) < at('class="map-grid"'),
  "template.html: the map, then the layers in Foundry's sort, then the grid");
// switches: GM only (Foundry: game.user.isGM), for everyone online (meta view.layers)
ok(/\$\{gm \? Object\.entries\(MAP_LAYERS\)/.test(map) && map.includes("if(!mapGm() || !Object.hasOwn(MAP_LAYERS, k)) return"), "map.js: only the GM switches layers");
ok(FL.includes("if (!game.user.isGM || !LAYERS[key]) return;"), "faction-layer.mjs: toggleLayer is still the GM's only");
const sync = termSrc("sync.js");
ok(sync.includes("m.view.layers = Object.assign({}, MAP.layers || {})") && sync.includes("mapLayersApply(v.layers)"), "sync.js: the GM's layers go to players with the game's view");

// 5.6: free invokes on a place's aspect, as place.hbs / place-sheet.mjs
const hbs = modSrc("templates/actor/place.hbs");
for (const t of ['title="Безкоштовні Посилення"', 'aria-label="Мінус 1 безкоштовне Посилення">−</button>', 'aria-label="Плюс 1 безкоштовне Посилення">+</button>', "<b>+{{inv}}</b>", 'class="pust-place-inv" title="Безкоштовні Посилення">+{{inv}}</b>'])
  ok(hbs.includes(t), `place.hbs still has «${t}»`);
for (const t of ['title="Безкоштовні Посилення"', 'aria-label="Мінус 1 безкоштовне Посилення">−</button>', 'aria-label="Плюс 1 безкоштовне Посилення">+</button>', "<b>+${n}</b>", 'class="mf-inv" title="Безкоштовні Посилення">+${n}</b>'])
  ok(map.includes(t), `map.js place card: «${t}»`);
ok(hbs.includes("{{#unless inv}}disabled{{/unless}}") && map.includes("${n ? '' : 'disabled'}"), "«−» disabled at 0 in both");
ok(modSrc("module/sheets/place-sheet.mjs").includes("list[i].inv = Math.max(0, Math.min(9, list[i].inv + d));"), "place-sheet.mjs: free invokes 0…9");
ok(map.includes("a.inv = Math.max(0, Math.min(9, (+a.inv || 0) + (+b.dataset.d || 0)))"), "map.js: free invokes 0…9");

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`terminal-map-html: OK (${checks} checks)`);
