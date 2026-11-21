/**
 * Удача партії from the characters (author, 2026-11-21; A14; wiki «Кістка Долі та Удача партії»): the sum of the УДЧ of
 * every character assigned to a player → −4 і нижче −2; −2 або −3 −1; від −1 до +1 0; +2 або +3 +1; +4 і вище +2.
 * The caravan's own value (the sheet's list) is a hand-picked replacement: the list sets the caravan's flag `luckManual`,
 * «↺» takes it off. With no character assigned the list works as before.
 *   caravanLuck(actor) → the number every Кістка Долі of the caravan adds (map-dice, map-dock, terminal, the sheet)
 */
import { evaluate } from "./character-actions.mjs";

/** The table of the wiki: a sum of УДЧ → Удача партії */
export function partyLuckOf(sum) {
  const n = Number(sum) || 0;
  if (n <= -4) return -2;
  if (n <= -2) return -1;
  if (n <= 1) return 0;
  if (n <= 3) return 1;
  return 2;
}

const sgn = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

/** The tooltip line: «Волті 1 + Бабай 2 = 3 → +1» (pure) */
export function partyLuckLine(parts) {
  const sum = parts.reduce((t, p) => t + p.v, 0);
  return `${parts.map((p) => `${p.name} ${p.v < 0 ? `(${sgn(p.v)})` : p.v}`).join(" + ")} = ${sgn(sum)} → ${sgn(partyLuckOf(sum))}`;
}

/** The characters assigned to players, each once, with their УДЧ (null when none is assigned) */
export function partyLuck() {
  const seen = new Map();
  for (const u of game.users) {
    const a = u.character;
    if (u.isGM || a?.type !== "character" || seen.has(a.id)) continue;
    let v = 0;
    try { v = +evaluate(a).d.eff.UDCH || 0; } catch (_) { v = 0; }
    seen.set(a.id, { name: a.name, v });
  }
  const parts = [...seen.values()];
  if (!parts.length) return null;
  const sum = parts.reduce((t, p) => t + p.v, 0);
  return { value: partyLuckOf(sum), sum, parts, line: partyLuckLine(parts) };
}

/** Is the caravan's Удача партії picked by hand */
export const luckManual = (actor) => !!actor?.getFlag?.(game.system.id, "luckManual");

/** The Удача партії a caravan's Кістка Долі adds: picked by hand, else from the characters, else the caravan's value */
export function caravanLuck(actor) {
  const own = parseInt(actor?.system?.luck, 10) || 0;
  if (luckManual(actor)) return own;
  return partyLuck()?.value ?? own;
}
