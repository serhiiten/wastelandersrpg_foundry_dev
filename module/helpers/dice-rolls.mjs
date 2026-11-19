/**
 * 3D dice for the system's own rolls (author, 2026-11-19): Dice So Nice and the like animate only chat messages that
 * carry Foundry Rolls (`rolls`), while most of our dice are drawn by the rules code (logic.mjs) and shown in our own
 * cards. These helpers build an evaluated Roll from dice already rolled, so the card's numbers and the 3D dice agree.
 * Dropped dice (Посилення / Послаблення, the worse of «Автоматний псих», the higher of «менша з 2d6») are kept in the
 * Roll as discarded: the author wants every die thrown to be seen falling.
 */

/**
 * @typedef {object} DiceGroup
 * @property {number} faces             sides of every die of the group
 * @property {number[]} values          each die's result
 * @property {Iterable<number>} [dropped] indexes (into values) of the dice not counted
 */

/**
 * The data of an evaluated Roll (for Roll.fromData) made of these dice: one Die term per group, joined by «+».
 * Groups without dice are left out; no dice at all → null.
 * @param {DiceGroup[]} groups
 */
export function diceData(groups) {
  const terms = [];
  const formula = [];
  let total = 0;
  for (const g of groups || []) {
    const faces = Math.floor(Number(g?.faces) || 0);
    const values = (g?.values || []).map((v) => Math.floor(Number(v))).filter((v) => Number.isFinite(v) && v >= 1);
    if (faces < 1 || !values.length) continue;
    const drop = new Set(g.dropped || []);
    const results = values.map((v, i) => (drop.has(i) ? { result: v, active: false, discarded: true } : { result: v, active: true }));
    total += values.reduce((s, v, i) => s + (drop.has(i) ? 0 : v), 0);
    if (terms.length) terms.push({ class: "OperatorTerm", operator: "+", options: {}, evaluated: true });
    terms.push({ class: "Die", number: values.length, faces, modifiers: [], options: {}, evaluated: true, results });
    formula.push(`${values.length}d${faces}`);
  }
  if (!terms.length) return null;
  return { class: "Roll", formula: formula.join(" + "), options: {}, dice: [], terms, total, evaluated: true };
}

/**
 * An evaluated Roll of these dice, or null when there are none (or outside Foundry).
 * Roll.fromData, not fromTerms: fromTerms refuses evaluated terms mixed with others and recounts the total.
 * @param {DiceGroup[]} groups
 */
export function rollFromDice(groups) {
  const data = diceData(groups);
  const R = globalThis.Roll?.implementation ?? globalThis.Roll;
  if (!data || !R?.fromData) return null;
  try { return R.fromData(data); } catch (err) { console.warn("wastelanders | dice for 3D dice", err); return null; }
}

/* ---------- the dice of the rules code's results (module/rules/logic.mjs `R.last`) ---------- */

/**
 * Dice in a row, each with its own sides (dieSides of damage-types.mjs), as groups of equal sides in order.
 * @param {number[]} sides
 * @param {number[]} vals
 * @param {(i:number)=>boolean} isDropped
 */
export function seriesGroups(sides, vals, isDropped = () => false) {
  const out = [];
  (vals || []).forEach((v, i) => {
    const f = sides[i] ?? sides[sides.length - 1];
    let g = out[out.length - 1];
    if (!g || g.faces !== f) out.push(g = { faces: f, values: [], dropped: [] });
    if (isDropped(i)) g.dropped.push(g.values.length);
    g.values.push(v);
  });
  return out;
}

/**
 * A check's dice («Кинути перевірку»): every d10 thrown (those Посилення / Послаблення dropped — not in `keep` — as
 * discarded) and the skill die (discarded when it replaced nothing). With `before` (an aspect invoked: the card shows the
 * whole check again) only the new aspect die, none when there is no new one.
 * @param {object} last      R.last after the roll
 * @param {object} [before]  R.last before the press, for an aspect
 */
export function checkDiceGroups(last, before = undefined) {
  if (!last) return [];
  if (before !== undefined) {
    const a = last.aspect;
    if (!a || JSON.stringify(a) === JSON.stringify(before?.aspect ?? null)) return [];
    return [{ faces: 10, values: [a.v], dropped: a.replaced ? [] : [0] }];
  }
  const keep = new Set(last.keep || []);
  const out = [{ faces: 10, values: last.dice || [], dropped: (last.dice || []).map((_, i) => i).filter((i) => !keep.has(i)) }];
  if (last.skill) out.push({ faces: last.skill.sides, values: [last.skill.v], dropped: last.skill.replaced ? [] : [0] });
  return out;
}

/** The labels of logic.mjs dmgTotal for its extra d6 → the key of `dmg.extra` */
const EXTRA_OF = [[/^Тиха смерть \+1d6/, "silent"], [/^Критичний ефект \+1d6/, "crit"], [/^Електрична: робот/, "robot"]];

/**
 * A damage roll's dice (logic.mjs doDamage + dmgTotal): the weapon's dice (the worse of two series and the higher of
 * «менша з 2d6» discarded; none under «Тиха смерть», whose base is the maximum), the extra d6 that count (read from the
 * parts dmgTotal made, so only what the card counts), the weapon's poison. With `prevExtra` (the damage changed by an
 * option: «Шкода (оновлено)») only the extra d6 drawn since.
 * @param {object} last          R.last (with .dmg)
 * @param {Array} parts          dmgTotal(...).parts: [label, value] pairs
 * @param {number[]} sides       dieSides(last.dmg.p)
 * @param {object} [o]
 * @param {object|null} [o.prevExtra]  dmg.extra before the change
 * @param {number} [o.poisonSides]     sides of the poison's die
 */
export function damageDiceGroups(last, parts, sides, { prevExtra = undefined, poisonSides = 0 } = {}) {
  const D = last?.dmg;
  if (!D) return [];
  const labels = (parts || []).map((p) => String(Array.isArray(p) ? p[0] : p?.l ?? ""));
  const update = prevExtra !== undefined;
  const out = [];
  if (!update && !labels.some((l) => /^Максимум/.test(l))) {
    const best = D.r2 && D.r2.sum > D.r1.sum ? D.r2 : D.r1;
    for (const r of [D.r1, D.r2]) {
      if (!r?.vals?.length) continue;
      if (D.r2 && r !== best) { out.push(...seriesGroups(sides, r.vals, () => true)); continue; }
      // «менша з 2d6»: the higher die is not counted (the second one when both are equal)
      const hi = D.p?.low ? (r.vals[0] > r.vals[1] ? 0 : 1) : -1;
      out.push(...seriesGroups(sides, r.vals, (i) => i === hi));
    }
  }
  for (const [re, k] of EXTRA_OF) {
    const v = D.extra?.[k];
    if (v == null || !labels.some((l) => re.test(l))) continue;
    if (update && prevExtra?.[k] != null) continue;
    out.push({ faces: 6, values: [v] });
  }
  if (!update && last.poison && last.poisonRoll?.vals?.length && poisonSides) out.push({ faces: poisonSides, values: last.poisonRoll.vals });
  return out;
}

/** Sides of a poison's dice («2d6» → 6), 0 when unreadable */
export const poisonSidesOf = (dice) => Number(/d(\d+)/i.exec(String(dice || ""))?.[1]) || 0;

/** Rolls for a chat message: the ones given, without the empty ones */
export const rollList = (...rolls) => rolls.flat().filter(Boolean);

/** How long to wait at most for the 3D dice to land before going on (a stuck animation must not block the game) */
export const DICE_WAIT_MS = 10000;

/**
 * Wait till the 3D dice of this message have landed (Dice So Nice), so the damage is dealt after them
 * (author, 2026-11-19). No dice module, no rolls on the message: returns at once.
 * @param {ChatMessage|null|undefined} message
 */
export async function waitDice(message) {
  const wait = globalThis.game?.dice3d?.waitFor3DAnimationByMessageID;
  if (!message?.id || !message.rolls?.length || typeof wait !== "function") return;
  let timer;
  try {
    await Promise.race([
      wait.call(game.dice3d, message.id),
      new Promise((res) => { timer = setTimeout(res, DICE_WAIT_MS); }),
    ]);
  } catch (_) { /* the dice module failed: go on */ } finally { clearTimeout(timer); }
}
