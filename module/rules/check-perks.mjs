/**
 * The perks that change a check already rolled, as buttons left of «Інша перевірка» (П1, 2026-11-22: once «Повторити перевірку») (author, 2026-11-21, mockup 3;
 * wiki «Перки»). Pure: no Foundry (tests/check-perks.test.mjs). The panel is check-panel.mjs.
 *   «Бісова штуковина!» — «Раз за сцену ти можеш повністю перекинути будь-яку перевірку, пов'язану зі зламом замків чи
 *     взаємодією з комп'ютерами…»: offered on «Звичайна перевірка», «Подолання труднощів», «Створення переваги» and
 *     «Дізнатись нове» (author); the new roll replaces the old one, so only the new roll's ОД count.
 *   «Щасливець» — «Раз за сесію ти можеш підвищити результат будь-якої перевірки на один ступінь…»: the panel raises its own
 *     check (`last.luckUp`, logic.mjs via port_rules.py); an ally's check stays the sheet's mark.
 * Each is offered while its perk is not used (perk-uses.mjs marks it: a scene / a session).
 */

/** The check types «Бісова штуковина!» is offered on (author, 2026-11-21) */
export const KICK_TYPES = ["gen", "overcome", "advantage", "learn"];

/** Is «Бісова штуковина!: перекинути» offered for this roll? `used` — its mark is on */
export function kickOffer(last, perks = [], used = false) {
  return !!last && !used && !last.hx && perks.includes("Бісова штуковина!") && KICK_TYPES.includes(last.type);
}

/**
 * Is «Щасливець: +1 ступінь» offered? Not above a critical success (a cursed character: above a success), not once the
 * damage is rolled, not when the roll's ОД were taken by the buttons (as an aspect: the ОД are for this result).
 */
export function luckOffer(last, perks = [], used = false) {
  if (!last || used || last.hx || !perks.includes("Щасливець") || last.luckUp) return false; // П2: an applied result is frozen
  const top = last.ci?.cursed ? 2 : 3;
  return last.verdict < top && !last.dmg && !last.dmgDone && !last.xpGiven && !last.savGiven;
}

/**
 * The ОД of a roll that a reroll replaces go (author, 2026-11-21: only the new roll's ОД count): the panel's own
 * (`xpAuto`), the buttons' (`xpGiven`, `savGiven`), and its failure in «Старанний учень»'s count of the session.
 * Returns how many ОД were taken.
 */
export function dropRollXp(st, last) {
  if (!st || !last) return 0;
  const a = last.xpAuto;
  const n = (a ? (a.fail || 0) + (a.sav || 0) : 0) + (Number(last.xpGiven) || 0) + (Number(last.savGiven) || 0);
  if (n) st.xp = Math.max(0, (Number(st.xp) || 0) - n);
  const sf = st.chem?.studFails;
  if (a?.stud && sf && (a.sess == null || sf.sess === a.sess)) sf.n = Math.max(0, (Number(sf.n) || 0) - a.stud);
  return n;
}
