/**
 * U4 (author, 2026-11-21): a check whose result says «Доглядач робить (проти тебе) хід» / «Доглядач може зробити (проти тебе)
 * хід» sends the GMs a card «Зроби хід проти X» and lights «Ходи Доглядача» for a while; nothing is kept (no list of debts).
 * Pure helpers (Node-testable); the check card carries `flags.<system>.check` = checkFlag(...), the GM side reads it.
 */

/** Does the result's text ask for the GM's move */
export const asksMove = (text) => /Доглядач\s+(?:робить|може\s+зробити)(?:\s+[^.\s]+)*?\s+хід(?![а-яіїєґ])/i.test(String(text ?? ""));

/**
 * The flag of a check card.
 * @param {{actor:string, name:string, type:string, typeName:string, verdict:number, verdictName:string, total:number, time:number, text:string}} o
 */
export function checkFlag({ actor, name, type, typeName, verdict, verdictName, total, time, text }) {
  return { actor, name, type, typeName, verdict, verdictName, total, time, text: String(text ?? ""), move: asksMove(text) };
}

/** The key a later card of the same roll (an aspect invoked on it) shares */
export const rollKey = (f) => (f?.actor && f?.time ? `${f.actor}|${f.time}` : "");
