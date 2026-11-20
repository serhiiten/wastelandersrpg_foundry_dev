/**
 * The enemy's data in Foundry (author, 2026-11-14) — pure helpers between the battle tracker's rules (battle.mjs) and
 * the actor's `system` (module/data/enemy-data.mjs). No Foundry globals: tests can run it in Node.
 *
 * system = {
 *   v: ENEMY_V,                         // the data's version; an actor without it still has the old shape
 *   cat: statists|regular|elite|boss,
 *   hp: {value, max}, armor, psiArmor, armorText,      // armorText: the book's line, «3 (рейнджерська броня)»
 *   def: {phys, energy, fire, rad, poison, psy},        // normal | half | immune (rad: also heal)
 *   flags: {electricVuln, halfPartial, noKnockdown, noStun, noDisarm, kamikaze, psyVuln},
 *   attacks: [{name, dice, type, note, ammoMax, ammo, ignoreN, ignoreArmor}],
 *   baseAspects: [{t, inv}], aspects: [{t, inv}],       // the book's aspects / situational ones (inv: free invokes)
 *   moves: [{n, t, used}], notes, reveal, orig, description
 * }
 * `orig` keeps the book's version (attacks, aspects, moves, notes, defence) for «Як у книзі».
 */
import * as B from "./battle.mjs";
import { moveBonus, moveMarks } from "./move-spec.mjs";

export const ENEMY_V = 1;
export const CATS = ["statists", "regular", "elite", "boss"];
const CAT_ALIAS = { ordinary: "regular", statist: "statists", statistician: "statists", statists: "statists", regular: "regular", elite: "elite", boss: "boss" };
export const normCat = (c) => CAT_ALIAS[String(c || "").toLowerCase()] ?? "regular";
const DEF_KEYS = ["phys", "energy", "fire", "rad", "poison", "psy"];
const FLAG_KEYS = ["electricVuln", "halfPartial", "noKnockdown", "noStun", "noDisarm", "kamikaze", "psyVuln"];
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

/** The book's defence of a parsed enemy, split into def / flags / armour */
function defenceOf(parsed) {
  const p = B.enemyBase({ armor: parsed.armorText ?? String(parsed.armor ?? 0), notes: parsed.notes ?? "" });
  return {
    armor: int(p.armor), psiArmor: int(p.psyArmor),
    def: Object.fromEntries(DEF_KEYS.map((k) => [k, p[k] || "normal"])),
    flags: Object.fromEntries(FLAG_KEYS.map((k) => [k, !!p[k]])),
  };
}

const attackOf = (a) => ({
  name: String(a.name ?? ""), dice: String(a.dice ?? ""), type: String(a.type || "phys"), note: String(a.note ?? ""),
  ammoMax: int(a.ammoMax), ammo: int(a.ammo ?? a.ammoMax), ignoreN: int(a.ignoreN), ignoreArmor: !!a.ignoreArmor,
});

/** A parsed enemy (parseEnemyHtml / enemyFromRecord) → the actor's system data */
export function toSystem(parsed, { hpValue = null, description = null } = {}) {
  const d = defenceOf(parsed);
  const hp = Math.max(0, int(parsed.hp));
  const attacks = (parsed.attacks || []).map(attackOf);
  const baseAspects = (parsed.aspects || []).map((t) => ({ t: String(t), inv: 0 }));
  const moves = (parsed.moves || []).map((m) => ({ n: String(m.n ?? ""), t: String(m.t ?? ""), used: false }));
  const notes = String(parsed.notes ?? "");
  const sys = {
    v: ENEMY_V, cat: normCat(parsed.cat),
    hp: { value: hpValue == null ? hp : Math.max(0, int(hpValue)), max: hp },
    armor: d.armor, psiArmor: d.psiArmor, armorText: String(parsed.armorText ?? ""),
    def: d.def, flags: d.flags, attacks, baseAspects, aspects: [], moves, notes, reveal: false,
  };
  sys.orig = bookCopy(sys);
  if (description != null) sys.description = description;
  return sys;
}

/** What «Як у книзі» brings back */
export function bookCopy(sys) {
  return JSON.parse(JSON.stringify({
    hp: sys.hp?.max ?? 0, armor: sys.armor, psiArmor: sys.psiArmor, def: sys.def, flags: sys.flags,
    attacks: sys.attacks, baseAspects: (sys.baseAspects || []).map((a) => ({ t: a.t, inv: 0 })), moves: (sys.moves || []).map((m) => ({ n: m.n, t: m.t, used: false })), notes: sys.notes,
  }));
}

/** «Як у книзі»: the book's attacks, aspects, moves, notes and defence back (HP and situational aspects stay) */
export function resetToBook(sys) {
  const o = sys.orig;
  if (!o) return null;
  return {
    armor: o.armor, psiArmor: o.psiArmor, def: { ...o.def }, flags: { ...o.flags }, hp: { value: Math.min(sys.hp?.value ?? o.hp, o.hp), max: o.hp },
    attacks: o.attacks.map(attackOf), baseAspects: o.baseAspects.map((a) => ({ t: a.t, inv: 0 })), moves: o.moves.map((m) => ({ n: m.n, t: m.t, used: false })), notes: o.notes,
  };
}

/** The Психо move is used: +2 damage to attacks */
export const psychoOn = (sys) => { const i = B.psyMoveIdx(sys); const m = i >= 0 ? sys.moves?.[i] : null; return !!m && (!!m.used || moveMarks(m).spent > 0); };

/** The flat defence profile of the tracker (computeDamage, profileTags, quick-aspect locks) */
export function profileOf(sys) {
  return {
    // «Берсерк-протокол»: +2 armour past its HP threshold (move-spec.mjs moveBonus; author, 2026-11-19)
    armor: int(sys.armor) + moveBonus(sys).armor, psyArmor: int(sys.psiArmor), ...Object.fromEntries(DEF_KEYS.map((k) => [k, sys.def?.[k] || "normal"])),
    ...Object.fromEntries(FLAG_KEYS.map((k) => [k, !!sys.flags?.[k]])), psycho: psychoOn(sys),
  };
}

/** «1d10» + 2 → «1d10+2», «2d6+1» + 2 → «2d6+3»; dice it can't read stay as they are */
export function plusDice(dice, n) {
  if (!n) return dice;
  const m = /^(\d*d\d+(?:kl1)?)([+\-]\d+)?$/i.exec(String(dice ?? "").replace(/\s+/g, ""));
  if (!m) return dice;
  const mod = (+m[2] || 0) + n;
  return m[1] + (mod > 0 ? "+" + mod : mod < 0 ? String(mod) : "");
}

/**
 * The attack's dice with the Kamikaze / Психо +2 (not for unarmed attacks or Пси-удар) and the moves' own bonus
 * («Це не моя фінальна форма», «Берсерк-протокол», «Тільки не по дітях»: every attack, unarmed too; author, 2026-11-19)
 */
export function attackDice(sys, i, buffs = null) {
  const a = sys.attacks?.[i];
  if (!a) return "";
  return plusDice(B.kamiDice(a.dice, `${a.name} ${a.note}`, profileOf(sys)), moveBonus(sys, buffs).dmg);
}

/** Who adds to the attack's damage, for the card and the tooltip: «Психо», «Камікадзе», the moves' names */
export function bonusFrom(sys, i, buffs = null) {
  const a = sys.attacks?.[i];
  if (!a) return [];
  const base = B.kamiDice(a.dice, `${a.name} ${a.note}`, profileOf(sys)) !== a.dice;
  const who = [];
  if (base && psychoOn(sys)) who.push("Психо");
  if (base && sys.flags?.kamikaze) who.push("Камікадзе");
  return [...who, ...moveBonus(sys, buffs).from.map((n) => `«${n}»`)];
}

/** «Психо», «Психо й Камікадзе», «Психо, Камікадзе й «Берсерк-протокол»» */
export const andList = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} й ${l[l.length - 1]}` : l.join(""));
