/**
 * Елементи живлення (author, 2026-11-15): a robot (not a «Синт», who needs none) can «use» a power cell from its gear — no
 * effect in the rules (the book: «Сіла батарейка», at least 1 cap a week on power cells), just one less, with a message.
 * Pure, tested in tests/power-cell.test.mjs; the sheet shows «Вжити» (character-view.mjs), the controller spends it.
 */

/** A gear row that is a power cell: «Елемент живлення», «Елементи живлення (мікроядерні)»… */
export const isPowerCell = (name) => /^\s*елемент[а-яіїєґ]*\s+живлення(?![а-яіїєґ])/i.test(String(name ?? ""));

/** May this character use power cells: a robot, but not a «Синт» */
export const usesPowerCells = (st) => st?.species === "robot" && !(st.feats || []).includes("Синт");

/**
 * Spends one power cell of the gear row i: the quantity goes down by 1, the row goes at 0.
 * @returns {string|null} the message, or null when the row isn't a power cell the character may use
 */
export function usePowerCell(st, i) {
  const o = st?.other?.[i];
  if (!o || !isPowerCell(o.n) || !usesPowerCells(st)) return null;
  const q = parseInt(o.q, 10);
  const left = (Number.isFinite(q) ? q : 1) - 1;
  if (left <= 0) st.other.splice(i, 1);
  else o.q = String(left);
  return "Елемент живлення спожито.";
}
