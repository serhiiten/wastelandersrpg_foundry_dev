/**
 * «Кінець сцени» / «Новий день» / «Кінець сесії» for the whole group (author, 2026-11-17; feedback p5): the GM's buttons in the
 * panels «Сцена» / «Битва» run the character sheet's own action on every character assigned to a player and post one card.
 * Pure: what each kind runs, and the sheet's message cut down to what is this character's own (the parts every character
 * gets go once into the card's general line).
 */

/** kind → the sheet logic's action, the card's title, icon and general line */
export const GROUP_END = {
  scene: { fn: "endScene", title: "Кінець сцени", icon: "fa-flag-checkered", gen: "Сценові ефекти скинуто." },
  day: { fn: "newDay", title: "Новий день", icon: "fa-sun", gen: "Сцену завершено, лічильники стимпаків і цілющого порошку скинуто, можна знову відпочити." },
  session: { fn: "endSession", title: "Кінець сесії", icon: "fa-moon", gen: "Сцену й сесію завершено." },
};

/**
 * The sheet's message (`chem.last` after the action) without what every character gets: «Кінець сцени.», «Сценові ефекти
 * скинуто.», «День N. Лічильники … відпочити», «Кінець сесії N.». Empty when nothing happened to this character.
 */
export function ownPart(text) {
  let s = String(text ?? "");
  s = s.replace(/^\s*День \d+\.\s*Лічильники стимпаків і порошку скинуто, можна знову відпочити/, "");
  s = s.replace(/^;\s*закінчилася дія:\s*/, "Закінчилася дія: ");
  s = s.replace(/^\s*\.\s*/, "");
  s = s.replace(/^\s*Кінець сесії \d+\.\s*/, "");
  s = s.replace(/Кінець сцени\.\s*/g, "");
  s = s.replace(/Сценові ефекти скинуто\.\s*/g, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

/** An enemy's moves with «використано» cleared; null when none was used */
export function resetMoves(moves) {
  if (!Array.isArray(moves) || !moves.some((m) => m?.used)) return null;
  return moves.map((m) => ({ ...m, used: false }));
}
