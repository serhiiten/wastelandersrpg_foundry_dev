/**
 * Battle and health rules the Foundry system adds over the HTML sheet's engine (author, 2026-11-21; Fable's verdict;
 * docs/decisions/battle.md «Бій і здоров'я»). Pure, Node-testable; the windows: applications/battle-health.mjs.
 *   A5 — the free invokes made by actions go at the scene's end (wiki «Стандартні дії»), the aspects stay;
 *   A6 — «Отримання наслідків»: the slot by the verdict, one step heavier while it is taken, no slot left = doomed;
 *   A7 — «Медична допомога» / «Ремонт» on the target (T): the heal, once a day a patient (twice with «Медик» /
 *        «Мастак-ремонтник»); the max HP lost to a failed «Лікування наслідків» lives on its consequence and goes with it.
 */

const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

/* ---------------- A5 ---------------- */

/**
 * The list with every free invoke at 0.
 * @param {object[]} list aspects, e.g. [{t, inv}] or [{name, invoked}]
 * @returns {{next: object[], gone: {name:string, n:number}[]}} `gone`: the aspects that had some
 */
export function zeroInvokes(list, { inv = "inv", name = "t" } = {}) {
  const gone = [];
  const next = (Array.isArray(list) ? list : []).map((a) => {
    const n = int(a?.[inv]);
    if (n <= 0) return a;
    gone.push({ name: String(a[name] ?? "").trim(), n });
    return { ...a, [inv]: 0 };
  });
  return { next, gone };
}

/** The card's line for what went: «Безкоштовні Посилення знято: «Купи брухту» (+1), …» or "" */
export function invokesLine(gone) {
  if (!gone?.length) return "";
  return `Безкоштовні Посилення знято: ${gone.map((g) => `«${g.name}»${g.where ? ` (${g.where})` : ""}`).join(", ")}.`;
}

/**
 * The aspects near a check with a free invoke: [{key, label, src, name, inv, uuid, list, i}]
 * `sources`: [{uuid, list:"zone"|"enemy"|"enemyBase"|"character"|"place", where: label of the source, aspects: [{t, inv}]}]
 */
export function nearbyInvokes(sources) {
  const out = [];
  for (const s of sources ?? []) {
    (s.aspects ?? []).forEach((a, i) => {
      const t = String(a?.t ?? "").trim();
      if (!t || int(a?.inv) <= 0) return;
      out.push({ key: `${s.uuid}|${s.list}|${i}`, uuid: s.uuid, list: s.list, i, name: t, inv: int(a.inv), where: s.where });
    });
  }
  return out;
}

/** One free invoke spent on the list's aspect `i` when it still is `name` with one left; null when it isn't there */
export function spendOne(list, i, name, { inv = "inv", nameKey = "t" } = {}) {
  const a = list?.[i];
  if (!a || String(a[nameKey] ?? "").trim() !== String(name).trim() || int(a[inv]) <= 0) return null;
  return list.map((x, k) => (k === i ? { ...x, [inv]: int(x[inv]) - 1 } : x));
}

/* ---------------- A6 ---------------- */

export const SLOT_NAME = { l: "легкий", m: "середній", m2: "середній (Міцний)", h: "тяжкий" };
const WANT = { 2: "l", 1: "m", 0: "h" };

/**
 * Where «Отримання наслідків» puts the consequence (wiki «Очки здоров'я, наслідки, смерть»): ≤9 heavy, 10–14 medium,
 * 15–18 light, 19+ none (back with 1 HP at the scene's end); a taken slot (treated ones too) makes it one step heavier;
 * the second medium slot only with «Міцний» (medSlots > 1); no slot left = doomed.
 * @returns {{kind:"wake"}|{kind:"slot", k:string, want:string, shifted:boolean}|{kind:"doomed", want:string}}
 */
export function consqPlan(verdict, cons = {}, medSlots = 1) {
  if (verdict >= 3) return { kind: "wake" };
  const want = WANT[Math.max(0, verdict)];
  const ladder = ["l", "m", ...(medSlots > 1 ? ["m2"] : []), "h"];
  const from = ladder.indexOf(want);
  const k = ladder.slice(from).find((x) => !String(cons?.[x] ?? "").trim());
  return k ? { kind: "slot", k, want, shifted: k !== want && !(want === "m" && k === "m2") } : { kind: "doomed", want };
}

/**
 * After the engine's «Кінець сцени» (also inside «Новий день» / «Кінець сесії»), on the character's state, for the group's
 * end and the sheet's own button alike: the free invokes of its situational aspects go (A5); 19+ of «Отримання наслідків»
 * (`st.ko.wake`) brings it back with 1 HP while it is at 0; the doomed (`st.ko.doomed`) dies now — the line says so and the
 * mark goes. The engine's message `L.chem().last` gets the lines. @returns {string[]} the lines
 */
export function sceneEndHealth(st, L, d) {
  const lines = [];
  const z = zeroInvokes(st.sit, { inv: "inv", name: "t" });
  if (z.gone.length) { st.sit = z.next; lines.push(invokesLine(z.gone)); }
  const ko = st.ko && typeof st.ko === "object" ? st.ko : null;
  if (ko?.doomed) lines.push("Приречений: наприкінці сцени персонаж помирає.");
  else if (ko?.wake) {
    if (int(L.curHp(d)) <= 0) { st.hpCur = "1"; lines.push("Опритомнює з 1 ОЗ."); }
  }
  if (ko) delete st.ko;
  if (lines.length) { const c = L.chem(); c.last = `${String(c.last || "").trim()} ${lines.join(" ")}`.trim(); }
  return lines;
}

/** «Записати наслідок»: the plan put on the state. @returns {{ok:boolean, msg:string}} */
export function writeConsq(st, plan, name) {
  const t = String(name ?? "").trim();
  if (plan.kind === "wake") { st.ko = { ...(st.ko || {}), wake: true }; return { ok: true, msg: "Наприкінці сцени персонаж опритомніє з 1 ОЗ." }; }
  if (plan.kind === "doomed") { st.ko = { ...(st.ko || {}), doomed: true }; return { ok: true, msg: "Вільних слотів наслідків немає: персонаж приречений і наприкінці сцени помре." }; }
  if (!t) return { ok: false, msg: "Впиши назву наслідку." };
  if (String(st.cons?.[plan.k] ?? "").trim()) return { ok: false, msg: "Цей слот уже зайнято." };
  st.cons = { ...(st.cons || {}), [plan.k]: t };
  st.consT = { ...(st.consT || {}), [plan.k]: false };
  return { ok: true, msg: `${SLOT_NAME[plan.k][0].toUpperCase()}${SLOT_NAME[plan.k].slice(1)} наслідок «${t}» записано.` };
}

/* ---------------- A7 ---------------- */

/** The heal of a verdict: «Медична допомога» (and «Ремонт», wiki: the same) */
export const MED_DICE = { 1: "1d6", 2: "1d10", 3: "2d6" };

/**
 * How many times the patient may still be helped today (wiki «Відновлення ОЗ…»: once a day, twice with the healer's
 * «Медик»; a robot: «Мастак-ремонтник»). `mark` = the patient's flag {day, n}; `day` = the patient's day number.
 */
export function medLimit({ day, mark, perks = [], repair = false }) {
  const max = perks.includes(repair ? "Мастак-ремонтник" : "Медик") ? 2 : 1;
  const used = mark && int(mark.day) === int(day) ? int(mark.n) : 0;
  return { max, used, left: Math.max(0, max - used) };
}

/** The heal's formula: the verdict's dice, «Медик» +2, «Мастак-ремонтник» +1d6 (wiki «Перки») */
export function medFormula(verdict, { perks = [], repair = false } = {}) {
  const base = MED_DICE[verdict];
  if (!base) return "";
  if (repair) return perks.includes("Мастак-ремонтник") ? `${base} + 1d6` : base;
  return perks.includes("Медик") ? `${base} + 2` : base;
}

/** What a heal really adds: the roll cut to the room left up to the maximum («+7» rolled on 4 missing HP lands as +4; П2 tail, author 2026-11-22) */
export const healLanded = (hp, max, amount) => Math.max(0, Math.min(int(amount), int(max) - int(hp)));

/** The patient's next mark after one help */
export const nextMark = ({ day, mark }) => ({ day: int(day), n: (mark && int(mark.day) === int(day) ? int(mark.n) : 0) + 1 });

/** «Лікування наслідків» 9− / 10–14: the max HP drops by `n` while consequence `k` lasts (st.consRed; hpRed is the total) */
export function addConsRed(st, k, n) {
  st.consRed = { ...(st.consRed || {}) };
  st.consRed[k] = int(st.consRed[k]) + Math.max(0, int(n));
  st.hpRed = Math.max(0, int(st.hpRed)) + Math.max(0, int(n));
  return st;
}

/** A consequence gone (healed, cleared by hand): its loss of max HP goes with it. @returns {string[]} the slots freed */
export function pruneConsRed(st) {
  const out = [];
  const r = st?.consRed;
  if (!r || typeof r !== "object") return out;
  for (const k of Object.keys(r)) {
    if (String(st.cons?.[k] ?? "").trim()) continue;
    st.hpRed = Math.max(0, int(st.hpRed) - int(r[k]));
    delete r[k];
    out.push(k);
  }
  if (!Object.keys(r).length) delete st.consRed;
  return out;
}

/**
 * «Ремонт» (author, 2026-11-21: Foundry only for now, docs/decisions/html-backport.md): the wiki's «Ремонт роботів та інших
 * механізмів відбувається так само, але для цього потрібна перевірка ІН + Техніка» — a check type beside «Медична допомога»,
 * its results the same. Put on a fresh engine (character-actions.mjs logicFor).
 */
export function addRepair(L) {
  const T = L?.CHECK_TYPES;
  if (!T?.med || T.repair) return L;
  T.repair = { n: "Ремонт", a: "IN", s: "Техніка", i: "Коли хочеш відремонтувати робота чи інший механізм поза битвою. Витрать одиницю Припасів. ІН + Техніка.", d: T.med.d };
  const P = L.ROLL_PRESETS;
  if (Array.isArray(P) && !P.some((p) => p.t === "repair")) {
    const at = P.findIndex((p) => p.t === "med");
    P.splice(at >= 0 ? at + 1 : P.length, 0, { l: "Ремонт", t: "repair", g: "other" });
  }
  return L;
}

/* ---------------- П2: the patient chosen after the roll, paid at the moment of applying (author, 2026-11-22) ---------------- */

/** The means that pay for «Лікування наслідків» besides 2 Припаси (wiki: «один стимпак чи суперстимпак»; a machine — their analogues) */
export const TREAT_MEANS = { living: ["Стимпак", "Суперстимпак"], machine: ["Хотфікс", "Критфікс"] };

/**
 * What the healer can pay with (wiki «Відновлення ОЗ…»): «Медична допомога» / «Ремонт» — 1 Припас; «Лікування наслідків» — 2 Припаси
 * or one of the means in «Мотлох» (`st.other`, names through `drugOf`). `machine`: the patient's body (null = not known yet: any
 * means counts). @returns {{k:string, label:string, i?:number}[]} k: "sup" or the means' name; i: its row in st.other
 */
export function healCost(type, st, { machine = null, drugOf = (n) => n } = {}) {
  const sup = int(st?.supplies);
  if (type === "med" || type === "repair") return sup >= 1 ? [{ k: "sup", label: "1 Припас", n: 1 }] : [];
  if (type !== "treat") return [];
  const out = sup >= 2 ? [{ k: "sup", label: "2 Припаси", n: 2 }] : [];
  const fit = machine == null ? [...TREAT_MEANS.living, ...TREAT_MEANS.machine] : TREAT_MEANS[machine ? "machine" : "living"];
  for (const name of fit) {
    const i = (st?.other || []).findIndex((o) => drugOf(o?.n) === name && (isNaN(parseInt(o.q, 10)) || int(o.q) > 0));
    if (i >= 0) out.push({ k: name, label: name, i });
  }
  return out;
}

/**
 * Pay with `k` ("sup" or a means' name), taking what is there now (П-7: whatever vanished between the check and the payment is
 * not an error). @returns {string} what was spent, "" when nothing was there
 */
export function payHeal(type, st, k, { drugOf = (n) => n } = {}) {
  if (k === "sup") {
    const want = type === "treat" ? 2 : 1, had = int(st.supplies), n = Math.min(want, Math.max(0, had));
    st.supplies = had - n;
    return n ? `${n} ${n === 1 ? "Припас" : "Припаси"}` : "";
  }
  const i = (st.other || []).findIndex((o) => drugOf(o?.n) === k);
  if (i < 0) return "";
  const o = st.other[i], q = parseInt(o.q, 10);
  if (!isNaN(q)) { if (q <= 0) return ""; if (q - 1 <= 0) st.other.splice(i, 1); else o.q = String(q - 1); }
  return k;
}

/** «Лікування наслідків» by the verdict (wiki): 9− max HP −1d6; 10–14 treated and −1d6; 15–18 treated; 19+ treated and +1d6 HP */
export function treatPlan(verdict) {
  const v = int(verdict);
  return { red: v <= 1, treated: v >= 1, heal: v >= 3 };
}

/** The consequences the check treats: the untreated medium and heavy ones (a light one is treated with a medicament, no check) */
export function treatSlots(st) {
  return ["m", "m2", "h"].filter((k) => String(st?.cons?.[k] ?? "").trim() && !st?.consT?.[k])
    .map((k) => ({ k, label: SLOT_NAME[k], t: String(st.cons[k]).trim() }));
}

/**
 * The patient's side of «Лікування наслідків» on its state: treated mark, max HP −n, the current HP cut to the new maximum, a
 * maximum at 0 → doomed (A6's mark, `wake` kept). `L`: the patient's engine. @returns {{ok:boolean, msg?:string, doomed?:boolean}}
 */
export function applyTreat(st, L, slot, plan, n = 0, { compute } = {}) {
  if (!String(st.cons?.[slot] ?? "").trim()) return { ok: false, msg: "Цього наслідку в пацієнта вже немає." };
  if (plan.treated && st.consT?.[slot]) return { ok: false, msg: "Цей наслідок уже проліковано." };
  if (plan.treated) st.consT = { ...(st.consT || {}), [slot]: true };
  let doomed = false;
  if (plan.red && n > 0) {
    addConsRed(st, slot, n);
    const d = compute(st), max = L.hpMaxNow(d);
    if (L.curHp(d) > max) st.hpCur = String(Math.max(0, max));
    if (max <= 0) { st.ko = { ...(st.ko || {}), doomed: true }; doomed = true; }
  }
  return { ok: true, doomed };
}
