// «Трекер битви»: the pure rules of the HTML tracker (pustelnyky_src/tracker.js, attacks.js, scene.js) as a
// Foundry-free ES module — damage maths, defence traits, attack / move parsing, zone geometry and random zone names.
// No Foundry or DOM globals; every random source can be injected so tests are deterministic.
import { PUST_ZONE_NAMES, PUST_ZONE_ASPECTS } from "./zone-data.mjs";

/* ------------------------------------------------------------------ *
 *  Tables
 * ------------------------------------------------------------------ */

/**
 * Damage types. `ignore` = armour ignored by the type; `energy` = counts as energy weapon;
 * `electric` = +1d6 to targets vulnerable to electricity; `special` = rad / poison / psy rules.
 */
export const DMG_TYPES = {
  phys:     { n: "Фізична" },
  laser:    { n: "Лазерна (ігнорує 1 броні)", ignore: 1, energy: true },
  plasma:   { n: "Плазмова (ігнорує 2 броні)", ignore: 2, energy: true },
  gauss:    { n: "Гаус (ігнорує 3 броні)", ignore: 3, energy: true },
  electric: { n: "Електрична (+1d6 роботам)", energy: true, electric: true },
  cryo:     { n: "Кріо", energy: true },
  fire:     { n: "Вогонь" },
  rad:      { n: "Радіація (ігнорує броню)", special: "rad" },
  poison:   { n: "Отрута (ігнорує броню)", special: "poison" },
  psychic:  { n: "Психічна (ігнорує фізичну броню)", special: "psy" },
};

export const CAT_LABEL = { statists: "статист", regular: "рядовий", elite: "елітний", boss: "бос", pc: "персонаж гравця", caravan: "караван" };
export const CAT_ORDER = ["boss", "elite", "regular", "statists"];
export const RES_LABEL = { normal: "звичайна", half: "половина", immune: "невразливість", heal: "лікує (гуль)" };
/** Resistance choices for three-state (R3) and four-state (R4, radiation) defence fields. */
export const R3 = { normal: "звичайна", half: "половина", immune: "невразливість" };
export const R4 = { ...R3, heal: "лікує (гуль)" };

/** Defence presets of a player character by species. */
export const PC_PRESETS = {
  "Людина":                { armor: 0, psyArmor: 0, phys: "normal", rad: "normal", poison: "normal", psy: "normal", electric: false },
  "Гуль":                  { armor: 0, psyArmor: 0, phys: "normal", rad: "heal",   poison: "half",   psy: "normal", electric: false },
  "Супермутант":           { armor: 0, psyArmor: 0, phys: "normal", rad: "immune", poison: "normal", psy: "normal", electric: false },
  "Робот":                 { armor: 2, psyArmor: 0, phys: "normal", rad: "half",   poison: "immune", psy: "immune", electric: true },
  "Розумний Пазур Смерті": { armor: 1, psyArmor: 0, phys: "normal", rad: "normal", poison: "normal", psy: "normal", electric: false },
};

/** Combat states: ordinary situational aspects, added with one click. [key, aspect text] */
export const QUICK_ASPECTS = [["down", "Збитий з ніг"], ["stunned", "Приголомшений"], ["disarmed", "Без зброї"]];

/** Defence fields of a card: [field, label, kind] where kind is num / r3 / r4 / chk. */
export const DEF_FIELDS = [
  ["armor", "Броня", "num"], ["psyArmor", "Психічна броня", "num"],
  ["phys", "Фізична шкода", "r3"], ["energy", "Енергетична зброя", "r3"], ["fire", "Вогонь", "r3"],
  ["rad", "Радіація", "r4"], ["poison", "Отрути", "r3"], ["psy", "Психічна шкода", "r3"],
  ["electricVuln", "+1d6 від електрики", "chk"], ["halfPartial", "½ за часткового успіху атаки", "chk"], ["noKnockdown", "Не можна збити з ніг", "chk"],
  ["noStun", "Не можна приголомшити", "chk"], ["noDisarm", "Не можна обеззброїти", "chk"], ["kamikaze", "Камікадзе: +2 шкоди", "chk"],
];

/** Fields of a profile that a custom enemy's `def` object keeps (everything but the armour number). */
export const DEF_KEYS = ["psyArmor", "phys", "energy", "fire", "rad", "poison", "psy", "electricVuln", "halfPartial", "noKnockdown", "noStun", "noDisarm", "kamikaze"];

/**
 * Read a defence field's value from a form control (any object with `value` / `checked`).
 * @param {string} f field name  @param {{value?:any, checked?:boolean}} b control
 */
export function defValue(f, b) {
  const t = (DEF_FIELDS.find((x) => x[0] === f) || [])[2];
  if (t === "num") return Math.max(0, parseInt(b.value, 10) || 0);
  if (t === "chk") return !!b.checked;
  return b.value;
}

/** Short «label: value» text of a defence field (used in the log when a card's defence is changed by hand). */
export function defLabel(f, v) {
  const d = DEF_FIELDS.find((x) => x[0] === f); if (!d) return "";
  const val = d[2] === "chk" ? (v ? "так" : "ні") : (d[2] === "num" ? v : (R4[v] || v));
  return `${d[1].toLowerCase()}: ${val}`;
}

const HALF = "отримує лише половину шкоди (з округленням угору)";
const HALF_A = HALF + ", ще до вирахування броні.";
/** Tooltips of the special-property tags (see `profileTags`). */
export const TAG_HELP = {
  "+1d6 від електрики": "Вразливий до електрики: кожна атака електричною шкодою завдає йому додатково +1d6 шкоди.",
  "невразливий до отрут": "Не отримує шкоди від отрут.",
  "½ від отрут": "Від отрут " + HALF + ". Броня від отрут не захищає.",
  "невразливий до фізичної": "Не отримує шкоди від фізичних атак.",
  "½ від фізичної": "Від фізичних атак " + HALF_A,
  "невразливий до психічної": "Не отримує шкоди від психічних атак.",
  "½ від психічної": "Від психічних атак " + HALF_A,
  "отримує психічну шкоду": "Отримує психічну шкоду, хоча зазвичай істоти такого виду до неї невразливі.",
  "невразливий до радіації": "Не отримує шкоди від радіації.",
  "½ від радіації": "Від радіації " + HALF + ". Броня від радіації не захищає.",
  "радіація лікує": "Замість шкоди від радіації відновлює 1 ОЗ за кожну кістку шкоди радіацією.",
  "невразливий до вогню": "Не отримує шкоди від вогню.",
  "½ від вогню": "Від вогню " + HALF_A,
  "невразливий до енергетичної зброї": "Не отримує шкоди від енергетичної зброї (лазерної, плазмової тощо).",
  "½ від енергетичної зброї": "Від енергетичної зброї (лазерної, плазмової тощо) " + HALF_A,
  "½ за часткового успіху": "Якщо атака проти нього мала лише частковий успіх, він " + HALF_A,
  "не збити з ніг": "Його неможливо збити з ніг: аспект «Збитий з ніг» на нього не накладається.",
  "не приголомшити": "Його неможливо приголомшити: аспект «Приголомшений» на нього не накладається.",
  "не обеззброїти": "Його неможливо обеззброїти: аспект «Без зброї» на нього не накладається.",
  "Камікадзе: +2 шкоди": "Камікадзе: якщо після вирахування броні отримує хоча б 1 шкоди, отримує ще +2 шкоди. Сам завдає +2 шкоди своїми атаками, крім беззбройних і Пси-удару.",
  "захист змінено": "Броню чи стійкості цієї картки змінено вручну — вони відрізняються від книги.",
};

/** Tooltip text of a tag. */
export function tagHelp(t) {
  if (TAG_HELP[t]) return TAG_HELP[t];
  const m = /^психічна броня (\d+)$/.exec(t);
  if (m) return `Психічна броня ${m[1]}: зменшує кожну психічну шкоду на ${m[1]}, як звичайна броня — фізичну.`;
  return t;
}

/** Tags of a flat profile: [[iconName, text], …] (icons are tracker icon names; the Foundry side maps them). */
export function profileTags(p) {
  const tags = [];
  if (p.electricVuln) tags.push(["bolt", "+1d6 від електрики"]);
  if (p.poison === "immune") tags.push(["skull", "невразливий до отрут"]); else if (p.poison === "half") tags.push(["skull", "½ від отрут"]);
  if (p.phys === "immune") tags.push(["gauge", "невразливий до фізичної"]); else if (p.phys === "half") tags.push(["gauge", "½ від фізичної"]);
  if (p.psy === "immune") tags.push(["brain", "невразливий до психічної"]); else if (p.psy === "half") tags.push(["brain", "½ від психічної"]);
  if (p.psyVuln) tags.push(["brain", "отримує психічну шкоду"]);
  if (p.psyArmor) tags.push(["brain", "психічна броня " + p.psyArmor]);
  if (p.rad === "immune") tags.push(["radiation", "невразливий до радіації"]); else if (p.rad === "half") tags.push(["radiation", "½ від радіації"]); else if (p.rad === "heal") tags.push(["radiation", "радіація лікує"]);
  if (p.fire === "immune") tags.push(["fire", "невразливий до вогню"]); else if (p.fire === "half") tags.push(["fire", "½ від вогню"]);
  if (p.energy === "immune") tags.push(["sparkle", "невразливий до енергетичної зброї"]); else if (p.energy === "half") tags.push(["sparkle", "½ від енергетичної зброї"]);
  if (p.halfPartial) tags.push(["½", "½ за часткового успіху"]);
  if (p.noKnockdown) tags.push(["ban", "не збити з ніг"]);
  if (p.noStun) tags.push(["ban", "не приголомшити"]);
  if (p.noDisarm) tags.push(["ban", "не обеззброїти"]);
  if (p.kamikaze) tags.push(["bomb", "Камікадзе: +2 шкоди"]);
  return tags;
}

/* ------------------------------------------------------------------ *
 *  Dice
 * ------------------------------------------------------------------ */

/** A plain damage expression of one attack: «1d10», «2d6+2», «3d6-1». */
export const DICE_RE = /^\d*d\d+([+\-]\d+)?$/i;

const randIntWith = (rnd) => (min, max) => Math.floor(rnd() * (max - min + 1)) + min;

/**
 * Roll an expression like «2d6+1d6+2», «1d10-1» or just «9» (Ukrainian «к» is accepted for «d»).
 * @param {string} expr
 * @param {() => number} [rnd] Math.random-like source in [0, 1)
 * @returns {{total:number, dice:number, detail:string, isDice:boolean}|null} null when the text is not an expression
 */
export function rollSum(expr, rnd = Math.random) {
  const clean = String(expr || "").replace(/\s+/g, "").toLowerCase().replace(/к/g, "d");
  if (!clean) return null;
  if (!/^[+\-]?(\d*d\d+|\d+)([+\-](\d*d\d+|\d+))*$/.test(clean)) return null;
  const randInt = randIntWith(rnd);
  let total = 0, dice = 0; const parts = [];
  clean.replace(/([+\-]?)(\d*d\d+|\d+)/g, (m, sign, term) => {
    const s = sign === "-" ? -1 : 1;
    if (term.includes("d")) {
      const [c, f] = term.split("d"); const n = c ? +c : 1;
      const rolls = Array.from({ length: n }, () => randInt(1, +f));
      total += s * rolls.reduce((a, b) => a + b, 0); if (s > 0) dice += n;
      parts.push((s < 0 ? "−" : parts.length ? "+" : "") + `${n}d${f}[${rolls.join(",")}]`);
    } else { total += s * (+term); parts.push((s < 0 ? "−" : parts.length ? "+" : "") + term); }
    return m;
  });
  return { total, dice, detail: parts.join(" "), isDice: dice > 0 };
}

/* ------------------------------------------------------------------ *
 *  Defence profiles
 * ------------------------------------------------------------------ */

/**
 * Defence traits of an enemy, parsed from its armour and notes text.
 * @param {{armor?:string|number, notes?:string}} enemy
 */
export function enemyTraits(enemy) {
  const t = ((enemy.armor || "") + " ; " + (enemy.notes || "")).toLowerCase();
  return {
    armor: parseInt(enemy.armor, 10) || 0,
    electricVuln: /\+1d6 шкоди від електрики/.test(t),
    immunePoison: /невразлив\S*\s+до\s+отрут/.test(t),
    immunePsy: /невразлив\S*\s+до\s+(отрут\S*\s*(,|й|та|і)\s*)?психічн/.test(t),
    immuneRad: /невразлив\S*\s+до\s+радіації/.test(t),
    halfRad: /половину шкоди від радіації|від радіації( та отрути)? отримує лише половину/.test(t),
    halfPoison: /від радіації та отрути отримує лише половину|від отрут\S* отримує лише половину/.test(t),
    healRad: /радіація лікує/.test(t),
    immuneFire: /невразлив\S*\s+до\s+шкоди вогнем/.test(t),
    halfEnergy: /від енергетичної зброї отримує лише половину/.test(t),
    halfPartial: /за часткового успіху в перевірці атаки отримує лише половину/.test(t),
    noKnockdown: /не можна збити з ніг/.test(t),
    noStun: /не можна приголомшити/.test(t),
    noDisarm: /не можна обеззброїти/.test(t),
    psyVuln: /(^|[^е])вразливий до психічної/.test(t),
  };
}

/**
 * The book's defence of an enemy (traits from armour + notes) with manual card changes from `enemy.def`.
 * @param {{armor?:string|number, notes?:string, def?:object}} enemy
 * @returns {object} flat profile (see `normalizeTarget`)
 */
export function enemyBase(enemy) {
  const t = enemyTraits(enemy);
  const base = {
    armor: t.armor, psyArmor: 0, electricVuln: t.electricVuln, phys: "normal",
    energy: t.halfEnergy ? "half" : "normal", fire: t.immuneFire ? "immune" : "normal",
    rad: t.healRad ? "heal" : (t.immuneRad ? "immune" : (t.halfRad ? "half" : "normal")),
    poison: t.immunePoison ? "immune" : (t.halfPoison ? "half" : "normal"),
    psy: t.immunePsy ? "immune" : "normal", halfPartial: t.halfPartial, noKnockdown: t.noKnockdown,
    noStun: t.noStun, noDisarm: t.noDisarm, kamikaze: false, psyVuln: t.psyVuln,
  };
  if (enemy && enemy.def) Object.assign(base, enemy.def);
  return base;
}

/** Index of the «Психо» move of an enemy (the book's «Інʼєкція Психо», or any move with «Психо» in its name / text); -1 if none. */
export function psyMoveIdx(e) {
  return ((e && e.moves) || []).findIndex((m) => m && (/психо/i.test(m.n || "") || /(ширя|вжива|коле)\S*\s+психо/i.test(m.t || "")));
}

/**
 * Profile of an enemy card: book defence + manual overrides; `psycho` is on once the Психо move was used.
 * @param {object} enemy  enemy structure (needs armor / notes / moves, optional def)
 * @param {{ov?:object, used?:Object<number,boolean>}} [card] manual overrides (`ov`) and used moves (`used[moveIdx]`)
 */
export function enemyProfile(enemy, card = {}) {
  const p = Object.assign(enemyBase(enemy), card.ov || {});
  const pi = psyMoveIdx(enemy);
  p.psycho = pi >= 0 && !!(card.used || {})[pi];
  if (p.psy !== "normal") p.psyVuln = false;
  return p;
}

/** Profile of a player character `pc` ({armor, psyArmor, phys, …, electric, kamikaze, psycho}). */
export function pcProfile(p) {
  return {
    armor: +p.armor || 0, psyArmor: +p.psyArmor || 0, electricVuln: !!p.electric, phys: p.phys || "normal", energy: p.energy || "normal", fire: p.fire || "normal",
    rad: p.rad || "normal", poison: p.poison || "normal", psy: p.psy || "normal", halfPartial: !!p.halfPartial, noKnockdown: !!p.noKnockdown,
    noStun: !!p.noStun, noDisarm: !!p.noDisarm, kamikaze: !!p.kamikaze, psycho: !!p.psycho, psyVuln: false,
  };
}

/**
 * Bring any target description to the flat profile `computeDamage` reads. Accepts either the flat tracker profile
 * `{armor, psyArmor, electricVuln, phys, energy, fire, rad, poison, psy, halfPartial, kamikaze, psycho, …}` or the nested form
 * `{ armor, psyArmor|psiArmor, defense:{phys,energy,fire,rad,poison,psy}, flags:{electric|electricVuln, partialHalf|halfPartial, kamikaze, psycho, psyVuln, noKnockdown, noStun, noDisarm} }`.
 * Resistance values: «normal» | «half» | «immune» (| «heal» for radiation).
 * @returns {object} flat profile
 */
export function normalizeTarget(t = {}) {
  const d = t.defense || {}, f = t.flags || {};
  const pick = (k, dflt) => (t[k] !== undefined ? t[k] : (d[k] !== undefined ? d[k] : dflt));
  const flag = (...ks) => { for (const k of ks) { if (f[k] !== undefined) return !!f[k]; if (t[k] !== undefined) return !!t[k]; } return false; };
  return {
    armor: +t.armor || 0,
    psyArmor: +(t.psyArmor !== undefined ? t.psyArmor : t.psiArmor) || 0,
    electricVuln: flag("electricVuln", "electric"),
    phys: pick("phys", "normal"), energy: pick("energy", "normal"), fire: pick("fire", "normal"),
    rad: pick("rad", "normal"), poison: pick("poison", "normal"), psy: pick("psy", "normal"),
    halfPartial: flag("halfPartial", "partialHalf"),
    noKnockdown: flag("noKnockdown"), noStun: flag("noStun"), noDisarm: flag("noDisarm"),
    kamikaze: flag("kamikaze"), psycho: flag("psycho"), psyVuln: flag("psyVuln"),
  };
}

/* ------------------------------------------------------------------ *
 *  Damage
 * ------------------------------------------------------------------ */

/**
 * Damage to one target (the tracker's `computeDamage`). Order: bonuses (+1d6 electricity) → immunity → halving
 * → armour. Radiation and poison ignore armour; psychic only meets psychic armour. Kamikaze: if at least 1 damage
 * gets through the armour, +2 more.
 * @param {object} target  flat profile or nested form (see `normalizeTarget`)
 * @param {number} base    rolled damage
 * @param {string} typeKey key of `DMG_TYPES` (unknown → physical)
 * @param {{ignoreArmor?:boolean, ignoreN?:number, partial?:boolean, dice?:number, rollD6?:()=>number, rnd?:()=>number}} [opts]
 *   `dice` = number of damage dice (radiation heals a ghoul 1 HP per die); `rollD6` returns 1..6 for the electricity bonus
 * @returns {{final:number, heal?:number, steps:string[]}}  `steps` is the explanation shown in the log
 */
export function computeDamage(target, base, typeKey, opts = {}) {
  const r = computeDamageCore(normalizeTarget(target), base, typeKey, opts);
  if (!r.heal && r.final >= 1 && normalizeTarget(target).kamikaze) { r.final += 2; r.steps = [...r.steps, "+2 Камікадзе"]; }
  return r;
}

function computeDamageCore(p, base, typeKey, opts) {
  const type = DMG_TYPES[typeKey] || DMG_TYPES.phys;
  const steps = [];
  let dmg = base;
  if (type.electric && p.electricVuln) {
    const r = opts.rollD6 ? opts.rollD6() : randIntWith(opts.rnd || Math.random)(1, 6);
    dmg += r; steps.push(`+1d6 електрика [${r}]`);
  }
  const half = (why) => { dmg = Math.ceil(dmg / 2); steps.push(`½ ${why} → ${dmg}`); };
  if (type.special === "rad") {
    if (p.rad === "immune") return { final: 0, steps: ["невразливий до радіації"] };
    if (p.rad === "heal") { const h = Math.max(0, opts.dice || 0); return { final: 0, heal: h, steps: [`радіація лікує: +1 ОЗ за кожну кістку (${h})`] }; }
    if (p.rad === "half") half("від радіації");
    return { final: Math.max(0, dmg), steps };
  }
  if (type.special === "poison") {
    if (p.poison === "immune") return { final: 0, steps: ["невразливий до отрут"] };
    if (p.poison === "half") half("від отрути");
    return { final: Math.max(0, dmg), steps };
  }
  if (type.special === "psy") {
    if (p.psy === "immune") return { final: 0, steps: ["невразливий до психічної"] };
    if (p.psy === "half") half("від психічної");
    const pa = opts.ignoreArmor ? 0 : p.psyArmor;
    if (opts.ignoreArmor && p.psyArmor) steps.push("психічна броня ігнорується");
    if (pa) steps.push(`− психічна броня ${pa}`);
    return { final: Math.max(0, dmg - pa), steps };
  }
  if (typeKey === "fire" && p.fire === "immune") return { final: 0, steps: ["невразливий до вогню"] };
  if (type.energy && p.energy === "immune") return { final: 0, steps: [...steps, "невразливий до енергетичної зброї"] };
  if (p.phys === "immune") return { final: 0, steps: [...steps, "невразливий до фізичної"] };
  if (p.phys === "half") half("від фізичної");
  if (typeKey === "fire" && p.fire === "half") half("від вогню");
  if (type.energy && p.energy === "half") half("від енергетичної");
  if (opts.partial && p.halfPartial) half("частковий успіх");
  let armor = p.armor;
  if (opts.ignoreArmor) { if (armor) steps.push("броня ігнорується"); armor = 0; }
  else if (type.ignore || opts.ignoreN) {
    const ig = Math.max(type.ignore || 0, +opts.ignoreN || 0), was = armor;
    armor = Math.max(0, armor - ig); if (was) steps.push(`броня ${was}−${Math.min(was, ig)}`);
  }
  if (armor) steps.push(`− броня ${armor}`);
  return { final: Math.max(0, dmg - armor), steps };
}

/**
 * Header line of a damage log entry: «2d6[3,4] = 7 · фізична · ігнорує 1 броні · частковий успіх».
 * @param {{detail:string, isDice:boolean, total:number}} roll result of `rollSum`
 */
export function damageHead(roll, typeKey, opts = {}) {
  const n = (DMG_TYPES[typeKey] || DMG_TYPES.phys).n;
  return `${roll.detail}${roll.isDice ? " = " + roll.total : ""} · ${n.replace(/ \(.*/, "").toLowerCase()}${opts.ignoreArmor ? " · ігнорує броню" : ""}${opts.ignoreN ? ` · ігнорує ${opts.ignoreN} броні` : ""}${opts.partial ? " · частковий успіх" : ""}`;
}

/* ------------------------------------------------------------------ *
 *  Attacks (attacks.js) and attack / move text
 * ------------------------------------------------------------------ */

const ATK_DICE = /^\d*d\d+(?:[+\-]\d+)?(?![0-9A-Za-zА-Яа-яІіЇїЄєҐґ])/;
const ATK_MOD = /^\s*\+(?:\d*d\d+|\d+)\s+[^\s(]+(?:\s*\([^)]*\))?/;
const ATK_SUFFIX = [
  /^\s+кинь двічі, обери менший/,
  /^\s+самознищується під час атаки/,
  /^\s+якщо дуже роздратувати/,
  /^\s+спричиняє кровотечу\s*\([^()]*?\d*d\d+(?:[+\-]\d+)?\)?/,
];

/**
 * Split a battle-generator damage string («лапи 1d6 +3 радіацією (ігнорує броню) вогнемет (2 заряди) 2d6») into
 * separate attacks, each ending with its dice.
 * @param {string} src @returns {string[]}
 */
export function splitAttacks(src) {
  const s = String(src || "").trim();
  const out = [];
  let cur = "", depth = 0, i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (depth === 0 && (i === 0 || /\s/.test(s[i - 1]))) {
      const m = s.slice(i).match(ATK_DICE);
      if (m) {
        let piece = cur + m[0];
        i += m[0].length;
        const mod = s.slice(i).match(ATK_MOD);
        if (mod) { piece += mod[0]; i += mod[0].length; }
        for (const re of ATK_SUFFIX) {
          const sf = s.slice(i).match(re);
          if (sf) { piece += sf[0]; i += sf[0].length; break; }
        }
        out.push(piece.trim());
        cur = "";
        continue;
      }
    }
    if (ch === "(") depth++;
    if (ch === ")" && depth > 0) depth--;
    cur += ch;
    i++;
  }
  if (cur.trim()) {
    if (out.length) out[out.length - 1] += " " + cur.trim();
    else out.push(cur.trim());
  }
  return out;
}

/** Name (capitalised) and the rest (from the first «(» or dice) of one attack piece. */
export function attackParts(a) {
  const p = a.indexOf("(");
  const dm = a.match(/(^|\s)\d*d\d+/);
  const d = dm ? dm.index + dm[1].length : -1;
  const cut = [p, d].filter((x) => x > 0).sort((x, y) => x - y)[0];
  let name = cut ? a.slice(0, cut).trim() : a;
  const rest = cut ? a.slice(cut).trim() : "";
  name = name.charAt(0).toUpperCase() + name.slice(1);
  return { name, rest };
}

/**
 * Damage type key of an attack from its name and description (an extra «+1d6 отрутою» does not change the type).
 * @param {string} text @returns {string} key of `DMG_TYPES`
 */
export function atkType(text) {
  const t = String(text || "").toLowerCase().replace(/\+\s*\d*d?\d+\s+[^\s,;)]+/g, " ");
  if (/гаус/.test(t)) return "gauss";
  if (/плазм\S*\s+гранат|гранат\S*\s+плазм/.test(t)) return "phys"; // a plasma grenade is the exception: physical damage
  if (/плазм/.test(t)) return "plasma";
  if (/лазер/.test(t)) return "laser";
  if (/електр|імпульсн|тазер|ем[іi]-/.test(t)) return "electric";
  if (/кріо|морозн/.test(t)) return "cryo";
  if (/вогнемет|напалм|вогнян|запальн|молотова|струмін\S*\s+вогн|шкода вогнем|вогнем\s+\d/.test(t)) return "fire";
  if (/радіаційн|радіоактивн|гамма/.test(t)) return "rad";
  if (/отруйн|токсичн/.test(t)) return "poison";
  if (/психічн|пси[- ]/.test(t)) return "psychic";
  return "phys";
}

/** «ігнорує 2 броні», «ігнорує 1 фізичної броні» → 2 / 1 (armour the attack pierces); 0 if none. */
export function atkIgnoreN(text) {
  const m = /ігнору\S*\s+(\d+)\s+(?:фізичн\S*\s+)?брон/i.exec(String(text || ""));
  return m ? Math.min(20, +m[1]) : 0;
}

/** «ігнорує броню» of the whole attack (not of an extra «+3 радіацією (ігнорує броню)» part). */
export function atkIgnores(text) {
  return /ігнору\S*\s+броню/i.test(String(text || "").replace(/\+\s*\d*d?\d+\s+[^\s,;()]+(\s*\([^)]*\))?/g, " "));
}

/** Charges / pieces in an attack description: «3 заряди», «2 штуки», «1 штука» → 3 / 2 / 1; 0 if none. */
export function atkAmmo(text) {
  const m = /(\d+)\s*(заряд|штук|постріл)/i.exec(String(text || ""));
  const n = m ? +m[1] : 0;
  return n > 0 && n <= 20 ? n : 0;
}

/**
 * Like `atkAmmo`, also understanding the compendium's wording: «1 шт.», «2 гранати», «2 ракети», «щонайбільше 1 шт.».
 */
export function atkAmmoEx(text) {
  const n = atkAmmo(text);
  if (n) return n;
  const m = /(\d+)\s*(шт(?!\p{L})|гранат|ракет|міни|мін(?!\p{L}))/iu.exec(String(text || ""));
  const k = m ? +m[1] : 0;
  return k > 0 && k <= 20 ? k : 0;
}

const UNARMED_RE = /беззбройн|кулак|рукопаш|голими руками|удар рукою/i;

/**
 * Dice of an attack with the «+2» of Kamikaze and of Психо added (not for unarmed attacks and Пси-удар).
 * @param {string} dice «1d10», «2d6+1» @param {string} text attack name / description
 * @param {{kamikaze?:boolean, psycho?:boolean}} [p] profile of the attacker
 */
export function kamiDice(dice, text, p) {
  const bonus = p ? (p.kamikaze ? 2 : 0) + (p.psycho ? 2 : 0) : 0;
  if (!bonus || !dice || UNARMED_RE.test(text || "") || /пси-удар/i.test(text || "")) return dice;
  const m = /^(\d*d\d+)([+\-]\d+)?$/i.exec(String(dice).replace(/\s+/g, "")); if (!m) return dice;
  const mod = (+m[2] || 0) + bonus;
  return m[1] + (mod > 0 ? "+" + mod : mod < 0 ? String(mod) : "");
}

/**
 * A move that restores HP: «Раз за сцену відновлює ОЗ 1d6+4», «…усі, хто чує, відновлюють 5 ОЗ».
 * @returns {{expr:string, group:boolean, others:boolean}|null}
 */
export function moveHeal(t) {
  const m = /відновлю\S*\s+(?:собі\s+(?:або|чи)\s+союзник\S*\s+)?(?:по\s+)?(?:ОЗ\s+(\d*d\d+(?:[+\-]\d+)?|\d+)|(\d*d\d+(?:[+\-]\d+)?|\d+)\s*ОЗ)/i.exec(String(t || ""));
  if (!m) return null;
  const expr = m[1] || m[2], group = /(усі|кожен|бійці)/i.test(t), others = /(інш(і|им|их))/i.test(t);
  return { expr, group, others };
}

/** Aspect as `{t, inv}` (text, invocations used) from a string or an object. */
export function normAsp(a) {
  return (a && typeof a === "object") ? { t: String(a.t || ""), inv: Math.max(0, +a.inv || 0) } : { t: String(a || ""), inv: 0 };
}
/** Aspect list → plain strings; an entry «a; b» becomes two. */
export function splitAsp(list) {
  return (list || []).flatMap((a) => String(a).split(/\s*;\s*/)).filter(Boolean);
}

/**
 * «(ігнорує 2 броні) 1d10+2» → {n, note:"ігнорує 2 броні", d:"1d10+2"}; «1d10 +1d6 отрутою (ігнорує броню)» →
 * {note:"+1d6 отрутою, ігнорує броню", d:"1d10"}. null if there are no dice.
 * @param {string} name @param {string} rest
 */
export function presetFromRest(name, rest) {
  const str = String(rest); let depth = 0, pos = -1, dice = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(") depth++; else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (depth === 0 && (i === 0 || /\s/.test(str[i - 1]))) { const m = str.slice(i).match(/^\d*d\d+(?:[+\-]\d+)?/); if (m) { pos = i; dice = m[0]; break; } }
  }
  if (pos < 0) return null;
  const tidy = (t) => t.replace(/\(\s*/g, "").replace(/\s*\)/g, "").replace(/\s+/g, " ").trim();
  const before = tidy(str.slice(0, pos)), after = tidy(str.slice(pos + dice.length).replace(/\s*\(/g, ", ("));
  return { n: name, note: [before, after].filter(Boolean).join(", ").replace(/^,\s*/, ""), d: dice };
}

/* ------------------------------------------------------------------ *
 *  Presets and custom enemies
 * ------------------------------------------------------------------ */

/** Approximate stats per category (the rules chapter on creating NPCs). */
export const CAT_GUIDE = {
  statists: { hp: [2, 3, 4], armor: [0], txt: "ОЗ 2–4, броня 0, шкода — менший із 2d6 (максимум 1d6), без аспектів і ходів" },
  regular: { hp: [5, 6, 8, 10], armor: [1], txt: "ОЗ 5–10, броня 1, шкода 1d6 (максимум 1d10), 1 аспект, 0–1 хід" },
  elite: { hp: [12, 15, 18, 20], armor: [2, 3], txt: "ОЗ 12–20, броня 2–3, шкода 1d10 (найзліші — 2d6), може ігнорувати 1 броні, 1–2 аспекти, 1–2 ходи" },
  boss: { hp: [25, 30, 35, 40, 45, 50], armor: [3, 4, 5, 6], txt: "ОЗ 25–50, броня 3–4 (5–6 у силовій броні), шкода 2d6 (найзліші — 3d6), може ігнорувати 1–3 броні, 3 аспекти, 3–4 ходи" },
};

/** The first three groups of the attack presets: «Зброя за книгою», «Енергетична зброя», «Гранати» — [[group, [{n, note, d}]]]. */
export const ATTACK_PRESETS_BOOK = [
  ["Зброя за книгою", [["Легка зброя ближнього бою", "", "1d6"], ["Легка зброя для бою на відстані", "", "1d6"], ["Середня зброя ближнього бою", "", "1d10"], ["Середня зброя для бою на відстані", "", "1d10"], ["Важка зброя ближнього бою", "", "2d6"], ["Важка зброя для бою на відстані", "", "2d6"], ["Рідкісна зброя", "", "3d6"], ["Кулаки або імпровізована зброя", "кинь двічі, обери менший", "1d6"]]],
  ["Енергетична зброя", [["Лазерна середня зброя", "ігнорує 1 броні", "1d10"], ["Лазерна важка зброя", "ігнорує 1 броні", "2d6"], ["Плазмова середня зброя", "ігнорує 2 броні", "1d10"], ["Плазмова важка зброя", "ігнорує 2 броні", "2d6"], ["Електрична середня зброя", "+1d6 роботам та електроніці", "1d10"], ["Гаус-зброя", "ігнорує 3 броні", "3d6"]]],
  ["Гранати", [["Саморобна граната", "влучає по всіх у одній зоні", "1d6"], ["Армійська граната", "влучає по всіх у одній зоні", "2d6"], ["Плазмова граната", "влучає по всіх у одній зоні", "3d6"], ["Електромагнітна граната", "лише роботам та електроніці, влучає по всіх у одній зоні", "4d6"]]],
].map(([g, l]) => [g, l.map(([n, note, d]) => ({ n, note, d }))]);

const FACTION_CATS = ["statists", "regular", "elite", "boss"];

/**
 * All attack presets: the book's groups plus «З бази супротивників» — one attack per name from the battle generator's DB
 * (names not repeated in the DB or next to the book's group), sorted by name.
 * @param {Object<string, Object>} [db] battle generator DB: faction → {name, statists:[…], regular:[…], elite:[…], boss:[…]}
 */
export function buildAttackPresets(db = {}) {
  const groups = ATTACK_PRESETS_BOOK.map(([g, l]) => [g, l.map((a) => ({ ...a }))]);
  const norm = (n) => String(n).trim().toLowerCase();
  const seen = new Set(groups.flatMap(([, l]) => l.map((a) => norm(a.n)))), fromDb = [];
  Object.values(db).forEach((f) => FACTION_CATS.forEach((c) => (f[c] || []).forEach((e) => {
    splitAttacks(e.dmg).forEach((a) => {
      const q = attackParts(a); const pr = presetFromRest(q.name, q.rest); if (!pr) return;
      const key = norm(pr.n); if (seen.has(key)) return; seen.add(key); fromDb.push(pr);
    });
  })));
  fromDb.sort((a, b) => a.n.localeCompare(b.n, "uk"));
  groups.push(["З бази супротивників", fromDb]);
  return groups;
}

/** Move presets from the battle generator's DB: unique by name, sorted. @returns {{n:string, t:string}[]} */
export function buildMovePresets(db = {}) {
  const seen = new Set(), out = [];
  Object.values(db).forEach((f) => FACTION_CATS.forEach((c) => (f[c] || []).forEach((e) => (e.moves || []).forEach((m) => {
    const key = String(m.n).trim().toLowerCase(); if (seen.has(key)) return; seen.add(key); out.push({ n: m.n, t: m.t });
  }))));
  return out.sort((a, b) => a.n.localeCompare(b.n, "uk"));
}

/** Empty custom-enemy form. @param {string} [folder] */
export function customBlank(folder = "") {
  return {
    name: "", cat: "regular", hp: 6, armor: 1, count: 1, save: true, notes: "", tok: null, folder,
    def: { psyArmor: 0, phys: "normal", energy: "normal", fire: "normal", rad: "normal", poison: "normal", psy: "normal", electricVuln: false, halfPartial: false, noKnockdown: false, noStun: false, noDisarm: false, kamikaze: false },
    attacks: [{ n: "Легка зброя ближнього бою", note: "", d: "1d6" }], moves: [], aspects: [],
  };
}

/**
 * Custom-enemy form filled from an enemy record of the battle generator DB ({name, cat, hp, armor, dmg, aspects, moves, notes, def?}).
 * @param {object} e @param {{folder?:string, tok?:string|null}} [o]
 */
export function customFromEnemy(e, o = {}) {
  const d = enemyBase(e);
  const def = {}; DEF_KEYS.forEach((k) => { def[k] = d[k]; });
  const attacks = splitAttacks(e.dmg).map((a) => { const q = attackParts(a); return presetFromRest(q.name, q.rest) || { n: q.name, note: q.rest, d: "" }; });
  return {
    name: e.name, cat: e.cat || "regular", hp: +e.hp || 1, armor: parseInt(e.armor, 10) || 0, count: 1, save: true, notes: e.notes || "",
    folder: o.folder !== undefined ? o.folder : String(e.folder || ""), tok: o.tok !== undefined ? o.tok : (e.tok || null),
    def, attacks, moves: (e.moves || []).map((m) => ({ n: m.n, t: m.t })), aspects: splitAsp(e.aspects),
  };
}

/**
 * Validate a custom-enemy form and build the enemy record (the tracker's `buildCustomEnemy`).
 * @param {{name:string, cat:string, hp:number, armor:number, attacks:{n:string,note:string,d:string}[], moves:{n:string,t:string}[], aspects:string[], notes:string, def:object, tok?:any, folder?:string}} c
 * @returns {{err:string}|{enemy:object}}
 */
export function buildCustomEnemy(c) {
  const name = String(c.name || "").trim();
  if (!name) return { err: "Дай супротивникові назву" };
  const attacks = (c.attacks || []).filter((a) => String(a.n || "").trim() || String(a.d || "").trim());
  const bad = attacks.find((a) => !DICE_RE.test(String(a.d || "").trim()));
  if (bad) return { err: `Шкода атаки «${bad.n || "без назви"}»: вкажи кістки, напр. 1d10 або 2d6+2` };
  const clean = (t) => String(t || "").replace(/[()]/g, "").trim();
  const dmg = attacks.map((a) => `${clean(a.n) || "Атака"}${clean(a.note) ? ` (${clean(a.note)})` : ""} ${a.d.trim()}`).join(" ");
  const def = {};
  Object.entries(c.def || {}).forEach(([k, v]) => { if (v && v !== "normal") def[k] = v; });
  return {
    enemy: {
      name, cat: c.cat, hp: Math.max(1, +c.hp || 1), armor: String(Math.max(0, +c.armor || 0)), dmg,
      aspects: (c.aspects || []).slice(), moves: (c.moves || []).filter((m) => String(m.n || "").trim() || String(m.t || "").trim()).map((m) => ({ n: String(m.n || "").trim() || "Хід", t: String(m.t || "").trim() })),
      notes: String(c.notes || "").trim(), def, custom: true, tok: c.tok || null, ...(String(c.folder || "").trim() ? { folder: String(c.folder).trim() } : {}),
    },
  };
}

/* ------------------------------------------------------------------ *
 *  Enemy structure from the battle DB and from compendium HTML
 * ------------------------------------------------------------------ */

/**
 * @typedef {object} EnemyAttack
 * @property {string} name   attack name, first letter capitalised
 * @property {string} dice   «1d10», «2d6+2» ('' if the text has no dice)
 * @property {string} type   key of `DMG_TYPES`
 * @property {string} note   description without the dice («ігнорує 1 броні, бій на відстані»)
 * @property {number} ammoMax charges / pieces (0 = unlimited)
 * @property {number} ignoreN armour pierced by the attack (0 = none)
 * @property {boolean} ignoreArmor «ігнорує броню» for the whole attack
 *
 * @typedef {object} EnemyStruct
 * @property {string} name
 * @property {string} cat    statists | regular | elite | boss
 * @property {number} hp
 * @property {number} armor
 * @property {string} armorText armour with its parenthesis, as in the book («5 (силова броня: …)»)
 * @property {EnemyAttack[]} attacks
 * @property {string[]} aspects
 * @property {{n:string, t:string}[]} moves
 * @property {string} notes
 * @property {object} traits `enemyTraits` of armour text + notes
 */

function attackFrom(name, rest, whole, ammoFn = atkAmmo) {
  return {
    name, dice: "", type: atkType(whole), note: rest, ammoMax: ammoFn(whole), ignoreN: atkIgnoreN(whole), ignoreArmor: atkIgnores(whole),
  };
}

/**
 * Enemy structure from a battle-generator DB record.
 * @param {{name:string, cat?:string, hp:number, armor:string|number, dmg?:string, aspects?:string[], moves?:{n:string,t:string}[], notes?:string}} rec
 * @returns {EnemyStruct}
 */
export function enemyFromRecord(rec) {
  const attacks = splitAttacks(rec.dmg).map((a) => {
    const q = attackParts(a);
    const pr = presetFromRest(q.name, q.rest);
    const at = attackFrom(pr ? pr.n : q.name, pr ? pr.note : q.rest, a);
    at.dice = pr ? pr.d : "";
    return at;
  });
  const armorText = String(rec.armor == null ? "" : rec.armor);
  const notes = rec.notes || "";
  return {
    name: rec.name, cat: rec.cat || "regular", hp: +rec.hp || 1, armor: parseInt(armorText, 10) || 0, armorText,
    attacks, aspects: splitAsp(rec.aspects), moves: (rec.moves || []).map((m) => ({ n: m.n, t: m.t })), notes,
    traits: enemyTraits({ armor: armorText, notes }),
  };
}

const ENTITIES = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&#x27;": "'", "&nbsp;": " ", "&amp;": "&" };
const decode = (s) => String(s).replace(/&(lt|gt|quot|nbsp|amp|#39|#x27);/g, (m) => ENTITIES[m] ?? m);
const stripTags = (s) => decode(String(s).replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Category word of the book («елітний супротивник.», «бос») → key. */
function catFromText(t) {
  const s = String(t || "").toLowerCase();
  if (/бос/.test(s)) return "boss";
  if (/еліт/.test(s)) return "elite";
  if (/статист/.test(s)) return "statists";
  if (/рядов/.test(s)) return "regular";
  return "";
}

/** Split at commas outside «» and (). */
function splitTopCommas(s) {
  const out = []; let cur = "", q = 0, p = 0;
  for (const ch of s) {
    if (ch === "«") q++; else if (ch === "»") q = Math.max(0, q - 1);
    else if (ch === "(") p++; else if (ch === ")") p = Math.max(0, p - 1);
    if (ch === "," && !q && !p) { out.push(cur); cur = ""; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.replace(/\*/g, "").replace(/[.\s]+$/g, "").trim()).filter(Boolean);
}

/** Balanced «( … )» starting at s[i] === "(": [content, indexAfter]. */
function parenAt(s, i) {
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === "(") d++;
    else if (s[j] === ")") { d--; if (!d) return [s.slice(i + 1, j), j + 1]; }
  }
  return [s.slice(i + 1), s.length];
}

/** Attacks of the «Шкода» line: `<u>Name</u> (3d6 фізичної шкоди, бій на відстані, ігнорує 1 броні)` items. */
function parseDamageLine(inner) {
  const out = [];
  const re = /<u>([\s\S]*?)<\/u>\*?\s*/g;
  let m, any = false;
  while ((m = re.exec(inner))) {
    any = true;
    let rest = "";
    if (inner[re.lastIndex] === "(") { const [c, next] = parenAt(inner, re.lastIndex); rest = stripTags(c); re.lastIndex = next; }
    out.push([stripTags(m[1]).replace(/\*+/g, "").trim(), rest]);
  }
  if (!any) {
    // plain text fallback: «name (dice …); name (dice …)»
    const plain = stripTags(inner).replace(/^[^:]*:\s*/, "");
    plain.split(/;\s*/).forEach((piece) => {
      const p = piece.indexOf("(");
      if (p > 0) { const [c] = parenAt(piece, p); out.push([piece.slice(0, p).trim().replace(/\*+/g, ""), c]); } else if (piece.trim()) out.push([piece.trim(), piece.trim()]);
    });
  }
  return out.filter(([n]) => n).map(([n, r]) => {
    const dm = /\d*d\d+(?:[+\-]\d+)?/.exec(r);
    const dice = dm ? dm[0] : "";
    const note = dm ? (r.slice(0, dm.index) + r.slice(dm.index + dm[0].length)).replace(/^[\s,]+/, "").replace(/\s+/g, " ").trim() : r.trim();
    const at = attackFrom(cap(n), note, n + " " + note, atkAmmoEx);
    at.dice = dice;
    // «… + 1d6 шкоди отрутою, отрута ігнорує броню»: an extra part ignoring armour is not the whole attack
    if (at.ignoreArmor && /\+\s*\d*d\d+/.test(note)) at.ignoreArmor = false;
    return at;
  });
}

/**
 * Enemy structure from the HTML of a compendium enemy's `system.description`
 * («Категорія / ОЗ / Броня / Шкода / Аспект(и) / Ходи» list, then the note). Regex based, no DOM.
 * @param {string} html
 * @param {{name?:string, cat?:string, hp?:number, armor?:number|string, notes?:string}} [fallback] values used when the HTML lacks a line
 * @returns {EnemyStruct}
 */
export function parseEnemyHtml(html, fallback = {}) {
  const h = String(html || "");
  // the stats list: from the first <ul> to its matching </ul>
  const a = h.indexOf("<ul>");
  const end = a >= 0 ? matchClose(h, a, "ul") : -1;
  const list = a >= 0 ? h.slice(a + 4, end >= 0 ? end - 5 : h.length) : "";
  let tail = end >= 0 ? h.slice(end) : "";
  const cutAt = tail.search(/<hr\b|<p>\s*Попередній/i); if (cutAt >= 0) tail = tail.slice(0, cutAt);
  const res = { name: fallback.name || "", cat: "", hp: 0, armor: 0, armorText: "", attacks: [], aspects: [], moves: [], notes: "", traits: null };
  let hpSeen = false, armorSeen = false;
  for (const raw of topLis(list)) {
    const plain = stripTags(raw.replace(/<ul>[\s\S]*<\/ul>/, "")).replace(/^[*\s]+/, "");
    const lm = /^([^:*(]+?)\s*(?:\([^)]*\))?\s*:\s*([\s\S]*)$/.exec(plain);
    if (!lm) continue;
    const label = lm[1].trim().toLowerCase(), value = lm[2].replace(/\*/g, "").trim();
    if (label === "категорія") res.cat = catFromText(value);
    else if (label === "оз") { const n = parseInt(value, 10); if (n >= 0) { res.hp = n; hpSeen = true; } }
    else if (label === "броня") { res.armorText = value; res.armor = parseInt(value, 10) || 0; armorSeen = true; }
    else if (label === "шкода") res.attacks = parseDamageLine(raw);
    else if (label === "аспект") { const v = value.replace(/[.\s]+$/, ""); if (v) res.aspects = [v]; }
    else if (label === "аспекти") res.aspects = splitTopCommas(value);
    else if (label === "ходи") {
      const u0 = raw.indexOf("<ul>");
      if (u0 >= 0) { const u1 = matchClose(raw, u0, "ul"); res.moves = topLis(raw.slice(u0 + 4, u1 >= 0 ? u1 - 5 : raw.length)).map(parseMove); }
    }
  }
  if (!res.cat) res.cat = catFromText(fallback.cat) || (fallback.cat === "ordinary" ? "regular" : fallback.cat === "statist" ? "statists" : (fallback.cat || "regular"));
  if (!hpSeen) res.hp = +fallback.hp || 1;
  if (!armorSeen) { res.armor = parseInt(fallback.armor, 10) || 0; res.armorText = String(fallback.armor ?? res.armor); }
  res.notes = stripTags(tail) || String(fallback.notes || "");
  res.traits = enemyTraits({ armor: res.armorText, notes: res.notes });
  return res;
}

/** Index just after the tag closing the `<tag>` that opens at h[start]; -1 if unbalanced. */
function matchClose(h, start, tag) {
  const re = new RegExp("<(/?)" + tag + "\\b[^>]*>", "g"); re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(h))) { depth += m[1] ? -1 : 1; if (!depth) return re.lastIndex; }
  return -1;
}

/** Inner HTML of the top-level `<li>` items of a list body (nested lists stay inside their item). */
function topLis(body) {
  const out = []; const re = /<(\/?)li\b[^>]*>/g; let depth = 0, from = 0, m;
  while ((m = re.exec(body))) {
    if (!m[1]) { if (!depth) from = re.lastIndex; depth++; } else { depth--; if (!depth) out.push(body.slice(from, m.index)); if (depth < 0) depth = 0; }
  }
  return out;
}

/** One move item: `<strong>Name:</strong> text`, optionally followed by a nested list of options (joined with « • »). */
function parseMove(raw) {
  const u0 = raw.indexOf("<ul>");
  let sub = [];
  if (u0 >= 0) { const u1 = matchClose(raw, u0, "ul"); sub = topLis(raw.slice(u0 + 4, u1 >= 0 ? u1 - 5 : raw.length)).map(stripTags); raw = raw.slice(0, u0) + (u1 >= 0 ? raw.slice(u1) : ""); }
  const sm = /^\s*<strong>([\s\S]*?)<\/strong>/.exec(raw);
  let n, t;
  if (sm) { n = stripTags(sm[1]); t = stripTags(raw.slice(sm[0].length)); }
  else { const s = stripTags(raw); const k = s.indexOf(":"); n = k > 0 ? s.slice(0, k) : s; t = k > 0 ? s.slice(k + 1) : ""; }
  t = t.replace(/^\*?\s*:\s*/, "");   // «Псионічний талант*:» — the colon comes after the bold name
  n = n.replace(/[:*\s]+$/g, "").trim();
  t = [t.trim(), ...sub].filter(Boolean).join(" • ");
  return { n, t };
}

/* ------------------------------------------------------------------ *
 *  Zones (Foundry Drawings: x, y, w, h in scene pixels)
 * ------------------------------------------------------------------ */

/** Zone sticker colours (key → Ukrainian label). */
export const ZONE_COLORS = { yellow: "Жовтий", blue: "Синій", green: "Зелений", red: "Червоний", purple: "Фіолетовий" };
/** Colour key of a zone (unknown → yellow). */
export const zoneColor = (z) => (ZONE_COLORS[z && z.color] ? z.color : "yellow");

/** Do two rects `{x,y,w,h}` overlap (touching edges do not)? */
export const rectOverlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Is the point inside the rect (left / top edge inclusive, right / bottom exclusive)? */
export const pointInRect = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/**
 * Is `rect` free of other zones (and inside `bounds`, when given)?
 * @param {{x,y,w,h}} rect @param {{id?:any,x,y,w,h}[]} zones @param {any} [skipId] zone to ignore (the one being moved)
 * @param {{x,y,w,h}} [bounds] the area zones must stay in (the scene)
 */
export function zoneFree(rect, zones, skipId, bounds) {
  if (bounds && !(rect.x >= bounds.x && rect.y >= bounds.y && rect.x + rect.w <= bounds.x + bounds.w && rect.y + rect.h <= bounds.y + bounds.h)) return false;
  return (zones || []).every((z) => z.id === skipId || !rectOverlap(rect, z));
}

/**
 * First free spot for a new w × h zone, scanning row by row on the grid (like the tracker's `zFindSpot`).
 * @param {{x,y,w,h}[]} zones existing zones @param {number} w @param {number} h
 * @param {{x,y,w,h}} bounds area to place in @param {number} g grid size (scan step)
 * @returns {{x,y,w,h}} the spot, or the bounds' top-left corner when nothing is free
 */
export function findZoneSpot(zones, w, h, bounds, g) {
  const step = g > 0 ? g : 1;
  for (let y = bounds.y; y + h <= bounds.y + bounds.h; y += step) {
    for (let x = bounds.x; x + w <= bounds.x + bounds.w; x += step) {
      const r = { x, y, w, h };
      if (zoneFree(r, zones, undefined, bounds)) return r;
    }
  }
  return { x: bounds.x, y: bounds.y, w, h };
}

/** The first zone containing the point (a token centre); undefined when none. */
export function zoneOfPoint(zones, x, y) {
  return (zones || []).find((z) => pointInRect(z, x, y));
}

/* ------------------------------------------------------------------ *
 *  Random zone names and aspects (zone-data.mjs)
 * ------------------------------------------------------------------ */

/** Place names the travel generator uses that differ from the zone pools' keys. */
export const ZPLACE_ALIAS = { "Залишки гайвею": "Залишки автостради", "Висохле гирло річки": "Висохле русло річки" };

/** Pool key of a battle place: «Сховище 47» → «Сховище (d100)»; unknown or empty place → null (then all places are used). */
export function zonePlaceKey(place) {
  let p = String(place || "").trim(); if (!p) return null;
  p = ZPLACE_ALIAS[p] || p;
  if (/^Сховище \d+$/.test(p)) return "Сховище (d100)";
  return PUST_ZONE_NAMES[p] ? p : null;
}

/** Vault number d100 without the vaults of the map: 8 (Волт-Сіті), 12 (Некрополіс), 13 and 15. @param {()=>number} [rnd] */
export function vaultNo(rnd = Math.random) {
  let n;
  do { n = Math.floor(rnd() * 100) + 1; } while ([8, 12, 13, 15].includes(n));
  return n;
}

/** «Сховище (d100)» → «Сховище 47» (other places unchanged). */
export function resolveVaultPlace(place, rnd = Math.random) {
  return String(place || "").replace(/\s*\(d100\)/, () => " " + vaultNo(rnd));
}

const asSet = (used) => new Set([...(used || [])].map((u) => (u && typeof u === "object" ? (u.t ?? u.name) : u)));

function pickFresh(pool, used, rnd) {
  if (!pool.length) return "";
  for (let i = 0; i < 60; i++) { const v = pool[Math.floor(rnd() * pool.length)]; if (!used.has(v)) return v; }
  return pool.find((v) => !used.has(v)) || "";   // random tries failed: first unused one; "" when the pool is exhausted
}

/**
 * Random zone name for the battle's place, not repeating any of `usedNames`.
 * @param {string} placeText battle place («Ферма», «Сховище 47», '' for any place)
 * @param {Iterable<string>} usedNames names already taken by zones of this battle
 * @param {()=>number} [rnd] @returns {string} '' when the pool is exhausted
 */
export function randomZoneName(placeText, usedNames, rnd = Math.random) {
  const key = zonePlaceKey(placeText);
  const pool = key ? PUST_ZONE_NAMES[key] : Object.values(PUST_ZONE_NAMES).flat();
  return pickFresh(pool, asSet(usedNames), rnd);
}

/**
 * Random zone aspect («прикметник + іменник») for the battle's place, not repeating any of `usedAspects`
 * (strings or `{t}` objects).
 */
export function randomZoneAspect(placeText, usedAspects, rnd = Math.random) {
  const key = zonePlaceKey(placeText);
  const pool = key ? (PUST_ZONE_ASPECTS[key] || []) : Object.values(PUST_ZONE_ASPECTS).flat();
  return pickFresh(pool, asSet(usedAspects), rnd);
}
