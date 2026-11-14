/**
 * «Лічильники гри» (the HTML terminal's global counters on the map, author 2026-11-14): a window for everyone.
 * The counters live in the world setting `gameCounters`; only the Gamemaster writes, everyone sees changes at once
 * (the setting's onChange → refreshGameCounters). Which counters are expanded is each device's own choice (localStorage).
 * Steps, creation and removal go to chat as a small terminal card.
 * Scene («локальні») counters, as in the HTML terminal's tracker: stored on the CURRENT scene, flag `sceneCounters`
 * (+ `sceneCounterNext`, the scene's id counter); only the Gamemaster writes; the window is redrawn on `updateScene`
 * of the viewed scene and on `canvasReady` (see wastelanders.mjs). The limit of 10 counts both kinds together.
 */
import { postChat } from "./chat.mjs";
import * as G from "../rules/game-counters.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const OPEN_KEY = "pustelnyky-gcounters-open";
const CONFIRM_MS = 3000;
const SAVE_MS = 500;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

let OPEN = null;
/** Open the window, or bring it to the front; a second press of its tool closes it */
export function openGameCounters() {
  if (OPEN?.rendered) return OPEN.close();
  OPEN ??= new GameCountersApp();
  return OPEN.render({ force: true });
}

/** The world's counters changed (any client): redraw the open window */
export function refreshGameCounters() {
  if (OPEN?.rendered) OPEN.refresh();
}

const stored = () => G.normalizeList(game.settings.get(game.system.id, "gameCounters"));

/* ---------- the current scene's counters ---------- */
const sceneOf = () => canvas?.scene ?? null;
const sceneList = () => G.normalizeLocalList(sceneOf()?.getFlag(game.system.id, "sceneCounters"));
const sceneNext = () => Math.max(1, Math.round(Number(sceneOf()?.getFlag(game.system.id, "sceneCounterNext"))) || 1);
function writeScene(list, next) {
  const sc = sceneOf();
  if (!sc || !game.user.isGM) return null;
  return sc.update({ flags: { [game.system.id]: { sceneCounters: list, sceneCounterNext: next } } });
}

function openIds() {
  try { const a = JSON.parse(localStorage.getItem(OPEN_KEY) || "[]"); return Array.isArray(a) ? a.map(Number) : []; } catch (_) { return []; }
}
function setOpen(id, v) {
  const a = openIds().filter((x) => x !== id);
  if (v) a.push(id);
  try { localStorage.setItem(OPEN_KEY, JSON.stringify(a)); } catch (_) { /* no storage: the choice is not kept */ }
}

/** A line of the log as a small terminal card (same frame as the terminal's notifications, see termCard) */
function logCard(text) {
  const content = `<div class="pust-chat pust-tcard pust-chat-gcounter"><h3><i class="fa-solid fa-hourglass-half"></i><span>Лічильники гри</span></h3>`
    + `<div class="tscreen"><p>${esc(text)}</p></div></div>`;
  return postChat({ content, speaker: { alias: "Термінал Доглядача" } });
}

class GameCountersApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pust-game-counters",
    classes: ["wastelanders", "pust-game-counters-app"],
    position: { width: 420, height: "auto" },
    window: { title: "Лічильники гри", icon: "fa-solid fa-hourglass-half", resizable: true },
    actions: {
      newForm: GameCountersApp.#onNewForm,
      cancelForm: GameCountersApp.#onCancelForm,
      create: GameCountersApp.#onCreate,
      step: GameCountersApp.#onStep,
      toggle: GameCountersApp.#onToggle,
      remove: GameCountersApp.#onRemove,
      setKind: GameCountersApp.#onSetKind,
      lstep: GameCountersApp.#onLStep,
      lremove: GameCountersApp.#onLRemove,
    },
  };

  // the system path is rewritten by tools/set-system-id.mjs when promoting DEV → stable, as in terminal.mjs
  static PARTS = { body: { template: "systems/wastelanders-dev/templates/apps/game-counters.hbs" } };

  form = null; // { kind: "scene"|"game", name, size, val, die, custom, start } while the «+ Лічильник» form is open
  #pending = false;
  #timers = new Map();

  async _prepareContext() {
    const gm = game.user.isGM, list = stored(), open = new Set(openIds());
    const sc = sceneOf(), locals = sc ? sceneList() : [], f = gm ? this.form : null;
    return {
      gm,
      max: G.GC_MAX,
      full: G.isFullTotal(locals.length, list.length),
      form: f,
      formScene: f?.kind === "scene",
      hasScene: !!sc,
      sceneName: sc?.name ?? "",
      showScene: !!sc && (gm || locals.length > 0),
      sizes: G.GC_SIZES.map((n) => ({ n, sel: n === (this.form?.size ?? 6) })),
      dies: G.LC_DIES.map(([d, label]) => ({ d, label, sel: String(d) === String(f?.die ?? 6) })),
      customDie: String(f?.die) === "custom",
      steps: G.LC_STEPS,
      fullText: G.LC_FULL_TEXT,
      locals: locals.map((c) => {
        const st = G.localState(c);
        return { ...c, st, hue: G.ctHue(c.val, c.die), svg: G.dieSvg(c.die, c.val, c.id), stateText: G.STATE_TEXT[st] ?? "" };
      }),
      counters: list.map((c) => ({
        ...c,
        hue: G.ctHue(c.val, c.size),
        open: open.has(c.id),
        curLabel: G.currentLabel(c),
        lamps: Array.from({ length: c.size }, (_, k) => ({ on: k < c.val })),
        rows: Array.from({ length: c.size }, (_, n) => { const k = c.size - n; return { k, i: k - 1, on: k <= c.val, cur: k === c.val, label: c.labels[k - 1] }; }),
      })),
    };
  }

  /** Redraw, but never over a field being typed in: wait for it to lose focus */
  refresh() {
    const ae = this.element?.contains(document.activeElement) ? document.activeElement : null;
    if (ae?.matches("input, textarea, select")) { this.#pending = true; return; }
    this.#pending = false;
    this.render();
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!this._pustFocusBound) {
      this._pustFocusBound = true;
      root.addEventListener("focusout", () => { if (this.#pending) setTimeout(() => this.#pending && this.refresh(), 0); });
    }
    const fit = (t) => { t.style.height = "auto"; if (t.scrollHeight) t.style.height = `${t.scrollHeight}px`; };
    root.querySelectorAll("textarea[data-lbl]").forEach((t) => {
      const key = `l${t.dataset.lbl}.${t.dataset.i}`;
      fit(t);
      t.addEventListener("input", () => { fit(t); this.#save(key, () => this.#write((l) => G.setLabel(l, t.dataset.lbl, +t.dataset.i, t.value))); });
      t.addEventListener("blur", () => this.#flush(key));
    });
    root.querySelectorAll("input[data-name]").forEach((i) => {
      const key = `n${i.dataset.name}`;
      i.addEventListener("input", () => this.#save(key, () => this.#write((l) => G.renameCounter(l, i.dataset.name, i.value))));
      i.addEventListener("change", () => this.#flush(key));
      i.addEventListener("blur", () => this.#flush(key));
    });
    root.querySelectorAll("input[data-lname]").forEach((i) => {
      const key = `m${i.dataset.lname}`;
      i.addEventListener("input", () => this.#save(key, () => this.#writeLocal((l) => G.renameLocal(l, i.dataset.lname, i.value))));
      i.addEventListener("change", () => this.#flush(key));
      i.addEventListener("blur", () => this.#flush(key));
    });
    root.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("input", () => this.#readForm()));
    root.querySelector("[data-f='size']")?.addEventListener("change", () => { this.#readForm(); this.render(); });
    root.querySelector("[data-f='die']")?.addEventListener("change", () => { this.#readForm(); this.render(); });
    root.querySelector("[data-f='name']")?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); GameCountersApp.#onCreate.call(this); } });
  }

  async close(options) {
    for (const key of [...this.#timers.keys()]) this.#flush(key);
    return super.close(options);
  }

  /* ---------- debounced saving of names and descriptions ---------- */
  #save(key, fn) {
    clearTimeout(this.#timers.get(key)?.t);
    this.#timers.set(key, { fn, t: setTimeout(() => this.#flush(key), SAVE_MS) });
  }
  #flush(key) {
    const e = this.#timers.get(key);
    if (!e) return;
    clearTimeout(e.t); this.#timers.delete(key);
    return e.fn();
  }

  /** Save the list changed by fn (the Gamemaster only) */
  async #write(fn) {
    if (!game.user.isGM) return;
    return game.settings.set(game.system.id, "gameCounters", fn(stored()));
  }

  /** Save the current scene's list changed by fn (the Gamemaster only) */
  async #writeLocal(fn) {
    if (!game.user.isGM || !sceneOf()) return;
    return writeScene(fn(sceneList()), sceneNext());
  }

  #newForm() { return { kind: sceneOf() ? "scene" : "game", name: "", size: 6, val: 0, die: "6", custom: 20, start: 4 }; }

  #readForm() {
    const f = this.form ?? (this.form = this.#newForm()), r = this.element;
    const q = (k) => r.querySelector(`[data-f='${k}']`);
    f.name = q("name")?.value ?? f.name;
    if (q("size")) f.size = +q("size").value || f.size;
    if (q("val")) { const v = q("val").value; f.val = v === "" ? 0 : Math.max(0, Math.min(f.size, Math.round(+v) || 0)); }
    if (q("die")) f.die = q("die").value;
    if (q("custom")) f.custom = q("custom").value;
    if (q("start")) f.start = q("start").value;
  }

  /* ---------- actions ---------- */
  static #onNewForm() {
    if (!game.user.isGM || G.isFullTotal(sceneList().length, stored().length)) return;
    this.form = this.#newForm();
    this.render().then(() => this.element.querySelector("[data-f='name']")?.focus());
  }
  static #onCancelForm() { this.form = null; this.render(); }

  /** The «Сцена / Гра» switch of the form */
  static #onSetKind(event, target) {
    if (!game.user.isGM || !this.form) return;
    this.#readForm();
    if (target.dataset.kind === "scene" && !sceneOf()) return;
    this.form.kind = target.dataset.kind === "game" ? "game" : "scene";
    this.render();
  }

  static async #onCreate() {
    if (!game.user.isGM || !this.form) return;
    this.#readForm();
    const list = stored(), f = this.form;
    if (f.kind === "scene") {
      if (!sceneOf()) return;
      const lr = G.addLocal(sceneList(), { name: f.name, die: G.formDie(f.die, f.custom), val: f.start }, { globalCount: list.length, next: sceneNext() });
      if (!lr) return ui.notifications.warn(`${G.LC_FULL_TEXT}.`);
      this.form = null;
      await writeScene(lr.list, lr.next);
      this.render();
      await logCard(G.logCreateLocal(lr.counter));
      return;
    }
    const r = G.isFullTotal(sceneList().length, list.length) ? null : G.addCounter(list, f);
    if (!r) return ui.notifications.warn(`${G.LC_FULL_TEXT}.`);
    this.form = null;
    await game.settings.set(game.system.id, "gameCounters", r.list);
    // the form is gone, so redraw now (with Enter the focus is still in its name field, and refresh() would wait for it)
    this.render();
    await logCard(G.logCreate(r.counter));
  }

  static async #onStep(event, target) {
    if (!game.user.isGM) return;
    for (const key of [...this.#timers.keys()]) await this.#flush(key); // typed names / descriptions first
    const r = G.stepCounter(stored(), target.dataset.id, +target.dataset.d);
    if (!r?.changed) return;
    await game.settings.set(game.system.id, "gameCounters", r.list);
    await logCard(G.logStep(r.counter, r.from, r.to));
  }

  static async #onLStep(event, target) {
    if (!game.user.isGM || !sceneOf()) return;
    for (const key of [...this.#timers.keys()]) await this.#flush(key);
    const d = +target.dataset.d, r = G.stepLocal(sceneList(), target.dataset.id, d);
    if (!r?.changed) return;
    await writeScene(r.list, sceneNext());
    await logCard(G.logStepLocal(r.counter, r.from, r.to, d));
  }

  static async #onLRemove(event, target) {
    if (!game.user.isGM || !sceneOf()) return;
    if (!target.classList.contains("armed")) {
      target.classList.add("armed");
      target.title = "Натисни ще раз, щоб підтвердити";
      ui.notifications.info("Натисни ще раз, щоб підтвердити.");
      setTimeout(() => target.classList.remove("armed"), CONFIRM_MS);
      return;
    }
    const r = G.removeLocal(sceneList(), target.dataset.id);
    if (!r) return;
    await writeScene(r.list, sceneNext());
    await logCard(G.logRemoveLocal(r.counter));
  }

  static #onToggle(event, target) {
    const id = +target.dataset.id;
    setOpen(id, !openIds().includes(id));
    this.render();
  }

  static async #onRemove(event, target) {
    if (!game.user.isGM) return;
    if (!target.classList.contains("armed")) { // asks twice, like every destructive button
      target.classList.add("armed");
      target.title = "Натисни ще раз, щоб підтвердити";
      ui.notifications.info("Натисни ще раз, щоб підтвердити.");
      setTimeout(() => target.classList.remove("armed"), CONFIRM_MS);
      return;
    }
    const r = G.removeCounter(stored(), target.dataset.id);
    if (!r) return;
    setOpen(r.counter.id, false);
    await game.settings.set(game.system.id, "gameCounters", r.list);
    await logCard(G.logRemove(r.counter));
  }
}
