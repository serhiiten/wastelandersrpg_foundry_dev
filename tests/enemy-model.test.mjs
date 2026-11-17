// The enemy's data (module/rules/enemy-model.mjs): tracker card, book copy, profile, attack dice.
// Run: node tests/enemy-model.test.mjs
import * as M from "../module/rules/enemy-model.mjs";
import * as B from "../module/rules/battle.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };

// a card from the battle generator's record (the old HTML shape is gone with its migration, author 2026-11-14)
const REC = {
  name: "Рейдер", cat: "regular", hp: 12, armor: "2 (шкіряна броня; невразливий до шкоди вогнем)",
  dmg: "мисливська рушниця 2d6 граната (2 заряди) 3d6", aspects: ["злий", "голодний"],
  moves: [{ n: "Інʼєкція Психо", t: "раз за сцену вколює собі Психо: +2 шкоди до кінця сцени" }],
};
const s = M.toSystem(B.enemyFromRecord(REC), { hpValue: 7 });
ok(s.v === M.ENEMY_V && s.cat === "regular", `version and category: ${s.v} ${s.cat}`);
ok(s.hp.value === 7 && s.hp.max === 12 && s.armor === 2, `HP, armour: ${JSON.stringify(s.hp)} ${s.armor}`);
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

// «Як у книзі»: edits undone, HP capped to the book's maximum, situational aspects untouched
const edited = { ...s, armor: 9, attacks: [], hp: { value: 30, max: 30 }, aspects: [{ t: "Збитий з ніг", inv: 1 }] };
const back = M.resetToBook(edited);
ok(back.armor === 2 && back.attacks.length === 2 && back.hp.max === 12 && back.hp.value === 12, `reset to book: ${JSON.stringify(back.hp)} ${back.armor}`);
ok(!("aspects" in back), "situational aspects are not touched by the reset");

ok(M.normCat("statistician") === "statists" && M.normCat("ordinary") === "regular" && M.normCat("boss") === "boss" && M.normCat("???") === "regular", "categories");

console.log(failures ? `FAIL (${failures})` : "enemy-model: OK");
if (failures) process.exit(1);
