// The enemy sheet's view model (module/sheets/enemy-view.mjs).
// Run: node tests/enemy-view.test.mjs
import * as V from "../module/sheets/enemy-view.mjs";
import { toSystem } from "../module/rules/enemy-model.mjs";

let failures = 0;
const ok = (cond, msg) => { if (!cond) { failures++; console.log("FAIL " + msg); } };

const parsed = {
  cat: "elite", hp: 12, armor: 2, armorText: "2 (шкіряна броня; невразливий до шкоди вогнем; не можна збити з ніг)", notes: "",
  attacks: [
    { name: "Мисливська рушниця", dice: "2d6", type: "phys", note: "бій на відстані" },
    { name: "Граната", dice: "3d6", type: "phys", note: "всім в одній зоні, 2 шт.", ammoMax: 2, ammo: 1 },
    { name: "Лазерний пістолет", dice: "1d10", type: "laser", note: "ігнорує 1 броні", ignoreN: 1 },
  ],
  aspects: ["злий"],
  moves: [
    { n: "Інʼєкція Психо", t: "Раз за сцену вколює собі Психо: +2 шкоди до кінця сцени." },
    { n: "Аптечка", t: "Раз за сесію відновлює ОЗ 1d6+4." },
    { n: "Бойовий клич", t: "Раз за сцену усі, хто чує, відновлюють по 3 ОЗ." },
    { n: "Ривок", t: "Швидко відскакує." },
  ],
};
const sys = toSystem(parsed);

// category colour and label
let v = V.enemyView(sys, { gm: true });
ok(v.cat === "elite" && v.catColor === V.CAT_COLOR.elite && v.catLabel === "елітний", `category: ${v.cat} ${v.catColor} ${v.catLabel}`);
for (const c of ["statists", "regular", "elite", "boss"]) ok(V.enemyView({ ...sys, cat: c }).catColor === V.CAT_COLOR[c], `colour of ${c}`);
ok(new Set(Object.values(V.CAT_COLOR)).size === 4, "four different colours");

// HP bar classes
ok(V.hpLevel(0, 12).level === "dead" && V.hpLevel(0, 12).dead, "0 HP is dead");
ok(V.hpLevel(4, 12).level === "low", "4/12 is low (33 %)");
ok(V.hpLevel(5, 12).level === "mid" && V.hpLevel(7, 12).level === "mid", "5..7/12 is mid");
ok(V.hpLevel(8, 12).level === "ok" && V.hpLevel(12, 12).pct === 100, "8/12 is ok");
ok(V.hpLevel(3, 0).pct === 0, "no max, no percent");

// quick aspects and their locks
ok(v.quick.length === 3, "three quick aspects");
const down = v.quick.find((q) => q.key === "down");
ok(down.locked && down.help === "Не можна збити з ніг", `knockdown locked: ${JSON.stringify(down)}`);
ok(!v.quick.find((q) => q.key === "stunned").locked && !v.quick.find((q) => q.key === "disarmed").locked, "others open");
const sys2 = { ...sys, aspects: [{ t: "Збитий з ніг", inv: 0 }] };
ok(!V.enemyView(sys2).quick.some((q) => q.key === "down"), "a quick aspect already on the card is not offered again");

// tags and badges
ok(v.armor === 2 && v.psiArmor === 0, "armour");
ok(v.tags.some((t) => t.text === "невразливий до вогню" && t.help.includes("вогню") && t.icon.startsWith("fa-")), "defence tags with help");

// attacks
ok(v.attacks.length === 3 && v.attacks[0].dice === "2d6" && !v.attacks[0].plus && !v.attacks[0].ammo, "plain attack");
const g = v.attacks[1];
ok(g.ammo && g.ammo.max === 2 && g.ammo.value === 1 && g.ammo.pips.length === 2 && g.ammo.pips[0].on && !g.ammo.pips[1].on, `ammo pips: ${JSON.stringify(g.ammo)}`);
ok(V.enemyView({ ...sys, attacks: sys.attacks.map((a, i) => (i === 1 ? { ...a, ammo: 0 } : a)) }).attacks[1].dead, "spent ammo marks the attack");
ok(v.attacks[2].tcls === "dt-laser" && v.attacks[2].typeLabel === "Лазерна" && v.attacks[2].ignoreN === 1, `type chip: ${v.attacks[2].tcls} ${v.attacks[2].typeLabel}`);
ok(V.typeClass("psychic") === "dt-psi" && V.typeClass("nonsense") === "dt-phys", "psychic is dt-psi, unknown is physical");
ok(v.attacks[0].typeOpts.find((o) => o.sel).k === "phys", "type options select the attack's type");

// +2 markers: Психо used, Камікадзе
ok(!v.psycho && v.psyMove && v.psyMove.i === 0, "the Психо move is found");
const used = { ...sys, moves: sys.moves.map((m, i) => (i === 0 ? { ...m, used: true } : m)) };
let vp = V.enemyView(used);
ok(vp.psycho && vp.attacks[0].dice === "2d6+2" && vp.attacks[0].plus === 2 && vp.attacks[0].plusTitle === "Психо: +2 шкоди", `psycho +2: ${JSON.stringify(vp.attacks[0])}`);
const kami = { ...used, flags: { ...used.flags, kamikaze: true } };
vp = V.enemyView(kami);
ok(vp.attacks[0].plus === 4 && vp.attacks[0].dice === "2d6+4" && vp.attacks[0].plusTitle === "Психо й Камікадзе: +4 шкоди", `both: ${JSON.stringify(vp.attacks[0])}`);
vp = V.enemyView({ ...sys, flags: { ...sys.flags, kamikaze: true } });
ok(vp.attacks[0].plus === 2 && vp.attacks[0].plusTitle === "Камікадзе: +2 шкоди", "kamikaze alone");

// once per scene / session, heal moves
ok(v.moves[0].once && v.moves[0].psy, "the Психо move is once-only");
ok(v.moves[1].once && !v.moves[1].psy && v.moves[1].heal === "1d6+4" && !v.moves[1].healGroup, `self heal move: ${JSON.stringify(v.moves[1])}`);
ok(v.moves[2].once && v.moves[2].heal === "3" && v.moves[2].healGroup, `group heal move: ${JSON.stringify(v.moves[2])}`);
ok(!v.moves[3].once && !v.moves[3].heal, "an ordinary move");
ok(V.onceMove("Раз за сесію ...") && V.onceMove("раз за сцену") && !V.onceMove("щось інше") && V.onceMove("x", true), "onceMove");

// defence editor (GM only)
ok(V.enemyView(sys, { gm: false }).defence.length === 0, "no defence rows for players");
const rows = v.defence;
ok(rows.find((r) => r.f === "armor").value === 2 && rows.find((r) => r.f === "armor").path === "system.armor", "armour row");
ok(rows.find((r) => r.f === "psyArmor").path === "system.psiArmor", "psyArmor maps to psiArmor");
ok(rows.find((r) => r.f === "fire").options.find((o) => o.sel).v === "immune" && rows.find((r) => r.f === "fire").path === "system.def.fire", "fire select");
ok(rows.find((r) => r.f === "rad").options.length === 4 && rows.find((r) => r.f === "phys").options.length === 3, "R4 for radiation, R3 for the rest");
ok(rows.find((r) => r.f === "noKnockdown").value === true && rows.find((r) => r.f === "noKnockdown").path === "system.flags.noKnockdown", "flag row");
ok(rows.some((r) => r.f === "psyVuln"), "psyVuln row");

// «Як у книзі»
ok(!v.differs && v.canReset, "a fresh card equals the book");
ok(V.enemyView({ ...sys, armor: 5 }).differs, "armour changed");
ok(V.enemyView({ ...sys, attacks: sys.attacks.slice(1) }).differs, "attack removed");
ok(!V.enemyView({ ...sys, attacks: sys.attacks.map((a) => ({ ...a, ammo: 0 })), hp: { value: 1, max: 12 } }).differs, "ammo and current HP are not a difference");
ok(!V.enemyView({ ...sys, orig: null }).canReset, "no book copy, no reset");

// the state in words players see instead of HP (author, 2026-11-16)
const st = (v, m) => V.hpState(v, m).key;
ok(st(12, 12) === "full" && st(9, 12) === "ok" && st(7, 12) === "mid" && st(8, 12) === "ok" && st(4, 12) === "low" && st(1, 12) === "low" && st(0, 12) === "dead" && st(-3, 12) === "dead", "HP states by share");
ok(Object.values(V.HP_STATES).every((x) => x.label && /^fa-/.test(x.icon) && /^#[0-9a-f]{6}$/i.test(x.color)), "every state has a label, an icon and a colour");
ok(V.enemyView({ ...sys, hp: { value: 0, max: 12 } }).state.label === "Вибув", "the view carries the state");


// an attack's extra part as chips (author, 2026-11-19): «+1d6» + «Отрута», the note without those words
{
  const s = toSystem({ ...parsed, attacks: [
    { name: "Жало", dice: "1d10", type: "phys", note: "фізичної шкоди + 1d6 шкоди отрутою, ближній бій, отрута ігнорує броню" },
    { name: "Лапи", dice: "1d6", type: "phys", note: "фізичної шкоди + 3 шкоди радіацією, ближній бій, радіація ігнорує броню" },
    { name: "Мандибули", dice: "2d6", type: "phys", note: "фізичної шкоди + 3 шкоди кислотою, ближній бій" },
    { name: "Мисливська рушниця", dice: "2d6", type: "phys", note: "бій на відстані" },
  ] });
  const a = V.enemyView(s, { gm: true }).attacks;
  const ex = (k) => a[k].extra && [a[k].extra.text, a[k].extra.tcls, a[k].extra.label];
  ok(JSON.stringify(ex(0)) === JSON.stringify(["+1d6", "dt-poison", "Отрута"]), `poison chips: ${JSON.stringify(ex(0))}`);
  ok(JSON.stringify(ex(1)) === JSON.stringify(["+3", "dt-rad", "Радіація"]), `radiation chips: ${JSON.stringify(ex(1))}`);
  ok(JSON.stringify(ex(2)) === JSON.stringify(["+3", "dt-phys", "Кислота"]), `acid chips: ${JSON.stringify(ex(2))}`);
  ok(a[3].extra === null, "no extra part, no chips");
  ok(a[0].note === "ближній бій, отрута ігнорує броню", `poison note: «${a[0].note}»`);
  ok(a[1].note === "ближній бій, радіація ігнорує броню", `radiation note: «${a[1].note}»`);
  ok(a[2].note === "ближній бій", `acid note: «${a[2].note}»`);
  ok(a[0].noteRaw.includes("+ 1d6 шкоди отрутою"), "the stored note keeps the words (edit mode)");
  // «Огляд битви»'s tooltip: the extra part, then the note, no type words
  ok(V.attackTip(s.attacks[0]) === "+1d6 отрутою · ближній бій, отрута ігнорує броню", `tip: «${V.attackTip(s.attacks[0])}»`);
  ok(V.attackTip(s.attacks[2]) === "+3 кислотою · ближній бій", `acid tip: «${V.attackTip(s.attacks[2])}»`);
  ok(V.attackTip(s.attacks[3]) === "бій на відстані", `plain tip: «${V.attackTip(s.attacks[3])}»`);
  ok(V.attackTip({ name: "Пси-удар", type: "psychic", note: "психічної шкоди, ігнорує фізичну броню" }) === "ігнорує фізичну броню", "psychic tip without its type words");
}

if (failures) { console.log(`${failures} failure(s)`); process.exit(1); }
console.log("enemy-view: OK");
