/**
 * Full gear descriptions for the catalogues («+ Річ з довідника», «+ Зброя / + Броня / + Річ»):
 * the texts of the system's item compendiums (weapons, armour, tools and chems, «Guns. Lots of Guns»).
 *
 *   await loadCatalogDescriptions()   once, on ready (the sheets read it synchronously)
 *   catalogDescription("Легка зброя") → "Ножі, кастети, …" or "" when the compendiums have no such item
 */
const PACKS = ["weapons", "armors", "tools", "guns-lots-of-guns"];
const TYPES = ["weapon", "armor", "tool", "drug"];
/** Catalogue names the compendiums spell differently */
const ALIASES = { "Розкішний довоєнний одяг": "Комплект розкішного довоєнного одягу" };

// Latin letters that look Cyrillic count as Cyrillic («C-4» = «С-4»)
const LOOKALIKE = { a: "а", c: "с", e: "е", o: "о", p: "р", x: "х", y: "у", k: "к", i: "і" };
const norm = (s) => String(s || "").toLowerCase().replace(/[’ʼ']/g, "'").replace(/[aceopxyki]/g, (ch) => LOOKALIKE[ch]).replace(/[^\p{L}\p{N}]/gu, "");
const stripSuffix = (s) => String(s || "").replace(/\s*\([^)]*\)\s*$/, "");

/** [{ keys: Set, text }] */
let entries = null;

/** HTML → one paragraph of text («<p>a</p><p>b</p>» → «a b») */
function plain(html) {
  const div = document.createElement("div");
  div.innerHTML = String(html || "").replace(/<\/(p|li|h\d)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n");
  // lines and paragraphs become sentences («Дальність: 2 зони» + «Властивість: …» → «Дальність: 2 зони. Властивість: …»)
  const parts = div.textContent.split("\n").map((x) => x.replace(/\s+/g, " ").trim()).filter(Boolean);
  return parts.map((x, i) => (i < parts.length - 1 && !/[.!?:;…]$/.test(x) ? `${x}.` : x)).join(" ");
}

export async function loadCatalogDescriptions() {
  const list = [];
  for (const name of PACKS) {
    const pack = game.packs.get(`${game.system.id}.${name}`);
    if (!pack) continue;
    const index = await pack.getIndex({ fields: ["type", "system.description"] });
    for (const e of index) {
      if (!TYPES.includes(e.type)) continue;
      const text = plain(e.system?.description);
      // «Плазмова граната, постріл з важкої ракетниці або заряд С-4» answers to each of its names;
      // the base book's packs come first, so their text wins over the add-on's short one
      const names = stripSuffix(e.name).split(/,\s*|\s+або\s+|\s+чи\s+/);
      if (text) list.push({ keys: new Set([norm(e.name), norm(stripSuffix(e.name)), ...names.map(norm)].filter(Boolean)), text });
    }
  }
  entries = list;
  return list.length;
}

/** The compendium text for a catalogue name: the same name (without «(легкий)» and the like), else one that contains it */
export function catalogDescription(name) {
  if (!entries) return "";
  name = ALIASES[name] || name;
  const key = norm(name);
  if (!key) return "";
  const hit = entries.find((e) => e.keys.has(key)) || entries.find((e) => e.keys.has(norm(stripSuffix(name))))
    || (key.length >= 6 ? entries.find((e) => [...e.keys].some((k) => k.includes(key))) : null);
  return hit?.text || "";
}
