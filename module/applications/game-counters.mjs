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

/**
 * The tours' examples (author, 2026-11-16; module/tours): a scene counter and a game counter shown in the panel only while
 * the tour step is on — never written to the world, never logged; the tour's overlay keeps their buttons out of reach.
 */
let DEMO = null;
const DEMO_GAME = { id: 99901, name: "Приклад: наступ Легіону", size: 6, val: 2, labels: ["Легіон біля воріт", "Перші сутички", "", "", "", ""] };
const DEMO_SCENE = { id: 99902, name: "Приклад: тунель обвалюється", die: 6, val: 4 };
export function setCountersDemo(on) {
  DEMO = on ? { game: G.normalizeList([DEMO_GAME])[0], scene: G.normalizeLocalList([DEMO_SCENE])[0] } : null;
  Hooks.callAll("pustCountersDemo", DEMO); // the players' read-only panel shows them too (map-dock.mjs)
  return PANEL?.render();
}
/** The tour: the new counter's form opened (or closed) as «+» does */
export function setCountersForm(on) {
  if (!PANEL) return null;
  if (on && !PANEL.form) PANEL.openForm();
  if (!on && PANEL.form) { PANEL.form = null; return PANEL.render(); }
  return null;
}

const storedReal = () => G.normalizeList(game.settings.get(game.system.id, "gameCounters"));
const stored = () => (DEMO ? [...storedReal(), DEMO.game] : storedReal());

/* ---------- the current scene's counters ---------- */
const sceneOf = () => canvas?.scene ?? null;
const sceneListReal = () => G.normalizeLocalList(sceneOf()?.getFlag(game.system.id, "sceneCounters"));
const sceneList = () => (DEMO ? [...sceneListReal(), DEMO.scene] : sceneListReal());
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

/**
 * A counter's change in chat (author, 2026-11-17: made handsome, as the damage cards): a header in the kind's colours — a game
 * counter bronze, a scene counter steel — with the reason chip, the name, «from → to з N» in big type, the segments with the
 * ones just gained lit (lost ones simply empty) (a solid bar past 20), the segment's description (game); at 0 / the maximum a scene
 * counter's banner, a game counter's whole card red / green.
 * @param {{kind:"game"|"scene", counter:object, from?:number, to?:number, d?:number, made?:boolean}} o
 */
function counterCard({ kind, counter: c, from = null, to = null, d = 0, made = false }) {
  const game_ = kind === "game";
  const max = game_ ? c.size : c.die;
  const now = to ?? c.val;
  const why = made ? "новий" : game_ ? (now > from ? "+" + (now - from) : "−" + (from - now)) : (G.STEP_WHY[String(d)] ?? "");
  const up = !made && now > from, down = !made && now < from;
  const lo = made ? 0 : Math.min(from, now), hi = made ? 0 : Math.max(from, now);
  const hue = G.ctHue(now, max);
  const segs = max <= G.GC_LAMPS_MAX
    ? `<div class="pust-cc-segs" style="--n:${max}">${Array.from({ length: max }, (_, i) => {
        const on = i < now, moved = i >= lo && i < hi;
        return `<i class="${on ? "on" : ""}${moved && up ? " up" : ""}"></i>`; // segments just lost show as empty (author, 2026-11-17)
      }).join("")}</div>`
    : `<div class="pust-cc-bar"><i style="width:${Math.round((100 * now) / max)}%"></i></div>`;
  const label = game_ ? G.currentLabel({ ...c, val: now }) : "";
  // at 0 / the maximum (author, 2026-11-17): a scene counter gets the banner (in chat only «the problem is here», not the GM's
  // hint); a game counter has no banner, its whole card turns red / green
  const state = G.localState({ die: max, val: now });
  const banner = game_ ? "" : state === "lost" ? `<div class="pust-cc-ban lost"><i class="fa-solid fa-triangle-exclamation"></i>Проблема постала в усій красі</div>`
    : state === "won" ? `<div class="pust-cc-ban won"><i class="fa-solid fa-check"></i>${esc(G.STATE_TEXT.won)}</div>` : "";
  const nums = made ? `<b>${now}</b><span>з ${max}</span>` : `<span>${from}</span><i class="fa-solid fa-arrow-right"></i><b>${now}</b><span>з ${max}</span>`;
  const content = `<div class="pust-chat pust-ctrcard ${game_ ? "game" : "scene"}${up ? " up" : down ? " dn" : ""}${game_ && state ? ` st-${state}` : ""}" style="--hue:${hue}">
    <div class="pust-cc-hd"><i class="fa-solid ${game_ ? "fa-hourglass-half" : "fa-dice-d6"}"></i><span>${game_ ? "Лічильник гри" : `Лічильник сцени · d${max}`}</span>${why ? `<em class="pust-cc-why">${esc(why)}</em>` : ""}</div>
    <div class="pust-cc-body"><div class="pust-cc-top"><b class="pust-cc-name">${esc(c.name)}</b><span class="pust-cc-num">${nums}</span></div>
      ${segs}${label ? `<p class="pust-cc-label">${esc(label)}</p>` : ""}${banner}</div></div>`;
  return postChat({ content, speaker: { alias: "Термінал Доглядача" } });
}

/** Arm a destructive button on the first press; true when it was already armed (the second press) */
function armed(target) {
  if (target.classList.contains("armed")) return true;
  target.classList.add("armed");
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
      sizes: [...G.GC_SIZES.map((n) => ({ n, label: n, sel: !f?.sizeCustom && n === (f?.size ?? 6) })),
        { n: "custom", label: "Свій", sel: !!f?.sizeCustom }],
      sizeCustom: !!f?.sizeCustom,
      sizeMax: G.GC_SIZE_MAX,
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
        bar: G.isBarCounter(c), // above 20 segments: a solid bar, never unfolded (author, 2026-11-15)
        pct: Math.round((c.val / c.size) * 1000) / 10,
        open: !G.isBarCounter(c) && open.has(c.id),
        curLabel: G.currentLabel(c),
        lamps: G.isBarCounter(c) ? [] : Array.from({ length: c.size }, (_, k) => ({ on: k < c.val })),
        rows: G.isBarCounter(c) ? [] : Array.from({ length: c.size }, (_, n) => { const k = c.size - n; return { k, i: k - 1, on: k <= c.val, cur: k === c.val, label: c.labels[k - 1] }; }),
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
    const oneLine = (t) => { if (t.value.includes("\n")) t.value = t.value.replace(/\s*\n\s*/g, " "); }; // a pasted name stays one line
    root.querySelectorAll("textarea[data-lbl]").forEach((t) => {
      const key = `l${t.dataset.lbl}.${t.dataset.i}`;
      fit(t);
      t.addEventListener("input", () => { fit(t); this.#save(key, () => this.#write((l) => G.setLabel(l, t.dataset.lbl, +t.dataset.i, t.value))); });
      t.addEventListener("blur", () => this.#flush(key));
    });
    root.querySelectorAll("textarea[data-name]").forEach((i) => { // a name wraps, never cut (author, 2026-11-16)
      fit(i);
      i.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); i.blur(); } });
      const key = `n${i.dataset.name}`;
      i.addEventListener("input", () => { oneLine(i); fit(i); this.#save(key, () => this.#write((l) => G.renameCounter(l, i.dataset.name, i.value))); });
      i.addEventListener("change", () => this.#flush(key));
      i.addEventListener("blur", () => this.#flush(key));
    });
    root.querySelectorAll("textarea[data-lname]").forEach((i) => { // a name wraps, never cut (author, 2026-11-16)
      fit(i);
      i.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); i.blur(); } });
      const key = `m${i.dataset.lname}`;
      i.addEventListener("input", () => { oneLine(i); fit(i); this.#save(key, () => this.#writeLocal((l) => G.renameLocal(l, i.dataset.lname, i.value))); });
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
    return game.settings.set(game.system.id, "gameCounters", fn(storedReal()));
  }
  async #writeLocal(fn) {
    if (!game.user.isGM || !sceneOf()) return;
    return writeScene(fn(sceneListReal()), sceneNext());
  }

  #newForm() { return { kind: sceneOf() ? "scene" : "game", name: "", size: 6, val: 0, die: "6", custom: 20, start: 4 }; }

  #readForm() {
    const f = this.form ?? (this.form = this.#newForm()), r = this.body;
    const q = (k) => r.querySelector(`[data-f='${k}']`);
    f.name = q("name")?.value ?? f.name;
    if (q("size")) {
      f.sizeCustom = q("size").value === "custom";
      if (!f.sizeCustom) f.size = +q("size").value || f.size;
      else if (q("sizeN")) f.size = Math.max(G.GC_SIZE_MIN, Math.min(G.GC_SIZE_MAX, Math.round(+q("sizeN").value) || f.size));
    }
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

  /** The tour's way in: the form opened without a click */
  openForm() {
    if (this.form) return this.render();
    this.form = this.#newForm();
    return this.render();
  }

  /** «+»: the form opens on top of the list (a second press closes it) */
  #newCounter() {
    if (this.form) { this.form = null; return this.render(); }
    if (G.isFullTotal(sceneListReal().length, storedReal().length)) return ui.notifications.warn(`${G.LC_FULL_TEXT}.`);
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
    const list = storedReal(), f = this.form;
    if (f.kind === "scene") {
      if (!sceneOf()) return;
      const lr = G.addLocal(sceneListReal(), { name: f.name, die: G.formDie(f.die, f.custom), val: f.start }, { globalCount: list.length, next: sceneNext() });
      if (!lr) return ui.notifications.warn(`${G.LC_FULL_TEXT}.`);
      this.form = null;
      await writeScene(lr.list, lr.next);
      this.render();
      await counterCard({ kind: "scene", counter: lr.counter, made: true });
      return;
    }
    const r = G.isFullTotal(sceneListReal().length, list.length) ? null : G.addCounter(list, f);
    if (!r) return ui.notifications.warn(`${G.LC_FULL_TEXT}.`);
    this.form = null;
    await game.settings.set(game.system.id, "gameCounters", r.list);
    // the form is gone, so redraw now (with Enter the focus is still in its name field, and refresh() would wait for it)
    this.render();
    await counterCard({ kind: "game", counter: r.counter, made: true });
  }

  async #step(target) {
    await this.#flushAll(); // typed names / descriptions first
    const r = G.stepCounter(storedReal(), target.dataset.id, +target.dataset.d);
    if (!r?.changed) return;
    await game.settings.set(game.system.id, "gameCounters", r.list);
    await counterCard({ kind: "game", counter: r.counter, from: r.from, to: r.to });
  }

  async #lstep(target) {
    if (!sceneOf()) return;
    await this.#flushAll();
    const d = +target.dataset.d, r = G.stepLocal(sceneListReal(), target.dataset.id, d);
    if (!r?.changed) return;
    await writeScene(r.list, sceneNext());
    await counterCard({ kind: "scene", counter: r.counter, from: r.from, to: r.to, d });
  }

  async #remove(target) {
    if (!armed(target)) return; // asks twice, like every destructive button
    const r = G.removeCounter(storedReal(), target.dataset.id);
    if (!r) return;
    setOpen(r.counter.id, false);
    await game.settings.set(game.system.id, "gameCounters", r.list); // removal is not posted to chat (author, 2026-11-14)
  }

  async #lremove(target) {
    if (!sceneOf() || !armed(target)) return;
    const r = G.removeLocal(sceneListReal(), target.dataset.id);
    if (!r) return;
    await writeScene(r.list, sceneNext()); // removal is not posted to chat
  }
}

let PANEL = null;

/** The GM's counters panel: the dock's section (header with «+», body `.pust-gc`) */
export function mountCounters(section) {
  gameCount = storedReal().length;
  PANEL = new CountersPanel(section);
  return PANEL.render();
}

/** A scene counter made from outside the panel — the «Створити лічильник» buttons of the adventures' journals
 *  (`@Counter[…]`, wastelanders.mjs; author, 2026-11-15): on the viewed scene, GM only, logged like the panel's */
export async function createSceneCounter({ name, die = 6, val = 4 } = {}) {
  if (!game.user.isGM) return ui.notifications.warn("Лічильники створює Доглядач.");
  if (!sceneOf()) return ui.notifications.warn("Спершу відкрий сцену: лічильник з'явиться на ній.");
  const lr = G.addLocal(sceneListReal(), { name, die, val }, { globalCount: storedReal().length, next: sceneNext() });
  if (!lr) return ui.notifications.warn(`${G.LC_FULL_TEXT}.`);
  await writeScene(lr.list, lr.next);
  ui.notifications.info(`Лічильник «${lr.counter.name}» додано на сцену «${sceneOf().name}».`);
  return counterCard({ kind: "scene", counter: lr.counter, made: true });
}

/** A game counter made from a journal button (`@GameCounter[…]`, author 2026-11-15: the quick start's days to delivery) */
export async function createGameCounter({ name, size = 6, val = 0 } = {}) {
  if (!game.user.isGM) return ui.notifications.warn("Лічильники створює Доглядач.");
  const list = storedReal();
  const r = G.isFullTotal(sceneListReal().length, list.length) ? null : G.addCounter(list, { name, size, val });
  if (!r) return ui.notifications.warn(`${G.LC_FULL_TEXT}.`);
  await game.settings.set(game.system.id, "gameCounters", r.list);
  ui.notifications.info(`Лічильник гри «${r.counter.name}» додано.`);
  return counterCard({ kind: "game", counter: r.counter, made: true });
}

/** The world's or the viewed scene's counters changed (any client): redraw the GM's panel */
let gameCount = null;
export function refreshGameCounters() {
  // the first game counter on a battle map unfolds «Лічильники» (author, 2026-11-17; map-dock.mjs folds them there)
  const n = storedReal().length;
  if (gameCount === 0 && n > 0) import("./map-dock.mjs").then((m) => m.unfoldUnit("ctr"));
  gameCount = n;
  return PANEL?.refresh();
}
