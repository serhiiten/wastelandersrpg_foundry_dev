/**
 * An enemy's attack to chat (author, 2026-11-14): the attack's dice (with the Психо / Камікадзе +2) rolled by Foundry,
 * the damage card of the character sheet's weapons (postDamageCard: the total in the type's colour, chips, effects),
 * one shot of its ammo spent. Returns what «Завдати цілям» on the enemy's card needs (author, 2026-11-14: the button
 * is on the card, not in chat). The tracker itself only fed the
 * attack's dice into its damage panel; here the roll is made right away.
 */
import { postDamageCard } from "./check-panel.mjs";
import { attackDice, bonusFrom, andList } from "../rules/enemy-model.mjs";
import { attackStates } from "../rules/move-spec.mjs";
import { diceLabel, attackExtra, attackHit } from "../rules/battle.mjs";
import { TYPE_EFFECTS, empOnly } from "../rules/damage-types.mjs";

export { chatType, battleType } from "../rules/battle.mjs";
import { chatType } from "../rules/battle.mjs";
import { notify } from "../helpers/notify.mjs";
import { waitDice } from "../helpers/dice-rolls.mjs";

export async function rollEnemyAttack(actor, i, { token = null, plus = "" } = {}) {
  const sys = actor.system;
  const buffs = actor.getFlag?.(game.system.id, "buffs") ?? null; // «Ave!», «Децимація» (move-spec.mjs buffList)
  const a = sys.attacks?.[i];
  if (!a) return null;
  if (a.ammoMax > 0 && a.ammo <= 0) return notify.warn(`«${a.name}»: заряди скінчилися.`);
  // `plus`: a die on top, «+1d6» of «Прицільний постріл» (author, 2026-11-20)
  const dice = (attackDice(sys, i, buffs) || a.dice) + (plus ? `+${plus}` : "");
  let roll;
  try { roll = await new Roll(String(dice).replace(/^d/i, "1d")).evaluate(); }
  catch (_) { return notify.warn(`Не вдалося розібрати кістки атаки «${a.name}»: ${dice}`); }
  const wt = chatType(a.type);
  const fx = [];
  if (a.ignoreArmor) fx.push("Шкода повністю ігнорує броню.");
  else if (a.ignoreN > 0) fx.push(`Ігнорує ${a.ignoreN} броні.`);
  if (TYPE_EFFECTS[wt]) fx.push(TYPE_EFFECTS[wt]);
  if (/зон[іиу]/i.test(a.note)) fx.push("Влучає по всіх в одній зоні.");
  const own = attackDice(sys, i, buffs) || a.dice;
  const bonus = own !== a.dice ? own.slice(a.dice.length) : "";
  if (bonus) fx.push(`${bonus} шкоди: ${andList(bonusFrom(sys, i, buffs))}.`);
  if (plus) fx.push(`+${plus} шкоди: вибраний ефект.`);
  // «під час атаки самознищується» (Бум-око; author, 2026-11-20): the attack is its last
  const boom = /самознищу/i.test(a.note ?? "");
  if (boom) fx.push("Під час атаки самознищується.");
  // the charge left isn't written on the chat card (author, 2026-11-15): players mustn't count the enemy's ammo
  if (a.ammoMax > 0) {
    const attacks = sys.attacks.map((x, k) => (k === i ? { ...x, ammo: Math.max(0, x.ammo - 1) } : x));
    await actor.update({ "system.attacks": attacks });
  }
  const label = diceLabel(dice);
  const nDice = (r) => r.dice.reduce((n, d) => n + d.number, 0); // radiation that heals: +1 HP a die
  // the extra part written in the note («+ 1d6 шкоди отрутою», «+ 3 шкоди радіацією»; author, 2026-11-19): rolled too
  const ex = attackExtra(a.note);
  let exRoll = null;
  if (ex) { try { exRoll = await new Roll(ex.expr).evaluate(); } catch (_) { exRoll = null; } }
  const exType = exRoll ? chatType(ex.type) : null;
  if (exType && exType !== wt && TYPE_EFFECTS[exType]) fx.push(TYPE_EFFECTS[exType]);
  const hit = attackHit({ l: label, v: roll.total, t: wt, dice: nDice(roll) },
    exRoll ? { l: ex.label, v: exRoll.total, t: chatType(ex.type), dice: nDice(exRoll) } : null);
  const total = hit.total;
  const msg = await postDamageCard(actor, {
    head: `${actor.name}: ${a.name} (${label}${exRoll ? ` + ${ex.label}` : ""})`, wt, total,
    parts: hit.card, fx,
    speaker: token ? ChatMessage.getSpeaker({ token }) : null, rolls: exRoll ? [roll, exRoll] : [roll],
  });
  if (boom && Number(sys.hp?.value) > 0) await actor.update({ "system.hp.value": 0 });
  await waitDice(msg); // «Завдати цілям» deals the damage once the 3D dice have landed (author, 2026-11-19)
  // the states of the note («підпалює ціль», «спричиняє кровотечу»): on those it wounds (apply-damage.mjs; author, 2026-11-20)
  const onHit = attackStates(a.note);
  const data = { total, dice: hit.dice, type: wt, ignoreArmor: !!a.ignoreArmor, ignoreN: a.ignoreN || 0, ...(hit.parts ? { parts: hit.parts } : {}), ...(onHit.length ? { onHit } : {}), ...(empOnly(a.name, a.note) ? { empOnly: true } : {}) };
  // `msg`: the attack's card, where the waiting targets' avoidance goes (pending-attack.mjs; author, 2026-11-20)
  return { total, head: `${token?.name || actor.name}: ${a.name}`, data, msg };
}
