/**
 * Електронний аркуш персонажа in Foundry: the HTML electronic sheet's features, rebuilt natively.
 * The sheet reads the character through the rules engine (evaluate), shows buildView(), and sends
 * every field change and button to the HTML sheet's handlers (controller) via runAction().
 */
import { hotbarDraggable } from "../helpers/macros.mjs";
import { addHelpButton } from "../tours/help-button.mjs";
import { QS_LOCKED_ACTS, isQuickstartActor, qsLockTip } from "../helpers/quickstart-lock.mjs";
import { textToHtml } from "../rules/rich-text.mjs";
import { keepNoteSizes, refitOnResize, rememberScroll, watchNotes } from "./refit.mjs";
import { createController } from "../rules/controller.mjs";
import { FEAT, PERK, SPECIES, blankState } from "../rules/core.mjs";
import { recipeToDef, recipeTotals, speciesToX } from "../rules/designer.mjs";
import { evaluate, readState, runAction } from "../applications/character-actions.mjs";
import { exportCharacter, replaceCharacter, replaceCharacterFromFile } from "../applications/character-json.mjs";
import { buildView } from "./character-view.mjs";
import { useOnTarget } from "../applications/chem-target.mjs";
import { applyPerkUse } from "../applications/perk-card.mjs";
import { perkSection } from "../rules/perk-uses.mjs";
import { openCheckPanel, rollWeaponDamage } from "../applications/check-panel.mjs";
import { EXTRA_TYPES, catalogEnergy, weaponDmgType } from "../rules/damage-types.mjs";
import { fateNow, fateSnap, postFateChange, postFateIfChanged, postSupIfChanged, supSnap } from "../applications/fate-card.mjs";
import { notify } from "../helpers/notify.mjs";
import { cardText, channelOf } from "../rules/sheet-channels.mjs";
import { postSheetCard } from "../applications/sheet-cards.mjs";
import { stateArmor } from "../rules/states.mjs";
import { statesOf } from "../applications/apply-damage.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Buttons whose result is hard to undo ask twice (like the HTML sheet's «Натисни ще раз») */
const CONFIRM_MS = 3000;

/** The compact sheet (author, 2026-11-17): its width, and the choice remembered per user and character in this browser */
const COMPACT_W = 460;
const compactKey = (actor) => `pustelnyky-compact-${game.user.id}-${actor.id}`;
function compactStored(actor) { try { return localStorage.getItem(compactKey(actor)) === "1"; } catch (_) { return false; } }
function compactStore(actor, on) { try { if (on) localStorage.setItem(compactKey(actor), "1"); else localStorage.removeItem(compactKey(actor)); } catch (_) { /* not kept */ } }

/**
 * The compact sheet (author, 2026-11-17; «Зброя» apart since 2026-11-20, Fable's analysis U2): the weapons with their damage,
 * for the attack and damage buttons; the chips of the armour and of «Інший мотлох» but the chems — the name, the armour, the
 * quantity; price and × only in the full sheet
 */
function compactWeapons(v) {
  return (v.weapons ?? []).map((x) => ({ i: x.i, n: x.n || "без назви", nm: x.n || "", kind: x.kind, stat: String(x.dEff || x.d || "").trim(), statCls: `pust-dtin dt-${x.dt}` }));
}
function compactGear(v) {
  const a = (v.armorList ?? []).map((x) => ({ l: "armor", i: x.i, n: x.n || "без назви", kind: x.kind, stat: String(x.v ?? "").trim() ? `броня ${x.v}` : "", statCls: "arm" }));
  const o = (v.other ?? []).filter((x) => !x.hasActs && !x.atk).map((x) => ({ l: "other", i: x.i, n: x.n || "без назви", kind: x.kind, q: String(x.q ?? "").trim() && String(x.q).trim() !== "1" ? x.q : "" }));
  return [...a, ...o];
}

/** How long the line under a block stays (U7) */
const NOTE_MS = 6000;
/** Actions that make the character anew: their Fate count is no token spent or gained */
const FATE_QUIET = new Set(["new", "random", "preset", "apply-arch", "species-x", "roll-species", "roll-perks", "roll-feats", "roll-gear"]);

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
      addPick: WastelandersCharacterSheetV2.#onAddPick,
      drugAdd: WastelandersCharacterSheetV2.#onDrugAdd,
      compactToggle: WastelandersCharacterSheetV2.#onCompactToggle,
      noteEdit: WastelandersCharacterSheetV2.#onNoteEdit,
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
    // the world's custom species and designer drugs (author, 2026-11-15): the view stays pure, the sheet hands them over
    const world = {
      worldSpecies: game.items.filter((i) => i.type === "species" && i.system.custom && speciesToX({ ...i.system.custom, n: i.name }))
        .map((i) => ({ id: i.id, n: i.name, base: i.system.custom.base })).sort((a, b) => a.n.localeCompare(b.n, "uk")),
      worldDrugs: game.items.filter((i) => i.type === "drug" && i.system.recipe)
        .map((i) => ({ id: i.id, n: i.name, recipe: i.system.recipe, desc: recipeToDef(i.system.recipe).d })).sort((a, b) => a.n.localeCompare(b.n, "uk")),
    };
    context.v = buildView(st, d, L, { ...this.ui, ...world });
    // a state's armour (the acid's «−2 до фізичної броні» till the end of the scene; author, 2026-11-20): the number the hits meet
    const sa = stateArmor(statesOf(this.document));
    if (sa) { context.v.armor = Math.max(0, context.v.armor + sa); context.v.armorState = `Стан «−2 до фізичної броні»: до кінця сцени броня менша на ${-sa}.`; }
    context.actor = this.document;
    context.tab = this.ui.tab;
    // perks with «Застосувати» (author, 2026-11-18; perk-uses.mjs): the compact sheet's section, and each perk's / feat's card
    // of the full sheet with its uses; a free perk (from a feat, no slot) has its own card with its uses, unless the same perk
    // is also chosen (its card has the button already: one mark, one button)
    const pk = perkSection(st, d, context.v.chips);
    for (const p of context.v.perks ?? []) p.uses = pk.uses.filter((u) => !u.feat && u.perk === p.n);
    for (const f of context.v.feats ?? []) f.uses = pk.uses.filter((u) => u.feat && u.perk === f.n);
    for (const p of context.v.freePerkRows ?? []) p.uses = st.perks.some((x) => x.n === p.n) ? [] : pk.uses.filter((u) => !u.feat && u.perk === p.n);
    context.freeUses = pk.uses.filter((u) => !u.feat && !st.perks.some((p) => p.n === u.perk) && !(context.v.freePerkRows ?? []).some((p) => p.n === u.perk));
    // «Компактний» (author, 2026-11-17; feedback p19): opens full until the user switches, then remembered per character
    if (this.ui.compact === undefined) this.ui.compact = compactStored(this.document);
    context.compact = !!this.ui.compact;
    if (context.compact) {
      // «Статуси» of the compact sheet keep only states (heavy things, chems, consequences, addictions…): what perks and
      // feats give is in their rows in «Перки та особливості» (author, 2026-11-18; playtest item 8, mockup В)
      const own = (c) => !c.src;
      context.v = { ...context.v, chips: context.v.chips.filter(own), chipsGood: context.v.chipsGood.filter(own), chipsBad: context.v.chipsBad.filter(own) };
      const v = context.v;
      context.cmp = {
        arch: v.arch || "",
        species: [...(v.species ?? []), ...(v.speciesX ?? [])].find((o) => o.sel)?.n ?? "",
        aspects: (v.aspects ?? []).filter((a) => String(a.v).trim()),
        chems: (v.other ?? []).filter((o) => o.hasActs).map((o) => ({ ...o, more: !!o.treat })),
        weapons: compactWeapons(v),
        // the grenades and explosives the attack can throw: in «Зброя» with «Атака» (author, 2026-11-20), not among the chips
        grenades: (v.other ?? []).filter((x) => x.atk && !x.hasActs).map((x) => ({ i: x.i, n: x.n || "без назви", nm: x.n || "", d: x.atkD, q: String(x.q ?? "").trim() && String(x.q).trim() !== "1" ? x.q : "" })),
        gear: compactGear(v),
        perks: pk,
        catSecName: (v.catSecs ?? []).find((o) => o.sel)?.n ?? "", catSecAll: !!(v.catSecs ?? [])[0]?.sel,
        catSortName: (v.catSorts ?? []).find((o) => o.sel)?.n ?? "",
      };
    }
    context.quickFold = !context.compact && !!this.ui.quickFold; // the compact sheet has no fold for «Швидкий доступ»
    // «Статуси й відпочинок» and «Сповіщення й попередження» folded by default in the full sheet, to their headers with the
    // counters: the tabs come into the first screen (author, 2026-11-20; Fable's analysis U1, variant Б); the compact sheet
    // keeps its statuses open
    context.statusFold = this.ui.statusFold ?? !context.compact;
    context.issuesFold = this.ui.issuesFold ?? true;
    context.ui = { ovOpen: !!this.ui.ovOpen, defOpen: !!this.ui.defOpen, xpHelpOpen: !!this.ui.xpHelpOpen, sheetBarOpen: !!this.ui.sheetBarOpen }; // folded blocks in «Налаштування» (closed by default)
    context.restUi = this.ui.rest;
    // «Записи» (U8, author 2026-11-21, mockup А): the text as text, the editor behind the pencil in the block's heading;
    // whoever may not edit the character sees only the text
    if (this.ui.tab === "notes") {
      const TE = foundry.applications.ux.TextEditor.implementation;
      const owner = this.document.isOwner;
      context.notes = [];
      for (const [k, title] of [["bio", "Біографія"], ["others", "Інші"]]) {
        const raw = String(context.v?.[k] ?? "");
        const editing = this.isEditable && this.#noteEdit.has(k);
        const html = editing || !raw.trim() ? "" : await TE.enrichHTML(textToHtml(raw), { secrets: owner, relativeTo: this.document });
        context.notes.push({ k, title, raw, editing, html, empty: !raw.replace(/<[^>]*>/g, "").trim() && !/<(img|table|iframe|video|audio|hr)/i.test(raw) });
      }
    }
    context.customKind = this.customKind;
    context.editable = this.isEditable;
    context.qsLock = isQuickstartActor(this.document) ? qsLockTip(this.document) : ""; // «Швидкий старт» actors: no random / clear (quickstart-lock.mjs)
    return context;
  }

  /**
   * Run one of the HTML sheet's handlers on this character and save. Its messages go where the action says (U7, author
   * 2026-11-21; module/rules/sheet-channels.mjs): a refusal pops up, a change in play becomes a chat card, the rest a line
   * under the pressed block. `ctx.act` / `ctx.data`: the action; `fn` gets a 4th argument to add a message of its own.
   */
  async #run(fn, ctx = {}) {
    const msgs = [];
    const toast = (msg, kind) => { if (!msg) return; if (kind === "bad") notify.warn(msg); else msgs.push(String(msg)); };
    this.#clearNote();
    let chem = null;
    const out = await runAction(this.document, async (st, L) => {
      const r = await fn(createController(st, L, { toast }), st, L, (m) => toast(m));
      chem = foundry.utils.deepClone(st.chem ?? {});
      return r;
    }, { ui: this.ui.rest, toast });
    await this.#say(msgs, chem, ctx);
    return out;
  }

  /** The messages of an action, by its channel */
  async #say(msgs, chem, { act = "", data = {} } = {}) {
    if (!msgs.length) return;
    const c = channelOf(act, data);
    if (c.ch === "none") return;
    if (c.ch === "card") return void (await postSheetCard(this.document, cardText(c.act, msgs, chem ?? {})));
    this.#note = { ...(this.#anchor ?? {}), tab: this.ui.tab, text: msgs.join(" "), until: Date.now() + NOTE_MS, fresh: true };
    if (this.element) this.#showNote(this.element);
  }

  /** The block last pressed in (its heading's text and its place among the blocks), to find it again after a re-render */
  #anchor = null;
  /** The line under a block (U7): { head, idx, text, until, fresh } */
  #note = null;
  #noteTimer = null;

  #anchorOf(el) {
    const block = el?.closest?.(".pust-block, .pust-quickbar");
    if (!block || !this.element?.contains(block)) return null;
    const head = block.querySelector(":scope > h3, :scope > h4")?.textContent?.replace(/\s+/g, " ").trim() || "";
    return { head, idx: [...this.element.querySelectorAll(".pust-block, .pust-quickbar")].indexOf(block) };
  }

  #clearNote() {
    this.#note = null;
    clearTimeout(this.#noteTimer);
    this.element?.querySelectorAll(".pust-inl-note").forEach((p) => p.remove());
  }

  /** Put the line under its block (again after a render); a block that is gone gives the first block of the tab */
  #showNote(root) {
    const n = this.#note;
    root.querySelectorAll(".pust-inl-note").forEach((p) => p.remove());
    if (!n || Date.now() >= n.until || n.tab !== this.ui.tab) return void (this.#note = null); // another tab: gone
    const blocks = [...root.querySelectorAll(".pust-block, .pust-quickbar")];
    const headOf = (b) => b.querySelector(":scope > h3, :scope > h4")?.textContent?.replace(/\s+/g, " ").trim() || "";
    const block = (n.head && blocks.find((b, i) => i === n.idx && headOf(b) === n.head)) || (n.head && blocks.find((b) => headOf(b) === n.head))
      || (!n.head && blocks[n.idx]) || root.querySelector(".pust-body .pust-block") || blocks[0];
    if (!block) return;
    const p = document.createElement("p");
    p.className = "pust-inl-note";
    p.setAttribute("role", "status");
    p.setAttribute("aria-live", "polite");
    p.innerHTML = `<i class="fa-solid fa-check"></i> `;
    p.append(document.createTextNode(n.text));
    block.append(p);
    if (n.fresh) {
      n.fresh = false;
      block.classList.remove("pust-flash");
      void block.offsetWidth;
      block.classList.add("pust-flash");
      setTimeout(() => block.classList.remove("pust-flash"), 1800);
    }
    clearTimeout(this.#noteTimer);
    this.#noteTimer = setTimeout(() => { if (this.#note === n) this.#clearNote(); }, Math.max(0, n.until - Date.now()));
  }

  /** @override */
  /** @override — remember the scroll, so a re-render keeps it (refit.mjs) */
  async _preRender(context, options) {
    await super._preRender(context, options);
    rememberScroll(this);
    if (this.#tabTop) {
      this.#tabTop = false;
      const wc = this.element?.querySelector?.(".window-content"), nav = wc?.querySelector("nav.pust-tabs");
      if (nav && this._pustScroll != null) {
        // the bar's own place in the content, measured unstuck
        nav.style.position = "static";
        const at = nav.getBoundingClientRect().top - wc.getBoundingClientRect().top + wc.scrollTop;
        nav.style.position = "";
        this._pustScroll = Math.min(this._pustScroll, Math.max(0, Math.floor(at)));
      }
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // «Повний / Компактний» in the window's header too (author, 2026-11-17)
    this.#compactControl();
    // the compact chips show only their icons: the names go to the tooltips
    // the compact chips (author, 2026-11-17): short names (ОЗ, Броня, ЖД, Припаси, (к), ОД), the full one in the tooltip;
    // the caps' field takes a smaller font past two digits
    this.#compactSticky();
    if (this.ui.compact) {
      const SHORT = { "fa-heart-pulse": "ОЗ", "fa-shield-halved": "Броня", "fa-clover": "ЖД", "fa-backpack": "Припаси", "fa-coins": "(к)", "fa-medal": "ОД" };
      this.element.querySelectorAll(".pust-qgrid .pust-qi > span:first-child").forEach((s) => {
        if (!s.title) s.title = s.textContent.trim();
        const k = Object.keys(SHORT).find((c) => s.querySelector(`i.${c}`));
        if (k) { s.dataset.short = SHORT[k]; s.closest(".pust-qi").dataset.q = k.replace("fa-", ""); }
      });
      const fitDigits = (inp) => inp.classList.toggle("pust-long", String(inp.value).trim().length > 2);
      this.element.querySelectorAll('.pust-qgrid input[data-k]').forEach((inp) => { fitDigits(inp); inp.addEventListener("input", () => fitDigits(inp)); });
    }
    // «?» (author, 2026-11-17): the tour page of the tab now open
    addHelpButton(this, () => (game.user.isGM ? ["gm-char", this.ui.tab || "build"] : ["pl-sheet", this.ui.tab || "build"]));
    // to the hotbar (helpers/macros.mjs; author, 2026-11-17): attributes, skills, a weapon's attack and its damage
    if (!this.document.pustTourDemo) {
      const uuid = this.document.uuid;
      const name = (el) => el.closest(".pust-gcard")?.querySelector("input.pust-gname")?.value?.trim() || el.dataset.name?.trim() || "";
      this.element.querySelectorAll('[data-action="checkPanel"][data-attr]').forEach((el) =>
        hotbarDraggable(el, { kind: "attr", actor: uuid, attr: el.dataset.attr, label: el.querySelector(".pust-attr-full")?.textContent.trim() || el.dataset.attr }));
      this.element.querySelectorAll('[data-action="checkPanel"][data-skill]').forEach((el) =>
        hotbarDraggable(el, { kind: "skill", actor: uuid, skill: el.dataset.skill, label: el.dataset.skill }));
      this.element.querySelectorAll('[data-action="checkPanel"][data-weapon]').forEach((el) =>
        hotbarDraggable(el, () => (name(el) ? { kind: "attack", actor: uuid, label: name(el) } : null)));
      this.element.querySelectorAll('[data-action="weaponDamage"][data-weapon]').forEach((el) =>
        hotbarDraggable(el, () => (name(el) ? { kind: "damage", actor: uuid, label: name(el) } : null)));
      // a grenade's / explosive's «Атака» (author, 2026-11-20)
      this.element.querySelectorAll('[data-action="checkPanel"][data-other]').forEach((el) =>
        hotbarDraggable(el, () => (name(el) ? { kind: "throw", actor: uuid, label: name(el) } : null)));
    }
    const root = this.element;
    const fits = []; // every wrapping field's fit, run again when the window's width changes (refitOnResize)
    // aspects wrap: the field grows with its text; Enter doesn't add a line break (the value stays one line)
    root.querySelectorAll(".pust-asp-ta").forEach((ta) => {
      const fit = () => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight + 2}px`; };
      fit();
      fits.push(fit);
      ta.addEventListener("input", () => {
        if (/\n/.test(ta.value)) ta.value = ta.value.replace(/\n/g, " ");
        fit();
      });
      ta.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ta.blur(); } });
    });
    // Enter in «Новий аспект…» adds it, as «+» (stress test, 2026-11-17; the enemy's and the zone's fields did already)
    root.querySelector('input[data-ui="sitNew"]')?.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || ev.isComposing) return;
      ev.preventDefault();
      this.ui.sitNew = ev.currentTarget.value;
      WastelandersCharacterSheetV2.#onSitAdd.call(this);
    });
    // «Видові властивості» folds; the sheet remembers it while open (closed again for a new window)
    root.querySelector(".pust-props")?.addEventListener("toggle", (ev) => { this.ui.propsOpen = ev.currentTarget.open; });
    root.querySelectorAll("details[data-fold]").forEach((el) => el.addEventListener("toggle", () => { this.ui[el.dataset.fold] = el.open; }));
    this.#showGoTo(root);
    this.#showNote(root); // U7: the line under the pressed block survives the re-render its own action caused
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
    dmgFields.forEach((el) => fits.push(() => fitDmg(el)));
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
      const fit = (resized = false) => {
        if (row && resized) row.classList.remove("wide"); // a wider window may fit the note on its row again
        if (row && !row.classList.contains("wide")) {
          ta.style.height = "";
          if (ta.scrollHeight > ta.clientHeight + 2) row.classList.add("wide");
        }
        grow();
      };
      requestAnimationFrame(() => fit());
      fits.push(fit);
      ta.addEventListener("input", () => {
        if (/\n/.test(ta.value)) ta.value = ta.value.replace(/\n/g, " ");
        fit();
      });
      ta.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); ta.blur(); } });
    });
    refitOnResize(this, fits);
    // «Біографія» / «Інші» in Foundry's editor (author, 2026-11-15): saved as you write (refit.mjs watchNotes) and before the sheet closes (_preClose)
    keepNoteSizes(this, root);
    watchNotes(this, root, (el) => this.#saveNote(el), this.isEditable);
    if (!this.isEditable) {
      root.querySelectorAll("input, select, textarea, button[data-action='act'], button[data-action='drugAdd']").forEach((el) => (el.disabled = true));
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

  /** The notes («Біографія» / «Інші») whose editor is open (U8); none by default */
  #noteEdit = new Set();

  /** The pencil / «Готово» of a note: opens its editor, or saves it and shows the text again */
  static async #onNoteEdit(event, target) {
    const k = target.dataset.note;
    if (!k || !this.isEditable) return;
    if (this.#noteEdit.has(k)) {
      const el = this.element?.querySelector(`prose-mirror[data-note="${k}"]`);
      if (el) await this.#saveNote(el);
      this.#noteEdit.delete(k);
    } else this.#noteEdit.add(k);
    this.render();
  }

  /** Save a note editor's text when it changed: straight into the actor, no re-render (the editor keeps its state);
   *  the .json gets plain text */
  #saveNote(el) {
    const path = { bio: "system.description", others: "system.others" }[el.dataset.note];
    if (!path || !el.isConnected || !this.isEditable) return undefined;
    const v = String(el.value ?? "");
    if (v === textToHtml(foundry.utils.getProperty(this.document, path))) return undefined;
    return this.document.update({ [path]: v }, { render: false });
  }

  /** @override — an unsaved note is kept when the sheet closes */
  async _preClose(options) {
    for (const el of this.element?.querySelectorAll?.("prose-mirror[data-note]") ?? []) await this.#saveNote(el);
    return super._preClose(options);
  }
  /** A canvas context for measuring text (the damage field fit) */
  static #measure = null;
  #searchTimer = null;

  async #onField(event) {
    const t = event.currentTarget;
    const k = t.dataset.k;
    let v = t.type === "checkbox" || t.type === "radio" ? t.checked : t.value;
    // a custom species of the world («Власні види», value «x:<id>»): the character takes a copy of its definition
    if (k === "species" && String(v).startsWith("x:")) {
      if (v === "x:cur") return undefined; // the character's own copy is already chosen
      return this.#takeSpecies(game.items.get(String(v).slice(2)));
    }
    const num = !!t.dataset.num;
    if (k === "fdCur") { // a typed count of Fate tokens posts a chat card too (author, 2026-11-15)
      const was = fateNow(this.document);
      const out = await this.#run((C) => C.setField(k, v, { num }));
      await postFateChange(this.document, was, fateNow(this.document));
      return out;
    }
    return this.#run((C) => C.setField(k, v, { num }));
  }

  /** A custom species item → the character's species (st.speciesX); true when taken */
  async #takeSpecies(item) {
    const x = item?.type === "species" && item.system.custom ? speciesToX({ ...item.system.custom, n: item.name }) : null;
    if (!x) {
      notify.warn("Цей вид не вдалося прочитати: у нього немає назви чи основи.");
      this.render();
      return false;
    }
    return this.#run((C) => C.act("species-x", { x }));
  }

  /** A designer drug item → the character's own drug (st.customDrugs) and one dose in «Інший мотлох»; false when refused */
  /** @param {number} [pay]  «Купити за N(к)» (A13, author 2026-11-21): the recipe's price off the caps */
  async #takeDrug(item, pay = 0) {
    const recipe = item?.type === "drug" ? item.system.recipe : null;
    if (!recipe) return false;
    const err = recipeTotals(recipe).errors[0];
    if (err) {
      notify.warn(`«${item.name}»: ${err}`);
      return false;
    }
    return this.#run((C, st, L, say) => {
      const caps = parseInt(st.caps, 10) || 0;
      if (pay > caps) { notify.warn(`Не вистачає кришок: треба ${pay}(к), є ${caps}(к).`); return false; }
      const ok = C.act("drug-add-custom", { n: item.name, def: recipeToDef(recipe) });
      if (ok !== false && pay > 0) { st.caps = caps - pay; say(`Куплено за ${pay}(к): ${item.name}. Кришок лишилося ${st.caps}.`); }
      return ok;
    }, { act: pay > 0 ? "buy" : "drug-add-custom" }); // a purchase is a chat card (U7)
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
        } else if (catalogEnergy(w)) {
          // a catalogue weapon with its own energy type (F9, author 2026-11-20): «Тип» changes only the type, not the weapon —
          // no energy version on top (its price, a cryo weapon's damage one step down), the item's `damageType` kept
          st.weapons[i].dt = v || "phys";
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
    this.#clearNote(); // the line of the last action goes with the next one (U7)
    const { action, act, confirm, ...data } = target.dataset;
    if (QS_LOCKED_ACTS.has(act) && isQuickstartActor(this.document)) return void notify.warn(qsLockTip(this.document));
    if (confirm && !WastelandersCharacterSheetV2.#armed(target)) return;
    if (target.type === "checkbox") event.preventDefault?.();
    // «На ціль» (author, 2026-11-15): the medicine goes to the user's one target (applications/chem-target.mjs)
    if (act === "chem-target") return void (await useOnTarget(this.document, +data.i));
    // «Застосувати» of a perk (author, 2026-11-18): the target check, the mark and the chat card (perk-card.mjs); a change of
    // Fate or Припаси it makes («Проклятий», «Хімік», «Здобувач»…) posts the usual card too (author, 2026-11-18, after the review)
    if (act === "perk-use") {
      const fd0 = fateSnap(this.document), sup0 = supSnap(this.document);
      await applyPerkUse(this.document, data.id);
      await postFateIfChanged(this.document, fd0);
      await postSupIfChanged(this.document, sup0);
      return;
    }
    // a change of the Fate tokens posts a chat card (author, 2026-11-15; fate-card.mjs): the counter's −/+, +1 for
    // dropping to 0 ОЗ, «Кінець сесії»… — not a character made anew
    const fdWas = FATE_QUIET.has(act) ? null : fateSnap(this.document);
    const supWas = FATE_QUIET.has(act) ? null : supSnap(this.document); // Припаси too: lamps, rest, «Поповнити» (author, 2026-11-15)
    const ok = await this.#run((C) => C.act(act, data), { act, data });
    if (fdWas) await postFateIfChanged(this.document, fdWas);
    if (supWas) await postSupIfChanged(this.document, supWas);
    // «Очистити аркуш» also puts back the default picture (portrait and token)
    if (act === "new" && ok !== false) {
      const img = this.document.constructor.getDefaultArtwork({ type: this.document.type }).img;
      await this.document.update({ img, "prototypeToken.texture.src": img });
    }
  }

  /** A tab; a guide link also names the block to show (data-go: a selector; no data-tab — the block is above the tabs) */
  static #onTab(event, target) {
    this.#clearNote();
    const { tab, go } = target.dataset;
    if (tab) this.ui.tab = tab;
    // a tab picked from the stuck bar (U1, author 2026-11-20) opens from its start, not from the old tab's scroll
    if (tab && target.closest("nav.pust-tabs")) this.#tabTop = true;
    if (go) {
      this.#goTo = go;
      if (go.startsWith(".q-")) this.ui.quickFold = false; // «Швидкий доступ» unfolds to show ОЗ / жетони Долі
    }
    this.render();
  }

  /**
   * The compact sheet's «Швидкий доступ» sticks to the window's top (author, 2026-11-20) while it takes at most 60 % of the
   * window's height: a taller block would cover the sheet and its own end could not be scrolled to
   */
  #compactSticky() {
    this._pustStickyRO?.disconnect();
    const wc = this.element.querySelector(".window-content");
    const q = this.element.querySelector(".pust-compact > .pust-quickbar");
    if (!wc || !q) return;
    const fit = () => q.classList.toggle("pust-qsticky", q.offsetHeight <= wc.clientHeight * 0.6);
    fit();
    this._pustStickyRO = new ResizeObserver(fit);
    this._pustStickyRO.observe(wc);
    this._pustStickyRO.observe(q);
  }

  /** A tab was picked from the tab bar: the re-render scrolls back no lower than the bar's place (it stays stuck on top) */
  #tabTop = false;

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

  /** The header's switch: the icon says where a click goes */
  #compactControl() {
    const header = this.window?.header;
    if (!header) return;
    let b = header.querySelector(".pust-cmp-hd");
    if (!b) {
      b = document.createElement("button");
      b.type = "button";
      b.addEventListener("pointerdown", (ev) => ev.stopPropagation());
      b.addEventListener("click", (ev) => { ev.preventDefault(); ev.stopPropagation(); b.blur(); WastelandersCharacterSheetV2.#onCompactToggle.call(this, ev, { dataset: {} }); });
      const close = header.querySelector('[data-action="close"]');
      if (close) close.before(b); else header.append(b);
    }
    const c = !!this.ui.compact;
    b.className = `header-control icon fa-solid ${c ? "fa-up-right-and-down-left-from-center" : "fa-down-left-and-up-right-to-center"} pust-cmp-hd`;
    b.dataset.tooltip = c ? "Повний аркуш" : "Компактний аркуш";
    b.setAttribute("aria-label", b.dataset.tooltip);
  }

  /** «Повний / Компактний»: the window narrows to the table's needs and back to the size it had */
  static async #onCompactToggle(event, target) {
    const on = target.dataset.v === "1" ? true : target.dataset.v === "0" ? false : !this.ui.compact;
    if (on === !!this.ui.compact) return;
    this.ui.compact = on;
    compactStore(this.document, on);
    if (on) this.#fullSize = { width: this.position.width, height: this.position.height };
    await this.render();
    this.setPosition(on ? { width: COMPACT_W, height: Math.min(this.position.height, 760) } : (this.#fullSize ?? { width: 900, height: 920 }));
  }
  #fullSize = null;

  /** Opened compact (remembered for this character): at the compact width from the start */
  _onFirstRender(context, options) {
    super._onFirstRender?.(context, options);
    // the block pressed in, for the line of U7 (the window's element lives through the re-renders)
    const mark = (ev) => { const a = this.#anchorOf(ev.target); if (a) this.#anchor = a; };
    for (const t of ["pointerdown", "keydown", "change"]) this.element.addEventListener(t, mark, true);
    if (this.ui.compact) { this.#fullSize = { width: 900, height: 920 }; this.setPosition({ width: COMPACT_W, height: Math.min(this.position.height, 760) }); }
  }

  static #onUiToggle(event, target) {
    const key = target.dataset.key;
    const def = { statusFold: !this.ui.compact, issuesFold: true }; // folded by default (U1)
    this.ui[key] = !(this.ui[key] ?? def[key] ?? false);
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

  /** «Дизайнерські» in the gear catalogue: a world drug with a recipe */
  static #onDrugAdd(event, target) {
    if (!this.isEditable) return undefined;
    return this.#takeDrug(game.items.get(target.dataset.id), parseInt(target.dataset.pay, 10) || 0);
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
    openCheckPanel(this.document, { ...target.dataset }, { btn: target }); // П1 1.5: «Замінити?» on this button
  }

  /** Two-click confirmation; true on the second click */
  static #armed(target) {
    if (target.classList.contains("armed")) return true;
    target.classList.add("armed");
    notify.info("Натисни ще раз, щоб підтвердити.");
    setTimeout(() => target.classList.remove("armed"), CONFIRM_MS);
    return false;
  }

  static #onJsonOpen() {
    if (isQuickstartActor(this.document)) return void notify.warn(qsLockTip(this.document)); // quickstart-lock.mjs
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
    // a custom species / a designer drug of the world: the character takes a copy of the definition, no embedded item is made
    if (item.type === "species" && item.system.custom) return this.#takeSpecies(item);
    if (item.type === "drug" && item.system.recipe) return this.#takeDrug(item);
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
