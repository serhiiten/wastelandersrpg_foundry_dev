/**
 * A die rolled on the spot, for rules code that runs synchronously (the HTML sheet's controller, perk uses…).
 * Foundry 14 refuses `new Roll("1d10").evaluateSync()` for any random term ("cannot be synchronously evaluated"),
 * so «Застосувати» of every perk that rolls died silently (playtest 2026-11-18, item 5). This draws from the same
 * random source Foundry's own dice use (CONFIG.Dice.randomUniform, the Mersenne Twister by default).
 * @param {number} faces
 * @returns {number} 1…faces
 */
export function rollDie(faces) {
  const s = Math.max(1, Math.floor(Number(faces) || 1));
  const u = globalThis.CONFIG?.Dice?.randomUniform?.() ?? Math.random();
  return Math.min(s, Math.floor(u * s) + 1);
}
