// Damage and healing as «Завдати цілям» / «Завдати шкоди» / «Лікувати» apply them (author, 2026-11-14: «усі можливі
// варіанти … з урахуванням усіх можливих захистів по усім типам акторів»): resolveHit (module/rules/battle.mjs) on the
// profiles of module/rules/target-profile.mjs — enemies (their card), characters (the rules engine, every species, manual
// defences, chems), caravans (armour). Places have no HP and take no damage. Run: node tests/apply-hit.test.mjs
import * as B from "../module/rules/battle.mjs";
import * as Rc from "../module/rules/core.mjs";
import { toSystem, profileOf as enemyProfile } from "../module/rules/enemy-model.mjs";
import { characterProfileFromState, combineDefence, targetProfile } from "../module/rules/target-profile.mjs";
import { logicFor } from "../module/applications/character-actions.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures < 40) console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const P = (o = {}) => ({ armor: 2, psyArmor: 1, phys: "normal", energy: "normal", fire: "normal", rad: "normal", poison: "normal", psy: "normal", ...o });
const d6 = (v) => () => v;
/** damage dealt (hp 50 / 50, so nothing is cut) */
const dmg = (prof, hit, opts = {}) => { const r = B.resolveHit(prof, 50, 50, hit, { rollD6: d6(3), ...opts }); return 50 - r.hp; };

/* ---------- every type against plain armour 2 / psychic armour 1 ---------- */
const plain = P();
for (const [type, want] of Object.entries({ phys: 5, laser: 6, plasma: 7, gauss: 7, electric: 5, cryo: 5, fire: 5, rad: 7, poison: 7, psychic: 6 })) {
  eq(dmg(plain, { total: 7, type }), want, `7 ${type} vs armour 2 / psi 1`);
}
// unknown type → physical
eq(dmg(plain, { total: 7, type: "nope" }), 5, "unknown type is physical");

/* ---------- «½ шкоди» (author, 2026-11-16): any target, half rounded up, then the armour; adds up with the other halves ---------- */
eq(dmg(plain, { total: 7, type: "phys" }, { dodge: true }), 2, "dodge: 7 → 4, armour 2 → 2");
eq(dmg(P({ armor: 0 }), { total: 7, type: "phys" }, { dodge: true }), 4, "dodge rounds up: 7 → 4");
eq(dmg(P({ armor: 0 }), { total: 7, type: "rad" }, { dodge: true }), 4, "dodge on radiation: 7 → 4");
eq(dmg(P({ armor: 0, rad: "half" }), { total: 7, type: "rad" }, { dodge: true }), 0, "dodge + radiation ½: two halves → 0");
eq(dmg(P({ armor: 0, halfPartial: true }), { total: 8, type: "phys" }, { dodge: true }), 4, "dodge without «partial» leaves halfPartial alone");
eq(dmg(P({ armor: 0 }), { total: 7, type: "phys" }, { dodge: false }), 7, "no dodge: whole damage");

/* ---------- armour piercing ---------- */
eq(dmg(plain, { total: 7, type: "phys", ignoreN: 1 }), 6, "ignores 1");
eq(dmg(plain, { total: 7, type: "phys", ignoreN: 5 }), 7, "ignores 5 of 2");
eq(dmg(plain, { total: 7, type: "laser", ignoreN: 2 }), 7, "laser + ignores 2: the bigger counts");
eq(dmg(plain, { total: 7, type: "phys", ignoreArmor: true }), 7, "ignores armour");
eq(dmg(plain, { total: 7, type: "psychic", ignoreArmor: true }), 7, "ignores armour: psychic armour too");
eq(dmg(plain, { total: 7, type: "rad", ignoreN: 1 }), 7, "radiation never meets armour");

/* ---------- defences ---------- */
const cases = [
  [{ phys: "half" }, { total: 7, type: "phys" }, 2, "phys ½: ceil(7/2)=4 −2"],
  [{ phys: "immune" }, { total: 7, type: "phys" }, 0, "phys immune"],
  [{ phys: "immune" }, { total: 7, type: "fire" }, 0, "phys immune covers fire (an ordinary type)"],
  [{ phys: "immune" }, { total: 7, type: "rad" }, 7, "phys immune doesn't cover radiation"],
  [{ fire: "half" }, { total: 7, type: "fire" }, 2, "fire ½"],
  [{ fire: "immune" }, { total: 7, type: "fire" }, 0, "fire immune"],
  [{ fire: "immune" }, { total: 7, type: "phys" }, 5, "fire immune, physical hit"],
  [{ energy: "half" }, { total: 7, type: "laser" }, 3, "energy ½ vs laser: 4 − (2−1)"],
  [{ energy: "half" }, { total: 7, type: "cryo" }, 2, "energy ½ vs cryo"],
  [{ energy: "immune" }, { total: 7, type: "plasma" }, 0, "energy immune vs plasma"],
  [{ energy: "immune" }, { total: 7, type: "phys" }, 5, "energy immune, physical hit"],
  [{ phys: "half", fire: "half" }, { total: 8, type: "fire" }, 0, "phys ½ and fire ½: 8→4→2 −2"],
  [{ rad: "half" }, { total: 7, type: "rad" }, 4, "rad ½"],
  [{ rad: "immune" }, { total: 7, type: "rad" }, 0, "rad immune"],
  [{ poison: "half" }, { total: 7, type: "poison" }, 4, "poison ½"],
  [{ poison: "immune" }, { total: 7, type: "poison" }, 0, "poison immune"],
  [{ psy: "half" }, { total: 7, type: "psychic" }, 3, "psy ½: 4 −1"],
  [{ psy: "immune" }, { total: 7, type: "psychic" }, 0, "psy immune"],
  [{ electricVuln: true }, { total: 7, type: "electric" }, 8, "+1d6 electricity [3]: 10 −2"],
  [{ electricVuln: true }, { total: 7, type: "phys" }, 5, "electric vulnerability, physical hit"],
  [{ electricVuln: true, energy: "immune" }, { total: 7, type: "electric" }, 0, "+1d6 electricity, but energy immune"],
];
for (const [o, hit, want, m] of cases) eq(dmg(P(o), hit), want, m);

/* ---------- partial success ---------- */
eq(dmg(P({ halfPartial: true }), { total: 7, type: "phys" }, { partial: true }), 2, "partial + ½ on partial: 4 −2");
eq(dmg(P(), { total: 7, type: "phys" }, { partial: true }), 5, "partial, no ½ on partial");
eq(dmg(P({ halfPartial: true }), { total: 7, type: "phys" }), 5, "½ on partial, full success");
// «½ за часткового успіху» on every type; halves add up, two take it all (author, 2026-11-14)
eq(dmg(P({ halfPartial: true }), { total: 7, type: "rad" }, { partial: true }), 4, "partial halves radiation too");
eq(dmg(P({ halfPartial: true }), { total: 7, type: "poison" }, { partial: true }), 4, "partial halves poison");
eq(dmg(P({ halfPartial: true }), { total: 7, type: "psychic" }, { partial: true }), 3, "partial halves psychic: 4 −1");
eq(dmg(P({ halfPartial: true, poison: "half" }), { total: 9, type: "poison" }, { partial: true }), 0, "poison ½ + partial ½ = 0");
eq(dmg(P({ halfPartial: true, phys: "half" }), { total: 9, type: "phys" }, { partial: true }), 0, "phys ½ + partial ½ = 0");
eq(dmg(P({ halfPartial: true, energy: "half" }), { total: 9, type: "laser" }, { partial: true }), 0, "energy ½ + partial ½ = 0");
eq(dmg(P({ halfPartial: true, phys: "half", fire: "half" }), { total: 9, type: "fire" }, { partial: true }), 0, "three halves: still 0");
eq(B.resolveHit(P({ halfPartial: true, rad: "heal" }), 10, 20, { total: 7, type: "rad", dice: 2 }, { partial: true }).hp, 12, "partial doesn't halve a ghoul's healing");
eq(dmg(P({ phys: "half", kamikaze: true, halfPartial: true }), { total: 9, type: "phys" }, { partial: true }), 0, "two halves: nothing got through, no Камікадзе");

/* ---------- Камікадзе ---------- */
eq(dmg(P({ kamikaze: true }), { total: 7, type: "phys" }), 7, "Камікадзе: 5 +2");
eq(dmg(P({ kamikaze: true }), { total: 2, type: "phys" }), 0, "Камікадзе: nothing got through, no +2");
eq(dmg(P({ kamikaze: true }), { total: 3, type: "rad" }), 5, "Камікадзе on radiation");
eq(dmg(P({ kamikaze: true }), { total: 0, type: "phys", parts: [{ total: 8, type: "phys" }, { total: 4, type: "rad" }] }), 12, "Камікадзе once per hit of two parts: 6 + 4 + 2");

/* ---------- several types in one hit ---------- */
eq(dmg(P(), { total: 12, type: "phys", parts: [{ total: 8, type: "phys" }, { total: 4, type: "rad" }] }), 10, "phys 8 + rad 4: armour only on phys");
eq(dmg(P(), { total: 8, type: "phys", parts: [{ total: 5, type: "phys" }, { total: 3, type: "fire" }] }), 6, "phys 5 + fire 3: one main part, armour once");
eq(dmg(P({ fire: "immune" }), { total: 8, type: "fire", parts: [{ total: 5, type: "fire" }, { total: 3, type: "phys" }] }), 0, "fire main part vs fire immune");
eq(dmg(P(), { total: 4, type: "phys", parts: [{ total: 5, type: "phys" }, { total: -1, type: "phys" }] }), 2, "a minus part lowers the main part: 4 −2");
eq(dmg(P({ psy: "immune" }), { total: 9, type: "phys", parts: [{ total: 6, type: "phys" }, { total: 3, type: "psychic" }] }), 4, "phys 6 + psychic 3 vs psy immune");
eq(dmg(P(), { total: 7, type: "phys", poison: 3 }), 8, "a weapon's poison on top: 5 + 3");
eq(dmg(P({ poison: "immune" }), { total: 7, type: "phys", poison: 3 }), 5, "a weapon's poison vs poison immune");
eq(dmg(P({ poison: "half" }), { total: 7, type: "phys", poison: 3 }), 7, "a weapon's poison ½: 5 + 2");
eq(dmg(P(), { total: 6, type: "psychic", parts: [{ total: 4, type: "psychic" }, { total: 2, type: "phys" }] }), 3, "psychic main type with a physical part: psi 4−1 + phys 2−2");

/* ---------- radiation that heals ---------- */
{
  const ghoul = P({ rad: "heal" });
  let r = B.resolveHit(ghoul, 5, 10, { total: 7, type: "rad", dice: 2 });
  eq([r.hp, r.heal, r.damage], [7, 2, 0], "ghoul: 2 dice of radiation heal 2");
  r = B.resolveHit(ghoul, 9, 10, { total: 7, type: "rad", dice: 3 });
  eq(r.hp, 10, "ghoul: healing stops at the maximum");
  r = B.resolveHit(ghoul, 5, 10, { total: 12, type: "phys", parts: [{ total: 8, type: "phys", dice: 0 }, { total: 4, type: "rad", dice: 2 }] });
  eq([r.hp, r.damage, r.heal], [1, 6, 2], "ghoul: phys 8 (−6) and rad 2 dice (+2) in one hit");
  r = B.resolveHit(P({ rad: "heal", kamikaze: true }), 5, 10, { total: 7, type: "rad", dice: 2 });
  eq(r.hp, 7, "ghoul with Камікадзе: healing gets no +2");
}

/* ---------- never below 0, HP within 0…max ---------- */
{
  let r = B.resolveHit(plain, 5, 10, { total: -4, type: "phys" });
  eq([r.hp, r.damage], [5, 0], "a negative total does nothing");
  r = B.resolveHit(plain, 5, 10, { total: 30, type: "phys" });
  eq([r.hp, r.out], [0, true], "HP don't go below 0, «вибуває»");
  r = B.resolveHit(plain, 0, 10, { total: 30, type: "phys" });
  eq([r.hp, r.out], [0, false], "already down: not «вибуває» again");
  r = B.resolveHit(P({ rad: "heal" }), 12, 10, { total: 7, type: "rad", dice: 2 });
  eq(r.hp, 12, "above the maximum (a bonus): healing doesn't cut it down");
  r = B.resolveHit(plain, 5, 10, { total: 7, type: "phys", poison: -3 });
  eq(r.hp, 0, "a negative poison part counts as 0: 5 − 5");
}

/* ---------- enemies: profiles from their structured card ---------- */
{
  const e = (rec) => enemyProfile(toSystem(B.enemyFromRecord(rec)));
  const robot = e({ name: "Робот", hp: 10, armor: "3", dmg: "лазер 1d10", notes: "Отримує +1d6 шкоди від електрики." });
  eq(dmg(robot, { total: 7, type: "electric" }), 7, "robot +1d6 from electricity: 10 −3");
  const sys = toSystem(B.enemyFromRecord({ name: "Гуль", hp: 10, armor: "1", dmg: "кігті 1d6" }));
  sys.def.rad = "heal";
  eq(B.resolveHit(enemyProfile(sys), 4, 10, { total: 6, type: "rad", dice: 2 }).hp, 6, "enemy ghoul healed by radiation");
  sys.def.rad = "normal"; sys.flags.kamikaze = true;
  eq(dmg(enemyProfile(sys), { total: 6, type: "phys" }), 7, "enemy Камікадзе: 5 +2");
  sys.psiArmor = 2;
  eq(dmg(enemyProfile(sys), { total: 6, type: "psychic" }), 6, "enemy psychic armour 2: 4 +2 Камікадзе");
}

/* ---------- characters: every species, the rules engine as the sheet shows it ---------- */
{
  const seen = {};
  for (const sp of Object.keys(Rc.SPECIES)) {
    for (let n = 0; n < 25; n++) {
      const st = Rc.rollCharacter(null);
      st.species = sp;
      const d = Rc.compute(st);
      const L = logicFor(st, { quiet: true });
      const prof = characterProfileFromState(st);
      // the profile agrees with the sheet's own «Захист» (defAuto) and armour
      const A = L.defAuto(d);
      for (const k of ["rad", "poison", "psy"]) ok(prof[k] === A[k], `${sp}: ${k} ${prof[k]} = sheet ${A[k]}`);
      eq(prof.armor, d.armorTotal + L.chemArmor(), `${sp}: armour as the sheet shows`);
      eq(prof.psyArmor, d.psiTotal + L.chemPsi(), `${sp}: psychic armour as the sheet shows`);
      ok(prof.electricVuln === !!A.electric, `${sp}: electricity vulnerability as the sheet`);
      ok(prof.kamikaze === !!d.has("Камікадзе"), `${sp}: Камікадзе`);
      seen[sp] = seen[sp] || {};
      for (const k of ["rad", "poison", "psy"]) if (prof[k] !== "normal") seen[sp][k] = prof[k];
      if (prof.electricVuln) seen[sp].electric = true;
      // and the hit itself: radiation on a ghoul heals, on others hurts (unless immune)
      const r = B.resolveHit(prof, 5, 20, { total: 6, type: "rad", dice: 2 });
      if (prof.rad === "heal") ok(r.hp === 7, `${sp}: radiation heals`);
      else if (prof.rad === "immune") ok(r.hp === 5, `${sp}: radiation immune`);
      else ok(r.hp < 5, `${sp}: radiation hurts`);
    }
  }
  // the species' own defences reach the hit (not only the bare armour — the old bug)
  const any = (k, v) => Object.values(seen).some((s) => s[k] === v);
  ok(Object.keys(seen).length >= 4, "species rolled");
  if (!any("rad", "heal")) console.log("note: no species healed by radiation was rolled", JSON.stringify(seen));
  // manual defences on top of the rules
  const st = Rc.rollCharacter(null);
  st.species = "human";
  st.defOv = { fire: "half", psy: "immune", electric: "yes", partial: "yes", phys: "half" };
  const prof = characterProfileFromState(st);
  eq([prof.fire, prof.psy, prof.electricVuln, prof.halfPartial, prof.phys], ["half", "immune", true, true, "half"], "manual defences");
  st.defOv = { phys: "half" };
  const p2 = characterProfileFromState(st);
  eq(p2.phys, "half", "manual phys ½");
  eq([combineDefence("half", "half"), combineDefence("normal", "half"), combineDefence("heal", "immune"), combineDefence("half", "")], ["immune", "half", "heal", "half"], "two halves make immunity, heal wins");
}

/* ---------- the cards' types and «Зробити перевірку»'s parts ---------- */
{
  const chat = ["phys", "laser", "plasma", "gauss", "electric", "cryo", "fire", "rad", "poison", "psi"];
  for (const t of chat) eq(B.chatType(B.battleType(t)), t, `type ${t} there and back`);
  eq(B.battleType("psi"), "psychic", "psi → psychic");
  eq(B.battleType("пси"), "phys", "an unknown type → physical");
  eq(B.applyParts([{ l: "2d6", v: "7", t: "phys" }]), { dice: 2 }, "one type: no parts, the dice count");
  eq(B.applyParts([{ l: "4d6[фізична]", v: "14", t: "phys" }, { l: "2d6[радіація]", v: "6", t: "rad" }]),
    { parts: [{ total: 14, type: "phys", dice: 4 }, { total: 6, type: "rad", dice: 2 }], dice: 6 }, "Товстун: two types, both with dice");
  eq(B.applyParts([{ l: "2d6", v: "8", t: "phys" }, { l: "Камікадзе", v: "2", t: "phys" }]), { dice: 2 }, "a bonus of the same type: no parts");
  // the whole way: «Товстун» on a ghoul with armour 2
  const ghoul = P({ rad: "heal" });
  const hit = { total: 20, type: "phys", ...B.applyParts([{ l: "4d6[фізична]", v: "14", t: "phys" }, { l: "2d6[радіація]", v: "6", t: "rad" }]) };
  hit.parts = hit.parts.map((x) => ({ ...x, type: B.battleType(x.type) }));
  const r = B.resolveHit(ghoul, 10, 20, hit);
  eq([r.damage, r.heal, r.hp], [12, 2, 0], "Товстун on a ghoul: −12 phys, +2 from 2 rad dice");
}

/* ---------- caravans and places ---------- */
{
  const caravan = targetProfile({ type: "caravan", system: { armor: 3 } });
  eq(dmg(caravan, { total: 7, type: "phys" }), 4, "caravan armour 3");
  eq(dmg(caravan, { total: 7, type: "psychic" }), 7, "caravan: psychic meets no armour");
  eq(dmg(caravan, { total: 7, type: "rad" }), 7, "caravan: radiation ignores armour");
  // «Тачка» is a machine: no psychic damage, poisons, radiation; brahmins are alive (author, 2026-11-14)
  const cart = targetProfile({ type: "caravan", system: { armor: 2, vehicle: "tachka" } });
  eq([dmg(cart, { total: 7, type: "psychic" }), dmg(cart, { total: 7, type: "poison" }), dmg(cart, { total: 7, type: "rad" }), dmg(cart, { total: 7, type: "phys" })], [0, 0, 0, 5], "Тачка: psychic / poison / radiation 0, physical 5");
  // the defences of «Налаштування → Захист» (author, 2026-11-14)
  const set = targetProfile({ type: "caravan", system: { armor: 2, vehicle: "brahmin", defOv: { fire: "half", poison: "immune", psy: "", phys: "half" } } });
  eq([dmg(set, { total: 8, type: "fire" }), dmg(set, { total: 8, type: "poison" }), dmg(set, { total: 8, type: "phys" }), dmg(set, { total: 8, type: "psychic" })], [0, 0, 2, 8], "caravan defences: fire ½ + phys ½ = 0, poison immune, phys ½ 4−2, psychic full");
  const cart2 = targetProfile({ type: "caravan", system: { armor: 2, vehicle: "tachka", defOv: { rad: "half" } } });
  eq(dmg(cart2, { total: 8, type: "rad" }), 4, "a defence set by hand replaces the rule (author, 2026-11-15): Тачка set to ½ radiation takes 4");
  const lead = targetProfile({ type: "caravan", system: { armor: 1, vehicle: "brahmin", imp: { lead: 1 } } });
  eq([dmg(lead, { total: 7, type: "rad" }), dmg(lead, { total: 7, type: "poison" })], [4, 7], "«Свинцева обшивка»: radiation ½ (rounded up), poison full");
  const leadCart = targetProfile({ type: "caravan", system: { armor: 2, vehicle: "tachka", imp: { lead: 1 } } });
  eq(dmg(leadCart, { total: 7, type: "rad" }), 0, "Тачка with «Свинцева обшивка» stays immune to radiation");
  const leadOff = targetProfile({ type: "caravan", system: { armor: 1, vehicle: "brahmin", imp: { lead: 1 }, defOv: { rad: "normal" } } });
  eq(dmg(leadOff, { total: 7, type: "rad" }), 7, "«звичайна» set by hand overrides the lead");
  const psiCar = targetProfile({ type: "caravan", system: { armor: 3, vehicle: "brahmin", psiArmor: 2 } });
  eq([dmg(psiCar, { total: 7, type: "psychic" }), dmg(psiCar, { total: 7, type: "phys" })], [5, 4], "caravan psychic armour 2 (author, 2026-11-15): psychic 7 → 5, physical meets the armour 3");
  const brahmins = targetProfile({ type: "caravan", system: { armor: 1, vehicle: "brahmin" } });
  eq([dmg(brahmins, { total: 7, type: "psychic" }), dmg(brahmins, { total: 7, type: "poison" })], [7, 7], "brahmins take psychic damage and poison");
  eq(targetProfile({ type: "place", system: {} }), null, "a place takes no damage");
  eq(targetProfile(null), null, "nobody");
}

/* ---------- an enemy attack's extra part (author, 2026-11-19): «+ 1d6 шкоди отрутою», «+ 3 радіацією», «+ 3 кислотою» ---------- */
{
  const hitOf = (main, extra) => { const h = B.attackHit(main, extra); return { total: h.total, type: main.t, dice: h.dice, ...(h.parts ? { parts: h.parts } : {}) }; };
  // Касадор «Жало»: 1d10 (6) + 1d6 отрутою (4)
  const sting = hitOf({ l: "1d10", v: 6, t: "phys", dice: 1 }, { l: "1d6 отрутою", v: 4, t: "poison", dice: 1 });
  eq(dmg(P({ armor: 2 }), sting), 8, "sting vs armour 2: 6 − 2 + 4 poison");
  eq(dmg(P({ armor: 9 }), sting), 4, "sting vs armour 9: the poison works even when the armour stopped the physical part");
  eq(dmg(P({ armor: 2, poison: "immune" }), sting), 4, "sting vs a robot (poison immune): physical only");
  eq(dmg(P({ armor: 2, poison: "half" }), sting), 6, "sting vs poison ½: 4 + 2");
  // Сяючий дикий гуль «Лапи»: 1d6 (4) + 3 радіацією, against a ghoul (radiation heals: +1 HP a die, a fixed 3 has none)
  const paws = hitOf({ l: "1d6", v: 4, t: "phys", dice: 1 }, { l: "3 радіацією", v: 3, t: "rad", dice: 0 });
  eq(dmg(P({ armor: 1 }), paws), 6, "paws vs armour 1: 4 − 1 + 3 radiation");
  const g = B.resolveHit(P({ armor: 1, rad: "heal" }), 10, 20, paws);
  eq([g.hp, g.heal], [7, 0], "paws vs a ghoul: physical 3, the fixed radiation heals nothing");
  eq(dmg(P({ armor: 1, rad: "half" }), paws), 5, "paws vs radiation ½: 3 + 2");
  // Матка ванамінго «Мацяльця»: 2d6 (7) + 1d6 радіацією (5) against a ghoul: 1 die of radiation → +1 HP
  const g2 = B.resolveHit(P({ armor: 2, rad: "heal" }), 10, 20, hitOf({ l: "2d6", v: 7, t: "phys", dice: 2 }, { l: "1d6 радіацією", v: 5, t: "rad", dice: 1 }));
  eq([g2.hp, g2.heal], [6, 1], "tentacles vs a ghoul: 7 − 2 = 5 damage, +1 HP from 1 die of radiation");
  // Гігантська мурашина матка «Мандибули»: 2d6 (7) + 3 кислотою: physical, the armour once
  const acid = hitOf({ l: "2d6", v: 7, t: "phys", dice: 2 }, { l: "3 кислотою", v: 3, t: "phys", dice: 0 });
  eq(dmg(P({ armor: 3 }), acid), 7, "mandibles vs armour 3: 7 + 3 − 3");
  eq(dmg(P({ armor: 3, poison: "immune" }), acid), 7, "acid isn't poison: a robot takes it");
}

if (failures) { console.log(`FAILS: ${failures} of ${checks}`); process.exit(1); }
console.log(`apply-hit: OK (${checks} checks)`);
