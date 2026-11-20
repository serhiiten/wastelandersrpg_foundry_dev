// What an enemy's move does, read from its text (author, 2026-11-19; module/rules/move-spec.mjs): the patterns on the
// book's texts, the hint under the button, the marks `used` / `spent`, the factions, whom a group heal takes, the damage
// path (survive, the HP-threshold bonus, the hit kept for undo) and the moves' bonus to the attacks.
// The levels of every move against the author's table: tests/move-levels.test.mjs. Run: node tests/move-spec.test.mjs
import * as S from "../module/rules/move-spec.mjs";
import { attackDice, profileOf, bonusFrom } from "../module/rules/enemy-model.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const spec = (n, t) => S.moveSpec({ n, t });
const kinds = (s) => s.effects.map((e) => e.kind).join(",");

// the limit; a part's «лише раз за сцену» (the aimed shot's stun) is not the move's
eq(S.moveLimit("раз за сцену відновлює ОЗ 5"), { uses: 1, per: "scene" }, "раз за сцену");
eq(S.moveLimit("двічі за сцену відновлює собі 3 ОЗ"), { uses: 2, per: "scene" }, "двічі за сцену");
eq(S.moveLimit("Раз за сесію"), { uses: 1, per: "session" }, "раз за сесію");
eq(S.moveLimit("Ту саму ціль рейнджер може приголомшити лише раз за сцену"), { uses: 0, per: null }, "лише раз за сцену: no limit");
eq(["раз за сцену", "2 за сцену", "раз за сесію", "без ліміту"], [S.limitLabel({ uses: 1, per: "scene" }), S.limitLabel({ uses: 2, per: "scene" }), S.limitLabel({ uses: 1, per: "session" }), S.limitLabel({ uses: 0 })], "limit labels");

// the book's texts
const AIM = "коли рейнджер стріляє, вибери на додачу до шкоди один ефект: • рейнджер вибиває зброю з рук цілі… • рейнджер ненадовго приголомшує ціль, і та пропускає свою наступну дію. Ту саму ціль рейнджер може приголомшити лише раз за сцену; • шкода повністю ігнорує броню цілі.";
let s = spec("Прицільний постріл", AIM);
ok(s.level === "effect" && s.button && !s.uses && !s.effects.length && s.hint === "Покаже хід у чаті, решту вирішуєш ти.", `the aimed shot: a button, the card only (stage 2): ${JSON.stringify(s)}`);
s = spec("Точний удар", "коли суперсолдат б'є чи стріляє, вибери на додачу до шкоди один ефект: • суперсолдат завдає додатково 1d6 шкоди; • …");
ok(!s.effects.length, "Точний удар: no 1d6 hit");
s = spec("Дефібрилятор", "раз за сцену повертає в сцену з 10 ОЗ живого союзника, чиї ОЗ упали до 0, якщо той перебуває в зоні БТРа і його тіло вціліло.");
eq(s.effects, [{ kind: "revive", hp: 10 }], "Дефібрилятор revives with 10");
s = spec("Ребут", "раз за сцену може повернути в сцену союзника-робота, чиї ОЗ упали до 0, з 5 ОЗ, якщо його корпус не знищено повністю.");
eq(s.effects, [{ kind: "revive", hp: 5 }], "Ребут revives with 5");
s = spec("Захисний протокол", "раз за сцену ігнорує шкоду, яку йому щойно завдали.");
ok(kinds(s) === "undo" && s.hint === "Шкода, яку ворогові щойно завдали, скасовується. Хід з'явиться в чаті.", `undo, the hint without a gender: ${s.hint}`);
s = spec("Суперстимпак", "раз за сцену відновлює ОЗ 1d6+4.");
eq(s.effects, [{ kind: "heal", expr: "1d6+4", who: "self" }], "self heal");
s = spec("Цілющий порошок", "двічі за сцену відновлює собі або союзникові 3 ОЗ.");
ok(s.uses === 2 && s.effects[0].who === "targetOrSelf", "the powder: twice, the target or self");
s = spec("Перегрупуймося", "раз за сцену наказує своєму загону перегрупуватися. Усі бійці НКР, які чують наказ, відновлюють по 3 ОЗ і, якщо їм ніщо не заважає, можуть переміститися на одну зону.");
eq(s.effects, [{ kind: "heal", expr: "3", who: "faction" }], "Перегрупуймося heals the faction");
s = spec("Децимація", "раз за сцену показово страчує одного легіонера у своїй зоні. Усі інші легіонери, які це бачать, негайно відновлюють 5 ОЗ і до кінця сцени завдають +1 шкоди.");
ok(kinds(s) === "execute,heal,allyBonus" && s.effects[1].who === "factionOthers" && s.effects[2].dmg === 1, `Децимація: execute, the others healed, +1 a line: ${kinds(s)}`);
s = spec("Удар-землетрус", "раз за сцену завдає 3d6 шкоди всім іншим істотам у своїй зоні; вони падають з ніг і приголомшені.");
ok(s.effects[0]?.kind === "hit" && s.effects[0].dice === "3d6" && s.effects[0].zone === "all", `the earthquake hits everyone in the zone: ${JSON.stringify(s.effects)}`);
s = spec("Вогняне дихання", "раз за сцену завдає 2d6 шкоди вогнем усім істотам у тій самій зоні, що й він. Інші вогнедишні гекони від цього шкоди не отримують.");
ok(s.effects[0].type === "fire" && s.effects[0].zone === "all" && s.effects[0].spareKin, `the gecko spares its kind: ${JSON.stringify(s.effects)}`);
s = spec("Полум’яний ривок", "раз за сцену завдає 2d6 шкоди ворогам у своїй зоні й підпалює їх; у сусідній зоні — 2d6 одній цілі.");
ok(s.effects[0].type === "fire" && s.effects[0].zone === "foes", `the flame dash burns the foes of the zone: ${JSON.stringify(s.effects)}`);
s = spec("Лють", "раз за сцену, а також щоразу після загибелі дитинчати, завдає шкоди пазурями (3d6, ігнорує 4 броні) всім ворогам у своїй зоні.");
ok(kinds(s) === "attack" && s.effects[0].weapon === "пазур" && s.effects[0].zone === "foes" && s.again, `«Лють» swings the claws, again after a cub: ${JSON.stringify(s)}`);
s = spec("Тільки не по дітях", "щоразу, коли гине одне з її дитинчат, самиця відновлює 5 ОЗ, а її шкода до кінця сцени зростає на 2.");
ok(kinds(s) === "heal,bonus" && s.effects[1].stack && !s.uses, "«Тільки не по дітях»: heal and a stacking bonus, no limit");
s = spec("Неймовірна живучість", "раз за сцену, якщо отримана шкода мала б знизити ОЗ самиці до 0, вона натомість лишається живою з 10 ОЗ.");
ok(s.level === "auto" && !s.button && s.effects[0].kind === "survive" && s.effects[0].hp === 10, `survive with 10: ${JSON.stringify(s)}`);
s = spec("Кільце вогню", "раз за сцену витрачає 1 заряд важкого вогнемета й підпалює всі сусідні зони, крім своєї. … Поки істота палає, щоразу, коли настає її черга діяти, вона отримує 1d6 шкоди вогнем. Ефект триває 3 кола…");
ok(kinds(s) === "ammo,state" && s.effects[0].n === 1 && s.effects[1].key === "burning", `the ring of fire spends a charge and sets on fire, no damage now: ${kinds(s)}`);
s = spec("Псионічний талант*", "раз за сцену застосовує псионічний перк. … кинь 1d6: 1 — «Цілющий дотик», 2 — «Телекінез», 3 — «Сканування розуму», 4 — «Навіювання», 5 — «Невидимість», 6 — «Обраний».");
ok(s.level === "card" && kinds(s) === "psiPerk", "the psionic talent: the card with the perk");
eq([1, 3, 6].map((n) => S.psiPerkOf("кинь 1d6: 1 — «Цілющий дотик», 2 — «Телекінез», 3 — «Сканування розуму», 4 — «Навіювання», 5 — «Невидимість», 6 — «Обраний».", n)), ["Цілющий дотик", "Сканування розуму", "Обраний"], "the psionic perk by the die");
s = S.moveSpec({ n: "Ін’єкція Психо", t: "" }, { moves: [{ n: "Ін’єкція Психо", t: "" }] }, 0);
ok(kinds(s) === "psycho" && s.uses === 1 && s.per === "scene", "Психо: once a scene, even with no words of a limit");
ok(spec("Політ", "може переміщатися між будь-якими зонами").level === "none", "Політ: words only");

// marks: `spent` and the old `used`
const two = { n: "Цілющий порошок", t: "двічі за сцену відновлює собі або союзникові 3 ОЗ." };
const sp = S.moveSpec(two);
eq(S.moveMarks(two, sp), { spent: 0, used: false, left: 2, blocked: false }, "fresh");
let m1 = S.spendMove(two, sp);
eq([m1.spent, m1.used, S.moveMarks(m1, sp).left], [1, false, 1], "one of two used");
m1 = S.spendMove(m1, sp);
eq([m1.spent, m1.used, S.moveMarks(m1, sp).blocked], [2, true, true], "two of two: used and blocked");
eq(S.freeMove(m1), { ...two, spent: 0, used: false }, "«Зняти позначку» gives back every use");
eq(S.moveMarks({ ...two, used: true }, sp), { spent: 2, used: true, left: 0, blocked: true }, "an old tick counts as all uses");
const rage = { n: "Лють", t: "раз за сцену, а також щоразу після загибелі дитинчати, завдає шкоди пазурями всім ворогам у своїй зоні." };
ok(!S.moveMarks(S.spendMove(rage), S.moveSpec(rage)).blocked && S.spendMove(rage).used, "«а також щоразу»: marked, not blocked");
const kids = { n: "Тільки не по дітях", t: "щоразу, коли гине одне з її дитинчат, самиця відновлює 5 ОЗ, а її шкода до кінця сцени зростає на 2." };
ok(S.spendMove(kids).spent === 1 && !S.spendMove(kids).used, "no limit: counted, never used");
eq(S.resetMoveList([{ ...two, spent: 1 }, { n: "x", used: false }]).map((m) => [m.spent, m.used]), [[0, false], [0, false]], "the scene's end clears all");
ok(S.resetMoveList([{ n: "x", used: false, spent: 0 }]) === null, "nothing to clear");

// factions (author, 2026-11-19: the wiki's groups by the book's names)
eq(["Легіонер 3", "Бойовий раб Легіону", "Рядовий армії НКР", "Супермутант‑майстер", "Пес Легіону", "Кентавр"].map(S.factionOf), ["legion", "legion", "ncr", "supermutants", "", ""], "factions");
eq(S.bookName({ source: "Центуріон", name: "Хтось 2" }), "Центуріон", "the compendium's name first");
eq(S.bookName({ base: "Легіонер", name: "Луцій" }), "Легіонер", "the base actor's name");
eq(S.bookName({ name: "Легіонер 4" }), "Легіонер", "the name without its number");
eq(S.healWho({ targets: ["t1"], faction: ["a", "b"], self: "a" }), { ids: ["t1"], why: "targets" }, "targets first");
eq(S.healWho({ targets: [], faction: ["a", "b"], self: "a" }), { ids: ["a", "b"], why: "faction" }, "the faction on the scene, the user too");
eq(S.healWho({ targets: [], faction: ["a", "b"], self: "a", others: true }), { ids: ["b"], why: "faction" }, "the faction without the user");
eq(S.healWho({ targets: [], faction: [], self: "a" }), { ids: ["a"], why: "self" }, "no faction: only the user");

// the damage path
const SURV = { n: "Живучість", t: "раз за сцену, якщо отримана шкода мала б знизити ОЗ супермутанта до 0, він натомість лишається живим з 5 ОЗ." };
let sys = { hp: { value: 9, max: 30 }, moves: [SURV] };
let ah = S.afterHit(sys, 9, 0, "Рейдер: Мисливська рушниця");
ok(ah.hp === 5 && ah.moves[0].used && ah.moves[0].spent === 1 && /Живучість/.test(ah.note), `survive with 5: ${JSON.stringify(ah)}`);
eq(ah.lastHit, { before: 9, after: 5, head: "Рейдер: Мисливська рушниця" }, "the hit kept");
ah = S.afterHit({ hp: { value: 5, max: 30 }, moves: [{ ...SURV, used: true }] }, 5, 0);
ok(ah.hp === 0 && !ah.moves && !ah.note, "survive once a scene");
ah = S.afterHit(sys, 9, 9);
ok(ah.lastHit === null && ah.hp === 9, "a hit of 0 keeps nothing");
const FORM = { n: "Це не моя фінальна форма", t: "коли ОЗ суперсолдата знижуються до половини (25 або менше), уся його шкода до кінця сцени зростає на 2." };
sys = { hp: { value: 40, max: 50 }, moves: [FORM], attacks: [{ name: "Кулак", dice: "1d6", note: "" }, { name: "Плазмова гвинтівка", dice: "2d6+1", note: "" }] };
eq(S.moveBonus(sys), { dmg: 0, armor: 0, from: [] }, "above the threshold: no bonus");
ah = S.afterHit(sys, 40, 22);
ok(ah.moves?.[0]?.spent === 1 && /фінальна форма/.test(ah.note), `past the threshold: marked: ${JSON.stringify(ah)}`);
const healed = { ...sys, hp: { value: 40, max: 50 }, moves: ah.moves };
eq(S.moveBonus(healed).dmg, 2, "the bonus lasts, healed or not");
eq([attackDice(healed, 0), attackDice(healed, 1)], ["1d6+2", "2d6+3"], "every attack +2, unarmed too");
eq(bonusFrom(healed, 0), ["«Це не моя фінальна форма»"], "the bonus's source named");
const BERS = { n: "Берсерк-протокол", t: "раз за сцену, коли ОЗ робо-скорпіона знижуються до 20 або менше, його броня і шкода до кінця сцени зростають на 2." };
sys = { armor: 5, hp: { value: 18, max: 60 }, moves: [BERS], attacks: [] };
eq([S.moveBonus(sys).armor, profileOf(sys).armor], [2, 7], "Берсерк-протокол: +2 armour at 20 HP or less");
sys = { hp: { value: 30, max: 40 }, moves: [{ ...kids, spent: 2 }], attacks: [{ name: "Пазурі", dice: "3d6", note: "" }] };
eq(attackDice(sys, 0), "3d6+4", "«Тільки не по дітях» +2 a cub");
ok(S.canUndo({ before: 12, after: 4 }, 4) && !S.canUndo({ before: 12, after: 4 }, 6) && !S.canUndo(null, 4), "undo only while the HP are what the hit left");

// stage 2 (author, 2026-11-20): states, triggers with a button, the effect menu
const st = (x) => x.effects.filter((e) => e.kind === "state");
s = spec("Удар-землетрус", "раз за сцену б'є суперсиловим кулаком об землю. Усі інші істоти в його зоні отримують 3d6 шкоди, падають з ніг і приголомшені: пропускають свою наступну дію.");
eq(st(s).map((e) => e.key), ["down", "stunned"], "the earthquake knocks down and stuns");
ok(s.effects.some((e) => e.kind === "hit" && e.zone === "all"), "the earthquake hits everyone else in the zone");
s = spec("Отруєння", "раз за сцену вражає ціль отруйним жалом. Протягом 3 кіл жертва отримує 1d6 шкоди від отрути щоразу, коли настає її черга діяти. Ця шкода ігнорує броню.");
eq(st(s), [{ kind: "state", key: "poisoned", dice: "1d6", left: 3, type: "poison", ignoreArmor: true }], "poison: 1d6 for 3 rounds");
ok(!s.effects.some((e) => e.kind === "hit"), "poison deals nothing now");
s = spec("Клешні-лещата", "раз за сцену, завдаючи шкоди, хапає ціль клешнею й накладає на неї аспект захоплена. … щоразу, коли настає її черга діяти, вона автоматично отримує 3d6 шкоди від стискання клешні.");
eq(st(s), [{ kind: "state", key: "grabbed", dice: "3d6" }], "the claws grab with 3d6");
s = spec("Помах Меча Сходу", "раз за сцену завдає 3d6 шкоди всім ворогам у своїй зоні, відкидає їх на одну зону, збиває з ніг і пускає їм кров. Ця кровотеча завдає 1d10 шкоди, що ігнорує броню, коли настає їхня черга діяти, після чого минає.");
eq(st(s).map((e) => e.key), ["down", "bleeding"], "the sword knocks down and bleeds");
s = spec("Плювок кислотою", "раз за сцену плює їдкою кислотою в ціль у своїй або сусідній зоні. Кислота завдає 2d6 шкоди, а ціль до кінця сцени отримує −2 до фізичної броні (мінімум 0).");
eq(st(s).map((e) => e.key), ["acid"], "the acid's −2 armour");
s = spec("Розірву пащеку", "раз за сцену залякує одну ціль у своїй зоні, і та пропускає свою наступну дію.");
eq(st(s).map((e) => e.key), ["stunned"], "«Розірву пащеку» stuns (author)");
s = spec("Прицільний постріл", "коли рейнджер стріляє, вибери на додачу до шкоди один ефект: • рейнджер ненадовго приголомшує ціль, і та пропускає свою наступну дію.");
ok(!st(s).length, "the aimed shot's text puts no state by its button (the menu does)");
// triggers
s = spec("Перегрів ядра", "коли ОЗ робота-вартового падають до 0, він вибухає й завдає всім істотам у своїй зоні 1d10 шкоди вогнем + 1d6 шкоди радіацією, що ігнорує броню.");
ok(s.level === "trigger" && s.button && s.when === "down" && s.uses === 1, "a 0-HP blast: a button, once");
eq(s.effects.map((e) => [e.dice, e.type, e.ignoreArmor, e.zone]), [["1d10", "fire", false, "all"], ["1d6", "rad", true, "all"]], "both parts; «ігнорує броню» is the last one's");
s = spec("Круте піке", "коли ОЗ вертиберда знижуються до 0, він каменем падає й мальовничо вибухає, завдаючи 3d6 шкоди всім істотам в одній вибраній зоні.");
ok(s.effects[0].zone === "", "the dive hits the targets (the zone chosen)");
s = spec("Розпад", "коли паладин своєю атакою знижує ОЗ цілі до 0, усі вороги в зоні цілі отримують 1d10 енергетичної шкоди, що ігнорує броню.");
ok(s.when === "kill" && s.uses === 0 && s.effects[0].zone === "killFoes" && s.effects[0].type === "laser", "«Розпад»: on a kill, energy, the zone of the target");
// the menu
const ranger = { moves: [{ n: "Прицільний постріл", t: "коли елітний рейнджер стріляє, вибери на додачу до шкоди один ефект: • елітний рейнджер завдає додатково 1d6 шкоди; • елітний рейнджер вибиває зброю з рук цілі, якщо та озброєна. • елітний рейнджер ненадовго приголомшує ціль, і та пропускає свою наступну дію. Ту саму ціль елітний рейнджер може приголомшити лише раз за сцену; • елітний рейнджер збиває ціль з ніг. • шкода повністю ігнорує броню цілі." }] };
eq(S.attackMenu(ranger, { note: "бій на відстані" }).map((o) => o.k), ["none", "plus", "disarmed", "stunned", "down", "ignore"], "the aimed shot's menu");
ok(S.attackMenu(ranger, { note: "ближній бій" }) === null, "«коли … стріляє»: no menu for a melee attack");
ok(S.attackMenu(ranger, { note: "" }).find((o) => o.k === "stunned").once, "the stun once a scene");
const dog = { moves: [{ n: "Кусь", t: "атакуючи в ближньому бою, може завдати вдвічі меншої шкоди, щоб натомість збити ціль з ніг." }] };
eq(S.attackMenu(dog, { note: "ближній бій" }).map((o) => o.k), ["none", "halfDown"], "«Кусь»: half to knock down");
ok(S.attackMenu(dog, { note: "бій на відстані" }) === null, "«Кусь» is melee only");
ok(S.attackMenu({ moves: [{ n: "Лють", t: "раз за сцену" }] }, {}) === null, "no menu without such a move");
// an attack's note: «Підпал» and «Кровотеча» (the wiki's weapon properties), 1d6 once
eq(S.attackStates("шкоди вогнем, ближній бій, підпалює ціль"), [{ key: "burning", dice: "1d6", left: 1, type: "fire" }], "«підпалює ціль»");
eq(S.attackStates("шкоди вогнем всім істотам в одній зоні, 2 шт., підпалюють цілі").map((x) => x.key), ["burning"], "«підпалюють цілі»");
eq(S.attackStates("фізичної шкоди, ближній бій, ігнорує 2 броні, спричиняє кровотечу"), [{ key: "bleeding", dice: "1d6", left: 1, ignoreArmor: true }], "«спричиняє кровотечу»");
eq(S.attackStates("фізичної шкоди, бій на відстані"), [], "a plain note puts nothing");

// stage 3 (author, 2026-11-20): the allies' bonus of «Ave!» / «Децимація» on the ones the move took
{
  let b = S.putBuff(null, "Ave! True to Caesar!", 2);
  eq(S.buffList(b), [{ dmg: 2, from: "Ave! True to Caesar!" }], "Ave! puts +2");
  b = S.putBuff(b, "Ave! True to Caesar!", 2);
  eq(S.buffList(b).length, 1, "the same move again replaces, doesn't stack");
  b = S.putBuff(b, "Децимація", 1);
  const leg = { hp: { value: 10, max: 10 }, moves: [], attacks: [{ name: "Мачете", dice: "1d10", note: "" }, { name: "Кулак", dice: "1d6", note: "" }] };
  eq(S.moveBonus(leg, b).dmg, 3, "different moves add up: +3");
  eq([attackDice(leg, 0, b), attackDice(leg, 1, b)], ["1d10+3", "1d6+3"], "every attack, unarmed too");
  eq(bonusFrom(leg, 0, b), ["«Ave! True to Caesar!»", "«Децимація»"], "the moves named on the card");
  eq(attackDice(leg, 0), "1d10", "no flag: no bonus");
  eq(S.buffList({ x: { dmg: 0, from: "x" }, y: null }), [], "empty records count nothing");
  ok(((h) => /сильніше/.test(h) && !/вручну/.test(h))(S.moveHint(spec("Ave! True to Caesar!", "раз за сцену видає бойовий клич. Усі бійці Легіону, які його чують, відновлюють 5 ОЗ і до кінця сцени завдають +2 шкоди."))), "the tooltip no longer says «add by hand»");
}

// «Улюблений ворог» (stage 3): acts by itself, +2 to a mutant target (applyDamage)
{
  const FAV = { n: "Улюблений ворог", t: "завдає на 2 шкоди більше мутантам, супермутантам та гулям." };
  const s = S.moveSpec(FAV);
  ok(s.level === "auto" && !s.button && s.effects[0]?.kind === "favFoe" && s.effects[0].dmg === 2, `favFoe: ${JSON.stringify(s)}`);
  ok(/мутантам, супермутантам і гулям/.test(s.hint), `its tooltip: ${s.hint}`);
  eq([S.favFoeBonus({ moves: [FAV] }), S.favFoeBonus({ moves: [] }), S.favFoeBonus(null)], [2, 0, 0], "the bonus of an attacker");
}

// «Приголомшливий рев» (stage 3): the state of those who hear
{
  const s = S.moveSpec({ n: "Приголомшливий рев", t: "раз за сцену оглушливо реве. Усі живі вороги, які його чують, отримують −2 до своєї наступної перевірки." });
  eq(s.effects, [{ kind: "state", key: "roar", heard: true }], "the roar puts its state on those who hear");
  ok(s.level === "effect" && s.button && /Живим персонажам на сцені/.test(s.hint), `its tooltip: ${s.hint}`);
}

// «Децимація» takes only the legionaries, «Ave!» every fighter of the Legion (author, 2026-11-20: the Центуріон mustn't heal the Легат)
{
  const dec = S.moveSpec({ n: "Децимація", t: "раз за сцену показово страчує одного легіонера у своїй зоні. Усі інші легіонери, які це бачать, негайно відновлюють 5 ОЗ і до кінця сцени завдають +1 шкоди." });
  eq(dec.effects.filter((e) => e.only).map((e) => [e.kind, e.only]), [["execute", ["Легіонер"]], ["heal", ["Легіонер"]]], "Децимація: a legionary executed, the other legionaries healed");
  ok(/Інші легіонери на сцені/.test(dec.hint) && /Вони до кінця сцени/.test(dec.hint), `its tooltip: ${dec.hint}`);
  const ave = S.moveSpec({ n: "Ave! True to Caesar!", t: "раз за сцену видає бойовий клич. Усі бійці Легіону, які його чують, відновлюють 5 ОЗ і до кінця сцени завдають +2 шкоди." });
  ok(!ave.effects.some((e) => e.only), "Ave!: every fighter of the Legion");
}

// summons (stage 3): a button with its effect; who comes is an enemy of the compendium
{
  const { readFileSync, readdirSync } = await import("node:fs");
  const { join, resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(join(d, x.name)) : [join(d, x.name)]));
  const names = new Set(walk(join(ROOT, "src/packs/opponents")).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(f, "utf8"))).filter((j) => j.type === "enemy").map((j) => S.normEnemyName(j.name)));
  for (const [n, sm] of Object.entries(S.SUMMONS)) {
    ok(names.has(S.normEnemyName(sm.book)), `«${n}» calls «${sm.book}», an enemy of the compendium`);
    const s = S.moveSpec({ n, t: "раз за сцену кличе на допомогу" });
    ok(s.level === "effect" && s.button && s.effects[0].kind === "summon" && s.effects[0].n === sm.n, `«${n}»: a button that summons`);
  }
  ok(S.SUMMONS["сигналізація"].sceneOnce && !S.SUMMONS["підкріплення"].sceneOnce, "only «Сигналізація» is once a scene for all its kind");
}

// before the DEV release (author, 2026-11-20): nobody else of the side, what stops a move before it is spent, the hidden ones
{
  eq(S.healWho({ targets: [], faction: ["a"], self: "a", others: true }), { ids: [], why: "none" }, "«others» with nobody else on the scene: none");
  eq(S.healWho({ targets: [], faction: [], self: "a", others: true }), { ids: [], why: "none" }, "«others» with no faction at all: none");
  const dec = spec("Децимація", "раз за сцену показово страчує одного легіонера у своїй зоні. Усі інші легіонери, які це бачать, негайно відновлюють 5 ОЗ і до кінця сцени завдають +1 шкоди.");
  ok(dec.effects[0].kind === "execute" && dec.effects[0].sameZone === true, "Децимація: the execution «у своїй зоні»");
  ok(S.moveBlock(dec, { zone: "z1", targetZone: "z1" }) === null, "Децимація: the legionary in the centurion's zone");
  eq(S.moveBlock(dec, { zone: "z1", targetZone: "z2" }), { why: "otherZone" }, "Децимація: a legionary in another zone");
  eq(S.moveBlock(dec, { zone: "z1", targetZone: null }), { why: "otherZone" }, "Децимація: a legionary outside the zones");
  ok(S.moveBlock(dec, { zone: null, targetZone: "z2" }) === null, "Децимація: the centurion outside the zones is not stopped (the author's question)");
  const zoneHit = { effects: [{ kind: "hit", dice: "2d6", zone: "all" }] };
  eq(S.moveBlock(zoneHit, { zone: null }), { why: "noZone", kill: false }, "a zone hit outside the zones, no targets");
  ok(S.moveBlock(zoneHit, { zone: "z1" }) === null, "a zone hit in a zone");
  ok(S.moveBlock(zoneHit, { zone: null, targets: 2 }) === null, "a zone hit outside the zones with targets");
  eq(S.moveBlock({ effects: [{ kind: "hit", dice: "2d6", zone: "killFoes" }] }, { zone: "z1", killZone: null }), { why: "noZone", kill: true }, "«Розпад»: the fallen target outside the zones");
  eq(S.moveBlock({ effects: [{ kind: "attack", zone: "foes" }] }, { zone: null }), { why: "noZone", kill: false }, "«Лють» outside the zones, no targets");
  ok(S.moveBlock({ effects: [{ kind: "hit", dice: "2d6", zone: "" }] }, { zone: null }) === null, "a hit at the targets isn't a zone hit");
  const sm = S.moveSpec({ n: "Підкріплення", t: "раз за сцену кличе на допомогу" });
  eq(S.moveBlock(sm, { found: false }), { why: "noSummon", book: "Гігантська мураха-солдат" }, "a summons missing from the compendium");
  ok(S.moveBlock(sm, { found: true }) === null, "a summons found");
  ok(S.moveBlock(spec("Ave! True to Caesar!", "раз за сцену видає бойовий клич. Усі бійці Легіону, які його чують, відновлюють 5 ОЗ і до кінця сцени завдають +2 шкоди."), {}) === null, "a move with nothing to check");
  const toks = [{ id: "a", hidden: false }, { id: "b", hidden: true }, { id: "c" }, { id: "d", hidden: true }];
  eq(S.splitHidden(toks, (t) => !!t.hidden), { open: [{ id: "a", hidden: false }, { id: "c" }], hidden: [{ id: "b", hidden: true }, { id: "d", hidden: true }] }, "the hidden ones apart, order kept");
  eq(S.splitHidden(null, () => true), { open: [], hidden: [] }, "nothing to split");
}

console.log(failures ? `FAILS: ${failures} of ${checks}` : `move-spec: OK (${checks} checks)`);
if (failures) process.exit(1);
