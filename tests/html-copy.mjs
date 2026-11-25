// Shared by the HTML terminal's copy tests (stage 4 of the HTML backport, 2026-11-25): where the terminal sources are, and how
// a marked copy in them is compared with the Foundry module it copies («export » dropped, CR dropped, trailing spaces trimmed).
import { readFileSync, existsSync } from "node:fs";

export const TERM = new URL("../../pustelnyky_src (1)/pustelnyky_src/", import.meta.url);
export const hasTerminal = (file) => existsSync(new URL(file, TERM));
export const termSrc = (file) => readFileSync(new URL(file, TERM), "utf8").replace(/\r/g, "");
export const modSrc = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8").replace(/\r/g, "");
export const unexport = (s) => s.replace(/^export /gm, "").replace(/\s+$/, "");

/** The text between «// == name: копія ==» and «// == name: кінець копії ==» (marks excluded) */
export function marked(src, name) {
  const a = src.indexOf(`// == ${name}: копія ==\n`), b = src.indexOf(`// == ${name}: кінець копії ==`);
  if (a < 0 || b < a) throw new Error(`the marks «${name}» not found`);
  return src.slice(a + `// == ${name}: копія ==\n`.length, b).replace(/\s+$/, "");
}

/** Lines of `src` from the first line starting with `start` up to (not including) the first later line starting with `end` */
export function lines(src, start, end = null) {
  const L = src.split("\n");
  const i = L.findIndex((l) => l.startsWith(start));
  if (i < 0) throw new Error(`no line «${start}»`);
  const j = end == null ? L.length : L.findIndex((l, k) => k > i && l.startsWith(end));
  if (j < 0) throw new Error(`no line «${end}»`);
  return L.slice(i, j).join("\n");
}
