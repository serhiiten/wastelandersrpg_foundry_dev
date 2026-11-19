// The «opponents» compendium against the wiki (author, 2026-11-19): every robot is immune to poisons and psychic damage
// and takes ½ from radiation («Супротивники: роботи», the page's note); Робомозок takes psychic damage, the giant
// robo-scorpion X-42 is immune to radiation. The defences live in src/packs/opponents (system.def and system.orig.def);
// tools/wiki_sync/sync_opponents.py never writes them, so this test is their guard.
// When the wiki (F:\Claude\pustelnyky\wiki, the Notion export) is next to the repo, the expected table is checked against it too.
// Run: node tests/opponents.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { profileOf } from "../module/rules/enemy-model.mjs";
import { computeDamage, enemyTraits } from "../module/rules/battle.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

// the wiki's robots and their defences: [rad, poison, psy, psyVuln]
const ROBOT = ["half", "immune", "immune", false];
const EXPECTED = {
  "Робооко": ROBOT, "Бум-око": ROBOT,
  "Містер Помічник": ROBOT, "Протектрон": ROBOT, "Турель": ROBOT, "Робо-скорпіон Mk1": ROBOT,
  "Містер Сміливець": ROBOT, "Секʼюритрон": ROBOT, "Важка турель": ROBOT, "Робо-скорпіон Mk6": ROBOT,
  "Робомозок": ["half", "immune", "normal", true],
  "Робот-вартовий": ROBOT,
  "Гігантський робо-скорпіон X-42": ["immune", "immune", "immune", false],
};

// the compendium's robots
const robots = {};
const packDir = join(ROOT, "src/packs/opponents");
const folder = readdirSync(packDir).find((d) => d.startsWith("Роботи_"));
ok(!!folder, "the opponents compendium has the folder «Роботи»");
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith(".json")) { const j = JSON.parse(readFileSync(p, "utf8")); if (j.type === "enemy") robots[j.name] = j; } } };
if (folder) walk(join(packDir, folder));
ok(Object.keys(robots).sort().join("|") === Object.keys(EXPECTED).sort().join("|"), `the robots are the wiki's 13: ${Object.keys(robots).join(", ")}`);

const RES = ["rad", "poison", "psy"];
for (const [name, [rad, poison, psy, psyVuln]] of Object.entries(EXPECTED)) {
  const e = robots[name];
  if (!e) { ok(false, `«${name}» is in the compendium`); continue; }
  const want = { rad, poison, psy };
  for (const [where, def] of [["def", e.system.def], ["orig.def", e.system.orig?.def]]) {
    for (const k of RES) ok(def?.[k] === want[k], `«${name}» ${where}.${k} = ${want[k]} (is ${def?.[k]})`);
    for (const k of ["phys", "energy", "fire"]) ok(def?.[k] === "normal", `«${name}» ${where}.${k} stays normal`);
  }
  for (const [where, fl] of [["flags", e.system.flags], ["orig.flags", e.system.orig?.flags]]) {
    ok(!!fl?.psyVuln === psyVuln, `«${name}» ${where}.psyVuln = ${psyVuln}`);
    ok(fl?.electricVuln === true, `«${name}» ${where}.electricVuln (+1d6 from electricity)`);
  }
  // what the battle does with a 6-damage hit of each type
  const p = profileOf(e.system);
  const hit = (type) => computeDamage(p, 6, type).final;
  ok(hit("rad") === (rad === "immune" ? 0 : 3), `«${name}» takes ${rad === "immune" ? 0 : 3} of 6 radiation (${hit("rad")})`);
  ok(hit("poison") === 0, `«${name}» takes no poison (${hit("poison")})`);
  ok(hit("psychic") === (psy === "immune" ? 0 : Math.max(0, 6 - (p.psyArmor || 0))), `«${name}» psychic damage (${hit("psychic")})`);
}

// the expected table against the wiki's page, when the wiki is there
const WIKI = resolve(ROOT, "..", "wiki");
const page = existsSync(WIKI) && readdirSync(WIKI).find((f) => f.startsWith("Супротивники роботи") && f.endsWith(".md"));
if (page) {
  const md = readFileSync(join(WIKI, page), "utf8");
  ok(/Всі роботи невразливі до отрут, психічної шкоди та отримують лише половину шкоди від радіації/.test(md), "the wiki's note: robots immune to poisons and psychic damage, ½ from radiation");
  ok(/Всі роботи отримують додатково 1d6 шкоди, коли отримують \*{0,3}електричну/.test(md), "the wiki's note: robots +1d6 from electricity");
  const blocks = md.split(/^### /m).slice(1);
  const wikiNames = blocks.map((b) => b.split(/\r?\n/)[0].trim());
  ok(wikiNames.sort().join("|") === Object.keys(EXPECTED).sort().join("|"), `the wiki's robots are the table's: ${wikiNames.join(", ")}`);
  for (const b of blocks) {
    const name = b.split(/\r?\n/)[0].trim();
    const armor = (b.match(/\*\*Броня:\*\*\s*(.+)/) || [])[1] || "";
    const t = enemyTraits({ armor });
    const want = [t.immuneRad ? "immune" : "half", "immune", t.psyVuln ? "normal" : "immune", t.psyVuln];
    ok(JSON.stringify(EXPECTED[name]) === JSON.stringify(want), `«${name}» in the wiki: ${JSON.stringify(want)} (armour line «${armor}»)`);
  }
} else console.log("(the wiki isn't next to the repo: the table isn't checked against it)");

if (failures) { console.log(`${failures} failure(s) of ${checks}`); process.exit(1); }
console.log(`opponents OK (${checks} checks)`);
