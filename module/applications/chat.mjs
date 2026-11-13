/**
 * Posting to chat (author, 2026-11-14): every card of the system follows the chat's mode menu — public, GM only,
 * blind GM, self — the same way Foundry's own rolls do.
 * Foundry 14: the menu is the `core.messageMode` setting, applied by ChatMessage.applyMode;
 * Foundry 13: the `core.rollMode` setting, applied by ChatMessage.applyRollMode.
 * @param {object} data       ChatMessage data (content, speaker…)
 * @param {object} [opts]
 * @param {boolean} [opts.dice]  the card shows a roll: play the dice sound
 */
export function postChat(data, { dice = false } = {}) {
  const CM = ChatMessage.implementation;
  const msg = { ...data };
  if (dice && !msg.sound) msg.sound = CONFIG.sounds.dice;
  if (typeof CM.applyMode === "function" && game.settings.settings.has("core.messageMode")) CM.applyMode(msg);
  else CM.applyRollMode(msg, game.settings.get("core", "rollMode"));
  return CM.create(msg);
}
