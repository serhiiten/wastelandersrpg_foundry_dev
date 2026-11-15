/**
 * The caravan's «Запас ходу» on the map and its paid services (author, 2026-11-15; Foundry only). Pure helpers.
 *   - moving: every cell takes a unit of range and a day; «Тачка» drives 3 cells for one unit (wiki «Тачки»);
 *     a move of a few cells by car still takes a whole unit (rounded up);
 *   - «Породисті браміни» (or the car's fuel regulator), chosen before the trip: a quarter less range, half with the
 *     perk «Першопроходець» in the party; the cost left is rounded up (author, 2026-11-15: 5 cells − ¼ = 3.75 → 4 units,
 *     − ½ → 3), and a move always takes at least 1 unit;
 *   - refilling: 3 units of range a cap (wiki «Гроші та речі, що їх коштують»), repairs: 5 HP a cap (the caravan
 *     sheet's «ремонт у техніка: 1(к) за 5 ОЗ»), paid from the budget; what the caps can't cover stays as it is.
 */
export const CELLS_PER_UNIT_TACHKA = 3;
export const UNITS_PER_CAP = 3;
export const HP_PER_CAP = 5;

/** The share of range the brahmins' bonus saves: 0, ¼, or ½ with «Першопроходець» */
export const brahminSaving = (taken, pathfinder = false) => (taken ? (pathfinder ? 0.5 : 0.25) : 0);

/** Units of range a move of `cells` cells takes; `saving` — the brahmins' share (the cost rounded up) */
export function rangeCost(cells, tachka = false, saving = 0) {
  const n = Math.max(0, Math.round(Number(cells)) || 0);
  const base = Math.ceil(n / (tachka ? CELLS_PER_UNIT_TACHKA : 1));
  // the cost after the brahmins' saving is rounded up (author, 2026-11-15: «витрата вгору»), at least one unit a move
  return base > 0 ? Math.max(1, Math.ceil(base * (1 - (Number(saving) || 0)) - 1e-9)) : 0;
}

/** What `caps` buy of a `lack`, `per` a cap: { units, cost } — all of it if the caps allow, else what they pay for */
export function buyPlan(lack, caps, per) {
  const need = Math.max(0, Math.round(Number(lack)) || 0);
  const have = Math.max(0, Math.round(Number(caps)) || 0);
  if (!need || !have) return { units: 0, cost: 0 };
  const cost = Math.min(Math.ceil(need / per), have);
  return { units: Math.min(need, cost * per), cost };
}

export const refillPlan = (lack, caps) => buyPlan(lack, caps, UNITS_PER_CAP);
export const repairPlan = (dmg, caps) => buyPlan(dmg, caps, HP_PER_CAP);
