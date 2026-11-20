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
 *   trigger — «Тригер-підказка»: acts at 0 HP / on a kill (author, 2026-11-20): the damage card says so, and its «Використати»
 *             works only then (`when`: "down" — the enemy at 0 HP, "kill" — its attack has just brought a target to 0)
 *   none    — «Не автоматизуємо»: words only; no button
 */
import { diceInText, moveHeal, psyMoveIdx } from "./battle.mjs";
import { STATES } from "./states.mjs";

/** The button's levels */
export const BUTTON_LEVELS = new Set(["effect", "card"]);

/** A move's name for the tables: lower case, one kind of apostrophe and dash, no «*», no spaces at the ends */
export const normMoveName = (n) => String(n ?? "").toLowerCase().replace(/[’ʼ`]/g, "'").replace(/[‑–—]/g, "-").replace(/\*/g, "").replace(/\s+/g, " ").trim();

/** Moves patterns can't tell, by normalised name */
const BY_NAME = {
  // never automated (the author's table): movement, damage taken for another, hiding
  "політ": "none", "невпинність": "none", "амбразури": "none", "стрибок": "none", "мамо, тату!": "none", "непомітність": "none",
  // the button posts the card only
  "бойові рефлекси": "card", "бтр-магеддон": "card", "псионічний талант": "card",
  // acts by itself: +2 against mutants (stage 3: the effect `favFoe`, dealt by applyDamage)
  "улюблений ворог": "auto",
};

/**
 * Summons (stage 3, author 2026-11-20): who a move calls onto the scene, by the compendium's book name. `sceneOnce`: once a
 * scene for every enemy of the summoner's kind («Якщо в сцені один сек'юритрон уже покликав допомогу, інші цього зробити не
 * можуть») — the use marks the move spent on all of them and on the one that came.
 */
export const SUMMONS = {
  "підкріплення": { book: "Гігантська мураха-солдат", n: 2 },
  "сигналізація": { book: "Секʼюритрон", n: 1, sceneOnce: true },
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
  if (SUMMONS[n]) return out("effect", [{ kind: "summon", ...SUMMONS[n] }]);
  if (named === "auto") {
    // «Улюблений ворог»: «завдає на 2 шкоди більше мутантам…» (stage 3, author 2026-11-20: applyDamage adds it to a mutant)
    const fav = /на\s+(\d+)\s+шкоди\s+більше\s+мутантам/i.exec(t);
    return out("auto", fav ? [{ kind: "favFoe", dmg: +fav[1] }] : []);
  }

  // Психо: +2 damage of the attacks to the end of the scene
  if ((sys && i >= 0 && psyMoveIdx(sys) === i) || /^(?:ін'єкція\s+)?психо$/.test(n)) return out("effect", [{ kind: "psycho" }], { uses: lim.uses || 1, per: lim.per || "scene" });

  // at 0 HP or on a kill (author, 2026-11-20: a hint and a button): every damage die of the text, at the zone or the targets
  const onKill = /знижує\s+ОЗ\s+цілі\s+до\s+0/i.test(t);
  if (/коли\s+ОЗ\s+\S+(?:\s+\S+)?\s+(?:падають|знижуються)\s+до\s+0\b/i.test(t) || onKill) {
    // «Розпад»: the foes in the zone of the target brought down; a blast: its own zone, or the zone chosen (the targets)
    const zone = onKill ? "killFoes" : /в\s+одній\s+вибраній\s+зоні/i.test(t) ? "" : zoneOf(t) || "all";
    // «Розпад» is energy damage, the parser's `laser` (author, 2026-11-19); «1d10 шкоди вогнем + 2d6 шкоди радіацією, що
    // ігнорує броню»: the clause is the last part's, the fire meets the armour
    const hits = hitsOf(t).map((h, k, all) => ({
      kind: "hit", ...h, ...(/енергетичн/i.test(t) && h.type === "phys" ? { type: "laser" } : {}),
      ...(k < all.length - 1 ? { ignoreArmor: false } : {}), zone,
    }));
    return out("trigger", hits, { button: hits.length > 0, when: onKill ? "kill" : "down", ...(onKill ? {} : { uses: 1, per: "scene" }) });
  }

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
    // «Децимація»: «усі інші легіонери» — only the book's «Легіонер», not the Легат or a Преторіанець (author, 2026-11-20)
    const only = /інші\s+легіонер/i.test(t) ? ["Легіонер"] : null;
    effects.push({ kind: "heal", expr: h.expr, who, ...(only ? { only } : {}) });
  }
  // the one executed is «одного легіонера» too (author, 2026-11-20)
  // «… у своїй зоні»: only one standing in the user's zone (author, 2026-11-20; moveBlock)
  if (/страчу\S*/i.test(t)) effects.unshift({ kind: "execute", ...(/страчу\S*\s+(?:\S+\s+)?легіонер/i.test(t) ? { only: ["Легіонер"] } : {}), ...(/страчу.*?у\s+своїй\s+зоні/i.test(t) ? { sameZone: true } : {}) });
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

  // the states the move puts on the ones it hits, or on the targets (author, 2026-11-20; rules/states.mjs)
  if (!/вибери\s+.*?ефект|вдвічі\s+менш/i.test(t)) for (const st of statesOf(t)) effects.push({ kind: "state", ...st });

  // with no limit a move is a button only when it is an action of its own: «Здимів звідси», «Кусь», «Ривок», the aimed
  // shot's menu, «Космічна програма», «Тільки не по дітях»; otherwise words (movement, a jump)
  if (!lim.uses && !effects.length && !/вдвічі\s+менш|вибери\s+.*?ефект|збити\s+(?:її\s+|ціль\s+)?з\s+ніг/i.test(t)) return out("none");
  // «раз за сцену, а також щоразу після загибелі дитинчати»: the mark doesn't stop it
  return out("effect", effects, { again: !!lim.uses && /а\s+також\s+щоразу/i.test(t) });
}

/**
 * The states of a move's text (rules/states.mjs keys) with their dice and rounds: [{key, dice?, left?, type?, ignoreArmor?}]
 */
export function statesOf(text) {
  const t = String(text ?? ""), out = [];
  if (/зби(?:ва\S*|ти)\s+(?:\S+\s+)?з\s+ніг|пада\S*\s+з\s+ніг/i.test(t)) out.push({ key: "down" });
  if (/пропуска\S*\s+свою\s+наступну\s+дію/i.test(t)) out.push({ key: "stunned" });
  const grab = /аспект\s+захоплен/i.test(t) && /отриму\S*\s+(\d*d\d+)\s+шкоди\s+від\s+стискання/i.exec(t);
  if (grab) out.push({ key: "grabbed", dice: grab[1] });
  const poison = /протягом\s+(\d+)\s+кіл.*?отриму\S*\s+(\d*d\d+)\s+шкоди\s+від\s+отрути/i.exec(t);
  if (poison) out.push({ key: "poisoned", dice: poison[2], left: +poison[1], type: "poison", ignoreArmor: true });
  if (/аспект\s+палає/i.test(t)) {
    const d = /отриму\S*\s+(\d*d\d+)\s+шкоди\s+вогнем/i.exec(t), n = /триває\s+(\d+)\s+кол/i.exec(t);
    out.push({ key: "burning", dice: d ? d[1] : "1d6", left: n ? +n[1] : 1, type: "fire" });
  } else if (/підпал(?:ює|ити)/i.test(t)) out.push({ key: "burning", dice: "1d6", left: 1, type: "fire" }); // the general «Підпал»
  const bleed = /пуска\S*\s+\S+\s+кров/i.test(t) && /кровотеча\s+завдає\s+(\d*d\d+)\s+шкоди/i.exec(t);
  if (bleed) out.push({ key: "bleeding", dice: bleed[1], left: 1, ignoreArmor: true });
  if (/[−-]\s*2\s+до\s+фізичної\s+броні/i.test(t)) out.push({ key: "acid" });
  if (/засліплю/i.test(t)) out.push({ key: "blinded" });
  if (/бере\s+на\s+приціл/i.test(t)) out.push({ key: "aimed" });
  // «Приголомшливий рев»: «усі живі вороги, які його чують, отримують −2 до своєї наступної перевірки» — the characters on the
  // scene when no targets are chosen (author, 2026-11-19: «which hear» = on the scene)
  if (/[−-]\s*2\s+до\s+(?:своєї\s+)?наступної\s+перевірки/i.test(t)) out.push({ key: "roar", heard: true });
  return out;
}

/**
 * The states an attack's note puts on the ones it wounds (author, 2026-11-20; the wiki's weapon properties): «підпалює ціль /
 * цілі» — «Підпал», «палає» 1d6 fire once; «спричиняє кровотечу» — «Кровотеча» 1d6 ignoring armour once. Only a target the
 * attack dealt at least 1 damage after armour gets it (apply-damage.mjs).
 */
export function attackStates(note) {
  const t = String(note ?? ""), out = [];
  if (/підпалю\S*/i.test(t)) out.push({ key: "burning", dice: "1d6", left: 1, type: "fire" });
  if (/кровотеч/i.test(t)) out.push({ key: "bleeding", dice: "1d6", left: 1, ignoreArmor: true });
  return out;
}

/**
 * The effect menu under «Завдати цілям» of an attack (author, 2026-11-20, mockup А): the options of «Прицільний постріл» /
 * «Точний удар» («вибери на додачу до шкоди один ефект») and of «Кусь» / «Здимів звідси» (half the damage to knock the target
 * down). null when the enemy has none for this attack. Options: {k, label, dice?, once?}.
 * @param {object} sys the enemy's system @param {{note?:string}} attack
 */
export function attackMenu(sys, attack) {
  const note = String(attack?.note ?? "");
  const ranged = /відстан/i.test(note), melee = /ближн/i.test(note);
  const opts = [];
  (sys?.moves ?? []).forEach((m, mi) => {
    const t = String(m?.t ?? "");
    const push = (o) => opts.push({ ...o, mi }); // mi: the move's index, for its chat card
    if (/вибери\s+.*?ефект/i.test(t)) {
      // «коли … стріляє» is for shots only (a melee-only attack gets no menu); «б'є чи стріляє» for every attack
      if (/стріляє/i.test(t) && !/\S+\s+чи\s+стріляє/i.test(t) && melee && !ranged) return;
      const plus = /завдає\s+додатково\s+(\d*d\d+)\s+шкоди/i.exec(t);
      if (plus) push({ k: "plus", label: `+${plus[1]} шкоди`, dice: plus[1] });
      if (/вибиває\s+зброю/i.test(t)) push({ k: "disarmed", label: "Вибити зброю" });
      if (/приголомшує/i.test(t)) push({ k: "stunned", label: "Приголомшити", once: /лише\s+раз\s+за\s+сцену/i.test(t) });
      if (/збиває\s+ціль\s+з\s+ніг/i.test(t)) push({ k: "down", label: "Збити з ніг" });
      if (/ігнорує\s+броню/i.test(t)) push({ k: "ignore", label: "Шкода ігнорує броню" });
    } else if (/вдвічі\s+менш/i.test(t) && /з\s+ніг/i.test(t)) {
      if (/ближньому\s+бою/i.test(t) && ranged && !melee) return;
      push({ k: "halfDown", label: /відкинути/i.test(t) ? "½ шкоди, відкинути й збити з ніг" : "½ шкоди, збити з ніг" });
    }
  });
  if (!opts.length) return null;
  return [{ k: "none", label: "Без ефекту" }, ...opts.filter((o, i) => opts.findIndex((x) => x.k === o.k) === i)];
}

/** The die / number with its damage type for a hint: «2d6 шкоди вогнем», «1d10 психічної шкоди» */
const TYPE_WORD = { fire: "шкоди вогнем", rad: "шкоди радіацією", poison: "шкоди отрутою", psychic: "психічної шкоди", laser: "енергетичної шкоди", electric: "шкоди електрикою" };
const hitWords = (h) => `${h.dice} ${TYPE_WORD[h.type] ?? "шкоди"}${h.ignoreArmor ? " (броня не рятує)" : h.ignoreN ? ` (ігнорує ${h.ignoreN} броні)` : ""}`;
const HIT_WHO = { all: "всім у своїй зоні", foes: "всім персонажам у своїй зоні", killFoes: "всім персонажам у зоні щойно зваленої цілі" };
/** The aspects of a move's states, «Збитий з ніг» and «Кровотеча» */
const stateNames = (effects) => effects.filter((e) => e.kind === "state").map((e) => `«${STATES[e.key]?.aspect ?? e.key}»`);

/**
 * What the move does, in plain words (author, 2026-11-20): the tooltip of «Використати» and of a quiet move's name (the card)
 * and of the chip («Огляд битви»). Whole sentences, ending with a full stop.
 */
export function moveHint(spec) {
  if (spec.level === "auto") {
    const e = spec.effects[0];
    if (e?.kind === "survive") return `Спрацьовує сам: удар, що мав би звалити ворога, лишає йому ${e.hp} ОЗ. Раз за сцену.`;
    if (e?.kind === "bonus") return `Спрацьовує сам: щойно ОЗ впадуть до ${e.hpAtMost}, ворог до кінця сцени б'є на ${e.dmg} сильніше${e.armor ? ` і має +${e.armor} броні` : ""}.`;
    if (e?.kind === "favFoe") return `Спрацьовує сам: кожна атака ворога завдає на ${e.dmg} шкоди більше мутантам, супермутантам і гулям.`;
    return "Діє сам, натискати нічого не треба.";
  }
  if (!spec.button) return "";
  const exec = spec.effects.some((e) => e.kind === "execute"); // with an execution the target is the one executed
  const orT = (w) => (exec ? "" : ` (або лише ${w})`);
  const parts = spec.effects.map((e) => {
    switch (e.kind) {
      case "psycho": return "Ворог до кінця сцени б'є на 2 сильніше";
      case "heal": return {
        self: `Ворог відновлює собі ${e.expr} ОЗ`,
        targetOrSelf: `Позначена ціль відновлює ${e.expr} ОЗ; без цілі — сам ворог`,
        faction: `Свої на сцені відновлюють по ${e.expr} ОЗ${orT("позначені цілі")}`,
        factionOthers: e.only ? `Інші ${e.only.map((n) => n.toLowerCase() + "и").join(", ")} на сцені відновлюють по ${e.expr} ОЗ` : `Інші свої на сцені відновлюють по ${e.expr} ОЗ${orT("позначені цілі")}`,
      }[e.who];
      case "execute": return e.only ? `Страчує позначеного ${e.only.map((n) => n.toLowerCase() + "а").join(" чи ")}: той вибуває з бою` : "Страчує позначеного свого: той вибуває з бою";
      case "revive": return `Позначений союзник із 0 ОЗ повертається в бій з ${e.hp} ОЗ`;
      case "undo": return "Шкода, яку ворогові щойно завдали, скасовується";
      case "bonus": return `Ворог до кінця сцени б'є на ${e.dmg} сильніше${e.stack ? ` (кожне використання додає ще ${e.dmg})` : ""}`;
      case "ammo": return `Зброя витрачає ${e.n} ${e.n === 1 ? "заряд" : "заряди"}`;
      case "allyBonus": return `${spec.effects.some((x) => x.kind === "heal" && x.only) ? "Вони" : "Свої"} до кінця сцени б'ють на ${e.dmg} сильніше`;
      case "attack": return "Ворог атакує всіх персонажів у своїй зоні (або лише позначені цілі)";
      case "hit": return `Завдає ${hitWords(e)} ${e.zone ? `${e.spareKin ? `${HIT_WHO.all}, крім таких самих, як він` : HIT_WHO[e.zone]} (або лише позначеним цілям)` : "позначеним цілям"}`;
      case "psiPerk": return "Кидає 1d6 і показує, який псионічний перк випав";
      case "summon": return `Кличе на сцену ${e.n > 1 ? `${e.n} × ` : ""}«${e.book}» у свою зону${e.sceneOnce ? "; після цього ніхто з таких самих у сцені кликати вже не може" : ""}`;
      case "state": {
        // one sentence for all the move's states, at the first of them
        if (spec.effects.find((x) => x.kind === "state") !== e) return "";
        const hit = spec.effects.some((x) => x.kind === "hit" || x.kind === "attack");
        const names = stateNames(spec.effects);
        const who = hit ? "Тим, кого вразить, накладає" : e.heard ? "Живим персонажам на сцені (або лише позначеним цілям) накладає" : "Позначеним цілям накладає";
        return `${who} ${names.length > 1 ? "аспекти" : "аспект"} ${names.join(" і ")}${e.key === "roar" ? ": −2 до кидка, після нього аспект зникне" : ""}`;
      }
      default: return "";
    }
  }).filter(Boolean);
  const when = spec.level !== "trigger" ? "" : spec.when === "kill" ? "Працює, щойно атака ворога звалила ціль. " : "Працює, коли ворога звалено (0 ОЗ). ";
  return parts.length ? `${when}${parts.join(". ")}. Хід з'явиться в чаті.` : "Покаже хід у чаті, решту вирішуєш ти.";
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
  // «others» with nobody else of the side on the scene (author, 2026-11-20): nobody, and the card says so
  return others ? { ids: [], why: "none" } : { ids: [self], why: "self" };
}

/**
 * What keeps a move's effect from acting, checked before the move is spent (author, 2026-11-20): a zone hit with no targets
 * while its token stands in no zone (`zone` / `killZone`: the zone ids of the user and of the target its attack brought
 * down), a summons not found in the compendium (`found`), an execution «у своїй зоні» of one standing elsewhere
 * (`targetZone`). A user in no zone doesn't stop the execution: whose zone counts then is the author's question.
 * @returns {null|{why:"noZone"|"noSummon"|"otherZone", kill?:boolean, book?:string}}
 */
export function moveBlock(spec, { targets = 0, zone = null, killZone = null, targetZone = null, found = true } = {}) {
  for (const e of spec?.effects ?? []) {
    if ((e.kind === "hit" || e.kind === "attack") && e.zone && !targets && !(e.zone === "killFoes" ? killZone : zone)) return { why: "noZone", kill: e.zone === "killFoes" };
    if (e.kind === "summon" && !found) return { why: "noSummon", book: e.book };
    if (e.kind === "execute" && e.sameZone && zone && targetZone !== zone) return { why: "otherZone" };
  }
  return null;
}

/** The public cards and the hidden tokens (author, 2026-11-20): the items split by `isHidden` into {open, hidden}, order kept */
export function splitHidden(items, isHidden) {
  const open = [], hidden = [];
  for (const x of items ?? []) (isHidden(x) ? hidden : open).push(x);
  return { open, hidden };
}

/* ---------------- the damage path: survive, the HP bonus, undo ---------------- */

/** «Улюблений ворог» (stage 3, author 2026-11-20): the extra damage an enemy deals a mutant target; 0 without the move */
export function favFoeBonus(sys) {
  let n = 0;
  for (const m of sys?.moves ?? []) for (const e of moveSpec(m).effects) if (e.kind === "favFoe") n += e.dmg;
  return n;
}

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
export function moveBonus(sys, buffs = null) {
  let dmg = 0, armor = 0;
  const from = [];
  // the allies' bonus put on it by another's move («Ave!», «Децимація»; author, 2026-11-20): the actor's flag `buffs`
  for (const b of buffList(buffs)) { dmg += b.dmg; from.push(b.from); }
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

/**
 * The allies' bonus (stage 3, author 2026-11-20): `flags.<system>.buffs = {<move key>: {dmg, from}}` on every one a move
 * like «Ave! True to Caesar!» takes; the same move again replaces its record, different moves add up («Ave!» +2 and
 * «Децимація» +1 give +3). Cleared by «Кінець сцени» (applications/states.mjs clearAllStates).
 */
export function buffList(buffs) {
  if (!buffs || typeof buffs !== "object") return [];
  return Object.values(buffs).filter((b) => b && Number(b.dmg) > 0).map((b) => ({ dmg: Math.round(Number(b.dmg)), from: String(b.from ?? "") }));
}

/** The record a move puts into `buffs`: its key is the move's normalised name */
export function putBuff(buffs, moveName, dmg) {
  return { ...(buffs && typeof buffs === "object" ? buffs : {}), [normMoveName(moveName)]: { dmg: Math.round(Number(dmg) || 0), from: String(moveName ?? "") } };
}

/** «Псионічний талант»: the perk the 1d6 picks from the move's list «1 — «Цілющий дотик», 2 — …»; "" when not listed */
export function psiPerkOf(text, n) {
  const m = new RegExp(`(?:^|\\D)${Number(n)}\\s*[—–-]\\s*«([^»]+)»`).exec(String(text ?? ""));
  return m ? m[1].trim() : "";
}
