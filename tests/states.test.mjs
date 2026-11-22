// The states enemies' moves put on characters and enemies (author, 2026-11-20; module/rules/states.mjs): in force while the
// aspect is on, put on again refreshes, the tick at ▶ «Коло дій», the armour, the stun once a scene.
// Run: node tests/states.test.mjs
import * as S from "../module/rules/states.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// the aspects are the quick aspects' words for the three of them (battle.mjs QUICK_ASPECTS), masculine
eq([S.STATES.down.aspect, S.STATES.stunned.aspect, S.STATES.disarmed.aspect], ["Збитий з ніг", "Приголомшений", "Без зброї"], "quick aspects' texts");
eq(S.STATE_ASPECTS.length, 12, "twelve states (the roar's of stage 3, «Притиснутий вогнем» of П3)");
{ // П3 3.5: the words of an immunity to a state's aspect
  eq([S.aspectImmune("Без зброї", { noDisarm: true }), S.aspectImmune("Збитий з ніг", { noKnockdown: true }), S.aspectImmune("Приголомшений", { noStun: true }),
    S.aspectImmune("Палає", { fire: "immune" }), S.aspectImmune("Палає", { fire: "half" }), S.aspectImmune("Отруєний", { poison: "immune" }),
    S.aspectImmune("Кровотеча", { nonliving: true }), S.aspectImmune("Мокрий", { noDisarm: true }), S.aspectImmune("Без зброї", {})],
  ["не можна обеззброїти", "не можна збити з ніг", "не можна приголомшити", "невразливий до вогню", "", "невразливий до отрут", "неживий", "", ""], "aspectImmune");
}
{ // «Притиснутий вогнем» (П3 3.1): put on in round 2, gone at ▶ to 3, kept at a second ▶ to 2
  const p = S.putState([], "pin", { round: 2 });
  ok(S.tickStates(p, 2).next.length === 1, "pin: the same round keeps it");
  const t = S.tickStates(p, 3);
  ok(!t.next.length && t.gone.join() === "pin" && !t.hits.length, "pin: gone at the next round, no damage");
  ok(S.putState(p, "pin", { round: 3 })[0].since === 3, "pinned again later: it counts from the new round");
  eq(S.stateWords({ key: "pin" }), "«Притиснутий вогнем» (до кінця кола дій)", "pin's words");
  ok(!S.immuneTo("pin", { noKnockdown: true, noStun: true, noDisarm: true, nonliving: true }), "no immunity to pin");
}

// in force only while the aspect is on
let list = S.putState([], "poisoned", { dice: "1d6", left: 3, round: 2, by: "T1" });
eq(S.activeStates(list, ["Отруєний"]).length, 1, "poisoned in force with its aspect");
eq(S.activeStates(list, ["надійне укриття"]).length, 0, "the aspect deleted: the state is gone");

// again: the longer, the bigger, no stacking
list = S.putState(list, "poisoned", { dice: "1d10", left: 2, round: 3 });
eq([list.length, list[0].dice, list[0].left], [1, "1d10", 3], "refreshed: one state, 1d10, 3 rounds");
eq(S.biggerDice("2d6", "3d6"), "3d6", "bigger dice");

// the tick: not in the round it was put on, once a round, `left` down to 0
let t = S.tickStates(list, 2);
eq(t.hits.length, 0, "no tick in the round it was put on");
t = S.tickStates(list, 3);
eq([t.hits.length, t.next[0].left, t.gone.length], [1, 2, 0], "round 3: a hit, 2 left");
eq(S.tickStates(t.next, 3).hits.length, 0, "◀ ▶ to the same round ticks no more");
t = S.tickStates(S.tickStates(t.next, 4).next, 5);
eq([t.hits.length, t.gone], [1, ["poisoned"]], "the last tick takes it off");

// bleeding and the «Підпал» burn: once
t = S.tickStates(S.putState([], "bleeding", { dice: "1d10", left: 1, round: 1 }), 2);
eq([t.hits.length, t.hits[0].ignoreArmor, t.gone], [1, true, ["bleeding"]], "bleeding: one tick ignoring armour");

// stunned: skip at the first tick, gone at the second
const s1 = S.putState([], "stunned", { round: 1 });
t = S.tickStates(s1, 2);
ok(t.skip && !t.gone.length, "stunned: skips the action at the first tick");
t = S.tickStates(t.next, 3);
ok(!t.skip && t.gone[0] === "stunned", "stunned: gone at the second");

// grabbed: while the holder stands
const g = S.putState([], "grabbed", { dice: "2d6", by: "YAO", round: 1 });
eq(S.tickStates(g, 2, { holderOk: () => true }).hits[0].dice, "2d6", "grabbed: 2d6 while held");
eq(S.tickStates(g, 2, { holderOk: () => false }).gone, ["grabbed"], "grabbed: free when the holder is gone");

// knocked down, the acid: no tick
eq(S.tickStates(S.putState([], "down", { round: 1 }), 2).hits.length, 0, "down: no damage");
const acid = S.putState([], "acid", { round: 1 });
eq(S.withStates({ armor: 1 }, acid).armor, 0, "−2 armour, never below 0");
eq(S.withStates({ armor: 4 }, acid).armor, 2, "−2 armour");

// immunity, the stun once a scene
ok(S.immuneTo("down", { noKnockdown: true }) && !S.immuneTo("down", {}) && !S.immuneTo("poisoned", { noKnockdown: true }), "immunity");
ok(S.immuneTo("poisoned", { poison: "immune" }) && !S.immuneTo("poisoned", { poison: "half" }) && S.immuneTo("burning", { fire: "immune" }) && !S.immuneTo("burning", { fire: "normal" }), "immune to poisons / fire: no «Отруєний» / «Палає»; a half still gets it");
ok(!S.immuneTo("bleeding", { poison: "immune", fire: "immune" }) && S.immuneTo("bleeding", { nonliving: true }), "bleeding: only «Неживий» is immune");
// «Неживий» of an enemy (author, 2026-11-20): the GM's tick, else the compendium's 15, else a machine's name immune to poisons
eq(S.NONLIVING_BOOK.length, 15, "the compendium's non-living");
ok(S.enemyNonliving(null, ["БТР Братства Сталі"]) && S.enemyNonliving(null, ["Робомозок"]) && S.enemyNonliving(null, ["Секʼюритрон"]), "by the book's name");
ok(!S.enemyNonliving(null, ["Кіберпес"], { def: { poison: "normal" } }), "«Кіберпес» is alive");
ok(S.enemyNonliving(null, ["Робот-охоронець"], { def: { poison: "immune" } }) && !S.enemyNonliving(null, ["Робот-охоронець"], { def: { poison: "normal" } }), "a generator's robot: a machine's name and immune to poisons");
ok(!S.enemyNonliving(false, ["Протектрон"]) && S.enemyNonliving(true, ["Легіонер"]), "the GM's tick wins");
const once = S.markStunned({}, "R1");
ok(S.stunnedBefore(once, "R1") && !S.stunnedBefore(once, "R2"), "the stun once a scene by the same enemy");

eq(S.stateWords({ key: "burning", dice: "1d6", type: "fire", left: 3 }), "«Палає» (1d6 вогнем щоразу, 3 кола)", "the card's words");
eq(S.stateWords({ key: "bleeding", dice: "1d6", left: 1, ignoreArmor: true }), "«Кровотеча» (1d6 раз, коли настане черга діяти, броня не рятує)", "once");

// «Улюблений ворог»'s mutants (stage 3, author 2026-11-20): the compendium's two folders and the generator's three factions
{
  const { readFileSync, readdirSync } = await import("node:fs");
  const { join, resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { createTerminal } = await import("../module/rules/terminal.mjs");
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(join(d, x.name)) : [join(d, x.name)]));
  const pack = [];
  for (const top of readdirSync(join(ROOT, "src/packs/opponents")).filter((d) => /^(Мутанти|Гулі_та_супермутанти)_/.test(d))) {
    for (const f of walk(join(ROOT, "src/packs/opponents", top)).filter((f) => f.endsWith(".json"))) {
      const j = JSON.parse(readFileSync(f, "utf8"));
      if (j.type === "enemy") pack.push(j.name);
    }
  }
  ok(pack.length === S.MUTANT_BOOK.length && pack.every((n) => S.enemyMutant([n])), `MUTANT_BOOK = the compendium's mutants: ${pack.join(", ")}`);
  const DB = createTerminal({ toast: () => {}, icon: () => "" }).battle.BT.DB;
  const gen = ["mutants", "ghouls", "supermutants"].flatMap((f) => ["statists", "regular", "elite", "boss"].flatMap((c) => (DB[f][c] ?? []).map((r) => r.name ?? r.n)));
  const miss = gen.filter((n) => !S.enemyMutant([n]));
  ok(gen.length > 10 && !miss.length, `the generator's mutants by name: missing ${miss.join(", ")}`);
  ok(!S.enemyMutant(["Рейдер", "Легат"]) && S.enemyMutant(["Супермутант‑майстер 2", "Супермутант-майстер"]), "others aren't; names with the generator's hyphen are");
  eq(S.MUTANT_SPECIES, ["ghoul", "mutant", "claw"], "the characters' species");
}

// «Приголомшливий рев» (stage 3): −2 to the next check, not on the non-living, no tick, its words
{
  const R = S.STATES.roar;
  ok(R.aspect === "−2 до наступної перевірки" && R.check === -2 && R.until === "check", "the roar's state");
  ok(S.immuneTo("roar", { nonliving: true }) && !S.immuneTo("roar", { nonliving: false }), "a robot doesn't hear it");
  const on = S.putState([], "roar", { round: 1 });
  const t = S.tickStates(on, 3);
  ok(t.next.length === 1 && !t.gone.length && !t.hits.length, "▶ doesn't take it off: it waits for the check");
  ok(S.stateWords({ key: "roar" }) === "«−2 до наступної перевірки» (зникне після кидка)", `its words: ${S.stateWords({ key: "roar" })}`);
}

console.log(failures ? `FAILS: ${failures} of ${checks}` : `states: OK (${checks} checks)`);
if (failures) process.exit(1);
