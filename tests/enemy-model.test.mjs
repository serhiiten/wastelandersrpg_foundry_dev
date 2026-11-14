// The enemy's data (module/rules/enemy-model.mjs): old shape → tracker card, book copy, profile, attack dice.
// Run: node tests/enemy-model.test.mjs
import * as M from "../module/rules/enemy-model.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };

// the old shape, as the compendium had it
const OLD = {
  type: "ordinary", hp: { value: 7, max: 12 }, armor: 2,
  description: "<ul><li><strong>Категорія:</strong> рядовий</li><li><strong>ОЗ:</strong> 12</li>"
    + "<li><strong>Броня:</strong> 2 (шкіряна броня; невразливий до шкоди вогнем)</li>"
    + "<li><strong>Шкода:</strong> <u>Мисливська рушниця</u> (2d6 фізичної шкоди, бій на відстані); <u>Граната</u> (3d6 фізичної шкоди всім істотам в одній зоні, 2 шт.)</li>"
    + "<li><strong>Аспекти: <em>злий, голодний.</em></strong></li>"
    + "<li><strong>Ходи:</strong><ul><li><strong>Інʼєкція Психо:</strong> раз за сцену вколює собі Психо: +2 шкоди до кінця сцени.</li></ul></li></ul>",
};
ok(M.isOldShape(OLD) && !M.isOldShape({ v: 1, attacks: [] }), "old shape detected");
const s = M.fromOldShape(OLD, "Рейдер");
ok(s.v === M.ENEMY_V && s.cat === "regular", `version and category: ${s.v} ${s.cat}`);
ok(s.hp.value === 7 && s.hp.max === 12 && s.armor === 2, `HP kept, armour: ${JSON.stringify(s.hp)} ${s.armor}`);
ok(s.def.fire === "immune" && s.def.phys === "normal", `defence from the armour line: ${JSON.stringify(s.def)}`);
ok(s.attacks.length === 2 && s.attacks[1].ammoMax === 2 && s.attacks[1].ammo === 2, `attacks and ammo: ${JSON.stringify(s.attacks)}`);
ok(s.baseAspects.length === 2 && s.baseAspects[0].inv === 0 && s.aspects.length === 0, "book aspects, no situational ones");
ok(s.moves.length === 1 && s.moves[0].used === false, "moves");
ok(s.orig && s.orig.attacks.length === 2 && s.orig.hp === 12, "book copy");

// Психо: the move used → +2 to the attacks
ok(M.attackDice(s, 0) === "2d6", `no bonus: ${M.attackDice(s, 0)}`);
const ps = { ...s, moves: [{ ...s.moves[0], used: true }] };
ok(M.psychoOn(ps) && /^2d6\+2$/.test(M.attackDice(ps, 0)), `Психо +2: ${M.attackDice(ps, 0)}`);
// Камікадзе: +2 to the attacks and +2 to the damage taken
const kam = { ...s, flags: { ...s.flags, kamikaze: true } };
ok(/\+2$/.test(M.attackDice(kam, 0)), `Камікадзе on attacks: ${M.attackDice(kam, 0)}`);
ok(M.takeDamage(kam, 5, "phys").final === 5, `Камікадзе on damage taken: 5 − 2 armour + 2 = ${M.takeDamage(kam, 5, "phys").final}`);
ok(M.takeDamage(s, 9, "fire").final === 0, `immune to fire: ${M.takeDamage(s, 9, "fire").final}`);
ok(M.takeDamage(s, 1, "phys").final === 0, "armour soaks it");

// «Як у книзі»: edits undone, HP capped to the book's maximum, situational aspects untouched
const edited = { ...s, armor: 9, attacks: [], hp: { value: 30, max: 30 }, aspects: [{ t: "Збитий з ніг", inv: 1 }] };
const back = M.resetToBook(edited);
ok(back.armor === 2 && back.attacks.length === 2 && back.hp.max === 12 && back.hp.value === 12, `reset to book: ${JSON.stringify(back.hp)} ${back.armor}`);
ok(!("aspects" in back), "situational aspects are not touched by the reset");

ok(M.normCat("statistician") === "statists" && M.normCat("ordinary") === "regular" && M.normCat("boss") === "boss" && M.normCat("???") === "regular", "categories");

console.log(failures ? `FAIL (${failures})` : "enemy-model: OK");
if (failures) process.exit(1);
