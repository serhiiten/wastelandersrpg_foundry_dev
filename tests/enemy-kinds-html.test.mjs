// The HTML terminal's twin of module/rules/enemy-kinds.mjs (its kinds.js; author, 2026-11-16 and 2026-11-19): the same
// kinds of each group, the same crowds, the same choice for the same dice, the same token sharing. kinds.js is not
// ported into Foundry (tools/port_terminal.py skips it), so this test is what keeps the two alike.
// Run: node tests/enemy-kinds-html.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ENEMY_KINDS, kindsOf, concreteKinds } from "../module/rules/enemy-kinds.mjs";
import { OPPONENT_ALIASES } from "../module/applications/terminal-battle.mjs";
import { createTerminal } from "../module/rules/terminal.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const J = (x) => JSON.stringify(x);

const SRC = new URL("../../pustelnyky_src (1)/pustelnyky_src/kinds.js", import.meta.url);
const H = JSON.parse(vm.runInNewContext(readFileSync(SRC, "utf8") + "\n;JSON.stringify({ PUST_KINDS, PUST_CROWDS })", {}));
const run = vm.runInNewContext(readFileSync(SRC, "utf8") + "\n;({ pustConcreteKinds, pustKindsOf })", {});
const htmlConcrete = (allocations, picks, rnd) => JSON.parse(J(run.pustConcreteKinds(JSON.parse(J(allocations)), picks, rnd)));

// the same groups: each HTML group (generator name) is a Foundry group through the aliases, and every Foundry group is there
const T = createTerminal({});
const gen = new Set();
for (const fk of Object.keys(T.battle.BT.DB)) for (const c of T.battle.BT.ORDER) for (const e of T.battle.BT.DB[fk][c] || []) gen.add(e.name);
const covered = new Set();
for (const [g, kinds] of Object.entries(H.PUST_KINDS)) {
  ok(gen.has(g), `«${g}» is a name of the battle generator`);
  const f = kindsOf(g, OPPONENT_ALIASES);
  ok(f, `«${g}» is a Foundry group through OPPONENT_ALIASES`);
  if (!f) continue;
  covered.add(J(f.map(([k]) => k)));
  ok(J(kinds.map(([k]) => k)) === J(f.map(([k]) => k)), `«${g}»: the same kinds in the same order (${kinds.map(([k]) => k)} | ${f.map(([k]) => k)})`);
  ok(J(kinds.map(([, t]) => t.length)) === J(f.map(([, t]) => t.length)), `«${g}»: as many tokens for each kind`);
}
for (const [g, f] of Object.entries(ENEMY_KINDS)) ok(covered.has(J(f.map(([k]) => k))), `Foundry group «${g}» has its HTML twin`);
ok(Object.keys(H.PUST_KINDS).length === Object.keys(ENEMY_KINDS).length, "six groups on both sides");

// the same «nearest token»: two kinds share their tokens in HTML exactly when they do in Foundry (Свинощур — Кротощур…)
const fTok = Object.fromEntries(Object.values(ENEMY_KINDS).flat().map(([k, t]) => [k, J(t)]));
const hTok = Object.fromEntries(Object.values(H.PUST_KINDS).flat().map(([k, t]) => [k, J(t)]));
const names = Object.keys(fTok);
for (const a of names) for (const b of names) if (a < b) ok((fTok[a] === fTok[b]) === (hTok[a] === hTok[b]), `token sharing of «${a}» and «${b}»`);
ok(hTok["Свинощур"] === hTok["Кротощур"] && hTok["Мольфар"] === hTok["Дивний"], "Свинощур shares the Кротощур's token, Мольфар the Дивний's");

// the same crowds: a kept rank and file brings the same leader and boss in Foundry as in HTML's PUST_CROWDS
const gP = "Бандит/мафіозі/рейдер/дикун", gL = "Ватажок/Воєвода", gB = "Великий бос/Вождь племені";
const people = () => [{ targetCat: "boss", entries: [{ cat: "boss", count: 1, enemy: { name: gB, hp: 30 } }] }, { targetCat: "elite", entries: [{ cat: "elite", count: 1, enemy: { name: gL, hp: 12 } }] }, { targetCat: "regular", entries: [{ cat: "regular", count: 4, enemy: { name: gP, hp: 5 } }] }];
const crowds = Object.values(H.PUST_CROWDS);
ok(crowds.length === 4 && J(crowds.map((c) => c[0]).sort()) === J(H.PUST_KINDS[gP].map(([k]) => k).sort()), "a crowd for each rank and file kind");
ok(J(crowds.map((c) => c[1]).sort()) === J(H.PUST_KINDS[gL].map(([k]) => k).sort()) && J(crowds.map((c) => c[2]).sort()) === J(H.PUST_KINDS[gB].map(([k]) => k).sort()), "each leader and each boss in one crowd");
for (const [rank, lead, boss] of crowds) {
  const s = concreteKinds({ last: { allocations: people() } }, { [`${gP}|regular`]: rank }, OPPONENT_ALIASES, () => 0);
  const [b, l] = s.last.allocations.map((a) => a.entries[0].enemy.name);
  ok(l === lead && b === boss, `Foundry's crowd of «${rank}» is «${lead}» / «${boss}» (got ${l} / ${b})`);
}

// the same choice for the same dice: Foundry's concreteKinds and HTML's pustConcreteKinds give the same battle
const lcg = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const battles = {
  people,
  leaderAndBoss: () => people().slice(0, 2),
  beasts: () => [{ targetCat: "statists", entries: [
    { cat: "statists", count: 3, enemy: { name: "Маленькі тварини/мутанти (дутні, щури, собаки, радтаргани)", hp: 2 } },
    { cat: "statists", count: 2, enemy: { name: "Тварини побільше (койоти, кротощури, свинощури, гігантські богомоли)", hp: 3 } },
    { cat: "statists", count: 1, enemy: { name: "Бойовий пес", hp: 3 } }] },
    { targetCat: "elite", entries: [{ cat: "elite", count: 2, enemy: { name: "Мольфар/відун/дивний", hp: 15 } }, { cat: "elite", count: 1, enemy: { name: "Касадор", hp: 15 } }] }],
};
for (const [name, mk] of Object.entries(battles)) {
  for (const seed of [1, 7, 42, 1234, 99991]) {
    const f = concreteKinds({ last: { allocations: mk() } }, {}, OPPONENT_ALIASES, lcg(seed)).last.allocations;
    const h = htmlConcrete(mk(), {}, lcg(seed));
    ok(J(f) === J(h), `${name}, seed ${seed}: the same battle (${h.flatMap((a) => a.entries.map((e) => e.enemy.name))})`);
  }
}
// kept picks bring the others along in both; an already concrete battle is left alone
const kept = { [`${gP}|regular`]: "Дикун" };
ok(J(concreteKinds({ last: { allocations: people() } }, { ...kept }, OPPONENT_ALIASES, () => 0).last.allocations) === J(htmlConcrete(people(), { ...kept }, () => 0)), "a kept «Дикун» — the same crowd in both");
const once = htmlConcrete(people(), {}, () => 0.6);
ok(J(htmlConcrete(once, {}, () => 0.1)) === J(once), "HTML: an already concrete battle is left alone");
ok(once.every((a) => a.entries.every((e) => e.enemy.group && e.enemy.hp)), "HTML: every group entry keeps the group's stats and its name in `group`");
ok(run.pustKindsOf("Касадор") === null && run.pustKindsOf("Бандит‑мафіозі/рейдер/дикун") !== null, "HTML: a single kind is no group; hyphens don't matter");

if (failures) { console.log(`${failures} failure(s) of ${checks}`); process.exit(1); }
console.log(`enemy-kinds-html OK (${checks} checks)`);
