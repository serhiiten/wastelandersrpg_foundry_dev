/**
 * Електронний аркуш персонажа in Foundry: the HTML electronic sheet's features, rebuilt natively.
 * The sheet reads the character through the rules engine (evaluate), shows buildView(), and sends
 * every field change and button to the HTML sheet's handlers (controller) via runAction().
 */
import { createController } from "../rules/controller.mjs";
import { FEAT, PERK, SPECIES, blankState } from "../rules/core.mjs";
import { QUICK_CHARS } from "../rules/quickstart.mjs";
import { evaluate, readState, runAction } from "../applications/character-actions.mjs";
import { exportCharacter, replaceCharacter, replaceCharacterFromFile } from "../applications/character-json.mjs";
import { buildView } from "./character-view.mjs";
import { openCheckPanel } from "../applications/check-panel.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Buttons whose result is hard to undo ask twice (like the HTML sheet's «Натисни ще раз») */
const CONFIRM_MS = 3000;

export class WastelandersCharacterSheetV2 extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wastelanders", "pust-sheet"],
    position: { width: 900, height: 920 },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      act: WastelandersCharacterSheetV2.#onAct,
      pustTab: WastelandersCharacterSheetV2.#onTab,
      pick: WastelandersCharacterSheetV2.#onPick,
      uiToggle: WastelandersCharacterSheetV2.#onUiToggle,
      sitAdd: WastelandersCharacterSheetV2.#onSitAdd,
      addictionAdd: WastelandersCharacterSheetV2.#onAddictionAdd,
      customForm: WastelandersCharacterSheetV2.#onCustomForm,
      customSave: WastelandersCharacterSheetV2.#onCustomSave,
      checkPanel: WastelandersCharacterSheetV2.#onCheckPanel,
      jsonOpen: WastelandersCharacterSheetV2.#onJsonOpen,
      jsonSave: WastelandersCharacterSheetV2.#onJsonSave,
      quickStart: WastelandersCharacterSheetV2.#onQuickStart,
    },
  };

  static PARTS = {
    sheet: { template: "systems/wastelanders-dev/templates/actor/character-v2.hbs", scrollable: [".pust-body"] },
  };

  /** Sheet UI state (not saved): tab, open pickers, search, rest options, unsent inputs */
  ui = { tab: "build", pick: "", q: "", showAll: false, cat: false, catQ: "", rest: { restQr: "hp" } };
  customKind = "";

  get title() {
    return this.document.name || game.i18n.localize("TYPES.Actor.character");
  }

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { st, d, L } = evaluate(this.document);
    context.v = buildView(st, d, L, this.ui);
    context.actor = this.document;
    context.tab = this.ui.tab;
    context.restUi = this.ui.rest;
    context.customKind = this.customKind;
    context.editable = this.isEditable;
    context.quickChars = QUICK_CHARS.map((c, i) => ({
      i, n: c.name, title: `${c.arch}, ${(SPECIES[c.species] || SPECIES.human).n}. ${c.concept || ""}`,
    }));
    return context;
  }

  /** Run one of the HTML sheet's handlers on this character and save */
  #run(fn) {
    const toast = (msg, kind) => (kind === "bad" ? ui.notifications.warn(msg) : ui.notifications.info(msg));
    return runAction(this.document, (st, L) => fn(createController(st, L, { toast }), st, L), { ui: this.ui.rest });
  }

  /** @override */
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    if (!this.isEditable) {
      root.querySelectorAll("input, select, textarea, button[data-action='act']").forEach((el) => (el.disabled = true));
      return;
    }
    // fields bound to the HTML sheet's state
    root.querySelectorAll("[data-k]").forEach((el) => el.addEventListener("change", (ev) => this.#onField(ev)));
    root.querySelectorAll("[data-change]").forEach((el) => el.addEventListener("change", (ev) => this.#onSpecialChange(ev)));
    // sheet UI state (search boxes, pending text)
    root.querySelectorAll("[data-ui]").forEach((el) => {
      el.addEventListener("input", (ev) => this.#onUiInput(ev));
      el.addEventListener("change", (ev) => this.#onUiInput(ev));
    });
    root.querySelectorAll("[data-ui-rest]").forEach((el) => el.addEventListener("change", (ev) => {
      const t = ev.currentTarget;
      this.ui.rest[t.dataset.uiRest] = t.type === "checkbox" ? t.checked : t.value;
    }));
    // keep focus in the search box after a re-render
    if (this.#refocus) {
      const el = root.querySelector(`[data-ui="${this.#refocus}"]`);
      if (el) {
        el.focus();
        el.setSelectionRange?.(el.value.length, el.value.length);
      }
      this.#refocus = null;
    }
  }

  #refocus = null;
  #searchTimer = null;

  #onField(event) {
    const t = event.currentTarget;
    const k = t.dataset.k;
    let v = t.type === "checkbox" || t.type === "radio" ? t.checked : t.value;
    const num = !!t.dataset.num;
    return this.#run((C) => C.setField(k, v, { num }));
  }

  #onSpecialChange(event) {
    const t = event.currentTarget;
    switch (t.dataset.change) {
      case "erudite": return this.#run((C) => C.setErudite(t.dataset.i, t.value));
      case "fav": return this.#run((C) => C.setFavourite(t.value));
      case "chem-used": return this.#run((C, st, L) => L.chemToggleUsed(t.dataset.drug, t.checked));
    }
  }

  #onUiInput(event) {
    const t = event.currentTarget;
    const key = t.dataset.ui;
    this.ui[key] = t.type === "checkbox" ? t.checked : t.value;
    if (["q", "catQ"].includes(key) && event.type === "input") {
      clearTimeout(this.#searchTimer);
      this.#searchTimer = setTimeout(() => {
        this.#refocus = key;
        this.render();
      }, 250);
    } else if (key === "showAll") this.render();
  }

  /* ---------- actions ---------- */

  /** A button of the HTML sheet (data-act + its dataset) */
  static async #onAct(event, target) {
    const { action, act, confirm, ...data } = target.dataset;
    if (confirm && !WastelandersCharacterSheetV2.#armed(target)) return;
    if (target.type === "checkbox") event.preventDefault?.();
    await this.#run((C) => C.act(act, data));
  }

  static #onTab(event, target) {
    this.ui.tab = target.dataset.tab;
    this.render();
  }

  static #onPick(event, target) {
    const kind = target.dataset.pick;
    this.ui.pick = this.ui.pick === kind ? "" : kind;
    this.ui.q = "";
    this.render();
  }

  static #onUiToggle(event, target) {
    const key = target.dataset.key;
    this.ui[key] = !this.ui[key];
    this.render();
  }

  static async #onSitAdd() {
    const t = this.ui.sitNew;
    const ok = await this.#run((C) => C.act("sit-add", { t }));
    if (ok !== false) this.ui.sitNew = "";
  }

  static async #onAddictionAdd() {
    const name = this.ui.chemNew;
    await this.#run((C) => C.act("addiction-add", { name }));
    this.ui.chemNew = "";
  }

  static #onCustomForm(event, target) {
    this.customKind = target.dataset.kind || "";
    this.ui.cName = "";
    this.ui.cDesc = "";
    this.ui.cExtra = false;
    this.render();
  }

  static async #onCustomSave() {
    const data = { kind: this.customKind, name: this.ui.cName, desc: this.ui.cDesc, extra: this.ui.cExtra };
    const ok = await this.#run((C) => C.act("custom-save", data));
    if (ok !== false) {
      this.customKind = "";
      this.render();
    }
  }

  static #onCheckPanel(event, target) {
    openCheckPanel(this.document, { ...target.dataset });
  }

  /** «Швидкий старт»: replace this character with a ready one (asks twice, keeps the sheet settings) */
  static async #onQuickStart(event, target) {
    if (!WastelandersCharacterSheetV2.#armed(target)) return;
    const qs = foundry.utils.deepClone(QUICK_CHARS[+target.dataset.i]);
    if (!qs) return;
    const set = { ...readState(this.document).set };
    const on = [];
    if (qs.species === "claw" && !set.claws) {
      set.claws = true;
      on.push("розумних Пазурів Смерті");
    }
    if ((qs.arch === "Псионік" || (qs.feats || []).includes("Псионік")) && !set.psi) {
      set.psi = true;
      on.push("псиоників");
    }
    await replaceCharacter(this.document, Object.assign(blankState(), qs, { set }));
    ui.notifications.info(`Швидкий старт: ${qs.name} — ${qs.arch.toLowerCase()}, ${SPECIES[qs.species].n.toLowerCase()}.`
      + (on.length ? ` У налаштуваннях увімкнено ${on.join(" і ")}.` : ""));
  }

  /** Two-click confirmation; true on the second click */
  static #armed(target) {
    if (target.classList.contains("armed")) return true;
    target.classList.add("armed");
    target.title = "Натисни ще раз, щоб підтвердити";
    ui.notifications.info("Натисни ще раз, щоб підтвердити.");
    setTimeout(() => target.classList.remove("armed"), CONFIRM_MS);
    return false;
  }

  static #onJsonOpen() {
    return replaceCharacterFromFile(this.document);
  }

  static #onJsonSave() {
    return exportCharacter(this.document);
  }

  /* ---------- drag & drop ---------- */

  /** Perks and feats dropped from compendiums follow the HTML sheet's rules (eligibility, slots) */
  async _onDropItem(event, item) {
    if (!this.document.isOwner) return null;
    if (item.parent?.uuid === this.document.uuid) return super._onDropItem(event, item);
    const base = (n) => n.replace(/\s*\([^)]*\)\s*$/, "");
    if (item.type === "perk") {
      const n = PERK[item.name] ? item.name : base(item.name);
      if (PERK[n]) return this.#run((C) => C.act("perk-add", { n }));
    }
    if (item.type === "feat") {
      const n = FEAT[item.name] ? item.name : base(item.name);
      if (FEAT[n]) return this.#run((C) => C.act("feat-add", { n }));
    }
    return super._onDropItem(event, item);
  }
}
