/**
 * Damage types for the damage block of «Зробити перевірку» and its chat card (Foundry only, author 2026-11-14):
 * every type has its colour (dice face, numbers) and a small chip.
 *   phys — іржавий, laser — червоний, plasma — зелений, gauss — синій, electric — жовтий, fire — оранжевий,
 *   psi — фіолетовий, poison — темно-зелений, rad — зелений з підсвіткою, cryo — крижаний.
 * The type comes from the weapon's energy (Тип у Мотлосі), a psi weapon, or the words in its name and note.
 */

export const DMG_TYPES = {
  phys: "фізична",
  laser: "лазерна",
  plasma: "плазмова",
  gauss: "гаус",
  electric: "електрика",
  fire: "вогонь",
  cryo: "кріо",
  psi: "пси",
  poison: "отрута",
  rad: "радіація",
};

/** Words in a name or note, checked in this order (radiation and energy before fire: «плазмова граната» is plasma) */
const WORDS = [
  ["rad", /радіац|радіоакт|ядерн|атомн|nuka|ядро/],
  ["plasma", /плазм/],
  ["laser", /лазер/],
  ["gauss", /гаус/],
  ["electric", /електр|імпульс|шокер|тесл|струм|емі\b|emp/],
  ["cryo", /кріо|холод|мороз|крижан/],
  ["fire", /вогн|вогон|підпал|напалм|молотов|запальн|полум|термит/],
  ["poison", /отрут|токсин|кислот/],
];

const lower = (s) => String(s ?? "").toLowerCase();

/** A label of a damage term («4d6[фізична] + 2d6[радіація]», as in the compendiums) → its type */
export function labelType(label) {
  const l = lower(label);
  if (/фіз/.test(l)) return "phys";
  for (const [type, re] of WORDS) if (re.test(l)) return type;
  if (/пси|психічн/.test(l)) return "psi";
  for (const [k, n] of Object.entries(DMG_TYPES)) if (l === n) return k;
  return null;
}

/**
 * Weapons of the catalogue (the sheet's «довідник», with «Зброя, багато зброї») whose type the words in their name and note
 * would get wrong (checked by the author's request, 2026-11-14). The key is the name in lower case.
 */
export const CATALOG_TYPES = {
  "голкостріл": "phys", // needles that may carry a poison: the damage itself is physical
  "сонячний підпалювач": "laser", // an energy weapon that ignores 1 armour, like a laser
  "термічний спис": "fire",
  "тактичний ядерний гранатомет «товстун»": "phys", // 4d6 physical + 2d6 radiation (the radiation part comes from the note)
  "тактичний ядерний гранатомет “товстун”": "phys",
  "міні-ядерний заряд": "phys",
};
const catalogType = (name) => {
  const n = lower(name).replace(/\s*\([^)]*\)\s*$/, "").trim(); // «Голкостріл (легкий)» → «голкостріл»
  return CATALOG_TYPES[n] || null;
};

/** Types a weapon row can be set to in «Тип» besides the energy versions (they change only the colour, not the rules) */
export const EXTRA_TYPES = ["fire", "psi", "poison", "rad"];

/** The damage type of a damage choice of the HTML sheet ({w} — a weapon, {o} — a grenade from «Інший мотлох», or unarmed) */
export function weaponDmgType(c) {
  if (!c) return "phys";
  const w = c.w;
  // chosen in «Тип» (Foundry only), or known for this catalogue weapon
  if (w?.dt && DMG_TYPES[w.dt]) return w.dt;
  const known = catalogType(w ? w.n : c.o?.n);
  if (known && !(w?.en && DMG_TYPES[w.en])) return known;
  // types written in the damage field («1d10[отрута]+2d6[пси]»): the first one is the weapon's main type
  const lab = /\[([^\]]+)\]/.exec(String(w?.d || ""));
  if (lab && !(w?.en && DMG_TYPES[w.en]) && labelType(lab[1])) return labelType(lab[1]);
  // «частина шкоди (2d6) — радіацією» is a part of the damage, not the weapon's type
  const text = lower(w ? `${w.n} ${w.note || ""}` : c.o ? `${c.o.n} ${c.o.note || ""}` : "").replace(/частина шкоди[^.;]*/g, "");
  // a psi power, or «пси» / «психічна» in the name or note (author, 2026-11-14); one that burns, shocks or freezes deals that damage
  const psiOf = () => (/вогон|вогн/.test(text) ? "fire" : /електр/.test(text) ? "electric" : /холод/.test(text) ? "cryo" : "psi");
  if (w?.auto === "psi") return psiOf();
  if (w?.en && DMG_TYPES[w.en]) return w.en;
  // the exception: «Плазмова граната» deals physical damage (author, 2026-11-14)
  if (/плазмов[а-яіїєґ']*\s+гранат/.test(text)) return "phys";
  if (/(^|[^а-яіїєґa-z'])пси($|[^а-яіїєґa-z'])|психічн/.test(text)) return psiOf();
  for (const [type, re] of WORDS) if (re.test(text)) return type;
  return "phys";
}

/** The type of one part of the damage total (dmgTotal's parts): the robot bonus is electric, the rest is the weapon's */
export function partType(label, weaponType) {
  if (/^Електрична/.test(label)) return "electric";
  return weaponType;
}

/** Small chips naming the types, in the order given, each once */
export function typeChips(types) {
  return [...new Set(types)].map((t) => `<span class="dtchip dt-${t}">${DMG_TYPES[t] || t}</span>`).join("");
}

/**
 * Which of the weapon's traits (the HTML sheet's weaponTraits) are effects of the damage itself — shown big over the breakdown:
 * armour ignored, cryo freeze, psychic damage, the whole zone, Розпад. Range, rate of fire and modifications are not.
 */
export const isDamageEffect = (t) => /ігнору|Кріо|заморо|Психічна шкода|зон[іиу]|Розпад/i.test(t) && !/^Дальність|^Модифікації/.test(t);

/** What each damage type does on its own (shown over the breakdown, one line per type in the damage) */
export const TYPE_EFFECTS = {
  laser: "Лазерна шкода: ігнорує 1 фізичної броні.",
  plasma: "Плазмова шкода: ігнорує 2 фізичної броні.",
  gauss: "Гаус: ігнорує 3 фізичної броні.",
  electric: "Електрика: +1d6 шкоди роботам та електроніці.",
  cryo: "Кріо: на критичному успіху замість шкоди можна заморозити ціль.",
  psi: "Психічна шкода: ігнорує фізичну броню, діє лише на живих істот.",
  poison: "Отрута ігнорує фізичну броню.",
  rad: "Радіація ігнорує фізичну броню.",
};

/**
 * The damage effects to show, all of them one after another (author, 2026-11-14): the sheet's own (weaponTraits, filtered),
 * armour ignoring written in the weapon's NAME («Пилоніж (ігнорує 1 броні)» — the HTML sheet reads it only from the note),
 * then one line for every damage type in the damage (`types`: the types of its terms, «1d10[отрута]+2d6[пси]» — two).
 * The weapon's energy version is already counted by the sheet's own traits, so it adds no line of its own.
 */
export function damageEffects(traits, c, types) {
  const fx = (traits || []).filter(isDamageEffect);
  const name = lower(c?.w?.n || c?.o?.n || "");
  const m = /ігнору[а-яіїєґ]*\s+(\d+|всю)\s+(?:фізичн[а-яіїєґ]*\s+)?брон/.exec(name);
  if (m && !fx.some((t) => /ігнору/i.test(t))) fx.unshift(m[1] === "всю" ? "Повністю ігнорує фізичну броню супротивника." : `Ігнорує ${m[1]} фізичної броні супротивника.`);
  const en = c?.w?.en || "";
  for (const t of new Set(types?.length ? types : [weaponDmgType(c)])) {
    const line = TYPE_EFFECTS[t];
    if (!line) continue;
    if (t === en && ["laser", "plasma", "gauss", "cryo"].includes(t)) continue;
    // the weapon's own laser / plasma / gauss whose armour ignoring is already in its traits: no second line
    if (["laser", "plasma", "gauss"].includes(t) && t === weaponDmgType(c) && fx.some((x) => /ігнору/i.test(x))) continue;
    if (t === "psi" && fx.some((x) => /Психічна шкода/.test(x))) continue;
    if (t === "cryo" && fx.some((x) => /^Кріо/.test(x))) continue;
    fx.push(line);
  }
  return fx;
}

/** The HTML sheet's attackMode (not exported by the rules engine) */
export const attackMode = (skill, attr) => (skill === "Техніка" ? "explosive" : skill === "Герць" ? "melee" : skill === "Стрільба" ? "ranged" : attr === "SL" ? "melee" : "ranged");

/**
 * The type of every term of the damage (p.terms): its label in the damage string («2d6[радіація]»), or the weapon's note
 * («частина шкоди (2d6) — радіацією»), otherwise the weapon's type.
 */
export function termTypes(c, p, main) {
  const terms = p?.terms || [];
  const note = lower(c?.w?.note || c?.o?.note || "");
  const part = /частина шкоди\s*\((\d*)d(\d+)\)\s*—\s*([а-яіїєґ]+)/.exec(note);
  let partDone = false;
  return terms.map((t) => {
    const lt = t.t ? labelType(t.t) : null;
    if (lt) return lt;
    if (part && !partDone && t.n === (+part[1] || 1) && t.s === +part[2] && terms.indexOf(t) > 0) {
      partDone = true;
      return labelType(part[3]) || main;
    }
    return main;
  });
}

/** The type of every die in rolling order (as dieSides) */
export function dieTypes(c, p, main) {
  if (!p || p.low) return [main, main];
  const tt = termTypes(c, p, main);
  return (p.terms || []).flatMap((t, i) => Array.from({ length: t.n }, () => tt[i]));
}

/**
 * Split the weapon dice part of the total («4d6+2d6: 17») into its terms when they deal different types
 * («4d6: 12», «2d6: 5» radiation). `vals` are the counted roll's dice in rolling order.
 */
export function splitDiceParts(parts, c, p, main, vals) {
  if (!p || p.low || !(p.terms || []).length || !vals?.length) return parts;
  const tt = termTypes(c, p, main);
  if (new Set(tt).size < 2) return parts;
  let k = 0;
  const pieces = p.terms.map((t, i) => {
    const v = vals.slice(k, k + t.n).reduce((a, b) => a + b, 0);
    k += t.n;
    return { l: `${t.n}d${t.s}`, v: String(v), t: tt[i] };
  });
  const [first, ...rest] = parts;
  return [...pieces, ...rest];
}

/** Sides of each rolled die, in the order rollDice rolls them (one entry per die of every term) */
export function dieSides(p) {
  if (!p) return [];
  if (p.low) return [6, 6];
  return (p.terms || []).flatMap((t) => Array.from({ length: t.n }, () => t.s));
}
