/**
 * «Зробити перевірку»: the HTML sheet's check / damage / Кістка Долі panel for one character.
 * The panel's content is drawn by the HTML sheet's own renderer (renderRoller) and every control is
 * handled by its own handlers (rollerClick / rollerChange), so it does exactly what the HTML panel
 * does. Foundry adds the window, saves the character and posts results to chat.
 * The panel's state (R: attribute, skill, type, Посилення…, history) is kept per character.
 */
import { addHelpButton } from "../tours/help-button.mjs";
import { hotbarDraggable } from "../helpers/macros.mjs";
import { ASHORT, compute } from "../rules/core.mjs";
import { evaluate, runAction } from "./character-actions.mjs";
import { isPublicMode, postChat } from "./chat.mjs";
import { fateSnap, postFateIfChanged, postSupIfChanged, supSnap } from "./fate-card.mjs";
import { attackMode, choiceEmpOnly, damageEffects, dieSides, dieTypes, isDamageEffect, partType, splitDiceParts, termTypes, typeChips, weaponDmgType, TYPE_EFFECTS } from "../rules/damage-types.mjs";
import { atkIgnores, atkIgnoreN, applyParts } from "../rules/battle.mjs";
import { clearTargets, sendDamage, sendEffects, sendSplitDamage } from "./apply-damage.mjs";
import { keepTargets, presetKey, presetOfWeapon, routeOf, unfinished } from "../rules/check-route.mjs";
import { clampShare, effectTargetIdle, evenSplit, splitBlock, splitLeft } from "../rules/damage-split.mjs";
import { offer as fxOffer, effectOf, effectText, toggle as fxToggle, keep as fxKeep, hitFx } from "../rules/attack-effects.mjs";
import { activeCover, isCoverText } from "../rules/cover.mjs";
import { pendOf, answerPending, openRowOf } from "./pending-attack.mjs";
import { rowTotal, rowDeal, rowClosed, rowText, ATTR_SHORT } from "../rules/dodge.mjs";
import { checkPenalty, spendCheckStates } from "./states.mjs";
import { nearbyFor, nearbyHtml, spendNearby, consqOffer, consqHtml, consqWrite, medOffer, medHtml, medPress, healGate } from "./battle-health.mjs";
import { checkFlag } from "../rules/gm-move-alert.mjs";
import { notify } from "../helpers/notify.mjs";
import { reconcileAutoXp, xpAutoGiven } from "../rules/session-xp.mjs";
import { dropRollXp, kickOffer, luckOffer } from "../rules/check-perks.mjs";
import { PER, USE_BY_ID, isUsed, usePerk } from "../rules/perk-uses.mjs";
import { perkCardHtml } from "./perk-card.mjs";

/** The world's «ОД за невдачу нараховується само» (A10; on by default) */
const autoXpOn = () => { try { return game.settings.get(game.system.id, "autoXp") !== false; } catch (_) { return true; } };

/** The engine's messages in the panel (U7, author 2026-11-21): a refusal pops up; the rest is already said by the panel itself
 *  («Додано в аркуш: 1 ОД»), the Fate card or the damage card, so it is dropped */
const PANEL_TOAST = (msg, kind) => { if (kind === "bad") notify.warn(msg); };
import { checkDiceGroups, damageDiceGroups, poisonSidesOf, rollFromDice, rollList, seriesGroups, waitDice } from "../helpers/dice-rolls.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

/** Panel state per actor uuid (survives closing the window) */
const STATES = new Map();
const OPEN = new Map();

/** Buttons whose result goes to chat */
const CHAT_ON = new Set(["roll", "aspect", "modasp", "sitasp", "nearasp", "dmg", "dmgre", "luck"]);
const WHY_SAID = new Map();
/** П2 (author, 2026-11-22): the healing / repair checks, their patient chosen after the roll */
const HEAL_TYPES = ["med", "repair", "treat"];
/** «Без Припасів» ticked before the roll, by actor uuid (one roll; П2, answer 1: all three checks) */
const HEAL_FREE = new Set();
/** A press of the A6 / A7 blocks on its way, by actor uuid (Fable П-2: one application a roll) */
const HX_BUSY = new Set();
/** The block's choices (consequence, payment, name) of the current roll, by actor uuid (Fable П-6) */
const HX_SEL = new Map();
/** Rebuild the healing blocks of the open panels when the targets change (debounced: medOffer reads the target) */
let hxRebuild = null;
/**
 * A8 (author, 2026-11-21): a rolled damage waiting to be split, by actor uuid — {time (the damage roll's), total, targets
 * [{uuid, name}] fixed at the roll, shares, id, sent}. Kept through closing the panel, lost on F5 (then the GM deals it in
 * «Битва»).
 */
const SPLIT = new Map();
/** What the blocks of A6 / A7 did for this roll (П2: kept on the roll itself, `last.hx`; one press a roll) */
const hxDone = (uuid, last) => String(last?.hx || "");
/** Mark the saved roll at once, before anything is awaited (Fable П-1) */
function markHx(uuid, last, text) {
  const R = STATES.get(uuid);
  if (R?.last && R.last.time === last.time) R.last.hx = text;
}

/**
 * The damage is rolled and dealt in one press (author, 2026-11-17): «Завдати шкоди» with the targets' count; with no
 * targets it is locked (half-transparent), its tooltip and a press say why. Kept in step with the targets live.
 */
const NO_TARGETS = "Цілей не обрано. Познач ціль: T над токеном (Shift+T — ще одну).";
function syncDealButton(root) {
  // an attack with no targets says so already before its roll (author, 2026-11-18), until its damage is dealt
  const hint = root?.querySelector(".pust-tgthint");
  if (hint) hint.hidden = !!game.user.targets.size || root.querySelector("select#r-type")?.value !== "attack" || !!root.querySelector(".rdmg .rdres");
  // A8: «Розподілити між цілями» only while two targets or more are chosen
  const sp = root?.querySelector("details.pust-split");
  if (sp) sp.hidden = game.user.targets.size < 2;
  const no = root?.querySelector(".pust-split-no");
  if (no) no.hidden = game.user.targets.size < 2;
  const b = root?.querySelector('button[data-r="dmg"]');
  if (!b) return;
  const n = game.user.targets.size;
  b.classList.toggle("pust-locked", !n);
  b.setAttribute("aria-disabled", String(!n));
  b.title = n ? `Кинути шкоду й одразу завдати її цілям: ${n}` : NO_TARGETS;
  const c = b.querySelector(".pust-tgtn");
  if (c) c.textContent = n ? ` · цілей: ${n}` : "";
}
Hooks.on("targetToken", (user) => {
  if (user !== game.user) return;
  document.querySelectorAll(".pust-roller").forEach(syncDealButton);
  // П2: the patient is chosen after the roll — its block follows the targets
  clearTimeout(hxRebuild);
  hxRebuild = setTimeout(() => {
    for (const app of [...OPEN.values(), DOCKED]) {
      const last = app?.rendered ? STATES.get(app.actor?.uuid)?.last : null;
      if (last && HEAL_TYPES.includes(last.type) && !last.hx && !HX_BUSY.has(app.actor.uuid)) app.render();
    }
  }, 150);
});

/**
 * The chat's mode (author, 2026-11-18; playtest item 1, mockup А): a player whose mode is Self Only, Private to Gamemasters or
 * Blind to Gamemasters (Public as Character is public too) gets a yellow strip under the panel's head with «Public as User»,
 * which switches the mode. Not for the GM, whose hidden rolls are normal. Names from Foundry's lang (CHAT.MODES).
 */
const MODE_WHO = { self: "кидки бачиш лише ти", gm: "кидки бачить лише Доглядач", blind: "кидки бачить лише Доглядач, а ти ні" };
function syncChatMode(el) {
  if (!el) return;
  const mode = game.settings.settings.has("core.messageMode") ? game.settings.get("core", "messageMode") : "";
  const warn = !game.user.isGM && !isPublicMode() && !el.classList.contains("pust-demo-check");
  let bar = el.querySelector(".pust-chatmode");
  if (!warn) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement("div");
    bar.className = "pust-chatmode";
    bar.setAttribute("role", "status");
    bar.addEventListener("click", (ev) => {
      if (!ev.target.closest("button")) return;
      if (game.settings.settings.has("core.messageMode")) game.settings.set("core", "messageMode", "public");
      else game.settings.set("core", "rollMode", "publicroll");
    });
  }
  // right under the head: the docked panel's own header (it is made after the panel's render, which calls this again), else
  // the top of the window's content
  const hd = el.querySelector(":scope > .pust-cd-hd");
  if (hd) { if (hd.nextElementSibling !== bar) hd.after(bar); }
  else if (!bar.isConnected) el.querySelector(".window-content")?.prepend(bar);
  const L = (k) => game.i18n.localize(`CHAT.MODES.${k}`);
  bar.innerHTML = `<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span><b>${esc(mode && MODE_WHO[mode] ? L(mode) : "Режим чату")}</b>: ${esc(MODE_WHO[mode] || "кидки бачать не всі")}</span>`
    + `<button type="button" title="Перемкнути режим чату: кидки бачитимуть усі">${esc(L("public"))}</button>`;
}
Hooks.on("clientSettingChanged", (key) => {
  if (key === "core.messageMode" || key === "core.rollMode") document.querySelectorAll(".pust-check").forEach(syncChatMode);
});

/** A deleted character takes its open check panels with it (stress test, 2026-11-17: every button of a panel left open
 *  over a deleted actor threw «Actor … does not exist») */
Hooks.on("deleteActor", (actor) => {
  OPEN.get(actor.uuid)?.close();
  if (DOCKED?.actor?.id === actor.id) DOCKED.close();
});

/** A change of the character (a state, a consequence, an addiction, a perk, an item) redraws its open check panels: the
 *  roll counted it, but the strip and the conditions showed the old set until the panel was reopened (playtest 2026-11-18,
 *  item 2). Debounced: one write of the sheet fires several hooks, and the panel's own roll writes the actor too. */
const REDRAW = new Map();
function redrawPanels(actor) {
  if (!actor || actor.type !== "character") return;
  clearTimeout(REDRAW.get(actor.uuid));
  REDRAW.set(actor.uuid, setTimeout(() => {
    REDRAW.delete(actor.uuid);
    const open = OPEN.get(actor.uuid);
    if (open?.rendered) open.render();
    if (DOCKED?.rendered && DOCKED.actor?.uuid === actor.uuid) DOCKED.render();
  }, 120));
}
Hooks.on("updateActor", (actor) => redrawPanels(actor));
// an enemy's attack card changed (A1): the panels answering it, or open on an avoidance, show its new state
// (and a card of its own, created with the record: a private attack or none to write on; reviewer, 2026-11-21)
for (const h of ["updateChatMessage", "createChatMessage"]) Hooks.on(h, (m) => {
  if (!pendOf(m)) return;
  for (const app of [...OPEN.values(), DOCKED]) if (app?.rendered && app.actor?.isOwner) app.render();
});
for (const h of ["createItem", "updateItem", "deleteItem"]) Hooks.on(h, (item) => redrawPanels(item?.parent));

/** The pressed ready check of each character's panel (author, 2026-11-22, П1 1.3): «preset:<name>» / «xpreset:<name>» */
const PICKED = new Map();
/** The key of the ready check `r` / `v` (an index into the engine's list) */
function pickedKey(L, r, v) {
  const list = r === "preset" ? L.ROLL_PRESETS : r === "xpreset" ? L.extraPresets() : null;
  return presetKey(r, list?.[+v]?.l);
}

/**
 * Open «Зробити перевірку» (author, 2026-11-22, П1 1.5): a player's own character in the docked panel on the left (the map
 * dock's «Зробити перевірку»), the GM and anyone else in the window. `btn` — the button pressed (the sheet's, the attack
 * card's «Уникнути»): over an unfinished result (an attack's damage or effect not dealt) it turns into «Замінити?» of its own
 * size for 3 s, and the second press replaces; opened without a button (a macro, a link) the panel says so in a line, and the
 * same opening again within 3 s replaces. Returns the panel (the attack card binds its avoidance to it).
 */
export function openCheckPanel(actor, preset = {}, { btn = null } = {}) {
  const dockBtn = document.querySelector("#pust-mapdock .pust-md-check");
  const route = routeOf({ isGM: game.user.isGM, owned: ownCharacters().includes(actor), dockReady: !!dockBtn && !dockBtn.hidden });
  let app;
  if (route === "dock") {
    dockActorId = actor.id;
    if (!DOCKED?.rendered) { DOCKED = new DockedCheckPanel({ actor }); DOCKED.anchor = dockBtn.getBoundingClientRect(); }
    else DOCKED.actor = actor;
    app = DOCKED;
  } else {
    app = OPEN.get(actor.uuid);
    if (!app) {
      app = new CheckPanel({ actor });
      OPEN.set(actor.uuid, app);
    }
  }
  // anything chosen (the sheet's plain button too: its preset starts a new check) over an unfinished result asks first
  if (Object.keys(preset).length && app.hasUnfinished() && !askReplace(btn, actor, preset)) {
    if (btn?.tagName !== "BUTTON") app.replaceNote();
    app.render({ force: true }).then(() => dockBtn?.classList.toggle("on", dockCheckOpen()));
    return app;
  }
  app.preset(preset);
  app.render({ force: true }).then(() => dockBtn?.classList.toggle("on", dockCheckOpen()));
  return app;
}

/** «Замінити?» (П1 1.5): false on the first press (the button turns, or the panel's line shows), true on the second within 3 s */
const REPLACE_MS = 3000;
let REPLACE = null;
function askReplace(btn, actor, preset) {
  const key = `${actor.uuid}|${JSON.stringify(preset)}`;
  if (REPLACE && REPLACE.key === key && Date.now() - REPLACE.at < REPLACE_MS) { REPLACE.undo?.(); REPLACE = null; return true; }
  REPLACE?.undo?.();
  REPLACE = { key, at: Date.now(), undo: null };
  // only a real button turns into «Замінити?» of its own size; a small link or icon has no room for the word
  if (btn?.tagName === "BUTTON" && btn.isConnected) {
    const r = btn.getBoundingClientRect(), html = btn.innerHTML, w = btn.style.width, h = btn.style.height;
    btn.style.width = `${r.width}px`;
    btn.style.height = `${r.height}px`;
    btn.classList.add("pust-replace");
    btn.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i><span>Замінити?</span>`;
    btn.title = "У перевірці є незавершений результат (шкоду чи ефект не застосовано). Натисни ще раз, щоб замінити його";
    const undo = () => { clearTimeout(t); btn.classList.remove("pust-replace"); btn.innerHTML = html; btn.style.width = w; btn.style.height = h; btn.removeAttribute("title"); };
    const t = setTimeout(() => { undo(); if (REPLACE?.key === key) REPLACE = null; }, REPLACE_MS);
    REPLACE.undo = undo;
  }
  return false;
}

/**
 * The ready-made checks' tones (author, 2026-11-15): within their group's colour each button its own — attacks: shooting
 * red, melee dark red-brown, grenades orange; avoiding damage by its damage chip: ВП physical rust, ІН psychic violet,
 * ВТР poison / radiation green; medical help and treating consequences green; taking consequences as the «0 ОЗ» box.
 */
function presetTone(label) {
  const l = String(label).toLowerCase();
  if (/відстан|стрільб/.test(l)) return "shoot";
  if (/ближн|герц/.test(l)) return "melee";
  if (/гранат|вибух/.test(l)) return "boom";
  if (/фізичн/.test(l)) return "phys";
  if (/психічн/.test(l)) return "psy";
  if (/отрут|радіац/.test(l)) return "tox";
  if (/медичн/.test(l)) return "med";
  if (/лікуван/.test(l)) return "heal";
  if (/отриманн/.test(l)) return "ko";
  return "";
}

class CheckPanel extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wastelanders", "pust-check"],
    position: { width: 540, height: "auto" },
    window: { resizable: true, icon: "fa-solid fa-dice-d20" },
  };

  static PARTS = { panel: { template: "systems/wastelanders-dev/templates/apps/check-panel.hbs" } };

  constructor(options) {
    super(options);
    this.actor = options.actor;
  }

  get title() {
    return `Зробити перевірку — ${this.actor.name}`;
  }

  /**
   * The enemy's attack this avoidance answers (A1; author, 2026-11-20): {msg, row} of its card (pending-attack.mjs). Set by
   * the card's «Уникнути»; an avoidance rolled without it takes the character's newest waiting attack by itself.
   */
  #pend = null;
  /** The row the last avoidance roll was sent to, and whether the GM's answer is still on its way (reviewer, 2026-11-21:
   *  bound at the roll, never by comparing the player's clock with the card's) */
  #sent = null;
  #sending = false;
  bindPend(b) { this.#pend = b?.msg && b?.row ? { msg: b.msg, row: b.row } : null; return this; }
  get pendMsgId() { return this.#pend?.msg ?? null; }

  /** An attack's result whose damage or effect is still to be dealt (П1 1.5: a new check asks «Замінити?» first) */
  hasUnfinished() {
    const { L } = evaluate(this.actor);
    const last = this.#load(L).last;
    return unfinished(last, !!last && this.#fx.time === last.time && !!this.#fx.done);
  }
  /** The line over «Інша перевірка» for 3 s: the check was opened over an unfinished result (a macro, a link) */
  #replaceUntil = 0;
  replaceNote() {
    this.#replaceUntil = Date.now() + REPLACE_MS;
    setTimeout(() => { if (this.rendered) this.render(); }, REPLACE_MS + 50);
  }

  /** The bound attack's record and row, while «Уникнення шкоди» is the check's type */
  #pendNow(R, rebind = false) {
    if (R.type !== "dodge") return null;
    const bound = () => { const m = this.#pend ? game.messages.get(this.#pend.msg) : null; return { msg: m, pend: pendOf(m), row: pendOf(m)?.rows?.[this.#pend?.row] }; };
    // none bound, or the bound one closed: the character's newest waiting attack — at a new roll always, on screen only when
    // its card is newer than the closed one's (both cards' times come from the same place, unlike the player's roll time)
    let b = bound();
    const o = openRowOf(this.actor.uuid);
    if (o && (!b.row || (rowClosed(b.row) && (rebind || (game.messages.get(o.msg)?.timestamp ?? 0) > (b.msg?.timestamp ?? 0))))) {
      this.#pend = o; b = bound();
    }
    const { msg, pend, row } = b;
    return row ? { pend, row, msg } : null;
  }

  /** The strip over the panel: who attacks, the damage, and after the roll the button that applies it */
  #pendBar(R) {
    const p = this.#pendNow(R);
    if (!p) return "";
    const { pend, row } = p;
    const tot = rowTotal(pend, row);
    const id = this.#pend?.row;
    const what = `${esc(pend.srcName || "Ворог")} атакує: <b>${tot}</b> шкоди${pend.half ? " (½ з ефекту)" : ""}`;
    let tail = "";
    // a roll made after the attack that never reached the card (the GM didn't answer): sent again, not rolled again
    const sent = R.last?.type === "dodge" && this.#sent?.msg === p.msg?.id && this.#sent?.row === id;
    if (row.status === "wait" && sent && this.#sending) tail = `<span class="pust-pendbar-st">Кидок надіслано Доглядачу…</span>`;
    else if (row.status === "wait" && sent) tail = `<button type="button" class="btn rust pust-pendbar-go" data-pend-send>Надіслати результат ще раз</button><span class="pust-pendbar-st">Доглядач ще не отримав твій кидок.</span>`;
    else if (row.status === "wait") tail = `<span class="pust-pendbar-st">Кидай уникнення ${ATTR_SHORT[pend.attr] ?? "ВП"}.</span>`;
    else if (row.status === "rolled") tail = `<button type="button" class="btn rust pust-pendbar-go" data-pend-apply>${esc(rowDeal(pend, row).label)}</button>`
      + `<span class="pust-pendbar-st">Спершу можеш викликати аспект.</span>`;
    else tail = `<span class="pust-pendbar-st">${esc(rowText(row, pend.attr))}</span>`;
    return `<div class="pust-pendbar${rowClosed(row) ? " done" : ""}"><i class="fa-solid fa-shield-halved"></i><span>${what}</span>${tail}</div>`;
  }

  /** The panel state R, loaded into a fresh logic instance */
  #load(L) {
    const saved = STATES.get(this.actor.uuid);
    if (saved) Object.assign(L.R, clone(saved));
    L.R.fateMode = "char"; // Кістка Долі for this character only (author, 2026-11-13)
    if (!saved) L.R.pool = { 6: 0, 8: 0, 10: 0 }; // «Кістки» (the HTML sheet's «Просто кубики») start empty (author, 2026-11-13)
    return L.R;
  }
  #save(L) {
    STATES.set(this.actor.uuid, clone(L.R));
  }

  /** Open with an attribute / skill / weapon / check type chosen on the sheet */
  preset(p) {
    const { st, L } = evaluate(this.actor);
    const R = this.#load(L);
    if (p.type) {
      R.type = p.type;
      L.applyTypeDefaults(p.type);
    }
    if (p.attr) R.attr = p.attr;
    if (p.skill) R.skill = p.skill;
    if (p.weapon != null && st.weapons[+p.weapon]) {
      R.type = "attack";
      L.applyTypeDefaults("attack");
      R.dmgKey = `w${p.weapon}`;
      R.dmgUser = true;
      // the attack by the weapon's «Вид» (author, 2026-11-20): melee → СЛ + Герць, ranged → СПР + Стрільба; unknown kinds and
      // psychic powers keep the attack's defaults
      const kind = L.weaponKind({ key: R.dmgKey, w: st.weapons[+p.weapon] });
      if (kind === "melee") { R.attr = "SL"; R.skill = "Герць"; }
      else if (kind === "ranged") { R.attr = "SPR"; R.skill = "Стрільба"; }
    }
    // a grenade or explosive of «Інший мотлох» (author, 2026-11-20): СПР + Техніка, its damage chosen
    if (p.other != null && st.other[+p.other]) {
      R.type = "attack";
      L.applyTypeDefaults("attack");
      R.attr = "SPR"; R.skill = "Техніка";
      R.dmgKey = `o${p.other}`;
      R.dmgUser = true;
    }
    // a ready check (a hotbar macro; author, 2026-11-17): as a press of its button
    if (p.r) L.rollerClick({ tagName: "BUTTON", dataset: { r: p.r, v: String(p.v) } });
    // the pressed ready check (П1 1.3): a ready check by itself, a weapon / grenade by its kind; an attribute or skill — none
    if (Object.keys(p).length) {
      const wi = p.weapon != null && st.weapons[+p.weapon] ? presetOfWeapon(L.weaponKind({ key: `w${p.weapon}`, w: st.weapons[+p.weapon] })) : null;
      const k = p.r ? pickedKey(L, p.r, p.v) : wi != null ? pickedKey(L, "preset", wi) : p.other != null && st.other[+p.other] ? pickedKey(L, "preset", presetOfWeapon("grenade")) : null;
      PICKED.set(this.actor.uuid, k);
    }
    if (Object.keys(p).length) {
      R.last = null;
      R.am = {};
    }
    this.#save(L);
  }

  /**
   * The attack's effects as toggles (A2; author, 2026-11-20; rules/attack-effects.mjs): in place of the engine's list, within
   * the result's limits; «+2» / «+1d6» are the engine's own options (R.dmgOpt), the others live here a roll (`time`). The
   * states and «ігноруєш броню» go with the damage; on 10–14 without the perk an effect replaces it («Застосувати ефект»).
   */
  #fx = { time: null, picks: [], one: "", done: "", ally: "" };
  #fxOf = null;
  #fxNow(L, st) {
    const last = L.R.last;
    if (!last || last.type !== "attack") return null;
    const mode = attackMode(last.skillName, last.attr);
    const of = fxOffer({ mode, verdict: last.verdict, perks: compute(st).allPerks });
    if (this.#fx.time !== last.time) this.#fx = { time: last.time, picks: [], one: "", done: "", ally: "" };
    // the engine's «+2» / «+1d6» as picks, in the order kept here
    const opt = L.R.dmgOpt || {};
    let picks = this.#fx.picks.filter((k) => (k === "plus2" ? opt.norm2 : k === "plus1d6" ? opt.crit : true));
    if (opt.norm2 && !picks.includes("plus2")) picks.push("plus2");
    if (opt.crit && !picks.includes("plus1d6")) picks.push("plus1d6");
    picks = fxKeep(of, picks);
    this.#fx.picks = picks;
    return { of, mode, picks, last };
  }

  #effectsBlock(html, L, st) {
    const f = this.#fxNow(L, st);
    this.#fxOf = f;
    if (!f) return html;
    const { of, mode, picks, last } = f;
    // the engine's own «+2» / «+1d6» toggles under the damage move into this list
    html = html.replace(/<label class="tog"><input type="checkbox" id="dm-(?:norm2|crit)"[^>]*>[^<]*<\/label>/g, "");
    if (!of.normal.length && !of.crit.length) return html.replace(/<details class="rfx"[^>]*>[\s\S]*?<\/details>/, "");
    const done = !!last.dmg || !!this.#fx.done;
    // 10–14 without the perk, the damage dealt: the damage was chosen, the effects never land (П3 3.2)
    const struck = of.instead && !!last.dmg && !this.#fx.done;
    const row = (e, tier) => {
      const x = { ...e, tier }, on = !struck && picks.includes(e.key);
      const tag = e.does === "cover" ? `<small class="pust-fx-tag">Посилення спільнику</small>` : e.does === "state" ? `<small class="pust-fx-tag">${e.all ? "застосується до всіх" : "застосується до цілі"}</small>`
        : e.does === "ignore" ? `<small class="pust-fx-tag">з шкодою</small>`
        : e.does === "text" ? `<small class="pust-fx-tag hand">руками</small>` : "";
      return `<label class="tog pust-fxt${on ? " on" : ""}${struck ? " struck" : ""}"><input type="checkbox" data-fx="${e.key}"${on ? " checked" : ""}${done ? " disabled" : ""}> <span>${esc(effectText(L.ATK_FX, mode, x))}</span>${tag}</label>`;
    };
    const perkNotes = /<ul class="rperk">[\s\S]*?<\/ul>/.exec(html)?.[0] ?? "";
    const limit = of.instead ? "Завдай шкоди або обери замість неї 1 звичайний ефект."
      : last.verdict === 3 ? (of.slots.length > 1 ? "Обери до двох ефектів." : "Обери 1 критичний або звичайний ефект.")
      : (of.slots.length > 1 ? "Обери до двох звичайних ефектів." : "Обери 1 звичайний ефект.");
    // A8: a split waiting — its fixed targets; the effect's «ігноруєш броню» and the weapon's poison go to one of them too
    // (author, 2026-11-21: «Обидва на ціль ефекту»)
    const sp = this.#splitNow(last);
    const targets = sp && !sp.sent ? sp.targets.map((t) => ({ uuid: t.uuid, name: t.name }))
      : [...(game.user.targets ?? [])].filter((t) => t?.document).map((t) => ({ uuid: t.document.uuid, name: t.name }));
    const stateOne = picks.some((k) => { const e = effectOf(of, k); return e?.does === "state" && !e.all; });
    const ignoreOne = picks.some((k) => effectOf(of, k)?.does === "ignore");
    const poisonOne = !!(last.poison && last.poisonRoll);
    const splitOne = !!sp && !sp.sent && (ignoreOne || poisonOne);
    const needOne = (stateOne || splitOne) && targets.length > 1;
    const oneLabel = stateOne || (splitOne && ignoreOne) ? (splitOne && poisonOne ? "Ефект і отрута на:" : "Ефект на:") : "Отрута на:";
    const one = needOne && !struck ? `<label class="pust-fx-one">${oneLabel} <select data-fx-one${done ? " disabled" : ""}>${targets.map((t) => `<option value="${esc(t.uuid)}"${t.uuid === this.#fx.one ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>` : "";
    // «Прикриваєш спільника»: an ally of the scene (a character's token, not this one's)
    let ally = "";
    if (picks.includes("cover") && !struck) {
      const own = new Set((canvas?.scene?.tokens ?? []).filter((t) => t.actor?.id === this.actor.id).map((t) => t.uuid));
      const allies = (canvas?.scene?.tokens ?? []).filter((t) => t.actor?.type === "character" && !own.has(t.uuid) && !t.hidden);
      if (!allies.some((t) => t.uuid === this.#fx.ally)) this.#fx.ally = allies[0]?.uuid ?? "";
      ally = allies.length ? `<label class="pust-fx-one">Кого прикриваєш: <select data-fx-ally${done ? " disabled" : ""}>${allies.map((t) => `<option value="${t.uuid}"${t.uuid === this.#fx.ally ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>`
        : `<p class="rhint">На сцені немає спільників: ефект буде лише рядком на картці.</p>`;
    }
    const applyFx = of.instead && picks.length && !done ? `<button type="button" class="btn rust pust-fx-apply" data-fx-apply><i class="fa-solid fa-bolt"></i>Застосувати ефект без шкоди</button>` : "";
    const block = `<div class="rfx pust-fx"><h4>Ефекти: ${esc(L.ATK_FX[mode]?.n?.toLowerCase() ?? "")}</h4>${perkNotes}<p class="rhint">${esc(limit)}${struck ? " Обрано шкоду: ефект не діє." : done ? " Уже застосовано." : ""}</p>`
      + (of.crit.length ? `<h5>Критичні</h5>${of.crit.map((e) => row(e, "crit")).join("")}` : "")
      + (of.normal.length ? `<h5>Звичайні</h5>${of.normal.map((e) => row(e, "normal")).join("")}` : "")
      + one + ally + applyFx + `</div>`;
    return html.replace(/<details class="rfx"[^>]*>[\s\S]*?<\/details>/, block);
  }

  /** A toggle pressed: the picks within the limits; «+2» / «+1d6» through the engine's own options */
  async #fxPick(key, on) {
    const f = this.#fxOf;
    if (!f) return;
    const next = fxToggle(f.of, f.picks, key, on);
    const want = { norm2: next.includes("plus2"), crit: next.includes("plus1d6") };
    const { L } = evaluate(this.actor);
    const R = this.#load(L);
    this.#fx.picks = next;
    for (const k of ["norm2", "crit"]) if (!!R.dmgOpt?.[k] !== want[k]) await this.#run("change", { tagName: "INPUT", dataset: { r: "dopt", k }, value: "", checked: want[k] });
    this.#fx.picks = next;
    this.render();
  }

  /** What the picks add to the hit: ignored armour, the states on the target(s), the text effects */
  #fxData(effectOnly = false, uuids = null) {
    const f = this.#fxOf;
    // 10–14 without the perk: damage or an effect — the damage carries none
    if (!f || !f.picks.length || (f.of.instead && !effectOnly)) return {};
    // A8: a split hit's targets are the ones fixed at its roll, not the current T
    const targets = uuids ?? [...(game.user.targets ?? [])].filter((t) => t?.document).map((t) => t.document.uuid);
    const h = hitFx(f.of, f.picks, targets, this.#fx.one, this.#fx.ally);
    const { L } = evaluate(this.actor);
    const said = h.said.map((k) => effectText(L.ATK_FX, f.mode, effectOf(f.of, k))).filter(Boolean);
    return { ...(h.ignoreArmor ? { ignoreArmor: true, ignoreN: 0 } : {}), ...(h.fx.length ? { fx: h.fx } : {}), ...(said.length ? { said } : {}), ...(h.cover ? { cover: h.cover } : {}) };
  }

  /** «Прикритий: …» on this character (П3 3.2, rules/cover.mjs): the oldest cover with its invoke, or null */
  #cover() {
    const c = activeCover(this.actor.system?.situational);
    return c ? { ...c, byName: c.by } : null;
  }

  /** This character's token on the viewed scene (the effect's source), or "" */
  #ownToken() {
    return (canvas?.scene?.tokens ?? []).find((t) => t.actor?.id === this.actor.id)?.uuid ?? "";
  }

  async _prepareContext() {
    const { st, L } = evaluate(this.actor);
    const R = this.#load(L);
    // what an unsatisfied addiction adds to the roll (logic.mjs doRoll), for the strip's text
    this.#addict = R.addOn !== false ? L.addictionPenalty(L.unsatAddictions().length) : { pen: 0, flat: 0 };
    this.#types = L.CHECK_TYPES;
    // «Останні кидки» is left out: in Foundry every roll is already in the chat log (author, 2026-11-13)
    // «Кістка Долі» and «Кістки» (the HTML sheet's «Просто кубики») are left out too: they live in the panel «Кістки» on
    // the left of the map now (author, 2026-11-14); they are the roller's last two blocks
    const html = L.renderRoller()
      .replace(/<details class="rhist"[\s\S]*?<\/details>/, "")
      .replace(/<div class="rfate">[\s\S]*$/, "")
      // ready-made checks: the part in brackets («бій на відстані», «гранати») always on the button's second line
      // ready-made checks in two lines: «СПР+Стрільба» / «бій на відстані», «ВП» / «фізична шкода»
      .replace(/(<button type="button" class="chipb[^"]*"[^>]*>)([^<]*)(<\/button>)/g, (m, open, label, close) => {
        const [, top, sub] = /^(.*?)\s*\((.*)\)\s*$/.exec(label) || /^(.*?)\s+—\s+(.*)$/.exec(label) || [null, label, ""];
        // each its own tone within its group (author, 2026-11-15; css/pust-check.css [data-tone])
        const tone = presetTone(`${top} ${sub}`);
        return `${tone ? open.replace(/>$/, ` data-tone="${tone}">`) : open}${top.replace(/\s*\+\s*/g, "+")}${sub ? `<small class="rsub">${sub}</small>` : ""}${close}`;
      })
      // attack effects always open (the HTML sheet opens them only on a success)
      .replace(/<details class="rfx">/g, '<details class="rfx" open>')
      // every die knows its type, so CSS can draw its shape (d6 square, d8 diamond, d10 kite, d12 pentagon)
      .replace(/<span class="die([^"]*)"([^>]*)><b>([^<]*)<\/b><i>d(\d+)<\/i>/g, '<span class="die d$4$1"$2><b>$3</b><i>d$4</i>')
      // «Прикритий: …» (П3 3.2) is spent only by an avoidance, never invoked as an ordinary aspect
      .replace(/<button type="button" class="btn sm modasp" data-r="sitasp"[^>]*>«Прикритий: [^»]*»[\s\S]*?<\/button>/g, "")
      // invoking a situational aspect: «name», its free invokes as a green «+2» (as on the sheet), then «+1d10»
      .replace(/(data-r="sitasp"[^>]*>)«([^»]*)»\s*<svg class="xcross"[\s\S]*?<\/svg>(\d+): \+1d10/g,
        '$1<span class="rasp-name">$2</span><span class="rinv" title="Безкоштовних Посилень">+$3</span><span>+1d10</span>')
      // the result's ranges (≤9 · 10–14 · 15–16 · 17+): the one the total fell into is lit
      .replace(/(<div class="rres v(\d)"[\s\S]*?<div class="rverd"><b>[^<]*<\/b>)<small>([^<]*)<\/small>/, (m, head, v, ranges) =>
        `${head}<span class="rranges">${ranges.split(" · ").map((r, i) => `<span class="${i === +v ? `hit v${v}` : ""}">${r}</span>`).join("")}</span>`)
      // the verdict right under the dice (it matters most); the sum «5 + 1 + 1 СПР = 7» goes into the bar with the ranges
      .replace(/<\/div><div class="rsum">([\s\S]*?)<\/div><div class="rverd"><b>([^<]*)<\/b>/,
        '</div><b class="rvhead">$2</b><div class="rverd"><span class="rsum">$1</span>')
      // no «кидаєш 2d10…» line over the roll button; only the critical-success note stays, when there is one
      .replace(/<p class="rnote">(?:кидаєш|нейтралізують)[^<]*((?:<b>[^<]*<\/b>)*)<\/p>(?=<button type="button" class="btn rust rgo")/,
        (m, crit) => (crit ? `<p class="rnote">${crit.trim()}</p>` : ""));
    // the roar's −2 among the automatic conditions, ticked and locked (it goes with the next roll; #intent counts it)
    const pen = checkPenalty(this.actor);
    const penHtml = pen ? `<div class="ramods pust-ramods-state"><span class="rl">Стан</span><label class="tog" title="Аспект «${pen.aspect}»: −2 до цього кидка, після нього аспект зникне"><input type="checkbox" data-r="am" data-k="state-check" checked disabled> <span>«${pen.aspect}»: <b>−${-pen.n}</b></span></label></div>` : "";
    const cov = R.type === "dodge" ? this.#cover() : null;
    const covHtml = cov ? `<div class="ramods pust-ramods-state"><span class="rl">Прикриття</span><label class="tog" title="Аспект «${esc(cov.t)}»: Посилення до цього уникнення шкоди, після кидка аспект зникне"><input type="checkbox" checked disabled> <span>${esc(cov.byName || "Спільник")} прикриває: <b>Посилення</b></span></label></div>` : "";
    // «Без Припасів» (П2, answer 1): the table lets this healing / repair go without paying; one roll
    const freeHtml = HEAL_TYPES.includes(R.type) && !this.actor.pustTourDemo ? `<div class="ramods pust-ramods-state"><span class="rl">Плата</span><label class="tog" title="Доглядач дозволив без плати: кидок можливий без Припасів, після застосування нічого не списується"><input type="checkbox" data-hxfree${HEAL_FREE.has(this.actor.uuid) ? " checked" : ""}> <span>Без Припасів</span></label></div>` : "";
    let withPen = penHtml || covHtml || freeHtml ? html.replace('<button type="button" class="btn rust rgo"', `${penHtml}${covHtml}${freeHtml}<button type="button" class="btn rust rgo"`) : html;
    withPen = await this.#healthBlocks(withPen, L);
    return { html: this.#pendBar(R) + this.#damageBlock(this.#effectsBlock(withPen, L, st), L, st) };
  }

  /**
   * Battle and health (author, 2026-11-21; applications/battle-health.mjs): «Аспекти поруч» in the invoke row (A5), and under
   * the verdict «Записати наслідок» (A6), «Медична допомога» / «Ремонт» / «Лікування наслідків» on the target (A7)
   */
  #near = [];
  async #healthBlocks(html, L) {
    const last = L.R.last;
    this.#near = [];
    if (!last) return html;
    if (!this.actor.pustTourDemo) {
      try { this.#near = await nearbyFor(this.actor); } catch (e) { console.warn(e); }
    }
    const can = !last.aspect && (last.B || 0) < 2 && last.verdict < 3 && !last.dmgDone && !last.xpGiven && !last.savGiven && !last.hx;
    const chips = nearbyHtml(this.#near, can);
    if (chips) html = html.replace(/(<div class="rasp">[\s\S]*?)(<label class="tog"><input type="checkbox" id="r-spend")/, (m, a, b) => `${a}${chips}${b}`);
    const done = hxDone(this.actor.uuid, last);
    // the result applied (П2, Fable П-4): the roll is frozen — no aspect invoked on it any more
    if (done) {
      html = html.replace(/(<div class="rasp">[\s\S]*?<\/label>)/, (m) => `${m.replace(/<button /g, "<button disabled ").replace(/<input /g, "<input disabled ")}<small>Результат уже застосовано: аспект викликати не можна.</small>`);
    }
    // the choices in the block survive its rebuild on a new target (Fable П-6)
    const box = this.element?.querySelector?.(".pust-hx");
    // kept by the roll, so a target without the field in between (none, a robot) doesn't lose them
    const was = HX_SEL.get(this.actor.uuid);
    const prev = was?.time === last.time ? was : {};
    const pick = (q) => box?.querySelector(q)?.value ?? prev[q];
    const sel = { slot: pick("[data-hx-slot]"), pay: pick("[data-hx-pay]"), name: pick("[data-hx-name]") };
    HX_SEL.set(this.actor.uuid, { time: last.time, "[data-hx-slot]": sel.slot, "[data-hx-pay]": sel.pay, "[data-hx-name]": sel.name });
    let block = "";
    if (last.type === "consq") block = consqHtml(consqOffer(this.actor, last), done);
    else if (["med", "repair", "treat"].includes(last.type)) {
      const o = await medOffer(this.actor, last);
      block = medHtml(o, done, { busy: HX_BUSY.has(this.actor.uuid), sel });
      // a refusal said once a roll in the notifications too (author, 2026-11-21: a robot treated with «Медицина»)
      const said = `${last.time}|${o?.patient?.uuid}`;
      if (o?.why && o.patient && !done && WHY_SAID.get(this.actor.uuid) !== said) { WHY_SAID.set(this.actor.uuid, said); notify.warn(o.why); }
    }
    if (block) html = html.replace('<div class="rasp">', () => `${block}<div class="rasp">`);
    return html;
  }

  /** A press in those blocks */
  async #healthPress(el) {
    const { L } = evaluate(this.actor);
    const last = this.#load(L).last;
    const uuid = this.actor.uuid;
    if (!last || hxDone(uuid, last) || HX_BUSY.has(uuid)) return;
    const kind = el.dataset.hx;
    const box = el.closest(".pust-hx");
    const name = box?.querySelector("[data-hx-name]")?.value ?? "";
    const slot = box?.querySelector("[data-hx-slot]")?.value ?? "";
    const pay = box?.querySelector("[data-hx-pay]")?.value ?? "";
    HX_BUSY.add(uuid);
    el.disabled = true;
    let text = "";
    try {
      if (last.type === "consq") { text = await consqWrite(this.actor, last, kind, name); if (text) markHx(uuid, last, text); }
      else text = await medPress(this.actor, last, kind, { slot, name, pay, applied: (t) => markHx(uuid, last, t) });
    } finally { HX_BUSY.delete(uuid); el.disabled = false; }
    // healing and repair: the targets go once the result is applied (П1 1.4 left them to П2)
    if (text && HEAL_TYPES.includes(last.type)) clearTargets();
    this.render();
  }

  /**
   * The damage block: coloured by the damage type (Foundry only, author 2026-11-14), the total in one row with the dice,
   * each die drawn with its own sides, the parts only when there are several, each number in its type's colour, type chips.
   */
  /** What «Завдати цілям» sends: the damage shown in the panel now */
  #apply = null;
  /** The damage with the chosen effects (A2): the weapon's own «ігнорує броню» stays */
  #hitData() {
    const d = this.#apply.data, fx = this.#fxData();
    return { ...d, ...fx, ...(d.ignoreArmor ? { ignoreArmor: true, ignoreN: d.ignoreN } : {}) };
  }

  /** A8: the fold «Розподілити між цілями» open (mockup Б: open by itself; the user's fold kept while the panel is open) */
  #splitOpen = true;
  /** A8: «Завдати шкоди» was pressed with the fold open and two targets or more: the roll waits for the split */
  #splitPress = false;
  /** A8: can this attack's damage be split — "" (yes), "types" (damage of several types), "zone", "no" (not an attack) */
  #splitFits(L, c, wt, last) {
    if (!c || !last || last.type !== "attack") return "no";
    const zone = !!(c.expl || c.w?.zone) || attackMode(last.skillName, last.attr) === "explosive";
    let types = 1;
    try { const p = L.parseDmg?.(c.d); if (p) types = new Set(termTypes(c, p, wt)).size; } catch (_) { /* unreadable: the engine says so */ }
    return splitBlock({ targets: 2, zone, types });
  }
  /** A8: what goes only to the effect's target with a split hit — the poison, «ігноруєш броню», both — or "" */
  #splitOneNeed() {
    const f = this.#fxOf;
    const last = f?.last ?? this.#load(evaluate(this.actor).L).last;
    const ignore = !!f && f.picks.length > 0 && !f.of.instead && f.picks.some((k) => effectOf(f.of, k)?.does === "ignore");
    const poison = !!(last?.poison && last?.poisonRoll);
    return ignore && poison ? "Отрута й «ігноруєш броню» діють" : poison ? "Отрута діє" : ignore ? "«Ігноруєш броню» діє" : "";
  }
  /** A8: the effect's target of the split, as #splitSend sends it */
  #splitOne(s) {
    const uuids = s.targets.map((t) => t.uuid);
    return uuids.includes(this.#fx.one) ? this.#fx.one : uuids[0];
  }
  /** A8: the split waiting for this damage roll, or null */
  #splitNow(last) {
    const s = SPLIT.get(this.actor.uuid);
    return s && last?.dmg && s.time === last.dmg.time ? s : null;
  }
  /** A8: the roll is made, the split starts even (the remainder to the first), the targets fixed now */
  #startSplit(dmg) {
    const targets = [...(game.user.targets ?? [])].filter((t) => t?.document).map((t) => ({ uuid: t.document.uuid, name: t.name }));
    const total = Math.max(0, Number(this.#apply?.data?.total) || 0);
    SPLIT.set(this.actor.uuid, { time: dmg.time, total, targets, shares: evenSplit(total, targets.map((t) => t.uuid)), id: `${this.actor.uuid}:${dmg.time}`, sent: false });
    if (this.#fx.one && !targets.some((t) => t.uuid === this.#fx.one)) this.#fx.one = "";
  }
  /** A8: the rows of the split (inserted into the damage block by _onRender) */
  #splitRows(s) {
    if (s.sent) return `<p class="rhint pust-split-done">Шкоду розподілено між цілями.</p>`;
    const left = splitLeft(s.shares, s.total);
    const any = Object.values(s.shares).some((v) => v > 0);
    const rows = s.targets.map((t) => {
      const v = s.shares[t.uuid] ?? 0;
      return `<div class="pust-split-row"><span class="pust-split-name">${esc(t.name)}</span><span class="pust-split-inv">`
        + `<button type="button" data-split-d="-1" data-d="-1" data-u="${esc(t.uuid)}" aria-label="Менше шкоди: ${esc(t.name)}"${v <= 0 ? " disabled" : ""}>−</button>`
        + `<input type="text" class="pust-screen" data-split-v data-u="${esc(t.uuid)}" value="${v}" inputmode="numeric" aria-label="Шкода: ${esc(t.name)}">`
        + `<button type="button" data-split-d="1" data-d="1" data-u="${esc(t.uuid)}" aria-label="Більше шкоди: ${esc(t.name)}"${left <= 0 ? " disabled" : ""}>+</button></span></div>`;
    }).join("");
    // the effect's target with a share of 0 would lose the poison / «ігноруєш броню»: said, and the damage waits (reviewer,
    // author 2026-11-21)
    const need = this.#splitOneNeed(), one = this.#splitOne(s);
    const idle = !!need && effectTargetIdle(s.shares, one);
    const oneName = s.targets.find((t) => t.uuid === one)?.name ?? "";
    const warn = idle ? `<p class="pust-split-warn">${need} лише на ${esc(oneName)}, а ця ціль не отримує шкоди. Дай їй хоч 1 або обери вище іншу ціль ефекту.</p>` : "";
    return `<div class="pust-split-box"><h5>Розподіл шкоди: ${s.total}</h5>${rows}`
      + `<p class="pust-split-left${left < 0 ? " over" : ""}">${left < 0 ? `Розподілено більше, ніж випало: на ${-left}` : `Лишилося: ${left} із ${s.total}`}</p>${warn}`
      + `<button type="button" class="btn rust" data-split-go${left < 0 || !any || idle ? " disabled" : ""}><i class="fa-solid fa-burst"></i>Завдати розподілену шкоду</button></div>`;
  }
  /** A8: redraw the rows in place (no render: the panel keeps its scroll and the other fields) */
  #splitRedraw(root, s) {
    const box = root.querySelector(".pust-split-box");
    if (box) box.outerHTML = this.#splitRows(s);
  }
  /** A8: send the split — each target its share; the weapon's poison and the effect's «ігноруєш броню» on the effect's target */
  async #splitSend(root, go) {
    const s = SPLIT.get(this.actor.uuid);
    if (!s || s.sent || go.disabled || !this.#apply) return;
    go.disabled = true;
    const uuids = s.targets.map((t) => t.uuid);
    const { ignoreArmor: fxIgnore, ignoreN: _n, ...fx } = this.#fxData(false, uuids);
    const d = this.#apply.data;
    const one = uuids.includes(this.#fx.one) ? this.#fx.one : uuids[0];
    const ok = await sendSplitDamage({ ...d, ...fx }, { targets: uuids, split: { shares: { ...s.shares }, one, fxIgnore: !!fxIgnore }, id: s.id, partial: this.#apply.partial, head: this.#apply.head, source: this.#ownToken() });
    if (ok) { s.sent = true; clearTargets(); this.render(); } else go.disabled = false;
  }

  #damageBlock(html, L, st) {
    const last = L.R.last;
    const D = last?.dmg;
    this.#apply = null;
    const choices = L.dmgChoices(compute(st));
    const wt = weaponDmgType(choices.find((x) => x.key === (D ? D.key : L.R.dmgKey)));
    html = html.replace('<div class="rdmg">', `<div class="rdmg dt-${wt}">`);
    // the weapon for the damage as chips «name · damage» in their damage type's colours, not a list (author, 2026-11-17);
    // the chosen one (by default the weapon in hand, the sheet's defaultDmgKey) lit; a click works as the list's change
    html = html.replace(/<div class="rdmgsel"><select id="r-dmgw"[^>]*>([\s\S]*?)<\/select><\/div>/, (m, opts) => {
      const chips = [...opts.matchAll(/<option value="([^"]*)"( selected)?>([\s\S]*?)<\/option>/g)].map(([, key, sel, label]) => {
        const at = label.lastIndexOf(" · ");
        const name = at >= 0 ? label.slice(0, at) : label, dmg = at >= 0 ? label.slice(at + 3) : "";
        const dt = weaponDmgType(choices.find((x) => x.key === key));
        return `<button type="button" class="pust-wchip dt-${dt}${sel ? " pust-pick" : ""}" data-r="dmgw" value="${key}" aria-pressed="${sel ? "true" : "false"}"><span>${name}</span>${dmg ? `<b>${dmg}</b>` : ""}</button>`;
      });
      return `<div class="rdmgsel pust-wchips" role="group" aria-label="Зброя для кидка шкоди">${chips.join("")}</div>`;
    });
    // one press rolls the damage and deals it to the targets (author, 2026-11-17); just a roll lives on the gear card's crosshair
    html = html.replace(/(<button type="button" class="btn rust" data-r="dmg">[\s\S]*?)Кинути шкоду([^<]*)<\/button>/,
      (m, head, dice) => `${head}Завдати шкоди${dice}<span class="pust-tgtn"></span></button>`);
    // A8 (author, 2026-11-21, mockup Б): «Розподілити між цілями» under the button, open by itself (the wiki's rule for an
    // attack on several); folded, every target takes the full damage as before. Not for a weapon that hits the whole zone,
    // nor for damage of several types (Fable's verdict)
    const why = D ? "no" : this.#splitFits(L, choices.find((x) => x.key === L.R.dmgKey), wt, last);
    // damage of several types: no fold, a line says why (reviewer, author 2026-11-21)
    if (why === "types") {
      const no = `<p class="rhint pust-split-no"${game.user.targets.size < 2 ? " hidden" : ""}>Розподілити між цілями не вийде: у цієї шкоди кілька типів, тож кожна ціль отримає її повністю.</p>`;
      html = html.replace(/(<button type="button" class="btn rust" data-r="dmg">[\s\S]*?<\/button>)/, `$1${no}`);
    }
    if (why === "") {
      const fold = `<details class="pust-split"${this.#splitOpen ? " open" : ""}${game.user.targets.size < 2 ? " hidden" : ""}><summary>Розподілити між цілями</summary>`
        + `<p class="rhint">Шкоду буде кинуто, але не завдано: розподіли її між цілями на власний розсуд. Згорни, щоб кожна ціль отримала повну шкоду.</p></details>`;
      html = html.replace(/(<button type="button" class="btn rust" data-r="dmg">[\s\S]*?<\/button>)/, `$1${fold}`);
    }
    // «Бойові рефлекси: перекинути» would reroll a damage already dealt: not offered here (the gear card's roll has it)
    html = html.replace(/<button type="button" class="btn sm" data-r="dmgre">[\s\S]*?<\/button>/, "");
    if (!D) return html;
    // the weapon's damage effects (armour ignored, cryo, the whole zone…) move from under the weapon choice to over the breakdown
    let fx = [];
    html = html.replace(/<ul class="rtraits">([\s\S]*?)<\/ul>/, (m, lis) => {
      const all = [...lis.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1]);
      const ch = choices.find((x) => x.key === D.key);
      fx = damageEffects(all, ch, termTypes(ch, D.p, wt));
      const rest = all.filter((t) => !isDamageEffect(t));
      return rest.length ? `<ul class="rtraits">${rest.map((t) => `<li>${t}</li>`).join("")}</ul>` : "";
    });
    if (!fx.length) { const ch = choices.find((x) => x.key === D.key); fx = damageEffects([], ch, termTypes(ch, D.p, wt)); } // no traits list at all
    const sides = dieSides(D.p);
    const choice = choices.find((x) => x.key === D.key);
    const dtypes = dieTypes(choice, D.p, wt);
    const best = D.r2 && D.r2.sum > D.r1.sum ? D.r2 : D.r1;
    // «Завдати цілям» (author, 2026-11-14): here, not in chat; a partial success of the check halves the damage
    // for those who take ½ on a partial success (the tracker's «Частковий успіх», set by the verdict itself)
    const partial = last.verdict === 1;
    this.#apply = {
      data: damageData({ total: L.dmgTotal(last, compute(st)).total, wt, fx, poison: last.poison && last.poisonRoll ? last.poisonRoll : null, emp: choiceEmpOnly(choice) }),
      partial, head: D.name,
    };
    const applyBtn = ""; // dealt by the roll itself (author, 2026-11-17): no «Завдати цілям» after it
    return html.replace(
      /<div class="rdres"><div class="rdice">([\s\S]*?)<\/div><div class="rsum"><span class="rform">[^<]*=<\/span><b class="rtot">([^<]*)<\/b><span class="rform">шкоди<\/span><\/div><ul class="rsteps">([\s\S]*?)<\/ul>/,
      (m, chips, total, lis) => {
        let i = 0;
        // the weapon's dice in rolling order get their own sides (2d6+1d10: two d6, then a d10); the +1d6 extras stay d6
        chips = chips.replace(/<span class="die d\d+([^"]*)"([^>]*)><b>([^<]*)<\/b><i>d\d+<\/i>/g, (mm, cls, attrs, v) => {
          if (/skill/.test(cls) || !sides.length) return mm;
          const k = i++ % sides.length;
          const s = sides[k];
          // a die of another damage type («2d6[радіація]» of «Товстун») in that type's colours
          return `<span class="die d${s}${cls}${dtypes[k] && dtypes[k] !== wt ? ` dt-${dtypes[k]}` : ""}"${attrs}><b>${v}</b><i>d${s}</i>`;
        });
        let parts = [...lis.matchAll(/<li>([\s\S]*?): (-?\d+)<\/li>/g)].map((x) => ({ l: x[1], v: x[2], t: partType(x[1], wt) }));
        if (!/^Максимум/.test(parts[0]?.l || "")) parts = splitDiceParts(parts, choice, D.p, wt, best.vals);
        // «Завдати цілям» takes the parts by type when there are several (radiation, poison, psychic meet their own
        // defence, not the armour) and the dice count (radiation that heals: +1 HP a die)
        if (this.#apply) Object.assign(this.#apply.data, applyParts(parts));
        const types = [...parts.map((p) => p.t), ...(last.poison && last.poisonRoll ? ["poison"] : [])];
        return `<div class="rdres"><div class="rdrow"><div class="rdice">${chips}</div>`
          // «Завдати цілям» in the same row as the total, on its right; it wraps under it only when there is no room
          // (author, 2026-11-15)
          + `<div class="rsum rdsum"><b class="rtot dt-${wt}">${total}</b><span class="rform">шкоди</span><span class="dtchips">${typeChips(types.length ? types : [wt])}</span></div>${applyBtn}</div>`
          + (fx.length ? `<ul class="rdfx">${fx.map((t) => `<li>${t}</li>`).join("")}</ul>` : "")
          + (parts.length > 1 ? `<p class="rdbrk">${parts.map((p) => `${p.l}: <b class="dt-${p.t}">${p.v}</b>`).join(" · ")}</p>` : "");
      },
    );
  }

  /**
   * The panel keeps its scroll through a re-render (author, 2026-11-15: «Кинути шкоду» threw it back to the top); after
   * «Кинути перевірку» it scrolls on to show the result. Both possible scrollers are kept: the roller (docked panel)
   * and the window's content (the panel in its own window).
   */
  #scrolls = null;
  #toResult = false;
  _preRender(context, options) {
    const el = this.element;
    if (el) this.#scrolls = { roller: el.querySelector(".pust-roller")?.scrollTop ?? 0, win: el.querySelector(".window-content")?.scrollTop ?? 0 };
    return super._preRender(context, options);
  }
  #restoreScroll() {
    const el = this.element, k = this.#scrolls;
    if (!el || !k) return;
    const r = el.querySelector(".pust-roller"), w = el.querySelector(".window-content");
    if (r) r.scrollTop = k.roller;
    if (w) w.scrollTop = k.win;
    if (this.#toResult) {
      const res = el.querySelector(".pust-roller .rres");
      if (res) res.scrollIntoView({ block: "nearest" });
      // an attack: on down to «Завдати шкоди», clear of the roll strip stuck to the bottom (playtest 2026-11-18, item 4;
      // css/pust-check.css scroll-margin)
      el.querySelector('.pust-roller .rres button[data-r="dmg"]')?.scrollIntoView({ block: "nearest" });
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#restoreScroll();
    requestAnimationFrame(() => { this.#restoreScroll(); this.#toResult = false; this.#scrolls = null; });
    const root = this.element.querySelector(".pust-roller");
    // «?» (author, 2026-11-17): the tour «Зробити перевірку» in «Довідка Foundry», at the result once there is one
    if (!this.actor.pustTourDemo) addHelpButton(this, () => ["pl-check", this.element.querySelector(".rres") ? "result" : "attr"]);
    // the ready checks may be dragged to the hotbar (helpers/macros.mjs; author, 2026-11-17)
    if (!this.actor.pustTourDemo) root.querySelectorAll('button[data-r="preset"], button[data-r="xpreset"]').forEach((b) => {
      hotbarDraggable(b, { kind: b.dataset.r, actor: this.actor.uuid, label: b.textContent.trim() });
      if (!b.title) b.title = "Перетягни на панель макросів, щоб відкривати цю перевірку звідти";
    });
    // invoking an aspect right under the result's description, before the attack effects and the damage (author, 2026-11-16);
    // the button «Викликати аспект: +1d10» with its own icon
    const res = root.querySelector(":scope > .rres"), asp = res?.querySelector(":scope > .rasp");
    const after = res?.querySelector(":scope > .rdesc") ?? res?.querySelector(":scope > .rverd");
    if (asp && after) after.after(asp);
    const inv = asp?.querySelector(':scope > button[data-r="aspect"]');
    if (inv && !inv.querySelector("i")) inv.insertAdjacentHTML("afterbegin", '<i class="fa-solid fa-wand-magic-sparkles"></i>');
    // «Без Припасів» (П2): kept for the next roll of this character's panel
    root.addEventListener("change", (ev) => {
      const t = ev.target.closest?.("[data-hxfree]");
      if (!t) return;
      if (t.checked) HEAL_FREE.add(this.actor.uuid); else HEAL_FREE.delete(this.actor.uuid);
    });
    root.addEventListener("click", async (ev) => {
      const fa = ev.target.closest("[data-fx-apply]");
      if (fa) {
        ev.preventDefault();
        if (fa.disabled) return;
        if (!game.user.targets.size) return notify.warn(NO_TARGETS);
        fa.disabled = true;
        const ok = await sendEffects(this.#fxData(true), { head: `${this.actor.name}: ефект атаки`, source: this.#ownToken() });
        if (ok) { this.#fx.done = "applied"; this.render(); } else fa.disabled = false;
        return;
      }
      const ps = ev.target.closest("[data-pend-send]");
      if (ps) {
        ev.preventDefault();
        if (ps.disabled || !this.#sent) return;
        ps.disabled = true;
        const { L } = evaluate(this.actor);
        const v = this.#load(L).last?.verdict;
        if (Number.isInteger(v)) await answerPending(this.#sent.msg, this.#sent.row, { op: "rolled", verdict: v });
        ps.disabled = false;
        return;
      }
      const hx = ev.target.closest("[data-hx]");
      if (hx) { ev.preventDefault(); if (!hx.disabled) this.#healthPress(hx); return; }
      const nb = ev.target.closest("[data-near]");
      if (nb) {
        ev.preventDefault();
        const item = this.#near[+nb.dataset.near];
        if (!item || nb.disabled) return;
        nb.disabled = true;
        // the free invoke is spent first (the GM writes what the user doesn't own); only then the die (Fable, 2026-11-21)
        if (await spendNearby(item)) this.#run("click", { tagName: "BUTTON", dataset: { r: "nearasp" }, src: { label: `аспекту «${item.name}» (${item.where})`, use: () => {}, msg: `Аспект «${item.name}» (${item.where}): безкоштовне Посилення використано.` } });
        else nb.disabled = false;
        return;
      }
      const pa = ev.target.closest("[data-pend-apply]");
      if (pa) {
        ev.preventDefault();
        if (pa.disabled || !this.#pend) return;
        pa.disabled = true;
        await answerPending(this.#pend.msg, this.#pend.row, { op: "apply" });
        return;
      }
      // «Щасливець: +1 ступінь», «Бісова штуковина!: перекинути»
      const pk = ev.target.closest("[data-perkre]");
      if (pk) {
        ev.preventDefault();
        if (pk.disabled) return;
        pk.disabled = true;
        const id = pk.dataset.perkre;
        await this.#run("click", { tagName: "BUTTON", dataset: id === "kick" ? { r: "roll", perkre: "kick" } : { r: "luck", perkre: "lucky" } });
        return;
      }
      // A8: the split's −/+ and «Завдати розподілену шкоду»
      const sd = ev.target.closest("[data-split-d]");
      if (sd) {
        ev.preventDefault();
        const s = SPLIT.get(this.actor.uuid);
        if (!s || s.sent || sd.disabled) return;
        const u = sd.dataset.u, step = Number(sd.dataset.splitD) || 0;
        if (step > 0 && splitLeft(s.shares, s.total) <= 0) return;
        s.shares[u] = clampShare((s.shares[u] ?? 0) + step, s.total);
        this.#splitRedraw(root, s);
        return;
      }
      const sg = ev.target.closest("[data-split-go]");
      if (sg) { ev.preventDefault(); this.#splitSend(root, sg); return; }
      const ap = ev.target.closest("[data-apply]");
      if (ap) {
        ev.preventDefault();
        if (!this.#apply || ap.disabled) return;
        ap.disabled = true;
        try { await sendDamage(this.#hitData(), { partial: this.#apply.partial, head: this.#apply.head, source: this.#ownToken() }); } finally { ap.disabled = false; }
        return;
      }
      const b = ev.target.closest("[data-r]");
      if (!b || b.tagName === "SELECT" || b.tagName === "INPUT" || b.disabled) return;
      ev.preventDefault();
      if (b.classList.contains("pust-skchip") || b.classList.contains("pust-stdb")) PICKED.delete(this.actor.uuid);
      if (b.classList.contains("pust-wchip")) { if (!b.classList.contains("pust-pick")) this.#run("change", b); return; } // the weapon chips stand for the list
      if (b.classList.contains("pust-skchip")) { if (!b.classList.contains("pust-pick")) this.#run("change", b); return; } // the skill chips too
      // «Стандартні дії» stand for the list «Вид перевірки»: the same change; the pressed one again → «Звичайна перевірка»
      if (b.classList.contains("pust-stdb")) { this.#run("change", { tagName: "SELECT", dataset: { r: "type" }, value: b.classList.contains("on") ? "gen" : b.value }); return; }
      // the pressed ready check (П1 1.3): a ready check presses itself; a hand-picked attribute, skill or type lets it go
      if (["preset", "xpreset"].includes(b.dataset.r)) PICKED.set(this.actor.uuid, pickedKey(evaluate(this.actor).L, b.dataset.r, b.dataset.v));
      else if (["attr", "skill", "type"].includes(b.dataset.r)) PICKED.delete(this.actor.uuid);
      if (b.dataset.r === "roll") this.#setupOpen = false; // a new result: the set-up folds again
      if (b.dataset.r === "dmg" && !game.user.targets.size) return notify.warn(NO_TARGETS);
      // A8: the fold open and two targets or more — this roll waits for the split
      if (b.dataset.r === "dmg") this.#splitPress = !!root.querySelector("details.pust-split[open]:not([hidden])") && game.user.targets.size >= 2;
      this.#run("click", b);
    });
    this.#fastLayout(root);
    syncChatMode(this.element);
    syncDealButton(root);
    // 10–14: the effect applied instead of the damage — no damage after it (A2; the wiki: «завдай шкоди або обери ефект»)
    if (this.#fx.done) root.querySelectorAll('button[data-r="dmg"]').forEach((x) => { x.disabled = true; x.title = "Замість шкоди вже обрано ефект"; });
    // the damage is dealt with its roll: the options over it (Психо, the effect, the crit) are set before it, then locked
    // and so is the weapon (author, 2026-11-17)
    const { L: Ln } = evaluate(this.actor);
    const lastNow = this.#load(Ln).last, spl = this.#splitNow(lastNow);
    if (root.querySelector(".rdmg .rdres")) root.querySelectorAll(".rdmg .rdopts input, .rdmg .rdopts select, .rdmg .pust-wchip").forEach((i) => { i.disabled = true; i.title = spl && !spl.sent ? "Шкоду вже кинуто: розподіли її між цілями нижче" : "Шкоду вже кинуто й завдано"; });
    // A8: the split's rows under the rolled damage; a split left behind by a new roll is said once, nothing dealt
    if (spl) root.querySelector(".rdmg")?.insertAdjacentHTML("beforeend", this.#splitRows(spl));
    else {
      const old = SPLIT.get(this.actor.uuid);
      if (old && !old.sent && lastNow?.dmg?.time !== old.time) { SPLIT.delete(this.actor.uuid); notify.warn("Розподілену шкоду не завдано: новий кидок скасував розподіл."); }
    }
    root.addEventListener("toggle", (ev) => { if (ev.target.matches?.("details.pust-split")) this.#splitOpen = ev.target.open; }, true);
    root.addEventListener("change", (ev) => {
      const fx = ev.target.closest("input[data-fx]");
      if (fx) { this.#fxPick(fx.dataset.fx, fx.checked); return; }
      const al = ev.target.closest("select[data-fx-ally]");
      if (al) { this.#fx.ally = al.value; return; }
      const one = ev.target.closest("select[data-fx-one]");
      if (one) {
        this.#fx.one = one.value;
        // A8: a split waiting — its rows say again whether the effect's target gets damage
        const s = SPLIT.get(this.actor.uuid);
        if (s && !s.sent) this.#splitRedraw(root, s);
        return;
      }
      // A8: a share typed by hand
      const sv = ev.target.closest("input[data-split-v]");
      if (sv) {
        const s = SPLIT.get(this.actor.uuid);
        if (s && !s.sent) { s.shares[sv.dataset.u] = clampShare(sv.value, s.total); this.#splitRedraw(root, s); }
        return;
      }
      const t = ev.target.closest("[data-r]");
      if (t && ["attr", "skill", "type"].includes(t.dataset.r)) PICKED.delete(this.actor.uuid);
      if (t) this.#run("change", t);
    });
  }

  /**
   * The fast roll (author, 2026-11-18, mockup А): the attributes and the skill on top, then the ready checks, the check type
   * and the counters (the order is CSS, `order` in css/pust-check.css); the skill as buttons of «без навички» and the skills
   * the character has (the list stays, hidden: its change handler is the one used); «Кинути перевірку» in a strip stuck to
   * the bottom with what is rolled; after a roll the set-up folds into one line «змінити».
   */
  #setupOpen = false;
  #addict = { pen: 0, flat: 0 };
  #types = {};
  #fastLayout(root) {
    // «Стандартні дії» instead of the list «Вид перевірки» (author, 2026-11-18; playtest item 1, mockup А): a row like the ready
    // checks', over «Атаки»; a button sets only how the result reads (the list's change: attribute and skill stay), the pressed
    // one pressed again goes back to «Звичайна перевірка». The list stays, hidden: the strip, the fold line and the targets'
    // hint read the type from it. The ready checks still set their own type (none of the three is pressed then)
    const typeSel = root.querySelector("select#r-type");
    const typeGrp = typeSel?.closest(".rgrp");
    if (typeGrp) {
      typeGrp.style.display = "none";
      const btns = ["overcome", "advantage", "learn"].filter((k) => this.#types[k]).map((k) => {
        const on = typeSel.value === k, T = this.#types[k];
        return `<button type="button" class="chipb pust-stdb${on ? " on" : ""}" data-r="type" value="${k}" aria-pressed="${on}" title="${esc(T.i || "")}${on ? " Натисни ще раз, щоб повернути звичайну перевірку." : ""}">${esc(T.n)}</button>`;
      });
      const row = `<div class="rpre rgr pust-std" role="group" aria-label="Стандартні дії"><span class="rl">Стандартні дії</span>${btns.join("")}</div>`;
      const first = root.querySelector(":scope > .rpre.rgr");
      if (first) first.insertAdjacentHTML("beforebegin", row);
      else typeGrp.insertAdjacentHTML("beforebegin", row);
    }
    // the pressed ready check (author, 2026-11-22, П1 1.3): a steel plate with amber text, as in «Стандартні дії»
    const pk = PICKED.get(this.actor.uuid);
    if (pk) {
      const { L: kL } = evaluate(this.actor);
      root.querySelectorAll('button[data-r="preset"], button[data-r="xpreset"]').forEach((b) => {
        const on = pickedKey(kL, b.dataset.r, b.dataset.v) === pk;
        b.classList.toggle("on", on);
        b.setAttribute("aria-pressed", String(on));
      });
    }
    // the ready check's hint (R.hint, right before the attributes) goes with «Вид перевірки»; the other notes (.rhint of
    // poison, chems, «Воно саме виходить») stay with the automatic conditions
    const th = root.querySelector(":scope > .rgrp:has(.rats)")?.previousElementSibling;
    if (th?.matches("p.rhint")) th.classList.add("pust-typehint");
    // the skill: buttons instead of the list
    const sel = root.querySelector("select#r-skill");
    if (sel) {
      sel.hidden = true;
      const chips = [...sel.options].filter((o) => !o.value || !/· немає$/.test(o.textContent) || o.selected).map((o) => {
        const m = /^(.*?) · (\S+) (d\d+)$/.exec(o.textContent.trim());
        const label = o.value ? (m ? `${esc(m[1])} <small>${m[3]}</small>` : esc(o.value)) : "без навички";
        const tip = !o.value ? "Перевірка без навички" : m ? `${m[1]}: ${m[2]}, кістка ${m[3]}` : `${o.value}: у персонажа немає цієї навички`;
        return `<button type="button" class="pust-skchip${o.selected ? " pust-pick" : ""}${o.value && !m ? " pust-none" : ""}" data-r="skill" value="${esc(o.value)}" aria-pressed="${o.selected}" title="${esc(tip)}">${label}</button>`;
      });
      sel.insertAdjacentHTML("afterend", `<div class="pust-skchips" role="group" aria-label="Навичка">${chips.join("")}</div>`);
    }
    // the roll button in its strip, with what is rolled
    const go = root.querySelector(":scope > .rgo");
    if (go) {
      const bar = document.createElement("div");
      bar.className = "pust-rgo-bar";
      go.before(bar);
      const note = Date.now() < this.#replaceUntil
        ? `<small class="pust-replace-note" role="status"><i class="fa-solid fa-triangle-exclamation"></i> Шкоду чи ефект атаки ще не застосовано. Відкрий цю перевірку ще раз протягом 3 секунд, щоб замінити результат.</small>` : "";
      bar.innerHTML = `<div class="pust-intent"><b>${esc(this.#intent(root))}</b><small class="pust-tgthint" hidden>${esc(NO_TARGETS)}</small>${note}</div>`;
      bar.append(go);
    }
    // after a roll: the set-up folds (not in the tour's example, whose steps show the set-up)
    const res = root.querySelector(":scope > .rres");
    // the tour's example folds too (author, 2026-11-22, П1 1.6: it showed the old look); its set-up steps use the stage «setup»
    if (res && !this.actor.pustTourDemo) {
      root.classList.toggle("pust-folded", !this.#setupOpen);
      // folded (author, 2026-11-22, П1 1.1): no rolling the same check again — the strip has «Інша перевірка» in place of
      // «Кинути перевірку» (narrow, rust): it opens the set-up with Посилення / Послаблення / Модифікатор from 0; only
      // «Бісова штуковина!» rerolls («перекинути»). The fold line keeps only what was rolled
      if (!this.#setupOpen && go) {
        go.hidden = true;
        // «Щасливець» and «Бісова штуковина!» (author, 2026-11-21, mockup 3): small buttons left of it, while the perk is unused
        const { st: pst, L: pL } = evaluate(this.actor);
        const plast = this.#load(pL).last, perks = compute(pst).allPerks || [], pc = pst.chem || {};
        const btn = (id, html, tip) => `<button type="button" class="btn sm pust-perkre" data-perkre="${id}" title="${esc(tip)}">${html}</button>`;
        const perkBtns = (luckOffer(plast, perks, isUsed(USE_BY_ID.lucky, pc))
          ? btn("lucky", "Щасливець<br>+1 ступінь", "Щасливець, раз за сесію: підвищити результат цієї перевірки на один ступінь. ОД за невдачу тоді не буде.") : "")
          + (kickOffer(plast, perks, isUsed(USE_BY_ID.kick, pc))
            ? btn("kick", "Бісова штуковина!<br>перекинути", "Бісова штуковина!, раз за сцену: повністю перекинути цю перевірку зламу замка чи комп'ютера (гучно). Рахується лише новий кидок: ОД за цей забирається.") : "");
        const other = `<button type="button" class="btn sm pust-other" title="Інша перевірка: атрибут, навичка, вид перевірки; Посилення, Послаблення й модифікатор знову з нуля"><i class="fa-solid fa-rotate"></i>Інша перевірка</button>`;
        go.insertAdjacentHTML("beforebegin", perkBtns + other);
        go.parentElement.querySelector(".pust-other").addEventListener("click", () => {
          this.#setupOpen = true;
          const R = STATES.get(this.actor.uuid);
          if (R) Object.assign(R, { boost: 0, pen: 0, mod: 0 });
          this.render();
        });
      }
      // the fold line: the check type as its own plate, then what is rolled; «сховати» only while the set-up is open
      // (author, 2026-11-22, П1 answer 4: back to the result without a roll)
      const { type, rest } = this.#intentParts(root);
      const f = document.createElement(this.#setupOpen ? "button" : "div");
      f.className = "pust-fold";
      f.innerHTML = `<span>${type ? `<em class="pust-fold-type">${esc(type)}</em>` : ""}${esc(rest)}</span>`
        + (this.#setupOpen ? `<b>сховати <i class="fa-solid fa-chevron-up"></i></b>` : "");
      if (this.#setupOpen) {
        f.type = "button";
        f.setAttribute("aria-expanded", "true");
        f.title = "Сховати налаштування перевірки й повернутися до результату";
        f.addEventListener("click", () => { this.#setupOpen = false; this.render(); });
      }
      root.querySelector(":scope > .rwho")?.after(f);
    }
  }

  /** The fold line's two parts: the check type, and the rest of what is rolled */
  #intentParts(root) {
    const type = root.querySelector("select#r-type")?.selectedOptions[0]?.textContent.trim() || "";
    const all = this.#intent(root);
    return { type, rest: type && all.startsWith(type) ? all.slice(type.length).replace(/^ · /, "") : all };
  }

  /** What is rolled, read from the panel: «Атака · СПР +1 + Стрільба d6 · Посилень: 1» */
  #intent(root) {
    const type = root.querySelector("select#r-type");
    const at = root.querySelector(".rat.on");
    const sk = root.querySelector("select#r-skill");
    const m = sk?.value ? /^(.*?) · (?:\S+ (d\d+)|немає)$/.exec(sk.selectedOptions[0]?.textContent.trim() || "") : null;
    const num = (r) => Number(root.querySelector(`.rstep:has(button[data-r="${r}"]) output`)?.textContent.replace("−", "-")) || 0;
    // the automatic conditions ticked under the counters and an unsatisfied addiction count as doRoll counts them
    let autoPen = this.#addict.pen || 0, autoFlat = this.#addict.flat || 0;
    for (const i of root.querySelectorAll('.ramods input[data-r="am"]:checked')) {
      const b = i.closest("label")?.querySelector("b")?.textContent || "";
      autoFlat += Number(/[+−-]\d+/.exec(b)?.[0].replace("−", "-")) || 0;
      if (/Послаблення/.test(b)) autoPen += 1;
    }
    const net = Math.min(2, num("boost")) - Math.min(2, num("pen") + autoPen);
    const mod = num("mod") + autoFlat;
    return [
      type?.selectedOptions[0]?.textContent.trim(),
      [at ? `${at.querySelector("b")?.textContent} ${at.querySelector("span")?.textContent}` : "", sk?.value ? `${sk.value}${m?.[2] ? ` ${m[2]}` : ""}` : ""].filter(Boolean).join(" + "),
      net > 0 ? `Посилень: ${net}` : net < 0 ? `Послаблень: ${-net}` : "",
      mod ? `мод. ${sgn(mod)}` : "",
    ].filter(Boolean).join(" · ");
  }

  /** Run one of the HTML panel's handlers on the character, save, then post what was rolled */
  async #run(kind, el) {
    const key = el.dataset.r;
    // a plain copy of what the handlers read from the element
    const node = { tagName: el.tagName, dataset: { ...el.dataset }, value: el.value, checked: el.checked };
    // healing and repair need something to pay with before the roll (wiki «Відновлення ОЗ…»); the patient is chosen and the
    // payment taken only when the result is applied (П2, author 2026-11-22); «Без Припасів» lets it go without
    const healFree = HEAL_FREE.has(this.actor.uuid);
    if (kind === "click" && key === "roll") {
      const { L } = evaluate(this.actor);
      const why = healGate(this.actor, this.#load(L).type, healFree);
      if (why) return notify.warn(why);
    }
    let out;
    const fdWas = fateSnap(this.actor); // an aspect invoked with a Fate token posts a card (author, 2026-11-15)
    const supWas = supSnap(this.actor); // a Припас spent by a check («Автоматний псих»…) too
    // the roar's «−2 до наступної перевірки» (author, 2026-11-20): counted in this roll, then its aspect goes; the engine isn't
    // touched — the −2 rides on R.mod for the roll only and is shown among the automatic conditions
    const pen = kind === "click" && key === "roll" ? checkPenalty(this.actor) : null;
    let penUsed = false;
    // «Прикриваєш спільника» (A2): +1 Посилення on this character's next avoidance in the round it was given, then it goes
    const cover = kind === "click" && key === "roll" ? this.#cover() : null;
    // «Щасливець» / «Бісова штуковина!»: the perk's mark and card (perk-uses.mjs), the replaced roll's ОД gone
    const perkId = kind === "click" ? el.dataset?.perkre || "" : "";
    let perkRes = null;
    if (kind === "click" && ["aspect", "modasp", "sitasp", "nearasp", "luck"].includes(key) || perkId) {
      const { L } = evaluate(this.actor);
      if (this.#load(L).last?.hx) { notify.warn("Результат уже застосовано: змінити його не можна."); return this.render(); }
      if (key === "sitasp" && isCoverText(this.actor.system?.situational?.[+el.dataset?.v]?.name)) { notify.warn("Прикриття діє лише на уникнення шкоди."); return this.render(); }
    }
    await runAction(this.actor, (st, L) => {
      const R = this.#load(L);
      const t0 = R.last?.time;
      if (perkId) {
        const ok = perkId === "kick" ? kickOffer(R.last, compute(st).allPerks) : luckOffer(R.last, compute(st).allPerks);
        perkRes = ok ? usePerk(st, L, perkId) : { ok: false, msg: "Цей перк тут не діє." };
        if (!perkRes.ok) { notify.warn(perkRes.msg); out = null; return; }
        if (perkId === "kick") dropRollXp(st, R.last); // only the new roll's ОД count (author, 2026-11-21)
      }
      if (pen) R.mod = (+R.mod || 0) + pen.n;
      const coverOn = cover && R.type === "dodge";
      if (coverOn) R.boost = (+R.boost || 0) + 1;
      // the damage as it stands (to post the new result when an option changes it: Психо, effect, crit…)
      const dmgNow = () => (R.last?.dmg && R.last.dmg.key === R.dmgKey ? JSON.stringify(L.dmgTotal(R.last, compute(st))) : null);
      const before = { last: clone(R.last), dmg: dmgNow() };
      // «Мастак-ремонтник»: +1 to «Ремонт» (wiki «Перки»), named among the automatic conditions as the roar's −2 is
      const fixer = kind === "click" && key === "roll" && R.type === "repair" && compute(st).allPerks.includes("Мастак-ремонтник");
      if (fixer) R.mod = (+R.mod || 0) + 1;
      // A10: an ОД button of a roll whose ОД the panel already added does nothing; the button shows only when it did not
      // (a roll from before «ОД за невдачу» was turned on, a tour's demo): then it adds the ОД as before (reviewer, 2026-11-21)
      const xpBtn = kind === "click" && key === "xp" && xpAutoGiven(R.last, node?.dataset?.k);
      if (kind === "click" && key === "nearasp") L.invokeAspect(el.src); // «Аспекти поруч»: the invoke already spent
      else if (xpBtn) { /* already added */ }
      else if (kind === "click") L.rollerClick(node);
      else L.rollerChange(node);
      // the ОД this roll gives, again after every action (an aspect that turns a failure takes it back; tours never)
      // only a new roll or one that already got its ОД (an old roll from before the setting was on stays as it was)
      if (autoXpOn() && !this.actor.pustTourDemo && R.last && (R.last.time !== t0 || R.last.xpAuto || perkId === "lucky")) reconcileAutoXp(st, R.last, compute(st).allPerks);
      if (perkId === "lucky" && R.last?.luckUp) R.last.autoList = [...(R.last.autoList || []), "Щасливець: +1 ступінь"];
      if (fixer) {
        R.mod = (+R.mod || 0) - 1;
        if (R.last && R.last.time !== t0) { R.last.mod -= 1; R.last.autoFlat = (R.last.autoFlat || 0) + 1; R.last.autoList = [...(R.last.autoList || []), "Мастак-ремонтник +1"]; }
      }
      // П2: nothing is paid with the roll; «Без Припасів» rides on the new roll (one roll)
      if (kind === "click" && key === "roll" && R.last && R.last.time !== t0 && HEAL_TYPES.includes(R.last.type)) {
        if (healFree) R.last.free = true;
        HEAL_FREE.delete(this.actor.uuid);
      }
      if (coverOn) {
        R.boost = (+R.boost || 0) - 1;
        if (R.last && R.last.time !== t0) {
          // the cover's one invoke is spent: its aspect goes with this roll (the oldest, as #cover showed it)
          const c = activeCover(st.sit);
          if (c) st.sit.splice(c.i, 1);
          R.last.autoList = [...(R.last.autoList || []), `Посилення: «${cover.t}», аспект знято`];
        }
      }
      if (pen) {
        R.mod = (+R.mod || 0) - pen.n;
        if (R.last && R.last.time !== t0) {
          // the same total; the −2 is named as a condition, not a bare «мод.»
          R.last.mod -= pen.n;
          R.last.autoFlat = (R.last.autoFlat || 0) + pen.n;
          R.last.autoList = [...(R.last.autoList || []), `«${pen.aspect}» −${-pen.n}, аспект знято`];
          penUsed = true;
        }
      }
      this.#save(L);
      const dmgChoice = R.last?.dmg ? L.dmgChoices(compute(st)).find((x) => x.key === R.last.dmg.key) : null;
      const dmgType = weaponDmgType(dmgChoice);
      const dmgFx = dmgChoice ? damageEffects(L.weaponTraits(dmgChoice, attackMode(R.last.skillName, R.last.attr), compute(st)), dmgChoice, termTypes(dmgChoice, R.last.dmg.p, dmgType)) : [];
      const after = dmgNow();
      out = { before, R: clone(L.R), dmgTotal: R.last?.dmg ? L.dmgTotal(R.last, compute(st)) : null, dmgType, dmgFx, dmgChoice, verdicts: L.VERDICTS, types: L.CHECK_TYPES,
        dmgChanged: !!(before.dmg && after && before.dmg !== after && before.last?.dmg?.time === R.last.dmg.time) };
    }, { toast: PANEL_TOAST });
    if (perkId && !perkRes?.ok) return this.render();
    if (perkRes?.ok) await postChat({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), content: perkCardHtml(this.actor.name, perkRes, PER[USE_BY_ID[perkId]?.per]?.cls || "free") });
    await postFateIfChanged(this.actor, fdWas);
    await postSupIfChanged(this.actor, supWas);
    if (penUsed) await spendCheckStates(this.actor);
    // the targets go once the result no longer needs them (author, 2026-11-22, П1 1.4, answer А): a plain check or an avoidance
    // at once, an attack on a failure (its damage or effect clears them as before); healing and repair keep theirs (П2)
    if (kind === "click" && ["roll", "aspect", "modasp", "sitasp", "nearasp", "luck"].includes(key) && out?.R?.last
      && !keepTargets(out.R.last, this.#fx.time === out.R.last.time && !!this.#fx.done)) clearTargets();
    this.#toResult = kind === "click" && key === "roll"; // «Кинути перевірку»: the result comes into view
    // an avoidance answering an enemy's attack (A1): the row is chosen now, before the render shows the new roll
    const nl = out.R.last, ol = out.before.last;
    const dodged = nl?.type === "dodge" && (nl.time !== ol?.time || nl.verdict !== ol?.verdict);
    const fresh = dodged && nl.time !== ol?.time; // a new roll (not an aspect invoked on the last one) may answer a newer attack
    const target = dodged ? this.#pendNow(out.R, fresh) : null;
    if (target?.row && !rowClosed(target.row)) { this.#sent = { ...this.#pend }; this.#sending = true; }
    const deal = kind === "click" && key === "dmg";
    if (deal) await this.render(); // the damage to deal (#apply) is made by the render
    else this.render();
    const msg = kind === "click" && CHAT_ON.has(key) ? await this.#post(key, out) : null;
    if (deal) await waitDice(msg); // the damage is dealt once the 3D dice have landed (author, 2026-11-19)
    // an avoidance answering an enemy's attack (A1): its verdict goes to the card once the dice have landed; an aspect invoked
    // after it sends the new one (15+ closes the row by itself, author 2026-11-20)
    if (this.#sending && this.#sent) {
      const to = this.#sent;
      try { await waitDice(msg); await answerPending(to.msg, to.row, { op: "rolled", verdict: nl.verdict }); }
      finally { this.#sending = false; if (this.rendered) this.render(); }
    }
    // «Завдати шкоди»: the rolled damage goes to the targets at once (author, 2026-11-17)
    // A8: with the fold open the roll waits for the split (one type only: a hit of several types is dealt in full, as before)
    if (deal && this.#apply && out.R.last?.dmg && this.#splitPress && !this.#apply.data.parts) { this.#splitPress = false; this.#startSplit(out.R.last.dmg); this.render(); }
    else if (deal && this.#apply && out.R.last?.dmg) {
      // the fold was open, but the rolled damage came out of several types: dealt in full, and said so (reviewer, 2026-11-21)
      if (this.#splitPress) notify.warn("Шкода вийшла кількох типів, тож розподілити її не вийде: кожна ціль отримує її повністю.");
      this.#splitPress = false; await sendDamage(this.#hitData(), { partial: this.#apply.partial, head: this.#apply.head, source: this.#ownToken() }); }
    // an option changed the damage already rolled (Психо, effect, crit, robot…): the new result goes to chat too
    else if (out.dmgChanged) await this.#chatDamage(out.R.last, out.dmgTotal, false, out.dmgType, true, out.dmgFx, out.dmgChoice, out.before.last?.dmg?.extra ?? null);
  }

  async #post(key, { before, R, dmgTotal, dmgType, dmgFx, dmgChoice, verdicts, types }) {
    const L = R.last;
    if (key === "luck" && L) return this.#chatCheck(L, verdicts, types, false, before.last, "Щасливець");
    if (["roll", "aspect", "modasp", "sitasp", "nearasp"].includes(key) && L) {
      if (key !== "roll" && JSON.stringify(L) === JSON.stringify(before.last)) return; // nothing invoked
      return this.#chatCheck(L, verdicts, types, key !== "roll", before.last);
    }
    if ((key === "dmg" || key === "dmgre") && L?.dmg && dmgTotal) return this.#chatDamage(L, dmgTotal, key === "dmgre", dmgType, false, dmgFx, dmgChoice);
  }

  /* ---------- chat ---------- */

  #chat(content, rolls = null, flags = null) {
    return postChat({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="pust-chat">${content}</div>`,
      ...(flags ? { flags: { [game.system.id]: flags } } : {}),
    }, { dice: true, rolls });
  }

  /** `before`: R.last before the press (an aspect: only its new die is thrown in 3D) */
  #chatCheck(last, verdicts, types, aspect, before = null, why = "") {
    const T = types[last.type];
    // as in the panel: counted — lit, replaced by the skill or aspect die — dimmed, dropped by Посилення / Послаблення — crossed out
    const chosen = new Set((last.slots || []).filter((s) => s.src === "base").map((s) => s.i));
    const dice = last.dice.map((v, i) => {
      const [cls, tip] = chosen.has(i) ? ["kept", "Враховано"] : last.keep.includes(i) ? ["swapped", "Замінено"] : ["drop", "Відкинуто"];
      return `<span class="die d10 ${cls}" title="${tip}">${v}</span>`;
    }).join(" ");
    const skill = last.skill ? ` · ${esc(last.skillName)} d${last.skill.sides}: <span class="die d${last.skill.sides} ${last.skill.replaced ? "kept" : "drop"}" title="d${last.skill.sides}">${last.skill.v}</span>` : "";
    const asp = last.aspect ? ` · аспект: <span class="die d10 ${last.aspect.replaced ? "kept" : "drop"}">${last.aspect.v}</span>` : "";
    const mods = [`${ASHORT[last.attr]} ${sgn(last.attrVal)}`, last.mod ? `мод. ${sgn(last.mod)}` : "", ...(last.autoList || [])]
      .filter(Boolean).map(esc).join(", ");
    const boost = last.net > 0 ? ` · Посилень: ${last.net}` : last.net < 0 ? ` · Послаблень: ${-last.net}` : "";
    // the result as in «Зробити перевірку»: a screen with the total, the verdict and its range lit (≤9 · 10–14 · 15–16 · 17+)
    const v = last.verdict;
    const ci = last.ci || { t: 17 };
    const ranges = ["≤9", "10–14", `15–${ci.cursed ? "…" : ci.t - 1}`, ...(ci.cursed ? [] : [`${ci.t}+`])];
    const lit = ranges.map((r, i) => `<span class="${i === v ? `hit v${v}` : ""}">${r}</span>`).join("");
    return this.#chat(
      `<h4>${esc(T?.n || "Перевірка")}: ${esc(ASHORT[last.attr])}${last.skillName ? ` + ${esc(last.skillName)}` : ""}${aspect ? " — виклик аспекту" : why ? ` — ${esc(why)}` : ""}</h4>`
      + `<div class="pust-cres v${v}">`
      + `<b class="rvhead">${esc(verdicts[v])}</b>`
      + `<div class="rverd"><b class="rtot">${last.total}</b><span class="rranges">${lit}</span></div>`
      + `<p class="pust-cbreak">${dice}${skill}${asp}${boost} · ${mods}</p>`
      + (T?.d?.[v] ? `<p class="rdesc">${esc(T.d[v])}</p>` : "")
      // A10: the ОД the panel added by itself («ОД за невдачу»)
      + ((last.xpAuto?.fail || 0) + (last.xpAuto?.sav || 0) ? `<p class="pust-cxp"><i class="fa-solid fa-medal"></i> +${(last.xpAuto.fail || 0) + (last.xpAuto.sav || 0)} ОД в аркуш</p>` : "") + `</div>`,
      why ? null : rollList(rollFromDice(aspect ? checkDiceGroups(last, before) : checkDiceGroups(last))),
      // U4 (author, 2026-11-21): the GM's side reads it — «Зроби хід проти X» when the result asks for a move
      { check: checkFlag({ actor: this.actor.uuid, name: this.actor.name, type: last.type, typeName: T?.n || "Перевірка", verdict: v, verdictName: verdicts[v], total: last.total, time: last.time, text: T?.d?.[v] ?? "" }) },
    );
  }

  /** `prevExtra`: the extra d6 before an option changed the damage («Шкода (оновлено)»: only the new ones are thrown) */
  #chatDamage(last, t, reroll, wt, updated = false, fx = [], choice = null, prevExtra = undefined) {
    const dm = last.dmg;
    const groups = damageDiceGroups(last, t.parts, dieSides(dm.p), { prevExtra: updated ? prevExtra ?? null : undefined, poisonSides: poisonSidesOf(last.poison?.dice) });
    let parts = (t.parts || []).map(([l, v]) => ({ l, v, t: partType(l, wt) }));
    const best = dm.r2 && dm.r2.sum > dm.r1.sum ? dm.r2 : dm.r1;
    if (!/^Максимум/.test(parts[0]?.l || "")) parts = splitDiceParts(parts, choice, dm.p, wt, best?.vals);
    return postDamageCard(this.actor, {
      head: `Шкода${reroll ? " (перекинуто)" : updated ? " (оновлено)" : ""}: ${dm.name} (${dm.dstr})`,
      wt, total: t.total, parts, fx, poison: last.poison && last.poisonRoll ? last.poisonRoll : null, spent: dm.spent,
      rolls: rollList(rollFromDice(groups)),
    });
  }

  async close(options) {
    OPEN.delete(this.actor.uuid);
    return super.close(options);
  }
}

/* ---------- the players' «Зробити перевірку» next to «Лічильники + Кістки» (author, 2026-11-14) ---------- */

let DOCKED = null;
let dockActorId = null; // the character picked in the list (this session)
const DOCK_GAP = 6;

/** The characters this user owns, by name */
const ownCharacters = () => game.actors.filter((a) => a.type === "character" && a.isOwner).sort((a, b) => a.name.localeCompare(b.name, "uk"));

/** The tour's example character for a player without one (author, 2026-11-17; pust-tour.mjs dockDemo): the docked panel
 *  shows it, read-only */
let DOCK_DEMO = null;
export function setDockDemoActor(actor) { DOCK_DEMO = actor ?? null; }

/** The character the panel is for: the one picked, else the user's Player Character, else the first one owned */
function dockActor() {
  const list = ownCharacters();
  const pc = game.user.character;
  return list.find((a) => a.id === dockActorId) ?? (pc && list.includes(pc) ? pc : null) ?? list[0] ?? DOCK_DEMO ?? null;
}

export const dockCheckOpen = () => !!DOCKED?.rendered;

/** Open or close the panel next to the unit at `rect` */
export async function toggleDockCheck(rect) {
  if (DOCKED?.rendered) { await DOCKED.close(); return; }
  const actor = dockActor();
  if (!actor) return notify.warn("У тебе ще немає персонажа.");
  DOCKED = new DockedCheckPanel({ actor });
  DOCKED.anchor = rect;
  await DOCKED.render({ force: true });
}

/** The unit moved: the panel follows */
export function placeDockCheck(rect) {
  if (!DOCKED?.rendered) return;
  DOCKED.anchor = rect;
  DOCKED.stick();
}

/**
 * «Зробити перевірку» without a window of its own: no frame, its own header (the character, or a list of them when the
 * player owns several; ×), right under its button (author, 2026-11-15), above Foundry's players list and hotbar, as tall as the
 * screen allows, scrolling inside.
 */
class DockedCheckPanel extends CheckPanel {
  static DEFAULT_OPTIONS = {
    id: "pust-check-dock",
    classes: ["wastelanders", "pust-check", "pust-check-docked"],
    position: { width: 520, height: "auto" },
    window: { frame: false, positioned: true, resizable: false },
  };

  anchor = null;

  _onRender(context, options) {
    super._onRender(context, options);
    const el = this.element;
    // the tour's example character: shown, nothing can be pressed in it (it is not in the world)
    if (this.actor === DOCK_DEMO) { const r = el.querySelector(".pust-roller"); if (r) r.inert = true; }
    el.querySelector(":scope > .pust-cd-hd")?.remove();
    const list = ownCharacters();
    const hd = document.createElement("header");
    hd.className = "pust-cd-hd";
    const who = list.length > 1
      ? `<select class="pust-cd-who" aria-label="Персонаж для перевірки" title="Чия перевірка">${list.map((a) => `<option value="${a.id}" ${a.id === this.actor.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>`
      : `<b class="pust-cd-name">${esc(this.actor.name)}</b>`;
    hd.innerHTML = `<i class="fa-solid fa-dice-d20"></i><span>Зробити перевірку</span>${who}<button type="button" class="pust-cd-help" title="Довідка" aria-label="Довідка про «Зробити перевірку»"><i class="fa-solid fa-question"></i></button><button type="button" class="pust-cd-x" title="Закрити" aria-label="Закрити"><i class="fa-solid fa-xmark"></i></button>`;
    el.prepend(hd);
    syncChatMode(el); // the strip goes under this header
    hd.querySelector(".pust-cd-help").addEventListener("click", (ev) => {
      ev.currentTarget.blur();
      import("../tours/tours.mjs").then((m) => m.openHelp("pl-check", el.querySelector(".rres") ? "result" : "attr"));
    });
    hd.querySelector(".pust-cd-x").addEventListener("click", () => this.close());
    hd.querySelector(".pust-cd-who")?.addEventListener("change", (ev) => {
      const a = game.actors.get(ev.target.value);
      if (!a) return;
      dockActorId = a.id;
      this.actor = a;
      this.render();
    });
    requestAnimationFrame(() => this.stick());
  }

  /**
   * Where the panel goes (author, 2026-11-15): right under its button «Зробити перевірку», left edges together, never
   * under Foundry's sidebar; as tall as the room down to Foundry's players list / hotbar / the screen's edge allows,
   * scrolling inside (maxH)
   */
  #spot() {
    const r = this.anchor, el = this.element;
    if (!r) return null;
    const w = el?.offsetWidth || 520;
    const side = document.querySelector("#sidebar")?.getBoundingClientRect();
    const right = (side?.left || window.innerWidth) - 8;
    const left = Math.max(8, Math.min(r.left, right - w));
    const top = r.bottom + DOCK_GAP;
    let floor = window.innerHeight - 8;
    for (const sel of ["#players", "#hotbar"]) {
      const b = document.querySelector(sel)?.getBoundingClientRect();
      if (b && b.height && b.left < left + w && b.right > left) floor = Math.min(floor, b.top - 8);
    }
    return { left: Math.round(left), top: Math.round(top), maxH: Math.max(160, Math.floor(floor - top)) };
  }

  stick() {
    const el = this.element, p = this.#spot();
    if (!el || !p) return;
    el.style.maxHeight = `${p.maxH}px`;
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
  }

  /** Foundry's own placing (centred on the first render) is replaced by the place next to the unit */
  _updatePosition(position) {
    const out = super._updatePosition(position);
    const p = this.#spot();
    if (p) Object.assign(out, { left: p.left, top: p.top });
    return out;
  }

  setPosition(position) {
    const out = super.setPosition(position);
    requestAnimationFrame(() => this.stick());
    return out;
  }

  async close(options) {
    const out = await super.close(options);
    document.querySelector("#pust-mapdock .pust-md-check")?.classList.remove("on");
    return out;
  }
}

/**
 * What «Завдати цілям» needs (module/applications/apply-damage.mjs): the total, its type, armour ignored — for a
 * character's weapon read from its effect lines (not the damage type's own line: the type is counted by the rules already)
 */
export function damageData({ total, wt, fx = [], poison = null, emp = false }) {
  const own = fx.filter((x) => !Object.values(TYPE_EFFECTS).includes(x));
  return {
    total: Math.max(0, Number(total) || 0), type: wt, ignoreArmor: own.some((x) => atkIgnores(x)), ignoreN: Math.max(0, ...own.map((x) => atkIgnoreN(x))),
    poison: poison?.sum ?? 0,
    ...(emp ? { empOnly: true } : {}),
  };
}

/**
 * The damage chat card (author, 2026-11-14): the result only — the total with its type chips, the damage effects,
 * the breakdown when there are several parts (each number in its type's colour), the weapon's poison as its own line; no dice.
 */
export function postDamageCard(actor, { head, wt, total, parts, fx = [], poison = null, spent = "", speaker = null, rolls = null }) {
  total = Math.max(0, Number(total) || 0); // damage is never below 0 (author, 2026-11-14)
  const types = [...parts.map((p) => p.t), ...(poison ? ["poison"] : [])];
  return postChat({
    speaker: speaker ?? ChatMessage.getSpeaker({ actor }),
    content: `<div class="pust-chat pust-dmgcard"><h4>${esc(head)}</h4>`
      + `<div class="pust-cdmg dt-${wt}"><div class="rdrow"><span class="rdsum"><b class="rtot dt-${wt}">${total}</b><span>шкоди</span></span>`
      + `<span class="dtchips">${typeChips(types.length ? types : [wt])}</span></div>`
      + (fx.length ? `<ul class="rdfx">${fx.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : "")
      + (parts.length > 1 ? `<p class="rdbrk">${parts.map((p) => `${esc(p.l)}: <b class="dt-${p.t}">${p.v}</b>`).join(" · ")}</p>` : "")
      + (poison ? `<div class="rdrow dt-poison"><span class="rdsum"><b class="rtot dt-poison">+${poison.sum}</b><span>отрутою</span></span></div>` : "")
      + (spent ? `<p class="rnote">${esc(spent)}</p>` : "") + `</div></div>`,
  }, { dice: true, rolls });
}

/**
 * «Шкода» button of a weapon in Мотлох (author, 2026-11-14): no check — the weapon's dice of its damage type are rolled
 * (with the weapon's own bonus) and the result goes to chat like every other damage.
 */
export async function rollWeaponDamage(actor, i) {
  const { st, L } = evaluate(actor);
  const d = compute(st);
  const c = L.dmgChoices(d).find((x) => x.key === `w${i}`);
  if (!c) return;
  const p = L.parseDmg(c.d);
  if (!p) return notify.warn(`Не вдалося розібрати шкоду зброї «${c.name}». Виправ поле «Шкода» у Мотлосі.`);
  const r = L.rollDice(p);
  const wt = weaponDmgType(c);
  const label = p.low ? "менша з 2d6" : p.terms.map((t) => `${t.n}d${t.s}`).join("+");
  let parts = splitDiceParts([{ l: label, v: String(r.sum), t: wt }], c, p, wt, r.vals);
  if (p.flat) parts.push({ l: "Бонус зброї", v: String(p.flat), t: wt });
  const total = Math.max(0, r.sum + (p.flat || 0));
  const fx = damageEffects(L.weaponTraits(c, "", d), c, termTypes(c, p, wt));
  // its dice in 3D (author, 2026-11-19): «менша з 2d6» — the higher one is not counted
  const hi = p.low ? (r.vals[0] > r.vals[1] ? 0 : 1) : -1;
  const rolls = rollList(rollFromDice(seriesGroups(dieSides(p), r.vals, (k) => k === hi)));
  return postDamageCard(actor, { head: `Шкода: ${c.name} (${c.d})`, wt, total, parts, fx, rolls });
}

/**
 * «Кістка Долі» to chat (author, 2026-11-14), the character's (Удача) and the caravan's (Удача партії) alike:
 * a screen like the check's — the verdict, the total, «d10 + Удача», the die.
 */
export function postFateCard(actor, { v, mod, party = false, roll = null }) {
  const total = v + mod;
  const ok = total >= 6;
  const who = party ? "персонажів" : "персонажа";
  return postChat({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="pust-chat pust-croll"><h4><i class="fa-solid fa-clover"></i> Кістка Долі${party ? " · Удача партії" : ""}</h4>`
      + `<div class="pust-cres pust-cfate ${ok ? "v2" : "v0"}"><b class="rvhead">${ok ? `На користь ${who}` : `Не на користь ${who}`}</b>`
      + `<div class="rverd"><b class="rtot">${total}</b><span class="rranges"><span class="${ok ? "" : "hit v0"}">≤5</span><span class="${ok ? "hit v2" : ""}">6+</span></span></div>`
      + `<p class="pust-cbreak"><span class="die d10 kept">${v}</span> · ${party ? "Удача партії" : "Удача"} ${sgn(mod)}</p></div></div>`,
  }, { dice: true, rolls: [roll] });
}

/** The dice chat card: the check card's screen with the sum and every die in its shape (+ a flat bonus, if any) */
function postDiceCard(speaker, what, total, dice, flat = 0, roll = null) {
  return postChat({
    speaker,
    content: `<div class="pust-chat pust-croll"><h4><i class="fa-solid fa-dice"></i> Кістки: ${esc(what)}</h4>`
      + `<div class="pust-cres pust-cpool"><div class="rverd"><b class="rtot">${total}</b><span class="rpool-sum">сума</span></div>`
      + `<p class="pust-cbreak">${dice}${flat ? ` · ${esc(sgn(flat))}` : ""}</p></div></div>`,
  }, { dice: true, rolls: [roll] });
}

/**
 * A die from the «Термінал Доглядача» results («2d6», «d10+3»): rolled by Foundry, shown as the dice card
 * (author, 2026-11-14), the terminal as the speaker.
 */
export async function postTerminalRoll(expr) {
  return postExprRoll(expr, ChatMessage.getSpeaker({ alias: "Термінал Доглядача" }));
}

/** Roll a dice expression («3d6», «d10+2», «1d37») and post the dice card for this speaker; returns the Roll */
export async function postExprRoll(expr, speaker) {
  const roll = await new Roll(String(expr).replace(/^d/, "1d")).evaluate();
  const dice = roll.dice.flatMap((t) => t.results.map((r) => `<span class="die d${t.faces} kept" title="d${t.faces}">${r.result}</span>`)).join(" ");
  const sum = roll.dice.reduce((t, d) => t + d.total, 0);
  await postDiceCard(speaker, expr, roll.total, dice, roll.total - sum, roll);
  return roll;
}

/* ---------- the tours' example (author, 2026-11-16) ---------- */

/**
 * «Зробити перевірку» as an example for the tour «Зробити перевірку»: a panel for a character kept in memory («Швидкий старт»'s
 * Волті), with a ranged attack rolled to a success and, at stage "dmg", its damage — all in memory: nothing is written, nothing
 * goes to chat, its controls are inert. The panel's own markup is left as it is (author, 2026-11-16: wrapping its blocks broke
 * its layout); a step lighting several blocks gives the tour a `union` of selectors.
 */
class DemoCheckPanel extends CheckPanel {
  static DEFAULT_OPTIONS = { id: "pust-check-demo", classes: ["wastelanders", "pust-check", "pust-demo-check"], window: { resizable: false } };
  get title() { return `Зробити перевірку — ${this.actor.name} (приклад)`; }
  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element.querySelector(".pust-roller");
    if (!root) return;
    root.inert = true;
  }
}

let DEMO = null;
const DEMO_STATES = {};

/** Open (or bring to "setup" / "roll" / "dmg") the example panel for `actor`; null closes it */
export async function setCheckDemo(actor, stage = "roll") {
  if (!actor) { await DEMO?.close({ animate: false }); DEMO = null; return null; }
  if (!DEMO_STATES.roll || DEMO_STATES.src !== actor) {
    // a copy of its own with a situational aspect that has a free invoke, so the aspect block shows one (author, 2026-11-16);
    // the wiki's own example aspect («Стандартні дії»: надійне укриття)
    const data = actor.toObject();
    data.system.situational = [...(data.system.situational ?? []), { name: "надійне укриття", invoked: 1 }];
    DEMO_STATES.src = actor;
    DEMO_STATES.actor = new CONFIG.Actor.documentClass(data);
    const { L } = evaluate(DEMO_STATES.actor);
    L.R.fateMode = "char";
    L.R.pool = { 6: 0, 8: 0, 10: 0 };
    for (let i = 0; i < 60; i++) { // a ranged attack, rolled until it succeeds (only in memory)
      L.rollerClick({ tagName: "BUTTON", dataset: { r: "preset", v: "0" } });
      L.rollerClick({ tagName: "BUTTON", dataset: { r: "roll" } });
      if (/class="rres v2"/.test(L.renderRoller())) break;
    }
    DEMO_STATES.roll = clone(L.R);
    DEMO_STATES.setup = { ...clone(L.R), last: null }; // the same attack before its roll (П1 1.6)
    PICKED.set(DEMO_STATES.actor.uuid, pickedKey(L, "preset", 0)); // its ready check pressed (П1 1.3)
    L.rollerClick({ tagName: "BUTTON", dataset: { r: "dmg" } });
    DEMO_STATES.dmg = clone(L.R);
  }
  const demo = DEMO_STATES.actor;
  STATES.set(demo.uuid, clone(DEMO_STATES[stage] ?? DEMO_STATES.roll));
  if (!DEMO || DEMO.actor !== demo) { await DEMO?.close({ animate: false }); DEMO = new DemoCheckPanel({ actor: demo }); }
  await DEMO.render({ force: true });
  return DEMO;
}
