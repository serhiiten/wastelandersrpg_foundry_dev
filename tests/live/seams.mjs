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

/**
 * Old bugs the first run caught (author, 2026-11-25: fixed later in a session of their own; until then the test shows them
 * red and names them, never hides them). `re`: a console line; `log`: a server log check made by the runner.
 */
export const KNOWN = [
  { id: "tour-collision", re: /Welcome to Foundry Virtual Tabletop Tour because the .* Tour is already in progress/i,
    title: "вітальний тур Foundry стикається з туром системи «Початок» на першому вході" },
  { id: "source-undefined", re: /reading '_source'/,
    title: "«Cannot read properties of undefined (reading '_source')» у другому вікні Доглядача на першому вході" },
  { id: "double-thumb", log: "thumb",
    title: "мініатюру сцени записано двічі на першому вході (журнал сервера)" },
];

/**
 * Findings the author decided to tolerate (not fixed): the test names them but does not turn red on them. `steps`: where a
 * problem line counts as one; `re`: the whole problem line as the step reports it — anything else stays a failure.
 */
export const TOLERATED = [
  { id: "first-entry-race", steps: ["1b"],
    re: /^(журналів «Довідка Foundry»: 2|журнал Довідка Foundry ×2|сцена Мапа Пустки ×2|кілька активних сцен)$/,
    title: "два вікна Доглядача одночасно в чистому світі: дві «Довідки Foundry» і дві «Мапи Пустки» (буває й дві активні сцени)",
    why: "автор, 2026-11-25: терпима, не виправляємо" },
];

/** A step's problems split into failures and tolerated findings: { problems, tolerated: [ids] } */
export function splitTolerated(step, problems = [], list = TOLERATED) {
  const out = { problems: [], tolerated: [] };
  for (const p of problems) {
    const t = list.find((x) => x.steps.includes(String(step)) && x.re.test(String(p)));
    if (t) { if (!out.tolerated.includes(t.id)) out.tolerated.push(t.id); } else out.problems.push(p);
  }
  return out;
}

/** The old bug a red console line is, or null */
export const knownOf = (c, known = KNOWN) => known.find((k) => k.re && k.re.test(String(c?.text ?? "")))?.id ?? null;

/** The red lines of each window's console that are not known noise, each with `known` (an old bug's id or null) */
export function redLines(consoles = {}, noise = NOISE, known = KNOWN) {
  const out = {};
  for (const [w, lines] of Object.entries(consoles)) {
    const red = (lines ?? []).filter((c) => isRed(c) && !isNoise(c, noise)).map((c) => ({ ...c, known: knownOf(c, known) }));
    if (red.length) out[w] = red;
  }
  return out;
}

/**
 * Server log lines «Persisted base64 image to "...thumb-X.webp"»: the files written more often than scenes use them.
 * The file is named after the picture's content, so two scenes with the same picture share one file and each writes it
 * once (2026-11-25: 1b's two «Мапа Пустки» are the tolerated race, not a thumbnail written twice). `sceneThumbs`: every
 * scene's `thumb`; a file no scene uses still counts as used once.
 */
export function doubleThumbs(messages = [], sceneThumbs = []) {
  const base = (f) => String(f ?? "").split("?")[0].split(/[\\/]/).pop(); // a scene's thumb ends in «?<time>»
  const uses = new Map();
  for (const t of sceneThumbs) if (t) uses.set(base(t), (uses.get(base(t)) ?? 0) + 1);
  const n = new Map();
  for (const m of messages) {
    const f = String(m ?? "").match(/Persisted base64 image to "([^"]*thumb-[^"]*)"/)?.[1];
    if (f) n.set(base(f), (n.get(base(f)) ?? 0) + 1);
  }
  return [...n].filter(([f, k]) => k > Math.max(1, uses.get(f) ?? 0)).map(([f, k]) => `${f} ×${k}`);
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
// The character sheet's engine (rules/logic.mjs rnd) draws its check dice from crypto.getRandomValues on a one-number
// Uint32Array, not from Foundry's dice: that one shape is fixed too (n → 1 + (n % faces)); every other use of the API
// (ids, keys) goes to the browser's own
let ownRandom = null;
export function fixDice(u = 0.3, n = 7) {
  CONFIG.Dice.randomUniform = () => u;
  ownRandom ??= crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (a) => (a instanceof Uint32Array && a.length === 1 ? ((a[0] = n), a) : ownRandom(a));
  return { u, n, d20: Math.ceil((1 - u) * 20), d6: Math.ceil((1 - u) * 6), d10: Math.ceil((1 - u) * 10), check: `2d10 = ${2 * (1 + (n % 10))}` };
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
  // the system's tour never breaks on a missing target: it shows the step in the middle with its fallback text and takes
  // the selector off while it shows (tours/pust-tour.mjs) — so the target is read from the step as declared
  const def = (await mod("tours/tour-data.mjs").catch(() => null))?.TOURS?.find((x) => x.id === t.id)?.steps?.find((x) => x.id === step?.id);
  const selector = def?.selector ?? step?.selector ?? null;
  const target = selector ? [...document.querySelectorAll(selector)].find((el) => el.getClientRects().length) ?? document.querySelector(selector) : null;
  const text = (box?.textContent ?? "").replace(/\s+/g, " ").trim();
  const problems = [];
  if (!box || !visible(box)) problems.push("вікна туру не видно");
  if (selector && !target) problems.push(`ціль «${selector}» не існує (тур показав крок без неї)`);
  else if (selector && !visible(target)) problems.push(`ціль «${selector}» не видно`);
  if (text.length < 10) problems.push("текст кроку порожній");
  return { ok: !problems.length, details: { problems, tour: t.id, namespace: t.namespace, step: step?.id ?? null, selector, text: text.slice(0, 80) } };
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

// ---------- steps 3–8 (inside the page) ----------

const mod = (path) => import(`/systems/${sys()}/module/${path}`);
const createdAt = (m) => m?._stats?.createdTime ?? m?.timestamp ?? 0;
const cards = (since, cls) => game.messages.filter((m) => createdAt(m) >= since && String(m.content ?? "").includes(cls));
/** One card per audience: the public one and the one whispered to the GMs each at most once */
const perAudience = (list) => ({ open: list.filter((m) => !m.whisper?.length).length, whisper: list.filter((m) => m.whisper?.length).length });
const unconsciousOn = (actor) => actor?.effects.filter((e) => e.statuses?.has("unconscious")).length ?? 0;

/** Step 3 (A): «ТЕСТ Персонаж» for «ТЕСТ Гравець», holding the compendium's «Легка зброя» */
export async function makeCharacter(player = "ТЕСТ Гравець") {
  const L = await live();
  const u = game.users.find((x) => x.name === player);
  if (!u) throw new Error(`немає користувача «${player}»`);
  const pack = game.packs.get(`${sys()}.weapons`);
  const idx = await pack.getIndex();
  const entry = idx.find((e) => e.name === "Легка зброя");
  if (!entry) throw new Error("у компендіумі зброї немає «Легка зброя»");
  const weapon = (await pack.getDocument(entry._id)).toObject();
  delete weapon._id;
  weapon.system.inHand = true;
  const a = await Actor.implementation.create(L.mark({ name: "ТЕСТ Персонаж", type: "character",
    ownership: { default: 0, [u.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }, items: [weapon] }, TAG));
  return { id: a.id, weapons: a.items.filter((i) => i.type === "weapon").map((i) => i.name) };
}

/** Step 3 (B): the character's sheet opens in this window */
export async function sheetOpens(actorId) {
  const a = game.actors.get(actorId);
  if (!a) return { ok: false, details: { error: "персонажа не видно гравцеві" } };
  await a.sheet.render({ force: true });
  const el = await until(() => (a.sheet.rendered && visible(a.sheet.element) ? a.sheet.element : null), { timeout: 10000, what: "аркуш персонажа" }).catch(() => null);
  const ok = !!el && a.isOwner;
  const title = el?.querySelector(".window-title")?.textContent?.trim() ?? null;
  await a.sheet.close({ animate: false });
  return { ok, details: { owner: a.isOwner, title } };
}

/** Step 4 (A): «ТЕСТ Бандит», both tokens on «Бойова мапа», the scene activated */
export async function setupBattle(actorId) {
  const L = await live();
  const D = await mod("helpers/default-scene.mjs");
  const { tokenLevel } = await mod("helpers/token-level.mjs");
  const scene = D.findBattleScene();
  if (!scene) throw new Error("у світі немає «Бойова мапа»");
  const bandit = await Actor.implementation.create(L.mark({ name: "ТЕСТ Бандит", type: "enemy",
    system: { hp: { value: 30, max: 30 } } }, TAG));
  const pc = game.actors.get(actorId);
  const g = scene.grid.size, { sceneX, sceneY } = scene.dimensions;
  // Foundry 14: a token needs a level of its scene, or nobody sees it (helpers/token-level.mjs, as the system's own tokens)
  const at = (cx, cy) => ({ x: sceneX + cx * g, y: sceneY + cy * g, ...tokenLevel(scene) });
  const docs = [await pc.getTokenDocument({ ...at(8, 8), hidden: false }), await bandit.getTokenDocument({ ...at(11, 8), hidden: false })];
  const made = await scene.createEmbeddedDocuments("Token", docs.map((d) => d.toObject()));
  await scene.activate();
  await until(() => canvas.ready && canvas.scene?.id === scene.id, { timeout: 30000, what: "бойова мапа в A" });
  const [pcTok, banditTok] = made;
  return { scene: scene.id, pcToken: pcTok.id, banditToken: banditTok.id, banditActor: bandit.id };
}

/** Step 4 (each window): the battle scene is the one shown; the player sees the dock's battle row */
export async function battleSeen(sceneId, { player = false, timeout = 90000 } = {}) {
  const t0 = Date.now();
  const on = await until(() => canvas.ready && canvas.scene?.id === sceneId, { timeout, what: "бойова мапа" }).catch(() => false);
  const problems = on ? [] : [`за ${timeout / 1000} с показано сцену «${canvas.scene?.name ?? "—"}», а не бойову (активна: «${game.scenes.active?.name ?? "—"}», полотно ready: ${!!canvas.ready})`];
  let row = null;
  if (player) {
    row = await until(() => { const r = document.querySelector("#pust-mapdock .pust-md-trow.is-battle"); return r && !r.hidden && visible(r) ? r : null; },
      { timeout: 10000, what: "рядок бою гравця" }).catch(() => null);
    if (!row) problems.push("у гравця немає рядка бою (#pust-mapdock .pust-md-trow.is-battle)");
  }
  return { ok: !problems.length, details: { problems, scene: canvas.scene?.name ?? null, battleRow: player ? !!row : undefined, waited: Date.now() - t0 } };
}

/** The token's actor's HP (an unlinked enemy keeps them on its token) */
export function hpOf(sceneId, tokenId) {
  const t = game.scenes.get(sceneId)?.tokens.get(tokenId);
  return t?.actor ? { hp: t.actor.system.hp.value, max: t.actor.system.hp.max, unconscious: unconsciousOn(t.actor) } : null;
}

/** Step 5 (B): the attack with the held weapon at the bandit; the card and the verdict */
export async function playerAttack(actorId, banditToken) {
  const since = Date.now();
  const a = game.actors.get(actorId);
  await until(() => canvas.ready && canvas.tokens.get(banditToken), { timeout: 15000, what: "токен бандита в гравця" }).catch((e) => {
    const t = canvas.scene?.tokens.get(banditToken);
    throw new Error(`${e.message}: у документі сцени ${t ? `є (рівень ${t.level ?? "—"}, hidden ${t.hidden})` : "немає"}, рівень полотна ${canvas.level?.id ?? "—"}`);
  });
  canvas.tokens.setTargets([banditToken], { mode: "replace" });
  const P = await mod("applications/check-panel.mjs");
  const app = P.openCheckPanel(a, { weapon: 0 });
  const roll = await until(() => app.element?.querySelector('button[data-r="roll"]'), { timeout: 10000, what: "кнопка «Кинути перевірку»" });
  roll.click();
  const msg = await until(() => game.messages.find((m) => createdAt(m) >= since && m.speaker?.actor === actorId),
    { timeout: 15000, what: "картка перевірки в чаті" });
  const res = await until(() => app.element?.querySelector(".rres"), { timeout: 10000, what: "результат перевірки" });
  const verdict = Number((res.className.match(/\bv(\d)\b/) ?? [])[1] ?? -1);
  return { since, msg: msg.id, verdict, dmgButton: !!app.element.querySelector('button[data-r="dmg"]') };
}

/** Step 5 (A, A2): the card is here, exactly once */
export async function cardHere(msgId, since) {
  const m = await until(() => game.messages.get(msgId), { timeout: 15000, what: "картка перевірки" }).catch(() => null);
  const same = game.messages.filter((x) => createdAt(x) >= since && x.speaker?.actor && x.speaker.actor === m?.speaker?.actor).length;
  return { ok: !!m && same === 1, details: { here: !!m, cards: same } };
}

/** Step 6 (B): «Кинути шкоду» on the attack, at the bandit (the player's press goes to the GM) */
export async function playerDamage(actorId, banditToken) {
  const since = Date.now();
  const P = await mod("applications/check-panel.mjs");
  const app = P.openCheckPanel(game.actors.get(actorId));
  canvas.tokens.setTargets([banditToken], { mode: "replace" });
  const btn = await until(() => { const b = app.element?.querySelector('button[data-r="dmg"]'); return b && !b.disabled ? b : null; },
    { timeout: 10000, what: "кнопка шкоди" });
  btn.click();
  const card = await until(() => cards(since, "pust-dmgapply")[0], { timeout: 15000, what: "картка застосованої шкоди" }).catch(() => null);
  await app.close({ animate: false });
  const notes = [...document.querySelectorAll("#notifications .notification")].map((n) => n.textContent.trim()).filter((t) => /Доглядач/.test(t));
  return { since, applied: !!card, notes };
}

/** Step 6 (A): the bandit lost exactly the card's damage, once; one card per audience */
export async function damageOnce(sceneId, banditToken, hp0, since, { quiet = 5000 } = {}) {
  await until(() => (hpOf(sceneId, banditToken)?.hp ?? hp0) !== hp0, { timeout: 15000, what: "ОЗ бандита змінились" }).catch(() => null);
  await sleep(quiet); // a second window applying it again would show by now
  const hp = hpOf(sceneId, banditToken)?.hp;
  const list = cards(since, "pust-dmgapply");
  const aud = perAudience(list);
  const delta = Number((String(list[0]?.content ?? "").match(/pust-da-delta lost">−(\d+)/) ?? [])[1] ?? NaN);
  const problems = [];
  if (hp === hp0) problems.push("ОЗ бандита не змінились");
  if (aud.open > 1 || aud.whisper > 1) problems.push(`карток шкоди: ${aud.open} відкритих, ${aud.whisper} Доглядачу (має бути по одній)`);
  if (Number.isFinite(delta) && hp0 - hp !== delta) problems.push(`ОЗ ${hp0} → ${hp}, а картка каже −${delta}`);
  if (!list.length) problems.push("картки шкоди немає");
  return { ok: !problems.length, details: { problems, hp0, hp, delta, cards: aud } };
}

/** Step 7 (A): the «Битва» panel's «Завдати шкоди» / «Лікувати» on one token, as the GM presses them */
export async function gmPanel(act, sceneId, tokenId, expr) {
  const B = await mod("applications/battle-panel.mjs");
  await B.fillDamage({ expr: String(expr), type: "phys", ignore: true });
  canvas.tokens.setTargets([tokenId], { mode: "replace" });
  const btn = await until(() => [...document.querySelectorAll(`[data-battle="${act}"]`)].find((b) => visible(b) && !b.disabled),
    { timeout: 10000, what: `кнопка «${act === "hit" ? "Завдати шкоди" : "Лікувати"}» панелі «Битва»` });
  const before = hpOf(sceneId, tokenId)?.hp;
  btn.click();
  await until(() => hpOf(sceneId, tokenId)?.hp !== before, { timeout: 10000, what: "ОЗ змінились" });
  return hpOf(sceneId, tokenId);
}

/** Step 7 (any window): the HP and the «Unconscious» copies settle; the player's open sheet shows the HP */
export async function hpSettled(sceneId, tokenId, want, { unconscious = 0, quiet = 4000, sheet = false } = {}) {
  await until(() => hpOf(sceneId, tokenId)?.hp === want, { timeout: 15000, what: `ОЗ = ${want}` }).catch(() => null);
  if (unconscious) await until(() => hpOf(sceneId, tokenId)?.unconscious >= 1, { timeout: 10000, what: "стан непритомності" }).catch(() => null);
  await sleep(quiet);
  const s = hpOf(sceneId, tokenId);
  const problems = [];
  if (s?.hp !== want) problems.push(`ОЗ ${s?.hp}, а мало бути ${want}`);
  if (s?.unconscious !== unconscious) problems.push(`станів «Unconscious»: ${s?.unconscious} (має бути ${unconscious})`);
  let shown = null;
  if (sheet) {
    const a = game.scenes.get(sceneId).tokens.get(tokenId).actor;
    await a.sheet.render({ force: true });
    await until(() => a.sheet.rendered, { timeout: 10000, what: "аркуш" }).catch(() => null);
    await sleep(300);
    const root = a.sheet.element;
    const input = root?.querySelector('[name="system.hp.value"]');
    shown = input ? Number(input.value) : null;
    if (shown === null) {
      const m = (root?.textContent ?? "").match(new RegExp(`(^|\\D)${want}\\s*/\\s*${s?.max}(\\D|$)`));
      shown = m ? want : null;
    }
    if (shown !== want) problems.push(`аркуш гравця показує ОЗ ${shown ?? "—"}, а не ${want}`);
    await a.sheet.close({ animate: false });
  }
  return { ok: !problems.length, details: { problems, ...s, sheet: sheet ? shown : undefined } };
}

/** Step 8 (A): «Кінець сцени» pressed twice (it asks «Точно?»), then «Мапа Пустки» back */
export async function endSceneAndMap() {
  const since = Date.now();
  const press = async () => {
    const b = await until(() => [...document.querySelectorAll('.pust-end-btn[data-end="scene"]')].find((x) => visible(x) && !x.disabled),
      { timeout: 10000, what: "кнопка «Кінець сцени»" });
    b.click();
  };
  await press();
  await sleep(300);
  await press();
  const card = await until(() => cards(since, "pust-end-scene")[0], { timeout: 15000, what: "картка «Кінець сцени»" }).catch(() => null);
  const D = await mod("helpers/default-scene.mjs");
  const map = D.findMapScene();
  if (!map) throw new Error("у світі немає «Мапа Пустки»");
  await map.activate();
  await until(() => canvas.ready && canvas.scene?.id === map.id, { timeout: 30000, what: "«Мапа Пустки» в A" });
  return { since, map: map.id, endCard: !!card };
}

/** Step 8 (each window): «Мапа Пустки» shown, no battle row, at most one «Кінець сцени» card per audience */
export async function afterBattle(mapId, since, { player = false, quiet = 3000 } = {}) {
  const on = await until(() => canvas.ready && canvas.scene?.id === mapId, { timeout: 30000, what: "«Мапа Пустки»" }).catch(() => false);
  await sleep(quiet);
  const problems = on ? [] : [`показано сцену «${canvas.scene?.name ?? "—"}», а не «Мапа Пустки»`];
  const row = document.querySelector("#pust-mapdock .pust-md-trow.is-battle");
  if (row && visible(row)) problems.push("рядок бою досі видно");
  const aud = perAudience(cards(since, "pust-end-scene"));
  if (aud.open > 1 || aud.whisper > 1) problems.push(`карток «Кінець сцени»: ${aud.open} відкритих, ${aud.whisper} Доглядачу`);
  if (!player && !aud.open && !aud.whisper) problems.push("картки «Кінець сцени» немає");
  return { ok: !problems.length, details: { problems, scene: canvas.scene?.name ?? null, cards: aud } };
}
