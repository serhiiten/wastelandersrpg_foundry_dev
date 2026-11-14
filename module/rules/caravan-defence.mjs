/**
 * The caravan's defences (Foundry only, author 2026-11-14): «Налаштування → Захист», like the character sheet's
 * «Захист вручну». Armour type stays «фізична»; a caravan can only be set to normal / half / immune per damage type.
 * The caravan's state S carries them as S.defOv = { phys, energy, fire, rad, poison, psy: "" | "half" | "immune" }
 * (same keys as the character's DEF_TYPES), and the bonuses as S.hpBonus / S.armorBonus (integers, may be negative).
 */

/** The defence types a caravan can set (keys and names as the character sheet's DEF_TYPES) */
export const CARAVAN_DEF_TYPES = [
  ["phys", "Фізична шкода"],
  ["energy", "Енергетична зброя"],
  ["fire", "Вогонь"],
  ["rad", "Радіація"],
  ["poison", "Отрути"],
  ["psy", "Психічна шкода"],
];

/** The choices of each select (labels as the character sheet's DEF_LABEL) */
export const CARAVAN_DEF_OPTIONS = [
  ["", "звичайна"],
  ["half", "½ шкоди"],
  ["immune", "імунітет"],
];

export const blankDefOv = () => Object.fromEntries(CARAVAN_DEF_TYPES.map(([k]) => [k, ""]));

/** Anything → a complete defOv with only «half» / «immune» kept */
export function cleanDefOv(o) {
  const out = blankDefOv();
  if (o && typeof o === "object") for (const [k] of CARAVAN_DEF_TYPES) if (o[k] === "half" || o[k] === "immune") out[k] = o[k];
  return out;
}

/** How many defences are set */
export const defOvCount = (o) => CARAVAN_DEF_TYPES.filter(([k]) => o?.[k] === "half" || o?.[k] === "immune").length;
