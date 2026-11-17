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
const L = "а-яіїєґА-ЯІЇЄҐ'’ʼ"; // a Cyrillic word's letters (\b doesn't know them)
const word = (w) => new RegExp(`(?<![${L}])${w}(?![${L}])`, "g");
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
}

console.log(failures ? `FAIL (${failures})` : `OK (${checks} checks, ${files.length} files)`);
if (failures) process.exitCode = 1;
