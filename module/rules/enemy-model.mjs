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
export const psychoOn = (sys) => { const i = B.psyMoveIdx(sys); return i >= 0 && !!sys.moves?.[i]?.used; };

/** The flat defence profile of the tracker (computeDamage, profileTags, quick-aspect locks) */
export function profileOf(sys) {
  return {
    armor: int(sys.armor), psyArmor: int(sys.psiArmor), ...Object.fromEntries(DEF_KEYS.map((k) => [k, sys.def?.[k] || "normal"])),
    ...Object.fromEntries(FLAG_KEYS.map((k) => [k, !!sys.flags?.[k]])), psycho: psychoOn(sys),
  };
}

/** The attack's dice with the Kamikaze / Психо +2 (not for unarmed attacks or Пси-удар) */
export function attackDice(sys, i) {
  const a = sys.attacks?.[i];
  if (!a) return "";
  return B.kamiDice(a.dice, `${a.name} ${a.note}`, profileOf(sys));
}

/** Damage this enemy takes: computeDamage on its profile */
export const takeDamage = (sys, base, typeKey, opts = {}) => B.computeDamage(profileOf(sys), base, typeKey, opts);

/** Is this raw system data still the old shape ({type, hp, armor, description})? */
export const isOldShape = (src) => !!src && typeof src === "object" && !("v" in src) && !Array.isArray(src.attacks);

/**
 * The old shape → the new one, from the description's HTML (the compendium's text). The current HP stay.
 * Used by EnemyData.migrateData on FULL sources only (never on partial updates).
 */
export function fromOldShape(src, name = "") {
  const parsed = B.parseEnemyHtml(src.description || "", { name, hp: src.hp?.max ?? 0, armor: src.armor ?? 0, cat: src.type });
  return toSystem(parsed, { hpValue: src.hp?.value ?? parsed.hp, description: src.description ?? "" });
}
