/**
 * «Новий супротивник» (author, 2026-11-14): the form that opens when the Gamemaster picks «Супротивник» in
 * Actors directory → «Create Actor» (hooked in WastelandersActor.createDialog / create). A port of the battle tracker's
 * «свій супротивник»: «за основу» (an enemy of the «opponents» compendium or of the world), category with the book's hints
 * for ОЗ and броня, defence, attacks (presets, dice, damage type, charges), moves (presets with their texts), aspects with
 * free invokes, note. The rules and the form's state live in module/rules/enemy-create.mjs (tested); this file is only the window.
 * «Створити» makes the actor (in the folder the dialog chose); «Скасувати» makes nothing.
 */
import {
  CAT_GUIDE, CAT_LABEL, DMG_TYPES, R3, R4, atkType, buildAttackPresets, buildMovePresets, DEF_FIELDS,
} from "../rules/battle.mjs";
import { CATS, normCat } from "../rules/enemy-model.mjs";
import * as C from "../rules/enemy-create.mjs";
import { createTerminal } from "../rules/terminal.mjs";
import { notify } from "../helpers/notify.mjs";

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api;

// the system path is rewritten by tools/set-system-id.mjs when promoting DEV → stable, as in terminal.mjs
const TEMPLATE = "systems/wastelanders-dev/templates/apps/enemy-create.hbs";
const cut = (s, n = 70) => (s.length > n ? `${s.slice(0, n - 2)}…` : s);

let terminal = null;
let presets = null;
/** The presets of the battle generator: the book's attacks, energy weapons, grenades and the generator's own; moves with texts */
function presetLists() {
  if (!presets) {
    terminal ??= createTerminal({ toast: () => {}, icon: () => "" });
    const db = terminal.battle.BT.DB;
    presets = { attacks: buildAttackPresets(db), moves: buildMovePresets(db) };
  }
  return presets;
}

/** The enemies that can be taken as a base: [{v, n, cat, from}]; the compendium's index is read once */
let compendiumIndex = null;
async function baseList() {
  const world = game.actors.filter((a) => a.type === "enemy" && a.testUserPermission(game.user, "OBSERVER"))
    .map((a) => ({ v: `w:${a.id}`, n: a.name, cat: normCat(a.system.cat), from: "world" }));
  if (!compendiumIndex) {
    const pack = game.packs.get(`${game.system.id}.opponents`);
    compendiumIndex = [];
    if (pack) {
      const idx = await pack.getIndex({ fields: ["system.cat", "system.type"] });
      compendiumIndex = [...idx].filter((e) => e.type === "enemy").map((e) => ({ v: `c:${e._id}`, n: e.name, cat: normCat(e.system?.cat ?? e.system?.type), from: "pack" }));
    }
  }
  const sort = (l) => [...l].sort((a, b) => a.n.localeCompare(b.n, "uk"));
  return { world: sort(world), pack: sort(compendiumIndex) };
}

export class EnemyCreateApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "pust-enemy-create",
    classes: ["wastelanders", "pust-ec-app"],
    position: { width: 660, height: "auto" },
    window: { title: "Новий супротивник", icon: "fa-solid fa-skull", resizable: true, minimizable: false },
    actions: {
      pickImg: EnemyCreateApp.#onPickImg,
      fresh: EnemyCreateApp.#onFresh,
      step: EnemyCreateApp.#onStep,
      quick: EnemyCreateApp.#onQuick,
      addAtk: EnemyCreateApp.#onAddAtk,
      addMove: EnemyCreateApp.#onAddMove,
      rm: EnemyCreateApp.#onRm,
      inv: EnemyCreateApp.#onInv,
      create: EnemyCreateApp.#onCreate,
      cancel: EnemyCreateApp.#onCancel,
    },
  };

  static PARTS = { form: { template: TEMPLATE, scrollable: [".pust-ec-body"] } };

  #f;
  #snap;
  #given;
  #folder;
  #baseVal = "";
  #baseName = "";
  #resolve;
  #focus = null;
  #busy = false;

  /**
   * Open the form. @param {{name?:string, folder?:string}} data what the «Create Actor» dialog gave
   * @returns {Promise<Actor|null>} the created actor, or null when the form was cancelled
   */
  static ask(data = {}) {
    return new Promise((resolve) => {
      const app = new EnemyCreateApp();
      app.#resolve = resolve;
      app.#given = String(data.name ?? "").trim();
      app.#folder = data.folder || null;
      app.#f = C.blankForm(app.#given);
      app.#snap = JSON.stringify(app.#f);
      app.render({ force: true });
    });
  }

  #finish(result) {
    const r = this.#resolve; this.#resolve = null;
    r?.(result);
  }

  async close(options = {}) {
    this.#finish(null);
    return super.close(options);
  }

  /* ---------------------------------- the view ---------------------------------- */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const f = this.#f;
    const guide = CAT_GUIDE[f.cat] ?? CAT_GUIDE.regular;
    const bases = await baseList();
    const item = (b) => ({ v: b.v, n: `${b.n} — ${CAT_LABEL[b.cat]}`, sel: b.v === this.#baseVal });
    const defLabel = (k) => DEF_FIELDS.find((d) => d[0] === k)?.[1] ?? k;
    const { attacks: atkP, moves: mvP } = presetLists();
    Object.assign(context, {
      f,
      baseGroups: [
        ...(bases.world.length ? [{ label: "Супротивники світу", items: bases.world.map(item) }] : []),
        ...(bases.pack.length ? [{ label: "Компендіум «Супротивники»", items: bases.pack.map(item) }] : []),
      ],
      baseName: this.#baseName, noBase: !this.#baseVal,
      cats: CATS.map((k) => ({ k, l: CAT_LABEL[k], sel: k === f.cat })),
      guide: guide.txt,
      hpQuick: guide.hp.map((v) => ({ v, on: v === f.hp })),
      armorQuick: guide.armor.map((v) => ({ v, on: v === f.armor })),
      defs: C.DEF_SELECTS.map((k) => ({ f: k, l: defLabel(k), opts: Object.entries(k === "rad" ? R4 : R3).map(([v, l]) => ({ v, l, sel: v === f.def[k] })) })),
      flags: C.FLAG_LIST.map(([k, l]) => ({ f: k, l, on: !!f.flags[k] })),
      attacks: f.attacks.map((a, i) => ({
        ...a, i, bad: !C.diceOk(a.d),
        types: [{ k: "", n: `Авто: ${DMG_TYPES[atkType(`${a.n} ${a.note}`)].n}`, sel: !a.type }, ...Object.entries(DMG_TYPES).map(([k, t]) => ({ k, n: t.n, sel: k === a.type }))],
      })),
      moves: f.moves.map((m, i) => ({ ...m, i })),
      aspects: f.aspects.map((a, i) => ({ ...a, i })),
      atkPresets: atkP.map(([g, list], gi) => ({ g, items: list.map((a, k) => ({ v: `${gi}:${k}`, t: cut(`${a.n} — ${a.d}${a.note ? ` (${a.note})` : ""}`) })) })).filter((g) => g.items.length),
      movePresets: mvP.map((m, i) => ({ v: i, t: cut(`${m.n} — ${m.t}`) })),
      imgSrc: f.img || `systems/${game.system.id}/assets/daemon-skull.png`,
    });
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    const fit = (ta) => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight + 2}px`; };
    root.querySelectorAll("textarea").forEach((ta) => { requestAnimationFrame(() => fit(ta)); ta.addEventListener("input", () => fit(ta)); });
    root.querySelectorAll("[data-f]").forEach((el) => {
      el.addEventListener(el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input", (e) => this.#read(e.currentTarget));
    });
    root.querySelector("[name='base']")?.addEventListener("change", (e) => this.#pickBase(e.currentTarget.value));
    root.querySelector("[name='atkpreset']")?.addEventListener("change", (e) => this.#addFromPreset("atk", e.currentTarget.value));
    root.querySelector("[name='mvpreset']")?.addEventListener("change", (e) => this.#addFromPreset("mv", e.currentTarget.value));
    root.querySelector("[name='aspadd']")?.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const t = e.currentTarget.value.trim();
      if (t) { this.#f.aspects.push({ t, inv: 0 }); this.#focus = "[name='aspadd']"; this.render(); }
    });
    if (this.#focus) { root.querySelector(this.#focus)?.focus(); this.#focus = null; }
  }

  /* --------------------------------- the state ---------------------------------- */
  /** A control of the form changed: write it to the state (no redraw: typing must keep its focus) */
  #read(el) {
    const f = this.#f, key = el.dataset.f, k = el.dataset.k, i = Number(el.dataset.i);
    const num = (v, min) => Math.max(min, Math.round(Number(String(v).replace(",", "."))) || 0);
    if (k === "attacks") {
      const a = f.attacks[i]; if (!a) return;
      if (key === "ammo") a.ammo = num(el.value, 0); else a[key] = el.value;
      if (key === "d") el.classList.toggle("bad", !C.diceOk(el.value));
      if (key === "n" || key === "note") { // «Авто» type follows the words
        const opt = this.element.querySelector(`select[data-k='attacks'][data-i='${i}'] option[value='']`);
        if (opt) opt.textContent = `Авто: ${DMG_TYPES[atkType(`${a.n} ${a.note}`)].n}`;
      }
      return;
    }
    if (k === "moves") { const m = f.moves[i]; if (m) m[key] = el.value; return; }
    if (k === "aspects") { const a = f.aspects[i]; if (a) a.t = el.value; return; }
    if (key.startsWith("def.")) { f.def[key.slice(4)] = el.value; return; }
    if (key.startsWith("flag.")) { f.flags[key.slice(5)] = el.checked; return; }
    switch (key) {
      case "name": f.name = el.value; break;
      case "notes": f.notes = el.value; break;
      case "cat":
        f.cat = el.value;
        Object.assign(f, C.catDefaults(f.cat));
        this.render();
        break;
      case "hp": case "armor": case "psiArmor":
        f[key] = num(el.value, key === "hp" ? 1 : 0);
        this.element.querySelectorAll(`[data-action='quick'][data-f='${key}']`).forEach((b) => b.classList.toggle("on", Number(b.dataset.v) === f[key]));
        break;
      default: break;
    }
  }

  #dirty() { return JSON.stringify(this.#f) !== this.#snap; }

  async #pickBase(value) {
    if (value === this.#baseVal) return;
    if (this.#dirty()) {
      const yes = await DialogV2.confirm({
        window: { title: "Замінити зміни?" }, content: "<p>У формі є незбережені зміни. Замінити їх на обраного супротивника?</p>", rejectClose: false, modal: true,
      });
      if (!yes) return this.render();
    }
    if (!value) return this.#restart();
    const [from, id] = [value.slice(0, 1), value.slice(2)];
    let doc = null;
    try { doc = from === "w" ? game.actors.get(id) : await game.packs.get(`${game.system.id}.opponents`)?.getDocument(id); } catch (e) { console.error(e); }
    if (!doc) { notify.warn("Не вдалося відкрити цього супротивника."); return this.render(); }
    this.#f = C.formFromSystem(doc.system, { name: this.#given || doc.name, img: doc.img });
    this.#baseVal = value; this.#baseName = doc.name;
    this.#snap = JSON.stringify(this.#f);
    this.render();
  }

  #restart() {
    this.#f = C.blankForm(this.#given);
    this.#baseVal = ""; this.#baseName = "";
    this.#snap = JSON.stringify(this.#f);
    this.render();
  }

  #addFromPreset(kind, value) {
    const f = this.#f;
    if (kind === "atk") {
      if (value === "blank") f.attacks.push(C.attackRow({ d: "1d6" }));
      else if (value) { const [g, k] = value.split(":").map(Number); const p = presetLists().attacks[g]?.[1][k]; if (p) f.attacks.push(C.attackFromPreset(p)); }
      this.#focus = `[data-k='attacks'][data-i='${f.attacks.length - 1}'][data-f='n']`;
    } else {
      if (value === "blank") f.moves.push({ n: "", t: "" });
      else if (value !== "") { const p = presetLists().moves[Number(value)]; if (p) f.moves.push({ n: p.n, t: p.t }); }
      this.#focus = `[data-k='moves'][data-i='${f.moves.length - 1}'][data-f='n']`;
    }
    this.render();
  }

  /* --------------------------------- the actions -------------------------------- */
  static async #onPickImg() {
    const Picker = foundry.applications.apps.FilePicker.implementation;
    await new Picker({ type: "image", current: this.#f.img, callback: (path) => { this.#f.img = path; this.render(); } }).browse();
  }

  static #onFresh() { this.#restart(); }

  static #onStep(event, target) {
    const f = this.#f, key = target.dataset.f, d = Number(target.dataset.d) || 0;
    if (target.dataset.k === "attacks") { const a = f.attacks[Number(target.dataset.i)]; if (a) a.ammo = Math.max(0, Math.min(20, a.ammo + d)); } else f[key] = Math.max(key === "hp" ? 1 : 0, f[key] + d);
    this.render();
  }

  static #onQuick(event, target) {
    this.#f[target.dataset.f] = Number(target.dataset.v);
    this.render();
  }

  static #onAddAtk() { this.#addFromPreset("atk", "blank"); }
  static #onAddMove() { this.#addFromPreset("mv", "blank"); }

  static #onRm(event, target) {
    const list = this.#f[target.dataset.k];
    list?.splice(Number(target.dataset.i), 1);
    this.render();
  }

  static #onInv(event, target) {
    const a = this.#f.aspects[Number(target.dataset.i)];
    if (a) a.inv = Math.max(0, Math.min(9, a.inv + (Number(target.dataset.d) || 0)));
    this.render();
  }

  static async #onCreate() {
    if (this.#busy) return;
    const r = C.buildEnemy(this.#f);
    if (r.err) return notify.warn(r.err);
    this.#busy = true;
    try {
      const data = { name: r.name, type: "enemy", system: r.system, ...(r.img ? { img: r.img } : {}), ...(this.#folder ? { folder: this.#folder } : {}) };
      const actor = await Actor.implementation.create(data);
      this.#finish(actor ?? null);
      await this.close();
    } catch (e) {
      console.error(e);
      notify.error("Не вдалося створити супротивника: " + (e.message ?? e));
    } finally { this.#busy = false; }
  }

  static async #onCancel() { return this.close(); }
}

/** What Actor.create hands back when the form was cancelled: the «Create Actor» dialog then closes without opening a sheet */
export const CANCELLED = Object.freeze({ pustCancelled: true, sheet: { render() {} } });

/**
 * Ask for an enemy through the form. Foundry's «Create Actor» window (still open behind it, waiting for the result) is hidden
 * while the form is up.
 * @returns {Promise<Actor|object>} the created actor, or CANCELLED
 */
export async function askEnemy(data) {
  for (const app of foundry.applications.instances.values()) {
    if (app instanceof DialogV2 && app.element?.querySelector("[name='type']")) app.element.style.visibility = "hidden";
  }
  return (await EnemyCreateApp.ask(data)) ?? CANCELLED;
}
