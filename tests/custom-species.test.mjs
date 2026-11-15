// Custom species (species builder; author 2026-11-15): st.species stays the base id, st.speciesX lies over it — name, limits, the
// species' OWN absolute HP bonus / armour / perk / skill and defences (they replace the base's native values, see speciesNative), texts; the adapter keeps it in the .json and finds
// the base by it; the controller sets it and a plain species clears it.
// Run: node tests/custom-species.test.mjs
import * as Rc from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { createController } from "../module/rules/controller.mjs";
import { actorToState, stateToActor } from "../module/rules/character-adapter.mjs";
import { characterProfileFromState } from "../module/rules/target-profile.mjs";
import { speciesDefaults, speciesShort, speciesToX } from "../module/rules/designer.mjs";

const { SPECIES } = Rc;
let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures < 40) console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

function state(base, x = null, perks = []) {
  const st = Rc.blankState();
  st.species = base;
  st.feats = [];
  st.perks = perks.map((n) => ({ n }));
  st.set.free = false;
  if (x) st.speciesX = speciesToX({ ...speciesDefaults(base), n: "Нічний " + SPECIES[base].n.toLowerCase(), ...x });
  return st;
}
// the base's own values (author, 2026-11-15)
const N = { rad: "normal", poison: "normal", psy: "normal" };
const NATIVE = {
  human: { hp: 0, armor: 0, perk: 1, skill: 1, def: { ...N } },
  ghoul: { hp: 0, armor: 0, perk: 0, skill: 0, def: { ...N, rad: "heal", poison: "half" } },
  mutant: { hp: 5, armor: 0, perk: 0, skill: 0, def: { ...N, rad: "immune" } },
  robot: { hp: 0, armor: 2, perk: 0, skill: 0, def: { rad: "half", poison: "immune", psy: "immune" } },
  claw: { hp: 5, armor: 1, perk: 0, skill: 0, def: { ...N } },
};
const def = (st) => createLogic({ st, toast: () => {} }).defAuto(Rc.compute(st));

// ---- the defaults and the short text ----
for (const b of Object.keys(SPECIES)) {
  const x = speciesDefaults(b);
  const nat = NATIVE[b];
  eq([x.base, x.hp, x.armor, x.perk, x.skill, x.def], [b, nat.hp, nat.armor, nat.perk, nat.skill, nat.def], `${b}: defaults are the base's native values`);
  eq(Rc.speciesNative(b), { hp: nat.hp, armor: nat.armor, perk: nat.perk, skill: nat.skill, def: nat.def }, `${b}: speciesNative`);
  eq(x.b, SPECIES[b].b, `${b}: limits copied`);
  ok(x.b !== SPECIES[b].b && x.b.SL !== SPECIES[b].b.SL, `${b}: the limits are a copy`);
  eq(x.props, SPECIES[b].props, `${b}: props copied`);
  ok(speciesToX(x) === null, `${b}: no name, no species`);
}
ok(speciesToX({ ...speciesDefaults("ghoul"), n: "  " }) === null && speciesToX({ n: "Х", base: "elf" }) === null, "no name / unknown base");
const sx = speciesToX({ ...speciesDefaults("ghoul"), n: "Нічний гуль", hp: "3", armor: 1.4, perk: 1, skill: 1, def: { rad: "immune", poison: "normal", psy: "bogus" }, short: "" });
eq([sx.hp, sx.armor, sx.def], [3, 1, { rad: "immune", poison: "normal", psy: "normal" }], "speciesToX: whole numbers, only known defences, «normal» kept");
const short = speciesShort({ n: "Нічний гуль", base: "ghoul", props: ["Довголіття: довго.", "Стійкість до отрут: ½."], hp: 3, armor: 1, perk: 1, skill: 1, def: { rad: "immune", poison: "half", psy: "half" } });
eq(short, "Нічний гуль: довголіття; стійкість до отрут; +3 ОЗ; броня 1; радіація: імунітет; психічна шкода: ½ шкоди; додаткових перків на старті: 1; додаткових навичок учня на старті: 1.", "speciesShort lists only what differs from the base");
for (const b of Object.keys(SPECIES)) {
  eq(speciesShort({ ...speciesDefaults(b), n: "Х", props: [] }), "Х: .", `${b}: a species identical to its base has nothing to list`);
}
ok(sx.short === speciesShort(sx), "speciesToX builds the short text when it is empty");

// ---- limits ----
{
  const st = state("ghoul", { b: { ...speciesDefaults("ghoul").b, SL: [-2, 3, 4], IN: [0, 0, 1] } });
  const d = Rc.compute(st);
  eq([d.bounds.SL.min, d.bounds.SL.start, d.bounds.SL.max], [-2, 3, 4], "SL limits");
  eq([d.bounds.IN.min, d.bounds.IN.start, d.bounds.IN.max], [0, 0, 1], "IN limits");
  eq([d.bounds.SPR.min, d.bounds.SPR.start, d.bounds.SPR.max], [SPECIES.ghoul.b.SPR[0], SPECIES.ghoul.b.SPR[1], SPECIES.ghoul.b.SPR[2]], "other limits are the base's");
  // the plain species is not touched
  eq(SPECIES.ghoul.b.SL, [-1, 1, 2], "the book's ghoul is unchanged");
  // a bad limit is ignored, not a crash
  const bad = Rc.blankState(); bad.species = "ghoul"; bad.speciesX = { n: "X", base: "ghoul", b: { SL: [1, "x", 3], IN: "no" } };
  eq(Rc.compute(bad).bounds.SL.max, 2, "a bad limit falls back to the base's");
}

// ---- HP, armour, perks, skills: the species' own values REPLACE the base's ----
const snap = (st) => { const d = Rc.compute(st); return [d.hp, d.natArmor, d.armorTotal, d.perkSlots, d.sk.base, d.human]; };
for (const b of Object.keys(SPECIES)) {
  const plain = state(b);
  // identical to its base: behaves exactly like the base
  eq(snap(state(b, {})), snap(plain), `${b}: a species identical to its base: HP / armour / slots`);
  eq(def(state(b, {})), def(plain), `${b}: ...and the same defences`);
  eq(characterProfileFromState(state(b, {})), characterProfileFromState(plain), `${b}: ...and the same target profile`);
  const nat = NATIVE[b], p = Rc.compute(plain);
  // one value at a time: the result is relative to the base's native value
  eq(Rc.compute(state(b, { hp: nat.hp + 4 })).hp - p.hp, 4, `${b}: HP bonus ${nat.hp + 4}`);
  eq(Rc.compute(state(b, { hp: 0 })).hp - p.hp, -nat.hp, `${b}: HP bonus 0 loses the base's ${nat.hp}`);
  eq(Rc.compute(state(b, { hp: -3 })).hp - p.hp, -3 - nat.hp, `${b}: the HP bonus may be negative`);
  eq(Rc.compute(state(b, { armor: 3 })).natArmor, 3, `${b}: natural armour 3 is 3, not the base's + 3`);
  eq(Rc.compute(state(b, { armor: 0 })).natArmor, 0, `${b}: natural armour 0 loses the base's ${nat.armor}`);
  eq(Rc.compute(state(b, { perk: 0 })).perkSlots - p.perkSlots, -nat.perk, `${b}: perk 0`);
  eq(Rc.compute(state(b, { perk: 2 })).perkSlots - p.perkSlots, 2 - nat.perk, `${b}: perk 2`);
  eq(Rc.compute(state(b, { skill: 0 })).sk.base - p.sk.base, -nat.skill, `${b}: skill 0`);
  eq(Rc.compute(state(b, { skill: 2 })).sk.base - p.sk.base, 2 - nat.skill, `${b}: skill 2`);
}
ok(snap(state("human", { perk: 0 }))[3] === snap(state("human"))[3] - 1, "a human-based species with perk 0 has no extra perk");
ok(Rc.compute(state("mutant", { hp: 0 })).hp === Rc.compute(state("mutant")).hp - 5, "a mutant-based species with hp 0 loses the +5");
ok(Rc.compute(state("human", { skill: 1 })).human === true, "a human-based species is human to the rules");
// the HP of a custom ghoul of the example in the plan
{
  const st = state("ghoul", { hp: 2, armor: 1 });
  const p = Rc.compute(state("ghoul"));
  eq([Rc.compute(st).hp, Rc.compute(st).armorTotal], [p.hp + 2, p.armorTotal + 1], "Нічний гуль: HP and armour");
}

// ---- defences: the species' own levels replace the base's lines; half counts as one source ----
const lv = (st) => { const d = def(st); return [d.rad, d.poison, d.psy]; };
for (const b of Object.keys(SPECIES)) {
  for (const perks of [[], ["Свинцева шкіра"], ["Стійкість до отрут"]]) {
    eq(lv(state(b, {}, perks)), lv(state(b, null, perks)), `${b}: identical species, same defences with ${perks.join() || "no perks"}`);
  }
}
for (const base of ["human", "claw"]) {
  eq(lv(state(base)), ["normal", "normal", "normal"], `${base}: no defences by default`);
  eq(lv(state(base, { def: { rad: "half", poison: "half", psy: "half" } })), ["half", "half", "half"], `${base}: half x3`);
  eq(lv(state(base, { def: { rad: "immune", poison: "immune", psy: "immune" } })), ["immune", "immune", "immune"], `${base}: immunity x3`);
  eq(def(state(base, { def: { rad: "heal" } })).rad, "heal", `${base}: radiation heals`);
  // with a perk it counts as one more source: half + half = immunity
  eq(def(state(base, { def: { rad: "half" } }, ["Свинцева шкіра"])).rad, "immune", `${base}: half + Свинцева шкіра = immunity`);
  eq(def(state(base, { def: { poison: "half" } }, ["Стійкість до отрут"])).poison, "immune", `${base}: half + Стійкість до отрут = immunity`);
  eq(def(state(base, {}, ["Свинцева шкіра"])).rad, "half", `${base}: Свинцева шкіра alone = half`);
}
// a psychic half on a human base; the line names the species
{
  const st = state("human", { def: { psy: "half" } });
  eq(def(st).psy, "half", "human-based: psychic half");
  ok(createLogic({ st, toast: () => {} }).defensesAuto(Rc.compute(st)).some((l) => /^Психічна шкода: ½ шкоди \(Нічний людина\)/.test(l[1])), "the psychic line names the species");
}
// a ghoul base: radiation heals, poison half; the species' own levels replace them
{
  eq(lv(state("ghoul")), ["heal", "half", "normal"], "ghoul: base defences");
  eq(def(state("ghoul", { def: { ...N } })).rad, "normal", "ghoul-based with radiation normal loses the healing");
  eq(def(state("ghoul", { def: { ...N } })).poison, "normal", "ghoul-based with poison normal loses the half");
  eq(def(state("ghoul", { def: { rad: "heal", poison: "half" } })).poison, "half", "ghoul-based poison half stays half (not immunity)");
  eq(def(state("ghoul", { def: { rad: "heal", poison: "immune" } })).poison, "immune", "ghoul-based poison immune");
  eq(def(state("ghoul", { def: { rad: "half", poison: "half" } })).rad, "half", "ghoul-based radiation half is half (no healing)");
  eq(def(state("ghoul", { def: { rad: "half", poison: "half" } }, ["Свинцева шкіра"])).rad, "immune", "ghoul-based rad half + Свинцева шкіра = immunity");
  eq(def(state("ghoul", { def: { rad: "half", poison: "half" } }, ["Свинцева шкіра"])).poison, "half", "...poison untouched by it");
}
// a robot base (non-cyborg): half radiation, immune to poison and psychic; the species' own levels replace them
{
  eq(lv(state("robot")), ["half", "immune", "immune"], "robot: base defences");
  eq(lv(state("robot", { def: { ...N } })), ["normal", "normal", "normal"], "robot-based with all normal loses all of it");
  eq(def(state("robot", { def: { rad: "half", poison: "immune", psy: "immune" } })).rad, "half", "robot-based: radiation half stays half");
  eq(def(state("robot", { def: { rad: "immune", poison: "immune", psy: "immune" } })).rad, "immune", "robot-based: radiation immunity");
  eq(def(state("robot", { def: { rad: "half", poison: "half", psy: "half" } })).psy, "half", "robot-based: psychic half replaces immunity");
  eq(def(state("robot", { def: { rad: "half", poison: "half", psy: "half" } })).poison, "half", "robot-based: poison half replaces immunity");
  eq(Rc.compute(state("robot", { armor: 3 })).natArmor, 3, "robot-based armour 3 is 3");
  // a robot with «Кіборг» ignores the species' values, like the base
  for (const xd of [{ ...N }, { rad: "immune", poison: "immune", psy: "immune" }]) {
    const a = state("robot", { def: xd }), b = state("robot");
    a.feats = ["Кіборг"]; b.feats = ["Кіборг"];
    eq(lv(a), lv(b), "robot-based with Кіборг ignores the species' defences " + JSON.stringify(xd));
  }
}
// a mutant base: radiation immune; the species' own level replaces it
eq(def(state("mutant", { def: { rad: "half" } })).rad, "half", "mutant-based: radiation half replaces the immunity");
eq(def(state("mutant", { def: { ...N } })).rad, "normal", "mutant-based: radiation normal");
eq(def(state("mutant", { def: { rad: "immune" } })).rad, "immune", "mutant-based: radiation immune");
// the target profile (what the damage uses) sees the same
{
  const st = state("human", { def: { rad: "half", poison: "immune", psy: "half" } });
  const prof = characterProfileFromState(st);
  eq([prof.rad, prof.poison, prof.psy], ["half", "immune", "half"], "target profile");
}
// the manual defences of the sheet still combine with it
{
  const st = state("human", { def: { rad: "half" } });
  st.defOv = { rad: "half" };
  eq(characterProfileFromState(st).rad, "immune", "½ of the species + ½ by hand = immunity");
}
// the lines of «Захист» name the species
{
  const st = state("human", { def: { rad: "half" } });
  const L = createLogic({ st, toast: () => {} });
  ok(L.defensesAuto(Rc.compute(st)).some((l) => /^Радіація: ½ шкоди \(Нічний людина\)/.test(l[1])), "the defence line names the species");
}

// ---- names and texts ----
{
  const st = state("ghoul", { hp: 2, props: ["Нічне бачення: бачить у темряві."] });
  eq(Rc.spOf(st).n, "Нічний гуль", "spOf name");
  eq(Rc.spOf(st).props, ["Нічне бачення: бачить у темряві."], "spOf props");
  ok(Rc.spOf(st).short.startsWith("Нічний гуль:"), "spOf short");
  ok(Rc.speciesShort(st).startsWith("Нічний гуль:"), "core speciesShort uses it: " + Rc.speciesShort(st).slice(0, 40));
  const text = Rc.buildText(st);
  ok(text.includes("Вид: Нічний гуль") && text.includes("ВЛАСТИВОСТІ ВИДУ — НІЧНИЙ ГУЛЬ") && text.includes("• Нічне бачення"), "buildText");
  ok(!text.includes("Довголіття"), "buildText: the base's properties are replaced");
  eq(Rc.spOf(Rc.blankState()).n, "Людина", "no extra: the plain species");
  const stale = state("ghoul", {}); stale.species = "robot";
  eq(Rc.spOf(stale).n, "Робот", "an extra of another base doesn't apply");
  eq(Rc.compute(stale).hp, Rc.compute(Object.assign(state("robot"))).hp, "…and gives nothing");
  const unknown = Rc.blankState(); unknown.species = "elf";
  eq(Rc.spOf(unknown).n, "Людина", "an unknown species is a human");
}

// ---- the adapter and the .json ----
{
  const st = state("ghoul", { hp: 2, armor: 1, def: { rad: "half" }, perk: 1, skill: 1, b: { ...speciesDefaults("ghoul").b, SL: [-2, 3, 4] } });
  const actor = stateToActor(st);
  const spItem = actor.items.find((i) => i.type === "species");
  eq(spItem.name, "Нічний гуль", "species item carries the custom name");
  const back = actorToState(JSON.parse(JSON.stringify(actor)));
  eq(back.species, "ghoul", "round trip: base");
  eq(back.speciesX, st.speciesX, "round trip: speciesX");
  eq(Rc.compute(back).hp, Rc.compute(st).hp, "round trip: same HP");
  // JSON round trip of the whole state (the HTML sheet's .json keeps unknown keys)
  const again = actorToState(stateToActor(JSON.parse(JSON.stringify(back))));
  eq(again.speciesX, st.speciesX, "second round trip");
  // the species item with an unknown name
  const odd = JSON.parse(JSON.stringify(actor));
  odd.items.find((i) => i.type === "species").name = "Щось дивне";
  eq(actorToState(odd).species, "ghoul", "unknown name + speciesX → the base");
  delete odd.system.engine.extra.speciesX;
  eq(actorToState(odd).species, "human", "unknown name, no speciesX → human");
  // the plain species
  const plain = actorToState(stateToActor(state("robot")));
  eq([plain.species, plain.speciesX], ["robot", undefined], "a plain species has no extra");
}

// ---- the controller ----
{
  const st = state("human");
  const L = createLogic({ st, toast: () => {} });
  const toasts = [];
  const C = createController(st, L, { toast: (m) => toasts.push(m) });
  const x = { ...speciesDefaults("ghoul"), n: "Нічний гуль", hp: 2 };
  ok(C.act("species-x", { x }) === true, "species-x accepted");
  eq([st.species, st.speciesX.n, st.speciesX.hp], ["ghoul", "Нічний гуль", 2], "species-x sets the base and the extra");
  ok(toasts.at(-1) === "Вид: Нічний гуль.", "toast: " + toasts.at(-1));
  ok(C.act("species-x", { x: { n: "", base: "ghoul" } }) === false && st.speciesX.n === "Нічний гуль", "species-x without a name is refused");
  ok(C.act("species-x", { x: { n: "Х", base: "elf" } }) === false, "species-x with an unknown base is refused");
  // the same species object passed directly
  ok(C.act("species-x", { ...x, n: "Другий гуль" }) === true && st.speciesX.n === "Другий гуль", "species-x with the object itself");
  // a feat that doesn't fit the new base is dropped, as with a plain species
  st.feats = ["Кіборг"];
  C.act("species-x", { x: { ...speciesDefaults("human"), n: "Свій" } });
  ok(!st.feats.includes("Кіборг"), "feats of another species are dropped");
  // a plain species clears it
  C.setField("species", "ghoul");
  ok(st.speciesX === undefined && st.species === "ghoul", "setField('species') clears the extra");
  // supermutants have no gender
  C.act("species-x", { x: { ...speciesDefaults("mutant"), n: "Здоровань" } });
  eq(st.gender, "n", "a mutant-based species is genderless");
  // «roll-species» clears too
  st.arch = "Здоровило";
  C.act("roll-species", {});
  ok(st.speciesX === undefined, "roll-species clears the extra");
  // attributes are clamped to the new limits
  const s2 = state("human");
  s2.base.SL = 3;
  const C2 = createController(s2, createLogic({ st: s2, toast: () => {} }), {});
  C2.act("species-x", { x: { ...speciesDefaults("human"), n: "Хлопчик", b: { ...speciesDefaults("human").b, SL: [-1, 1, 1] } } });
  ok(s2.base.SL <= 1, "attributes are clamped: SL " + s2.base.SL);
}

console.log(failures ? `FAIL (${failures})` : `OK (${checks} checks)`);
if (failures) process.exit(1);
