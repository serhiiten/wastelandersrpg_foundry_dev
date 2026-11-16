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
  const own = forceDemo ? null : kind === "pc"
    ? game.user.character ?? game.actors.find((a) => a.type === "character" && a.isOwner)
    : game.actors.find((a) => a.type === kind && (!name || a.name === name)) ?? game.actors.find((a) => a.type === kind && a.testUserPermission(game.user, "LIMITED"));
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
    const sheet = actor.sheet;
    Object.defineProperty(sheet, "title", { configurable: true, get: () => `${actor.name} (приклад)` });
    demos.set(type, actor);
    return actor;
  } catch (err) {
    console.warn("Пустельники | tour example not made", err);
    return null;
  }
}
export const isDemoActor = (actor) => [...demos.values()].includes(actor);

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
const opened = { travel: false, form: false, demo: false, note: false, move: false, zone: false, eform: false, tgt: false };
async function closeTransient(keep = new Set()) {
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
    await sleep(500); // the sidebar slides open: the highlight is measured once it stands still
  },
  scene: async (which) => {
    const s = which === "map" ? findMapScene() : which === "battle" ? (findBattleScene() ?? game.scenes.find((x) => x.getFlag(game.system.id, "battleScene")))
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
    const el = document.querySelector(`[data-unit="${unit}"]`);
    if (el?.classList.contains("folded")) el.querySelector(".pust-md-fold, .pust-md-hd")?.click();
    await sleep(200);
  },
  closeAll,
  /** an example sticker with its editor open, in memory only (never written, players never see it) */
  targetDemo: async () => { await (await import("../canvas/target-demo.mjs")).setTargetDemo(true); opened.tgt = true; await sleep(200); },
  enemyForm: async () => { await (await import("../applications/battle-panel.mjs")).setEnemyFormOpen(true); opened.eform = true; await sleep(300); },
  zoneDemo: async () => { await (await import("../canvas/battle-zones.mjs")).setZoneDemo(true); opened.zone = true; await sleep(300); },
  moveDemo: async () => { await (await import("../canvas/caravan-move.mjs")).setMoveDemo(true); opened.move = true; await sleep(200); },
  noteDemo: async () => { (await import("../canvas/map-notes.mjs")).setNoteDemo(true); opened.note = true; await sleep(300); },
  /** the travel window under «Подорож», with an event generated (nothing goes to the chat) */
  travel: async () => { (await import("../applications/map-dock.mjs")).setTravelOpen(true); opened.travel = true; await sleep(300); },
  /** the new counter's form of «Лічильники» */
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
    if (!entry) return ui.notifications.warn("Компендіуму «Швидкий старт» немає.");
    const adv = await pack.getDocument(entry._id);
    // imported at once: the tour's overlay would block Foundry's own import window. Only what the world lacks is added:
    // documents already there (characters being played, edited journals and scenes) are never overwritten (author, 2026-11-16)
    const res = await adv.import({ dialog: false, preImport: [async (data) => { for (const k of Object.keys(data.toUpdate)) delete data.toUpdate[k]; }] });
    const n = Object.values(res?.created ?? {}).reduce((sum, list) => sum + (list?.length ?? 0), 0);
    ui.notifications.info(n ? `«Швидкий старт»: додано те, чого бракувало у світі (${n}); наявне не змінено.` : "«Швидкий старт» уже весь у світі.");
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
  const e = el.getBoundingClientRect(), c = card.getBoundingClientRect(), m = 12;
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
    document.body.classList.add("pust-touring");
    return super.start();
  }

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
    const all = [...document.querySelectorAll(selector)];
    return all.find((el) => el.getClientRects().length) ?? null;
  }

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
      const r = el?.getBoundingClientRect();
      return `${innerWidth}x${innerHeight}|${r ? [r.left, r.top, r.width, r.height].map(Math.round).join(",") : "-"}`;
    };
    this.#watchRect = key();
    this.#watchTimer = setInterval(() => {
      if (foundry.nue.Tour.activeTour !== this) return this.#unwatch();
      // Foundry's tooltip manager hides the card when the pointer «leaves» its element (author, 2026-11-16: the zone
      // editor's step lost its card after «Далі»): drawn again
      if (this.#onTooltip && !game.tooltip.tooltip.classList.contains("active")) { this.#watchRect = key(); return this.#redraw(); }
      const k = key();
      if (k === this.#watchRect) return;
      this.#watchRect = k;
      this.#redraw();
    }, 250);
  }
  #unwatch() { clearInterval(this.#watchTimer); this.#watchTimer = null; }
  /** the same step drawn again where its element is now */
  async #redraw() {
    this.#unwatch();
    await this._postStep();
    const step = this.currentStep;
    this.targetElement = step?.selector ? this._getTargetElement(step.selector) : null;
    if (step) await this._renderStep();
  }

  async _postStep() {
    this.#unwatch();
    this.#centerCard?.remove();
    this.#centerCard = null;
    await super._postStep();
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
      if (lit) { this.#centerCard = card; card.classList.add("pust-tour-aside"); placeAside(card, lit); }
      else this.targetElement = card;
    }
    this.fadeElement = foundry.nue.Tour.highlightElement(this.targetElement, { padding: step.selector && !this.#hidden ? foundry.nue.Tour.HIGHLIGHT_PADDING : 0 });
    this.overlayElement = document.createElement("div");
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
    document.body.classList.remove("pust-touring");
    super.exit();
    closeAll(); // the windows the tour opened go with it
    closeTransient();
  }

  /** The last step: the tour is done, the next one of the chain is offered (our words, not Foundry's) */
  async complete() {
    document.body.classList.remove("pust-touring");
    const done = await this.progress(this.steps.length);
    closeAll();
    closeTransient();
    const next = (this.config.next ?? []).map((id) => game.tours.get(`${game.system.id}.${id}`)).find((t) => t && t.status !== "completed");
    if (next) {
      const go = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Тур завершено" },
        content: `<p>«${esc(this.title)}» пройдено. Далі тур «${esc(next.title)}»?</p><p class="hint">Будь-який тур можна пройти знову з журналу «Довідка Foundry».</p>`,
        yes: { label: "Почати" }, no: { label: "Пізніше" },
      });
      if (go) next.start();
    }
    return done;
  }
}
