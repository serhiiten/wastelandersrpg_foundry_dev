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
import { canSplit, clampShare, evenSplit, splitLeft } from "../rules/damage-split.mjs";
import { offer as fxOffer, effectOf, effectText, toggle as fxToggle, keep as fxKeep, hitFx, coverActive } from "../rules/attack-effects.mjs";
import { sharedGet } from "../helpers/scene-shared.mjs";
import { pendOf, answerPending, openRowOf } from "./pending-attack.mjs";
import { rowTotal, rowDeal, rowClosed, rowText, ATTR_SHORT } from "../rules/dodge.mjs";
import { checkPenalty, spendCheckStates } from "./states.mjs";
import { nearbyFor, nearbyHtml, spendNearby, consqOffer, consqHtml, consqWrite, medOffer, medHtml, medPress, medBlocked } from "./battle-health.mjs";
import { checkFlag } from "../rules/gm-move-alert.mjs";
import { notify } from "../helpers/notify.mjs";
import { checkDiceGroups, damageDiceGroups, poisonSidesOf, rollFromDice, rollList, seriesGroups, waitDice } from "../helpers/dice-rolls.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

/** Panel state per actor uuid (survives closing the window) */
const STATES = new Map();
const OPEN = new Map();

/** Buttons whose result goes to chat */
const CHAT_ON = new Set(["roll", "aspect", "modasp", "sitasp", "nearasp", "dmg", "dmgre"]);
/** What the blocks of A6 / A7 did for a roll: actor uuid → {time, text} (author, 2026-11-21; one press a roll) */
const HX_DONE = new Map();
const WHY_SAID = new Map();
/**
 * A8 (author, 2026-11-21): a rolled damage waiting to be split, by actor uuid — {time (the damage roll's), total, targets
 * [{uuid, name}] fixed at the roll, shares, id, sent}. Kept through closing the panel, lost on F5 (then the GM deals it in
 * «Битва»).
 */
const SPLIT = new Map();
const hxDone = (uuid, last) => { const d = HX_DONE.get(uuid); return d && last && d.time === last.time ? d.text : ""; };

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
  if (user === game.user) document.querySelectorAll(".pust-roller").forEach(syncDealButton);
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

export function openCheckPanel(actor, preset = {}) {
  let app = OPEN.get(actor.uuid);
  if (!app) {
    app = new CheckPanel({ actor });
    OPEN.set(actor.uuid, app);
  }
  app.preset(preset);
  app.render({ force: true });
  return app;
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
    const row = (e, tier) => {
      const x = { ...e, tier }, on = picks.includes(e.key);
      const tag = e.does === "cover" ? `<small class="pust-fx-tag">Посилення спільнику</small>` : e.does === "state" ? `<small class="pust-fx-tag">${e.all ? "застосується до всіх" : "застосується до цілі"}</small>`
        : e.does === "ignore" ? `<small class="pust-fx-tag">з шкодою</small>`
        : e.does === "text" ? `<small class="pust-fx-tag hand">руками</small>` : "";
      return `<label class="tog pust-fxt${on ? " on" : ""}"><input type="checkbox" data-fx="${e.key}"${on ? " checked" : ""}${done ? " disabled" : ""}> <span>${esc(effectText(L.ATK_FX, mode, x))}</span>${tag}</label>`;
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
    const one = needOne ? `<label class="pust-fx-one">${oneLabel} <select data-fx-one>${targets.map((t) => `<option value="${esc(t.uuid)}"${t.uuid === this.#fx.one ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>` : "";
    // «Прикриваєш спільника»: an ally of the scene (a character's token, not this one's)
    let ally = "";
    if (picks.includes("cover")) {
      const own = new Set((canvas?.scene?.tokens ?? []).filter((t) => t.actor?.id === this.actor.id).map((t) => t.uuid));
      const allies = (canvas?.scene?.tokens ?? []).filter((t) => t.actor?.type === "character" && !own.has(t.uuid) && !t.hidden);
      if (!allies.some((t) => t.uuid === this.#fx.ally)) this.#fx.ally = allies[0]?.uuid ?? "";
      ally = allies.length ? `<label class="pust-fx-one">Кого прикриваєш: <select data-fx-ally>${allies.map((t) => `<option value="${t.uuid}"${t.uuid === this.#fx.ally ? " selected" : ""}>${esc(t.name)}</option>`).join("")}</select></label>`
        : `<p class="rhint">На сцені немає спільників: ефект буде лише рядком на картці.</p>`;
    }
    const applyFx = of.instead && picks.length && !done ? `<button type="button" class="btn rust pust-fx-apply" data-fx-apply><i class="fa-solid fa-bolt"></i>Застосувати ефект без шкоди</button>` : "";
    const block = `<div class="rfx pust-fx"><h4>Ефекти: ${esc(L.ATK_FX[mode]?.n?.toLowerCase() ?? "")}</h4>${perkNotes}<p class="rhint">${esc(limit)}${done ? " Уже застосовано." : ""}</p>`
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

  /** «Прикриваєш спільника» on this character, in force this round, or null */
  #cover() {
    const f = this.actor.getFlag?.(game.system.id, "cover");
    return coverActive(f, Math.max(1, Number(sharedGet("round")) || 1)) ? f : null;
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
    const covHtml = cov ? `<div class="ramods pust-ramods-state"><span class="rl">Прикриття</span><label class="tog" title="Спільник прикриває тебе: Посилення до наступного уникнення шкоди в цьому колі дій"><input type="checkbox" checked disabled> <span>${esc(cov.byName || "Спільник")} прикриває: <b>Посилення</b></span></label></div>` : "";
    let withPen = penHtml || covHtml ? html.replace('<button type="button" class="btn rust rgo"', `${penHtml}${covHtml}<button type="button" class="btn rust rgo"`) : html;
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
    const can = !last.aspect && (last.B || 0) < 2 && last.verdict < 3 && !last.dmgDone && !last.xpGiven && !last.savGiven;
    const chips = nearbyHtml(this.#near, can);
    if (chips) html = html.replace(/(<div class="rasp">[\s\S]*?)(<label class="tog"><input type="checkbox" id="r-spend")/, (m, a, b) => `${a}${chips}${b}`);
    const done = hxDone(this.actor.uuid, last);
    let block = "";
    if (last.type === "consq") block = consqHtml(consqOffer(this.actor, last), done);
    else if (["med", "repair", "treat"].includes(last.type)) {
      const o = await medOffer(this.actor, last);
      block = medHtml(o, done);
      // a refusal said once a roll in the notifications too (author, 2026-11-21: a robot treated with «Медицина»)
      if (o?.why && o.patient && !done && WHY_SAID.get(this.actor.uuid) !== last.time) { WHY_SAID.set(this.actor.uuid, last.time); notify.warn(o.why); }
    }
    if (block) html = html.replace('<div class="rasp">', () => `${block}<div class="rasp">`);
    return html;
  }

  /** A press in those blocks */
  async #healthPress(el) {
    const { L } = evaluate(this.actor);
    const last = this.#load(L).last;
    if (!last || hxDone(this.actor.uuid, last)) return;
    const kind = el.dataset.hx;
    const box = el.closest(".pust-hx");
    const name = box?.querySelector("[data-hx-name]")?.value ?? "";
    const slot = box?.querySelector("[data-hx-slot]")?.value ?? "";
    el.disabled = true;
    let text = "";
    try {
      text = last.type === "consq" ? await consqWrite(this.actor, last, kind, name) : await medPress(this.actor, last, kind, { slot, name });
    } finally { el.disabled = false; }
    if (text) { HX_DONE.set(this.actor.uuid, { time: last.time, text }); this.render(); }
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
  /** A8: can this attack's damage be split — an attack, a weapon not of the whole zone, one damage type */
  #splitFits(L, c, wt, last) {
    if (!c || !last || last.type !== "attack") return false;
    const zone = !!(c.expl || c.w?.zone) || attackMode(last.skillName, last.attr) === "explosive";
    let types = 1;
    try { const p = L.parseDmg?.(c.d); if (p) types = new Set(termTypes(c, p, wt)).size; } catch (_) { /* unreadable: the engine says so */ }
    return canSplit({ targets: 2, zone, types });
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
    return `<div class="pust-split-box"><h5>Розподіл шкоди: ${s.total}</h5>${rows}`
      + `<p class="pust-split-left${left < 0 ? " over" : ""}">${left < 0 ? `Розподілено більше, ніж випало: на ${-left}` : `Лишилося: ${left} із ${s.total}`}</p>`
      + `<button type="button" class="btn rust" data-split-go${left < 0 || !any ? " disabled" : ""}><i class="fa-solid fa-burst"></i>Завдати розподілену шкоду</button></div>`;
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
    if (!D && this.#splitFits(L, choices.find((x) => x.key === L.R.dmgKey), wt, last)) {
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
      if (b.classList.contains("pust-wchip")) { if (!b.classList.contains("pust-pick")) this.#run("change", b); return; } // the weapon chips stand for the list
      if (b.classList.contains("pust-skchip")) { if (!b.classList.contains("pust-pick")) this.#run("change", b); return; } // the skill chips too
      // «Стандартні дії» stand for the list «Вид перевірки»: the same change; the pressed one again → «Звичайна перевірка»
      if (b.classList.contains("pust-stdb")) { this.#run("change", { tagName: "SELECT", dataset: { r: "type" }, value: b.classList.contains("on") ? "gen" : b.value }); return; }
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
      if (one) { this.#fx.one = one.value; return; }
      // A8: a share typed by hand
      const sv = ev.target.closest("input[data-split-v]");
      if (sv) {
        const s = SPLIT.get(this.actor.uuid);
        if (s && !s.sent) { s.shares[sv.dataset.u] = clampShare(sv.value, s.total); this.#splitRedraw(root, s); }
        return;
      }
      const t = ev.target.closest("[data-r]");
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
      bar.innerHTML = `<div class="pust-intent"><b>${esc(this.#intent(root))}</b><small class="pust-tgthint" hidden>${esc(NO_TARGETS)}</small></div>`;
      bar.append(go);
    }
    // after a roll: the set-up folds (not in the tour's example, whose steps show the set-up)
    const res = root.querySelector(":scope > .rres");
    if (res && !this.actor.pustTourDemo && !this.element.classList.contains("pust-demo-check")) {
      root.classList.toggle("pust-folded", !this.#setupOpen);
      // folded, the button rolls the same check again, with the same Посилення / Послаблення / modifier (author, 2026-11-18)
      if (!this.#setupOpen && go) {
        const txt = [...go.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && /Кинути перевірку/.test(n.textContent));
        if (txt) txt.textContent = "Повторити перевірку";
        go.title = "Кинути ту саму перевірку ще раз, з тими самими Посиленнями, Послабленнями й модифікатором";
      }
      // the fold line: the check type as its own plate, then what is rolled, then «Інша перевірка» as a button
      // (playtest 2026-11-18, item 3: the type more visible, «змінити» → «Інша перевірка», set apart)
      const { type, rest } = this.#intentParts(root);
      const f = document.createElement("button");
      f.type = "button";
      f.className = "pust-fold";
      f.setAttribute("aria-expanded", String(this.#setupOpen));
      f.innerHTML = `<span>${type ? `<em class="pust-fold-type">${esc(type)}</em>` : ""}${esc(rest)}</span>`
        + `<b>${this.#setupOpen ? "сховати" : "Інша перевірка"} <i class="fa-solid fa-chevron-${this.#setupOpen ? "up" : "down"}"></i></b>`;
      f.title = this.#setupOpen ? "Сховати налаштування перевірки" : "Інша перевірка: атрибут, навичка, вид перевірки; Посилення, Послаблення й модифікатор знову з нуля";
      f.addEventListener("click", () => {
        this.#setupOpen = !this.#setupOpen;
        // «Інша перевірка» starts the counters from 0; «Повторити перевірку» keeps them (author, 2026-11-18)
        if (this.#setupOpen) {
          const R = STATES.get(this.actor.uuid);
          if (R) Object.assign(R, { boost: 0, pen: 0, mod: 0 });
        }
        this.render();
      });
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
    // «Медична допомога» / «Ремонт» cost a Припас to make (author, 2026-11-21; wiki «Відновлення ОЗ…»): none, no roll
    if (kind === "click" && key === "roll") {
      const { st, L } = evaluate(this.actor);
      const t = this.#load(L).type;
      if (["med", "repair"].includes(t) && (parseInt(st.supplies, 10) || 0) <= 0) return notify.warn(`${L.CHECK_TYPES[t]?.n}: потрібна одиниця Припасів, а їх немає.`);
      // the target can't be helped now (a machine, the day's limit): no roll, no Припас (author, 2026-11-21)
      const why = await medBlocked(this.actor, t);
      if (why) return notify.warn(`${L.CHECK_TYPES[t]?.n}: ${why}`);
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
    let coverUsed = false;
    await runAction(this.actor, (st, L) => {
      const R = this.#load(L);
      const t0 = R.last?.time;
      if (pen) R.mod = (+R.mod || 0) + pen.n;
      const coverOn = cover && R.type === "dodge";
      if (coverOn) R.boost = (+R.boost || 0) + 1;
      // the damage as it stands (to post the new result when an option changes it: Психо, effect, crit…)
      const dmgNow = () => (R.last?.dmg && R.last.dmg.key === R.dmgKey ? JSON.stringify(L.dmgTotal(R.last, compute(st))) : null);
      const before = { last: clone(R.last), dmg: dmgNow() };
      // «Мастак-ремонтник»: +1 to «Ремонт» (wiki «Перки»), named among the automatic conditions as the roar's −2 is
      const fixer = kind === "click" && key === "roll" && R.type === "repair" && compute(st).allPerks.includes("Мастак-ремонтник");
      if (fixer) R.mod = (+R.mod || 0) + 1;
      if (kind === "click" && key === "nearasp") L.invokeAspect(el.src); // «Аспекти поруч»: the invoke already spent
      else if (kind === "click") L.rollerClick(node);
      else L.rollerChange(node);
      if (fixer) {
        R.mod = (+R.mod || 0) - 1;
        if (R.last && R.last.time !== t0) { R.last.mod -= 1; R.last.autoFlat = (R.last.autoFlat || 0) + 1; R.last.autoList = [...(R.last.autoList || []), "Мастак-ремонтник +1"]; }
      }
      // the Припас of «Медична допомога» / «Ремонт» goes with the roll (a new roll, not an aspect on it)
      if (kind === "click" && key === "roll" && R.last && R.last.time !== t0 && ["med", "repair"].includes(R.last.type)) st.supplies = Math.max(0, (parseInt(st.supplies, 10) || 0) - 1);
      if (coverOn) {
        R.boost = (+R.boost || 0) - 1;
        if (R.last && R.last.time !== t0) { R.last.autoList = [...(R.last.autoList || []), `Посилення: прикриває ${cover.byName || "спільник"}`]; coverUsed = true; }
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
    });
    await postFateIfChanged(this.actor, fdWas);
    await postSupIfChanged(this.actor, supWas);
    if (penUsed) await spendCheckStates(this.actor);
    if (coverUsed) await this.actor.unsetFlag(game.system.id, "cover");
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
    else if (deal && this.#apply && out.R.last?.dmg) { this.#splitPress = false; await sendDamage(this.#hitData(), { partial: this.#apply.partial, head: this.#apply.head, source: this.#ownToken() }); }
    // an option changed the damage already rolled (Психо, effect, crit, robot…): the new result goes to chat too
    else if (out.dmgChanged) await this.#chatDamage(out.R.last, out.dmgTotal, false, out.dmgType, true, out.dmgFx, out.dmgChoice, out.before.last?.dmg?.extra ?? null);
  }

  async #post(key, { before, R, dmgTotal, dmgType, dmgFx, dmgChoice, verdicts, types }) {
    const L = R.last;
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
  #chatCheck(last, verdicts, types, aspect, before = null) {
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
      `<h4>${esc(T?.n || "Перевірка")}: ${esc(ASHORT[last.attr])}${last.skillName ? ` + ${esc(last.skillName)}` : ""}${aspect ? " — виклик аспекту" : ""}</h4>`
      + `<div class="pust-cres v${v}">`
      + `<b class="rvhead">${esc(verdicts[v])}</b>`
      + `<div class="rverd"><b class="rtot">${last.total}</b><span class="rranges">${lit}</span></div>`
      + `<p class="pust-cbreak">${dice}${skill}${asp}${boost} · ${mods}</p>`
      + (T?.d?.[v] ? `<p class="rdesc">${esc(T.d[v])}</p>` : "") + `</div>`,
      rollList(rollFromDice(aspect ? checkDiceGroups(last, before) : checkDiceGroups(last))),
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

/** Open (or bring to "roll" / "dmg") the example panel for `actor`; null closes it */
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
    L.rollerClick({ tagName: "BUTTON", dataset: { r: "dmg" } });
    DEMO_STATES.dmg = clone(L.R);
  }
  const demo = DEMO_STATES.actor;
  STATES.set(demo.uuid, clone(DEMO_STATES[stage] ?? DEMO_STATES.roll));
  if (!DEMO || DEMO.actor !== demo) { await DEMO?.close({ animate: false }); DEMO = new DemoCheckPanel({ actor: demo }); }
  await DEMO.render({ force: true });
  return DEMO;
}
