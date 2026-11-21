// The system's fonts and style files (V5, V7; author, 2026-11-21): every font comes from assets/fonts, nothing from the
// internet, no handwritten font; each stylesheet of system.json is loaded once (no @import of another), and no two files
// declare @keyframes of the same name (the later one silently wins: the sheet's flash used to show the dock's yellow).
// Run: node tests/fonts.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

const sys = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
ok(sys.styles[0] === "css/pust-fonts.css", "system.json loads css/pust-fonts.css first");
const cssFiles = fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css"));
for (const f of cssFiles) ok(sys.styles.includes(`css/${f}`), `${f} is listed in system.json`);

const frames = new Map();
for (const f of cssFiles) {
  const s = fs.readFileSync(path.join(ROOT, "css", f), "utf8");
  ok(!/@import\b/.test(s), `${f}: no @import (every file is listed in system.json once)`);
  ok(!/fonts\.(googleapis|gstatic)\.com|https?:\/\/[^)"']+\.(woff2?|ttf|otf)/.test(s), `${f}: no font from the internet`);
  ok(!/Marck Script|--pu-f-hand/.test(s), `${f}: no handwritten font (V5)`);
  ok(!/\bScada\b/.test(s), `${f}: no Scada (not loaded since V7; reviewer, author 2026-11-21)`);
  ok(!/(^|\})\s*\.window-app\s*\{[^}]*font-family/m.test(s), `${f}: no font for every .window-app (other modules' windows keep Foundry's)`);
  for (const m of s.matchAll(/@keyframes\s+([\w-]+)/g)) {
    ok(!frames.has(m[1]), `@keyframes ${m[1]} declared once (${f}${frames.has(m[1]) ? ", " + frames.get(m[1]) : ""})`);
    frames.set(m[1], f);
  }
}

const fonts = fs.readFileSync(path.join(ROOT, "css/pust-fonts.css"), "utf8");
const fams = new Set();
for (const m of fonts.matchAll(/@font-face\s*\{([^}]*)\}/g)) {
  const fam = /font-family:\s*"([^"]+)"/.exec(m[1])?.[1];
  const url = /url\("\.\.\/(assets\/fonts\/[^"]+)"\)/.exec(m[1])?.[1];
  fams.add(fam);
  ok(url && fs.existsSync(path.join(ROOT, url)), `@font-face ${fam}: its file ${url} is in the repository`);
}
for (const f of ["Roboto Condensed", "Ubuntu Mono", "Handjet"]) ok(fams.has(f), `${f} is declared in pust-fonts.css`);
for (const l of ["OFL-RobotoCondensed.txt", "OFL-Handjet.txt", "UFL-UbuntuMono.txt", "README.md"]) ok(fs.existsSync(path.join(ROOT, "assets/fonts", l)), `assets/fonts/${l} is there`);

// the canvas draws only fonts the system loads (token.mjs asked for PT Mono, which nothing loads)
for (const f of ["module/canvas/token.mjs", "module/canvas/battle-zones.mjs", "module/canvas/map-notes.mjs"]) {
  const s = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const m of s.matchAll(/fontFamily:\s*"([^"]+)"/g)) ok(/^(Roboto Condensed|Ubuntu Mono|Handjet|Font Awesome)/.test(m[1]), `${f}: canvas font «${m[1]}» is one the system loads`);
}

console.log(`fonts: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
