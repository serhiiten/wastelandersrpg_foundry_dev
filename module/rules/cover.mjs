/**
 * «Прикриваєш спільника» as an aspect (author, 2026-11-22, П3 3.2; wiki «Стандартні дії»: «Посилення до наступної перевірки
 * на уникнення шкоди в цьому колі дій»). A pure module, no Foundry globals (tests/cover.test.mjs).
 *
 * The ally gets a situational aspect «Прикритий: <who covers>» with 1 free invoke, one per character who covers; the same one
 * covering again in the round adds nothing. The invoke is not an ordinary one: its count can't be changed on the sheet, it
 * can't be invoked on another check, and the next «Уникнення шкоди» spends exactly one (the oldest) — the aspect goes with
 * it. An aspect deleted by hand gives nothing. ▶ «Коло дій» and «Кінець сцени» take them all off. No flag: everything is
 * in the aspect (a cover put on in this round is the only kind there is, since the round's end takes them off).
 * The lists here are the sheet's own shape `[{t, inv}]` (the engine's `st.sit`) or the actor's `[{name, invoked}]`.
 */

export const COVER_PREFIX = "Прикритий: ";

/** Is this aspect text a cover */
export const isCoverText = (t) => String(t ?? "").startsWith(COVER_PREFIX);

/** The aspect's text for the one who covers */
export const coverText = (byName) => `${COVER_PREFIX}${String(byName ?? "").trim() || "спільник"}`;

const textOf = (a) => String(a?.t ?? a?.name ?? "");
const invOf = (a) => Math.max(0, Number(a?.inv ?? a?.invoked) || 0);

/**
 * The actor's situational list with the cover added: `{list, added}`; the same one's cover already there → not added.
 * @param {{name:string, invoked:number}[]} list @param {string} byName
 */
export function addCover(list, byName) {
  const t = coverText(byName);
  const cur = (list ?? []).map((a) => ({ name: textOf(a), invoked: invOf(a) }));
  if (cur.some((a) => a.name === t)) return { list: cur, added: false, text: t };
  return { list: [...cur, { name: t, invoked: 1 }], added: true, text: t };
}

/** The index of the cover the next avoidance spends (the oldest with its invoke), or −1 */
export const coverIndex = (list) => (list ?? []).findIndex((a) => isCoverText(textOf(a)) && invOf(a) > 0);

/** The cover in force, or null: {i, t, by} */
export function activeCover(list) {
  const i = coverIndex(list);
  if (i < 0) return null;
  const t = textOf(list[i]);
  return { i, t, by: t.slice(COVER_PREFIX.length) };
}

/** The list without the covers (▶ «Коло дій», «Кінець сцени»): {list, gone: [texts]} */
export function dropCovers(list) {
  const gone = [], keep = [];
  for (const a of list ?? []) (isCoverText(textOf(a)) ? gone : keep).push(a);
  return { list: keep, gone: gone.map(textOf) };
}
