/**
 * What the chips under a token show (pure; drawn by module/canvas/token.mjs refreshAspectChips).
 *  – situational aspects (author, 2026-11-14): a character's `system.situational`, an enemy's `system.aspects` (not the
 *    book's), a place's aspects; free invokes as «+N»;
 *  – a character's consequences (author, 2026-11-22, П5 5.1, mockup Б): the wiki's «особливий негативний аспект», so the
 *    same yellow chip with the sheet's severity stripe on its left (light / moderate / heavy), a treated one struck through
 *    as in the sheet's field; first, heavy to light, then the situational ones;
 *  – at most CHIPS_MAX chips for both together, the last one «+N» when there are more (stress test, 2026-11-17; author,
 *    2026-11-22: one limit, consequences first). Everyone sees them, as the situational ones.
 */
export const CHIPS_MAX = 6;

/** The consequences' slots in the order shown: heavy first */
const CONS_ORDER = [["heavy", "h"], ["secondModerate", "m"], ["moderate", "m"], ["light", "l"]];

/** The situational aspects shown under a token: [{t, inv}] */
export function tokenAspects(actor) {
  if (!actor) return [];
  let list = [];
  if (actor.type === "enemy" || actor.type === "place") list = actor.system?.aspects ?? [];
  else if (actor.type === "character") list = (actor.system?.situational ?? []).map((a) => ({ t: a.name, inv: a.invoked }));
  return list.filter((a) => String(a?.t ?? "").trim()).map((a) => ({ t: String(a.t).trim(), inv: Math.max(0, Number(a.inv) || 0) }));
}

/** A character's consequences under its token: [{t, sev: "l"|"m"|"h", treated}], heavy first; others have none */
export function tokenConsequences(actor) {
  if (actor?.type !== "character") return [];
  const c = actor.system?.consequences ?? {};
  return CONS_ORDER.map(([f, sev]) => ({ t: String(c[f] ?? "").trim(), sev, treated: !!c.treated?.[f] })).filter((x) => x.t);
}

/**
 * The chips in order: consequences ({t, sev, treated, cons: true}), then aspects ({t, inv}); past `max` the first max−1
 * and `more` = how many are left for the last chip «+N».
 */
export function chipPlan(aspects, cons, max = CHIPS_MAX) {
  const all = [...cons.map((c) => ({ ...c, cons: true })), ...aspects];
  if (all.length <= max) return { chips: all, more: 0 };
  return { chips: all.slice(0, max - 1), more: all.length - (max - 1) };
}
