/**
 * Електронний аркуш каравану in Foundry: the HTML caravan sheet's features, rebuilt natively.
 * Every field and button goes to the HTML caravan sheet's handlers (caravan-controller.mjs).
 */
import { textToHtml } from "../rules/rich-text.mjs";
import { keepNoteSizes, refitOnResize, rememberScroll, watchNotes } from "./refit.mjs";
import { caravanLogicFor, readCaravan, runCaravanAction, saveCaravan } from "../applications/caravan-actions.mjs";
import { caravanToState } from "../rules/caravan-adapter.mjs";
import { exportCaravan, replaceCaravanFromFile } from "../applications/character-json.mjs";
import { buildCaravanView } from "./caravan-view.mjs";
import { postFateCard } from "../applications/check-panel.mjs";
import { rollTurret, turretOf } from "../applications/caravan-turret.mjs";
import { typeClass, typeLabel, typeOptions } from "./enemy-view.mjs";
import { diceLabel } from "../rules/battle.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const CONFIRM_MS = 3000;
/** How long «Скасувати» stays after an action (the HTML sheet's toast with undo: 7 s) */
const UNDO_MS = 7000;
/** «Скасувати» shows only after the whole caravan is replaced at random or cleared (author, 2026-11-14; the HTML sheet offers it after more) */
const UNDOABLE = new Set(["clear", "random"]);

export class WastelandersCaravanSheetV2 extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wastelanders", "pust-sheet", "pust-caravan-sheet"],
    position: { width: 820, height: 900 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      cact: WastelandersCaravanSheetV2.#onAct,
      uiToggle: WastelandersCaravanSheetV2.#onUiToggle,
      pustTab: WastelandersCaravanSheetV2.#onTab,
      undo: WastelandersCaravanSheetV2.#onUndo,
      jsonOpen: WastelandersCaravanSheetV2.#onJsonOpen,
      jsonSave: WastelandersCaravanSheetV2.#onJsonSave,
      autoRange: WastelandersCaravanSheetV2.#onAutoRange,
      brahminBonus: WastelandersCaravanSheetV2.#onBrahminBonus,
      pathfinder: WastelandersCaravanSheetV2.#onPathfinder,
      turretRoll: WastelandersCaravanSheetV2.#onTurretRoll,
      turretHit: WastelandersCaravanSheetV2.#onTurretHit,
    },
  };

  static PARTS = {
    sheet: { template: "systems/wastelanders-dev/templates/actor/caravan-v2.hbs", scrollable: [".pust-body"] },
  };

  /** Sheet UI state (not saved): guide, folds, tab */
  ui = { guide: false, foldImps: false, tab: "imps", quickFold: false, sheetBarOpen: false };
  /** The caravan before the last undoable action (null when there is nothing to undo) */
  undoState = null;
  #undoTimer = null;

  get title() {
    return this.document.name || game.i18n.localize("TYPES.Actor.caravan");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const S = readCaravan(this.document);
    const { L } = caravanLogicFor(S, { quiet: true });
    context.v = buildCaravanView(S, L, this.ui);
    context.tab = this.ui.tab;
    context.quickFold = !!this.ui.quickFold;
    context.ui = { sheetBarOpen: !!this.ui.sheetBarOpen };
    context.editable = this.isEditable;
    context.undo = !!this.undoState;
    context.autoRange = !!this.document.getFlag(game.system.id, "autoRange");
    // «Породисті браміни» / «Паливний регулятор» (author, 2026-11-15): which bonus the trip takes, and «Першопроходець»
    const pathfinder = !!this.document.getFlag(game.system.id, "pathfinder");
    // «Турель» (author, 2026-11-15): its damage chip and «Завдати цілям» in the upgrade's card, set up in «Надбавки»
    if ((parseInt(S.imp?.turret, 10) || 0) > 0) {
      const t = turretOf(this.document);
      context.turret = { dice: t.dice, diceText: diceLabel(t.dice), type: t.type, tcls: typeClass(t.type), typeLabel: typeLabel(t.type), typeOpts: typeOptions(t.type) };
    }
    context.brahmins = {
      taken: (parseInt(S.imp?.brahmins, 10) || 0) > 0, tachka: !!S.tachka, pathfinder, share: pathfinder ? "½" : "¼",
      range: this.document.getFlag(game.system.id, "brahminBonus") !== "time",
    };
    return context;
  }

  /** @override — remember the scroll, so a re-render keeps it (refit.mjs) */
  async _preRender(context, options) {
    await super._preRender(context, options);
    rememberScroll(this);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    const fits = []; // refit when the window's width changes (refitOnResize)
    // one-paragraph fields (reputation, story, cargo notes) grow with their text; Enter leaves the field
    root.querySelectorAll(".pust-asp-ta, .pust-gnote-in").forEach((ta) => {
      const fit = () => {
        ta.style.height = "";
        if (ta.scrollHeight <= ta.clientHeight + 1) return;
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight + 2}px`;
      };
      requestAnimationFrame(fit);
      fits.push(fit);
      ta.addEventListener("input", () => {
        if (/\n/.test(ta.value)) ta.value = ta.value.replace(/\n/g, " ");
        fit();
      });
      ta.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ta.blur(); } });
    });
    refitOnResize(this, fits);
    // folds («Аркуш») are remembered while the sheet is open
    root.querySelectorAll("details[data-fold]").forEach((el) => el.addEventListener("toggle", () => { this.ui[el.dataset.fold] = el.open; }));
    if (!this.isEditable) {
      root.querySelectorAll("input, select, textarea, button[data-action='cact']").forEach((el) => (el.disabled = true));
      return;
    }
    // the turret's damage and type («Надбавки»): a flag of the caravan
    root.querySelectorAll("[data-tf]").forEach((el) => el.addEventListener("change", async () => {
      const t = { ...turretOf(this.document), [el.dataset.tf]: el.value.trim() };
      if (el.dataset.tf === "dice" && !Roll.validate(t.dice.replace(/^d/i, "1d"))) {
        ui.notifications.warn(`Не вдалося розібрати кістки: ${t.dice}`);
        return this.render();
      }
      await this.document.setFlag(game.system.id, "turret", t);
    }));
    // «Примітки» in Foundry's editor (author, 2026-11-15): saved as you write (refit.mjs watchNotes) and before the sheet closes
    keepNoteSizes(this, root);
    watchNotes(this, root, (el) => this.#saveNote(el), this.isEditable);
    root.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("change", (ev) => {
      const t = ev.currentTarget;
      this.dropUndo();
      return runCaravanAction(this.document, (C) => C.setField(t.dataset.k, t.type === "checkbox" ? t.checked : t.value));
    }));
  }

  /** Save a note editor's text when it changed (the state keeps the editor's HTML; the .json gets plain text) */
  #saveNote(el) {
    const path = { notes: "system.notes" }[el.dataset.note];
    if (!path || !el.isConnected || !this.isEditable) return undefined;
    const v = String(el.value ?? "");
    if (v === textToHtml(foundry.utils.getProperty(this.document, path))) return undefined;
    return this.document.update({ [path]: v }, { render: false }); // no re-render: the editor keeps its state
  }

  /** @override — an unsaved note is kept when the sheet closes */
  async _preClose(options) {
    for (const el of this.element?.querySelectorAll?.("prose-mirror[data-note]") ?? []) await this.#saveNote(el);
    return super._preClose(options);
  }

  /** A button of the HTML caravan sheet (data-act + its dataset); data-confirm asks twice */
  static async #onAct(event, target) {
    const { action, act, confirm, ...data } = target.dataset;
    if (confirm && !target.classList.contains("armed")) {
      target.classList.add("armed");
      target.title = "Натисни ще раз, щоб підтвердити";
      ui.notifications.info("Натисни ще раз, щоб підтвердити.");
      setTimeout(() => target.classList.remove("armed"), CONFIRM_MS);
      return;
    }
    // «Удача партії» rolls «Кістка Долі» to chat (author, 2026-11-14), instead of the HTML sheet's toast
    if (act === "rollFate") {
      const luck = parseInt(caravanToState(this.document.toObject()).luck, 10) || 0;
      const roll = await new Roll("1d10").evaluate();
      return postFateCard(this.document, { v: roll.total, mod: luck, party: true });
    }
    const prev = UNDOABLE.has(act) ? caravanToState(this.document.toObject()) : null;
    // any other action ends the offer: undoing would also throw away what was done after
    if (!prev) this.dropUndo();
    await runCaravanAction(this.document, (C) => C.act(act, data));
    if (prev) this.setUndo(prev);
  }

  /** Hide «Скасувати» */
  dropUndo() {
    if (!this.undoState) return;
    this.undoState = null;
    clearTimeout(this.#undoTimer);
  }

  /** Offer «Скасувати» for a while */
  setUndo(prev) {
    this.undoState = prev;
    clearTimeout(this.#undoTimer);
    this.#undoTimer = setTimeout(() => {
      this.undoState = null;
      if (this.rendered) this.render();
    }, UNDO_MS);
    this.render();
  }

  static async #onUndo() {
    const prev = this.undoState;
    if (!prev) return;
    this.undoState = null;
    clearTimeout(this.#undoTimer);
    await saveCaravan(this.document, prev);
    ui.notifications.info("Скасовано.");
  }

  static #onTab(event, target) {
    this.ui.tab = target.dataset.tab;
    this.render();
  }

  static #onUiToggle(event, target) {
    this.ui[target.dataset.key] = !this.ui[target.dataset.key];
    this.render();
  }

  static async #onJsonOpen() {
    if (await replaceCaravanFromFile(this.document)) this.dropUndo();
  }

  /** «Витрачати автоматично» (author, 2026-11-15): moving the caravan on the map spends its range without asking
   *  (module/canvas/caravan-move.mjs); a flag of the caravan */
  static #onAutoRange() {
    return this.document.setFlag(game.system.id, "autoRange", !this.document.getFlag(game.system.id, "autoRange"));
  }

  /** The brahmins' bonus for the trip: less range (spent on the map accordingly) or less time */
  static #onBrahminBonus(event, target) {
    return this.document.setFlag(game.system.id, "brahminBonus", target.dataset.v === "time" ? "time" : "range");
  }

  /** «Першопроходець» in the party: the brahmins' bonus grows to a half */
  static #onPathfinder() {
    return this.document.setFlag(game.system.id, "pathfinder", !this.document.getFlag(game.system.id, "pathfinder"));
  }

  /** The turret's dice chip: its damage to chat */
  static #onTurretRoll() {
    return rollTurret(this.document);
  }

  /** «Завдати цілям»: the turret fires at the targets */
  static #onTurretHit() {
    return rollTurret(this.document, { apply: true });
  }

  static #onJsonSave() {
    return exportCaravan(this.document);
  }
}
