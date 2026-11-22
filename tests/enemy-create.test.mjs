// «Новий супротивник» form (module/rules/enemy-create.mjs): blank form, «за основу», validation, the built system.
// Run: node tests/enemy-create.test.mjs
import * as C from "../module/rules/enemy-create.mjs";
import * as M from "../module/rules/enemy-model.mjs";
import * as B from "../module/rules/battle.mjs";
import { createTerminal } from "../module/rules/terminal.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

// blank form builds as it is
const blank = C.blankForm("Божевільний механік");
let r = C.buildEnemy(blank);
ok(!r.err && r.name === "Божевільний механік", `blank builds: ${r.err}`);
ok(r.system.cat === "regular" && r.system.hp.max === 6 && r.system.hp.value === 6 && r.system.armor === 1, "blank: cat, hp, armour");
ok(r.system.attacks.length === 1 && r.system.attacks[0].dice === "1d6" && r.system.attacks[0].type === "phys", "blank: one attack");
ok(r.system.orig && r.system.orig.hp === 6, "the book's copy is made");

// name and dice are checked
ok(C.buildEnemy({ ...blank, name: "  " }).err === "Дай супротивникові назву", "name needed");
ok(/Погана/.test(C.buildEnemy({ ...blank, attacks: [C.attackRow({ n: "Погана", d: "дуже" })] }).err), "bad dice");
ok(C.diceOk("к6") && C.diceOk("менша з 2d6") && C.diceOk("2d6+2") && C.diceOk("") && !C.diceOk("дуже") && !C.diceOk("2d"), "diceOk");

// category defaults and the guide
eq(C.catDefaults("boss"), { hp: 35, armor: 3 }, "boss defaults");
eq(C.catDefaults("statists"), { hp: 3, armor: 0 }, "statists defaults");

// the form's choices win: defence, flags, psi armour, aspects with free invokes, attack type and charges
const f = C.blankForm("Робот");
f.cat = "elite"; f.hp = 15; f.armor = 3; f.psiArmor = 2;
f.def.fire = "immune"; f.def.rad = "heal"; f.flags.kamikaze = true; f.flags.psyVuln = true;
f.notes = "невразливий до шкоди вогнем"; f.def.fire = "normal"; // the form says «звичайна»: it wins over the note
f.attacks = [
  C.attackRow({ n: "Лазерна гвинтівка", note: "ігнорує 1 броні", d: "1d10" }),
  C.attackRow({ n: "Кулаки", note: "кинь двічі, обери менший", d: "1d6" }),
  C.attackRow({ n: "Ракети", d: "менша з 2d6", type: "fire", ammo: 3 }),
];
f.moves = [{ n: "", t: "Раз за сцену лякає" }, { n: "Крик", t: "" }, { n: " ", t: " " }];
f.aspects = [{ t: "Іржавий", inv: 2 }, { t: " ", inv: 1 }];
r = C.buildEnemy(f);
ok(!r.err, `builds: ${r.err}`);
const s = r.system;
ok(s.cat === "elite" && s.hp.max === 15 && s.armor === 3 && s.psiArmor === 2, "elite stats");
ok(s.def.fire === "normal" && s.def.rad === "heal" && s.flags.kamikaze && s.flags.psyVuln && !s.flags.noStun, `defence: ${JSON.stringify(s.def)} ${JSON.stringify(s.flags)}`);
eq(s.attacks.map((a) => [a.name, a.dice, a.type, a.ignoreN, a.ammoMax, a.ammo]), [
  ["Лазерна гвинтівка", "1d10", "laser", 1, 0, 0],
  ["Кулаки", "2d6kl1", "phys", 0, 0, 0],
  ["Ракети", "2d6kl1", "fire", 0, 3, 3],
], "attacks");
eq(s.attacks[1].note, "", "«обери менший» leaves the note");
eq(s.moves.map((m) => [m.n, m.t, m.used]), [["Хід", "Раз за сцену лякає", false], ["Крик", "", false]], "moves: blank ones dropped, nameless named");
eq(s.baseAspects, [{ t: "Іржавий", inv: 2 }], "aspects with free invokes");
ok(s.orig.baseAspects[0].inv === 0 && s.orig.attacks.length === 3, "book copy has the aspects without invokes");

// «за основу»: every enemy of the battle generator round-trips through system → form → system
const DB = createTerminal().battle.BT.DB;
let n = 0;
for (const fk of Object.keys(DB)) for (const c of ["boss", "elite", "regular", "statists"]) for (const rec of DB[fk][c] || []) {
  n++;
  const sys = M.toSystem(B.enemyFromRecord(rec));
  const form = C.formFromSystem(sys, { name: rec.name });
  const out = C.buildEnemy(form);
  ok(!out.err, `${rec.name}: builds (${out.err})`);
  if (out.err) continue;
  const a = out.system;
  ok(a.hp.max === sys.hp.max && a.armor === sys.armor && a.psiArmor === sys.psiArmor && a.cat === sys.cat, `${rec.name}: stats`);
  eq(a.def, sys.def, `${rec.name}: def`);
  eq(a.flags, { ...sys.flags, nonliving: sys.flags.nonliving ?? null }, `${rec.name}: flags`); // the generator leaves «Неживий» unset: null, by the book
  eq(a.attacks, sys.attacks, `${rec.name}: attacks`);
  eq(a.moves, sys.moves, `${rec.name}: moves`);
  eq(a.baseAspects, sys.baseAspects, `${rec.name}: aspects`);
  ok(a.notes === sys.notes && a.armorText === sys.armorText, `${rec.name}: notes / armour text`);
}
ok(n >= 80, "DB size " + n);

// armour text is dropped when the armour number changes
const book = M.toSystem(B.enemyFromRecord({ name: "Паладин", cat: "boss", hp: 40, armor: "5 (силова броня)", dmg: "меч 2d6", aspects: [], moves: [], notes: "" }));
const pf = C.formFromSystem(book, { name: "Паладин" });
ok(C.buildEnemy(pf).system.armorText === book.armorText && book.armorText !== "", "armour text kept");
pf.armor = 6;
ok(C.buildEnemy(pf).system.armorText === "", "armour text dropped when armour changes");

// an attack's piercing stays while its note is untouched, and goes with the words
const pierce = C.formFromSystem(M.toSystem(B.enemyFromRecord({ name: "Т", cat: "elite", hp: 12, armor: "2", dmg: "лазер (ігнорує 2 броні) 1d10", aspects: [], moves: [], notes: "" })), { name: "Т" });
ok(C.buildEnemy(pierce).system.attacks[0].ignoreN === 2, "piercing loaded");
pierce.attacks[0].note = "звичайний постріл";
ok(C.buildEnemy(pierce).system.attacks[0].ignoreN === 0, "piercing gone with the words");

// «Неживий» (author, 2026-11-22; 4.1): three states, null («by the book's name») is never turned into false
{
  const blank = C.blankForm("Хтось");
  ok(blank.flags.nonliving === null && C.nonlivingShown(blank) === false, "blank: null, shown off");
  ok(C.buildEnemy(blank).system.flags.nonliving === null, "blank untouched → null");
  const robot = C.formFromSystem({ cat: "regular", hp: { max: 10 }, flags: { nonliving: null } }, { name: "Робот-вартовий" });
  ok(robot.flags.nonliving === null && C.nonlivingShown(robot) === true, "book robot: null, shown on");
  ok(C.buildEnemy(robot).system.flags.nonliving === null, "book robot untouched → null (still by the book)");
  robot.name = "Мій бляшанка";
  ok(C.nonlivingShown(robot, "Робот-вартовий") === true, "renamed robot: shown on by the base's name");
  ok(C.buildEnemy(robot, { baseName: "Робот-вартовий" }).system.flags.nonliving === true, "renamed robot untouched → true written down");
  robot.flags.nonliving = false;
  ok(C.nonlivingShown(robot, "Робот-вартовий") === false && C.buildEnemy(robot, { baseName: "Робот-вартовий" }).system.flags.nonliving === false, "GM's untick wins");
  const beast = C.formFromSystem({ cat: "regular", hp: { max: 10 }, flags: { nonliving: true } }, { name: "Яо-ґай" });
  ok(beast.flags.nonliving === true && C.buildEnemy(beast).system.flags.nonliving === true, "GM's tick kept through «за основу»");
}

if (failures) { console.log(`${failures} failures`); process.exit(1); }
console.log("enemy-create: ok");
