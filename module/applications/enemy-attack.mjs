/**
 * An enemy's attack to chat (author, 2026-11-14): the attack's dice (with the Психо / Камікадзе +2) rolled by Foundry,
 * the damage card of the character sheet's weapons (postDamageCard: the total in the type's colour, chips, effects),
 * one shot of its ammo spent. Returns what «Завдати цілям» on the enemy's card needs (author, 2026-11-14: the button
 * is on the card, not in chat). The tracker itself only fed the
 * attack's dice into its damage panel; here the roll is made right away.
 */
import { postDamageCard } from "./check-panel.mjs";
import { attackDice } from "../rules/enemy-model.mjs";
import { diceLabel } from "../rules/battle.mjs";
import { TYPE_EFFECTS } from "../rules/damage-types.mjs";

export { chatType, battleType } from "../rules/battle.mjs";
import { chatType } from "../rules/battle.mjs";
import { notify } from "../helpers/notify.mjs";
import { waitDice } from "../helpers/dice-rolls.mjs";

export async function rollEnemyAttack(actor, i, { token = null } = {}) {
  const sys = actor.system;
  const a = sys.attacks?.[i];
  if (!a) return null;
  if (a.ammoMax > 0 && a.ammo <= 0) return notify.warn(`«${a.name}»: заряди скінчилися.`);
  const dice = attackDice(sys, i) || a.dice;
  let roll;
  try { roll = await new Roll(String(dice).replace(/^d/i, "1d")).evaluate(); }
  catch (_) { return notify.warn(`Не вдалося розібрати кістки атаки «${a.name}»: ${dice}`); }
  const wt = chatType(a.type);
  const fx = [];
  if (a.ignoreArmor) fx.push("Шкода повністю ігнорує броню.");
  else if (a.ignoreN > 0) fx.push(`Ігнорує ${a.ignoreN} броні.`);
  if (TYPE_EFFECTS[wt]) fx.push(TYPE_EFFECTS[wt]);
  if (/зон[іиу]/i.test(a.note)) fx.push("Влучає по всіх в одній зоні.");
  const bonus = dice !== a.dice ? dice.slice(a.dice.length) : "";
  if (bonus) fx.push(`${bonus} шкоди: ${sys.flags?.kamikaze ? "Камікадзе" : ""}${sys.flags?.kamikaze && bonus === "+4" ? " і " : ""}${bonus === "+4" || !sys.flags?.kamikaze ? "Психо" : ""}.`);
  // the charge left isn't written on the chat card (author, 2026-11-15): players mustn't count the enemy's ammo
  if (a.ammoMax > 0) {
    const attacks = sys.attacks.map((x, k) => (k === i ? { ...x, ammo: Math.max(0, x.ammo - 1) } : x));
    await actor.update({ "system.attacks": attacks });
  }
  const total = Math.max(0, roll.total);
  const label = diceLabel(dice);
  const msg = await postDamageCard(actor, {
    head: `${actor.name}: ${a.name} (${label})`, wt, total,
    parts: [{ l: label, v: String(total), t: wt }], fx,
    speaker: token ? ChatMessage.getSpeaker({ token }) : null, rolls: [roll],
  });
  await waitDice(msg); // «Завдати цілям» deals the damage once the 3D dice have landed (author, 2026-11-19)
  const nDice = roll.dice.reduce((n, d) => n + d.number, 0); // radiation that heals: +1 HP a die
  return { total, head: `${token?.name || actor.name}: ${a.name}`, data: { total, dice: nDice, type: wt, ignoreArmor: !!a.ignoreArmor, ignoreN: a.ignoreN || 0 } };
}
