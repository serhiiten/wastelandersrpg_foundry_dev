// «Трекер битви»: pure rules (module/rules/battle.mjs) — damage, defence traits, attack / move parsing, zones,
// random zone names, enemy structures from the battle DB and from compendium HTML. Run: node tests/battle.test.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
// nested: 8 → ½ phys 4 → ½ partial 2 → − armour 1 = 1 → +2 Kamikaze = 3
eq(dmg({ armor: 1, psiArmor: 2, defense: { phys: "half", rad: "heal" }, flags: { kamikaze: true, partialHalf: true, electric: true } }, 8, "phys", { partial: true }).final, 3, "nested form");
{ const n = B.normalizeTarget({ armor: 1, psiArmor: 2, defense: { phys: "half", rad: "heal" }, flags: { kamikaze: true, partialHalf: true, electric: true } });
  eq([n.psyArmor, n.phys, n.rad, n.kamikaze, n.halfPartial, n.electricVuln, n.energy], [2, "half", "heal", true, true, true, "normal"], "normalizeTarget nested"); }

/* ---------- rollSum / DICE_RE ---------- */
{ const r = B.rollSum("2d6+1d6+2", seeded(5)); ok(r && r.dice === 3 && r.isDice && r.total >= 7 && r.total <= 20 && /^2d6\[\d,\d\] \+1d6\[\d\] \+2$/.test(r.detail), "rollSum shape " + (r && r.detail)); }
eq(B.rollSum("9"), { total: 9, dice: 0, detail: "9", isDice: false }, "rollSum plain");
eq(B.rollSum("1д6"), null, "rollSum cyrillic д is not dice");
ok(B.rollSum("2к6") !== null, "rollSum accepts «к»");
eq(B.rollSum("abc"), null, "rollSum garbage");
eq(B.rollSum(""), null, "rollSum empty");
eq(B.rollSum("1d10-1", () => 0.999).total, 9, "rollSum minus (max roll)");
eq(B.rollSum("1d6", () => 0).total, 1, "rollSum min roll");
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
  const pc = B.pcProfile({ ...B.PC_PRESETS["Робот"], kamikaze: true });
  ok(pc.armor === 2 && pc.electricVuln && pc.poison === "immune" && pc.kamikaze, "pcProfile robot");
  eq(dmg(B.pcProfile(B.PC_PRESETS["Гуль"]), 6, "rad", { dice: 1 }).heal, 1, "ghoul pc heals from radiation");
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
eq(B.normAsp("x"), { t: "x", inv: 0 }, "normAsp string");
eq(B.normAsp({ t: "y", inv: -3 }), { t: "y", inv: 0 }, "normAsp object");
eq(B.splitAttacks("плазмовий пістолет (ігнорує 2 броні) 1d6+3 вогнемет (2 заряди, влучає по всіх у одній зоні) 2d6"),
  ["плазмовий пістолет (ігнорує 2 броні) 1d6+3", "вогнемет (2 заряди, влучає по всіх у одній зоні) 2d6"], "splitAttacks");
eq(B.splitAttacks("лапи 1d6 +3 радіацією (ігнорує броню)"), ["лапи 1d6 +3 радіацією (ігнорує броню)"], "splitAttacks keeps the extra part");
eq(B.presetFromRest("Лапи", "1d6 +3 радіацією (ігнорує броню)"), { n: "Лапи", note: "+3 радіацією, ігнорує броню", d: "1d6" }, "presetFromRest");
eq(B.presetFromRest("Х", "(ігнорує 2 броні) 1d10+2"), { n: "Х", note: "ігнорує 2 броні", d: "1d10+2" }, "presetFromRest paren first");
eq(B.presetFromRest("Х", "без кубиків"), null, "presetFromRest none");
ok(B.CAT_ORDER[0] === "boss" && B.CAT_LABEL.pc === "персонаж гравця" && B.DEF_FIELDS.length === 14 && B.QUICK_ASPECTS.length === 3, "tables");
ok(B.defValue("armor", { value: "-4" }) === 0 && B.defValue("kamikaze", { checked: true }) === true && B.defValue("rad", { value: "heal" }) === "heal", "defValue");
eq(B.defLabel("rad", "heal"), "радіація: лікує (гуль)", "defLabel");
eq(B.defLabel("kamikaze", true), "камікадзе: +2 шкоди: так", "defLabel chk");
ok(B.profileTags(B.enemyBase({ armor: "1", notes: "⚡ Отримує +1d6 шкоди від електрики." })).some(([, t]) => t === "+1d6 від електрики") && B.tagHelp("½ від радіації").includes("Броня від радіації"), "tags");
ok(B.tagHelp("психічна броня 3").includes("3") && B.tagHelp("щось") === "щось", "tagHelp");
eq(B.damageHead(B.rollSum("2d6", () => 0), "laser", { ignoreN: 1, partial: true }), "2d6[1,1] = 2 · лазерна · ігнорує 1 броні · частковий успіх", "damageHead");

/* ---------- the battle generator's DB: presets, custom enemies, enemyFromRecord ---------- */
const DB = createTerminal().battle.BT.DB;
let dbCount = 0;
for (const fk of Object.keys(DB)) for (const c of B.CAT_ORDER) for (const rec of DB[fk][c] || []) {
  dbCount++;
  let e;
  try { e = B.enemyFromRecord(rec); } catch (err) { ok(false, `enemyFromRecord(${rec.name}) threw ${err.message}`); continue; }
  ok(e.hp === rec.hp && e.armor === (parseInt(rec.armor, 10) || 0) && e.cat === rec.cat, `db ${rec.name}: hp/armor/cat`);
  ok(rec.dmg ? e.attacks.length >= 1 : e.attacks.length === 0, `db ${rec.name}: attacks`);
  e.attacks.forEach((a) => ok(B.DICE_RE.test(a.dice) && B.DMG_TYPES[a.type], `db ${rec.name}: attack «${a.name}» dice «${a.dice}»`));
  ok(e.moves.length === (rec.moves || []).length, `db ${rec.name}: moves`);
  // custom form round trip
  const f = B.customFromEnemy(rec), r = B.buildCustomEnemy(f);
  ok(!r.err && r.enemy.hp === rec.hp && r.enemy.custom, `db ${rec.name}: custom round trip ${r.err || ""}`);
  if (!r.err) ok(B.enemyFromRecord(r.enemy).attacks.length === e.attacks.length, `db ${rec.name}: custom keeps the attacks count`);
}
ok(dbCount >= 80, "DB size " + dbCount);
{
  const find = (n) => { for (const fk of Object.keys(DB)) for (const c of B.CAT_ORDER) for (const r of DB[fk][c] || []) if (r.name === n) return r; };
  const e = B.enemyFromRecord(find("Паладин Братства Сталі"));
  eq(e.attacks.map((a) => [a.name, a.dice, a.type, a.ammoMax, a.ignoreN]), [["Рідкісна плазмова зброя ближнього бою або бою на відстані", "3d6", "plasma", 0, 2], ["Плазмова граната", "3d6", "phys", 2, 0], ["Удар кулаком силової броні", "1d10", "phys", 0, 0]], "паладин attacks");
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

/* ---------- parseEnemyHtml over every compendium enemy ---------- */
const files = [];
(function walk(d) { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? walk(p) : n.endsWith(".json") && files.push(p); } })(fileURLToPath(new URL("../src/packs/opponents", import.meta.url)));
let enemies = 0;
const byName = {};
for (const f of files) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  if (d.type !== "enemy") continue;
  enemies++; byName[d.name] = d;
  const html = d.system.description || "";
  let e;
  try { e = B.parseEnemyHtml(html, { name: d.name, hp: d.system.hp.max, armor: d.system.armor, cat: d.system.type }); } catch (err) { ok(false, `${d.name}: parseEnemyHtml threw ${err.message}`); continue; }
  const tag = d.name;
  ok(e.hp === d.system.hp.max, `${tag}: hp ${e.hp} vs ${d.system.hp.max}`);
  ok(e.armor === d.system.armor, `${tag}: armor ${e.armor} vs ${d.system.armor}`);
  ok(["statists", "regular", "elite", "boss"].includes(e.cat), `${tag}: cat ${e.cat}`);
  if (/<strong>Шкода/.test(html)) {
    ok(e.attacks.length >= 1, `${tag}: attacks`);
    if (/<u>/.test(html)) ok((html.match(/<u>/g) || []).length === e.attacks.length, `${tag}: attack count ${e.attacks.length} vs <u> ${(html.match(/<u>/g) || []).length}`);
    e.attacks.forEach((a) => ok(B.DICE_RE.test(a.dice) && B.DMG_TYPES[a.type] && a.name && a.name[0] === a.name[0].toUpperCase(), `${tag}: attack «${a.name}» dice «${a.dice}»`));
  }
  // moves: the nested list items
  const mi = html.search(/<strong>Ходи/);
  let mvCount = 0;
  if (mi >= 0) { const u0 = html.indexOf("<ul>", mi); let depth = 0; const re = /<(\/?)(ul|li)\b[^>]*>/g; re.lastIndex = u0; let m; while ((m = re.exec(html))) { if (m[2] === "ul") { depth += m[1] ? -1 : 1; if (!depth) break; } else if (!m[1] && depth === 1) mvCount++; } }
  ok(e.moves.length === mvCount, `${tag}: moves ${e.moves.length} vs ${mvCount}`);
  e.moves.forEach((m) => ok(m.n && m.t && !/[<>]/.test(m.n + m.t) && !/[:*]$/.test(m.n), `${tag}: move «${m.n}»`));
  // aspects: the line exists → at least one aspect, no markup left
  ok(/Аспект/.test(html) ? e.aspects.length >= 1 : e.aspects.length === 0, `${tag}: aspects ${e.aspects.length}`);
  e.aspects.forEach((a) => ok(a && !/[<>*]/.test(a), `${tag}: aspect «${a}»`));
  ok(e.traits && typeof e.traits.armor === "number" && e.traits.armor === e.armor, `${tag}: traits`);
  ok(!/<|&[a-z]+;/.test(e.notes) && !/Попередній|Наступний/.test(e.notes), `${tag}: notes clean`);
}
ok(enemies === 77, "compendium enemies: " + enemies);
{
  const find = (n) => byName[n];
  const pe = B.parseEnemyHtml(find("Паладин Братства Сталі").system.description, {});
  eq(pe.attacks.map((a) => [a.name, a.dice, a.type, a.ammoMax, a.ignoreN]), [["Рідкісна важка плазмова зброя", "3d6", "plasma", 0, 2], ["Плазмові гранати", "3d6", "phys", 2, 0], ["Кулаки силової броні", "1d10", "phys", 0, 0]], "паладин html attacks");
  eq(pe.moves.map((m) => m.n), ["Суперстимпак", "Силовий ривок", "Розпад"], "паладин html moves");
  ok(B.moveHeal(pe.moves[0].t)?.expr === "1d6+4", "move text feeds moveHeal");
  ok(pe.traits.halfRad && pe.traits.halfPoison && pe.cat === "boss" && pe.armorText.startsWith("5 (силова"), "паладин html traits");
  const kas = B.parseEnemyHtml(find("Касадор").system.description, {});
  eq(kas.attacks.map((a) => [a.dice, a.type, a.ignoreArmor]), [["1d10", "phys", false]], "касадор sting: extra poison part is not the whole attack");
  ok(kas.attacks[0].note.includes("+ 1d6 шкоди отрутою"), "касадор note " + kas.attacks[0].note);
  const mol = B.parseEnemyHtml(find("Мольфари, відуни, дивні").system.description, {});
  eq(mol.moves.map((m) => m.n), ["Цілющий порошок", "Псионічний талант"], "мольфар moves (colon after the bold name)");
  eq(mol.attacks.map((a) => [a.name, a.type]), [["Середня зброя", "phys"], ["Пси-удар", "psychic"]], "мольфар attacks");
  eq(mol.aspects.length, 2, "мольфар aspects (malformed markup)");
  ok(mol.notes.includes("псионіків"), "мольфар note");
  eq(B.parseEnemyHtml(find("Легіонер").system.description, {}).aspects, ["рядовий воїн Легіону"], "single aspect");
  eq(B.parseEnemyHtml(find("Солдат Анклаву").system.description, {}).aspects, ["важкоозброєний боєць Анклаву", "«ненавиджу, бляха, мутантів»"], "aspects split outside «»");
  const tur = B.parseEnemyHtml(find("Турель").system.description, {});
  eq(tur.attacks.map((a) => a.type), ["phys", "laser"], "турель «Шкода (залежно від моделі)»");
  const ro = B.parseEnemyHtml(find("Робомозок").system.description, {});
  ok(ro.traits.psyVuln, "робомозок psy vulnerable from the armour note");
  const g = B.parseEnemyHtml("<ul><li><strong>ОЗ:</strong> 9</li></ul>", { name: "Х", cat: "ordinary", armor: 2 });
  ok(g.hp === 9 && g.armor === 2 && g.cat === "regular" && g.attacks.length === 0 && g.name === "Х", "fallbacks");
  ok(B.parseEnemyHtml("", { hp: 3 }).hp === 3 && B.parseEnemyHtml(undefined).attacks.length === 0, "empty html");
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
  eq(B.findZoneSpot([], 300, 200, bounds, 100), { x: 100, y: 100, w: 300, h: 200 }, "findZoneSpot: empty → top-left");
  const z1 = { id: 1, x: 100, y: 100, w: 300, h: 200 };
  eq(B.findZoneSpot([z1], 300, 200, bounds, 100), { x: 400, y: 100, w: 300, h: 200 }, "findZoneSpot: right of the first");
  const row = [z1, { id: 2, x: 400, y: 100, w: 300, h: 200 }, { id: 3, x: 700, y: 100, w: 400, h: 200 }];
  eq(B.findZoneSpot(row, 300, 200, bounds, 100), { x: 100, y: 300, w: 300, h: 200 }, "findZoneSpot: next row");
  const r = B.findZoneSpot([{ id: 9, ...bounds }], 300, 200, bounds, 100);
  ok(r.x === 100 && r.y === 100, "findZoneSpot: full scene falls back to the corner");
  const odd = B.findZoneSpot([{ id: 1, x: 100, y: 100, w: 250, h: 100 }], 100, 100, bounds, 50);
  ok((odd.x - bounds.x) % 50 === 0 && B.zoneFree(odd, [{ id: 1, x: 100, y: 100, w: 250, h: 100 }], undefined, bounds), "findZoneSpot: stays on the grid and free");
  eq(Object.keys(B.ZONE_COLORS), ["yellow", "blue", "green", "red", "purple"], "ZONE_COLORS");
  ok(B.ZONE_COLORS.purple === "Фіолетовий" && B.zoneColor({ color: "red" }) === "red" && B.zoneColor({ color: "pink" }) === "yellow" && B.zoneColor(null) === "yellow", "zoneColor");
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
  ok(/^Сховище \d+$/.test(B.resolveVaultPlace("Сховище (d100)")) && B.resolveVaultPlace("Ферма") === "Ферма", "resolveVaultPlace");
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

if (failures) { console.log(`FAILS: ${failures}`); process.exit(1); }
console.log("battle: OK");
