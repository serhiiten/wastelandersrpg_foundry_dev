/**
 * Супротивник: the view model of the enemy sheet (author, 2026-11-14) — a pure helper with no Foundry globals, so
 * tests can run it in Node (tests/enemy-view.test.mjs). The sheet (enemy-sheet.mjs) only adds what needs Foundry:
 * the portrait, the GM switch, the enriched description.
 */
import {
  CAT_LABEL, QUICK_ASPECTS, DEF_FIELDS, R3, R4, DMG_TYPES, profileTags, tagHelp, moveHeal, psyMoveIdx, DICE_RE,
} from "../rules/battle.mjs";
import { profileOf, attackDice, normCat, bookCopy } from "../rules/enemy-model.mjs";

/** The strip colour of the card by category (like a place's kind colour) */
export const CAT_COLOR = { statists: "#6b6f6c", regular: "#9a4a20", elite: "#a8700a", boss: "#a3261a" };

/** The tracker's tag icon names → Font Awesome */
const TAG_ICON = {
  bolt: "fa-bolt", skull: "fa-skull", gauge: "fa-gauge-high", brain: "fa-brain", radiation: "fa-radiation", fire: "fa-fire",
  sparkle: "fa-wand-sparkles", "½": "fa-percent", ban: "fa-ban", bomb: "fa-bomb", edit: "fa-pen",
};

/** Quick aspects locked by a flag: [aspect key] → [flag, tooltip] */
const QUICK_LOCK = {
  down: ["noKnockdown", "Не можна збити з ніг"],
  stunned: ["noStun", "Не можна приголомшити"],
  disarmed: ["noDisarm", "Не можна обеззброїти"],
};

/** The HP bar class: dead (0), low (≤ 33 %), mid (≤ 66 %), ok */
export function hpLevel(value, max) {
  const pct = max > 0 ? Math.round((100 * value) / max) : 0;
  const level = value <= 0 ? "dead" : pct <= 33 ? "low" : pct <= 66 ? "mid" : "ok";
  return { pct: Math.max(0, Math.min(100, pct)), level, dead: value <= 0 };
}

/** A move that can be used once («раз за сцену / за сесію») or is the Психо move */
export function onceMove(text, isPsy = false) {
  return !!isPsy || /раз за (сцену|сесію)/i.test(String(text || ""));
}

/** The damage type's short name: «Лазерна (ігнорує 1 броні)» → «Лазерна» */
export const typeLabel = (k) => (DMG_TYPES[k] ?? DMG_TYPES.phys).n.replace(/ \(.*/, "");
/** The chat cards name the psychic type «psi» */
export const typeClass = (k) => `dt-${k === "psychic" ? "psi" : DMG_TYPES[k] ? k : "phys"}`;

/** The damage types for a select: [{k, n, sel}] */
export const typeOptions = (sel = "") => Object.entries(DMG_TYPES).map(([k, t]) => ({ k, n: t.n, sel: k === sel }));

/** JSON with sorted keys, to compare the card with the book's copy whatever the order of the keys */
const stable = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
/** Does the card differ from the book (attacks, aspects, moves, notes, defence, max HP)? */
export function differsFromBook(sys) {
  if (!sys.orig) return false;
  const bare = (o) => ({ ...o, attacks: (o.attacks ?? []).map(({ ammo, ...a }) => a) }); // spent ammo is play, not an edit
  return stable(bare(bookCopy(sys))) !== stable(bare(sys.orig));
}

/** Where each defence field lives in `system` */
export function defPath(f) {
  if (f === "armor") return "system.armor";
  if (f === "psyArmor") return "system.psiArmor";
  if (["phys", "energy", "fire", "rad", "poison", "psy"].includes(f)) return `system.def.${f}`;
  return `system.flags.${f}`;
}
const defOf = (sys, f) => (f === "armor" ? sys.armor : f === "psyArmor" ? sys.psiArmor : ["phys", "energy", "fire", "rad", "poison", "psy"].includes(f) ? sys.def?.[f] : !!sys.flags?.[f]);

/** The defence editor's rows: {f, label, kind, value, options?, path} (+ the extra «отримує психічну шкоду» flag) */
export function defenceRows(sys) {
  const rows = DEF_FIELDS.map(([f, label, kind]) => {
    const row = { f, label, kind, path: defPath(f), value: defOf(sys, f), num: kind === "num", chk: kind === "chk", sel: kind === "r3" || kind === "r4" };
    if (row.sel) row.options = Object.entries(kind === "r4" ? R4 : R3).map(([v, l]) => ({ v, l, sel: v === row.value }));
    return row;
  });
  rows.push({ f: "psyVuln", label: "Отримує психічну шкоду", kind: "chk", path: defPath("psyVuln"), value: !!sys.flags?.psyVuln, num: false, chk: true, sel: false });
  return rows;
}

/**
 * The whole view model.
 * @param {object} sys  the actor's `system`
 * @param {object} [o]  {editable, gm}
 */
export function enemyView(sys, o = {}) {
  const cat = normCat(sys.cat);
  const profile = profileOf(sys);
  const hp = { value: sys.hp?.value ?? 0, max: sys.hp?.max ?? 0, ...hpLevel(sys.hp?.value ?? 0, sys.hp?.max ?? 0) };
  const tags = profileTags(profile).map(([icon, text]) => ({ icon: TAG_ICON[icon] ?? "fa-circle", text, help: tagHelp(text) }));
  const aspects = sys.aspects ?? [];
  const quick = QUICK_ASPECTS.filter(([, label]) => !aspects.some((a) => a.t === label)).map(([key, label]) => {
    const lock = QUICK_LOCK[key];
    const locked = !!(lock && profile[lock[0]]);
    return { key, label, locked, help: locked ? lock[1] : `Накласти аспект «${label}»` };
  });
  const psyIdx = psyMoveIdx(sys);
  const psycho = !!profile.psycho;
  const attacks = (sys.attacks ?? []).map((a, i) => {
    const dice = attackDice(sys, i) || a.dice;
    const plus = dice !== a.dice && dice.startsWith(a.dice) ? Number(dice.slice(a.dice.length)) || 0 : 0;
    const who = psycho && sys.flags?.kamikaze ? "Психо й Камікадзе" : psycho ? "Психо" : "Камікадзе";
    const ammo = a.ammoMax > 0;
    return {
      i, name: a.name, dice, base: a.dice, plus, plusText: plus ? `+${plus}` : "", plusTitle: plus ? `${who}: +${plus} шкоди` : "",
      type: a.type, typeOpts: typeOptions(a.type), ammoMax: a.ammoMax || 0, typeLabel: typeLabel(a.type), tcls: typeClass(a.type), note: a.note,
      ammo: ammo ? { max: a.ammoMax, value: a.ammo, empty: a.ammo <= 0, pips: Array.from({ length: a.ammoMax }, (_, k) => ({ n: k + 1, on: k < a.ammo })) } : null,
      dead: ammo && a.ammo <= 0, ignoreArmor: !!a.ignoreArmor, ignoreN: a.ignoreN || 0, diceOk: DICE_RE.test(String(a.dice).trim()),
    };
  });
  const moves = (sys.moves ?? []).map((m, i) => {
    const psy = i === psyIdx;
    const heal = moveHeal(m.t);
    return { i, n: m.n, t: m.t, used: !!m.used, psy, once: onceMove(m.t, psy), heal: heal ? heal.expr : "", healGroup: !!heal?.group };
  });
  return {
    cat, catLabel: CAT_LABEL[cat] ?? "", catColor: CAT_COLOR[cat] ?? CAT_COLOR.regular,
    hp, armor: sys.armor ?? 0, psiArmor: sys.psiArmor ?? 0, armorText: sys.armorText ?? "",
    tags, quick, aspects: aspects.map((a, i) => ({ i, t: a.t, inv: a.inv })),
    baseAspects: (sys.baseAspects ?? []).map((a, i) => ({ i, t: a.t, inv: a.inv })),
    attacks, moves, psycho, psyIdx, psyMove: psyIdx >= 0 ? moves[psyIdx] : null,
    changed: !!sys.orig && JSON.stringify(sys.orig.attacks ?? null) !== JSON.stringify(sys.attacks) ? true : false,
    canReset: !!sys.orig, differs: differsFromBook(sys), defence: o.gm ? defenceRows(sys) : [],
    reveal: !!sys.reveal,
  };
}
