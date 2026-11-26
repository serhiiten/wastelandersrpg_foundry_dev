// String.replace(pattern, text) reads «$&», «$'», «$`» and «$1» inside the text as patterns, so a token or
// character name with «$» breaks the HTML (found 2026-11-26 in the terminal's cg.js and here in check-panel.mjs:487).
// Built text goes in through a function: .replace(pattern, () => text). This guard fails on any
// .replace(…, someVariable) in module/. Run: node tests/replace-text.test.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

// the rule itself, on a plain string
const name = "Боб$'з$&м";
ok("A<!--X-->B".replace("<!--X-->", () => name) === `A${name}B`, "a function keeps «$» in the text as it is");
ok("A<!--X-->B".replace("<!--X-->", name) !== `A${name}B`, "a plain string does not (why the guard exists)");

// the guard: no .replace(…, identifier) in module/
const root = fileURLToPath(new URL("..", import.meta.url));
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".mjs")) files.push(p);
  }
};
walk(join(root, "module"));
const bad = /\.replace(All)?\((?:\/(?:\\.|[^/\n])+\/[a-z]*|"(?:\\.|[^"\n])*"|'(?:\\.|[^'\n])*'),\s*[A-Za-z_$][\w$.]*\s*\)/;
for (const f of files) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    ok(!bad.test(line), `${relative(root, f).split("\\").join("/")}:${i + 1} inserts text with .replace(…, variable): use () => variable`);
  });
}
ok(files.length > 50, `module/ scanned (${files.length} files)`);

console.log(failures ? `${failures} of ${checks} checks failed` : `replace-text: all ${checks} checks pass`);
process.exit(failures ? 1 : 0);
