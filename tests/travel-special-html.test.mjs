// The HTML terminal's copy of «Особлива зустріч» rerolled (F5; HTML backport 6г, row 6.18, 2026-11-25). The terminal keeps a
// word-for-word copy of module/rules/travel-special.mjs between the marks «travel-special» of its travel_special.js (in the
// tracker's block, not in the travel files tools/port_terminal.py moves into terminal.mjs); this binds it to Foundry's module
// on real travel results of the terminal's generator, and checks that the page hands the copy the same list of encounters.
// Run: node tests/travel-special-html.test.mjs
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import * as F from "../module/rules/travel-special.mjs";
import { createTerminal } from "../module/rules/terminal.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 15) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);

const DIR = new URL("../../pustelnyky_src (1)/pustelnyky_src/", import.meta.url);
if (!existsSync(new URL("travel_special.js", DIR))) { console.log("travel-special-html: SKIP (no terminal sources next to this clone)"); process.exit(0); }
const src = readFileSync(new URL("travel_special.js", DIR), "utf8");
const A = src.indexOf("// == travel-special: копія =="), B = src.indexOf("// == travel-special: кінець копії ==");
if (A < 0 || B < A) throw new Error("travel_special.js: the marks «travel-special» not found");
const NAMES = Object.keys(F);
const H = vm.runInNewContext(src.slice(A, B) + `\n({ ${NAMES.join(", ")} })`, {});
const mod = readFileSync(new URL("../module/rules/travel-special.mjs", import.meta.url), "utf8").replace(/^export /gm, "").replace(/\r/g, "");
const copy = src.slice(A, B).split("\n").slice(1).map((l) => l.replace(/^  /, "")).join("\n").replace(/\s+$/, "");
ok(copy === mod.replace(/\s+$/, ""), "travel_special.js: the copy differs from travel-special.mjs (copy it again, without «export »)");
ok(J(NAMES.sort()) === J(["rerollSpecial", "specialLeft", "specialSeen"]), `exports: ${J(NAMES)}`);

// the page gives the copy the generator's own list, as Foundry's TravelGen.specials (port_terminal.py)
const tpl = readFileSync(new URL("template.html", DIR), "utf8");
ok(/window\.TravelGen = \{ generateEvent, specials: \(\) => specialEncounters, dice: tvDice \};/.test(tpl), "template.html: TravelGen.specials() — the generator's specialEncounters");
ok(/specials: \(\) => specialEncounters/.test(readFileSync(new URL("../module/rules/terminal.mjs", import.meta.url), "utf8")), "terminal.mjs: the same list for Foundry");

const T = createTerminal({ toast: () => {} });
const specials = T.travel.specials();
ok(specials.length === 10, "ten special encounters");
// real results of the generator, rerolled step by step with the same dice on both sides
let n = 0;
for (let i = 0; i < 3000 && n < 12; i++) {
  const r = T.travel.generate("travel", 3);
  if (!/special-encounter/.test(r.main)) continue;
  n++;
  let a = r.main, b = r.main, seed = i;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let k = 0; k < 11; k++) {
    ok(J(F.specialSeen(a, specials)) === J(H.specialSeen(b, specials)), `specialSeen, result ${n}, step ${k}`);
    ok(F.specialLeft(a, specials) === H.specialLeft(b, specials), `specialLeft, result ${n}, step ${k}`);
    const s1 = seed, na = F.rerollSpecial(a, specials, rnd); seed = s1; const nb = H.rerollSpecial(b, specials, rnd);
    ok(na === nb, `rerollSpecial, result ${n}, step ${k}`);
    if (!na) break;
    a = na; b = nb;
  }
}
ok(n >= 5, `special encounters met: ${n}`);
for (const h of ["", null, "<div>Оаза</div>", '<div class="result-section special-encounter" data-seen="x">', '<div class="result-section special-encounter" data-seen="3,7"><div class="result-title">Особлива зустріч</div><div class="result-title">Поле кроликів</div><div class="result-content"></div></div>']) {
  ok(J(F.specialSeen(h, specials)) === J(H.specialSeen(h, specials)) && F.specialLeft(h, specials) === H.specialLeft(h, specials)
    && F.rerollSpecial(h, specials, () => 0.5) === H.rerollSpecial(h, specials, () => 0.5), `edge ${J(h)?.slice(0, 60)}`);
}

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`travel-special-html: OK (${checks} checks)`);
