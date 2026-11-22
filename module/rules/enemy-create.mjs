/**
 * «Новий супротивник» (author, 2026-11-14): the creation form of Foundry's «Create Actor» → enemy, a port of the battle
 * tracker's «свій супротивник» (tracker.js customFormHtml / buildCustomEnemy). Pure helpers, no Foundry globals
 * (tests/enemy-create.test.mjs): the form's state, filling it from an existing enemy's system data («за основу»),
 * checking it and building the actor's `system` (enemy-model.mjs `toSystem`).
 *
 * Form = { name, img, cat, hp, armor, psiArmor, armorText, armor0, def:{phys…psy}, flags:{electricVuln…psyVuln},
 *          attacks:[{n, note, d, type, ammo, ignoreN0, ignoreArmor0, note0}], moves:[{n, t}], aspects:[{t, inv}], notes }
 * An attack's `type` is "" for «авто» (read from the name and the note, as the generator does).
 */
import * as B from "./battle.mjs";
import { toSystem, bookCopy, normCat, CATS } from "./enemy-model.mjs";
import { enemyNonliving } from "./states.mjs";

export const DEF_SELECTS = ["phys", "energy", "fire", "rad", "poison", "psy"];
/** The tick boxes of the defence block: [key, label] (the tracker's, plus «вразливий до пси») */
export const FLAG_LIST = [...B.DEF_FIELDS.filter((f) => f[2] === "chk").map((f) => [f[0], f[1]]), ["psyVuln", "Вразливий до психічної шкоди"]];
const FLAG_KEYS = FLAG_LIST.map((f) => f[0]);

/**
 * «Неживий» in the form (author, 2026-11-22; 4.1): the data keeps null for «by the book's name» (states.mjs enemyNonliving), so the
 * form keeps three states too — `flags.nonliving` is null until the GM touches the tick, then true / false. The tick shows the
 * value the enemy will have: the GM's, else the one read from the base's book name and the form's name.
 */
export function nonlivingShown(form, baseName = "") {
  return enemyNonliving(form.flags?.nonliving ?? null, [str(baseName), str(form.name).trim()].filter(Boolean), { def: form.def });
}

const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const str = (v) => String(v ?? "");

/** A row of the attacks list */
export function attackRow(p = {}) {
  const note = str(p.note);
  return {
    n: str(p.n), note, d: str(p.d), type: str(p.type), ammo: Math.max(0, int(p.ammo)),
    ignoreN0: Math.max(0, int(p.ignoreN0)), ignoreArmor0: !!p.ignoreArmor0, note0: p.note0 ?? null,
  };
}

/** An attack row from a preset of `buildAttackPresets` ({n, note, d}); the charges are read from its text */
export function attackFromPreset(p) {
  return attackRow({ n: p.n, note: p.note, d: p.d, ammo: B.atkAmmoEx(`${p.n} ${p.note}`) });
}

/** The first hint values for a category: the middle of the HP guide, the lowest armour */
export function catDefaults(cat) {
  const g = B.CAT_GUIDE[normCat(cat)] ?? B.CAT_GUIDE.regular;
  return { hp: g.hp[Math.floor((g.hp.length - 1) / 2)], armor: g.armor[0] };
}

/** An empty form (the tracker's `customBlank`) */
export function blankForm(name = "") {
  return {
    name: str(name), img: "", cat: "regular", hp: 6, armor: 1, psiArmor: 0, armorText: "", armor0: null,
    def: Object.fromEntries(DEF_SELECTS.map((k) => [k, "normal"])),
    flags: { ...Object.fromEntries(FLAG_KEYS.map((k) => [k, false])), nonliving: null },
    attacks: [attackRow({ n: "Легка зброя ближнього бою", d: "1d6" })], moves: [], aspects: [], notes: "",
  };
}

/** The form filled from an enemy's `system` (a compendium or world enemy), «за основу» */
export function formFromSystem(sys, { name = "", img = "" } = {}) {
  const f = blankForm(name);
  f.img = str(img);
  f.cat = normCat(sys.cat);
  f.hp = Math.max(1, int(sys.hp?.max, 1));
  f.armor = Math.max(0, int(sys.armor));
  f.psiArmor = Math.max(0, int(sys.psiArmor));
  f.armorText = str(sys.armorText); f.armor0 = f.armor;
  DEF_SELECTS.forEach((k) => { f.def[k] = sys.def?.[k] || "normal"; });
  FLAG_KEYS.forEach((k) => { f.flags[k] = !!sys.flags?.[k]; });
  f.flags.nonliving = typeof sys.flags?.nonliving === "boolean" ? sys.flags.nonliving : null; // never `!!`: null is «by the book»
  f.attacks = (sys.attacks ?? []).map((a) => attackRow({
    n: a.name, note: a.note, d: B.diceLabel(a.dice), type: a.type, ammo: a.ammoMax, ignoreN0: a.ignoreN, ignoreArmor0: a.ignoreArmor, note0: str(a.note),
  }));
  f.moves = (sys.moves ?? []).map((m) => ({ n: str(m.n), t: str(m.t) }));
  f.aspects = (sys.baseAspects ?? []).map((a) => ({ t: str(a.t), inv: Math.max(0, int(a.inv)) }));
  f.notes = str(sys.notes);
  return f;
}

/** Is the dice text of a row acceptable («1d10», «2d6+2», «менша з 2d6», «к6»)? Empty counts as fine until the attack is used. */
export function diceOk(text) {
  const t = str(text).trim();
  if (!t) return true;
  return B.DICE_RE.test(B.lowerDice(B.normDice(t), "").dice);
}

/**
 * Check the form and build what the actor is made from.
 * @param {string} [baseName] the name of the enemy the form was filled from («за основу»), for «Неживий» by the book
 * @returns {{err:string}|{name:string, img:string, system:object}}
 */
export function buildEnemy(form, { baseName = "" } = {}) {
  const name = str(form.name).trim();
  if (!name) return { err: "Дай супротивникові назву" };
  const rows = (form.attacks ?? []).filter((a) => str(a.n).trim() || str(a.d).trim());
  const attacks = [];
  for (const a of rows) {
    const ld = B.lowerDice(B.normDice(a.d), str(a.note));
    if (!B.DICE_RE.test(ld.dice)) return { err: `Шкода атаки «${str(a.n).trim() || "без назви"}»: вкажи кістки, напр. 1d10, 2d6+2 чи «менша з 2d6»` };
    const n = str(a.n).trim() || "Атака";
    const text = `${n} ${ld.note}`;
    const same = a.note0 != null && str(a.note0) === str(a.note); // the note is the one the attack was loaded with: its armour piercing stays as loaded; a typed or edited note is read for it
    const ignoreN = same ? Math.max(0, int(a.ignoreN0)) : B.atkIgnoreN(text);
    const ignoreArmor = same ? !!a.ignoreArmor0 : B.atkIgnores(text);
    attacks.push({
      name: n, dice: ld.dice, note: ld.note.trim(), type: B.DMG_TYPES[a.type] ? a.type : B.atkType(text),
      ammoMax: Math.max(0, Math.min(20, int(a.ammo))), ignoreN, ignoreArmor,
    });
  }
  const moves = (form.moves ?? []).filter((m) => str(m.n).trim() || str(m.t).trim()).map((m) => ({ n: str(m.n).trim() || "Хід", t: str(m.t).trim() }));
  const aspects = (form.aspects ?? []).filter((a) => str(a.t).trim()).map((a) => ({ t: str(a.t).trim(), inv: Math.max(0, Math.min(9, int(a.inv))) }));
  const cat = CATS.includes(form.cat) ? form.cat : "regular";
  const hp = Math.min(999, Math.max(1, int(form.hp, 1))), armor = Math.max(0, int(form.armor)); // HP ≤ 999 as on the card
  const armorText = form.armorText && form.armor0 === armor ? str(form.armorText) : "";
  const parsed = { name, cat, hp, armor, armorText: armorText || String(armor), attacks, aspects: aspects.map((a) => a.t), moves, notes: str(form.notes).trim() };
  const system = toSystem(parsed);
  // the form's choices win over what the notes' words would suggest
  system.armor = armor; system.psiArmor = Math.max(0, int(form.psiArmor)); system.armorText = armorText;
  DEF_SELECTS.forEach((k) => { system.def[k] = form.def?.[k] || "normal"; });
  FLAG_KEYS.forEach((k) => { system.flags[k] = !!form.flags?.[k]; });
  // «Неживий»: the GM's tick as it is; untouched, null when the new name alone gives the same, else the shown value written down
  // (a robot taken «за основу» and renamed would lose its book name)
  const shown = nonlivingShown(form, baseName);
  const own = form.flags?.nonliving;
  system.flags.nonliving = typeof own === "boolean" ? own : (enemyNonliving(null, [name], system) === shown ? null : shown);
  system.baseAspects = aspects;
  system.orig = bookCopy(system);
  return { name, img: str(form.img), system };
}
