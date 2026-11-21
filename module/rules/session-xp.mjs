/**
 * ОД (A10, author 2026-11-21; Fable's verdict): the end-of-session questions and the ОД for a failed check.
 * The questions are copied word for word from the wiki («Очки досвіду та покращення», «Заробляємо ОД»).
 * Pure: no Foundry.
 */

/** «Групові запитання наприкінці сесії»: each «так» gives every character of the group 1 ОД */
export const GROUP_QUESTIONS = [
  "Чи заробили ми пристойну кількість кришок (зазвичай 25 або більше)?",
  "Чи дізналися ми щось нове та цікаве про ігровий світ?",
  "Чи побували ми в поселенні, де наш караван ще ніколи не був?",
  "Чи подолали ми тяжке випробування й чи впоралися з небезпечними супротивниками?",
];

/** «Особисті запитання наприкінці сесії»: each «так» gives the character 1 ОД; `k` — the main aspect it asks about */
export const OWN_QUESTIONS = [
  { k: "concept", n: "Концепція", q: "Чи діяв я відповідно до Концепції персонажа, навіть якщо це було йому невигідно чи поставило його в ризиковане становище?" },
  { k: "problem", n: "Проблема", q: "Чи відчутно заважала моєму персонажеві його Проблема і чи поставила вона його чи караван у ризиковане становище?" },
  { k: "goal", n: "Ціль", q: "Чи зробив я щось, що суттєво наблизило мого персонажа до його Цілі?" },
];

/** «Привал під час подорожі»: once a session, 1 ОД for an honest answer by the campfire (ticked here if not given then) */
export const CAMP = { n: "Привал", q: "Привал під час подорожі: персонаж чесно відповів на запитання біля багаття (раз за сесію)." };

/**
 * A character's ОД from the window: `group` — the group's ticks (booleans), `own` — { concept, problem, goal, camp }.
 * Returns { n, why } — `why` for the chat card, made only of the wiki's words: «Групові: 2 з 4. Особисті: Концепція, Ціль. Привал.»
 */
export function sessionXp(group = [], own = {}) {
  const g = group.filter(Boolean).length;
  const mine = OWN_QUESTIONS.filter((x) => own[x.k]);
  const camp = own.camp ? 1 : 0;
  const n = g + mine.length + camp;
  const why = [
    g ? `Групові: ${g} з ${GROUP_QUESTIONS.length}.` : "",
    mine.length ? `Особисті: ${mine.map((x) => x.n).join(", ")}.` : "",
    camp ? `${CAMP.n}.` : "",
  ].filter(Boolean).join(" ");
  return { n, why };
}

/**
 * The ОД for the last roll of the check panel when the world's «ОД за невдачу» is on (author, 2026-11-21: on by default).
 * Called after every action of the panel that may change `last` (a roll, an aspect): it sets what this roll should give and
 * adds the difference to `st.xp`, so an aspect that turns a failure into a success takes the ОД back.
 *   – a failure (verdict 0): 1 ОД; «Старанний учень»: 2 ОД for the first three failures of the session (wiki «Перки»);
 *   – «Савант»: 1 ОД for a critical success without the skill;
 *   – the session's failures are counted for everyone in `st.chem.studFails` = { sess, n } (the perk may come later).
 * A roll whose ОД was already given by the button (`xpGiven` / `savGiven`) is left alone.
 * `last.xpAuto` = { fail, sav, stud, sess } — what this roll gave, in which session (a roll of an ended session is left
 * alone). Returns the change of `st.xp`.
 */
export function reconcileAutoXp(st, last, perks = []) {
  if (!last || !Number.isInteger(last.verdict)) return 0;
  const had = last.xpAuto || { fail: 0, sav: 0, stud: 0 };
  const c = (st.chem ||= {});
  const sess = Number(c.session) || 1;
  if (had.sess != null && had.sess !== sess) return 0; // a roll of a session already ended: left as it was
  const failsBefore = Math.max(0, (c.studFails?.sess === sess ? Number(c.studFails.n) || 0 : 0) - (had.stud || 0));
  const failed = last.verdict === 0 && !last.xpGiven;
  const fail = failed ? (perks.includes("Старанний учень") && failsBefore < 3 ? 2 : 1) : 0;
  const sav = last.verdict === 3 && !last.lvl && perks.includes("Савант") && !last.savGiven ? 1 : 0;
  const stud = last.verdict === 0 ? 1 : 0;
  c.studFails = { sess, n: failsBefore + stud };
  const delta = fail + sav - (had.fail || 0) - (had.sav || 0);
  if (delta) st.xp = Math.max(0, (Number(st.xp) || 0) + delta);
  if (fail || sav || stud) last.xpAuto = { fail, sav, stud, sess };
  else delete last.xpAuto;
  return delta;
}

/**
 * The options of «Кінець сесії: ОД» for `endForAll` as they are at the press (reviewer, author 2026-11-21): `moves` / `fate`
 * given as functions are read now — the window may stay open while the GM goes to another scene, and the GM's Fate tokens
 * are the characters of the scene viewed then; a plain value is kept as it is.
 */
export const endOptsNow = (o = {}) => ({ ...o, moves: typeof o.moves === "function" ? !!o.moves() : o.moves, fate: typeof o.fate === "function" ? o.fate() : o.fate });

/**
 * Did the panel already add this roll's ОД of this kind (`k` «sav» — «Савант», else the failure's)? Then the result's ОД
 * button does nothing; otherwise (a roll from before «ОД за невдачу» was turned on, a tour's demo) it adds the ОД as before
 * (reviewer, author 2026-11-21: never a dead button).
 */
export const xpAutoGiven = (last, k) => !!(k === "sav" ? last?.xpAuto?.sav : last?.xpAuto?.fail);
