// The HTML terminal's copy of the damage split (A8; HTML backport 6г, row 6.16, 2026-11-25). The tracker's damage panel and a
// player's online request keep a word-for-word copy of module/rules/damage-split.mjs between the marks «damage-split» of the
// terminal's split.js; this binds it to Foundry's module on a grid of inputs (results and the mutated inputs equal).
// Run: node tests/damage-split-html.test.mjs
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import * as F from "../module/rules/damage-split.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 15) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);
const clone = (o) => (o === undefined ? undefined : JSON.parse(J(o)));

const FILE = new URL("../../pustelnyky_src (1)/pustelnyky_src/split.js", import.meta.url);
if (!existsSync(FILE)) { console.log("damage-split-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const src = readFileSync(FILE, "utf8");
const A = src.indexOf("// == damage-split: копія =="), B = src.indexOf("// == damage-split: кінець копії ==");
if (A < 0 || B < A) throw new Error("split.js: the marks «damage-split» not found");
const NAMES = Object.keys(F);
const H = vm.runInNewContext(src.slice(A, B) + `\n({ ${NAMES.join(", ")} })`, {});

// the copy is the module word for word, only without «export »
const mod = readFileSync(new URL("../module/rules/damage-split.mjs", import.meta.url), "utf8").replace(/^export /gm, "").replace(/\r/g, "");
const copy = src.slice(A, B).split("\n").slice(1).map((l) => l.replace(/^  /, "")).join("\n").replace(/\s+$/, "");
ok(copy === mod.replace(/\s+$/, ""), "split.js: the copy differs from damage-split.mjs (copy it again, without «export »)");
ok(J(NAMES.sort()) === J(["canSplit", "clampShare", "effectTargetIdle", "evenSplit", "shareCount", "splitBlock", "splitError", "splitHit", "splitLeft"]), `exports: ${J(NAMES)}`);

function same(name, args) {
  const a = clone(args), b = clone(args);
  let ra, rb, ea = "", eb = "";
  try { ra = F[name](...a); } catch (e) { ea = e.message; }
  try { rb = H[name](...b); } catch (e) { eb = e.message; }
  ok(J(ra) === J(rb) && !!ea === !!eb, `${name}(${J(args).slice(0, 120)}) = HTML ${J(rb)} ${eb}, Foundry ${J(ra)} ${ea}`);
  ok(J(a) === J(b), `${name}: inputs after differ`);
}

const nums = [undefined, null, -3, 0, 1, 2, 7, 10, 13, 99999, "5", "x", 2.5];
for (const targets of [0, 1, 2, 5]) for (const zone of [false, true]) for (const types of [1, 2]) {
  same("canSplit", [{ targets, zone, types }]); same("splitBlock", [{ targets, zone, types }]);
}
same("canSplit", []); same("splitBlock", []);
const ids = [[], ["1"], ["1", "2"], ["1", "2", "3"], ["7", "3", "12", "4"]];
for (const t of nums) for (const u of ids) same("evenSplit", [t, u]);
for (const v of nums) for (const t of nums) same("clampShare", [v, t]);
const splits = [undefined, null, {}, { 1: 4, 2: 3, 3: 3 }, { 1: 5, 2: 0 }, { 1: 0, 2: 0 }, { 1: 12, 2: 3 }, { 1: "3", 2: 2 }, { 1: -1, 2: 4 }, { 1: 2.5, 2: 1 }, [1, 2]];
for (const s of splits) for (const t of nums) {
  same("splitLeft", [s, t]);
  for (const tg of [undefined, [], ["1", "2"], ["1", "2", "3"], ["1"]]) same("splitError", [s, tg, t]);
}
for (const s of splits) for (const one of [undefined, "", "1", "2", "9"]) same("effectTargetIdle", [s, one]);
for (const n of [0, 1, 2, 3, 5, 10, 17, -2, "4", undefined]) for (const s of splits) same("shareCount", [n, s]);
const hits = [{ total: 10, type: "phys", dice: 3 }, { total: 9, type: "rad", dice: 2, poison: 3, ignoreArmor: false, ignoreN: 2, parts: [{ total: 1 }] }, { total: 6, type: "laser", dice: 0, ignoreArmor: true }];
for (const d of hits) for (const s of splits.filter((x) => x && !Array.isArray(x))) for (const one of [undefined, "1", "2"]) for (const fx of [false, true]) for (const u of ["1", "2", "3"]) {
  same("splitHit", [d, { shares: s, one, fxIgnore: fx }, u]);
}
same("splitHit", [hits[0], null, "1"]);

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`damage-split-html: OK (${checks} checks)`);
