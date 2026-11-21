// «Трекер битви»: pure rules (module/rules/battle.mjs) — damage, defence traits, attack / move parsing, zones,
// random zone names, enemy structures from the battle DB. Run: node tests/battle.test.mjs
import * as B from "../module/rules/battle.mjs";
import { PUST_ZONE_NAMES, PUST_ZONE_ASPECTS } from "../module/rules/zone-data.mjs";
import { createTerminal } from "../module/rules/terminal.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; if (failures < 25) console.log("FAIL " + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/** Seeded random in [0, 1) */
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

/* ---------- computeDamage ---------- */
const T = (o = {}) => ({ armor: 0, psyArmor: 0, electricVuln: false, phys: "normal", energy: "normal", fire: "normal", rad: "normal", poison: "normal", psy: "normal", halfPartial: false, kamikaze: false, ...o });
const dmg = (t, base, type, o) => B.computeDamage(t, base, type, o);

eq(dmg(T({ armor: 2 }), 7, "phys").final, 5, "phys − armour");
eq(dmg(T({ armor: 9 }), 7, "phys").final, 0, "phys never below 0");
eq(dmg(T({ armor: 2 }), 7, "phys").steps, ["− броня 2"], "phys steps");
eq(dmg(T({ phys: "half", armor: 1 }), 7, "phys"), { final: 3, steps: ["½ від фізичної → 4", "− броня 1"] }, "phys half rounds up, before armour");
eq(dmg(T({ phys: "immune" }), 7, "phys"), { final: 0, steps: ["невразливий до фізичної"] }, "phys immune");
// laser / plasma / gauss pierce 1 / 2 / 3
eq(dmg(T({ armor: 3 }), 6, "laser").final, 4, "laser pierces 1");
eq(dmg(T({ armor: 3 }), 6, "plasma").final, 5, "plasma pierces 2");
eq(dmg(T({ armor: 3 }), 6, "gauss").final, 6, "gauss pierces 3");
eq(dmg(T({ armor: 1 }), 6, "gauss").final, 6, "gauss armour below 0 clamps");
eq(dmg(T({ armor: 3 }), 6, "laser").steps, ["броня 3−1", "− броня 2"], "laser steps");
// energy
eq(dmg(T({ energy: "immune", armor: 1 }), 6, "laser"), { final: 0, steps: ["невразливий до енергетичної зброї"] }, "energy immune");
eq(dmg(T({ energy: "half" }), 5, "plasma").final, 3, "energy half");
eq(dmg(T({ energy: "half" }), 5, "phys").final, 5, "energy half does not touch phys");
// ignoreN / ignoreArmor
eq(dmg(T({ armor: 4 }), 8, "phys", { ignoreN: 2 }).final, 6, "ignoreN 2");
eq(dmg(T({ armor: 4 }), 8, "laser", { ignoreN: 3 }).final, 7, "ignoreN beats type ignore");
eq(dmg(T({ armor: 4 }), 8, "plasma", { ignoreN: 1 }).final, 6, "type ignore beats smaller ignoreN");
eq(dmg(T({ armor: 4 }), 8, "phys", { ignoreArmor: true }), { final: 8, steps: ["броня ігнорується"] }, "ignoreArmor");
// partial success
eq(dmg(T({ halfPartial: true, armor: 1 }), 9, "phys", { partial: true }).final, 4, "partial half: 5 − 1");
eq(dmg(T({ armor: 1 }), 9, "phys", { partial: true }).final, 8, "partial without trait");
// fire
eq(dmg(T({ fire: "immune" }), 6, "fire"), { final: 0, steps: ["невразливий до вогню"] }, "fire immune");
eq(dmg(T({ fire: "half", armor: 1 }), 7, "fire").final, 3, "fire half");
// cryo is an energy type without pierce
eq(dmg(T({ armor: 2 }), 6, "cryo").final, 4, "cryo");
// radiation
eq(dmg(T({ armor: 3 }), 6, "rad").final, 6, "rad ignores armour");
eq(dmg(T({ rad: "immune" }), 6, "rad"), { final: 0, steps: ["невразливий до радіації"] }, "rad immune");
eq(dmg(T({ rad: "half" }), 5, "rad").final, 3, "rad half");
{ const r = dmg(T({ rad: "heal" }), 9, "rad", { dice: 2 }); eq([r.final, r.heal], [0, 2], "rad heals per die"); ok(r.steps[0].includes("(2)"), "rad heal step"); }
eq(dmg(T({ rad: "heal", kamikaze: true }), 9, "rad", { dice: 2 }).final, 0, "no kamikaze bonus on heal");
// poison
eq(dmg(T({ armor: 3 }), 6, "poison").final, 6, "poison ignores armour");
eq(dmg(T({ poison: "immune" }), 6, "poison"), { final: 0, steps: ["невразливий до отрут"] }, "poison immune");
eq(dmg(T({ poison: "half" }), 7, "poison").final, 4, "poison half");
// psychic
eq(dmg(T({ armor: 5, psyArmor: 2 }), 6, "psychic"), { final: 4, steps: ["− психічна броня 2"] }, "psy armour only");
eq(dmg(T({ psyArmor: 2 }), 6, "psychic", { ignoreArmor: true }), { final: 6, steps: ["психічна броня ігнорується"] }, "psy ignoreArmor");
eq(dmg(T({ psy: "immune" }), 6, "psychic").final, 0, "psy immune");
eq(dmg(T({ psy: "half", psyArmor: 1 }), 7, "psychic").final, 3, "psy half");
// electricity: +1d6 on vulnerable targets (injected die), halving after the bonus
eq(dmg(T({ electricVuln: true, armor: 1 }), 5, "electric", { rollD6: () => 4 }), { final: 8, steps: ["+1d6 електрика [4]", "− броня 1"] }, "electric vuln");
eq(dmg(T({ armor: 1 }), 5, "electric", { rollD6: () => 4 }).final, 4, "electric not vulnerable");
eq(dmg(T({ electricVuln: true }), 5, "phys", { rollD6: () => 4 }).final, 5, "electric bonus only for electric type");
eq(dmg(T({ electricVuln: true, energy: "half" }), 5, "electric", { rollD6: () => 3 }).final, 4, "electric then energy half");
eq(dmg(T({ electricVuln: true }), 5, "electric", { rnd: () => 0.99 }).final, 11, "electric via rnd (d6 = 6)");
// Kamikaze
eq(dmg(T({ kamikaze: true, armor: 2 }), 5, "phys"), { final: 5, steps: ["− броня 2", "+2 Камікадзе"] }, "kamikaze +2 after armour");
eq(dmg(T({ kamikaze: true, armor: 5 }), 5, "phys").final, 0, "kamikaze needs ≥1 through armour");
eq(dmg(T({ kamikaze: true }), 4, "poison").final, 6, "kamikaze with poison");
// unknown type = phys; nested form
eq(dmg(T({ armor: 1 }), 4, "nonsense").final, 3, "unknown type is physical");
// nested: ½ phys + ½ partial add up to the whole (Foundry's rule, author 2026-11-14; the tracker halved twice: 3) → 0, no Kamikaze
eq(dmg({ armor: 1, psiArmor: 2, defense: { phys: "half", rad: "heal" }, flags: { kamikaze: true, partialHalf: true, electric: true } }, 8, "phys", { partial: true }).final, 0, "nested form");
eq(dmg({ armor: 1, defense: { phys: "half" }, flags: { kamikaze: true } }, 8, "phys").final, 5, "nested form, one half: 4 −1 +2");
{ const n = B.normalizeTarget({ armor: 1, psiArmor: 2, defense: { phys: "half", rad: "heal" }, flags: { kamikaze: true, partialHalf: true, electric: true } });
  eq([n.psyArmor, n.phys, n.rad, n.kamikaze, n.halfPartial, n.electricVuln, n.energy], [2, "half", "heal", true, true, true, "normal"], "normalizeTarget nested"); }

/* ---------- DICE_RE ---------- */
["1d6", "2d6+2", "d10", "3d6-1"].forEach((s) => ok(B.DICE_RE.test(s), "DICE_RE " + s));
["", "2d", "1d6+", "abc", "2d6 +1"].forEach((s) => ok(!B.DICE_RE.test(s), "DICE_RE rejects " + s));

/* ---------- enemyTraits on real strings ---------- */
{
  const t = (armor, notes = "") => B.enemyTraits({ armor, notes });
  const robot = "⚡ Отримує +1d6 шкоди від електрики. Невразливе до отрут, психічної шкоди та отримує лише половину шкоди від радіації.";
  let x = t("1 (летючий: його не можна збити з ніг)", robot);
  ok(x.armor === 1 && x.electricVuln && x.immunePoison && x.immunePsy && x.halfRad && x.noKnockdown && !x.immuneRad && !x.healRad, "robot traits");
  x = t("5 (силова броня: від радіації та отрути отримує лише половину шкоди)");
  ok(x.armor === 5 && x.halfRad && x.halfPoison && !x.immuneFire, "power armour traits");
  x = t("2 (невразливий до шкоди вогнем)"); ok(x.immuneFire && x.armor === 2, "fire immune");
  x = t("4 (за часткового успіху в перевірці атаки отримує лише половину шкоди з округленням угору)"); ok(x.halfPartial && x.armor === 4, "partial half");
  x = t("3 (невразливий до радіації)"); ok(x.immuneRad && !x.healRad, "immune rad");
  x = t("0", "Радіація лікує гуля."); ok(x.healRad, "rad heals");
  x = t("1 (шкода від радіації лікує на 1 ОЗ за кожну кістку, від отрут отримує лише половину шкоди з округленням угору)"); ok(x.healRad && x.halfPoison && x.armor === 1, "wiki ghoul: rad heals, poison half");
  x = t("2 (на відміну від інших роботів, вразливий до психічної шкоди)"); ok(x.psyVuln && !x.immunePsy, "psy vuln");
  x = t("2", "невразливий до психічної шкоди"); ok(!x.psyVuln && x.immunePsy, "«невразливий» is not vuln");
  x = t("6 (від енергетичної зброї отримує лише половину шкоди; не можна приголомшити, не можна обеззброїти)"); ok(x.halfEnergy && x.noStun && x.noDisarm, "energy half / no stun / no disarm");
  x = t("x"); eq(x.armor, 0, "no armour number");
  eq(B.enemyTraits({}).armor, 0, "empty enemy");
  const base = B.enemyBase({ armor: "5 (силова броня: від радіації та отрути отримує лише половину шкоди)", notes: "", def: { phys: "half", armor: 6 } });
  ok(base.rad === "half" && base.poison === "half" && base.phys === "half" && base.armor === 6, "enemyBase + def overrides");
  ok(B.enemyBase({ armor: "1", notes: robot }).psy === "immune" && B.enemyBase({ armor: "1", notes: robot }).electricVuln, "enemyBase robot");
}

/* ---------- psyMoveIdx / profiles / Psycho ---------- */
{
  const moves = [{ n: "Суперстимпак", t: "раз за сцену відновлює ОЗ 1d6+4" }, { n: "Інʼєкція Психо", t: "раз за сцену ширяється Психо, і його шкода зростає на 2 до кінця сцени" }];
  eq(B.psyMoveIdx({ moves }), 1, "psyMoveIdx by name");
  eq(B.psyMoveIdx({ moves: [{ n: "Допінг", t: "раз за сцену коле психо" }] }), 0, "psyMoveIdx by text");
  eq(B.psyMoveIdx({ moves: [] }), -1, "no psycho");
  const e = { armor: "3", notes: "", moves };
  ok(!B.enemyProfile(e, { used: {} }).psycho && B.enemyProfile(e, { used: { 1: true } }).psycho, "psycho on once used");
  ok(B.enemyProfile(e, { ov: { phys: "half" } }).phys === "half", "card overrides");
  ok(B.enemyProfile({ armor: "2 (вразливий до психічної)", moves: [] }).psyVuln, "psyVuln kept");
  ok(!B.enemyProfile({ armor: "2 (вразливий до психічної)", moves: [] }, { ov: { psy: "half" } }).psyVuln, "psyVuln dropped when psy resisted");
  // Psycho +2 on attacks
  eq(B.kamiDice("1d10", "Важка зброя", { psycho: true }), "1d10+2", "psycho +2");
  eq(B.kamiDice("2d6+1", "Зброя", { kamikaze: true, psycho: true }), "2d6+5", "kamikaze + psycho");
  eq(B.kamiDice("1d6", "Кулаки", { kamikaze: true }), "1d6", "unarmed not boosted");
  eq(B.kamiDice("1d10", "Пси-удар", { psycho: true }), "1d10", "psi-strike not boosted");
  eq(B.kamiDice("1d6-3", "Ніж", { psycho: true }), "1d6-1", "negative modifier");
  eq(B.kamiDice("1d6-2", "Ніж", { psycho: true }), "1d6", "modifier cancels");
  eq(B.kamiDice("1d6", "Ніж", null), "1d6", "no profile");
  eq(B.kamiDice("1d6", "Ніж", {}), "1d6", "no bonus");
}

/* ---------- atkType / atkIgnoreN / atkIgnores / atkAmmo / moveHeal ---------- */
{
  const t = B.atkType;
  eq(t("плазмовий пістолет (ігнорує 2 броні) 1d6+3"), "plasma", "plasma");
  eq(t("плазмова граната (1 штука, влучає по всіх у одній зоні) 3d6"), "phys", "plasma grenade is physical");
  eq(t("лазерний мініган (ігнорує 1 броні) 3d6"), "laser", "laser");
  eq(t("Гаус-зброя (ігнорує 3 броні) 3d6"), "gauss", "gauss");
  eq(t("вогнемет (2 заряди, влучає по всіх у одній зоні) 2d6"), "fire", "flamethrower");
  eq(t("плювок вогнем 1d10"), "fire", "fire spit");
  eq(t("лапи 1d6 +3 радіацією (ігнорує броню)"), "phys", "extra radiation does not change the type");
  eq(t("радіаційний промінь (радіація, ігнорує броню) 3d6"), "rad", "radiation beam");
  eq(t("ікла 1d6 +1d6 отрутою (ігнорує броню)"), "phys", "extra poison does not change the type");
  eq(t("отруйне жало 1d6"), "poison", "poison sting");
  eq(t("Психічний удар 1d10 психічної шкоди"), "psychic", "psychic");
  eq(t("пси-удар 1d10"), "psychic", "psi strike");
  eq(t("електрошокер імпульсний 1d6"), "electric", "electric");
  eq(t("кріо-гармата 2d6"), "cryo", "cryo");
  eq(t("кулемет 1d10"), "phys", "plain");
  eq(t(""), "phys", "empty");
  eq(B.atkIgnoreN("плазмовий пістолет (ігнорує 2 броні) 1d6+3"), 2, "ignoreN 2");
  eq(B.atkIgnoreN("Лазер (ігнорує 1 фізичної броні)"), 1, "ignoreN physical armour");
  eq(B.atkIgnoreN("ігнорує 99 броні"), 20, "ignoreN capped");
  eq(B.atkIgnoreN("лапи 1d6"), 0, "ignoreN none");
  ok(B.atkIgnores("радіаційний промінь (радіація, ігнорує броню) 3d6"), "ignores armour");
  ok(!B.atkIgnores("лапи 1d6 +3 радіацією (ігнорує броню)"), "extra part's ignore is not the attack's");
  // the compendium's wording (author, 2026-11-19): «отрута ігнорує броню» is the extra part's, not the attack's
  ok(!B.atkIgnores("фізичної шкоди + 1d6 шкоди отрутою, ближній бій, отрута ігнорує броню"), "«отрута ігнорує броню» is the extra part's");
  ok(!B.atkIgnores("фізичної шкоди + 3 шкоди радіацією, ближній бій, радіація ігнорує броню"), "«радіація ігнорує броню» is the extra part's");
  ok(B.atkIgnores("шкоди радіацією, бій на відстані, ігнорує броню"), "a radiation beam still ignores armour");
}

/* ---------- attackExtra / attackHit: the extra part of an enemy's attack (author, 2026-11-19) ---------- */
{
  eq(B.attackExtra("фізичної шкоди + 1d6 шкоди отрутою, ближній бій, отрута ігнорує броню"), { expr: "1d6", type: "poison", label: "1d6 отрутою" }, "extra poison 1d6");
  eq(B.attackExtra("фізичної шкоди + 3 шкоди радіацією, ближній бій"), { expr: "3", type: "rad", label: "3 радіацією" }, "extra radiation 3");
  eq(B.attackExtra("фізичної шкоди + 3 шкоди кислотою, ближній бій"), { expr: "3", type: "phys", label: "3 кислотою" }, "acid is physical");
  eq(B.attackExtra("+3 радіацією, ігнорує броню"), { expr: "3", type: "rad", label: "3 радіацією" }, "the generator's short wording");
  eq(B.attackExtra("фізичної шкоди, бій на відстані"), null, "no extra part");
  eq(B.attackExtra("+2 до атаки отрутою змащеною"), null, "no «шкоди» and no type word right after the number");
  eq(B.attackExtra(""), null, "empty note");
  // poison: two types → parts for resolveHit, the total of both
  const h = B.attackHit({ l: "1d10", v: 6, t: "phys", dice: 1 }, { l: "1d6 отрутою", v: 4, t: "poison", dice: 1 });
  eq([h.total, h.dice, h.card.map((p) => [p.l, p.v, p.t])], [10, 2, [["1d10", "6", "phys"], ["1d6 отрутою", "4", "poison"]]], "poison hit: card and total");
  eq(h.parts, [{ total: 6, type: "phys", dice: 1 }, { total: 4, type: "poison", dice: 1 }], "poison hit: parts");
  // acid: one type → no parts, the total meets the armour once
  const acid = B.attackHit({ l: "2d6", v: 7, t: "phys", dice: 2 }, { l: "3 кислотою", v: 3, t: "phys", dice: 0 });
  eq([acid.total, acid.dice, acid.parts, acid.card.length], [10, 2, undefined, 2], "acid hit: one physical total, two lines on the card");
  // no extra part: as before
  const one = B.attackHit({ l: "1d10+2", v: 8, t: "laser", dice: 1 });
  eq([one.total, one.dice, one.parts, one.card], [8, 1, undefined, [{ l: "1d10+2", v: "8", t: "laser" }]], "plain hit");
  // every compendium attack with «+ X шкоди …» in its note has its extra part found, and «ignoreArmor» stays off
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");
  const found = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith(".json")) { const j = JSON.parse(readFileSync(p, "utf8")); if (j.type === "enemy") for (const a of j.system.attacks || []) if (/\+\s*\d*d?\d+\s+шкод/.test(a.note || "")) found.push([j.name, a]); } } };
  walk("src/packs/opponents");
  ok(found.length >= 14, `compendium attacks with an extra part: ${found.length}`);
  for (const [n, a] of found) {
    ok(B.attackExtra(a.note), `«${n}» «${a.name}»: extra part found in «${a.note}»`);
    ok(!a.ignoreArmor && !B.atkIgnores(a.note), `«${n}» «${a.name}»: the whole attack doesn't ignore armour`);
  }
  eq(B.atkAmmo("вогнемет (2 заряди, влучає по всіх у одній зоні)"), 2, "ammo charges");
  eq(B.atkAmmo("граната (1 штука, влучає)"), 1, "ammo piece");
  eq(B.atkAmmo("ракетниця (2 ракети)"), 0, "ammo «ракети» not in the tracker's regex");
  eq(B.atkAmmoEx("ракетниця (2 ракети)"), 2, "atkAmmoEx rockets");
  eq(B.atkAmmoEx("плазмова граната (3d6 фізичної шкоди всім істотам в одній зоні, щонайбільше 1 шт.)"), 1, "atkAmmoEx шт.");
  eq(B.atkAmmo("лапи 1d6"), 0, "no ammo");
  eq(B.atkAmmo("50 зарядів"), 0, "ammo > 20 ignored");
  eq(B.moveHeal("Раз за сцену відновлює ОЗ 1d6+4"), { expr: "1d6+4", group: false, others: false }, "moveHeal dice");
  eq(B.moveHeal("раз за сцену відновлює 5 ОЗ."), { expr: "5", group: false, others: false }, "moveHeal flat");
  eq(B.moveHeal("Усі бійці НКР, які чують наказ, відновлюють по 3 ОЗ і, якщо їм ніщо не заважає, можуть переміститися"), { expr: "3", group: true, others: false }, "moveHeal group");
  eq(B.moveHeal("двічі за сцену відновлює собі або союзникові 3 ОЗ"), { expr: "3", group: false, others: false }, "moveHeal: the wiki's «собі або союзникові 3 ОЗ» heals itself (Foundry only; the tracker misses it)");
  eq(B.moveHeal("раз за сцену відновлює ОЗ 3d6")?.expr, "3d6", "moveHeal 3d6");
  eq(B.moveHeal("раз за сцену робить ривок"), null, "moveHeal none");
}

/* ---------- aspects, presets, splitAttacks ---------- */
eq(B.splitAsp(["a; b", "c"]), ["a", "b", "c"], "splitAsp");
eq(B.splitAttacks("плазмовий пістолет (ігнорує 2 броні) 1d6+3 вогнемет (2 заряди, влучає по всіх у одній зоні) 2d6"),
  ["плазмовий пістолет (ігнорує 2 броні) 1d6+3", "вогнемет (2 заряди, влучає по всіх у одній зоні) 2d6"], "splitAttacks");
eq(B.splitAttacks("лапи 1d6 +3 радіацією (ігнорує броню)"), ["лапи 1d6 +3 радіацією (ігнорує броню)"], "splitAttacks keeps the extra part");
eq(B.presetFromRest("Лапи", "1d6 +3 радіацією (ігнорує броню)"), { n: "Лапи", note: "+3 радіацією, ігнорує броню", d: "1d6" }, "presetFromRest");
eq(B.presetFromRest("Х", "(ігнорує 2 броні) 1d10+2"), { n: "Х", note: "ігнорує 2 броні", d: "1d10+2" }, "presetFromRest paren first");
eq(B.presetFromRest("Х", "без кубиків"), null, "presetFromRest none");
ok(B.CAT_LABEL.pc === "персонаж гравця" && B.DEF_FIELDS.length === 14 && B.QUICK_ASPECTS.length === 3, "tables");
eq(B.defLabel("rad", "heal"), "радіація: лікує (гуль)", "defLabel");
eq(B.defLabel("kamikaze", true), "камікадзе: +2 шкоди: так", "defLabel chk");
ok(B.profileTags(B.enemyBase({ armor: "1", notes: "⚡ Отримує +1d6 шкоди від електрики." })).some(([, t]) => t === "+1d6 від електрики") && B.tagHelp("½ від радіації").includes("Броня від радіації"), "tags");
ok(B.tagHelp("психічна броня 3").includes("3") && B.tagHelp("щось") === "щось", "tagHelp");

/* ---------- the battle generator's DB: presets, custom enemies, enemyFromRecord ---------- */
const DB = createTerminal().battle.BT.DB;
const CATS = ["boss", "elite", "regular", "statists"]; // the generator DB's categories
let dbCount = 0;
for (const fk of Object.keys(DB)) for (const c of CATS) for (const rec of DB[fk][c] || []) {
  dbCount++;
  let e;
  try { e = B.enemyFromRecord(rec); } catch (err) { ok(false, `enemyFromRecord(${rec.name}) threw ${err.message}`); continue; }
  ok(e.hp === rec.hp && e.armor === (parseInt(rec.armor, 10) || 0) && e.cat === rec.cat, `db ${rec.name}: hp/armor/cat`);
  ok(rec.dmg ? e.attacks.length >= 1 : e.attacks.length === 0, `db ${rec.name}: attacks`);
  e.attacks.forEach((a) => ok(B.DICE_RE.test(a.dice) && B.DMG_TYPES[a.type], `db ${rec.name}: attack «${a.name}» dice «${a.dice}»`));
  ok(e.moves.length === (rec.moves || []).length, `db ${rec.name}: moves`);
}
ok(dbCount >= 80, "DB size " + dbCount);
{
  const find = (n) => { for (const fk of Object.keys(DB)) for (const c of CATS) for (const r of DB[fk][c] || []) if (r.name === n) return r; };
  const e = B.enemyFromRecord(find("Паладин Братства Сталі"));
  eq(e.attacks.map((a) => [a.name, a.dice, a.type, a.ammoMax, a.ignoreN]), [["Рідкісна важка плазмова зброя ближнього бою або бою на відстані", "3d6", "plasma", 0, 2], ["Плазмові гранати", "3d6", "phys", 2, 0], ["Кулаки силової броні", "1d10", "phys", 0, 0]], "паладин attacks");
  ok(e.traits.halfRad && e.traits.halfPoison && e.armor === 5, "паладин traits");
  const k = B.enemyFromRecord(find("Нічний мисливець"));
  eq(k.attacks.map((a) => [a.dice, a.type, a.note]), [["1d6", "phys", "+1d6 отрутою, ігнорує броню"]], "мисливець attack");
  const rob = B.enemyFromRecord(find("Містер Сміливець"));
  ok(rob.traits.electricVuln && rob.traits.noKnockdown, "robot enemy traits from notes");
  eq(dmg(B.enemyProfile(rob), 4, "electric", { rollD6: () => 6 }).final, 10 - 2, "Містер Сміливець takes electricity");
}
{
  const book = B.ATTACK_PRESETS_BOOK;
  ok(book.length === 3 && book[0][1][0].n === "Легка зброя ближнього бою", "book presets");
  const ap = B.buildAttackPresets(DB), mp = B.buildMovePresets(DB);
  ok(ap.length === 4 && ap[3][0] === "З бази супротивників" && ap[3][1].length > 20, "db attack presets " + ap[3][1].length);
  const names = ap.flatMap(([, l]) => l.map((a) => a.n.toLowerCase())); ok(new Set(names).size === names.length, "attack preset names unique");
  ok(ap[3][1].every((a) => B.DICE_RE.test(a.d)), "db presets have dice");
  ok(mp.length > 40 && new Set(mp.map((m) => m.n.toLowerCase())).size === mp.length, "move presets unique " + mp.length);
  eq(B.buildAttackPresets({}).length, 4, "empty DB still has the group");
  const c = B.customBlank("Тека"); ok(c.folder === "Тека" && c.cat === "regular" && Object.keys(c.def).length === 13, "customBlank");
  c.name = " "; ok(B.buildCustomEnemy(c).err === "Дай супротивникові назву", "custom: name");
  c.name = "Тест"; c.attacks.push({ n: "Погана", note: "", d: "дуже" }); ok(B.buildCustomEnemy(c).err.includes("Погана"), "custom: bad dice");
  c.attacks.pop(); c.def.phys = "half"; c.aspects = ["a"]; c.moves = [{ n: "", t: "щось" }, { n: "", t: "" }]; c.folder = " Банда ";
  const r = B.buildCustomEnemy(c);
  ok(r.enemy.dmg === "Легка зброя ближнього бою 1d6" && r.enemy.def.phys === "half" && Object.keys(r.enemy.def).length === 1 && r.enemy.moves.length === 1 && r.enemy.moves[0].n === "Хід" && r.enemy.folder === "Банда" && r.enemy.armor === "1", "custom enemy built " + JSON.stringify(r.enemy));
  ok(B.CAT_GUIDE.boss.hp.length === 6 && B.CAT_GUIDE.statists.armor[0] === 0, "CAT_GUIDE");
}

/* ---------- zones ---------- */
{
  const a = { x: 0, y: 0, w: 200, h: 100 }, b = { x: 200, y: 0, w: 100, h: 100 }, c = { x: 150, y: 50, w: 100, h: 100 };
  ok(!B.rectOverlap(a, b) && B.rectOverlap(a, c) && B.rectOverlap(c, b) && B.rectOverlap(a, a), "rectOverlap");
  ok(B.pointInRect(a, 0, 0) && B.pointInRect(a, 199, 99) && !B.pointInRect(a, 200, 50) && !B.pointInRect(a, -1, 5), "pointInRect");
  const zs = [{ id: 1, ...a }, { id: 2, ...b }];
  ok(B.zoneOfPoint(zs, 250, 10).id === 2 && B.zoneOfPoint(zs, 10, 10).id === 1 && B.zoneOfPoint(zs, 900, 900) === undefined, "zoneOfPoint");
  ok(B.zoneOfPoint([{ id: 1, ...a }, { id: 3, ...c }], 160, 60).id === 1, "zoneOfPoint: first zone wins in an overlap");
  const bounds = { x: 100, y: 100, w: 1000, h: 500 };
  ok(!B.zoneFree({ x: 100, y: 100, w: 300, h: 200 }, [{ id: 1, x: 300, y: 150, w: 200, h: 200 }]), "zoneFree: overlap");
  ok(B.zoneFree({ x: 100, y: 100, w: 300, h: 200 }, [{ id: 1, x: 300, y: 150, w: 200, h: 200 }], 1), "zoneFree: skipId");
  ok(!B.zoneFree({ x: 0, y: 100, w: 100, h: 100 }, [], undefined, bounds) && B.zoneFree({ x: 100, y: 100, w: 100, h: 100 }, [], undefined, bounds) && !B.zoneFree({ x: 1000, y: 100, w: 200, h: 100 }, [], undefined, bounds), "zoneFree: bounds");
  eq(Object.keys(B.ZONE_COLORS), ["yellow", "blue", "green", "red", "purple"], "ZONE_COLORS");
  ok(B.ZONE_COLORS.purple === "Фіолетовий", "ZONE_COLORS names");
}

/* ---------- random zone names / aspects ---------- */
{
  ok(Object.keys(PUST_ZONE_NAMES).length === 36 && Object.keys(PUST_ZONE_ASPECTS).length === 36, "zone pools");
  eq(B.zonePlaceKey("Ферма"), "Ферма", "place key");
  eq(B.zonePlaceKey("Сховище 47"), "Сховище (d100)", "vault place key");
  eq(B.zonePlaceKey("Залишки гайвею"), "Залишки автостради", "alias");
  eq(B.zonePlaceKey("Висохле гирло річки"), "Висохле русло річки", "alias 2");
  eq(B.zonePlaceKey("Невідоме місце"), null, "unknown place");
  eq(B.zonePlaceKey(""), null, "no place");
  ok(PUST_ZONE_NAMES[B.zonePlaceKey("Залишки гайвею")] && PUST_ZONE_NAMES[B.zonePlaceKey("Висохле гирло річки")], "aliases point at real pools");
  // vault numbers
  const seen = new Set(); const rnd = seeded(7);
  for (let i = 0; i < 4000; i++) seen.add(B.vaultNo(rnd));
  ok([...seen].every((n) => n >= 1 && n <= 100 && ![8, 12, 13, 15].includes(n)) && seen.size === 96, "vaultNo range " + seen.size);
  { const seq = [0.07, 0.11, 0.12, 0.14, 0.15]; let i = 0; eq(B.vaultNo(() => seq[i++]), 16, "vaultNo skips 8, 12, 13, 15"); }
  // no repeats: take every name of a place one by one
  for (const place of ["Ферма", "Сховище 47", "", "Залишки гайвею"]) {
    const rnd2 = seeded(11), used = new Set(), key = B.zonePlaceKey(place), pool = key ? PUST_ZONE_NAMES[key] : [...new Set(Object.values(PUST_ZONE_NAMES).flat())];
    for (let i = 0; i < pool.length; i++) {
      const n = B.randomZoneName(place, used, rnd2);
      if (!n || used.has(n) || !pool.includes(n)) { ok(false, `zone name repeat/foreign «${n}» at ${i} for «${place}»`); break; }
      used.add(n);
    }
    eq(B.randomZoneName(place, used, rnd2), "", `pool of «${place}» exhausted`);
    const have = []; const apool = key ? PUST_ZONE_ASPECTS[key] : [...new Set(Object.values(PUST_ZONE_ASPECTS).flat())];
    for (let i = 0; i < apool.length; i++) {
      const a = B.randomZoneAspect(place, have.map((t) => ({ t, inv: 0 })), rnd2);
      if (!a || have.includes(a) || !apool.includes(a)) { ok(false, `zone aspect repeat «${a}» at ${i} for «${place}»`); break; }
      have.push(a);
    }
    eq(B.randomZoneAspect(place, have, rnd2), "", `aspects of «${place}» exhausted`);
  }
  // a stuck generator (always the same value) still finds an unused name
  const stuck = () => 0; const used = new Set([PUST_ZONE_NAMES["Ферма"][0]]);
  const n = B.randomZoneName("Ферма", used, stuck); ok(n && !used.has(n), "stuck rnd falls back to the first unused name");
  // place-specific pools
  ok(PUST_ZONE_NAMES["Ферма"].includes(B.randomZoneName("Ферма", [])) && PUST_ZONE_ASPECTS["Ферма"].includes(B.randomZoneAspect("Ферма", [])), "place pool used");
}

/* ---------- Психо / Камікадзе on enemies' attacks (author, 2026-11-14) ---------- */
{
  const both = { kamikaze: true, psycho: true }, psy = { psycho: true };
  eq([B.kamiDice("2d6", "Важка зброя", psy), B.kamiDice("3d6", "Плазмова граната", psy), B.kamiDice("1d6+1", "Ніж", both)], ["2d6+2", "3d6+2", "1d6+5"], "Психо +2, with Камікадзе +4");
  eq([B.kamiDice("1d6", "Кулаки", psy), B.kamiDice("2d6", "Пси-удар", psy), B.kamiDice("2d6", "Удар голими руками", both)], ["1d6", "2d6", "2d6"], "no bonus for unarmed attacks and Пси-удар");
  eq([B.kamiDice("2d6kl1", "Укуси", psy), B.kamiDice("2d6kl1-1", "Укуси", both)], ["2d6kl1+2", "2d6kl1+3"], "«менша з 2d6» gets the bonus too");
  eq([B.kamiDice("2d6", "Важка зброя", {}), B.kamiDice("2d6", "Важка зброя", null)], ["2d6", "2d6"], "no Психо, no bonus");
  eq(B.psyMoveIdx({ moves: [{ n: "Суперстимпак", t: "" }, { n: "Ін’єкція Психо", t: "" }] }), 1, "«Ін’єкція Психо» found");
  eq(B.psyMoveIdx({ moves: [{ n: "Шал", t: "раз за сцену ширяється Психо" }] }), 0, "a move that injects Психо found by its text");
  eq([B.psyMoveIdx({ moves: [{ n: "Психометрія", t: "дізнатися факти" }] }), B.psyMoveIdx({ moves: [{ n: "Психологічний тиск", t: "" }] })], [-1, -1], "«Психометрія», «Психологічний тиск» are not Психо");
  eq(B.psyMoveIdx({ moves: [{ n: "ПСИХО!", t: "" }] }), 0, "«ПСИХО!» is");
}

/* ---------- attack notes without their own damage type (author, 2026-11-14: the chip shows it) ---------- */
{
  const n = (t, k) => B.noteWithoutType(t, k);
  eq([n("фізичної шкоди, ближній бій", "phys"), n("фізична шкода, ближній бій", "phys"), n("фізичної шкоди всім істотам в одній зоні, 2 шт.", "phys")],
    ["ближній бій", "ближній бій", "всім істотам в одній зоні, 2 шт."], "physical words go");
  eq(n("фізичної шкоди + 3 шкоди радіацією, ближній бій", "phys"), "+ 3 шкоди радіацією, ближній бій", "another type's part stays");
  eq(n("фізичної шкоди вогнем, бій на відстані", "phys"), "фізичної шкоди вогнем, бій на відстані", "«фізичної шкоди вогнем» stays whole");
  eq([n("шкоди радіацією, бій на відстані, ігнорує броню", "rad"), n("шкоди вогнем, ближній бій, підпалює ціль", "fire"), n("психічної шкоди, ігнорує фізичну броню", "psychic")],
    ["бій на відстані, ігнорує броню", "ближній бій, підпалює ціль", "ігнорує фізичну броню"], "radiation, fire, psychic");
  eq([n("фізичної шкоди, бій на відстані, ігнорує 1 броні", "laser"), n("фізичної шкоди всім істотам в одній зоні, 1 заряд", "plasma")], ["бій на відстані, ігнорує 1 броні", "всім істотам в одній зоні, 1 заряд"], "energy weapons: the book's «фізичної шкоди» goes");
  eq([n("фізичної шкоди вогнем, бій на відстані", "fire"), n("ігнорує 1 броні", "phys"), n("", "phys"), n("шкоди вогнем, ближній бій", "phys")], ["бій на відстані", "ігнорує 1 броні", "", "шкоди вогнем, ближній бій"], "fire's words, no words, empty, another type's words stay");
  // the attack's own type from «шкоди вогнем» / «шкоди радіацією» (author, 2026-11-14: Полумʼя, Шишкебаб, Рад-вибух were physical)
  eq([B.atkType("Полумʼя фізичної шкоди вогнем"), B.atkType("Шишкебаб шкоди вогнем, ближній бій"), B.atkType("Рад-вибух шкоди радіацією всім")], ["fire", "fire", "rad"], "fire / radiation words");
  eq([B.atkType("кігті фізичної шкоди + 3 шкоди радіацією"), B.atkType("укус фізичної шкоди + 2 шкоди вогнем"), B.atkType("лапи 1d6 +3 радіацією (ігнорує броню)")], ["phys", "phys", "phys"], "an extra part doesn't set the type");
}

/* ---------- dice in moves' / notes' text (author, 2026-11-14) ---------- */
{
  const dice = (t) => B.diceInText(t).filter((p) => typeof p !== "string").map((p) => [p.dice, p.damage, p.type]);
  eq(dice("раз за сцену обстрілює ракетами будь-які дві зони й завдає 3d6 шкоди всім істотам у них."), [["3d6", true, "phys"]], "Бомбардування: damage");
  eq(dice("Раз за сцену відновлює ОЗ 1d6+4"), [["1d6+4", false, "phys"]], "healing is not damage");
  eq(dice("раз за сцену кидає 1d6 гранат, кожна завдає 2d6 шкоди вогнем."), [["1d6", false, "phys"], ["2d6", true, "fire"]], "a count, then fire damage");
  eq(dice("укус: 1к6 шкоди отрутою"), [["1d6", true, "poison"]], "к6 and poison");
  eq(dice("вибух завдає 2d6 всім у зоні"), [["2d6", true, "phys"]], "«завдає» before the die");
  eq(dice("Ніякого кидка, 12 ОЗ"), [], "no dice");
  const full = (t) => B.diceInText(t).filter((p) => typeof p !== "string").map((p) => [p.dice, p.damage, p.type, p.ignoreArmor]);
  eq(full("коли ОЗ сяючого гуля падають до 0, він вибухає й завдає всім істотам у своїй зоні 1d6+3 шкоди радіацією, що ігнорує броню."), [["1d6+3", true, "rad", true]], "Прощальний подарунок: «+3» is the die's, radiation, ignores armour");
  eq(full("раз за сцену вражає ціль отруйним жалом. Протягом 3 кіл жертва отримує 1d6 шкоди від отрути щоразу, коли настає її черга діяти. Ця шкода ігнорує броню."), [["1d6", true, "poison", true]], "Отруєння: poison, «Ця шкода ігнорує броню» of the next sentence");
  eq(full("раз за сцену вражає ціль отруйним жалом. Протягом 3 кіл жертва отримує 1d10 шкоди від отрути щоразу, коли настає її черга діяти. Ця шкода ігнорує броню."), [["1d10", true, "poison", true]], "Отруйне жало: poison, ignores armour");
  eq(full("завдає 2d6 шкоди вогнем. Ця шкода ігнорує броню. Інша ціль отримує 1d6 шкоди."), [["2d6", true, "fire", true], ["1d6", true, "phys", false]], "the next sentence's piercing belongs to the die before it only");
  eq(B.diceInText("a 2d6 b").join("|").replace(/\[object Object\]/, "X"), "a |X| b", "the text around stays");
}

/* ---------- «−1» / «+1» by the quick dice (the tracker's qd mod) ---------- */
{
  eq([B.bumpExpr("5", 1), B.bumpExpr("0", -1), B.bumpExpr("2d6", 1), B.bumpExpr("2d6+1", -1), B.bumpExpr("2d6-1", -1), B.bumpExpr("", 1), B.bumpExpr("", -1), B.bumpExpr("2d6kl1", 1)],
    ["6", "0", "2d6+1", "2d6", "2d6-2", "1", "0", "2d6kl1+1"], "bumpExpr");
}

/* ---------- «менша з 2d6» (author, 2026-11-14: was read as plain 2d6) ---------- */
{
  eq(B.lowerDice("2d6", "менша з , фізична шкода, ближній бій"), { dice: "2d6kl1", note: "фізична шкода, ближній бій" }, "compendium «менша з 2d6»");
  eq(B.lowerDice("1d6", "кинь двічі, обери менший"), { dice: "2d6kl1", note: "" }, "generator «кинь двічі, обери менший»");
  eq(B.lowerDice("2d6kl1", "менша з"), { dice: "2d6kl1", note: "менша з" }, "kl1 stays");
  eq(B.lowerDice("3d6", "фізичної шкоди, менших не буває").dice, "3d6", "«менших» is not «менша з»");
  eq(B.diceLabel("2d6kl1"), "менша з 2d6", "label");
  eq(B.diceLabel("1d10+2"), "1d10+2", "label plain");
  eq(B.normDice("менша з 2d6"), "2d6kl1", "typed «менша з 2d6»");
  eq(B.normDice("к10 + 2"), "1d10+2", "typed к10");
  ok(B.DICE_RE.test("2d6kl1") && B.DICE_RE.test("2d6kl1+1") && !B.DICE_RE.test("2d6kh1"), "DICE_RE kl1");
  const statist = B.enemyFromRecord({ name: "x", hp: 3, armor: 0, dmg: "кулаки 1d6 кинь двічі, обери менший" });
  eq(statist.attacks[0].dice, "2d6kl1", "parsed from a generator record");
}

if (failures) { console.log(`FAILS: ${failures}`); process.exit(1); }
console.log("battle: OK");
