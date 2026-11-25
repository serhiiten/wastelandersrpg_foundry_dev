// Terms as the wiki has them (author, 2026-11-15): a guard against made-up words in what we — and the subagents we brief —
// write. It checks the code's names of attributes, skills and species against the wiki's glossary and pages, every
// «Назва (СКОР)» pair in the sources, maps from attribute codes to names, and a list of words the project never uses.
// The wiki (F:\Claude\pustelnyky\wiki, the Notion export) is the authority: when it is next to the repo, the canonical lists
// below are checked against it first; without it they still guard the sources.
// Run: node tests/terms.test.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as C from "../module/rules/core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIKI = path.resolve(ROOT, "..", "wiki");
let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

/* ---------- the canonical terms (from the wiki's «Глосарій ігрових термінів», «Атрибути», «Навички», «Види») ---------- */
const ATTRS = { SL: ["Сила", "СЛ"], SPR: ["Сприйняття", "СПР"], VTR: ["Витривалість", "ВТР"], PV: ["Привабливість", "ПВ"], IN: ["Інтелект", "ІН"], VP: ["Вправність", "ВП"], UDCH: ["Удача", "УДЧ"] };
const SKILLS = ["Атлетика", "Крадіж", "Стрільба", "Герць", "Медицина", "Техніка", "Знання", "Виживання", "Маніпуляція", "Примус"];
const SPECIES = { human: "Людина", ghoul: "Гуль", mutant: "Супермутант", robot: "Робот", claw: "Розумний Пазур Смерті" };

/* ---------- 1. the canonical lists agree with the wiki ---------- */
const wikiFile = (prefix) => {
  if (!fs.existsSync(WIKI)) return null;
  const f = fs.readdirSync(WIKI).find((n) => n.startsWith(prefix) && n.endsWith(".md"));
  return f ? fs.readFileSync(path.join(WIKI, f), "utf8") : null;
};
const glossary = wikiFile("Глосарій ігрових термінів");
if (glossary) {
  for (const [, [n, s]] of Object.entries(ATTRS)) ok(glossary.includes(`${n} (${s})`), `wiki glossary: «${n} (${s})»`);
  const skillLine = glossary.split("\n").find((l) => l.includes("Усього навичок")) ?? "";
  for (const s of SKILLS) ok(skillLine.includes(s), `wiki glossary: skill «${s}»`);
  const species = wikiFile("Види ") ?? "";
  for (const n of Object.values(SPECIES)) ok(new RegExp(`^## ${n}\\s*$`, "m").test(species), `wiki «Види»: «${n}»`);
} else console.log("(no wiki next to the repo: the canonical lists are not re-checked against it)");

/* ---------- 2. the rules engine uses them ---------- */
for (const [k, [, s]] of Object.entries(ATTRS)) ok(C.ASHORT[k] === s, `core ASHORT.${k} = «${s}», got «${C.ASHORT[k]}»`);
ok(JSON.stringify(C.SKILLS) === JSON.stringify(SKILLS), `core SKILLS = the wiki's ten: ${JSON.stringify(C.SKILLS)}`);
for (const [k, n] of Object.entries(SPECIES)) ok(C.SPECIES[k]?.n === n, `core SPECIES.${k}.n = «${n}», got «${C.SPECIES[k]?.n}»`);

/* ---------- 3. the sources ---------- */
const SCAN = ["module", "templates", "lang", "tests"];
const SKIP = new Set(["terms.test.mjs"]); // this file names the wrong words on purpose
const files = [];
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(mjs|js|hbs|json|html)$/.test(e.name) && !SKIP.has(e.name)) files.push(p);
  }
};
SCAN.forEach((d) => fs.existsSync(path.join(ROOT, d)) && walk(path.join(ROOT, d)));
// The HTML tools' sources next to the repo (the workspace, 2026-11-19, backport row 1.4): the character sheet, the caravan
// sheet, the «Термінал Доглядача». Left out: their builds, vendored libraries, tests, and the terminal's embedded copies of
// the sheets (cg_src.html, cg_embed.js, car_src.html, car_embed.js) — refreshed from the standalone sheets once a stage (0.8)
const HTML_TOOLS = ["pustelnyky-character-generator/src", "pustelnyky-caravan/src", "pustelnyky_src (1)/pustelnyky_src"];
const HTML_SKIP = /^(build|dist|vendor|tests|originals|docs|mapsrc|fonts|reference|node_modules|tok_car|out)$|^(cg_src\.html|cg_embed\.js|car_src\.html|car_embed\.js|character_generator\.html)$/;
const walkHtml = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (HTML_SKIP.test(e.name)) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walkHtml(p);
    else if (/\.(js|html|json)$/.test(e.name)) files.push(p);
  }
};
const htmlRoots = HTML_TOOLS.map((d) => path.resolve(ROOT, "..", d)).filter((d) => fs.existsSync(d));
htmlRoots.forEach(walkHtml);
if (!htmlRoots.length) console.log("(no HTML tools next to the repo: their sources are not checked)");
const L = "а-яіїєґА-ЯІЇЄҐ'’ʼ"; // a Cyrillic word's letters (\b doesn't know them)
// an apostrophe is part of a word only between letters (м'ясо): a quote right before or after the term ('Кубика Долі')
// must not hide it
const CYR = "а-яіїєґА-ЯІЇЄҐ";
const word = (w) => new RegExp(`(?<![${CYR}]['’ʼ]?)(?:${w})(?!['’ʼ]?[${CYR}])`, "g");
const where = (rel, text, i) => `${rel}:${text.slice(0, i).split("\n").length}`;

const NAME_OF = Object.fromEntries(Object.values(ATTRS).map(([n, s]) => [s, n]));
const SHORT_OF = Object.fromEntries(Object.values(ATTRS).map(([n, s]) => [n, s]));
// words the project never uses for these meanings (CLAUDE.md «Terms», the wiki); [regex source, what to write instead]
const FORBIDDEN = [
  ["[Пп]сі(?:оні[кч][а-яіїєґ]*|-[а-яіїєґ]+)?", "пси / псионіка / псионік"],
  // «псиоників» (author, 2026-11-16): the word keeps its «і» — псионік, псионіка, псионіків, псионічний
  ["[Пп]сион(?!і)[а-яіїєґ]*", "псионік / псионіка / псионіків"],
  ["ГМ", "Доглядач"],
  ["[Мм]айстер гри", "Доглядач"],
  ["НПС|НПЦ|НПК", "НІП"],
  ["[Кк]убик[а-яіїєґ]* [Дд]олі", "кістка Долі"],
  ["[Пп]апк[а-яіїєґ]*", "тека"],
  ["[Оо]чк[а-яіїєґ]* життя", "очки здоров'я (ОЗ)"],
];
// «карта» for playing cards, where the sources have it (the terminal's travel events and the «Мапа Пустки» aspects)
const PLAYING_CARDS = /(грають|гри|програв) [ув] карти|[Вв]орожка з картами|картах Таро|по одній карті|витягне карту/;
// a made-up attribute name is caught where it names an attribute (the maps and pairs below): «спритність» and
// «передбачливість» are ordinary words elsewhere
// attribute codes mapped to a name in the code: { SL: "…", SPR: '…' } — the name must be the wiki's full or short one
const CODE_MAP = new RegExp(`\\b(${Object.keys(ATTRS).join("|")})\\s*:\\s*["'\`]([${L} ]+)["'\`]`, "g");

for (const f of files) {
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  const text = fs.readFileSync(f, "utf8");
  // «Назва (СКОР)»: a full attribute name and its abbreviation belong together
  for (const m of text.matchAll(new RegExp(`(?<![${L}])([${L}]+) \\((СЛ|СПР|ВТР|ПВ|ІН|ВП|УДЧ)\\)`, "g"))) {
    const [, n, s] = m;
    if (SHORT_OF[n] || /^[А-ЯІЇЄҐ]/.test(n)) ok(NAME_OF[s] === n, `${where(rel, text, m.index)}: «${n} (${s})» — the wiki has «${NAME_OF[s]} (${s})»`);
  }
  for (const m of text.matchAll(CODE_MAP)) {
    const [, k, v] = m;
    const [n, s] = ATTRS[k];
    if (/^[А-ЯІЇЄҐа-яіїєґ]/.test(v)) ok(v === n || v === s || v.toLowerCase() === n.toLowerCase(), `${where(rel, text, m.index)}: ${k} named «${v}» — the wiki has «${n}» / «${s}»`);
  }
  for (const [re, instead] of FORBIDDEN) {
    for (const m of text.matchAll(word(re))) ok(false, `${where(rel, text, m.index)}: «${m[0]}» — write «${instead}»`);
  }
  // «мапа», never «карта», for a map (author, 2026-11-21): playing cards keep «карти» (the phrases below); «картка» is
  // another word and doesn't match
  for (const m of text.matchAll(word("[Кк]арт(?:а|и|і|у|ою|ам|ами|ах)"))) {
    const around = text.slice(Math.max(0, m.index - 30), m.index + m[0].length + 10);
    if (!PLAYING_CARDS.test(around)) ok(false, `${where(rel, text, m.index)}: «${m[0]}» — write «мапа» (for playing cards, add the phrase to PLAYING_CARDS)`);
  }
  // «кубик» in what Foundry shows (author, 2026-11-20, F8 of Fable's analysis): the wiki says «кістка». The system's own
  // files and, since 2026-11-25 (author: «у HTML теж»), the HTML character sheet's sources, which Foundry's rules are made
  // from, and the terminal's own sources; not comments. The terminal's embedded sheets (cg_src.html → cg_embed.js, still
  // with 8 «кубик») are skipped above until stage 0.8 replaces them; build.py (its patches search for the old «кубик»)
  // isn't walked. The caravan sheet is not checked for it yet.
  const kubik = !rel.startsWith("..") || rel.startsWith("../pustelnyky-character-generator/") || rel.startsWith("../pustelnyky_src (1)/");
  if (kubik && !rel.startsWith("tests/")) {
    text.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      const code = line.replace(/\/\*.*?\*\//g, "").replace(/\s\/\/\s.*$/, "").replace(/\s\/\*.*$/, "");
      for (const m of code.matchAll(word("[Кк]убик[а-яіїєґ]*"))) ok(false, `${rel}:${i + 1}: «${m[0]}» — write «кістка»`);
    });
  }
}

/* ---------- the states enemies' moves put on (author, 2026-11-20: the wiki's words he proofread, always masculine) ---------- */
{
  const { STATE_ASPECTS } = await import("../module/rules/states.mjs");
  const { QUICK_ASPECTS } = await import("../module/rules/battle.mjs");
  const APPROVED = ["Збитий з ніг", "Приголомшений", "Без зброї", "Палає", "Захоплений", "Отруєний", "Кровотеча", "Засліплений", "На прицілі", "−2 до фізичної броні", "−2 до наступної перевірки", "Притиснутий вогнем"];
  ok(JSON.stringify(STATE_ASPECTS) === JSON.stringify(APPROVED), `states' aspects = the author's list: ${JSON.stringify(STATE_ASPECTS)}`);
  for (const [, t] of QUICK_ASPECTS) ok(STATE_ASPECTS.includes(t), `quick aspect «${t}» is a state's aspect`);
}

/* ---------- the settlements' background names (author, 2026-11-25): the wiki's names of the towns ---------- */
{
  const { TOWN_BACKGROUNDS } = await import("../module/rules/battle-backgrounds.mjs");
  // the shared cards' group names were the author's (decision sheet 2026-11-23); «Військова база Сієрра» is not in the wiki,
  // it reads so on «Мапа Пустки» (docs/decisions/map-and-panels.md, batch 4); the wiki has the dam only declined («дамбу /
  // дамби Гувера»), checked by its stem
  const NOT_WIKI = new Set(["Міста гулів", "Сховища", "Фермерські містечка", "Руїни військових баз", "Військова база Сієрра"]);
  const STEM = { "Дамба Гувера": "дамб" };
  if (fs.existsSync(WIKI)) {
    const text = fs.readdirSync(WIKI).filter((n) => n.endsWith(".md")).map((n) => fs.readFileSync(path.join(WIKI, n), "utf8")).join(" ").toLowerCase();
    for (const b of TOWN_BACKGROUNDS) if (!NOT_WIKI.has(b.name)) ok(STEM[b.name] ? new RegExp(`${STEM[b.name]}[а-яії]* гувера`).test(text) : text.includes(b.name.toLowerCase()), `settlement «${b.name}» is in the wiki`);
  }
}

console.log(failures ? `FAIL (${failures})` : `OK (${checks} checks, ${files.length} files)`);
if (failures) process.exitCode = 1;
