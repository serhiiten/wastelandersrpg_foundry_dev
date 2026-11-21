/**
 * «Уникнення шкоди» bound to an enemy's attack (A1 of Fable's analysis; author, 2026-11-20, Asking; Fable's verdict). A pure
 * module, no Foundry globals (tests/dodge.test.mjs).
 *
 * An enemy's hit on a player's character waits: its record lives in the attack card's flag `flags.<system>.pend`, written
 * only by the GM:
 *   { v: 1, hits: [{data, head}], half: bool (the menu's «½ шкоди»), source, srcName, states: [{key, once}], attr, round,
 *     rows: { r0: {uuid, actor, name, hits: [0, 1], status, verdict, by} } }
 * `rows` is an object (one key updated at a time: two answers at once don't overwrite each other). A row's status:
 *   wait   — nobody answered yet;
 *   rolled — the avoidance is rolled with 9 or less / 10–14: the player applies it with a button (an aspect may come first);
 *   full / half / none — applied (none: 15+, nothing dealt);
 *   cancel — taken back (the GM's «Скасувати», the scene's end): nothing dealt.
 * Wiki «Стандартні дії»: ВП from physical damage, ІН from psychic, ВТР from radiation, poisons; 9− full, 10–14 half
 * (rounded up), 15–18 none, 19+ none and a positive situational aspect with 1 free invoke.
 */

/** The attribute of the avoidance for a damage type (damage-types.mjs keys) */
export const dodgeAttr = (type) => (type === "psi" ? "IN" : type === "poison" || type === "rad" ? "VTR" : "VP");

/** The attributes' short names, as the sheet writes them */
export const ATTR_SHORT = { VP: "ВП", IN: "ІН", VTR: "ВТР" };

/** A verdict (0 failure … 3 critical) → what the target takes */
export const dodgeOutcome = (verdict) => (verdict >= 2 ? "none" : verdict === 1 ? "half" : "full");

/** The row is closed: applied or taken back */
export const rowClosed = (row) => !!row && !["wait", "rolled"].includes(row.status);

/** The rows still open */
export const openRows = (pend) => Object.entries(pend?.rows ?? {}).filter(([, r]) => !rowClosed(r));

/**
 * The rows of a new record: one per actor (a token and its linked actor twice among the targets → once), in order.
 * @param {{uuid:string, actor:string, name:string, hits?:number[]}[]} targets
 * @returns {Record<string, object>}
 */
export function pendRows(targets) {
  const rows = {}, seen = new Map();
  for (const t of targets ?? []) {
    if (!t?.uuid) continue;
    const key = t.actor || t.uuid;
    const hits = Array.isArray(t.hits) ? t.hits : [0];
    if (seen.has(key)) {
      const r = rows[seen.get(key)];
      r.hits = [...new Set([...r.hits, ...hits])].sort((a, b) => a - b);
      continue;
    }
    const id = `r${seen.size}`;
    seen.set(key, id);
    rows[id] = { uuid: t.uuid, actor: t.actor || "", name: String(t.name ?? ""), hits: [...hits], status: "wait", verdict: null, by: "" };
  }
  return rows;
}

/**
 * What an answer does to a row (the GM's side checks it before acting).
 * @param {object} row
 * @param {{op:"rolled"|"apply"|"take"|"gm"|"cancel", verdict?:number}} a
 *   rolled — the avoidance rolled (or its verdict changed by an aspect); 15+ closes the row at once (author: «15+ саме»);
 *   apply  — the player's button after the roll: the rolled verdict's result;
 *   take   — the player takes the damage without rolling; gm — the GM's «Без уникнення»; cancel — nothing dealt
 * @returns {{row:object, deal:null|"full"|"half"}|null} null: the answer doesn't fit the row (closed, no roll yet…)
 */
export function answerRow(row, a) {
  if (!row || rowClosed(row)) return null;
  const v = Number.isInteger(a?.verdict) ? Math.max(0, Math.min(3, a.verdict)) : null;
  switch (a?.op) {
    case "rolled": {
      if (v == null) return null;
      const out = dodgeOutcome(v);
      if (out === "none") return { row: { ...row, status: "none", verdict: v, by: "dodge" }, deal: null };
      return { row: { ...row, status: "rolled", verdict: v, by: "dodge" }, deal: null };
    }
    case "apply": {
      if (row.status !== "rolled") return null;
      const out = dodgeOutcome(row.verdict);
      return { row: { ...row, status: out, by: "dodge" }, deal: out === "none" ? null : out };
    }
    case "take": return { row: { ...row, status: "full", verdict: null, by: "take" }, deal: "full" };
    case "gm": return { row: { ...row, status: "full", verdict: null, by: "gm" }, deal: "full" };
    case "cancel": return { row: { ...row, status: "cancel", by: "gm" }, deal: null };
    default: return null;
  }
}

/** The menu's states land only with the damage: never when the avoidance took it all (author, 2026-11-20) */
export const statesLand = (deal) => deal === "full" || deal === "half";

/** A row's status in words, for the card (`total` the hit's damage before armour, for «½ → N») */
export function rowText(row, attr = "VP") {
  const a = ATTR_SHORT[attr] ?? "ВП";
  const v = row?.verdict;
  switch (row?.status) {
    case "wait": return "чекає на уникнення";
    case "rolled": return v === 1 ? `уникнення ${a}: 10–14, половина шкоди` : `уникнення ${a}: 9 і нижче, повна шкода`;
    case "none": return v === 3 ? `уникнув (19+): створи позитивний ситуативний аспект з 1 безкоштовним Посиленням` : "уникнув: шкоди немає";
    case "half": return "отримав половину шкоди";
    case "full": return row.by === "gm" ? "без уникнення: повна шкода" : row.by === "take" ? "повна шкода без кидка" : "повна шкода";
    case "cancel": return "скасовано: шкоди немає";
    default: return "";
  }
}

/**
 * The apply button's words after the avoidance roll (before armour): each hit is halved and rounded up on its own, as
 * computeDamageCore does, and the menu's «½ шкоди» (`pend.half`) with 10–14 is ½ + ½ — nothing (reviewer, 2026-11-21).
 * @returns {{n:number, label:string}}
 */
export function rowDeal(pend, row, verdict = row?.verdict) {
  const halves = (pend?.half ? 1 : 0) + (verdict === 1 ? 1 : 0);
  const hits = pend?.hits ?? [];
  const n = halves >= 2 ? 0 : (row?.hits ?? [0]).reduce((s, i) => {
    const t = Math.max(0, Math.round(Number(hits[i]?.data?.total) || 0));
    return s + (halves ? Math.ceil(t / 2) : t);
  }, 0);
  const label = halves >= 2 ? `Отримати: ${n} (½ + ½)` : halves ? `Отримати половину: ${n}` : `Отримати повну шкоду: ${n}`;
  return { n, label };
}

/** The total of a record's hits for a row (before armour), for the button «Отримати половину: N» */
export function rowTotal(pend, row) {
  const hits = pend?.hits ?? [];
  return (row?.hits ?? [0]).reduce((s, i) => s + Math.max(0, Math.round(Number(hits[i]?.data?.total) || 0)), 0);
}
