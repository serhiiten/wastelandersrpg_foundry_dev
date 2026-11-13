/**
 * Електронний аркуш каравану in Foundry: the HTML caravan sheet's features, rebuilt natively.
 * Every field and button goes to the HTML caravan sheet's handlers (caravan-controller.mjs).
 */
import { caravanLogicFor, readCaravan, runCaravanAction, saveCaravan } from "../applications/caravan-actions.mjs";
import { caravanToState } from "../rules/caravan-adapter.mjs";
import { exportCaravan, replaceCaravanFromFile } from "../applications/character-json.mjs";
import { buildCaravanView } from "./caravan-view.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const CONFIRM_MS = 3000;
/** How long «Скасувати» stays after an action (the HTML sheet's toast with undo: 7 s) */
const UNDO_MS = 7000;
/** Actions the HTML sheet lets you undo */
const UNDOABLE = new Set(["clear", "random", "quick", "rollImps", "cnt-del", "cg-del", "cimp-del"]);

export class WastelandersCaravanSheetV2 extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wastelanders", "pust-sheet"],
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
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    // one-paragraph fields (reputation, story, cargo notes) grow with their text; Enter leaves the field
    root.querySelectorAll(".pust-asp-ta, .pust-gnote-in").forEach((ta) => {
      const fit = () => {
        ta.style.height = "";
        if (ta.scrollHeight <= ta.clientHeight + 1) return;
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight + 2}px`;
      };
      requestAnimationFrame(fit);
      ta.addEventListener("input", () => {
        if (/\n/.test(ta.value)) ta.value = ta.value.replace(/\n/g, " ");
        fit();
      });
      ta.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ta.blur(); } });
    });
    // folds («Аркуш») are remembered while the sheet is open
    root.querySelectorAll("details[data-fold]").forEach((el) => el.addEventListener("toggle", () => { this.ui[el.dataset.fold] = el.open; }));
    if (!this.isEditable) {
      root.querySelectorAll("input, select, textarea, button[data-action='cact']").forEach((el) => (el.disabled = true));
      return;
    }
    root.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("change", (ev) => {
      const t = ev.currentTarget;
      return runCaravanAction(this.document, (C) => C.setField(t.dataset.k, t.type === "checkbox" ? t.checked : t.value));
    }));
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
    const prev = UNDOABLE.has(act) ? caravanToState(this.document.toObject()) : null;
    await runCaravanAction(this.document, (C) => C.act(act, data));
    if (prev) this.setUndo(prev);
  }

  /** Offer «Скасувати» for a while (also after opening a .json) */
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
    const prev = caravanToState(this.document.toObject());
    if (await replaceCaravanFromFile(this.document)) this.setUndo(prev);
  }

  static #onJsonSave() {
    return exportCaravan(this.document);
  }
}
