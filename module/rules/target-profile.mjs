/**
 * Who takes a hit, and how (author, 2026-11-14): the defence profile of a target for `resolveHit` / `computeDamage`
 * (module/rules/battle.mjs). No Foundry here, so the tests can run it.
 *   – enemy: its card's defence (module/rules/enemy-model.mjs profileOf: armour, psychic armour, defences, flags, Психо);
 *   – character: the rules engine, as the sheet's «Захист» shows it — armour and psychic armour with chems, the defences
 *     by the rules (species, perks, feats, chems) combined with the manual ones (`st.defOv`), the flags (+1d6 from
 *     electricity, ½ on a partial success, can't be knocked down / stunned / disarmed), Камікадзе;
 *   – caravan: its armour; «Тачка» (a machine) is immune to psychic damage, poisons and radiation, the brahmins (alive)
 *     take them (author, 2026-11-14);
 *   – anything else (a place, no HP): null — it takes no damage.
 */
import { compute } from "./core.mjs";
import { profileOf as enemyProfile } from "./enemy-model.mjs";
import { caravanDefAuto, caravanDefences } from "./caravan-defence.mjs";
import { enemyNonliving, enemyMutant, MUTANT_SPECIES } from "./states.mjs";
import { logicFor, readState } from "../applications/character-actions.mjs";

const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };
const RES = ["phys", "energy", "fire", "rad", "poison", "psy"];

/** The rules' defence and the manual one together (the sheet's defCombine): two halves make immunity, heal wins */
export function combineDefence(a, m) {
  if (!m || !["half", "immune", "heal"].includes(m)) return a;
  if (a === "heal" || m === "heal") return "heal";
  if (a === "immune" || m === "immune") return "immune";
  if (a === "half" && m === "half") return "immune";
  return "half";
}

/** A character's profile from its rules state (the sheet's «Захист»); the sheet passes its own `d` / `L` */
export function characterProfileFromState(st, { d = compute(st), L = logicFor(st, { quiet: true }) } = {}) {
  const prof = {
    armor: int(d.armorTotal + (L.chemArmor?.() ?? 0)), psyArmor: int(d.psiTotal + (L.chemPsi?.() ?? 0)),
    phys: "normal", energy: "normal", fire: "normal", rad: "normal", poison: "normal", psy: "normal",
  };
  const A = L.defAuto ? L.defAuto(d) : {};
  const ov = st.defOv || {};
  for (const k of RES) prof[k] = combineDefence(A[k] || "normal", ov[k]);
  const flag = (auto, key) => (ov[key] === "yes" ? true : ov[key] === "no" ? false : !!auto);
  Object.assign(prof, {
    electricVuln: flag(A.electric, "electric"), halfPartial: flag(A.partial, "partial"),
    noKnockdown: flag(A.noKnock, "noKnock"), noStun: flag(A.noStun, "noStun"), noDisarm: flag(A.noDisarm, "noDisarm"),
    kamikaze: !!d.has?.("Камікадзе"),
    // «Неживий»: a robot without «Кіборг» (the engine's robotLike; author, 2026-11-20)
    nonliving: flag(d.robotLike, "nonliving"),
    // «Улюблений ворог» (author, 2026-11-19): гуль, супермутант, розумний Пазур Смерті
    mutant: MUTANT_SPECIES.includes(st.species),
  });
  return prof;
}

/** An enemy's names for the book's tables: its compendium entry's, the `baseName` flag, the base actor's, its own */
export function enemyNames(actor) {
  let src = "";
  try { const u = actor._stats?.compendiumSource ?? actor.flags?.core?.sourceId; src = u ? globalThis.fromUuidSync?.(u)?.name ?? "" : ""; } catch (_) { src = ""; }
  const base = actor.getFlag?.(globalThis.game?.system?.id, "baseName") ?? "";
  return [src, base, actor.token?.baseActor?.name ?? "", String(actor.name ?? "").replace(/\s*(?:#|№)?\s*\d+$/, "")].filter(Boolean);
}

/** The profile of an actor (or null when it can't take damage) */
export function targetProfile(actor) {
  if (!actor) return null;
  if (actor.type === "enemy") {
    const names = enemyNames(actor);
    return { ...enemyProfile(actor.system), nonliving: enemyNonliving(actor.system.flags?.nonliving ?? null, names, actor.system), mutant: enemyMutant(names) };
  }
  if (actor.type === "character") return characterProfileFromState(readState(actor));
  if (actor.type === "caravan") return caravanProfile(actor.system);
  return null;
}

/**
 * A caravan's profile: its armour (the rules' + «до броні» of «Налаштування → Захист»), the defences set there
 * (`defOv`: half / immune by type, author 2026-11-14), and a «Тачка» doesn't feel psychic damage, poisons or radiation
 */
export function caravanProfile(sys = {}) {
  // the rules' defences (author, 2026-11-15: «Тачка» immune to psychic / poisons / radiation, «Свинцева обшивка» ½ radiation),
  // each replaced by a value set in «Налаштування → Захист» (caravan-defence.mjs)
  const lead = (int(sys.imp?.lead ?? sys.rules?.S?.imp?.lead) || 0) > 0;
  const def = caravanDefences(caravanDefAuto({ tachka: sys.vehicle === "tachka", lead }), sys.defOv);
  // psychic armour set in «Надбавки» (author, 2026-11-15)
  // «Тачка» is a machine, the brahmins are alive: «Електромагнітна граната» takes only the first (author, 2026-11-20)
  return { armor: Math.max(0, int(sys.armor)), psyArmor: Math.max(0, int(sys.psiArmor)), ...Object.fromEntries(RES.map((k) => [k, def[k] || "normal"])), nonliving: sys.vehicle === "tachka" };
}
