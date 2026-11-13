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
import { openCheckPanel, rollWeaponDamage } from "../applications/check-panel.mjs";
import { EXTRA_TYPES, weaponDmgType } from "../rules/damage-types.mjs";

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
      weaponDamage: WastelandersCharacterSheetV2.#onWeaponDamage,
      jsonOpen: WastelandersCharacterSheetV2.#onJsonOpen,
      jsonSave: WastelandersCharacterSheetV2.#onJsonSave,
      quickStart: WastelandersCharacterSheetV2.#onQuickStart,
      addPick: WastelandersCharacterSheetV2.#onAddPick,
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
    context.quickFold = !!this.ui.quickFold;
    context.statusFold = !!this.ui.statusFold;
    context.ui = { ovOpen: !!this.ui.ovOpen, defOpen: !!this.ui.defOpen, xpHelpOpen: !!this.ui.xpHelpOpen, sheetBarOpen: !!this.ui.sheetBarOpen }; // folded blocks in «Налаштування» (closed by default)
    context.restUi = this.ui.rest;
    context.customKind = this.customKind;
    context.editable = this.isEditable;
    context.quickChars = QUICK_CHARS.map((c, i) => ({
      i, n: c.name, sub: `${c.arch} · ${(SPECIES[c.species] || SPECIES.human).n.toLowerCase()}`, title: `${c.arch}, ${(SPECIES[c.species] || SPECIES.human).n}. ${c.concept || ""}`,
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
    // aspects wrap: the field grows with its text; Enter doesn't add a line break (the value stays one line)
    root.querySelectorAll(".pust-asp-ta").forEach((ta) => {
      const fit = () => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight + 2}px`; };
      fit();
      ta.addEventListener("input", () => {
        if (/\n/.test(ta.value)) ta.value = ta.value.replace(/\n/g, " ");
        fit();
      });
      ta.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ta.blur(); } });
    });
    // «Видові властивості» folds; the sheet remembers it while open (closed again for a new window)
    root.querySelector(".pust-props")?.addEventListener("toggle", (ev) => { this.ui.propsOpen = ev.currentTarget.open; });
    root.querySelectorAll("details[data-fold]").forEach((el) => el.addEventListener("toggle", () => { this.ui[el.dataset.fold] = el.open; }));
    this.#showGoTo(root);
    // the damage field (author, 2026-11-14): a long value («менша з 2d6») gets a smaller font (down to 10 px), so it fits the cell;
    // one that still doesn't fit («1d10[отрута]+2d6[пси]») moves to a row of its own under the weapon, with a «Шкода» chip,
    // and wraps there (the field grows with its text; Enter leaves the field)
    // (the text is measured on a canvas in the field's own font: a field's scrollWidth doesn't tell the text width reliably)
    const ctx = (WastelandersCharacterSheetV2.#measure ||= document.createElement("canvas").getContext("2d"));
    const fitDmg = (el) => {
      const row = el.closest(".pust-grow");
      row?.classList.remove("dmg-wide");
      el.style.fontSize = "";
      el.style.height = "";
      const cs = getComputedStyle(el);
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 3;
      const base = parseFloat(cs.fontSize) || 13;
      let px = base;
      const width = () => { ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${px}px ${cs.fontFamily}`; return ctx.measureText(el.value).width; };
      while (width() > room && px > 10) px -= 0.5;
      if (width() <= room) {
        if (px !== base) el.style.fontSize = `${px}px`;
        return;
      }
      row?.classList.add("dmg-wide");
      if (el.scrollHeight > el.clientHeight + 1) {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight + 2}px`;
      }
    };
    const dmgFields = root.querySelectorAll("textarea.pust-dmg-in");
    requestAnimationFrame(() => dmgFields.forEach(fitDmg));
    dmgFields.forEach((el) => {
      el.addEventListener("input", () => {
        if (/\n/.test(el.value)) el.value = el.value.replace(/\n/g, "");
        fitDmg(el);
      });
      el.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); el.blur(); } });
    });
    // a cryo weapon's damage field shows the damage one step down; while editing it shows the base damage, which is what is saved
    root.querySelectorAll(".pust-cryo[data-base]").forEach((el) => {
      el.addEventListener("focus", () => { el.value = el.dataset.base; el.select(); fitDmg(el); });
      el.addEventListener("blur", () => { if (el.value === el.dataset.base) el.value = el.dataset.eff; fitDmg(el); });
    });
    // gear notes wrap: the field grows with its text (one paragraph, Enter leaves the field);
    // in Броня / Інший мотлох a note that doesn't fit its column on one line gets a row of its own
    root.querySelectorAll(".pust-gnote-in, .pust-gnote-ta").forEach((ta) => {
      const row = ta.classList.contains("pust-gnote-in") ? ta.closest(".pust-grow") : null;
      // one line keeps the CSS height (the same as the fields beside it); longer text grows the field
      const grow = () => {
        ta.style.height = "";
        if (ta.scrollHeight <= ta.clientHeight + 1) return;
        ta.style.height = "auto";
        ta.style.height = `${ta.scrollHeight + 2}px`;
      };
      const fit = () => {
        if (row && !row.classList.contains("wide")) {
          ta.style.height = "";
          if (ta.scrollHeight > ta.clientHeight + 2) row.classList.add("wide");
        }
        grow();
      };
      requestAnimationFrame(fit);
      ta.addEventListener("input", () => {
        if (/\n/.test(ta.value)) ta.value = ta.value.replace(/\n/g, " ");
        fit();
      });
      ta.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ta.blur(); } });
    });
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
  /** A canvas context for measuring text (the damage field fit) */
  static #measure = null;
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
      case "erudit": return this.#run((C) => C.setErudite(t.dataset.i, t.value));
      case "fav": return this.#run((C) => C.setFavourite(t.value));
      case "chem-used": return this.#run((C, st, L) => L.chemToggleUsed(t.dataset.drug, t.checked));
      case "grant": return this.#run((C) => C.setGrantSkill(t.dataset.n, t.value));
      // «Тип» of a weapon: an energy version goes to the rules (en); fire, psi, poison, radiation only colour the damage (dt)
      case "dtype": return this.#run((C, st) => {
        const i = +t.dataset.i;
        const w = st.weapons[i];
        if (!w) return false;
        const v = t.value;
        if (EXTRA_TYPES.includes(v)) {
          if (w.en) C.setField(`weapons.${i}.en`, "");
          st.weapons[i].dt = v;
        } else {
          if ((w.en || "") !== v) C.setField(`weapons.${i}.en`, v);
          delete st.weapons[i].dt;
          // «звичайна» for a weapon whose name or note says fire / psi / poison / radiation: physical, as chosen
          if (!v && EXTRA_TYPES.includes(weaponDmgType({ w: st.weapons[i] }))) st.weapons[i].dt = "phys";
        }
      });
    }
  }

  #onUiInput(event) {
    const t = event.currentTarget;
    const key = t.dataset.ui;
    this.ui[key] = t.type === "checkbox" ? t.checked : t.value;
    if (["catSec", "catSort"].includes(key) && event.type === "change") return this.render();
    if (["q", "catQ", "addQ"].includes(key) && event.type === "input") {
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
    const ok = await this.#run((C) => C.act(act, data));
    // «Очистити аркуш» also puts back the default picture (portrait and token)
    if (act === "new" && ok !== false) {
      const img = this.document.constructor.getDefaultArtwork({ type: this.document.type }).img;
      await this.document.update({ img, "prototypeToken.texture.src": img });
    }
  }

  /** A tab; a guide link also names the block to show (data-go: a selector; no data-tab — the block is above the tabs) */
  static #onTab(event, target) {
    const { tab, go } = target.dataset;
    if (tab) this.ui.tab = tab;
    if (go) {
      this.#goTo = go;
      if (go.startsWith(".q-")) this.ui.quickFold = false; // «Швидкий доступ» unfolds to show ОЗ / жетони Долі
    }
    this.render();
  }

  /** The block a guide link asked for: scrolled into view and flashed after the render */
  #goTo = null;

  #showGoTo(root) {
    const sel = this.#goTo;
    this.#goTo = null;
    const el = sel && root.querySelector(sel);
    if (!el) return;
    const block = el.matches("input, select, textarea") ? el.closest(".pust-row") || el : el;
    requestAnimationFrame(() => {
      block.scrollIntoView({ block: "center", behavior: "smooth" });
      block.classList.remove("pust-flash");
      void block.offsetWidth; // restart the animation
      block.classList.add("pust-flash");
      setTimeout(() => block.classList.remove("pust-flash"), 1800);
    });
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

  /** «+ Зброя / + Броня / + Річ»: open (or close) that list's catalogue under it */
  static #onAddPick(event, target) {
    const l = target.dataset.l || "";
    this.ui.addPick = this.ui.addPick === l ? "" : l;
    this.ui.addQ = "";
    this.render();
  }

  /** «Шкода» of a weapon in Мотлох: just its damage dice, to chat (author, 2026-11-14) */
  static #onWeaponDamage(event, target) {
    return rollWeaponDamage(this.document, +target.dataset.weapon);
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
