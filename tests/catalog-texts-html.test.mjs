// The HTML character sheet's gear catalogue shows the same full texts as Foundry's (backport row 5.7, 2026-11-25).
// Foundry reads them from the item compendiums at runtime (module/applications/catalog-descriptions.mjs); the sheet
// has no compendiums, so tools/catalog_texts.mjs writes Foundry's answers into the sheet's
// src/catalog_texts.js. This test runs the real module over the compendium sources (src/packs/) for every name of
// the catalogue (core.mjs catalogAll(true)) and checks the sheet's file says exactly that, nothing more or less.
// Run: node tests/catalog-texts-html.test.mjs   (tools/catalog_texts.mjs imports catalogTexts / renderTextsFile)
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";
import { needSiblings } from "./sibling.mjs";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", mdash: "—", ndash: "–", hellip: "…", rsquo: "’" };
/** What a browser's element.textContent gives for an innerHTML (tags dropped, entities decoded) */
function textContent(html) {
  return String(html).replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") return String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    if (!(e in ENTITIES)) throw new Error(`unknown HTML entity ${m}: add it to ENTITIES`);
    return ENTITIES[e];
  });
}

/** A compendium's documents as Foundry's index lists them (LevelDB order: by key «!items!<id>») */
function packDocs(dir) {
  const out = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith(".json") && f !== "_Folder.json") out.push(JSON.parse(readFileSync(p, "utf8"))); } };
  walk(dir);
  return out.filter((x) => String(x._key || "").startsWith("!items!")).sort((a, b) => (a._key < b._key ? -1 : a._key > b._key ? 1 : 0));
}

/** { catalogue name: Foundry's full text } for every name that has one, in the catalogue's order */
export async function catalogTexts(foundryDir) {
  const root = pathToFileURL(foundryDir.endsWith(path.sep) ? foundryDir : foundryDir + path.sep);
  const { id } = JSON.parse(readFileSync(new URL("system.json", root), "utf8"));
  globalThis.document = { createElement: () => ({ _h: "", set innerHTML(h) { this._h = h; }, get textContent() { return textContent(this._h); } }) };
  globalThis.game = {
    system: { id },
    packs: { get: (key) => {
      const name = key.slice(id.length + 1);
      const dir = fileURLToPath(new URL(`src/packs/${name}`, root));
      try { statSync(dir); } catch { return undefined; }
      const docs = packDocs(dir);
      return { getIndex: async () => docs.map((x) => ({ _id: x._id, name: x.name, type: x.type, system: { description: x.system?.description } })) };
    } },
  };
  const mod = await import(new URL("module/applications/catalog-descriptions.mjs", root).href);
  const { catalogAll } = await import(new URL("module/rules/core.mjs", root).href);
  const n = await mod.loadCatalogDescriptions();
  if (!n) throw new Error("no compendium texts read");
  const out = {};
  for (const e of catalogAll(true)) { const t = mod.catalogDescription(e.n); if (t && !(e.n in out)) out[e.n] = t; }
  return out;
}

/** The sheet's data file, byte for byte */
export function renderTextsFile(texts) {
  return "// Згенеровано tools/catalog_texts.mjs з компендіумів Foundry (src/packs/ ← вікі). Руками не правити: запусти скрипт ще раз.\n"
    + "// Повні тексти речей довідника за назвою — те саме, що дає module/applications/catalog-descriptions.mjs (рядок 5.7).\n"
    + "const CATALOG_TEXTS = {\n"
    + Object.entries(texts).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},\n`).join("")
    + "};\n";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failures = 0, checks = 0;
  const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 12) console.log("FAIL", m); } };
  const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const want = await catalogTexts(here);
  needSiblings(["pustelnyky-character-generator/src/catalog_texts.js", "pustelnyky-character-generator/src/app.js", "pustelnyky-character-generator/src/build.py"]);
  const file = new URL("../../pustelnyky-character-generator/src/catalog_texts.js", import.meta.url);
  const src = readFileSync(file, "utf8");
  const got = vm.runInNewContext(src + "\nCATALOG_TEXTS", {});
  const { catalogAll } = await import("../module/rules/core.mjs");
  for (const e of catalogAll(true)) ok((got[e.n] || "") === (want[e.n] || ""), `«${e.n}»: sheet ${JSON.stringify(got[e.n] || "").slice(0, 90)} / Foundry ${JSON.stringify(want[e.n] || "").slice(0, 90)}`);
  for (const k of Object.keys(got)) ok(k in want, `the sheet has a text for «${k}», Foundry has none`);
  ok(Object.keys(want).length > 0, "Foundry gives no texts at all");
  ok(src === renderTextsFile(want), "catalog_texts.js differs from the script's output (order or format): run node tools/catalog_texts.mjs");
  // the sheet shows them: the catalogue row takes CATALOG_TEXTS before its short note, as character-view.mjs catDesc
  const app = readFileSync(new URL("../../pustelnyky-character-generator/src/app.js", import.meta.url), "utf8");
  const build = readFileSync(new URL("../../pustelnyky-character-generator/src/build.py", import.meta.url), "utf8");
  ok(/CATALOG_TEXTS\[e\.n\]/.test(app), "app.js catListHtml does not read CATALOG_TEXTS[e.n]");
  ok(build.includes("catalog_texts.js"), "build.py does not embed catalog_texts.js");
  console.log(failures ? `${failures} of ${checks} checks failed` : `ok: ${Object.keys(want).length} texts of ${catalogAll(true).length} catalogue names, ${checks} checks`);
  process.exit(failures ? 1 : 0);
}
