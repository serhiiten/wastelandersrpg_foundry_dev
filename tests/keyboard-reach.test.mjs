// V6 (author, 2026-11-21): text not under 12 px in the system's CSS, one keyboard focus ring, Enter / Space on a
// control without its own keyboard (a tab, a roll link) clicks it. The live check is tests/ui/audit.mjs (V6).
// Run: node tests/keyboard-reach.test.mjs
import fs from "node:fs";
import { REACH, keyToClick } from "../module/helpers/keyboard-reach.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const read = (f) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

// Enter and Space click a marked element; other keys and unmarked elements are left alone
const el = (marked) => ({ clicks: 0, matches: (s) => marked && s === "[data-pust-key]", click() { this.clicks++; } });
const ev = (key, target) => ({ key, target, prevented: false, preventDefault() { this.prevented = true; } });
for (const key of ["Enter", " "]) {
  const t = el(true), e = ev(key, t);
  ok(keyToClick(e) && t.clicks === 1 && e.prevented, `«${key}» clicks a tab / roll link`);
}
{ const t = el(true); ok(!keyToClick(ev("a", t)) && t.clicks === 0, "another key does nothing"); }
{ const t = el(false); ok(!keyToClick(ev("Enter", t)) && t.clicks === 0, "Enter on an ordinary element does nothing (a button clicks itself)"); }
ok(/\[data-action\]/.test(REACH) && /nav\.pust-tabs > a/.test(REACH), "the reach covers actions and the sheet tabs");

// no text under 12 px: a size under 12 px is allowed only for icon glyphs (rules whose selectors all end in an icon)
const icon = /(\bi|\.pust-fold-ico|\.pust-qic|caret)\s*$/;
const files = fs.readdirSync(new URL("../css/", import.meta.url)).filter((f) => f.endsWith(".css"));
for (const f of files) {
  const css = read(`../css/${f}`).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    for (const d of m[2].matchAll(/font(?:-size)?\s*:[^;]*?([\d.]+)px/g)) {
      const px = parseFloat(d[1]);
      if (px > 0 && px < 12 && !sels.every((s) => icon.test(s))) ok(false, `${f}: ${sels.at(-1)} has ${px} px text (V6: at least 12)`);
      else checks++;
    }
  }
}

// one focus ring, dark inside and amber outside
const ui = read("../css/pust-ui.css");
ok(/:focus-visible[^{]*\{[^}]*outline:\s*2px solid #2a261c[^}]*box-shadow:\s*0 0 0 4px #e2ad3b/.test(ui), "the focus ring rule is in pust-ui.css");
ok(/initKeyboardReach\(\)/.test(read("../module/wastelanders.mjs")), "the system starts the keyboard reach at init");

// the chat verdict's ranges beside the sum, a row of their own only when they don't fit (author, 2026-11-21, after dev.49)
const chk = read("../css/pust-check.css");
const rr = [...chk.matchAll(/^\.pust-chat \.pust-cres \.rranges \{([^}]*)\}/gm)].map((m) => m[1]);
ok(rr.length && !rr.some((d) => /flex:\s*1 0 100%/.test(d)), "the chat ranges are not forced to a row of their own");
ok(/flex-wrap:\s*wrap/.test(rr.at(-1) ?? "") && /flex:\s*0 1 auto/.test(rr.at(-1) ?? ""), "the chat ranges wrap only when they don't fit");

console.log(failures ? `${failures} of ${checks} failed` : `keyboard-reach: ${checks}/${checks} passed`);
if (failures) process.exit(1);
