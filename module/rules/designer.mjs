/**
 * Конструктори (author, 2026-11-15): дизайнерські наркотики за правилами «Guns. Lots of Guns» (вікі «Дизайнерські
 * наркотики») і власні види на основі одного з п'яти. Чиста логіка, без Foundry: працює й у тестах.
 *
 *   recipeTotals(recipe)    → { price, ch, errors[], warnings[] }   ціна виробництва, шанс залежності, порушення правил
 *   recipeToDef(recipe)     → the rules engine's DRUGS-style def (st.customDrugs[].def, see registerCustomDrugs in core)
 *   recipeDescription(recipe) → the item's description text
 *   addEffect / addSide     → a copy of the recipe with an effect added (a «заміняє попередній» one takes its place)
 *   rollSide(n)             → a side effect of the 1d10 table (dirty brew)
 *   speciesDefaults(base)   → a custom species template; speciesToX(x) → what the sheet keeps (st.speciesX)
 *   speciesShort(x)         → the short text of a custom species
 */
import { AKEYS, ASHORT, DRUGS, PERK, PERKS, SPECIES, speciesNative } from "./core.mjs";

/**
 * A designer drug's recipe (the world item's `system.recipe`; the character carries a copy as st.customDrugs[].def).
 * @typedef {object} Recipe
 * @property {string} name
 * @property {Array<{k: string, attr?: string, perk?: string, price?: number, ch?: number}>} effects
 *   k is an id of EFFECTS; attr for «attr» (an attribute key, not UDCH); perk, price, ch for the perk effects
 * @property {Array<{k: string, attr?: string}>} sides  k is an id of SIDES; attr for the attribute penalties
 * @property {string} [note]
 */

/**
 * Effects table. price / ch: a number, or [min, max] the Доглядач agrees on (perk effects).
 * group: effects of one group replace each other («заміняє попередній»); max: how many times it can be added (for
 * different attributes).
 */
export const EFFECTS = [
  { k: "attr", n: "Бонус +1 до одного атрибута (крім УДЧ)", price: 1, ch: 3, attr: true, max: 3 },
  { k: "perkC", n: "Ефект бойового перка", price: [3, 5], ch: [2, 4], perk: "combat" },
  { k: "perkN", n: "Ефект небойового перка", price: [2, 4], ch: [1, 3], perk: "other" },
  { k: "stim", n: "Ефект стимпака", price: 2, ch: 1, group: "heal" },
  { k: "super", n: "Ефект суперстимпака (заміняє стимпак)", price: 3, ch: 2, group: "heal" },
  { k: "hp1", n: "Тимчасовий максимум ОЗ +1d6", price: 1, ch: 2, group: "hp", dice: 1 },
  { k: "hp2", n: "Тимчасовий максимум ОЗ +2d6 (заміняє попередній)", price: 3, ch: 3, group: "hp", dice: 2 },
  { k: "hp3", n: "Тимчасовий максимум ОЗ +3d6 (заміняє попередній)", price: 5, ch: 4, group: "hp", dice: 3 },
  { k: "dmg", n: "Вся завдана шкода +2", price: 3, ch: 5 },
  { k: "armor", n: "Фізична броня +1", price: 2, ch: 3 },
  { k: "psi", n: "Психічна броня +2", price: 2, ch: 3 },
  // «Зменшення шкоди від отрут чи радіації наполовину»: one of the two, each its own effect (author, 2026-11-15)
  { k: "halfPoison", n: "Отрути завдають половини шкоди", price: 2, ch: 2 },
  { k: "halfRad", n: "Радіація завдає половини шкоди", price: 2, ch: 2 },
  { k: "hydra", n: "Ефект «Гідри»", price: 5, ch: 2 },
  { k: "melange", n: "Ефект «Меланжевої кислоти»", price: 5, ch: 2 },
  { k: "adrenalin", n: "Ефект «Адреналіну»", price: 3, ch: 2 },
];
export const EFFECT = Object.fromEntries(EFFECTS.map((e) => [e.k, e]));

/** Side effects: `d` is the 1d10 index of the dirty-brew table. price / ch are added to the recipe (they are negative). */
export const SIDES = [
  { k: "chance", d: 1, n: "Підвищений шанс залежності", price: -2, ch: 1 },
  { k: "attrScene", d: 2, n: "Штраф −1 до одного атрибута (крім УДЧ) до кінця сцени", price: -2, ch: -1, attr: true, max: 3 },
  { k: "attrSession", d: 3, n: "Штраф −1 до одного атрибута (крім УДЧ) до кінця сесії", price: -3, ch: -2, attr: true, max: 3 },
  { k: "loss1", d: 4, n: "Миттєва втрата 1d6 ОЗ наприкінці сцени", price: -1, ch: -1, group: "loss", dice: 1 },
  { k: "loss2", d: 5, n: "Миттєва втрата 2d6 ОЗ наприкінці сцени (заміняє попередній)", price: -2, ch: -2, group: "loss", dice: 2 },
  { k: "loss3", d: 6, n: "Миттєва втрата 3d6 ОЗ наприкінці сцени (заміняє попередній)", price: -3, ch: -3, group: "loss", dice: 3 },
  { k: "berserk", d: 7, n: "Аспект «берсерк» до кінця сцени", price: -3, ch: -3 },
  { k: "consL", d: 8, n: "Легкий ментальний чи фізичний наслідок наприкінці сцени", price: -2, ch: -2, cons: "легкий" },
  { k: "consM", d: 9, n: "Середній ментальний чи фізичний наслідок наприкінці сцени", price: -4, ch: -3, cons: "середній" },
  { k: "consH", d: 10, n: "Тяжкий ментальний чи фізичний наслідок наприкінці сцени", price: -5, ch: -4, cons: "тяжкий" },
];
export const SIDE = Object.fromEntries(SIDES.map((s) => [s.k, s]));

const COMBAT_CATS = ["Бій на відстані", "Ближній бій", "Вибухівка", "Загальні бойові перки"];

/** «бойовий» or «небойовий»: by the perk's category (the psionic and all other categories count as non-combat) */
export const perkKind = (name) => (PERK[name] && COMBAT_CATS.includes(PERK[name].c) ? "combat" : "other");
/** A perk whose requirements include UDCH can't give its effect (the wiki) */
export const perkNeedsLuck = (name) => !!PERK[name]?.clauses?.some((cl) => cl.length === 1 && cl[0].t === "a" && cl[0].k === "UDCH");
/** Perks a designer drug can give an effect of, of the kind `kind` ("combat" | "other"; omit for all) */
export function designerPerks(kind) {
  return PERKS.filter((p) => !perkNeedsLuck(p.n) && (!kind || perkKind(p.n) === kind)).map((p) => p.n);
}

const ATTRS = AKEYS.filter((k) => k !== "UDCH");
const rangeOf = (v) => (Array.isArray(v) ? v : [v, v]);
const mid = (r) => Math.round((r[0] + r[1]) / 2);
const effectPrice = (e) => (EFFECT[e.k] ? (Array.isArray(EFFECT[e.k].price) ? (Number.isFinite(+e.price) && e.price != null ? +e.price : mid(EFFECT[e.k].price)) : EFFECT[e.k].price) : 0);
const effectCh = (e) => (EFFECT[e.k] ? (Array.isArray(EFFECT[e.k].ch) ? (Number.isFinite(+e.ch) && e.ch != null ? +e.ch : mid(EFFECT[e.k].ch)) : EFFECT[e.k].ch) : 0);

const cloneRecipe = (r) => ({ name: "", note: "", ...JSON.parse(JSON.stringify(r || {})), effects: JSON.parse(JSON.stringify(r?.effects || [])), sides: JSON.parse(JSON.stringify(r?.sides || [])) });

/** The recipe with `eff` added; an effect of the same group («заміняє попередній») is taken out first */
export function addEffect(recipe, eff) {
  const r = cloneRecipe(recipe);
  const def = EFFECT[eff.k];
  if (def?.group) r.effects = r.effects.filter((e) => EFFECT[e.k]?.group !== def.group);
  r.effects.push({ ...eff });
  return r;
}
/** The same for a side effect */
export function addSide(recipe, side) {
  const r = cloneRecipe(recipe);
  const def = SIDE[side.k];
  if (def?.group) r.sides = r.sides.filter((s) => SIDE[s.k]?.group !== def.group);
  r.sides.push({ ...side });
  return r;
}

/** A side effect of the dirty-brew table (1–10); `attr` is the attribute for a penalty (the Доглядач / the die picks it) */
export function rollSide(n, attr) {
  const s = SIDES.find((x) => x.d === n);
  if (!s) return null;
  return s.attr ? { k: s.k, attr: attr || undefined } : { k: s.k };
}

/**
 * Price and chance of a recipe, and what breaks the rules.
 * Price and chance are never below 1; a chance above 9 is an error (take an effect out or add a side effect).
 * @param {Recipe} recipe
 * @returns {{price: number, ch: number, rawPrice: number, rawCh: number, errors: string[], warnings: string[]}}
 */
export function recipeTotals(recipe) {
  const effects = recipe?.effects || [];
  const sides = recipe?.sides || [];
  const errors = [];
  const warnings = [];
  let rawPrice = 0;
  let rawCh = 0;
  const seen = new Set();
  const groups = {};
  const attrCount = {};

  const checkAttr = (item, label, kind) => {
    const key = `${kind}:`;
    if (!item.attr) return errors.push(`${label}: обери атрибут.`);
    if (item.attr === "UDCH") return errors.push(`${label}: атрибут УДЧ не підходить.`);
    if (!ATTRS.includes(item.attr)) return errors.push(`${label}: невідомий атрибут «${item.attr}».`);
    const sk = key + item.attr;
    if (seen.has(sk)) return errors.push(`${label}: атрибут ${ASHORT[item.attr]} уже вибрано — обери інший.`);
    seen.add(sk);
    attrCount[kind] = (attrCount[kind] || 0) + 1;
    return null;
  };

  effects.forEach((e) => {
    const def = EFFECT[e.k];
    if (!def) { errors.push(`Невідомий ефект «${e.k}».`); return; }
    rawPrice += effectPrice(e);
    rawCh += effectCh(e);
    if (def.attr) checkAttr(e, def.n, e.k);
    else {
      if (seen.has(e.k)) errors.push(`«${def.n}» можна додати лише раз.`);
      seen.add(e.k);
    }
    if (def.group) (groups[def.group] ||= []).push(def.n);
    if (def.perk) {
      if (!e.perk || !PERK[e.perk]) errors.push(`${def.n}: обери перк.`);
      else {
        if (perkNeedsLuck(e.perk)) errors.push(`${def.n}: перк «${e.perk}» вимагає УДЧ — його ефекту наркотик дати не може.`);
        if (perkKind(e.perk) !== def.perk) errors.push(`«${e.perk}» — ${perkKind(e.perk) === "combat" ? "бойовий" : "небойовий"} перк: візьми ефект ${perkKind(e.perk) === "combat" ? "бойового" : "небойового"} перка.`);
      }
      const pr = rangeOf(def.price);
      const cr = rangeOf(def.ch);
      if (e.price != null && (e.price < pr[0] || e.price > pr[1])) errors.push(`${def.n}: ціна виробництва має бути ${pr[0]}–${pr[1]}.`);
      if (e.ch != null && (e.ch < cr[0] || e.ch > cr[1])) errors.push(`${def.n}: шанс залежності має бути ${cr[0]}–${cr[1]}.`);
    }
  });
  Object.values(groups).forEach((list) => { if (list.length > 1) errors.push(`Ефекти «${list.join("» і «")}» замінюють один одного: лиши один.`); });
  if (attrCount.attr > 3) errors.push("Бонус до атрибутів можна додати не більше ніж для трьох різних атрибутів.");

  const sideGroups = {};
  sides.forEach((s) => {
    const def = SIDE[s.k];
    if (!def) { errors.push(`Невідомий побічний ефект «${s.k}».`); return; }
    rawPrice += def.price;
    rawCh += def.ch;
    if (def.attr) checkAttr(s, def.n, s.k);
    else {
      if (seen.has("side:" + s.k)) errors.push(`«${def.n}» можна додати лише раз.`);
      seen.add("side:" + s.k);
    }
    if (def.group) (sideGroups[def.group] ||= []).push(def.n);
  });
  Object.values(sideGroups).forEach((list) => { if (list.length > 1) errors.push(`Побічні ефекти «${list.join("» і «")}» замінюють один одного: лиши один.`); });
  ["attrScene", "attrSession"].forEach((k) => { if (attrCount[k] > 3) errors.push(`«${SIDE[k].n}» — не більше ніж для трьох різних атрибутів.`); });
  const hasCons = sides.some((s) => SIDE[s.k]?.cons);
  const strong = effects.filter((e) => e.k === "hydra" || e.k === "melange").map((e) => EFFECT[e.k].n);
  if (hasCons && strong.length) errors.push(`Наслідок наприкінці сцени не поєднується з ефектами «Гідри» та «Меланжевої кислоти» (тут: ${strong.join(", ")}).`);

  if (!effects.length) warnings.push("У наркотика немає жодного ефекту.");
  const price = Math.max(1, rawPrice);
  const ch = Math.max(1, rawCh);
  if (rawPrice < 1 && (effects.length || sides.length)) warnings.push(`Ціна виробництва вийшла ${rawPrice}: вона не може бути нижчою за 1.`);
  if (rawCh < 1 && (effects.length || sides.length)) warnings.push(`Шанс залежності вийшов ${rawCh}: він не може бути нижчим за 1.`);
  if (ch > 9) errors.push(`Шанс залежності ${ch} вищий за 9: прибери ефект або заміни його, або додай побічний ефект.`);
  return { price, ch, rawPrice, rawCh, errors, warnings };
}

const sgn = (v) => (v > 0 ? "+" : "−") + Math.abs(v);

/** The recipe in words: the mechanical effects, the reminders (texts the sheet can't apply), the side effects */
function pieces(recipe) {
  const effects = recipe?.effects || [];
  const sides = recipe?.sides || [];
  const attr = {};
  const sessionAttr = {};
  const info = [];
  const out = { heal: null, superHeal: false, hpDice: 0, endDice: 0, aspect: "", half: [] };
  const eff = { armor: 0, psi: 0, dmg: 0 };
  const lines = [];
  const sideLines = [];
  effects.forEach((e) => {
    const k = e.k;
    if (k === "attr" && e.attr) { attr[e.attr] = (attr[e.attr] || 0) + 1; lines.push(`${sgn(1)} ${ASHORT[e.attr]} до кінця сцени`); }
    else if (k === "perkC" || k === "perkN") {
      if (e.perk && PERK[e.perk]) { lines.push(`ефект перка «${e.perk}»`); info.push(`Ефект перка «${e.perk}» діє до кінця сцени: ${PERK[e.perk].d}`); }
    } else if (k === "stim") { out.heal = { base: 5, dec: 1 }; lines.push("ефект стимпака (відновлює 5 ОЗ)"); }
    else if (k === "super") { out.superHeal = true; lines.push("ефект суперстимпака (1d6 + 4 ОЗ, відкладена 1d6 шкоди)"); }
    else if (EFFECT[k]?.dice && k.startsWith("hp")) { out.hpDice = EFFECT[k].dice; lines.push(`тимчасовий максимум ОЗ +${EFFECT[k].dice}d6 до кінця сцени`); }
    else if (k === "dmg") { eff.dmg = 2; lines.push("вся шкода, яку завдає персонаж, +2"); }
    else if (k === "armor") { eff.armor = 1; lines.push("фізична броня +1"); }
    else if (k === "psi") { eff.psi = 2; lines.push("психічна броня +2"); }
    else if (k === "halfPoison") { out.half.push("poison"); lines.push("отрути завдають лише половини шкоди"); }
    else if (k === "halfRad") { out.half.push("rad"); lines.push("радіація завдає лише половини шкоди"); }
    else if (k === "hydra" || k === "melange" || k === "adrenalin") {
      const name = { hydra: "Гідра", melange: "Меланжева кислота", adrenalin: "Адреналін" }[k];
      lines.push(`ефект «${name === "Гідра" ? "Гідри" : name === "Адреналін" ? "Адреналіну" : "Меланжевої кислоти"}»`);
      if (DRUGS[name]?.info) info.push(`Ефект «${name}»: ${DRUGS[name].info}`);
    }
  });
  sides.forEach((s) => {
    const def = SIDE[s.k];
    if (!def) return;
    if (s.k === "chance") sideLines.push("підвищений шанс залежності");
    else if (s.k === "attrScene" && s.attr) { attr[s.attr] = (attr[s.attr] || 0) - 1; sideLines.push(`−1 ${ASHORT[s.attr]} до кінця сцени`); }
    else if (s.k === "attrSession" && s.attr) { sessionAttr[s.attr] = -1; sideLines.push(`−1 ${ASHORT[s.attr]} до кінця сесії`); }
    else if (def.group === "loss") { out.endDice = def.dice; sideLines.push(`наприкінці сцени втрата ${def.dice}d6 ОЗ (броня не рахується)`); }
    else if (s.k === "berserk") { out.aspect = "берсерк"; sideLines.push("аспект «берсерк» до кінця сцени (підвищена агресія, схильність до необдуманого ризику, можливі атаки на союзників)"); }
    else if (def.cons) { sideLines.push(`наприкінці сцени ${def.cons} ментальний чи фізичний наслідок`); info.push(`Наприкінці сцени ти отримуєш ${def.cons} ментальний чи фізичний наслідок (його тип обирає Доглядач).`); }
  });
  Object.keys(attr).forEach((k) => { if (!attr[k]) delete attr[k]; });
  return { attr, sessionAttr, eff, out, info, lines, sideLines };
}

/**
 * The recipe as the rules engine's drug (see DRUGS in core.mjs and useItem in logic.mjs):
 * ch, heal / superHeal, eff {attr, armor, psi, dmg, half, t}, hpDice, endDice, sessionAttr, aspect, info, d, price.
 * @param {Recipe} recipe
 */
export function recipeToDef(recipe) {
  const P = pieces(recipe);
  const T = recipeTotals(recipe);
  const def = { ch: Math.min(9, T.ch), drug: true, price: T.price };
  if (P.out.heal) def.heal = P.out.heal;
  if (P.out.superHeal) def.superHeal = true;
  const eff = {};
  if (Object.keys(P.attr).length) eff.attr = P.attr;
  if (P.eff.armor) eff.armor = P.eff.armor;
  if (P.eff.psi) eff.psi = P.eff.psi;
  if (P.eff.dmg) eff.dmg = P.eff.dmg;
  if (P.out.half.length) eff.half = [...P.out.half];
  if (Object.keys(eff).length) {
    const t = [];
    Object.keys(P.attr).forEach((k) => t.push(`${sgn(P.attr[k])} ${ASHORT[k]}`));
    if (eff.armor) t.push(`${sgn(eff.armor)} фізичної броні`);
    if (eff.psi) t.push(`${sgn(eff.psi)} психічної броні`);
    if (eff.dmg) t.push(`${sgn(eff.dmg)} шкоди будь-якою зброєю`);
    if (eff.half) t.push(eff.half.length > 1 ? "отрути й радіація завдають лише половини шкоди" : eff.half[0] === "rad" ? "радіація завдає лише половини шкоди" : "отрути завдають лише половини шкоди");
    eff.t = t.join(", ");
    def.eff = eff;
  }
  if (P.out.hpDice) def.hpDice = P.out.hpDice;
  if (P.out.endDice) def.endDice = P.out.endDice;
  if (Object.keys(P.sessionAttr).length) def.sessionAttr = P.sessionAttr;
  if (P.out.aspect) def.aspect = P.out.aspect;
  if (P.info.length) def.info = P.info.join(" ");
  def.d = recipeDescription(recipe);
  return def;
}

/**
 * The item description: effects, side effects, price and chance.
 * @param {Recipe} recipe
 */
export function recipeDescription(recipe) {
  const P = pieces(recipe);
  const T = recipeTotals(recipe);
  const parts = ["Дизайнерський наркотик. Діє 1 сцену."];
  if (P.lines.length) parts.push("Ефекти: " + P.lines.join("; ") + ".");
  if (P.sideLines.length) parts.push("Побічні ефекти: " + P.sideLines.join("; ") + ".");
  parts.push(`Ціна виробництва ${T.price} (к), шанс залежності ${T.ch} (d10 ≤ ${T.ch}).`);
  if (recipe?.note) parts.push(String(recipe.note));
  return parts.join(" ");
}

/* ============================== власні види ============================== */

/** A custom species' template from a base species: the base's limits and texts copied, the extras empty */
export function speciesDefaults(base) {
  const b = SPECIES[base] ? base : "human";
  const sp = SPECIES[b];
  return {
    n: "", base: b,
    b: JSON.parse(JSON.stringify(sp.b)),
    // the base's own values (author, 2026-11-15): a custom species shows and replaces them
    ...speciesNative(b),
    props: sp.props.slice(),
    short: sp.short,
  };
}

const DEF_WORDS = { rad: "радіація", poison: "отрути", psy: "психічна шкода" };
const DEF_LEVEL = { half: "½ шкоди", immune: "імунітет", heal: "лікує" };

/** The short text of a custom species, in the style of the book's: «Назва: властивість; …» */
export function speciesShort(x) {
  const n = String(x?.n || "").trim() || "Власний вид";
  const bits = [];
  (x?.props || []).forEach((p) => {
    const s = String(p || "").trim();
    if (!s) return;
    const title = s.includes(":") ? s.slice(0, s.indexOf(":")) : s.replace(/\.$/, "");
    bits.push(title.charAt(0).toLowerCase() + title.slice(1));
  });
  // the parameters are the species' own values; only those that differ from the base are told (its texts tell the rest)
  const nat = speciesNative(SPECIES[x?.base] ? x.base : "human");
  const num = (v) => parseInt(v, 10) || 0;
  const hp = num(x?.hp), armor = num(x?.armor), perk = num(x?.perk), skill = num(x?.skill);
  if (hp !== nat.hp) bits.push(hp ? `${hp > 0 ? "+" : "−"}${Math.abs(hp)} ОЗ` : "без додаткових ОЗ");
  if (armor !== nat.armor) bits.push(armor ? `броня ${armor}` : "без природної броні");
  ["rad", "poison", "psy"].forEach((k) => {
    const v = x?.def?.[k] || "normal";
    if (v !== nat.def[k]) bits.push(`${DEF_WORDS[k]}: ${DEF_LEVEL[v] ?? "звичайна шкода"}`);
  });
  if (perk !== nat.perk) bits.push(perk ? `додаткових перків на старті: ${perk}` : "без додаткового перка");
  if (skill !== nat.skill) bits.push(skill ? `додаткових навичок учня на старті: ${skill}` : "без додаткової навички");
  return `${n}: ${bits.join("; ")}.`;
}

/**
 * A custom species as the sheet keeps it (st.speciesX), or null when it has no name or no known base.
 * Numbers are whole, the defences are known words (the usual «normal» is left out), the limits are [min, start, max].
 */
export function speciesToX(x) {
  if (!x || typeof x !== "object" || !SPECIES[x.base]) return null;
  const n = String(x.n || "").trim();
  if (!n) return null;
  const int = (v) => (Number.isFinite(+v) ? Math.round(+v) : 0);
  const b = {};
  AKEYS.forEach((k) => {
    const r = x.b && x.b[k];
    if (Array.isArray(r) && r.length === 3 && r.every((v) => Number.isFinite(+v))) b[k] = r.map((v) => Math.round(+v));
  });
  const def = {};
  for (const k of ["rad", "poison", "psy"]) {
    // the species' own level (author, 2026-11-15): «normal» is kept too, it replaces the base's (a ghoul without its heal)
    const v = x.def && x.def[k];
    def[k] = v === "half" || v === "immune" || (k === "rad" && v === "heal") ? v : "normal";
  }
  const out = {
    n, base: x.base, b, hp: int(x.hp), armor: int(x.armor), def, perk: int(x.perk), skill: int(x.skill),
    props: (Array.isArray(x.props) ? x.props : []).map((p) => String(p || "").trim()).filter(Boolean),
    short: String(x.short || "").trim(),
  };
  // the base's own short text (what a template starts with) isn't this species' text: build it
  if (!out.short || out.short === SPECIES[x.base].short) out.short = speciesShort(out);
  return out;
}
