/**
 * The damage of a character's attack split between its targets (A8; author, 2026-11-21; Fable's verdict). The wiki
 * («Стандартні дії», «Атака по багатьох супротивниках»): «Якщо ти завдаси шкоди, то можеш розподілити її між ними на
 * власний розсуд. Інші ефекти діють лише на одного з обраних ворогів, теж на твій вибір.» Pure: no Foundry here
 * (tests/damage-split.test.mjs). The panel is check-panel.mjs, the hit apply-damage.mjs `applyDamage({split})`.
 */

/** May this attack be split? Two targets or more, one damage type, not a weapon that hits the whole zone (A12 later) */
export function canSplit({ targets = 0, zone = false, types = 1 } = {}) {
  return !splitBlock({ targets, zone, types });
}

/** Why this attack can't be split: "targets" (fewer than two), "zone" (a weapon of the whole zone), "types" (damage of
 *  several types: each target takes it in full; the panel says so — reviewer, author 2026-11-21), or "" */
export function splitBlock({ targets = 0, zone = false, types = 1 } = {}) {
  if (targets < 2) return "targets";
  if (zone) return "zone";
  if (types > 1) return "types";
  return "";
}

/**
 * The effect's target of a split (the weapon's poison, the effect «ігноруєш броню») gets no damage: what goes with the
 * damage would be lost (reviewer, author 2026-11-21: never silently). `one` — the chosen target, else the first.
 */
export function effectTargetIdle(shares, one) {
  const keys = Object.keys(shares || {});
  const t = keys.includes(one) ? one : keys[0];
  return !!t && !((Number(shares[t]) || 0) > 0);
}

/** An even split, the remainder to the first ones: 13 among 3 → 5, 4, 4. @returns {Record<string, number>} */
export function evenSplit(total, uuids) {
  const n = uuids.length, t = Math.max(0, Math.floor(Number(total) || 0));
  if (!n) return {};
  const base = Math.floor(t / n), rest = t - base * n;
  return Object.fromEntries(uuids.map((u, i) => [u, base + (i < rest ? 1 : 0)]));
}

/** A share set by hand: a whole number, 0…total */
export const clampShare = (v, total) => Math.max(0, Math.min(Math.max(0, Math.floor(Number(total) || 0)), Math.floor(Number(v) || 0)));

/** What is left to give: total − the shares (never below 0 shown; over-giving is caught by `splitError`) */
export const splitLeft = (split, total) => Math.max(0, Math.floor(Number(total) || 0)) - Object.values(split || {}).reduce((a, b) => a + (Number(b) || 0), 0);

/**
 * Why a split may not be applied, or "" (the GM checks a player's request with it; a bad one applies nothing — Fable):
 * the keys are the request's targets, the shares whole numbers ≥ 0, their sum ≤ the total, at least one above 0.
 */
export function splitError(split, targets, total) {
  if (!split || typeof split !== "object" || Array.isArray(split)) return "розподіл не задано";
  const keys = Object.keys(split), allowed = new Set(targets || []);
  if (!keys.length) return "розподіл порожній";
  if (keys.some((k) => !allowed.has(k))) return "у розподілі ціль, якої немає серед цілей атаки";
  const vals = Object.values(split);
  if (vals.some((v) => !Number.isInteger(v) || v < 0)) return "частка має бути цілим числом від 0";
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum > Math.max(0, Math.floor(Number(total) || 0))) return "розподілено більше, ніж випало";
  if (sum <= 0) return "жодна ціль не отримує шкоди";
  return "";
}

/**
 * Whole numbers in proportion to the shares, summing to `n` (the largest remainder; ties to the first): the dice of the
 * hit for radiation that heals a ghoul (+1 HP a die), split as the damage is. @returns {Record<string, number>}
 */
export function shareCount(n, split) {
  const keys = Object.keys(split || {}), sum = keys.reduce((a, k) => a + (Number(split[k]) || 0), 0);
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (!keys.length || sum <= 0) return Object.fromEntries(keys.map((k) => [k, 0]));
  const raw = keys.map((k) => (n * (Number(split[k]) || 0)) / sum);
  const out = raw.map(Math.floor);
  let left = n - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left <= 0) break; out[i]++; left--; }
  return Object.fromEntries(keys.map((k, i) => [k, out[i]]));
}

/**
 * The hit one target gets out of a split one (applyDamage): its share as the total, its part of the dice; the weapon's poison
 * and «ігноруєш броню» chosen as an effect only on the effect's target (`one`; author, 2026-11-21: «Обидва на ціль ефекту»).
 * The weapon's own «ігнорує броню» stays on every target. `null`: this target gets no damage (share 0 — Fable: not a hit of
 * 0, which would clear an enemy's last hit and add «На прицілі» to nothing).
 * @param {object} data   the hit as sent (total, type, dice, poison, ignoreArmor, ignoreN…)
 * @param {{shares: Record<string, number>, one?: string, fxIgnore?: boolean}} split
 */
export function splitHit(data, split, uuid) {
  const share = Number(split?.shares?.[uuid]) || 0;
  if (share <= 0) return null;
  const dice = shareCount(Number(data.dice) || 0, split.shares)[uuid] ?? 0;
  const hit = { ...data, total: share, dice };
  delete hit.parts; // one type only (canSplit)
  const one = split.one || Object.keys(split.shares).find((k) => (Number(split.shares[k]) || 0) > 0) || "";
  if (uuid !== one) hit.poison = 0;
  if (uuid === one && split.fxIgnore) { hit.ignoreArmor = true; hit.ignoreN = 0; }
  return hit;
}
