/**
 * Електронний аркуш каравану in Foundry: the HTML caravan sheet's features, rebuilt natively.
 * Every field and button goes to the HTML caravan sheet's handlers (caravan-controller.mjs).
 */
import { hotbarDraggable } from "../helpers/macros.mjs";
import { addHelpButton } from "../tours/help-button.mjs";
import { QS_LOCKED_ACTS, isQuickstartActor, qsLockTip } from "../helpers/quickstart-lock.mjs";
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
import { notify } from "../helpers/notify.mjs";
import { defibUsed, freeDefib, useDefib } from "../applications/caravan-defib.mjs";
import { askSpend } from "../applications/spend-ask.mjs";
import { postKarmaChange, postSaleCard } from "../applications/caravan-trade.mjs";
import { caravanLuck, luckManual, partyLuck } from "../applications/party-luck.mjs";
import { impCost } from "../rules/caravan-controller.mjs";
import { rowCost } from "../rules/caravan-adapter.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const CONFIRM_MS = 3000;
/** How long «Скасувати» stays after an action (the HTML sheet's toast with undo: 7 s) */
const UNDO_MS = 7000;
/** «Скасувати» shows only after the whole caravan is replaced at random or cleared (author, 2026-11-14; the HTML sheet offers it after more) */
const UNDOABLE = new Set(["clear", "random"]);
/** Karma changed by these is no deed (A14): the d6 of a new caravan, a caravan rolled or cleared — no karma card */
const KARMA_QUIET = new Set(["rollKarma", "random", "clear", "rollFate"]);
/** The compact caravan sheet (author, 2026-11-18; mockup Б1): the compact character sheet's width, remembered per user and caravan */
const COMPACT_W = 460;
const compactKey = (actor) => `pustelnyky-compact-${game.user.id}-${actor.id}`;
function compactStored(actor) { try { return localStorage.getItem(compactKey(actor)) === "1"; } catch (_) { return false; } }
function compactStore(actor, on) { try { if (on) localStorage.setItem(compactKey(actor), "1"); else localStorage.removeItem(compactKey(actor)); } catch (_) { /* not kept */ } }

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
      compactToggle: WastelandersCaravanSheetV2.#onCompactToggle,
      cargoEdit: WastelandersCaravanSheetV2.#onCargoEdit,
      defib: WastelandersCaravanSheetV2.#onDefib,
      cargoBuy: WastelandersCaravanSheetV2.#onCargoBuy,
      cargoSell: WastelandersCaravanSheetV2.#onCargoSell,
      luckAuto: WastelandersCaravanSheetV2.#onLuckAuto,
      noteEdit: WastelandersCaravanSheetV2.#onNoteEdit,
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
    // Удача партії (author, 2026-11-21; A14): from the УДЧ of the characters assigned to players, unless picked by hand
    const auto = partyLuck(), manual = luckManual(this.document);
    const luckNow = manual || !auto ? (parseInt(S.luck, 10) || 0) : auto.value;
    context.v.luck = context.v.luck.map((o) => ({ ...o, sel: o.v === luckNow }));
    context.luckInfo = {
      auto: !!auto && !manual, manual: !!auto && manual,
      tip: auto ? (manual ? `Вибрано вручну. З персонажів: ${auto.line}` : `З УДЧ персонажів гравців: ${auto.line}`) : "Персонажів гравцям не призначено: виберіть Удачу партії зі списку",
    };
    context.tab = this.ui.tab;
    context.quickFold = !!this.ui.quickFold;
    context.ui = { sheetBarOpen: !!this.ui.sheetBarOpen };
    context.editable = this.isEditable;
    context.qsLock = isQuickstartActor(this.document) ? qsLockTip(this.document) : ""; // «Швидкий старт»: no random / clear (quickstart-lock.mjs)
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
    // «Компактний» (author, 2026-11-18; mockup Б1): opens full until the user switches, then remembered per caravan
    if (this.ui.compact === undefined) this.ui.compact = compactStored(this.document);
    context.compact = !!this.ui.compact;
    // «Дефібрилятор»'s «Застосувати» in both views (playtest 2026-11-18, item 13: the full sheet had none)
    const used = defibUsed(this.document);
    context.defib = { used };
    if (context.compact) {
      const v = context.v;
      // karma's colour (playtest 2026-11-18, item 11): −5 and lower red, −4…+4 yellow, +5 and higher green
      const karma = parseInt(S.karma, 10) || 0;
      const karmaTone = karma <= -5 ? "bad" : karma >= 5 ? "good" : "mid";
      context.ccmp = {
        // the portrait: the sheet's context has no `actor` (the compact head showed an empty picture; item 11)
        img: this.document.img,
        karmaTone,
        karmaTip: karmaTone === "bad" ? "Карма −5 і нижче" : karmaTone === "good" ? "Карма +5 і вище" : "Карма від −4 до +4",
        luck: v.luck.find((o) => o.sel)?.n ?? "0",
        karmaAspect: S.karmaAspect || "",
        // the row just added or the one clicked opens as a small form; an old row with no name stays a chip «без назви»
        cargo: v.cargo.map((r) => ({ ...r, edit: this.isEditable && this.ui.cgEdit === r.i })),
      };
      // «Покращення» over «Вантаж» (author, 2026-11-18; playtest item 11, mockup А): the ones with an action as cards like the
      // perks (name, limit, one sentence after the wiki's «Покращення каравану»), the rest as quiet chips at the block's foot
      const share = context.brahmins.pathfinder ? "наполовину" : "на чверть";
      const ACT = {
        turret: { short: "Важка зброя (2d6 шкоди в бою на відстані), з якої може стріляти будь-який персонаж." },
        defib: { lim: "раз за сцену", cls: "scene", short: "Ціною одиниці Припасів повертає позначеного ціллю (T) персонажа з 0 ОЗ у сцену з 1 ОЗ." },
        brahmins: { lim: "перед подорожжю", cls: "free", short: `Шлях займає ${share} менше часу або караван витрачає ${share} менше запасу ходу.` },
        chest: { short: "" },
      };
      const taken = v.imps.filter((i) => i.taken).map((i) => {
        const n = i.btns.filter((b) => b.on).length;
        return { ...i, level: i.btns.length > 1 ? String(n) : "", defib: i.id === "defib" ? { used } : null };
      });
      context.ccmp.impCards = taken.filter((i) => ACT[i.id]).map((i) => {
        const a = ACT[i.id];
        const short = i.id === "chest" ? `Місце для зберігання ${i.supPips?.length || 3 * (Number(i.level) || 1)} одиниць Припасів.` : a.short;
        return { ...i, lim: a.lim || "", cls: a.cls || "free", short };
      });
      context.ccmp.impQuiet = taken.filter((i) => !ACT[i.id]);
    }
    // «Примітки» as text with a pencil, as the character's «Записи» (author, 2026-11-22; 4.3): the editor opens on the pencil,
    // «Готово» saves and closes it; whoever may not edit the caravan sees the text only
    if (this.ui.tab === "story") {
      const raw = String(this.document.system?.notes ?? "");
      const editing = this.isEditable && this.#noteOpen;
      const html = editing || !raw.trim() ? "" : await foundry.applications.ux.TextEditor.implementation.enrichHTML(textToHtml(raw), { secrets: this.document.isOwner, relativeTo: this.document });
      context.note = { raw: editing ? textToHtml(raw) : raw, editing, html, empty: !raw.replace(/<[^>]*>/g, "").trim() && !/<(img|table|iframe|video|audio|hr)/i.test(raw) };
    }
    return context;
  }

  /** «Примітки»' editor is open (4.3); closed by default */
  #noteOpen = false;

  /** The pencil / «Готово» of «Примітки»: opens the editor, or saves it and shows the text again */
  static async #onNoteEdit() {
    if (!this.isEditable) return;
    if (this.#noteOpen) {
      const el = this.element?.querySelector('prose-mirror[data-note="notes"]');
      if (el) await this.#saveNote(el);
    }
    this.#noteOpen = !this.#noteOpen;
    this.render();
  }

  /** @override — remember the scroll, so a re-render keeps it (refit.mjs) */
  async _preRender(context, options) {
    await super._preRender(context, options);
    rememberScroll(this);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#compactControl(); // «Повний / Компактний» in the window's header too
    // «?» (author, 2026-11-17): the tour page of the tab now open
    addHelpButton(this, () => (game.user.isGM ? ["gm-caravan", this.ui.tab || "head"] : ["pl-caravan", this.ui.tab || "head"]));
    if (!this.document.pustTourDemo) hotbarDraggable(this.element.querySelector(".pust-luck-roll"), { kind: "luck", actor: this.document.uuid, label: "Удача партії" });
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
        notify.warn(`Не вдалося розібрати кістки: ${t.dice}`);
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
      if (t.dataset.k === "luck" && partyLuck()) this.document.setFlag(game.system.id, "luckManual", true);
      const karma = t.dataset.k === "karma" || t.dataset.k === "karmaAspect" ? {} : null;
      // a field whose value the rules changed back to what was stored («1e9» ОЗ at the maximum) gets no update, so no
      // redraw: the field would keep showing the typed text (stress test, 2026-11-17) — draw it again then
      return runCaravanAction(this.document, this.#karmaWatch(karma, (C) => C.setField(t.dataset.k, t.type === "checkbox" ? t.checked : t.value)))
        .then(async (r) => {
          if (karma) await this.#postKarma(karma);
          if (t.isConnected && t.type !== "checkbox" && this.rendered) this.render();
          return r;
        });
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
    if (QS_LOCKED_ACTS.has(act) && isQuickstartActor(this.document)) return void notify.warn(qsLockTip(this.document));
    if (confirm && !target.classList.contains("armed")) {
      target.classList.add("armed");
      notify.info("Натисніть ще раз, щоб підтвердити.");
      setTimeout(() => target.classList.remove("armed"), CONFIRM_MS);
      return;
    }
    // «Удача партії» rolls «Кістка Долі» to chat (author, 2026-11-14), instead of the HTML sheet's toast
    if (act === "rollFate") {
      const luck = caravanLuck(this.document); // from the characters unless picked by hand (party-luck.mjs)
      const roll = await new Roll("1d10").evaluate();
      return postFateCard(this.document, { v: roll.total, mod: luck, party: true, roll });
    }
    // the compact sheet: a new cargo row stays open as a small form till «Готово» (author, 2026-11-18)
    // a row removed: the open form follows its own row (or closes with it)
    if (act === "cg-del" && this.ui.cgEdit != null) {
      const di = Number(data.i);
      this.ui.cgEdit = di === this.ui.cgEdit ? null : di < this.ui.cgEdit ? this.ui.cgEdit - 1 : this.ui.cgEdit;
    }
    if (act === "addCargo") this.ui.cgEdit = (this.document.system.engine?.raw?.cargo ?? caravanToState(this.document.toObject()).cargo ?? []).length;
    // an improvement past the two starting ones (author, 2026-11-21; A13): «Списати 25(к) з бюджету?»
    if (act === "imp" || act === "addCustomImp") {
      const S = readCaravan(this.document);
      const { L } = caravanLogicFor(S, { quiet: true });
      const cost = impCost(S, L.derived().impCount, act === "imp" ? data.id : null, data.k);
      if (cost > 0) {
        const r = await askSpend({ title: "Покращення каравану", what: data.name ? `«${data.name}»` : "", cost, have: parseInt(S.budget, 10) || 0 });
        if (!r) return;
        data.pay = r === "pay" ? "1" : "0";
      }
    }
    const prev = UNDOABLE.has(act) ? caravanToState(this.document.toObject()) : null;
    const karma = KARMA_QUIET.has(act) ? null : {};
    // any other action ends the offer: undoing would also throw away what was done after
    if (!prev) this.dropUndo();
    await runCaravanAction(this.document, this.#karmaWatch(karma, (C) => C.act(act, data)));
    if (karma) await this.#postKarma(karma);
    if (prev) this.setUndo(prev);
  }

  /** The karma and its aspect before and after a change, read inside the actor's queue (A14: every change by hand writes a
   *  card; quick «+ +» no longer read a «before» the previous press hasn't written yet — the reviewer, 2026-11-21) */
  #karmaWatch(box, fn) {
    if (!box) return fn;
    const snap = (s) => ({ n: parseInt(s.karma, 10) || 0, asp: s.karmaAspect || "" });
    return async (C, L) => {
      box.before = snap(L.getS());
      const r = await fn(C, L);
      box.after = snap(L.getS());
      return r;
    };
  }

  async #postKarma({ before, after }) {
    if (before && after && after.n !== before.n) await postKarmaChange(this.document, before.n, after.n, before.asp, after.asp);
  }

  /** «Купити за N(к)» on a cargo row (A3): «Списати N(к) з бюджету?» — pay, take it for free, or nothing */
  static async #onCargoBuy(event, target) {
    const S = readCaravan(this.document);
    const r = S.cargo?.[Number(target.dataset.i)];
    if (!r?.unpaid) return;
    const q = parseInt(r.qty, 10) || 1;
    const ans = await askSpend({ title: "Купити вантаж", what: `«${r.name || "без назви"}»${q > 1 ? ` ×${q}` : ""}`, cost: rowCost(r), have: parseInt(S.budget, 10) || 0, unit: Math.max(0, parseInt(r.price, 10) || 0), qty: q });
    if (!ans) return;
    this.dropUndo();
    await runCaravanAction(this.document, (C) => C.act("cg-buy", { i: target.dataset.i, pay: ans === "pay" ? "1" : "0" }));
  }

  /** «Продати за N(к)» / «Плата за проїзд N(к)» on a row, «Продати все» on the list (A3): caps to the budget, rows away,
   *  a card in chat; «Скасувати» for a while puts the rows and the budget back and takes the card away */
  static async #onCargoSell(event, target) {
    if (target.disabled) return; // one sale a button (a double click; the sheet draws a new one)
    target.disabled = true;
    const prev = caravanToState(this.document.toObject());
    this.dropUndo();
    this.ui.cgEdit = null;
    const plan = await runCaravanAction(this.document, (C) => C.act("cg-sell", target.dataset.all ? { all: "1" } : { i: target.dataset.i, key: target.dataset.key }));
    if (!plan) return;
    const msg = await postSaleCard(this.document, plan);
    this.setUndo(prev, msg);
  }

  /** «↺» by Удача партії: back to the value from the characters */
  static #onLuckAuto() {
    return this.document.unsetFlag(game.system.id, "luckManual");
  }

  /** Hide «Скасувати» */
  dropUndo() {
    if (!this.undoState) return;
    this.undoState = null;
    this.undoMsg = null;
    clearTimeout(this.#undoTimer);
  }

  /** Offer «Скасувати» for a while */
  setUndo(prev, msg = null) {
    this.undoState = prev;
    this.undoMsg = msg;
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
    // a sale undone: its card goes too (A3)
    if (this.undoMsg?.isOwner) await this.undoMsg.delete().catch(() => {});
    this.undoMsg = null;
    notify.info("Скасовано.");
  }

  /** The header's switch, as the character sheet's: the icon says where a click goes */
  #compactControl() {
    const header = this.window?.header;
    if (!header) return;
    let b = header.querySelector(".pust-cmp-hd");
    if (!b) {
      b = document.createElement("button");
      b.type = "button";
      b.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      b.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); b.blur(); WastelandersCaravanSheetV2.#onCompactToggle.call(this, ev, { dataset: {} }); });
      const close = header.querySelector('[data-action="close"]');
      if (close) close.before(b); else header.append(b);
    }
    const c = !!this.ui.compact;
    b.className = `header-control icon fa-solid ${c ? "fa-up-right-and-down-left-from-center" : "fa-down-left-and-up-right-to-center"} pust-cmp-hd`;
    b.dataset.tooltip = c ? "Повний аркуш" : "Компактний аркуш";
    b.setAttribute("aria-label", b.dataset.tooltip);
  }

  /** «Повний / Компактний»: the window narrows and back to the size it had */
  static async #onCompactToggle(event, target) {
    const on = target.dataset.v === "1" ? true : target.dataset.v === "0" ? false : !this.ui.compact;
    if (on === !!this.ui.compact) return;
    this.ui.compact = on;
    compactStore(this.document, on);
    if (on) this.#fullSize = { width: this.position.width, height: this.position.height };
    await this.render();
    this.setPosition(on ? { width: COMPACT_W, height: Math.min(this.position.height, 760) } : (this.#fullSize ?? { width: 820, height: 900 }));
  }
  #fullSize = null;

  /** Opened compact (remembered for this caravan): at the compact width from the start */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    if (this.ui.compact) { this.#fullSize = { width: 820, height: 900 }; this.setPosition({ width: COMPACT_W, height: Math.min(this.position.height, 760) }); }
  }

  /** A cargo chip clicked: its row as a small form (data-i -1: done) */
  static #onCargoEdit(event, target) {
    const i = Number(target.dataset.i);
    this.ui.cgEdit = i >= 0 ? i : null;
    this.render();
  }

  /** «Дефібрилятор»: «Застосувати» (card and scene mark) or the mark off with one click (caravan-defib.mjs) */
  static async #onDefib(event, target) {
    if (target.dataset.v === "1") await useDefib(this.document);
    else await freeDefib(this.document);
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
    if (isQuickstartActor(this.document)) return void notify.warn(qsLockTip(this.document)); // quickstart-lock.mjs
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
