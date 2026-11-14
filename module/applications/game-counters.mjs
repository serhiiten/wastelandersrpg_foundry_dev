/**
 * «Лічильники» for the Gamemaster: edited right in the panel under «Мапа Пустки» (author, 2026-11-14; there is no
 * separate window any more). The panel's header has «+» (a new counter); the body lists the counters with their names,
 * steps, segment descriptions and removal. Players get their own compact read-only panel (map-dock.mjs).
 * Game counters live in the world setting `gameCounters` (its onChange → refreshGameCounters); scene («локальні»)
 * counters, as in the HTML terminal's tracker, on the CURRENT scene, flag `sceneCounters` (+ `sceneCounterNext`);
 * redrawn on `updateScene` of the viewed scene and on `canvasReady` (wastelanders.mjs). Only the Gamemaster writes;
 * the limit of 10 counts both kinds together. Which game counters show their segments is each device's own choice
 * (localStorage). Steps and creation go to chat as a small terminal card; removal does not.
 */
import { postChat } from "./chat.mjs";
import * as G from "../rules/game-counters.mjs";

// the system path is rewritten by tools/set-system-id.mjs when promoting DEV → stable, as in terminal.mjs
const TEMPLATE = "systems/wastelanders-dev/templates/apps/game-counters.hbs";
const OPEN_KEY = "pustelnyky-gcounters-open";
const CONFIRM_MS = 3000;
const SAVE_MS = 500;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

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

/** Arm a destructive button on the first press; true when it was already armed (the second press) */
function armed(target) {
  if (target.classList.contains("armed")) return true;
  target.classList.add("armed");
  target.title = "Натисни ще раз, щоб підтвердити";
  ui.notifications.info("Натисни ще раз, щоб підтвердити.");
  setTimeout(() => target.classList.remove("armed"), CONFIRM_MS);
  return false;
}

class CountersPanel {
  /** @param {HTMLElement} section the dock's panel: a header with «+», and the body this panel draws */
  constructor(section) {
    this.section = section;
    this.body = section.querySelector(".pust-gc");
    this.form = null; // { kind: "scene"|"game", name, size, val, die, custom, start } while the new counter's form is open
    this.pending = false;
    this.timers = new Map();
    this.seq = 0;
    section.addEventListener("click", (ev) => this.#onClick(ev));
    this.body.addEventListener("focusout", () => { if (this.pending) setTimeout(() => this.pending && this.refresh(), 0); });
  }

  #context() {
    const list = stored(), open = new Set(openIds());
    const sc = sceneOf(), locals = sc ? sceneList() : [], f = this.form;
    return {
      gm: true,
      max: G.GC_MAX,
      full: G.isFullTotal(locals.length, list.length),
      form: f,
      formScene: f?.kind === "scene",
      hasScene: !!sc,
      sceneName: sc?.name ?? "",
      showScene: locals.length > 0,
      showGame: list.length > 0,
      sizes: G.GC_SIZES.map((n) => ({ n, sel: n === (f?.size ?? 6) })),
      dies: G.LC_DIES.map(([d, label]) => ({ d, label, sel: String(d) === String(f?.die ?? 6) })),
      customDie: String(f?.die) === "custom",
      steps: G.LC_STEPS,
      fullText: G.LC_FULL_TEXT,
      locals: locals.map((c) => {
        const st = G.localState(c);
        return { ...c, st, hue: G.ctHue(c.val, c.die), svg: G.dieSvg(c.die, c.val, `gm${c.id}`), stateText: G.STATE_TEXT[st] ?? "" };
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

  /** Draw the panel; an empty one shows only its header with «+» */
  async render() {
    const seq = ++this.seq;
    const ctx = this.#context();
    const html = await foundry.applications.handlebars.renderTemplate(TEMPLATE, ctx);
    if (seq !== this.seq) return; // a newer draw has started
    const top = this.body.scrollTop; // a step or a rename must not jump the list back to its top
    this.body.innerHTML = html;
    this.body.hidden = !ctx.form && !ctx.showGame && !ctx.showScene;
    this.section.classList.toggle("pust-md-empty", this.body.hidden); // no counters: half-transparent like the other panels
    const add = this.section.querySelector("[data-gc='newForm']");
    if (add) {
      add.disabled = ctx.full;
      add.title = ctx.full ? G.LC_FULL_TEXT : "Новий лічильник: гри (від сесії до сесії) або цієї сцени";
    }
    this.#bind(); // fits the descriptions' heights, so the scroll is put back after it
    this.body.scrollTop = top;
  }

  /** Redraw, but never over a field being typed in: wait for it to lose focus */
  refresh() {
    const ae = this.body.contains(document.activeElement) ? document.activeElement : null;
    if (ae?.matches("input, textarea, select")) { this.pending = true; return; }
    this.pending = false;
    return this.render();
  }

  #bind() {
    const root = this.body;
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
    const name = root.querySelector("[data-f='name']");
    name?.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); this.#create(); }
      if (ev.key === "Escape") { ev.preventDefault(); this.form = null; this.render(); }
    });
  }

  /* ---------- debounced saving of names and descriptions ---------- */
  #save(key, fn) {
    clearTimeout(this.timers.get(key)?.t);
    this.timers.set(key, { fn, t: setTimeout(() => this.#flush(key), SAVE_MS) });
  }
  #flush(key) {
    const e = this.timers.get(key);
    if (!e) return;
    clearTimeout(e.t); this.timers.delete(key);
    return e.fn();
  }
  async #flushAll() { for (const key of [...this.timers.keys()]) await this.#flush(key); }

  async #write(fn) {
    if (!game.user.isGM) return;
    return game.settings.set(game.system.id, "gameCounters", fn(stored()));
  }
  async #writeLocal(fn) {
    if (!game.user.isGM || !sceneOf()) return;
    return writeScene(fn(sceneList()), sceneNext());
  }

  #newForm() { return { kind: sceneOf() ? "scene" : "game", name: "", size: 6, val: 0, die: "6", custom: 20, start: 4 }; }

  #readForm() {
    const f = this.form ?? (this.form = this.#newForm()), r = this.body;
    const q = (k) => r.querySelector(`[data-f='${k}']`);
    f.name = q("name")?.value ?? f.name;
    if (q("size")) f.size = +q("size").value || f.size;
    if (q("val")) { const v = q("val").value; f.val = v === "" ? 0 : Math.max(0, Math.min(f.size, Math.round(+v) || 0)); }
    if (q("die")) f.die = q("die").value;
    if (q("custom")) f.custom = q("custom").value;
    if (q("start")) f.start = q("start").value;
  }

  /* ---------- actions ---------- */
  #onClick(ev) {
    const b = ev.target.closest("[data-gc]");
    if (!b || b.disabled || !game.user.isGM) return;
    ev.stopPropagation();
    const a = b.dataset.gc;
    if (a === "newForm") return this.#newCounter();
    if (a === "cancelForm") { this.form = null; return this.render(); }
    if (a === "create") return this.#create();
    if (a === "setKind") return this.#setKind(b);
    if (a === "toggle") { const id = +b.dataset.id; setOpen(id, !openIds().includes(id)); return this.render(); }
    if (a === "step") return this.#step(b);
    if (a === "remove") return this.#remove(b);
    if (a === "lstep") return this.#lstep(b);
    if (a === "lremove") return this.#lremove(b);
  }

  /** «+»: the form opens on top of the list (a second press closes it) */
  #newCounter() {
    if (this.form) { this.form = null; return this.render(); }
    if (G.isFullTotal(sceneList().length, stored().length)) return ui.notifications.warn(`${G.LC_FULL_TEXT}.`);
    this.form = this.#newForm();
    this.render().then(() => this.body.querySelector("[data-f='name']")?.focus());
  }

  /** The «Гра / Сцена» switch of the form */
  #setKind(target) {
    if (!this.form) return;
    this.#readForm();
    if (target.dataset.kind === "scene" && !sceneOf()) return;
    this.form.kind = target.dataset.kind === "game" ? "game" : "scene";
    this.render();
  }

  async #create() {
    if (!this.form) return;
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

  async #step(target) {
    await this.#flushAll(); // typed names / descriptions first
    const r = G.stepCounter(stored(), target.dataset.id, +target.dataset.d);
    if (!r?.changed) return;
    await game.settings.set(game.system.id, "gameCounters", r.list);
    await logCard(G.logStep(r.counter, r.from, r.to));
  }

  async #lstep(target) {
    if (!sceneOf()) return;
    await this.#flushAll();
    const d = +target.dataset.d, r = G.stepLocal(sceneList(), target.dataset.id, d);
    if (!r?.changed) return;
    await writeScene(r.list, sceneNext());
    await logCard(G.logStepLocal(r.counter, r.from, r.to, d));
  }

  async #remove(target) {
    if (!armed(target)) return; // asks twice, like every destructive button
    const r = G.removeCounter(stored(), target.dataset.id);
    if (!r) return;
    setOpen(r.counter.id, false);
    await game.settings.set(game.system.id, "gameCounters", r.list); // removal is not posted to chat (author, 2026-11-14)
  }

  async #lremove(target) {
    if (!sceneOf() || !armed(target)) return;
    const r = G.removeLocal(sceneList(), target.dataset.id);
    if (!r) return;
    await writeScene(r.list, sceneNext()); // removal is not posted to chat
  }
}

let PANEL = null;

/** The GM's counters panel: the dock's section (header with «+», body `.pust-gc`) */
export function mountCounters(section) {
  PANEL = new CountersPanel(section);
  return PANEL.render();
}

/** The world's or the viewed scene's counters changed (any client): redraw the GM's panel */
export function refreshGameCounters() {
  return PANEL?.refresh();
}
