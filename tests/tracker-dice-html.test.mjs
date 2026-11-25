// The HTML terminal's copy of the attack dice helpers (HTML backport 6г, 2026-11-25): «менша з 2d6» / «1d6 кинь двічі, обери
// менший» = «2d6kl1» (Цивільні, small animals), the quick «−1» / «+1». The terminal's hit.js keeps a word-for-word copy of
// LOWER_RE, lowerDice, diceLabel, bumpExpr, normDice of module/rules/battle.mjs between the marks «battle-dice»; this binds it to
// Foundry on a grid. Run: node tests/tracker-dice-html.test.mjs
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import * as B from "../module/rules/battle.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 15) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);

const FILE = new URL("../../pustelnyky_src (1)/pustelnyky_src/hit.js", import.meta.url);
if (!existsSync(FILE)) { console.log("tracker-dice-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const src = readFileSync(FILE, "utf8");
const A = src.indexOf("// == battle-dice: копія =="), Z = src.indexOf("// == battle-dice: кінець копії ==");
if (A < 0 || Z < A) throw new Error("hit.js: the marks «battle-dice» not found");
const NAMES = ["lowerDice", "diceLabel", "bumpExpr", "normDice"];
const H = vm.runInNewContext(src.slice(A, Z) + `\n({ ${NAMES.join(", ")} })`, {});

// word for word: each function of battle.mjs (and LOWER_RE) appears in the copy as it is, only without «export »
const mod = readFileSync(new URL("../module/rules/battle.mjs", import.meta.url), "utf8").replace(/\r/g, "");
const copy = src.slice(A, Z).split("\n").map((l) => l.replace(/^  /, "")).join("\n");
const lowerRe = /^const LOWER_RE = .*$/m.exec(mod)?.[0];
ok(lowerRe && copy.includes(lowerRe), "LOWER_RE: the copy differs from battle.mjs");
for (const n of NAMES) {
  const m = new RegExp(`^export function ${n}\\(.*?\\n\\}`, "ms").exec(mod)?.[0];
  ok(m && copy.includes(m.replace(/^export /, "")), `${n}: the copy differs from battle.mjs (copy it again, without «export »)`);
}

const same = (name, args) => {
  let ra, rb;
  try { ra = B[name](...args); } catch (e) { ra = "throws " + e.message; }
  try { rb = H[name](...args); } catch (e) { rb = "throws " + e.message; }
  ok(J(ra) === J(rb), `${name}(${J(args)}) = HTML ${J(rb)}, Foundry ${J(ra)}`);
};
const dice = ["", "1d6", "2d6", "d6", "к6", "2к6+1", "1d10+2", "3d6-1", "2d6kl1", "2D6KL1+1", "менша з 2d6", "менша з 2d6 + 1", "Менша із 2d6-1", "менший з 1d6", "9", "abc", null, undefined, " 2d6 "];
const notes = ["", "кинь двічі, обери менший", "кулаки, кинь двічі обери менший, ближній бій", "менша з", "менша з 2d6", "отрута", "щось менше з них", undefined];
for (const d of dice) {
  same("normDice", [d]); same("diceLabel", [d]); same("diceLabel", [B.normDice(d)]);
  for (const k of [1, -1]) { same("bumpExpr", [d, k]); same("bumpExpr", [B.normDice(d), k]); }
  for (const n of notes) same("lowerDice", [d, n]);
}
// what the tracker shows and rolls for the civilians: «1d6 кинь двічі, обери менший» → «2d6kl1» → «менша з 2d6»
ok(H.diceLabel(H.lowerDice("1d6", "кинь двічі, обери менший").dice) === "менша з 2d6", "civilians: «менша з 2d6»");
ok(H.normDice("менша з 2d6") === "2d6kl1" && H.diceLabel(H.bumpExpr(H.normDice("менша з 2d6"), 1)) === "менша з 2d6+1", "«менша з 2d6» ↔ «2d6kl1», «+1»");

// the tracker's DICE_RE (attack editor, a character's attacks) is battle.mjs's, «kl1» included (stage 4, part 2, 2026-11-25):
// the editor takes «2d6kl1» and, through normDice, «менша з 2d6»; rollSum rolls both
const trk = readFileSync(new URL("../../pustelnyky_src (1)/pustelnyky_src/tracker.js", import.meta.url), "utf8");
const dre = /^export const DICE_RE = (.*);$/m.exec(mod)?.[1];
ok(dre && trk.includes(`  const DICE_RE = ${dre}
`), `tracker.js DICE_RE differs from battle.mjs ${dre}`);
ok(trk.includes("const diceOk = d=>DICE_RE.test(normDice(d))"), "tracker.js: the editor checks the typed dice through normDice");
const DRE = new RegExp(dre.slice(1, dre.lastIndexOf("/")), dre.slice(dre.lastIndexOf("/") + 1));
for (const d of ["2d6kl1", "менша з 2d6", "2d6kl1+1", "1d10", "к6"]) ok(DRE.test(H.normDice(d)), `the editor takes «${d}»`);
for (const d of ["2d6kx", "менша з", "abc"]) ok(!DRE.test(H.normDice(d)), `the editor refuses «${d}»`);

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`tracker-dice-html: OK (${checks} checks)`);
