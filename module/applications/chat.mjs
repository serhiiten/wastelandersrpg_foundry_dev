/**
 * Posting to chat (author, 2026-11-14): every card of the system follows the chat's mode menu — public, GM only,
 * blind GM, self — the same way Foundry's own rolls do.
 * Foundry 14: the menu is the `core.messageMode` setting, applied by ChatMessage.applyMode;
 * Foundry 13: the `core.rollMode` setting, applied by ChatMessage.applyRollMode.
 * @param {object} data       ChatMessage data (content, speaker…)
 * @param {object} [opts]
 * @param {boolean} [opts.dice]  the card shows a roll: play the dice sound
 * @param {Roll[]} [opts.rolls]  the card's dice as Rolls (author, 2026-11-19): Dice So Nice and the like throw them in 3D
 *                               (module/helpers/dice-rolls.mjs); the card itself stays ours. Empty: a card as before.
 */
export function postChat(data, { dice = false, rolls = null } = {}) {
  const CM = ChatMessage.implementation;
  const msg = { ...data };
  if (dice && !msg.sound) msg.sound = CONFIG.sounds.dice; // Dice So Nice drops this sound where it throws its dice
  const list = (rolls || []).filter(Boolean);
  if (list.length) {
    msg.rolls = list;
    // Dice So Nice's «interactive» rolls would wait for a hand, while the result is dealt already
    msg.flags = foundry.utils.mergeObject(msg.flags ?? {}, { "dice-so-nice": { interactive: false } }, { inplace: false });
  }
  if (typeof CM.applyMode === "function" && game.settings.settings.has("core.messageMode")) CM.applyMode(msg);
  else CM.applyRollMode(msg, game.settings.get("core", "rollMode"));
  return CM.create(msg);
}

/** Is the chat's mode menu on «public» (no whisper, not blind) for this user? */
export function isPublicMode() {
  const CM = ChatMessage.implementation;
  const probe = {};
  if (typeof CM.applyMode === "function" && game.settings.settings.has("core.messageMode")) CM.applyMode(probe);
  else CM.applyRollMode(probe, game.settings.get("core", "rollMode"));
  return !probe.blind && !(probe.whisper?.length);
}
