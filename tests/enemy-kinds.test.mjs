// Group enemies made one concrete kind (module/rules/enemy-kinds.mjs; author, 2026-11-16).
// Run: node tests/enemy-kinds.test.mjs
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ENEMY_KINDS, kindsOf, kindTokens, pickKind, concreteKinds, kindOfName, namePicks } from "../module/rules/enemy-kinds.mjs";
import { variantsFor } from "../module/rules/token-variants.mjs";
import { OPPONENT_ALIASES } from "../module/applications/terminal-battle.mjs";
import { createTerminal } from "../module/rules/terminal.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };

// every group of the compendium is known, and every name that lists kinds is a group
const names = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith(".json")) { const j = JSON.parse(readFileSync(p, "utf8")); if (j.type === "enemy") names.push(j.name); } } };
walk("src/packs/opponents");
for (const g of Object.keys(ENEMY_KINDS)) ok(names.includes(g), `group «${g}» is a compendium enemy`);
for (const n of names.filter((x) => /[\/,]| та /.test(x))) ok(kindsOf(n), `«${n}» lists kinds, so it is a group`);

// every kind has its tokens, and the files are there
for (const [g, kinds] of Object.entries(ENEMY_KINDS)) for (const [k, toks] of kinds) {
  ok(toks.length > 0, `«${k}» (${g}) has tokens`);
  for (const t of toks) ok(existsSync(join("assets/tokens", t)), `token ${t} of «${k}» exists`);
  ok(kindTokens(k).length === toks.length, `kindTokens(«${k}»)`);
  ok(variantsFor(k).length > 0, `variantsFor(«${k}») finds the kind's tokens`);
}
ok(kindTokens("Рейдер").length === 11 && kindTokens("Дикун").length === 7, "raiders and savages have all their faces");

// the generator's own names find their groups through the aliases
const T = createTerminal({});
const gen = new Set();
for (const fk of Object.keys(T.battle.BT.DB)) for (const c of T.battle.BT.ORDER) for (const e of T.battle.BT.DB[fk][c] || []) gen.add(e.name);
for (const n of ["Бандит/мафіозі/рейдер/дикун", "Ватажок/Воєвода", "Мольфар/відун/дивний", "Великий бос/Вождь племені"]) {
  ok(gen.has(n), `generator has «${n}»`);
  ok(kindsOf(n, OPPONENT_ALIASES), `generator «${n}» → its group`);
}
for (const n of gen) if (/маленькі тварини|тварини побільше/i.test(n)) ok(kindsOf(n, OPPONENT_ALIASES), `generator «${n}» → its group`);
ok(!kindsOf("Касадор", OPPONENT_ALIASES) && !pickKind("Касадор"), "a single kind is no group");

// pick: always one of the group's kinds
const g0 = "Маленькі тварини та мутанти (дутні, щури, собаки, радтаргани)";
for (const r of [0, 0.3, 0.6, 0.99]) ok(["Дутень", "Щур", "Собака", "Радтарган"].includes(pickKind(g0, {}, () => r).name), `pick at ${r}`);

// a generated battle: the whole group one kind, kept through rerolls, single kinds untouched
const state = { last: { allocations: [{ entries: [{ cat: "statists", count: 3, enemy: { name: g0, hp: 2 } }, { cat: "regular", count: 1, enemy: { name: "Касадор", hp: 15 } }] }] } };
const picks = {};
const s1 = concreteKinds(structuredClone(state), picks, {}, () => 0.3);
const e1 = s1.last.allocations[0].entries;
ok(e1[0].enemy.name === "Щур" && e1[0].enemy.group === g0 && e1[0].count === 3 && e1[0].enemy.hp === 2, "the group became «Щур × 3» with the group's stats");
ok(e1[1].enemy.name === "Касадор" && !e1[1].enemy.group, "a single kind stays");
const s2 = concreteKinds(structuredClone(state), picks, {}, () => 0.99);
ok(s2.last.allocations[0].entries[0].enemy.name === "Щур", "the same kind after a reroll of the place / reward");
const s3 = concreteKinds(structuredClone(s1), {}, {}, () => 0.99);
ok(s3.last.allocations[0].entries[0].enemy.name === "Щур", "an already concrete battle is left alone");

// people: the leader and the boss follow the rank and file's kind (stress test, 2026-11-17)
const gP = "Бандити, мафіозі, рейдери та дикуни", gL = "Ватажки бандитів, мафіозі, рейдерів, дикунів", gB = "Великий бос рейдерів/Бос кримінальної родини/Вождь племені";
const CROWD = { "Бандит": ["Ватажок бандитів", "Бос бандитів"], "Мафіозі": ["Ватажок мафіозі", "Бос кримінальної родини"], "Рейдер": ["Ватажок рейдерів", "Великий бос рейдерів"], "Дикун": ["Ватажок дикунів", "Вождь племені"] };
// the boss listed first, so the order of the generator's entries doesn't decide
const people = { last: { allocations: [{ entries: [{ cat: "boss", count: 1, enemy: { name: gB } }, { cat: "elite", count: 1, enemy: { name: gL } }, { cat: "regular", count: 4, enemy: { name: gP } }] }] } };
for (const r of [0, 0.3, 0.6, 0.99]) {
  const e = concreteKinds(structuredClone(people), {}, {}, () => r).last.allocations[0].entries;
  const [boss, lead, rank] = e.map((x) => x.enemy.name);
  ok(CROWD[rank]?.[0] === lead && CROWD[rank]?.[1] === boss, `one crowd at ${r}: ${rank} / ${lead} / ${boss}`);
}
// a leader without rank and file still brings its own boss
for (const r of [0, 0.3, 0.6, 0.99]) {
  const e = concreteKinds({ last: { allocations: [{ entries: [{ cat: "boss", count: 1, enemy: { name: gB } }, { cat: "elite", count: 2, enemy: { name: gL } }] }] } }, {}, {}, () => r).last.allocations[0].entries;
  const lead = e[1].enemy.name, boss = e[0].enemy.name;
  ok(Object.values(CROWD).some(([l, b]) => l === lead && b === boss), `leader and boss at ${r}: ${lead} / ${boss}`);
}
// a kind kept through rerolls brings the others along
const pk = { [`${gP}|regular`]: "Дикун" };
const kept = concreteKinds(structuredClone(people), pk, {}, () => 0).last.allocations[0].entries.map((x) => x.enemy.name);
ok(kept[0] === "Вождь племені" && kept[1] === "Ватажок дикунів", "a kept «Дикун» brings «Ватажок дикунів» and «Вождь племені»");

// travel battles: the names say the kind, the crowd's leader and boss follow (author, 2026-11-19)
const L = kindsOf(gP);
ok(kindOfName("Рейдер 3", L) === "Рейдер" && kindOfName("Дикун-людожер", L) === "Дикун" && kindOfName("Рейдерка", L) === null, "a name that starts with a kind: «Рейдер 3», «Дикун-людожер»; «Рейдерка» is none");
ok(kindOfName("Ручний рейдер", L) === "Рейдер" && kindOfName("Мафіозний бос", kindsOf(gB)) === "Бос кримінальної родини" && kindOfName("Великий бос", kindsOf(gB)) === "Великий бос рейдерів", "the hints: «Ручний рейдер», «Мафіозний бос», «Великий бос»");
ok(kindOfName("Ватажок 2", kindsOf(gL)) === null && kindOfName("Мафіозний бос", L) === null, "«Ватажок» says no kind; a hint for another group is none");
const TT = createTerminal({});
const travel = (diff, idx) => {
  const s = TT.battle.fromTravel({ diff, idx, place: "" });
  const all = concreteKinds(structuredClone({ ...s, names: undefined }), namePicks(s.last.allocations, s.names, OPPONENT_ALIASES), OPPONENT_ALIASES).last.allocations.flatMap((a) => a.entries);
  return new Set(all.filter((e) => e.enemy.group).map((e) => e.enemy.name));
};
const WANT = {
  "light/1": ["Кротощур"], "light/8": ["Рейдер", "Ватажок рейдерів"], "medium/7": ["Рейдер", "Ватажок рейдерів"],
  "hard/2": ["Рейдер"], "hard/3": ["Дикун", "Вождь племені"], "deadly/6": ["Ватажок рейдерів", "Великий бос рейдерів"], "deadly/8": ["Бос кримінальної родини"],
};
for (const [k, want] of Object.entries(WANT)) {
  const [diff, idx] = k.split("/");
  for (let i = 0; i < 12; i++) {
    const got = [...travel(diff, +idx)].sort();
    if (JSON.stringify(got) !== JSON.stringify([...want].sort())) { ok(false, `travel ${k}: ${got} ≠ ${want}`); break; }
    if (i === 11) ok(true, `travel ${k}: ${want}`);
  }
}

if (failures) { console.log(`${failures} failure(s) of ${checks}`); process.exit(1); }
console.log(`enemy-kinds OK (${checks} checks)`);
