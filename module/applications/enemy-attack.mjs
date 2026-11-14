/**
 * An enemy's attack to chat (author, 2026-11-14): the attack's dice (with the Психо / Камікадзе +2) rolled by Foundry,
 * the damage card of the character sheet's weapons (postDamageCard: the total in the type's colour, chips, effects),
 * one shot of its ammo spent. The card carries what «Застосувати до цілей» needs. The tracker itself only fed the
 * attack's dice into its damage panel; here the roll is made right away.
 */
import { postDamageCard } from "./check-panel.mjs";
import { attackDice } from "../rules/enemy-model.mjs";
import { DMG_TYPES as BATTLE_TYPES } from "../rules/battle.mjs";
import { TYPE_EFFECTS } from "../rules/damage-types.mjs";

/** The tracker's damage type → the chat cards' one (they name the psychic type differently) */
export const chatType = (t) => (t === "psychic" ? "psi" : BATTLE_TYPES[t] ? t : "phys");
/** …and back */
export const battleType = (t) => (t === "psi" ? "psychic" : BATTLE_TYPES[t] ? t : "phys");

export async function rollEnemyAttack(actor, i, { token = null } = {}) {
  const sys = actor.system;
  const a = sys.attacks?.[i];
  if (!a) return null;
  if (a.ammoMax > 0 && a.ammo <= 0) return ui.notifications.warn(`«${a.name}»: заряди скінчилися.`);
  const dice = attackDice(sys, i) || a.dice;
  let roll;
  try { roll = await new Roll(String(dice).replace(/^d/i, "1d")).evaluate(); }
  catch (_) { return ui.notifications.warn(`Не вдалося розібрати кістки атаки «${a.name}»: ${dice}`); }
  const wt = chatType(a.type);
  const fx = [];
  if (a.ignoreArmor) fx.push("Шкода повністю ігнорує броню.");
  else if (a.ignoreN > 0) fx.push(`Ігнорує ${a.ignoreN} броні.`);
  if (TYPE_EFFECTS[wt]) fx.push(TYPE_EFFECTS[wt]);
  if (/зон[іиу]/i.test(a.note)) fx.push("Влучає по всіх в одній зоні.");
  const bonus = dice !== a.dice ? dice.slice(a.dice.length) : "";
  if (bonus) fx.push(`${bonus} шкоди: ${sys.flags?.kamikaze ? "Камікадзе" : ""}${sys.flags?.kamikaze && bonus === "+4" ? " і " : ""}${bonus === "+4" || !sys.flags?.kamikaze ? "Психо" : ""}.`);
  let spent = "";
  if (a.ammoMax > 0) {
    const attacks = sys.attacks.map((x, k) => (k === i ? { ...x, ammo: Math.max(0, x.ammo - 1) } : x));
    await actor.update({ "system.attacks": attacks });
    spent = `Заряди: ${a.ammo - 1} з ${a.ammoMax}`;
  }
  return postDamageCard(actor, {
    head: `${actor.name}: ${a.name} (${dice})`, wt, total: Math.max(0, roll.total),
    parts: [{ l: dice, v: String(roll.total), t: wt }], fx, spent,
    apply: { type: wt, ignoreArmor: !!a.ignoreArmor, ignoreN: a.ignoreN || 0 },
    speaker: token ? ChatMessage.getSpeaker({ token }) : null,
  });
}
