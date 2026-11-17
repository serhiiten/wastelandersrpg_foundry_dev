/**
 * The caravan's «Турель» (author, 2026-11-15; Foundry only). The upgrade's text: a heavy weapon, 2d6 at range, anyone may
 * fire it. Its damage and type are set in «Налаштування → Надбавки» (actor flag `turret` = { dice, type }, the enemy
 * cards' type keys of battle.mjs DMG_TYPES); the upgrade's card has the dice chip (rolls to chat) and «Завдати цілям»
 * (rolls and hits the targets, as an enemy's attack: armour and defences of each target count).
 */
import { postDamageCard } from "./check-panel.mjs";
import { chosenTokens, sendDamage, warnNoTargets } from "./apply-damage.mjs";
import { DMG_TYPES, chatType, diceLabel } from "../rules/battle.mjs";
import { TYPE_EFFECTS } from "../rules/damage-types.mjs";
import { notify } from "../helpers/notify.mjs";

export const TURRET_DEFAULT = { dice: "2d6", type: "phys" };

/** The turret's settings: { dice, type } (the defaults where nothing was set) */
export function turretOf(actor) {
  const f = actor?.getFlag?.(game.system.id, "turret") || {};
  const dice = String(f.dice || "").trim() || TURRET_DEFAULT.dice;
  const type = DMG_TYPES[f.type] ? f.type : TURRET_DEFAULT.type;
  return { dice, type };
}

/** Roll the turret's damage to chat; with `apply`, hit the targets too (nobody targeted: a warning and no roll) */
export async function rollTurret(actor, { apply = false } = {}) {
  if (apply && !chosenTokens().length) return warnNoTargets();
  const { dice, type } = turretOf(actor);
  let roll;
  try { roll = await new Roll(dice.replace(/^d/i, "1d")).evaluate(); }
  catch (_) { return notify.warn(`Не вдалося розібрати кістки турелі: ${dice}`); }
  const wt = chatType(type);
  const ignoreN = DMG_TYPES[type]?.ignore || 0;
  const fx = [];
  if (TYPE_EFFECTS[wt]) fx.push(TYPE_EFFECTS[wt]); // the type's line also says how much armour it ignores
  const total = Math.max(0, roll.total);
  const label = diceLabel(dice);
  await postDamageCard(actor, { head: `${actor.name}: турель (${label})`, wt, total, parts: [{ l: label, v: String(total), t: wt }], fx });
  if (!apply) return;
  const nDice = roll.dice.reduce((n, d) => n + d.number, 0);
  return sendDamage({ total, dice: nDice, type: wt, ignoreN }, { head: `${actor.name}: турель` });
}
