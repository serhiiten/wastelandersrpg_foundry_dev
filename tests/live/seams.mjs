// Seams test, the steps inside the page (practice 4 of the AI report, author 2026-11-25; plan
// docs/plans/2026-11-25-seams-test-plan.md in the workspace). The runner is the workspace's
// tools/foundry-live/seams.py: it makes a clean one-off world, opens «ТЕСТ Доглядач» twice (A, A2) and «ТЕСТ Гравець» (B)
// and calls the exports below in those pages:
//   const S = await import(`/systems/${game.system.id}/tests/live/seams.mjs`)
// The steps live here, next to the code they check (like tests/ui/audit.mjs): a change of a button or a function name
// changes them in the same branch. The pure part (ROUTE, selectSteps, countsDiff, isNoise, verdict) is tested
// without Foundry by tests/seams-plan.test.mjs.
//
// Rules of the route: every document made here is test data (named «ТЕСТ …» and flagged `liveTest: "seams"`, the
// /pust-live/ helpers' mark()); the rules engine decides every number (the dice are fixed, nothing else is mocked).

// ---------- pure part ----------

/** The route in its order. `needs`: steps it builds on (selectSteps adds them). `windows`: who must be in the world. */
export const ROUTE = [
  { id: "1b", title: "Перший вхід: A і A2 одночасно (свій світ)", needs: [], windows: ["A", "A2"] },
  { id: "1a", title: "Перший вхід: A, за кілька секунд A2", needs: [], windows: ["A", "A2"] },
  { id: "2", title: "Тур Доглядача: перший крок", needs: ["1a"], windows: ["A"] },
  { id: "3", title: "Персонаж гравця і тур гравця", needs: ["1a"], windows: ["A", "B"] },
  { id: "4", title: "Бій: персонаж і бандит на сцені", needs: ["3"], windows: ["A", "A2", "B"] },
  { id: "5", title: "Атака гравця: одна картка в усіх", needs: ["4"], windows: ["A", "A2", "B"] },
  { id: "6", title: "Шкода гравця при двох вікнах Доглядача", needs: ["5"], windows: ["A", "A2", "B"] },
  { id: "7", title: "Шкода Доглядача: 0 ПЗ і лікування", needs: ["4"], windows: ["A", "A2", "B"] },
  { id: "8", title: "Кінець бою", needs: ["4"], windows: ["A", "A2", "B"] },
  { id: "9", title: "Кеш: версія й файли системи", needs: [], windows: ["C"] },
  { id: "10", title: "Наскрізно: червоні помилки консолей і сервера", needs: [], windows: [] },
];

/** The steps to run for `--steps 2,6` (empty: all), with what they build on, in the route's order. 1a always runs. */
export function selectSteps(wanted = "", route = ROUTE) {
  const ids = String(wanted).split(/[,\s]+/).filter(Boolean);
  if (!ids.length) return route.map((s) => s.id);
  const byId = new Map(route.map((s) => [s.id, s]));
  const unknown = ids.filter((id) => !byId.has(id));
  if (unknown.length) throw new Error(`Невідомі кроки: ${unknown.join(", ")}`);
  const keep = new Set();
  const add = (id) => { if (keep.has(id)) return; keep.add(id); for (const n of byId.get(id).needs) add(n); };
  ["1a", "10", ...ids].forEach(add);
  return route.map((s) => s.id).filter((id) => keep.has(id));
}

/** The world's counters before the test data and after the cleanup: the keys that differ, as «key: a → b» */
export function countsDiff(before = {}, after = {}) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return keys.filter((k) => before[k] !== after[k]).map((k) => `${k}: ${before[k] ?? "—"} → ${after[k] ?? "—"}`);
}

/**
 * Red console lines that are not failures, each with its reason. Keep it short: a line here hides a real error forever.
 * `type`: console type the rule applies to; `re`: tested against the text.
 */
export const NOISE = [
  // the runner joins over POST /join: Foundry's join page logs nothing red, but the headless shell has no GPU —
  // these are warnings, listed so that a change of their level is still recognised
  { type: "warning", re: /hardware acceleration/i, why: "headless-браузер без GPU (SwiftShader): попередження Foundry, не помилка системи" },
  { type: "warning", re: /GL Driver Message/i, why: "програмний WebGL headless-браузера" },
];

export const isRed = (c) => c?.type === "error" || c?.type === "pageerror";
export const isNoise = (c, noise = NOISE) => noise.some((n) => n.type === c?.type && n.re.test(String(c?.text ?? "")));

/** The red lines of each window's console that are not known noise: { A: [...], B: [...] } */
export function redLines(consoles = {}, noise = NOISE) {
  const out = {};
  for (const [w, lines] of Object.entries(consoles)) {
    const red = (lines ?? []).filter((c) => isRed(c) && !isNoise(c, noise));
    if (red.length) out[w] = red;
  }
  return out;
}

/** The run's verdict from its step results ({ step, ok, details }) */
export function verdict(results = []) {
  const failed = results.filter((r) => !r?.ok).map((r) => r?.step ?? "?");
  return { ok: results.length > 0 && failed.length === 0, failed };
}

// ---------- inside the page (needs `game`) ----------

const TAG = "seams";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sys = () => game.system.id;
const live = () => import("/pust-live/live.mjs");
const visible = (el) => !!el && el.isConnected && (el.checkVisibility?.() ?? true) && el.getBoundingClientRect().width > 0;

/** Wait until `fn()` is truthy (polls; returns its value or throws after `timeout`) */
export async function until(fn, { timeout = 20000, every = 200, what = "умова" } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    let v; try { v = await fn(); } catch (_) { v = undefined; }
    if (v) return v;
    if (Date.now() > end) throw new Error(`не дочекалась: ${what} (${timeout / 1000} с)`);
    await sleep(every);
  }
}

/** Who this window is */
export const who = () => ({ user: game.user.name, isGM: game.user.isGM, version: game.system.version, world: game.world.id,
  activeGM: game.users.activeGM?.name ?? null });

/** The world's counters (plan: actors, items, journal, scenes, messages, combats, folders, users, tokens on scenes) */
export function counts() {
  const c = {};
  for (const k of ["actors", "items", "journal", "scenes", "messages", "combats", "folders", "users", "macros", "tables", "playlists"]) c[k] = game[k]?.size ?? 0;
  c.tokens = game.scenes.reduce((n, s) => n + s.tokens.size, 0);
  c.pages = game.journal.reduce((n, j) => n + j.pages.size, 0);
  return c;
}

/** Fix the dice in this window: every die shows the same share of its faces (Foundry: ceil((1 − u) · faces)) */
export function fixDice(u = 0.3) {
  CONFIG.Dice.randomUniform = () => u;
  return { u, d20: Math.ceil((1 - u) * 20), d6: Math.ceil((1 - u) * 6), d10: Math.ceil((1 - u) * 10) };
}

/** First entry settled: «Довідка Foundry» exists and the world's counters stayed the same for `quiet` ms */
export async function firstEntrySettled({ quiet = 4000, timeout = 60000 } = {}) {
  await until(() => game.journal.some((j) => j.getFlag(sys(), "helpJournal")), { timeout, what: "журнал «Довідка Foundry»" });
  let last = JSON.stringify(counts()), since = Date.now();
  const end = Date.now() + timeout;
  while (Date.now() - since < quiet) {
    if (Date.now() > end) throw new Error("світ не заспокоївся після першого входу");
    await sleep(250);
    const now = JSON.stringify(counts());
    if (now !== last) { last = now; since = Date.now(); }
  }
  return counts();
}

/** Step 1: the first entry made everything once (no doubled journal, scenes, folders, quick start) */
export function firstEntryOnce() {
  const dup = (list, key) => {
    const seen = new Map();
    for (const d of list) seen.set(key(d), (seen.get(key(d)) ?? 0) + 1);
    return [...seen].filter(([, n]) => n > 1).map(([k, n]) => `${k} ×${n}`);
  };
  const help = game.journal.filter((j) => j.getFlag(sys(), "helpJournal"));
  const problems = [
    ...(help.length === 1 ? [] : [`журналів «Довідка Foundry»: ${help.length}`]),
    ...dup(game.journal, (j) => j.name).map((s) => `журнал ${s}`),
    ...dup(game.scenes, (s) => s.name).map((s) => `сцена ${s}`),
    ...dup(game.folders, (f) => `${f.type}:${f.name}`).map((s) => `тека ${s}`),
    ...dup(game.actors, (a) => a.name).map((s) => `актор ${s}`),
    ...(game.scenes.filter((s) => s.active).length > 1 ? ["кілька активних сцен"] : []),
  ];
  return { ok: !problems.length, details: { problems, counts: counts(), scenes: game.scenes.map((s) => s.name), journal: game.journal.map((j) => j.name) } };
}

/** The tour running in this window and its current step: target in the DOM and visible, text not empty */
export async function tourProbe({ timeout = 15000 } = {}) {
  const Tour = foundry.nue.Tour;
  const t = await until(() => Tour.tourInProgress && Tour.activeTour, { timeout, what: "тур стартував" }).catch(() => null);
  if (!t) return { ok: false, details: { error: "тур не стартував", toursSeen: game.user.getFlag(sys(), "toursSeen") ?? null } };
  const step = t.currentStep ?? t.steps?.[t.stepIndex ?? 0];
  // the tour's window is drawn a moment after start
  const box = await until(() => document.querySelector(".tour"), { timeout: 5000, what: "вікно туру" }).catch(() => null);
  const target = step?.selector ? document.querySelector(step.selector) : null;
  const text = (box?.textContent ?? "").replace(/\s+/g, " ").trim();
  const problems = [];
  if (!box || !visible(box)) problems.push("вікна туру не видно");
  if (step?.selector && !target) problems.push(`ціль «${step.selector}» не існує`);
  else if (step?.selector && !visible(target)) problems.push(`ціль «${step.selector}» не видно`);
  if (text.length < 10) problems.push("текст кроку порожній");
  return { ok: !problems.length, details: { problems, tour: t.id, namespace: t.namespace, step: step?.id ?? null, selector: step?.selector ?? null, text: text.slice(0, 80) } };
}

/** Close the running tour (so the next steps click freely); does not change who has seen it */
export function exitTour() {
  const Tour = foundry.nue.Tour;
  if (Tour.tourInProgress) Tour.activeTour.exit();
  return { closed: true };
}

/** The test data of this run, then the world's counters (cleanup as «ТЕСТ Доглядач», limited to the lock's `since`) */
export async function cleanup(since) {
  const L = await live();
  const dry = await L.cleanup({ since, tag: undefined, max: 80 });
  const res = await L.cleanup({ apply: true, since, max: 80 });
  return { dry: dry.summary, res, counts: counts() };
}
