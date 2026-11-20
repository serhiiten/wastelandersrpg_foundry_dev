/**
 * What an enemy's move does, read from its text (author, 2026-11-19; Fable's plan in docs/decisions/battle.md, «Automate
 * enemies' moves»). A pure module, no Foundry globals: the enemy card, «Огляд битви» and the damage path ask it, the tests
 * run it in Node (tests/move-spec.test.mjs, tests/move-levels.test.mjs).
 *
 * Nothing is stored: the behaviour follows the text, so an edited move changes it. Patterns first, then a small table by
 * the move's normalised name for what patterns can't tell.
 *
 * Levels (the author's decision table «Ходи супротивників: автоматизація», column «Рішення»):
 *   effect  — «Кнопка, ефект сам»: «Використати» spends it and applies what stage 1 knows (the rest is the chat card)
 *   card    — «Кнопка, лише картка»: «Використати» spends it and posts the card
 *   auto    — «Сам, без кнопки»: the system does it (survive, a bonus past an HP threshold); no button
 *   trigger — «Тригер-підказка»: acts at 0 HP / on a kill (stage 2); no button, its dice chips still hit
 *   none    — «Не автоматизуємо»: words only; no button
 */
import { diceInText, moveHeal, psyMoveIdx } from "./battle.mjs";

/** The button's levels */
export const BUTTON_LEVELS = new Set(["effect", "card"]);

/** A move's name for the tables: lower case, one kind of apostrophe and dash, no «*», no spaces at the ends */
export const normMoveName = (n) => String(n ?? "").toLowerCase().replace(/[’ʼ`]/g, "'").replace(/[‑–—]/g, "-").replace(/\*/g, "").replace(/\s+/g, " ").trim();

/** Moves patterns can't tell, by normalised name */
const BY_NAME = {
  // never automated (the author's table): movement, damage taken for another, hiding
  "політ": "none", "невпинність": "none", "амбразури": "none", "стрибок": "none", "мамо, тату!": "none", "непомітність": "none",
  // the button posts the card only
  "бойові рефлекси": "card", "бтр-магеддон": "card", "сигналізація": "card", "підкріплення": "card", "псионічний талант": "card",
  // acts by itself: +2 against mutants (stage 3)
  "улюблений ворог": "auto",
};

/** «раз / двічі за сцену / сесію»: {uses, per}; no limit → {uses: 0, per: null} */
export function moveLimit(text) {
  const t = String(text ?? "");
  // «лише раз за сцену» limits a part of the move (the aimed shot's stun), not the move itself
  const m = /(?<!лише\s)(?:(один\s+)?раз|двічі)\s+за\s+(сцену|сесію)/i.exec(t);
  if (!m) return { uses: 0, per: null };
  return { uses: /двічі/i.test(m[0]) ? 2 : 1, per: /сесію/i.test(m[2]) ? "session" : "scene" };
}

/** The damage dice of the text, in order: [{dice, type, ignoreArmor, ignoreN}] */
const hitsOf = (t) => diceInText(t).filter((p) => typeof p === "object" && p.damage)
  .map(({ dice, type, ignoreArmor, ignoreN }) => ({ dice, type, ignoreArmor, ignoreN }));

/** Who a zone hit takes when no targets are chosen: everyone else in the zone, or only the enemy's foes there */
function zoneOf(t) {
  if (/(?:усі|всі|всім|усім)\s+(?:інш\S+\s+)?істот\S*\s+(?:у|в)\s+(?:його|її|своїй|тій\s+самій)\s+зоні/i.test(t)) return "all";
  if (/(?:ворогам|ворогів)\s+(?:у|в)\s+(?:своїй|його|її)\s+зоні|(?:ворогів|ворогам)\s+у\s+зоні\s+\S+/i.test(t)) return "foes";
  return "";
}

/** The weapon a «Лють» swings: the word before «всім ворогам», e.g. «мацяльцями» → «мацал», «пазурями» → «пазур» */
function rageWeapon(t) {
  const m = /шкоди\s+(\S+?)(?:ями|ами|ем|ом)?\s+(?:\(|всім|усім)/i.exec(t);
  return m ? m[1].toLowerCase().replace(/[яа]$/, "").replace(/ь$/, "").replace(/ял/, "ал") : "";
}

/**
 * The move's automation.
 * @param {{n?:string, t?:string}} move
 * @param {object} [sys] the enemy's `system` (for the Психо move)
 * @param {number} [i] the move's index in `sys.moves` (for the Психо move)
 * @returns {{level:string, button:boolean, uses:number, per:string|null, again:boolean, effects:object[], hint:string}}
 */
export function moveSpec(move, sys = null, i = -1) {
  const n = normMoveName(move?.n), t = String(move?.t ?? "");
  const lim = moveLimit(t);
  const out = (level, effects = [], extra = {}) => {
    const spec = { level, button: BUTTON_LEVELS.has(level), uses: lim.uses, per: lim.per, again: false, effects, ...extra };
    spec.hint = moveHint(spec);
    return spec;
  };
  const named = BY_NAME[n];
  if (named === "none") return out("none");
  if (named === "card") return out("card", [{ kind: n === "псионічний талант" ? "psiPerk" : "card" }]);
  if (named === "auto") return out("auto");

  // Психо: +2 damage of the attacks to the end of the scene
  if ((sys && i >= 0 && psyMoveIdx(sys) === i) || /^(?:ін'єкція\s+)?психо$/.test(n)) return out("effect", [{ kind: "psycho" }], { uses: lim.uses || 1, per: lim.per || "scene" });

  // at 0 HP or on a kill: stage 2
  if (/коли\s+ОЗ\s+\S+(?:\s+\S+)?\s+(?:падають|знижуються)\s+до\s+0\b/i.test(t) || /знижує\s+ОЗ\s+цілі\s+до\s+0/i.test(t)) return out("trigger");

  // «якщо отримана шкода мала б знизити ОЗ … до 0, … лишається живим з N ОЗ»
  const sv = /мала\s+б\s+знизити\s+ОЗ.*?до\s+0.*?лиша\S*\s+жив\S*\s+(?:з|із)\s+(\d+)\s+ОЗ/i.exec(t);
  if (sv) return out("auto", [{ kind: "survive", hp: +sv[1] }]);

  // «коли ОЗ … знижуються до (половини (25 або менше) | 20 або менше), … шкода … зростає на 2» (броня too)
  const th = /коли\s+ОЗ\s+.*?знижуються\s+до\s+(?:половини\s+\()?(\d+)\s+або\s+менше/i.exec(t);
  const up = /зроста\S*\s+на\s+(\d+)/i.exec(t);
  if (th && up) return out("auto", [{ kind: "bonus", hpAtMost: +th[1], dmg: +up[1], armor: /броня/i.test(t) ? +up[1] : 0 }]);

  const effects = [];
  // healing (moveHeal: whose — self, self or an ally, the group / the group without the user)
  const h = moveHeal(t);
  if (h) {
    const who = /собі\s+(?:або|чи)\s+союзник/i.test(t) ? "targetOrSelf" : h.group ? (h.others ? "factionOthers" : "faction") : "self";
    effects.push({ kind: "heal", expr: h.expr, who });
  }
  if (/страчу\S*/i.test(t)) effects.unshift({ kind: "execute" });
  // «повертає в сцену з 10 ОЗ живого союзника…» (Дефібрилятор) and «…союзника, чиї ОЗ упали до 0, з 5 ОЗ»
  const rv = /повер[нт]\S*\s+в\s+сцену\s+(?:з|із)\s+(\d+)\s+ОЗ/i.exec(t) ?? /повер[нт]\S*\s+в\s+сцену.*?упали\s+до\s+0,\s+(?:з|із)\s+(\d+)\s+ОЗ/i.exec(t)
    ?? /повер[нт]\S*\s+в\s+сцену.*?(?:з|із)\s+(\d+)\s+ОЗ/i.exec(t);
  if (rv) effects.push({ kind: "revive", hp: +rv[1] });
  if (/ігнорує\s+шкоду,\s+яку\s+(?:йому|їй)\s+щойно\s+завдали/i.test(t)) effects.push({ kind: "undo" });
  // its own damage grows: «щоразу, коли гине … її шкода до кінця сцени зростає на 2» (stacks a use)
  const own = /(?:його|її)\s+шкода\s+(?:до\s+кінця\s+сцени\s+)?зроста\S*\s+на\s+(\d+)/i.exec(t);
  if (own) effects.push({ kind: "bonus", dmg: +own[1], armor: 0, stack: true });
  // a bonus to the allies («до кінця сцени завдають +2 шкоди»): stage 3, a line on the card till then (author, 2026-11-19)
  const ally = /завдають\s+\+(\d+)\s+шкоди/i.exec(t);
  if (ally) effects.push({ kind: "allyBonus", dmg: +ally[1] });
  const am = /витрачає\s+(\d+)\s+заряд\S*\s+(\S+\s+)?(\S+)/i.exec(t);
  if (am) effects.push({ kind: "ammo", n: +am[1], weapon: am[3].toLowerCase().slice(0, 6) });

  // damage: «Лють» swings an attack; otherwise the first damage die of the text, at the zone or at the targets
  const zone = zoneOf(t);
  if (n === "лють") effects.push({ kind: "attack", weapon: rageWeapon(t), zone: zone || "foes", hit: hitsOf(t)[0] ?? null });
  // the aimed shot's menu («вибери на додачу до шкоди один ефект»): stage 2, the card only for now
  else if (!h && !rv && !/вибери\s+.*?ефект/i.test(t)) {
    const hit = hitsOf(t)[0];
    // a move with a lasting or a state effect only (stage 2) has no damage now: «Отруєння», «Клешні-лещата»…
    const lasting = /протягом\s+\d+\s+кіл|щоразу,\s+коли\s+настає\s+її\s+черга/i.test(t);
    if (hit && !lasting) {
      // «Полум’яний ривок» burns (author, 2026-11-19: the 2d6 is fire)
      if (/підпал/i.test(t) && hit.type === "phys") hit.type = "fire";
      // «Інші вогнедишні гекони від цього шкоди не отримують»: its own kind is spared
      const spareKin = zone === "all" && /інш\S*\s+(?:\S+\s+){0,2}\S+\s+від\s+цього\s+шкоди\s+не/i.test(t);
      effects.push({ kind: "hit", ...hit, zone, ...(spareKin ? { spareKin } : {}) });
    }
  }

  // with no limit a move is a button only when it is an action of its own: «Здимів звідси», «Кусь», «Ривок», the aimed
  // shot's menu, «Космічна програма», «Тільки не по дітях»; otherwise words (movement, a jump)
  if (!lim.uses && !effects.length && !/вдвічі\s+менш|вибери\s+.*?ефект|збити\s+(?:її\s+|ціль\s+)?з\s+ніг/i.test(t)) return out("none");
  // «раз за сцену, а також щоразу після загибелі дитинчати»: the mark doesn't stop it
  return out("effect", effects, { again: !!lim.uses && /а\s+також\s+щоразу/i.test(t) });
}

/** The die / number with its damage type for a hint: «2d6 вогнем», «1d10 психічної шкоди» */
const TYPE_WORD = { fire: "вогнем", rad: "радіацією", poison: "отрутою", psychic: "психічної шкоди", laser: "енергетичної шкоди", electric: "електрикою" };
const hitWords = (h) => `${h.dice}${TYPE_WORD[h.type] ? ` ${TYPE_WORD[h.type]}` : ""}${h.ignoreArmor ? ", без броні" : h.ignoreN ? `, ігнорує ${h.ignoreN} броні` : ""}`;

/** What «Використати» will do, in a line under the move (the card) and in the chip's tooltip («Огляд битви») */
export function moveHint(spec) {
  if (spec.level === "auto") {
    const e = spec.effects[0];
    if (e?.kind === "survive") return `Сам: замість 0 ОЗ лишається з ${e.hp} ОЗ (раз за сцену)`;
    if (e?.kind === "bonus") return `Сам: коли ОЗ ${e.hpAtMost} або менше, +${e.dmg} шкоди${e.armor ? ` і +${e.armor} броні` : ""} до кінця сцени`;
    return "Діє сам";
  }
  if (!spec.button) return "";
  const parts = spec.effects.map((e) => {
    switch (e.kind) {
      case "psycho": return "+2 шкоди атаками до кінця сцени";
      case "heal": return { self: `собі ${e.expr} ОЗ`, targetOrSelf: `цілі (T) або собі ${e.expr} ОЗ`, faction: `+${e.expr} ОЗ своїм на сцені`, factionOthers: `+${e.expr} ОЗ іншим своїм на сцені` }[e.who];
      case "execute": return "ціль (T) зі своїх вибуває";
      case "revive": return `союзник (T) з 0 ОЗ повертається з ${e.hp} ОЗ`;
      case "undo": return "скасовує щойно завдану шкоду";
      case "bonus": return `+${e.dmg} шкоди до кінця сцени${e.stack ? " (складається)" : ""}`;
      case "ammo": return `−${e.n} заряд`;
      case "allyBonus": return `+${e.dmg} шкоди своїм — рядком у картці`;
      case "attack": return "атака по ворогах у зоні або цілях (T)";
      case "hit": return `${hitWords(e)} ${e.zone === "all" ? (e.spareKin ? "усім іншим у зоні, крім своїх" : "усім іншим у зоні") : e.zone === "foes" ? "ворогам у зоні" : "цілям (T)"}${e.zone ? " або цілям (T)" : ""}`;
      case "psiPerk": return "псионічний перк: 1d6 і його опис у чат";
      default: return "";
    }
  }).filter(Boolean);
  return parts.length ? `${parts.join("; ")}; картка в чат` : "Картка в чат";
}

/** The limit chip: «раз за сцену», «2 за сцену», «раз за сесію», «без ліміту» */
export function limitLabel(spec) {
  if (!spec.uses) return "без ліміту";
  return `${spec.uses === 1 ? "раз" : spec.uses} за ${spec.per === "session" ? "сесію" : "сцену"}`;
}

/* ---------------- marks: `used` and `spent` (Fable's verdict, 2026-11-19) ---------------- */

/**
 * How far a move is used: `spent` is the count of uses, `used` the old tick (an actor saved before `spent` still has it).
 * A move without a limit is never used; «а також щоразу» (`again`) is marked but never blocked.
 * @returns {{spent:number, used:boolean, left:number, blocked:boolean}}
 */
export function moveMarks(move, spec = moveSpec(move)) {
  const N = spec.uses;
  const spent = Math.max(Math.max(0, Math.round(Number(move?.spent)) || 0), move?.used && N ? N : 0);
  const used = N > 0 && spent >= N;
  return { spent, used, left: Math.max(0, N - spent), blocked: used && !spec.again };
}

/** The move after one use: `spent` + 1 and `used` once the limit is reached */
export function spendMove(move, spec = moveSpec(move)) {
  const { spent } = moveMarks(move, spec);
  const next = spent + 1;
  return { ...move, spent: next, used: spec.uses > 0 && next >= spec.uses };
}

/** «↺ Зняти позначку» (author, 2026-11-19): every use comes back, «2 за сцену» → 0 of 2 */
export const freeMove = (move) => ({ ...move, spent: 0, used: false });

/** «Кінець сцени»: every move of the list free; null when nothing was spent */
export function resetMoveList(moves) {
  if (!Array.isArray(moves) || !moves.some((m) => m?.used || Number(m?.spent) > 0)) return null;
  return moves.map(freeMove);
}

/* ---------------- factions (author, 2026-11-19: the wiki's groups, by the book's names) ---------------- */

/** A name for the tables: lower case, one kind of dash and apostrophe, no number at the end («Легіонер 2» → «легіонер») */
export const normEnemyName = (n) => normMoveName(n).replace(/\s*(?:#|№)?\s*\d+$/, "").trim();

/** The groups a «своїм» move heals: the book's names of each (the compendium's folders «Армія НКР», «Легіон Цезаря» and the
 * super mutants of «Гулі та супермутанти»). The generator's Legion dog, Літун and Кентавр are not in them. */
export const FACTIONS = {
  ncr: ["Елітний рейнджер НКР", "Лейтенант армії НКР", "Рейнджер НКР", "Штурмовик армії НКР", "Рядовий армії НКР"],
  legion: ["Легат", "Преторіанець", "Фрументарій", "Центуріон", "Легіонер", "Бойовий раб Легіону"],
  supermutants: ["Супермутант-майстер", "Найткін-рейдер", "Супермутант-рейдер"],
};
const FACTION_OF = new Map(Object.entries(FACTIONS).flatMap(([f, l]) => l.map((n) => [normEnemyName(n), f])));

/** The faction of a book name; "" when none */
export const factionOf = (bookName) => FACTION_OF.get(normEnemyName(bookName)) ?? "";

/** The enemy's book name: the compendium's entry, then the `baseName` flag, the base actor's name, the name without its number */
export function bookName({ source = "", flag = "", base = "", name = "" } = {}) {
  for (const n of [source, flag, base]) if (String(n ?? "").trim()) return String(n).trim();
  return String(name ?? "").replace(/\s*(?:#|№)?\s*\d+$/, "").trim();
}

/**
 * Whom a group heal takes (author, 2026-11-19): the targets (T) when the GM chose some, otherwise the faction on the scene
 * (not at 0 HP), otherwise only the user. `others`: without the user («Бийтеся, ідіоти», «Децимація»).
 * @param {{targets:string[], faction:string[], self:string, others:boolean}} o ids
 * @returns {{ids:string[], why:"targets"|"faction"|"self"}}
 */
export function healWho({ targets = [], faction = [], self = "", others = false }) {
  if (targets.length) return { ids: targets, why: "targets" };
  const fac = faction.filter((id) => !others || id !== self);
  if (fac.length) return { ids: others ? fac : [...new Set([self, ...fac])], why: "faction" };
  return { ids: others ? [] : [self], why: "self" };
}

/* ---------------- the damage path: survive, the HP bonus, undo ---------------- */

/** The index and spec of the first move of a kind among the auto ones («survive», «bonus») */
function autoMove(moves, kind) {
  for (let i = 0; i < (moves ?? []).length; i++) {
    const spec = moveSpec(moves[i]);
    const e = spec.effects.find((x) => x.kind === kind && (kind !== "bonus" || x.hpAtMost));
    if (spec.level === "auto" && e) return { i, spec, e };
  }
  return null;
}

/**
 * After a hit on an enemy (apply-damage.mjs): «лишається живим з N ОЗ» once a scene; the HP bonus past its threshold is
 * marked (it lasts to the end of the scene, healed or not); `lastHit` for undo, cleared by a hit of 0.
 * @param {{hp:{value:number,max:number}, moves:object[]}} sys
 * @param {number} hp0 HP before @param {number} hp HP after the rules @param {string} head the hit's name
 * @returns {{hp:number, moves:object[]|null, lastHit:object|null, note:string}} moves null when unchanged
 */
export function afterHit(sys, hp0, hp, head = "") {
  let moves = null, note = "";
  const list = () => (moves ??= (sys.moves ?? []).map((m) => ({ ...m })));
  const sv = autoMove(sys.moves, "survive");
  if (sv && hp <= 0 && hp0 > 0 && !moveMarks(sys.moves[sv.i], sv.spec).used) {
    hp = Math.min(Math.max(1, sys.hp?.max ?? sv.e.hp), sv.e.hp);
    list()[sv.i] = spendMove(sys.moves[sv.i], sv.spec);
    note = `«${sys.moves[sv.i].n}»: лишається з ${hp} ОЗ`;
  }
  const bn = autoMove(sys.moves, "bonus");
  if (bn && hp > 0 && hp <= bn.e.hpAtMost && !moveMarks(sys.moves[bn.i], bn.spec).used) {
    list()[bn.i] = spendMove(sys.moves[bn.i], { ...bn.spec, uses: bn.spec.uses || 1 });
    note = [note, `«${sys.moves[bn.i].n}»: +${bn.e.dmg} шкоди${bn.e.armor ? ` і +${bn.e.armor} броні` : ""} до кінця сцени`].filter(Boolean).join("; ");
  }
  const lastHit = hp0 !== hp ? { before: hp0, after: hp, head: String(head ?? "") } : null;
  return { hp, moves, lastHit, note };
}

/** Undo can work: the last hit is there and the HP are still what it left */
export const canUndo = (lastHit, hpNow) => !!lastHit && Number(lastHit.after) === Number(hpNow) && Number(lastHit.before) > Number(lastHit.after);

/**
 * The bonuses of the moves to the enemy's attacks and armour (author, 2026-11-19): «Фінальна форма» / «Берсерк-протокол»
 * once their HP threshold was passed (marked by afterHit, or the HP are at it now), «Тільки не по дітях» +N a use. Every
 * attack, unarmed too.
 * @returns {{dmg:number, armor:number, from:string[]}}
 */
export function moveBonus(sys) {
  let dmg = 0, armor = 0;
  const from = [];
  (sys?.moves ?? []).forEach((m) => {
    const spec = moveSpec(m);
    for (const e of spec.effects) {
      if (e.kind !== "bonus") continue;
      const { spent } = moveMarks(m, spec);
      const k = e.stack ? spent : e.hpAtMost ? (spent > 0 || (sys.hp?.value > 0 && sys.hp.value <= e.hpAtMost) ? 1 : 0) : 0;
      if (!k) continue;
      dmg += e.dmg * k; armor += (e.armor || 0) * k;
      from.push(m.n);
    }
  });
  return { dmg, armor, from };
}

/** «Псионічний талант»: the perk the 1d6 picks from the move's list «1 — «Цілющий дотик», 2 — …»; "" when not listed */
export function psiPerkOf(text, n) {
  const m = new RegExp(`(?:^|\\D)${Number(n)}\\s*[—–-]\\s*«([^»]+)»`).exec(String(text ?? ""));
  return m ? m[1].trim() : "";
}
