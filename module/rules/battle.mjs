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
/** Resistance choices for three-state (R3) and four-state (R4, radiation) defence fields. */
export const R3 = { normal: "звичайна", half: "половина", immune: "невразливість" };
export const R4 = { ...R3, heal: "лікує (гуль)" };

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
  "½ за часткового успіху": "Якщо атака проти нього мала лише частковий успіх, він " + HALF + " будь-якого типу, ще до вирахування броні. Половини додаються: разом з іншою «½» (від вогню, отрути…) шкоди немає зовсім.",
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

/** A plain damage expression of one attack: «1d10», «2d6+2», «3d6-1», «2d6kl1» (the lower of 2d6). */
export const DICE_RE = /^\d*d\d+(kl1)?([+\-]\d+)?$/i;

const LOWER_RE = /менш\S*\s+(?:з|із)(?=[\s,]|$)|кинь\s+двічі,?\s+обери\s+менш\S*/i;

/**
 * «менша з 2d6» / «1d6 кинь двічі, обери менший» (author, 2026-11-14: was read as plain 2d6) → the dice keep the lower
 * one, «2d6kl1», and the words leave the note. Dice already «kl1» stay as they are.
 * @param {string} dice @param {string} note @returns {{dice:string, note:string}}
 */
export function lowerDice(dice, note) {
  const d = String(dice || "").trim(), t = String(note || "");
  if (!LOWER_RE.test(t) || /kl1/i.test(d)) return { dice: d, note: t };
  const m = /^(\d*)d(\d+)([+\-]\d+)?$/i.exec(d);
  if (!m) return { dice: d, note: t };
  const n = +(m[1] || 1);
  const dice2 = `${n < 2 ? 2 : n}d${m[2]}kl1${m[3] || ""}`;
  const clean = t.replace(LOWER_RE, "").replace(/^[\s,;]+|[\s,;]+$/g, "").replace(/\s*,\s*,\s*/g, ", ").replace(/\s+/g, " ").trim();
  return { dice: dice2, note: clean };
}

/**
 * An attack's note without the words of its own damage type at its start (author, 2026-11-14: the chip shows the type):
 * «фізичної шкоди, ближній бій» → «ближній бій», «шкоди радіацією всім істотам в одній зоні» → «всім істотам в одній
 * зоні». Other types in the note stay («+ 3 шкоди радіацією»), and so does «фізичної шкоди вогнем» on a physical attack.
 * @param {string} note @param {string} type key of DMG_TYPES
 */
const PHYS_WORDS = String.raw`фізичн\S*\s+шкод[а-яіїєґ]*(?![а-яіїєґ])`;
const TYPE_WORDS = {
  phys: new RegExp(String.raw`^${PHYS_WORDS}(?!\s+(?:вогнем|радіацією|отрутою|кислотою))`, "i"),
  laser: new RegExp(String.raw`^(?:(?:лазерн\S*|енергетичн\S*)\s+(?:\(\S+\)\s+)?шкод\S*|${PHYS_WORDS})`, "i"),
  plasma: new RegExp(String.raw`^(?:(?:плазмов\S*|енергетичн\S*)\s+(?:\(\S+\)\s+)?шкод\S*|${PHYS_WORDS})`, "i"),
  gauss: new RegExp(String.raw`^(?:(?:гаус\S*|енергетичн\S*)\s+шкод\S*|${PHYS_WORDS})`, "i"),
  electric: new RegExp(String.raw`^(?:електричн\S*\s+шкод\S*|шкод\S*\s+електрикою|${PHYS_WORDS})`, "i"),
  cryo: new RegExp(String.raw`^(?:кріо\S*\s+шкод\S*|шкод\S*\s+холодом|${PHYS_WORDS})`, "i"),
  fire: /^(?:(?:фізичн\S*\s+)?шкод\S*\s+вогнем|вогнян\S*\s+шкод\S*)/i,
  rad: /^(?:(?:фізичн\S*\s+)?шкод\S*\s+радіацією|радіаційн\S*\s+шкод\S*)/i,
  poison: /^(?:шкод\S*\s+отрутою|отруйн\S*\s+шкод\S*)/i,
  psychic: /^психічн\S*\s+шкод\S*/i,
};
export function noteWithoutType(note, type) {
  const t = String(note ?? "").trim();
  const re = TYPE_WORDS[type] || TYPE_WORDS.phys;
  return re.test(t) ? t.replace(re, "").replace(/^[\s,;.]+/, "") : t;
}

/**
 * Dice in a move's or a note's text (author, 2026-11-14): the text cut into pieces, every die a chip — a damage die (its
 * clause speaks of «шкод…» and doesn't heal) carries the clause's damage type and armour piercing, so it can hit the
 * selected tokens; any other die (healing, a count) is rolled to chat.
 * «раз за сцену обстрілює … і завдає 3d6 шкоди всім істотам у них» → [text, {dice:"3d6", damage:true, type:"phys"}, text]
 * @param {string} text
 * @returns {(string|{dice:string, label:string, damage:boolean, type:string, ignoreArmor:boolean, ignoreN:number})[]}
 */
export function diceInText(text) {
  const t = String(text ?? "");
  const out = [];
  const re = /(^|[^\p{L}\d])(\d*[dк]\d+(?:\s*[+\-]\s*\d+(?![dк]))?)(?![\p{L}\d])/giu;
  let last = 0, m;
  while ((m = re.exec(t))) {
    const at = m.index + m[1].length;
    const raw = m[2];
    if (at > last) out.push(t.slice(last, at));
    // the clause the die stands in: from the last «.;» before it to the next «.;» after it
    const from = Math.max(t.lastIndexOf(".", at), t.lastIndexOf(";", at)) + 1;
    const ends = [t.indexOf(".", at + raw.length), t.indexOf(";", at + raw.length)].filter((x) => x >= 0);
    let clause = t.slice(from, ends.length ? Math.min(...ends) : t.length);
    // «…1d6 шкоди від отрути щоразу… Ця шкода ігнорує броню.»: the next sentence speaks of this very damage
    const next = /^[.;]\s*(?:ця|ця\s+ж)\s+шкода\s+ігнору\S*\s+броню/i.exec(t.slice(from + clause.length));
    if (next) clause += next[0];
    // damage when «шкод…» follows the die closely (before a comma) or «завдає / отримує» stands right before it
    const after = t.slice(at + raw.length).split(/[,.;:(]/)[0];
    const before = t.slice(Math.max(from, at - 24), at);
    const damage = (/^\s*(?:\S+\s+){0,2}шкод/i.test(after) || /(?:завда\S*|отриму\S*)\s*$/i.test(before)) && !/відновлю|лікує|зцілю|повертає\s+\S*\s*оз/i.test(clause);
    const dice = raw.replace(/\s+/g, "").replace(/к/gi, "d").replace(/^d/i, "1d");
    // «1d6+3 шкоди радіацією»: the «+3» is the die's, not an extra part of radiation
    const near = /^\s*шкод/i.test(after) ? `${raw.replace(/\s*[+\-].*$/, "")} ${after}` : `${raw} ${after}`;
    out.push({ dice, label: raw, damage, type: atkType(near), ignoreArmor: atkIgnores(clause), ignoreN: atkIgnoreN(clause) });
    last = at + raw.length;
  }
  if (last < t.length) out.push(t.slice(last));
  return out;
}

/** «2d6kl1» → «менша з 2d6» (how the book says it); other dice as they are */
export function diceLabel(dice) {
  const m = /^(\d*d\d+)kl1([+\-]\d+)?$/i.exec(String(dice || "").replace(/\s+/g, ""));
  return m ? `менша з ${m[1]}${m[2] || ""}` : String(dice || "");
}

/**
 * The tracker's «−1» / «+1» by the quick dice: a number goes up or down (not below 0), dice get their modifier changed
 * («2d6» → «2d6+1», «2d6+1» −1 → «2d6»), an empty field becomes «1» / «0».
 * @param {string} expr @param {number} d +1 or −1
 */
export function bumpExpr(expr, d) {
  const v = String(expr || "").trim().replace(/\s+/g, "");
  if (/^\d+$/.test(v)) return String(Math.max(0, +v + d));
  const m = /^(.*\d*d\d+(?:kl1)?)([+\-]\d+)$/i.exec(v);
  if (m) { const n = +m[2] + d; return m[1] + (n ? (n > 0 ? "+" : "") + n : ""); }
  if (!v) return d > 0 ? "1" : "0";
  return v + (d > 0 ? "+1" : "-1");
}

/** What the GM typed as an attack's damage: «менша з 2d6» → «2d6kl1», «к6» → «1d6»; else trimmed */
export function normDice(input) {
  let s = String(input || "").trim().replace(/[кk](?=\d)/gi, "d").replace(/\s+/g, " ");
  const m = /^менш\S*\s+(?:з|із)\s+(\d*d\d+)\s*([+\-]\s*\d+)?$/i.exec(s);
  if (m) s = `${m[1]}kl1${(m[2] || "").replace(/\s+/g, "")}`;
  s = s.replace(/\s+/g, "");
  return /^d/i.test(s) ? `1${s}` : s;
}

const randIntWith = (rnd) => (min, max) => Math.floor(rnd() * (max - min + 1)) + min;

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
    healRad: /радіаці\S*\s+лікує/.test(t), // «радіація лікує» (HTML terminal) and the wiki's «шкода від радіації лікує»
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
  // the word «Психо» itself, not «Психометрія», «психологічний» (author, 2026-11-14)
  return ((e && e.moves) || []).findIndex((m) => m && (/психо(?![а-яіїєґʼ’'])/i.test(m.n || "") || /(ширя|вжива|коле)\S*\s+психо(?![а-яіїєґʼ’'])/i.test(m.t || "")));
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
    nonliving: flag("nonliving"),
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
 * @param {{ignoreArmor?:boolean, ignoreN?:number, partial?:boolean, dodge?:boolean, dice?:number, rollD6?:()=>number, rnd?:()=>number}} [opts]
 *   `dice` = number of damage dice (radiation heals a ghoul 1 HP per die); `rollD6` returns 1..6 for the electricity bonus
 * @returns {{final:number, heal?:number, steps:string[]}}  `steps` is the explanation shown in the log
 */
export function computeDamage(target, base, typeKey, opts = {}) {
  const r = computeDamageCore(normalizeTarget(target), base, typeKey, opts);
  if (!r.heal && r.final >= 1 && normalizeTarget(target).kamikaze) { r.final += 2; r.steps = [...r.steps, "+2 Камікадзе"]; }
  return r;
}

/**
 * Foundry's rule for halving (author, 2026-11-14), unlike the HTML tracker, which halved one after another: every «½» of a
 * hit — the type's defence (physical, fire, energy, radiation, poison, psychic) and «½ за часткового успіху», which now
 * works on every type — adds up; two halves (or more) take the whole damage, a half rounds up. Then the armour.
 */
function computeDamageCore(p, base, typeKey, opts) {
  const type = DMG_TYPES[typeKey] || DMG_TYPES.phys;
  const steps = [];
  let dmg = base;
  if (type.electric && p.electricVuln && !opts.noElectric) {
    const r = opts.rollD6 ? opts.rollD6() : randIntWith(opts.rnd || Math.random)(1, 6);
    dmg += r; steps.push(`+1d6 електрика [${r}]`);
  }
  const halves = [];
  const cut = () => {
    if (!halves.length) return;
    const share = Math.min(1, halves.length / 2);
    dmg = share >= 1 ? 0 : Math.ceil(dmg * (1 - share));
    steps.push(`${halves.length > 1 ? "½ + ½ (половини додаються)" : "½"} ${halves.join(", ")} → ${dmg}`);
  };
  // «½ шкоди» (author, 2026-11-16): half of the damage, rounded up, for any target — a partial avoidance (10–14), one's own
  // blast, «Погонич»…; one more «½» of the hit, so it adds up with the others (the wiki's glossary: halves add up)
  const partial = () => { if (opts.partial && p.halfPartial) halves.push("частковий успіх"); if (opts.dodge) halves.push("½ шкоди"); if (opts.avoid) halves.push("уникнення 10–14"); if (opts.half) halves.push(String(opts.half)); };
  if (type.special === "rad") {
    if (p.rad === "immune") return { final: 0, steps: ["невразливий до радіації"] };
    if (p.rad === "heal") { const h = Math.max(0, opts.dice || 0); return { final: 0, heal: h, steps: [`радіація лікує: +1 ОЗ за кожну кістку (${h})`] }; }
    if (p.rad === "half") halves.push("від радіації");
    partial(); cut();
    return { final: Math.max(0, dmg), steps };
  }
  if (type.special === "poison") {
    if (p.poison === "immune") return { final: 0, steps: ["невразливий до отрут"] };
    if (p.poison === "half") halves.push("від отрути");
    partial(); cut();
    return { final: Math.max(0, dmg), steps };
  }
  if (type.special === "psy") {
    if (p.psy === "immune") return { final: 0, steps: ["невразливий до психічної"] };
    if (p.psy === "half") halves.push("від психічної");
    partial(); cut();
    const pa = opts.ignoreArmor ? 0 : p.psyArmor;
    if (opts.ignoreArmor && p.psyArmor) steps.push("психічна броня ігнорується");
    if (pa) steps.push(`− психічна броня ${pa}`);
    return { final: Math.max(0, dmg - pa), steps };
  }
  if (typeKey === "fire" && p.fire === "immune") return { final: 0, steps: ["невразливий до вогню"] };
  if (type.energy && p.energy === "immune") return { final: 0, steps: [...steps, "невразливий до енергетичної зброї"] };
  if (p.phys === "immune") return { final: 0, steps: [...steps, "невразливий до фізичної"] };
  if (p.phys === "half") halves.push("від фізичної");
  if (typeKey === "fire" && p.fire === "half") halves.push("від вогню");
  if (type.energy && p.energy === "half") halves.push("від енергетичної");
  partial(); cut();
  let armor = p.armor;
  if (opts.ignoreArmor) { if (armor) steps.push("броня ігнорується"); armor = 0; }
  else if (type.ignore || opts.ignoreN) {
    const ig = Math.max(type.ignore || 0, +opts.ignoreN || 0), was = armor;
    armor = Math.max(0, armor - ig); if (was) steps.push(`броня ${was}−${Math.min(was, ig)}`);
  }
  if (armor) steps.push(`− броня ${armor}`);
  return { final: Math.max(0, dmg - armor), steps };
}

/** The tracker's damage type → the chat cards' one (they name the psychic type differently) */
export const chatType = (t) => (t === "psychic" ? "psi" : DMG_TYPES[t] ? t : "phys");
/** …and back (an unknown type is physical) */
export const battleType = (t) => (t === "psi" ? "psychic" : DMG_TYPES[t] ? t : "phys");

const diceIn = (l) => [...String(l ?? "").matchAll(/(\d*)d\d+/gi)].reduce((n, m) => n + Number(m[1] || 1), 0);
/**
 * «Зробити перевірку»'s damage parts ({l: label, v: value, t: chat type}) for resolveHit: every part with its type and dice
 * when there are several types; the dice count always (radiation that heals: +1 HP a die)
 */
export function applyParts(parts) {
  const list = (parts || []).map((p) => ({ total: Math.round(Number(p.v) || 0), type: p.t, dice: diceIn(p.l) }));
  const dice = list.reduce((n, p) => n + p.dice, 0);
  return new Set(list.map((p) => p.type)).size > 1 ? { parts: list, dice } : { dice };
}

/** The types that meet no physical armour and are counted on their own: radiation, poison, psychic */
const SPECIAL = new Set(["rad", "poison", "psychic"]);

/**
 * One hit on one target, as «Завдати цілям» / «Завдати шкоди» apply it (author, 2026-11-14): the tracker's computeDamage
 * for every part, then the HP.
 *   – a hit of several types («4d6[фізична] + 2d6[радіація]», a weapon's extra poison) splits: the radiation, poison and
 *     psychic parts each meet only their own defence (no physical armour); every other part adds up into one main part that
 *     meets the armour once;
 *   – Камікадзе: +2 once per hit, if at least 1 damage got through;
 *   – radiation that heals (ghouls): +1 HP a die of that part; healing and damage of one hit both count;
 *   – nothing below 0: the rolled total, every part, the damage, the healing; HP between 0 and the maximum.
 * @param {object} target  profile (see normalizeTarget)
 * @param {number} hp0 @param {number} max
 * @param {{total:number, type:string, dice?:number, ignoreArmor?:boolean, ignoreN?:number, poison?:number,
 *   parts?:{total:number, type:string, dice?:number}[]}} hit  types are keys of DMG_TYPES
 * @param {{partial?:boolean, dodge?:boolean, avoid?:boolean, rollD6?:()=>number, rnd?:()=>number}} [opts] `avoid`: a partial
 *   avoidance (10–14) of an enemy's hit (rules/dodge.mjs) — one more «½», adding up with «½ шкоди» of the menu (two take all)
 *   `half`: one more «½» named by its reason («Спрямована дія», П3 3.4: the perk's own blast or grenade on the thrower and allies)
 * @returns {{hp:number, damage:number, heal:number, steps:string[], out:boolean}}
 */
export function resolveHit(target, hp0, max, hit, opts = {}) {
  const p = normalizeTarget(target);
  const n0 = (v) => Math.max(0, Math.round(Number(v) || 0));
  // «Електромагнітна граната» (author, 2026-11-20; the wiki: «лише роботам та електроніці»): only the non-living and those
  // weak to electricity (robots, cyborgs, electronics) take it; its extra 1d6 is in the dice already, so no +1d6 on top
  if (hit.empOnly && !p.nonliving && !p.electricVuln) {
    return { hp: n0(hp0), damage: 0, heal: 0, steps: ["лише роботам та електроніці: живих не зачіпає"], out: false };
  }
  const type = DMG_TYPES[hit.type] ? hit.type : "phys";
  // the parts: given, or the whole total in its type; a weapon's poison on top
  let parts = Array.isArray(hit.parts) && hit.parts.length
    ? hit.parts.map((x) => ({ total: Math.round(Number(x.total) || 0), type: DMG_TYPES[x.type] ? x.type : type, dice: n0(x.dice) })) // a minus part («мод. −1») lowers the main part
    : [{ total: n0(hit.total), type, dice: n0(hit.dice) }];
  if (n0(hit.poison) > 0) parts.push({ total: n0(hit.poison), type: "poison", dice: 0 });
  // every ordinary part into one main part (armour once), in the hit's own type when it is ordinary
  const ordinary = parts.filter((x) => !SPECIAL.has(x.type));
  const special = parts.filter((x) => SPECIAL.has(x.type)).map((x) => ({ ...x, total: n0(x.total) }));
  const groups = [];
  if (ordinary.length) {
    const mainType = SPECIAL.has(type) ? ordinary[0].type : type;
    groups.push({ total: n0(ordinary.reduce((a, x) => a + x.total, 0)), type: mainType, dice: ordinary.reduce((a, x) => a + x.dice, 0) });
  }
  groups.push(...special);
  const several = groups.length > 1;
  const noKami = { ...p, kamikaze: false };
  let damage = 0, heal = 0;
  const steps = [];
  for (const g of groups) {
    const r = computeDamage(noKami, g.total, g.type, { ignoreArmor: !!hit.ignoreArmor, ignoreN: n0(hit.ignoreN), partial: !!opts.partial, dodge: !!opts.dodge, avoid: !!opts.avoid, half: opts.half ? String(opts.half) : "", dice: g.dice, rollD6: opts.rollD6, rnd: opts.rnd, noElectric: !!hit.empOnly });
    const h = n0(r.heal), f = n0(r.final);
    heal += h;
    if (!r.heal) damage += f;
    const name = (DMG_TYPES[g.type]?.n || "").split(" (")[0].toLowerCase();
    if (several) steps.push(`${name} ${g.total}${r.steps.length ? ": " + r.steps.join(", ") : ""} → ${r.heal ? `+${h} ОЗ` : f}`);
    else steps.push(...r.steps);
  }
  if (p.kamikaze && damage >= 1) { damage += 2; steps.push("+2 Камікадзе"); }
  const top = Math.max(n0(max), n0(hp0));
  const hp = Math.min(top, Math.max(0, n0(hp0) - damage + heal));
  return { hp, damage, heal, steps, out: hp === 0 && n0(hp0) > 0 };
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
  const t = String(text || "").toLowerCase().replace(/\+\s*\d*d?\d+\s+(?:шкод\S*\s+)?[^\s,;)]+/g, " ");
  if (/гаус/.test(t)) return "gauss";
  if (/плазм\S*\s+гранат|гранат\S*\s+плазм/.test(t)) return "phys"; // a plasma grenade is the exception: physical damage
  if (/плазм/.test(t)) return "plasma";
  if (/лазер/.test(t)) return "laser";
  if (/електр|імпульсн|тазер|ем[іi]-/.test(t)) return "electric";
  if (/кріо|морозн/.test(t)) return "cryo";
  if (/вогнемет|напалм|вогнян|запальн|молотова|струмін\S*\s+вогн|шкод\S*\s+вогнем|вогнем\s+\d/.test(t)) return "fire"; // «шкоди вогнем» too (author, 2026-11-14)
  if (/радіаційн|радіоактивн|гамма|шкод\S*\s+радіацією/.test(t)) return "rad";
  if (/отруйн|токсичн|шкод\S*\s+(?:отрутою|від\s+отрути)/.test(t)) return "poison";
  if (/психічн|пси[- ]/.test(t)) return "psychic";
  return "phys";
}

/** «ігнорує 2 броні», «ігнорує 1 фізичної броні» → 2 / 1 (armour the attack pierces); 0 if none. */
export function atkIgnoreN(text) {
  const m = /ігнору\S*\s+(\d+)\s+(?:фізичн\S*\s+)?брон/i.exec(String(text || ""));
  return m ? Math.min(20, +m[1]) : 0;
}

/** «ігнорує броню» of the whole attack (not of an extra «+3 радіацією (ігнорує броню)» part, nor the compendium's
 *  «+ 1d6 шкоди отрутою, …, отрута ігнорує броню»: that is the extra part's; author, 2026-11-19). */
export function atkIgnores(text) {
  return /ігнору\S*\s+броню/i.test(String(text || "")
    .replace(/\+\s*\d*d?\d+\s+[^\s,;()]+(\s*\([^)]*\))?/g, " ")
    .replace(/(?:отрута|радіація|кислота)\s+ігнору\S*\s+броню/gi, " "));
}

const EXTRA_TYPE = { "отрутою": "poison", "радіацією": "rad", "кислотою": "phys" };
/**
 * The extra part of an enemy's attack, written in its note (author, 2026-11-19): «фізичної шкоди + 1d6 шкоди отрутою, …»,
 * «+ 3 шкоди радіацією», «+ 3 шкоди кислотою». Poison and radiation are their own types (they meet no physical armour; the
 * enemy's poison works even when the armour stopped the physical part); acid is physical (it adds up with the main part).
 * @param {string} note @returns {{expr:string, type:string, label:string}|null} `type` a key of DMG_TYPES
 */
export function attackExtra(note) {
  // the compendium's «+ 1d6 шкоди отрутою» and the battle generator's «+1d6 отрутою» / «+3 радіацією»
  const m = /\+\s*(\d*d\d+|\d+)\s+(?:шкод\S*\s+)?(отрутою|радіацією|кислотою)/i.exec(String(note || ""));
  if (!m) return null;
  const word = m[2].toLowerCase();
  return { expr: m[1].toLowerCase(), type: EXTRA_TYPE[word], label: `${m[1].toLowerCase()} ${word}` };
}

/**
 * An enemy attack's hit from its rolled parts (author, 2026-11-19): the chat card's parts ({l, v, t}: chat types), the total
 * (the main part and the extra one) and what resolveHit needs (`parts` when the types differ, the dice count).
 * @param {{l:string, v:number, t:string, dice?:number}} main  @param {{l:string, v:number, t:string, dice?:number}|null} extra
 */
export function attackHit(main, extra = null) {
  const card = [main, ...(extra ? [extra] : [])].map((p) => ({ l: p.l, v: String(Math.max(0, Math.round(Number(p.v) || 0))), t: p.t }));
  const total = card.reduce((n, p) => n + Number(p.v), 0);
  const ap = applyParts(card);
  const dice = (main.dice ?? diceIn(main.l)) + (extra ? (extra.dice ?? diceIn(extra.l)) : 0);
  if (ap.parts) ap.parts.forEach((p, k) => { const src = k ? extra : main; if (src.dice !== undefined) p.dice = src.dice; });
  return { card, total, dice, ...(ap.parts ? { parts: ap.parts } : {}) };
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
  const m = /^(\d*d\d+(?:kl1)?)([+\-]\d+)?$/i.exec(String(dice).replace(/\s+/g, "")); if (!m) return dice; // «менша з 2d6» too
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
 *  Enemy structure from the battle DB
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
    Object.assign(at, lowerDice(at.dice, at.note));
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

/* ------------------------------------------------------------------ *
 *  Zones (Foundry Drawings: x, y, w, h in scene pixels)
 * ------------------------------------------------------------------ */

/** Zone sticker colours (key → Ukrainian label). */
export const ZONE_COLORS = { yellow: "Жовтий", blue: "Синій", green: "Зелений", red: "Червоний", purple: "Фіолетовий" };

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
