/**
 * «Лічильники гри» (global game counters; mirrors the HTML terminal's map.js gcAdd / gcStep): pure helpers, no Foundry.
 * A counter: { id, name, size: 4|6|8|10|12, val: 0..size, labels: [size] } — labels[i] describes segment i + 1.
 */
export const GC_SIZES = [4, 6, 8, 10, 12];
export const GC_MAX = 10;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

/** One counter brought into shape (unknown size → 6, value and labels clamped) */
export function normalizeCounter(o, fallbackId = 1) {
  const size = GC_SIZES.includes(int(o?.size)) ? int(o.size) : 6;
  return {
    id: Math.max(1, int(o?.id, fallbackId)),
    name: String(o?.name ?? "").trim() || "Лічильник",
    size,
    val: clamp(int(o?.val), 0, size),
    labels: Array.from({ length: size }, (_, i) => String((o?.labels || [])[i] ?? "")),
  };
}

/** The stored list brought into shape: only the first GC_MAX, unique ids */
export function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for (const o of list) {
    if (out.length >= GC_MAX) break;
    const c = normalizeCounter(o, 1 + Math.max(0, ...out.map((x) => x.id)));
    if (seen.has(c.id)) c.id = 1 + Math.max(0, ...out.map((x) => x.id));
    seen.add(c.id);
    out.push(c);
  }
  return out;
}

export const isFull = (list) => (list?.length || 0) >= GC_MAX;

/** Add a counter; null when the list is full. Returns { list, counter } */
export function addCounter(list, o) {
  const cur = normalizeList(list);
  if (isFull(cur)) return null;
  const counter = normalizeCounter({ ...o, id: 1 + Math.max(0, ...cur.map((x) => x.id)) });
  return { list: [...cur, counter], counter };
}

/** Step a counter by d; null when it is unknown. Returns { list, counter, from, to, changed } */
export function stepCounter(list, id, d) {
  const cur = normalizeList(list);
  const c = cur.find((x) => x.id === Number(id));
  if (!c) return null;
  const from = c.val, to = clamp(from + int(d), 0, c.size);
  return { list: cur.map((x) => (x === c ? { ...c, val: to } : x)), counter: { ...c, val: to }, from, to, changed: to !== from };
}

/** Remove a counter; null when it is unknown. Returns { list, counter } */
export function removeCounter(list, id) {
  const cur = normalizeList(list);
  const c = cur.find((x) => x.id === Number(id));
  return c ? { list: cur.filter((x) => x !== c), counter: c } : null;
}

export function renameCounter(list, id, name) {
  return normalizeList(list).map((x) => (x.id === Number(id) ? { ...x, name: String(name ?? "").trim() || x.name } : x));
}

export function setLabel(list, id, i, text) {
  return normalizeList(list).map((x) => {
    if (x.id !== Number(id) || !(i >= 0 && i < x.size)) return x;
    const labels = [...x.labels]; labels[i] = String(text ?? "");
    return { ...x, labels };
  });
}

/** The description of the current segment ("" at 0 or when empty) */
export const currentLabel = (c) => (c.val > 0 ? (c.labels[c.val - 1] || "").trim() : "");

/** The colour: red at 0 → green at the maximum (HSL hue 0…120) */
export const ctHue = (v, m) => Math.round(120 * clamp(m ? v / m : 0, 0, 1));

/** Chat lines (plain text; the caller escapes) */
export const logCreate = (c) => `Новий лічильник гри «${c.name}»: ${c.size} поділок, зараз ${c.val}`;
export function logStep(c, from, to) {
  const l = to > 0 ? (c.labels[to - 1] || "").trim() : "";
  return `Лічильник гри «${c.name}»: ${from} → ${to} з ${c.size}${l ? ` — ${l}` : ""}`;
}
export const logRemove = (c) => `Лічильник гри «${c.name}» прибрано`;

/* ---------- Scene (local) counters: mirrors the HTML terminal's tracker.js ctCreate / ctStep / ctRemove ----------
 * A scene counter: { id, name, die: 2..30, val: 0..die }. Lives in the current scene's flag; the limit of GC_MAX counts
 * the scene's and the game's counters together (HTML: CTR_MAX, «локальні й глобальні разом»). */
export const LC_DIES = [[6, "d6 — звичайна неприємність"], [8, "d8 — лиха неприємність"], [10, "d10 — особливо лиха / масова битва"], [12, "d12 — надзвичайно лиха проблема"], ["custom", "Свій розмір…"]];
export const LC_STEPS = [
  { d: -2, cls: "dn", label: "−2 невдача", title: "Перевірка 9 або нижче — невдача: лічильник −2" },
  { d: -1, cls: "dn", label: "−1 простій", title: "Персонажі ціле коло дій нічого не роблять із проблемою: лічильник −1" },
  { d: 1, cls: "up", label: "+1 успіх", title: "10–14 — частковий успіх (+1, але Доглядач може зробити хід) або 15–18 — успіх (+1)" },
  { d: 2, cls: "up", label: "+2 крит", title: "19 або вище — критичний успіх: лічильник +2" },
];
export const LC_FULL_TEXT = `Лічильників уже ${GC_MAX} — це межа (локальні й глобальні разом)`;

/** One scene counter brought into shape (die 2..30, default 6; value 0..die) */
export function normalizeLocal(o, fallbackId = 1) {
  const die = clamp(int(o?.die, 6), 2, 30);
  return { id: Math.max(1, int(o?.id, fallbackId)), name: String(o?.name ?? "").trim() || "Лічильник", die, val: clamp(int(o?.val), 0, die) };
}
export function normalizeLocalList(list) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for (const o of list) {
    if (out.length >= GC_MAX) break;
    const c = normalizeLocal(o, 1 + Math.max(0, ...out.map((x) => x.id)));
    if (seen.has(c.id)) c.id = 1 + Math.max(0, ...out.map((x) => x.id));
    seen.add(c.id); out.push(c);
  }
  return out;
}
/** Both kinds together are at the limit */
export const isFullTotal = (localCount, globalCount) => (localCount || 0) + (globalCount || 0) >= GC_MAX;

/** The form's die choice: 6/8/10/12 as is; "custom" takes the size field (2..30) */
export const formDie = (die, custom) => (die === "custom" ? clamp(int(custom, 20), 2, 30) : clamp(int(die, 6), 2, 30));

/**
 * Add a scene counter (HTML ctCreate: die 2..30 default 6, start 1..die default 4). null when the limit (with the
 * game's counters, globalCount) is reached. next = the scene's id counter. Returns { list, counter, next }
 */
export function addLocal(list, o, { globalCount = 0, next = 1 } = {}) {
  const cur = normalizeLocalList(list);
  if (isFullTotal(cur.length, globalCount)) return null;
  const die = clamp(int(o?.die, 6) || 6, 2, 30);
  const val = clamp(int(o?.val, 4) || 4, 1, die);
  const id = Math.max(int(next, 1), 1 + Math.max(0, ...cur.map((x) => x.id)));
  const counter = { id, name: String(o?.name ?? "").trim() || "Лічильник", die, val };
  return { list: [...cur, counter], counter, next: id + 1 };
}

/** Step by d (−2, −1, +1, +2); null when unknown. Returns { list, counter, from, to, changed } */
export function stepLocal(list, id, d) {
  const cur = normalizeLocalList(list);
  const c = cur.find((x) => x.id === Number(id));
  if (!c) return null;
  const from = c.val, to = clamp(from + int(d), 0, c.die);
  return { list: cur.map((x) => (x === c ? { ...c, val: to } : x)), counter: { ...c, val: to }, from, to, changed: to !== from };
}
export function removeLocal(list, id) {
  const cur = normalizeLocalList(list);
  const c = cur.find((x) => x.id === Number(id));
  return c ? { list: cur.filter((x) => x !== c), counter: c } : null;
}
export function renameLocal(list, id, name) {
  return normalizeLocalList(list).map((x) => (x.id === Number(id) ? { ...x, name: String(name ?? "").trim() || x.name } : x));
}
/** "lost" at 0, "won" at the maximum, "" otherwise */
export const localState = (c) => (c.val <= 0 ? "lost" : c.val >= c.die ? "won" : "");
export const STATE_TEXT = { lost: "Проблема постала в усій красі: можеш зробити хід проти кожного персонажа гравця", won: "Проблему розв'язано" };
export const STEP_WHY = { "-2": "невдача", "-1": "простій", "1": "успіх", "2": "критичний успіх" };

/** Chat lines (plain text, the caller escapes) */
export const logCreateLocal = (c) => `Новий лічильник «${c.name}»: d${c.die}, починається з ${c.val}`;
export function logStepLocal(c, from, to, d) {
  const why = STEP_WHY[String(d)];
  return `«${c.name}»: ${from} → ${to}${why ? ` (${why})` : ""}${to <= 0 ? " — загроза настала!" : to >= c.die ? " — проблему розв'язано" : ""}`;
}
export const logRemoveLocal = (c) => `Лічильник «${c.name}» прибрано`;

/** The die drawn as in the HTML terminal's ctDieSvg (value big, «dN» small); uid keeps the gradient id unique per card */
export function dieSvg(die, val, uid = 0) {
  const shape = {
    6: '<rect x="9" y="9" width="82" height="82" rx="14"/>',
    8: '<polygon points="50,3 97,50 50,97 3,50"/><polygon points="50,15 83,69 17,69" fill="none" stroke-width="2.5" opacity=".55"/>',
    10: '<polygon points="50,3 96,40 50,97 4,40"/><polyline points="4,40 30,31 50,3 70,31 96,40" fill="none" stroke-width="2.5" opacity=".55"/>',
    12: '<polygon points="50,3 96,37 79,95 21,95 4,37"/><polygon points="50,20 77,40 67,74 33,74 23,40" fill="none" stroke-width="2.5" opacity=".55"/>',
    4: '<polygon points="50,5 96,92 4,92"/>',
    20: '<polygon points="50,3 93,27 93,73 50,97 7,73 7,27"/><polygon points="50,22 76,66 24,66" fill="none" stroke-width="2.5" opacity=".55"/>',
  }[die] || '<circle cx="50" cy="50" r="45"/><circle cx="50" cy="50" r="33" fill="none" stroke-width="2.5" opacity=".45"/>';
  const ty = { 6: 50, 8: 52, 10: 58, 12: 50, 4: 64, 20: 50 }[die] ?? 50, fs = { 6: 44, 8: 34, 10: 38, 12: 38, 4: 32, 20: 36 }[die] ?? 38;
  const dy = { 6: 82, 8: 86, 10: 84, 12: 89, 4: 86, 20: 85 }[die] ?? 82;
  const fill = val <= 0 ? "#ff7a5a" : val >= die ? "#3dff47" : "#f2e8cf";
  const g = `pust-dg-${uid}`;
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4f4d"/><stop offset="1" stop-color="#1c1f1e"/></linearGradient></defs>`
    + `<g fill="url(#${g})" stroke="#ffd84a" stroke-width="4" stroke-linejoin="round">${shape}</g>`
    + `<text x="50" y="${ty}" text-anchor="middle" dominant-baseline="middle" font-family="Handjet, monospace" font-weight="700" font-size="${fs}" fill="${fill}">${val}</text>`
    + `<text x="50" y="${dy}" text-anchor="middle" font-family="Handjet, monospace" font-weight="700" font-size="13" fill="#9aa19f">d${die}</text></svg>`;
}
