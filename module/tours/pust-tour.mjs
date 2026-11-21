/**
 * The system's tours (author, 2026-11-16; module/tours/tour-data.mjs holds the steps): Foundry's own Tour (highlight, the
 * locked tooltip next to the element, progress per user, «Керування турами») with
 *   – a Ukrainian step card of our own (Foundry's says «Step 1 of 9»): «Назад», «Крок N з M», «Далі» / «Готово», × to leave;
 *   – `prepare` before a step: open a window, view a scene, unfold a panel… (see PREPARE), then the element is waited for;
 *   – a missing element doesn't break the tour (Foundry throws): the step is shown in the middle with its `fallback` text;
 *   – step buttons of our own (`actions`, see ACTIONS), e.g. importing «Швидкий старт»;
 *   – the next tour offered by our own dialog (Foundry's is in its own words).
 */
import { findBattleScene, findMapScene, isBattleScene } from "../helpers/default-scene.mjs";
import { notify } from "../helpers/notify.mjs";
import { serialQueue } from "./tour-queue.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Waits up to `ms` for a selector to find a visible element */
export async function waitFor(selector, ms = 2500) {
  const t0 = Date.now();
  for (;;) {
    const el = document.querySelector(selector);
    if (el && el.getClientRects().length) return el;
    if (Date.now() - t0 > ms) return null;
    await sleep(80);
  }
}

/** The actor a step shows: the user's own (a player: their assigned character, else one they own; the GM: any of the world),
 * else an example (author, 2026-11-16) */
async function actorFor(what) {
  const [kind, name] = String(what).split("|");
  // an enemy (author, 2026-11-16): one standing on the viewed scene, the one with most moves (its card shows them all),
  // else the world's enemy with most moves
  if (kind === "enemy" && !name && !forceDemo) {
    const moves = (a) => (a?.system?.moves?.length ?? 0) + (a?.system?.attacks?.length ?? 0) / 10;
    const best = (list) => list.filter((a) => a?.type === "enemy" && a.testUserPermission(game.user, "LIMITED")).sort((x, y) => moves(y) - moves(x))[0];
    const found = best((canvas?.scene?.tokens ?? []).map((t) => t.actor)) ?? best([...game.actors]);
    if (found) return found;
  }
  // a world actor only when this user may open its sheet (author, 2026-11-17: a player was shown the GM's caravan, whose
  // sheet he can't open, so the caravan tour fell back on every step); else the example
  const level = kind === "enemy" || kind === "place" ? "LIMITED" : "OBSERVER";
  const may = (a) => a.testUserPermission(game.user, level);
  const own = forceDemo ? null : kind === "pc"
    ? game.user.character ?? game.actors.find((a) => a.type === "character" && a.isOwner)
    : game.actors.find((a) => a.type === kind && (!name || a.name === name) && may(a)) ?? game.actors.find((a) => a.type === kind && may(a));
  return own ?? demoActor(kind === "pc" ? "character" : kind);
}

/**
 * Examples (author, 2026-11-16): a world without the needed actor (no «Швидкий старт», no character of the player yet) is
 * shown a copy from the system's «Швидкий старт» adventure — kept in memory only: nothing is added to the world, nothing
 * stays after the tour, a player may open it too. Its window title says «(приклад)»; changes in it are not saved.
 */
/** the audit's switch: show the examples even where the world has the actors */
let forceDemo = false;
export const setForceDemo = (on) => { forceDemo = !!on; };
const DEMO_NAMES = { character: "Волті", caravan: "Останній Шанс", enemy: "Папа Детонатор" };
const demos = new Map();
async function demoActor(type) {
  if (demos.has(type)) return demos.get(type);
  if (type === "place") { // no place in «Швидкий старт»: a new settlement's card
    const actor = new CONFIG.Actor.documentClass({ name: "Нове поселення", type: "place", system: { kind: "town" }, ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER } });
    Object.defineProperty(actor.sheet, "title", { configurable: true, get: () => `${actor.name} (приклад)` });
    demos.set(type, actor);
    return actor;
  }
  try {
    const pack = game.packs.get(`${game.system.id}.quickstart`);
    const entry = (await pack?.getIndex())?.contents?.[0];
    if (!entry) return null;
    const adv = await pack.getDocument(entry._id);
    const src = adv.actors.find((a) => a.type === type && a.name === DEMO_NAMES[type]) ?? adv.actors.find((a) => a.type === type);
    if (!src) return null;
    const data = src.toObject();
    delete data._id;
    delete data.folder;
    data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
    const actor = new CONFIG.Actor.documentClass(data);
    actor.pustTourDemo = true; // the enemy card shows its world buttons for it, inert (enemy-sheet.mjs)
    const sheet = actor.sheet;
    Object.defineProperty(sheet, "title", { configurable: true, get: () => `${actor.name} (приклад)` });
    demos.set(type, actor);
    return actor;
  } catch (err) {
    console.warn("Пустельники | tour example not made", err);
    return null;
  }
}

/**
 * The battle map the tour shows (author, 2026-11-17: a new world with «Швидкий старт» went to the empty «Бойова мапа»): the
 * battle scene this user may view with the most tokens, then zones (the quick start's battles), else «Бойова мапа»
 */
function bestBattleScene() {
  const sys = game.system.id;
  const zones = (s) => s.drawings.filter((d) => d.getFlag(sys, "battleZone")).length;
  const list = game.scenes.filter((s) => isBattleScene(s) && (game.user.isGM || s.testUserPermission(game.user, "LIMITED")));
  list.sort((a, b) => (b.tokens.size - a.tokens.size) || (zones(b) - zones(a)));
  const best = list[0];
  return best && (best.tokens.size || zones(best)) ? best : (findBattleScene() ?? best ?? null);
}

/** Closes the system's windows the tour opened (sheets, terminal, check panel) */
async function closeAll() {
  tracked.clear();
  for (const app of foundry.applications.instances.values()) {
    if (app.document?.documentName === "Actor" || app.id === "pust-terminal" || app.options?.classes?.includes("pust-check")) {
      try { await app.close({ animate: false }); } catch (_) { /* already closed */ }
    }
  }
}

/**
 * Windows the tour opened (author, 2026-11-16: an example stayed open on the next steps, and «Назад» didn't bring back what a
 * step shows): app → kind ("character", "enemy", "caravan", "place", "terminal", "check"). Before each step the ones it
 * doesn't need are closed, and the ones it needs but are gone are opened again; windows the user opened are left alone.
 */
const tracked = new Map();
const trackApp = (app, kind) => { if (app) tracked.set(app, kind); };
/** What a step needs on screen: from what it opens and from where its element is */
export function needsOf(step) {
  const k = new Set();
  for (const p of [step.prepare ?? []].flat()) {
    const [n, arg = ""] = String(p).split(":");
    if (n === "sheet") k.add(arg === "pc" ? "character" : arg.split("|")[0]);
    if (n === "terminal") k.add("terminal");
    if (n === "check") { k.add("check"); k.add("character"); }
  }
  const sel = step.selector ?? "";
  if (sel.startsWith(".pust-sheet:not(")) k.add("character");
  else {
    if (sel.includes(".pust-caravan-sheet")) k.add("caravan");
    if (sel.includes(".pust-en-sheet")) k.add("enemy");
    if (sel.includes(".pust-place-sheet")) k.add("place");
  }
  if (sel.includes("#pust-terminal")) k.add("terminal");
  if (sel.includes(".pust-check")) { k.add("check"); k.add("character"); }
  return k;
}
async function closeUnneeded(needs) {
  for (const [app, kind] of [...tracked]) {
    if (needs.has(kind) && app.rendered) continue;
    tracked.delete(app);
    if (!needs.has(kind) && app.rendered) { try { await app.close({ animate: false }); } catch (_) { /* gone */ } }
  }
}

/** Panels the tour opened for a step (the travel window, the counter form, the example counters): closed when a step that
 * doesn't ask for them comes, and when the tour ends */
/** «Сповіщення й попередження» as an example (author, 2026-11-16): a sheet with nothing to warn about has no block, so the step
 *  puts one in its place over the tabs, in the page only — the sheet's next render takes it away */
const ISSUES_DEMO = [["warn", "Не розподілено пунктів атрибутів: 1."], ["warn", "Можна обрати ще навичок на рівні учня: 1."], ["bad", "Перків більше, ніж слотів: 4 з 3."]];
function setIssuesDemo(on) {
  document.querySelectorAll(".pust-issues.pust-demo-issues").forEach((x) => x.remove());
  if (!on) return;
  const sheet = [...document.querySelectorAll(".pust-sheet:not(.pust-caravan-sheet):not(.pust-en-sheet):not(.pust-place-sheet)")].find((x) => x.offsetParent);
  const nav = sheet?.querySelector("nav.pust-tabs");
  if (!nav) return;
  // a real block, folded by default (author, 2026-11-20; U1): opened in the page for the step, the sheet's next render folds it
  const real = sheet.querySelector(".pust-issues:not(.pust-demo-issues)");
  if (real) { real.classList.remove("folded"); return; }
  const box = document.createElement("section");
  box.className = "pust-issues pust-demo-issues";
  box.innerHTML = `<div class="pust-issues-hd"><i class="fa-solid fa-triangle-exclamation"></i> Сповіщення й попередження <small>${ISSUES_DEMO.length}</small></div>`
    + ISSUES_DEMO.map(([lvl, msg]) => `<div class="pust-issue ${lvl}">${msg}</div>`).join("");
  nav.before(box);
}
const opened = { issues: false, travel: false, form: false, demo: false, note: false, move: false, zone: false, eform: false, tgt: false, newen: false, cargo: null, gear: null, check: false, dock: false, dockDemo: false, zframe: false, round: false, tok: false, compact: null, weather: false, endStrip: false };
/**
 * «Компактний режим» (author, 2026-11-18): the step switches the sheet on show to compact by its own switch, and the view it
 * had comes back when the step is left or the tour ends, so the demonstration never changes the user's remembered choice
 */
async function restoreCompact() {
  const app = opened.compact;
  opened.compact = null;
  if (!app?.ui?.compact) return;
  const full = app.element?.querySelector('[data-action="compactToggle"][data-v="0"]');
  const back = keepStored(app); // the stored choice was never changed by the step
  if (app.rendered && full) { full.click(); await sleep(250); }
  else app.ui.compact = false; // closed meanwhile
  back();
}
/**
 * The tours show the full sheet (author, 2026-11-18): a sheet the user keeps compact is switched to «Повний» when a step
 * opens it (its blocks and tabs are what the steps light), and back to «Компактний» when the tour ends
 */
const forcedFull = new Set();
/** the sheets' remembered choice (character-sheet-v2.mjs / caravan-sheet-v2.mjs compactKey) kept as it was while a switch
 *  clicked for the tour changes the view: a reload in the middle of a tour doesn't change the user's choice */
const compactKey = (app) => `pustelnyky-compact-${game.user.id}-${app.document.id}`;
function keepStored(app) {
  let was = null;
  try { was = localStorage.getItem(compactKey(app)); } catch (_) { return () => {}; }
  return () => { try { if (was === null) localStorage.removeItem(compactKey(app)); else localStorage.setItem(compactKey(app), was); } catch (_) { /* not kept */ } };
}
async function showFull(app) {
  if (!app?.ui?.compact) return;
  const full = app.element?.querySelector('[data-action="compactToggle"][data-v="0"]');
  if (!full) return;
  forcedFull.add(app);
  const back = keepStored(app);
  full.click();
  await waitFor(`#${app.id} .pust-sheet-inner:not(.pust-compact)`);
  back();
  await sleep(200);
}
async function restoreFull() {
  for (const app of [...forcedFull]) {
    forcedFull.delete(app);
    if (app.ui?.compact) continue;
    const cmp = app.rendered ? app.element?.querySelector('[data-action="compactToggle"][data-v="1"]') : null;
    const back = keepStored(app);
    if (cmp) { cmp.click(); await sleep(250); }
    else app.ui.compact = true; // closed meanwhile
    back();
  }
}
async function closeTransient(keep = new Set()) {
  if (opened.compact && !keep.has("compactDemo")) await restoreCompact();
  if (opened.endStrip && !keep.has("endStrip")) { document.body.classList.remove("pust-end-show"); opened.endStrip = false; }
  if (opened.issues && !keep.has("issuesDemo")) { setIssuesDemo(false); opened.issues = false; }
  if (opened.tok && !keep.has("tokenDemo") && !keep.has("caravanToken")) { await (await import("../canvas/token-demo.mjs")).setTokenDemo(false); opened.tok = false; }
  if (opened.zframe && !keep.has("zoneFrame")) { await (await import("../canvas/battle-zones.mjs")).setZoneFrame(null); opened.zframe = false; }
  if (opened.round && !keep.has("roundDemo")) { document.querySelectorAll(".pust-demo-msg").forEach((x) => x.remove()); opened.round = false; }
  if (opened.dock && !keep.has("dockCheck")) { await foundry.applications.instances.get("pust-check-dock")?.close({ animate: false }); opened.dock = false; }
  if (opened.dockDemo && !keep.has("dockDemo")) {
    (await import("../applications/map-dock.mjs")).setDockDemo(null);
    (await import("../applications/check-panel.mjs")).setDockDemoActor(null);
    opened.dockDemo = false;
  }
  if (opened.check && !keep.has("checkDemo")) { await (await import("../applications/check-panel.mjs")).setCheckDemo(null); opened.check = false; }
  if (opened.gear && !keep.has("gearDemo")) { try { await opened.gear.close({ animate: false }); } catch (_) { /* gone */ } opened.gear = null; }
  if (opened.cargo && !keep.has("cargoDemo")) { try { await opened.cargo.close({ animate: false }); } catch (_) { /* gone */ } opened.cargo = null; }
  if (opened.weather && !keep.has("weather")) { await foundry.applications.instances.get("pust-weather")?.close({ animate: false }); opened.weather = false; }
  if (opened.newen && !keep.has("enemyCreate")) { await foundry.applications.instances.get("pust-enemy-create")?.close(); opened.newen = false; }
  if (opened.tgt && !keep.has("targetDemo")) { await (await import("../canvas/target-demo.mjs")).setTargetDemo(false); opened.tgt = false; }
  if (opened.eform && !keep.has("enemyForm")) { await (await import("../applications/battle-panel.mjs")).setEnemyFormOpen(false); opened.eform = false; }
  if (opened.zone && !keep.has("zoneDemo")) { (await import("../canvas/battle-zones.mjs")).setZoneDemo(false); opened.zone = false; }
  if (opened.move && !keep.has("moveDemo")) { (await import("../canvas/caravan-move.mjs")).setMoveDemo(false); opened.move = false; }
  if (opened.note && !keep.has("noteDemo")) { (await import("../canvas/map-notes.mjs")).setNoteDemo(false); opened.note = false; }
  if (opened.travel && !keep.has("travel")) { (await import("../applications/map-dock.mjs")).setTravelOpen(false); opened.travel = false; }
  const G = (opened.form || opened.demo) ? await import("../applications/game-counters.mjs") : null;
  if (opened.form && !keep.has("counterForm")) { G.setCountersForm(false); opened.form = false; }
  if (opened.demo && !keep.has("counterDemo")) { G.setCountersDemo(false); opened.demo = false; }
}

/** Preparations a step may ask for: "name" or "name:arg" (a string or an array of them) */
export const PREPARE = {
  wait: (ms) => sleep(Number(ms) || 300),
  sidebar: async (tab) => {
    if (ui.sidebar?.changeTab) ui.sidebar.changeTab(tab, "primary"); else ui[tab]?.activate?.();
    if (ui.sidebar && !ui.sidebar.expanded) ui.sidebar.expand?.();
    // the sidebar slides open: the highlight is measured once it stands still (2026-11-21: from a collapsed sidebar the slide
    // was still under way after a fixed 500 ms, and the step was lit past the screen's right edge)
    await sleep(300);
    const at = () => Math.round(document.querySelector("#sidebar")?.getBoundingClientRect().left ?? 0);
    for (let i = 0, was = at(); i < 20; i++) { await sleep(100); const now = at(); if (now === was && now < innerWidth - 200) break; was = now; }
  },
  scene: async (which) => {
    const s = which === "map" ? findMapScene() : which === "battle" ? bestBattleScene()
      : game.scenes.getName(which);
    if (s && canvas.scene?.id !== s.id) { await s.view(); await sleep(600); }
  },
  /** a scene of this kind, the viewed one when it already is (every step of a tour that needs it: a tour resumed after a
   *  reload starts on the world's active scene; author, 2026-11-16) */
  sceneKind: async (kind) => {
    if (!canvas.scene || isBattleScene(canvas.scene) !== (kind === "battle")) await PREPARE.scene(kind);
  },
  layer: (name) => ui.controls?.activate?.({ control: name }),
  terminal: async (tab) => {
    const { openTerminal } = await import("../applications/terminal.mjs");
    openTerminal();
    await waitFor("#pust-terminal");
    trackApp(foundry.applications.instances.get("pust-terminal"), "terminal");
    if (tab) document.querySelector(`#pust-terminal .pust-term-tabs [data-tab="${tab}"]`)?.click();
    await sleep(250);
  },
  sheet: async (what) => {
    const a = await actorFor(what);
    if (!a) return;
    if (!a.sheet.rendered) await a.sheet.render({ force: true });
    trackApp(a.sheet, a.type);
    await sleep(300);
    await showFull(a.sheet);
    // by the left edge, so the step card has room beside it
    try { a.sheet.setPosition({ left: 110, top: 70 }); } catch (_) { /* a sheet without a position */ }
    await sleep(150);
  },
  /** a <details> fold opened (its summary clicked, so the sheet remembers it) */
  open: async (sel) => {
    const d = document.querySelector(sel);
    if (d && !d.open) { (d.querySelector(":scope > summary") ?? d).click(); await sleep(250); }
  },
  click: async (sel) => { document.querySelector(sel)?.click(); await sleep(250); },
  /** the shown character's or caravan's sheet switched to «Компактний» (restoreCompact brings back its view) */
  compactDemo: async (kind) => {
    const app = [...tracked].find(([a, k]) => k === kind && a.rendered)?.[0];
    if (!app || app.ui?.compact) return;
    const btn = app.element?.querySelector('[data-action="compactToggle"][data-v="1"]');
    if (!btn) return;
    opened.compact = app;
    // from the top, so the switch shows: the render keeps the full sheet's scroll (the view opened in the middle)
    app.element.querySelectorAll(".window-content, .pust-body").forEach((x) => { x.scrollTop = 0; });
    const back = keepStored(app);
    btn.click();
    await waitFor(`#${app.id} .pust-compact`);
    back();
    // from the top, so the switch shows (the full sheet's scroll came back with the render: the view opened in the middle)
    const top = () => app.element?.querySelectorAll(".window-content").forEach((x) => { x.scrollTop = 0; });
    await sleep(300); top();
    await sleep(200); top();
  },
  /** «Зробити перевірку» of the user's character, opened when it isn't open yet (the sheet's button) */
  check: async () => {
    // already open (perhaps redrawing just now): wait for it rather than press the button, which would close it
    if (!(await waitFor(".pust-check", 600))) {
      await PREPARE.sheet("pc");
      document.querySelector(".pust-sheet .pust-check-btn")?.click();
      await waitFor(".pust-check");
    }
    // by the left edge too, so the step card has room beside it (in a window floating free; the docked one stays put)
    for (const app of foundry.applications.instances.values()) {
      if (app.rendered && app.element?.classList.contains("pust-check")) trackApp(app, "check");
      if (app.rendered && app.element?.classList.contains("pust-check") && app.options?.window?.frame !== false) {
        try { app.setPosition({ left: 110 }); } catch (_) { /* no position */ }
      }
    }
    await sleep(150);
  },
  unfold: async (unit) => {
    // the panels fold and unfold on pointerup (map-dock.mjs drag handler), so a click() doesn't reach them
    if (document.querySelector(`[data-unit="${unit}"]`)?.classList.contains("folded")) (await import("../applications/map-dock.mjs")).unfoldUnit(unit);
    await sleep(200);
  },
  closeAll,
  /** an example sticker with its editor open, in memory only (never written, players never see it) */
  /**
   * «Вантаж і пасажири» with example rows (author, 2026-11-16): a copy of the caravan on show, kept in memory, with two cargo
   * rows (one far, one damaged) and a passenger, opened over it on the cargo tab; nothing is written to the caravan
   */
  cargoDemo: async () => {
    const shown = [...foundry.applications.instances.values()].find((a) => a.rendered && a.document?.type === "caravan" && !a.element?.classList.contains("pust-demo-cargo"));
    const base = shown?.document ?? await demoActor("caravan");
    if (!base) return;
    const data = base.toObject();
    delete data._id; delete data.folder;
    data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
    data.items = (data.items ?? []).filter((i) => !["cargo", "passenger"].includes(i.type)).concat([
      { type: "cargo", name: "Ящики ядер-коли", system: { price: 3, quantity: 2, note: "До Нью-Рино, у бар Шини", engine: { far: true } } },
      { type: "cargo", name: "Медикаменти", system: { price: 4, quantity: 1, note: "Лікарю в Джанктауні", engine: { hurt: true } } },
      { type: "passenger", name: "Мандрівний торговець", system: { engine: { note: "До Сховища 13", price: "2", qty: "1" } } },
    ]);
    const actor = new CONFIG.Actor.documentClass(data);
    Object.defineProperty(actor.sheet, "title", { configurable: true, get: () => `${actor.name} (приклад)` });
    await actor.sheet.render({ force: true });
    await waitFor(".pust-caravan-sheet .pust-body");
    actor.sheet.element.classList.add("pust-demo-cargo");
    const pos = shown?.position;
    if (pos) actor.sheet.setPosition({ left: pos.left, top: pos.top, width: pos.width });
    actor.sheet.element.querySelector('[data-tab="cargo"]')?.click();
    opened.cargo = actor.sheet;
    await sleep(400);
    actor.sheet.element.classList.add("pust-demo-cargo"); // kept through the tab's re-render
    actor.sheet.bringToFront(); // over the caravan it copies
  },
  /**
   * «Мотлох» with a stimpak (author, 2026-11-16): a copy of «Швидкий старт»'s Волті, kept in memory, with a stimpak first in
   * «Інший мотлох», so «Вжити» and «На ціль» are there; opened over the character on «Мотлох», its cards inert (nothing is written)
   */
  gearDemo: async () => {
    const shown = [...foundry.applications.instances.values()].find((a) => a.rendered && a.document?.type === "character" && !a.element?.classList.contains("pust-demo-gear"));
    // always «Швидкий старт»'s Волті as the pack has her (author, 2026-11-16: not the character with the user's own changes)
    const base = await demoActor("character") ?? shown?.document;
    if (!base) return;
    const data = base.toObject();
    delete data._id; delete data.folder;
    data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
    // one weapon, one armour, the stimpak and one more thing: the three columns fit on screen
    const GEAR = ["weapon", "armor", "tool"], firstOf = (t) => (data.items ?? []).filter((i) => i.type === t).slice(0, 1);
    const stim = (data.items ?? []).find((i) => /^стимпак/i.test(i.name))
      ?? { type: "tool", name: "Стимпак", system: { quantity: 2, note: "", engine: { n: "Стимпак", q: "2", note: "", price: "2 к" } } };
    const other = (data.items ?? []).filter((i) => i.type === "tool" && i !== stim).slice(0, 1);
    data.items = [...(data.items ?? []).filter((i) => !GEAR.includes(i.type)), ...firstOf("weapon"), ...firstOf("armor"),
      { ...stim, sort: -100 }, ...other];
    // without «Guns. Lots of Guns» (author, 2026-11-16): the example shows the core book's cards
    foundry.utils.setProperty(data, "system.options.guns", false);
    foundry.utils.setProperty(data, "system.engine.set.guns", false);
    const actor = new CONFIG.Actor.documentClass(data);
    Object.defineProperty(actor.sheet, "title", { configurable: true, get: () => `${actor.name} (приклад)` });
    await actor.sheet.render({ force: true });
    await sleep(300);
    const pos = shown?.position;
    if (pos) actor.sheet.setPosition({ left: pos.left, top: pos.top, width: pos.width, height: pos.height });
    actor.sheet.element.querySelector('[data-tab="gear"]')?.click();
    opened.gear = actor.sheet;
    await sleep(500);
    actor.sheet.element.classList.add("pust-demo-gear");
    actor.sheet.element.querySelector(".pust-gear-cols")?.setAttribute("inert", "");
    actor.sheet.bringToFront(); // over the character it copies
  },
  /** the player's token as an example, a preview on the scene only (token-demo.mjs) */
  /** the caravan's token framed (token-demo.mjs); a scene without one: a preview of it */
  caravanToken: async () => { await (await import("../canvas/token-demo.mjs")).setCaravanFrame(true, await actorFor("caravan")); opened.tok = true; await sleep(150); },
  tokenDemo: async () => { await (await import("../canvas/token-demo.mjs")).setTokenDemo(true, await actorFor("pc")); opened.tok = true; await sleep(150); },
  /** a frame over the scene's zone with most aspects ("zone") or over its «Обрати всіх» ("target") — battle-zones.mjs */
  zoneFrame: async (part) => { await (await import("../canvas/battle-zones.mjs")).setZoneFrame(part || "zone"); opened.zframe = true; await sleep(150); },
  /** an example chat card «Почалося коло дій» at the end of the chat log, in the page only (nothing posted) */
  roundDemo: async () => {
    await PREPARE.sidebar("chat");
    document.querySelectorAll(".pust-demo-msg").forEach((x) => x.remove());
    const log = [...document.querySelectorAll("#chat .chat-log, #chat-log, .chat-log")].find((e) => e.offsetParent);
    if (!log) return;
    const li = document.createElement("li");
    li.className = "chat-message message flexcol pust-bare pust-demo-msg";
    li.innerHTML = `<div class="message-content"><div class="pust-chat pust-round"><div class="pust-round-hd"><i class="fa-solid fa-rotate"></i><span>Почалося коло дій</span><b>1</b></div><p>Спершу діють гравці, потім Доглядач робить хід і переміщує одного НІПа.</p></div></div>`;
    log.append(li);
    li.scrollIntoView({ block: "end" });
    opened.round = true;
    await sleep(200);
  },
  /** the player's «Зробити перевірку» opened under its button on the panel (author, 2026-11-16) */
  /** a player without a character of his own (author, 2026-11-17): the panel's «Зробити перевірку», Fate and Припаси rows
   *  shown for the tour's example character (in memory; their buttons do nothing) */
  dockDemo: async () => {
    if (game.user.isGM || game.actors.some((a) => a.type === "character" && a.isOwner)) return;
    const actor = await demoActor("character");
    if (!actor) return;
    (await import("../applications/check-panel.mjs")).setDockDemoActor(actor);
    (await import("../applications/map-dock.mjs")).setDockDemo(actor);
    opened.dockDemo = true;
    await sleep(200);
  },
  /** a result in the terminal's tab (author, 2026-11-17: «В журнал» / «Розмістити на сцені» are there only after a
   *  generation): «case» or «battle» generated once when the tab has none (only in the window, nothing written) */
  termGen: async (kind) => {
    const T = "#pust-terminal";
    const result = kind === "case" ? `${T} [data-action="toJournal"][data-what="case"]` : `${T} [data-action="battleCreate"][data-mode="place"]`;
    if (document.querySelector(result)) return;
    document.querySelector(`${T} [data-action="${kind === "case" ? "caseGen" : "battleGen"}"]`)?.click();
    await waitFor(result);
    await sleep(200);
  },
  dockCheck: async () => {
    if (!document.getElementById("pust-check-dock")) document.querySelector("#pust-mapdock .pust-md-check:not([hidden])")?.click();
    opened.dock = true;
    await waitFor("#pust-check-dock .pust-roller");
    await sleep(300);
  },
  /** «Зробити перевірку» as an example (author, 2026-11-16): «Швидкий старт»'s Волті, a ranged attack rolled in memory to a
   *  success ("roll") and its damage ("dmg"); nothing written, nothing in chat (check-panel.mjs setCheckDemo) */
  checkDemo: async (stage) => {
    const actor = await demoActor("character");
    if (!actor) return;
    const app = await (await import("../applications/check-panel.mjs")).setCheckDemo(actor, stage || "roll");
    opened.check = true;
    await sleep(300);
    app?.setPosition({ left: 110, top: 10 });
    app?.bringToFront();
  },
  /** the «Новий супротивник» form, open as an example: nothing is created (its «Скасувати» or the tour closes it) */
  enemyCreate: async () => {
    if (!foundry.applications.instances.get("pust-enemy-create")) (await import("../applications/enemy-create.mjs")).EnemyCreateApp.ask({});
    opened.newen = true;
    await waitFor("#pust-enemy-create");
    const app = foundry.applications.instances.get("pust-enemy-create");
    if (app?.rendered) app.setPosition({ left: 110, top: 40 });
    await sleep(200);
  },
  /** the strip under the end buttons, shown only on hover (author, 2026-11-21), held open for the step */
  endStrip: async () => { document.body.classList.add("pust-end-show"); opened.endStrip = true; await sleep(100); },
  issuesDemo: async () => { setIssuesDemo(true); opened.issues = true; await sleep(150); },
  /** «Статуси й відпочинок» folded by default (author, 2026-11-20; U1): opened in the page for the step, so its buttons show */
  statusOpen: async () => {
    document.querySelectorAll(".pust-sheet:not(.pust-caravan-sheet):not(.pust-en-sheet):not(.pust-place-sheet) .pust-qstat.folded").forEach((x) => x.classList.remove("folded"));
    await sleep(50);
  },
  targetDemo: async () => { await (await import("../canvas/target-demo.mjs")).setTargetDemo(true, await actorFor("enemy")); opened.tgt = true; await sleep(200); },
  enemyForm: async () => { await (await import("../applications/battle-panel.mjs")).setEnemyFormOpen(true); opened.eform = true; await sleep(300); },
  zoneDemo: async () => { await (await import("../canvas/battle-zones.mjs")).setZoneDemo(true); opened.zone = true; await sleep(300); },
  moveDemo: async () => { await (await import("../canvas/caravan-move.mjs")).setMoveDemo(true, await actorFor("caravan")); opened.move = true; await sleep(200); },
  noteDemo: async () => { (await import("../canvas/map-notes.mjs")).setNoteDemo(true); opened.note = true; await sleep(300); },
  /** the travel window under «Подорож», with an event generated (nothing goes to the chat) */
  travel: async () => { (await import("../applications/map-dock.mjs")).setTravelOpen(true); opened.travel = true; await sleep(300); },
  /** the new counter's form of «Лічильники» */
  /** «Погода й час дня»: the GM's popover opened beside its tool (closed when the step is left) */
  weather: async () => {
    if (!foundry.applications.instances.get("pust-weather")) { await (await import("../applications/weather-panel.mjs")).toggleWeatherPanel(true); opened.weather = true; }
    await waitFor("#pust-weather");
    await sleep(300);
  },
  counterForm: async () => { await PREPARE.unfold("ctr"); (await import("../applications/game-counters.mjs")).setCountersForm(true); opened.form = true; await sleep(300); },
  /** two example counters (a scene's and the game's), shown only; never written */
  counterDemo: async () => { await PREPARE.unfold("ctr"); const G = await import("../applications/game-counters.mjs"); G.setCountersForm(false); opened.form = false; await G.setCountersDemo(true); opened.demo = true; await sleep(300); },
};

/** Buttons a step may carry: [{label, act}] */
export const ACTIONS = {
  /** «Швидкий старт»: the adventure of the system's pack `quickstart`, imported once */
  importQuickstart: async () => {
    const pack = game.packs.get(`${game.system.id}.quickstart`);
    const idx = await pack?.getIndex();
    const entry = idx?.contents?.[0];
    if (!entry) return notify.warn("Компендіуму «Швидкий старт» немає.");
    const adv = await pack.getDocument(entry._id);
    // imported at once: the tour's overlay would block Foundry's own import window. Only what the world lacks is added:
    // documents already there (characters being played, edited journals and scenes) are never overwritten (author, 2026-11-16)
    const res = await adv.import({ dialog: false, preImport: [async (data) => { for (const k of Object.keys(data.toUpdate)) delete data.toUpdate[k]; }] });
    const n = Object.values(res?.created ?? {}).reduce((sum, list) => sum + (list?.length ?? 0), 0);
    notify.info(n ? `«Швидкий старт»: додано те, чого бракувало у світі (${n}); наявне не змінено.` : "«Швидкий старт» уже весь у світі.");
  },
};
/**
 * «Швидкий старт» is in the world while all of its characters and its caravan are (author, 2026-11-16: the journals were
 * checked, so deleting the actors left the button saying «вже є»). The import keeps the adventure's ids; they are read from
 * the pack once (`loadQuickstartIds`, «ready»); until then any actor marked `flags.pust.quickstart` counts.
 */
let QS_IDS = null;
export async function loadQuickstartIds() {
  try {
    const pack = game.packs.get(`${game.system.id}.quickstart`);
    const entry = (await pack?.getIndex())?.contents?.[0];
    if (!entry) return;
    const adv = await pack.getDocument(entry._id);
    QS_IDS = [...adv.actors].filter((a) => a.type === "character" || a.type === "caravan").map((a) => a._id);
  } catch (err) { console.warn("Пустельники | «Швидкий старт» ids not read", err); }
}
export const quickstartImported = () => (QS_IDS?.length ? QS_IDS.every((id) => game.actors.has(id))
  : game.actors.some((a) => a.flags?.pust?.quickstart));

/** A card that found no room beside its element: into the largest free part of the screen (below, above, right, left of it) */
function placeAside(card, el) {
  const e = el.getBoundingClientRect(), m = 12;
  // a side column narrower than the card (a wide sheet): the card narrows to it, down to 340 px (author, 2026-11-16: it covered the sheet)
  const side = Math.max(innerWidth - e.right, e.left) - 2 * m;
  if (side < card.getBoundingClientRect().width && side >= 340 && card.getBoundingClientRect().height + 2 * m > Math.max(innerHeight - e.bottom, e.top)) card.style.width = `${side}px`;
  const c = card.getBoundingClientRect();
  const spots = [
    { room: innerHeight - e.bottom, need: c.height, at: { top: e.bottom + m, left: (innerWidth - c.width) / 2 } },
    { room: e.top, need: c.height, at: { top: e.top - c.height - m, left: (innerWidth - c.width) / 2 } },
    { room: innerWidth - e.right, need: c.width, at: { top: (innerHeight - c.height) / 2, left: e.right + m } },
    { room: e.left, need: c.width, at: { top: (innerHeight - c.height) / 2, left: e.left - c.width - m } },
  ].sort((x, y) => (y.room - y.need) - (x.room - x.need));
  const at = spots[0].at;
  Object.assign(card.style, { position: "fixed", transform: "none", margin: "0",
    top: `${Math.max(m, Math.min(innerHeight - c.height - m, at.top))}px`, left: `${Math.max(m, Math.min(innerWidth - c.width - m, at.left))}px` });
}

/** An element's box together with whatever of it sticks out (a sticker's toolbar sits above the sticker) */
function outerBox(el) {
  const b = el.getBoundingClientRect();
  const u = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  for (const x of el.querySelectorAll("*")) {
    const r = x.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    u.left = Math.min(u.left, r.left); u.top = Math.min(u.top, r.top); u.right = Math.max(u.right, r.right); u.bottom = Math.max(u.bottom, r.bottom);
  }
  return u;
}

/**
 * The part of an element its scrolling windows show (2026-11-21: an open fold taller than its sheet's content, e.g. the
 * enemy card's «Деталі», ran the highlight past the screen's edge; the hidden part is scrolled away, not off screen).
 * `screen`: also within the browser window.
 */
export function visibleBox(el, { screen = false } = {}) {
  const b = el.getBoundingClientRect();
  const u = { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p);
    if (!/(auto|scroll|hidden|clip)/.test(cs.overflowY + cs.overflowX)) continue;
    const r = p.getBoundingClientRect();
    u.left = Math.max(u.left, r.left); u.top = Math.max(u.top, r.top); u.right = Math.min(u.right, r.right); u.bottom = Math.min(u.bottom, r.bottom);
  }
  if (screen) { u.left = Math.max(u.left, 0); u.top = Math.max(u.top, 0); u.right = Math.min(u.right, innerWidth); u.bottom = Math.min(u.bottom, innerHeight); }
  return { ...u, width: Math.max(0, u.right - u.left), height: Math.max(0, u.bottom - u.top) };
}

/** Esc always leaves a tour of the system: nothing else can be pressed while its overlay is up */
document.addEventListener("keydown", (ev) => {
  const t = foundry.nue?.Tour?.activeTour;
  if (ev.key !== "Escape" || !(t instanceof PustTour)) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  t.exit();
}, true);

export class PustTour extends foundry.nue.Tour {
  /** The pause banner is hidden while a tour runs (author, 2026-11-16: it covers the middle of the screen); the game stays paused */
  async start() {
    this.#done = false;
    document.body.classList.add("pust-touring");
    return super.start();
  }

  /**
   * One step change at a time, the newest wins (2026-11-21, the reviewer: quick `progress(i)` calls, a resize, `exit()`, and
   * an overlay stayed, blocking every click). Foundry's `progress` ran side by side: each call drew its own highlight and
   * overlay, the tour kept only the last one, and `exit()` took down only that. Now a call waits until the one before has
   * wholly finished; a waiting call a newer one overtook is skipped; a call overtaken (or left by `exit()`) while it runs
   * draws nothing.
   */
  #queue = serialQueue();
  progress(stepIndex) {
    // a step shown again after the tour ended (the audit walks tours by `progress`, without `start`): drawing allowed again;
    // a step change still running from before the end is stale all the same (this call overtakes it)
    if (stepIndex >= 0 && stepIndex < this.steps.length) this.#done = false;
    return this.#queue.run(() => super.progress(stepIndex));
  }

  /** everything this tour put over the page (highlight, overlay, its own cards): none may outlive its step */
  #films = new Set();
  #film(el) { if (el) this.#films.add(el); return el; }
  #sweep() { for (const el of this.#films) el.remove(); this.#films.clear(); }
  /** may this tour draw now: running, not ending, and its step change not overtaken */
  get #live() { return !this.#done && this.#queue.current && foundry.nue.Tour.activeTour === this; }

  /** the step whose element was missing: its selector is put back after it */
  #hidden = null;

  async _preStep() {
    await super._preStep();
    const step = this.currentStep;
    const list = [step.prepare ?? []].flat();
    await closeTransient(new Set(list.map((p) => String(p).split(":")[0])));
    const needs = needsOf(step);
    await closeUnneeded(needs);
    for (const p of list) {
      const [name, ...rest] = String(p).split(":");
      try { await PREPARE[name]?.(rest.join(":")); } catch (err) { console.warn(`Tour [${this.id}] prepare «${p}»`, err); }
    }
    // what the step shows but didn't open itself (it relied on an earlier step): opened again, so «Назад» brings it back
    const has = (kind) => [...tracked].some(([app, k]) => k === kind && app.rendered);
    const pcKind = this.config.restricted ? "character" : "pc";
    for (const kind of ["character", "enemy", "caravan", "place"]) {
      if (needs.has(kind) && !has(kind) && !(kind === "character" && needs.has("check") && has("check"))) await PREPARE.sheet(kind === "character" ? pcKind : kind);
    }
    if (needs.has("check") && !has("check")) await PREPARE.check();
    if (needs.has("terminal") && !has("terminal")) await PREPARE.terminal();
    if (step.selector) await waitFor(step.selector);
  }

  _getTargetElement(selector) {
    const all = [...document.querySelectorAll(selector)].filter((el) => el.getClientRects().length);
    if (!this.currentStep?.union || all.length < 2) return all[0] ?? null;
    // a step with `union: true` lights all its elements as one (author, 2026-11-16: several blocks of the check panel, left as
    // they are): an empty box over their joint area stands in for the element
    // the lowest of them into view, then the highest: the whole area shows when it fits (the blocks' order on screen may
    // differ from the page's, CSS `order` in the check panel)
    const byTop = [...all].sort((x, y) => x.getBoundingClientRect().top - y.getBoundingClientRect().top);
    byTop.at(-1).scrollIntoView({ block: "nearest" });
    byTop[0].scrollIntoView({ block: "nearest" });
    const u = all.map((el) => el.getBoundingClientRect()).reduce((a, r) => ({ left: Math.min(a.left, r.left), top: Math.min(a.top, r.top),
      right: Math.max(a.right, r.right), bottom: Math.max(a.bottom, r.bottom) }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    if (!this.#proxy?.isConnected) { this.#proxy = document.createElement("div"); this.#proxy.className = "pust-tour-proxy"; document.body.append(this.#proxy); }
    Object.assign(this.#proxy.style, { position: "fixed", pointerEvents: "none", left: `${u.left}px`, top: `${u.top}px`, width: `${u.right - u.left}px`, height: `${u.bottom - u.top}px` });
    return this.#proxy;
  }
  #proxy = null;

  /** the middle card of a step whose element is lit but had no room beside it (removed here, Foundry doesn't know it) */
  #centerCard = null;

  /** the step follows its element (author, 2026-11-16: the highlight stayed where it was drawn when the window was resized) */
  #watchTimer = null;
  #watchRect = "";
  #onTooltip = false; // the card is Foundry's tooltip (beside its element), not our own aside
  #watch() {
    this.#unwatch();
    const key = () => {
      const el = this.currentStep?.selector ? this._getTargetElement(this.currentStep.selector) : null;
      // the shown part too: a window that settles its height later cuts a tall fold after the step was drawn
      const r = el ? visibleBox(el, { screen: true }) : null;
      return `${innerWidth}x${innerHeight}|${r ? [r.left, r.top, r.width, r.height].map(Math.round).join(",") : "-"}`;
    };
    this.#watchRect = key();
    this.#watchTimer = setInterval(() => {
      if (!this.#live) return this.#unwatch();
      if (this.#queue.busy) return; // a step change is under way: it draws the step itself
      // Foundry's tooltip manager hides the card when the pointer «leaves» its element (author, 2026-11-16: the zone
      // editor's step lost its card after «Далі»): drawn again
      if (this.#onTooltip && !game.tooltip.tooltip.classList.contains("active")) { this.#watchRect = key(); return this.#redraw(); }
      const k = key();
      if (k === this.#watchRect && !this.#fadeOff()) return;
      this.#watchRect = k;
      this.#redraw();
    }, 250);
  }
  #unwatch() { clearInterval(this.#watchTimer); this.#watchTimer = null; }
  /** the highlight no longer over its element's shown part (the element was replaced or cut after the step was drawn) */
  #fadeOff() {
    // the highlight's box from its style, not its rect: Foundry moves it with a 0.3 s transition (a rect read mid-way would
    // ask for one redraw after another)
    const sel = this.currentStep?.selector, fs = this.fadeElement?.style;
    const el = sel ? this._getTargetElement(sel) : null;
    if (!el || !fs?.width || this.#hidden) return false;
    const f = { left: parseFloat(fs.left), top: parseFloat(fs.top) };
    f.right = f.left + parseFloat(fs.width); f.bottom = f.top + parseFloat(fs.height);
    if (this.targetElement !== el) return true; // replaced: the redraw takes the new one
    const v = visibleBox(el, { screen: true }), pad = foundry.nue.Tour.HIGHLIGHT_PADDING / 2;
    if (!v.width || !v.height) return false;
    return Math.max(Math.abs(f.left + pad - v.left), Math.abs(f.top + pad - v.top), Math.abs(f.right - pad - v.right), Math.abs(f.bottom - pad - v.bottom)) > 2;
  }
  /** the same step drawn again where its element is now */
  async #redraw() {
    this.#unwatch();
    if (!this.#live || this.#queue.busy) return;
    const step = this.currentStep;
    await this._postStep();
    // the tour may have moved on, ended or been left while the old card was taken down (author, 2026-11-17: the last
    // step's card came back over «Тур завершено» — a redraw raced with «Готово» while the view still panned)
    if (!this.#live || this.#queue.busy || this.currentStep !== step) return;
    this.targetElement = step?.selector ? this._getTargetElement(step.selector) : null;
    if (step) await this._renderStep();
  }
  /** set while the tour ends (complete / exit): no redraw may bring a card back */
  #done = false;

  async _postStep() {
    this.#unwatch();
    this.#centerCard?.remove();
    this.#centerCard = null;
    this.#proxy?.remove();
    this.#proxy = null;
    await super._postStep();
    this.#sweep();
    if (this.#hidden) { this.#hidden.step.selector = this.#hidden.selector; this.#hidden = null; }
  }

  #cardHtml(step, missing) {
    const i = this.steps.indexOf(step);
    const n = this.steps.length;
    const body = missing && step.fallback ? step.fallback : step.content;
    const acts = (step.actions ?? []).map((a, k) => {
      const off = a.act === "importQuickstart" && quickstartImported();
      return `<button type="button" class="pust-tour-act" data-k="${k}" ${off ? "disabled" : ""}>${esc(off ? `${a.label}: вже є` : a.label)}</button>`;
    }).join("");
    // the PDF's info box (author, 2026-11-16): a green terminal screen set in a rusty frame with four screws
    return `<div class="pust-tour-screen"><header class="pust-tour-hd"><h3>${esc(step.title)}</h3>`
      + `<button type="button" class="pust-tour-x" data-tour="exit" aria-label="Вийти з туру (Esc)" title="Вийти з туру (Esc)"><i class="fa-solid fa-xmark"></i></button></header>`
      + `<div class="pust-tour-body">${body}</div>`
      + (acts ? `<div class="pust-tour-acts">${acts}</div>` : "")
      + `<footer class="pust-tour-ft">`
      + `<button type="button" data-tour="previous" ${i > 0 ? "" : "disabled"}><i class="fa-solid fa-arrow-left"></i> Назад</button>`
      + `<span class="pust-tour-n">${esc(this.title)} · крок ${i + 1} з ${n}</span>`
      + `<button type="button" data-tour="next" class="pust-tour-next">${i + 1 < n ? `Далі <i class="fa-solid fa-arrow-right"></i>` : `Готово <i class="fa-solid fa-check"></i>`}</button>`
      + `</footer></div>`;
  }

  async _renderStep() {
    // a step change overtaken by a newer one, or by the tour's end, while it prepared: nothing is drawn
    if (!this.#live) return;
    this.#sweep(); // the step before took its own down; anything left of it goes now
    const step = this.currentStep;
    const missing = !!step.selector && !this.targetElement;
    if (missing) { this.#hidden = { step, selector: step.selector }; step.selector = undefined; }
    const html = this.#cardHtml(step, missing);
    let card = null;
    if (step.selector) {
      this.targetElement.scrollIntoView({ block: "nearest" });
      // the card beside its element, on the side asked for or any other where it fits wholly on screen
      // (author, 2026-11-16: the enemy card's step put it past the right edge — the screen stayed dark with nothing to press)
      const dirs = [...new Set([step.tooltipDirection, "LEFT", "RIGHT", "DOWN", "UP"].filter(Boolean))];
      for (const direction of dirs) {
        game.tooltip.activate(this.targetElement, { html, cssClass: "tour themed theme-dark pust-tour", direction, locked: false });
        const t = game.tooltip.tooltip, r = t.getBoundingClientRect(), e = outerBox(this.targetElement);
        const covers = r.left < e.right - 4 && r.right > e.left + 4 && r.top < e.bottom - 4 && r.bottom > e.top + 4; // Foundry pushes it back onto the screen, over its element
        if (r.width && !covers && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight) { card = t; break; }
      }
      if (!card) game.tooltip.deactivate();
    }
    // no element, or no side to put the card: in the middle of the screen (the element, if any, stays lit)
    const lit = card || !step.selector ? null : this.targetElement;
    this.#onTooltip = !!card;
    if (!card) {
      card = document.createElement("aside");
      card.innerHTML = html;
      card.classList.add("tour-center-step", "tour", "themed", "theme-dark", "pust-tour");
      document.body.appendChild(card);
      this.#film(card);
      if (lit) { this.#centerCard = card; card.classList.add("pust-tour-aside"); placeAside(card, lit); }
      else this.targetElement = card;
    }
    const pad = step.selector && !this.#hidden ? foundry.nue.Tour.HIGHLIGHT_PADDING : 0;
    this.fadeElement = this.#film(foundry.nue.Tour.highlightElement(this.targetElement, { padding: pad }));
    // only the part its window shows: a fold taller than the sheet's content is lit down to the sheet's edge, not past the screen
    if (this.targetElement !== card) {
      const fade = this.fadeElement, sel = step.selector;
      const clip = () => {
        if (!fade.isConnected || this.fadeElement !== fade || !this.#live) return;
        // found again: a sheet re-rendered for the step (a fold remembered) has replaced the element it was measured on
        const el = (sel && this._getTargetElement(sel)) || this.targetElement;
        if (!el?.isConnected) return;
        const v = visibleBox(el, { screen: true });
        if (v.width && v.height) Object.assign(fade.style, { transition: "none", left: `${v.left - pad / 2}px`, top: `${v.top - pad / 2}px`, width: `${v.width + pad}px`, height: `${v.height + pad}px` });
      };
      // again once the window has settled its height (a sheet opened for the step cuts its content a moment later)
      clip(); setTimeout(clip, 60); setTimeout(clip, 150);
    }
    this.overlayElement = this.#film(document.createElement("div"));
    this.overlayElement.classList.add("tour-overlay");
    document.body.appendChild(this.overlayElement);

    const buttons = [...card.querySelectorAll("[data-tour], .pust-tour-act")];
    for (const b of buttons) b.addEventListener("click", async (ev) => {
      ev.preventDefault();
      if (b.classList.contains("pust-tour-act")) {
        const a = step.actions?.[Number(b.dataset.k)];
        b.disabled = true;
        await ACTIONS[a?.act]?.();
        if (a?.act === "importQuickstart" && quickstartImported()) b.textContent = `${a.label}: вже є`;
        else b.disabled = false;
        return;
      }
      for (const x of buttons) x.disabled = true;
      const act = b.dataset.tour;
      if (act === "exit") return this.exit();
      if (act === "previous") return this.previous();
      return this.next();
    });
    this.#watch();
  }

  exit() {
    this.#done = true;
    const late = this.#queue.busy; // a step change still preparing (opening windows): it is let finish, then cleaned up
    this.#queue.cancel();
    this.#unwatch();
    document.body.classList.remove("pust-touring");
    super.exit();
    this.#sweep();
    // the sheet's own view first, then the windows the tour opened go with it
    const clean = () => restoreCompact().then(restoreFull).finally(() => { closeAll(); closeTransient(); });
    clean();
    if (late) this.#queue.settled().then(() => {
      this.#sweep();
      if (!foundry.nue.Tour.activeTour) clean(); // another tour started meanwhile keeps its windows
    });
  }

  /** The last step: the tour is done, the next one of the chain is offered (our words, not Foundry's) */
  async complete() {
    this.#done = true;
    this.#unwatch();
    document.body.classList.remove("pust-touring");
    const done = await this.progress(this.steps.length);
    await restoreCompact();
    await restoreFull();
    await closeAll();
    await closeTransient();
    // the chain's next tour, even one done before (author, 2026-11-17: Foundry keeps tours' progress in the browser, not the
    // world, so in a new world the tours passed in an earlier one counted as done and the chain stopped)
    const next = (this.config.next ?? []).map((id) => game.tours.get(`${game.system.id}.${id}`)).find(Boolean);
    if (next) {
      const go = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Тур завершено" },
        content: `<p>«${esc(this.title)}» пройдено. Далі тур «${esc(next.title)}»?</p><p class="hint">Будь-який тур можна пройти знову з журналу «Довідка Foundry».</p>`,
        yes: { label: "Почати" }, no: { label: "Пізніше" },
      });
      // the dialog first closes wholly (author, 2026-11-17: its empty frame stayed under the next tour's first card)
      if (go) { await sleep(350); await next.reset(); next.start(); }
    }
    return done;
  }
}
