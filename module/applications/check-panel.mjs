/**
 * «Зробити перевірку»: the HTML sheet's check / damage / Кістка Долі panel for one character.
 * The panel's content is drawn by the HTML sheet's own renderer (renderRoller) and every control is
 * handled by its own handlers (rollerClick / rollerChange), so it does exactly what the HTML panel
 * does. Foundry adds the window, saves the character and posts results to chat.
 * The panel's state (R: attribute, skill, type, Посилення…, history) is kept per character.
 */
import { ASHORT, compute } from "../rules/core.mjs";
import { evaluate, runAction } from "./character-actions.mjs";
import { postChat } from "./chat.mjs";
import { attackMode, damageEffects, dieSides, dieTypes, isDamageEffect, partType, splitDiceParts, termTypes, typeChips, weaponDmgType, TYPE_EFFECTS } from "../rules/damage-types.mjs";
import { atkIgnores, atkIgnoreN, applyParts } from "../rules/battle.mjs";
import { sendDamage } from "./apply-damage.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

/** Panel state per actor uuid (survives closing the window) */
const STATES = new Map();
const OPEN = new Map();

/** Buttons whose result goes to chat */
const CHAT_ON = new Set(["roll", "aspect", "modasp", "sitasp", "dmg", "dmgre"]);

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
    }
    if (Object.keys(p).length) {
      R.last = null;
      R.am = {};
    }
    this.#save(L);
  }

  async _prepareContext() {
    const { st, L } = evaluate(this.actor);
    this.#load(L);
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
        return `${open}${top.replace(/\s*\+\s*/g, "+")}${sub ? `<small class="rsub">${sub}</small>` : ""}${close}`;
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
    return { html: this.#damageBlock(html, L, st) };
  }

  /**
   * The damage block: coloured by the damage type (Foundry only, author 2026-11-14), the total in one row with the dice,
   * each die drawn with its own sides, the parts only when there are several, each number in its type's colour, type chips.
   */
  /** What «Завдати виділеним» sends: the damage shown in the panel now */
  #apply = null;

  #damageBlock(html, L, st) {
    const last = L.R.last;
    const D = last?.dmg;
    this.#apply = null;
    const choices = L.dmgChoices(compute(st));
    const wt = weaponDmgType(choices.find((x) => x.key === (D ? D.key : L.R.dmgKey)));
    html = html.replace('<div class="rdmg">', `<div class="rdmg dt-${wt}">`);
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
    // «Завдати виділеним» (author, 2026-11-14): here, not in chat; a partial success of the check halves the damage
    // for those who take ½ on a partial success (the tracker's «Частковий успіх», set by the verdict itself)
    const partial = last.verdict === 1;
    this.#apply = {
      data: damageData({ total: L.dmgTotal(last, compute(st)).total, wt, fx, poison: last.poison && last.poisonRoll ? last.poisonRoll : null }),
      partial, head: D.name,
    };
    const applyBtn = `<div class="rdapply"><button type="button" class="pust-dmg-apply" data-apply="1" title="Шкода виділеним токенам (або цілям, коли нічого не виділено): броня й стійкості кожного враховуються${partial ? "; частковий успіх — ½ тим, хто за нього отримує половину" : ""}"><i class="fa-solid fa-crosshairs"></i><span>Завдати виділеним</span></button>`
      + (partial ? `<span class="rdhalf" title="Перевірка — частковий успіх: хто за часткового успіху отримує половину, отримає ½">частковий успіх</span>` : "") + `</div>`;
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
        // «Завдати виділеним» takes the parts by type when there are several (radiation, poison, psychic meet their own
        // defence, not the armour) and the dice count (radiation that heals: +1 HP a die)
        if (this.#apply) Object.assign(this.#apply.data, applyParts(parts));
        const types = [...parts.map((p) => p.t), ...(last.poison && last.poisonRoll ? ["poison"] : [])];
        return `<div class="rdres"><div class="rdrow"><div class="rdice">${chips}</div>`
          + `<div class="rsum rdsum"><b class="rtot dt-${wt}">${total}</b><span class="rform">шкоди</span><span class="dtchips">${typeChips(types.length ? types : [wt])}</span></div></div>`
          + (fx.length ? `<ul class="rdfx">${fx.map((t) => `<li>${t}</li>`).join("")}</ul>` : "")
          + (parts.length > 1 ? `<p class="rdbrk">${parts.map((p) => `${p.l}: <b class="dt-${p.t}">${p.v}</b>`).join(" · ")}</p>` : "")
          + applyBtn;
      },
    );
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element.querySelector(".pust-roller");
    root.addEventListener("click", async (ev) => {
      const ap = ev.target.closest("[data-apply]");
      if (ap) {
        ev.preventDefault();
        if (!this.#apply || ap.disabled) return;
        ap.disabled = true;
        try { await sendDamage(this.#apply.data, { partial: this.#apply.partial, head: this.#apply.head }); } finally { ap.disabled = false; }
        return;
      }
      const b = ev.target.closest("[data-r]");
      if (!b || b.tagName === "SELECT" || b.tagName === "INPUT" || b.disabled) return;
      ev.preventDefault();
      this.#run("click", b);
    });
    root.addEventListener("change", (ev) => {
      const t = ev.target.closest("[data-r]");
      if (t) this.#run("change", t);
    });
  }

  /** Run one of the HTML panel's handlers on the character, save, then post what was rolled */
  async #run(kind, el) {
    const key = el.dataset.r;
    // a plain copy of what the handlers read from the element
    const node = { tagName: el.tagName, dataset: { ...el.dataset }, value: el.value, checked: el.checked };
    let out;
    await runAction(this.actor, (st, L) => {
      const R = this.#load(L);
      // the damage as it stands (to post the new result when an option changes it: Психо, effect, crit…)
      const dmgNow = () => (R.last?.dmg && R.last.dmg.key === R.dmgKey ? JSON.stringify(L.dmgTotal(R.last, compute(st))) : null);
      const before = { last: clone(R.last), dmg: dmgNow() };
      if (kind === "click") L.rollerClick(node);
      else L.rollerChange(node);
      this.#save(L);
      const dmgChoice = R.last?.dmg ? L.dmgChoices(compute(st)).find((x) => x.key === R.last.dmg.key) : null;
      const dmgType = weaponDmgType(dmgChoice);
      const dmgFx = dmgChoice ? damageEffects(L.weaponTraits(dmgChoice, attackMode(R.last.skillName, R.last.attr), compute(st)), dmgChoice, termTypes(dmgChoice, R.last.dmg.p, dmgType)) : [];
      const after = dmgNow();
      out = { before, R: clone(L.R), dmgTotal: R.last?.dmg ? L.dmgTotal(R.last, compute(st)) : null, dmgType, dmgFx, dmgChoice, verdicts: L.VERDICTS, types: L.CHECK_TYPES,
        dmgChanged: !!(before.dmg && after && before.dmg !== after && before.last?.dmg?.time === R.last.dmg.time) };
    });
    this.render();
    if (kind === "click" && CHAT_ON.has(key)) await this.#post(key, out);
    // an option changed the damage already rolled (Психо, effect, crit, robot…): the new result goes to chat too
    else if (out.dmgChanged) await this.#chatDamage(out.R.last, out.dmgTotal, false, out.dmgType, true, out.dmgFx, out.dmgChoice);
  }

  async #post(key, { before, R, dmgTotal, dmgType, dmgFx, dmgChoice, verdicts, types }) {
    const L = R.last;
    if (["roll", "aspect", "modasp", "sitasp"].includes(key) && L) {
      if (key !== "roll" && JSON.stringify(L) === JSON.stringify(before.last)) return; // nothing invoked
      return this.#chatCheck(L, verdicts, types, key !== "roll");
    }
    if ((key === "dmg" || key === "dmgre") && L?.dmg && dmgTotal) return this.#chatDamage(L, dmgTotal, key === "dmgre", dmgType, false, dmgFx, dmgChoice);
  }

  /* ---------- chat ---------- */

  #chat(content) {
    return postChat({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<div class="pust-chat">${content}</div>`,
    }, { dice: true });
  }

  #chatCheck(last, verdicts, types, aspect) {
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
    );
  }

  #chatDamage(last, t, reroll, wt, updated = false, fx = [], choice = null) {
    const dm = last.dmg;
    let parts = (t.parts || []).map(([l, v]) => ({ l, v, t: partType(l, wt) }));
    const best = dm.r2 && dm.r2.sum > dm.r1.sum ? dm.r2 : dm.r1;
    if (!/^Максимум/.test(parts[0]?.l || "")) parts = splitDiceParts(parts, choice, dm.p, wt, best?.vals);
    return postDamageCard(this.actor, {
      head: `Шкода${reroll ? " (перекинуто)" : updated ? " (оновлено)" : ""}: ${dm.name} (${dm.dstr})`,
      wt, total: t.total, parts, fx, poison: last.poison && last.poisonRoll ? last.poisonRoll : null, spent: dm.spent,
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

/** The character the panel is for: the one picked, else the user's Player Character, else the first one owned */
function dockActor() {
  const list = ownCharacters();
  const pc = game.user.character;
  return list.find((a) => a.id === dockActorId) ?? (pc && list.includes(pc) ? pc : null) ?? list[0] ?? null;
}

export const dockCheckOpen = () => !!DOCKED?.rendered;

/** Open or close the panel next to the unit at `rect` */
export async function toggleDockCheck(rect) {
  if (DOCKED?.rendered) { await DOCKED.close(); return; }
  const actor = dockActor();
  if (!actor) return ui.notifications.warn("У тебе ще немає персонажа.");
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
 * player owns several; ×), right of the unit «Лічильники + Кістки» (left of it when there is no room), as tall as the
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
    el.querySelector(":scope > .pust-cd-hd")?.remove();
    const list = ownCharacters();
    const hd = document.createElement("header");
    hd.className = "pust-cd-hd";
    const who = list.length > 1
      ? `<select class="pust-cd-who" aria-label="Персонаж для перевірки" title="Чия перевірка">${list.map((a) => `<option value="${a.id}" ${a.id === this.actor.id ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>`
      : `<b class="pust-cd-name">${esc(this.actor.name)}</b>`;
    hd.innerHTML = `<i class="fa-solid fa-dice-d20"></i><span>Зробити перевірку</span>${who}<button type="button" class="pust-cd-x" title="Закрити" aria-label="Закрити"><i class="fa-solid fa-xmark"></i></button>`;
    el.prepend(hd);
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

  /** Where the panel goes: right of the unit (or left of it), its top with the unit's, kept on screen */
  #spot() {
    const r = this.anchor, el = this.element;
    if (!r) return null;
    const maxH = window.innerHeight - 16;
    const w = el?.offsetWidth || 520, h = Math.min(el?.offsetHeight || 0, maxH);
    let left = r.right + DOCK_GAP;
    if (left + w > window.innerWidth - 8) left = Math.max(8, r.left - DOCK_GAP - w);
    return { left: Math.round(left), top: Math.round(Math.max(8, Math.min(r.top, window.innerHeight - 8 - h))) };
  }

  stick() {
    const el = this.element, p = this.#spot();
    if (!el || !p) return;
    el.style.maxHeight = `${window.innerHeight - 16}px`;
    el.style.left = `${p.left}px`;
    el.style.top = `${p.top}px`;
  }

  /** Foundry's own placing (centred on the first render) is replaced by the place next to the unit */
  _updatePosition(position) {
    const out = super._updatePosition(position);
    const p = this.#spot();
    if (p) Object.assign(out, p);
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
 * What «Завдати виділеним» needs (module/applications/apply-damage.mjs): the total, its type, armour ignored — for a
 * character's weapon read from its effect lines (not the damage type's own line: the type is counted by the rules already)
 */
export function damageData({ total, wt, fx = [], poison = null }) {
  const own = fx.filter((x) => !Object.values(TYPE_EFFECTS).includes(x));
  return {
    total: Math.max(0, Number(total) || 0), type: wt, ignoreArmor: own.some((x) => atkIgnores(x)), ignoreN: Math.max(0, ...own.map((x) => atkIgnoreN(x))),
    poison: poison?.sum ?? 0,
  };
}

/**
 * The damage chat card (author, 2026-11-14): the result only — the total with its type chips, the damage effects,
 * the breakdown when there are several parts (each number in its type's colour), the weapon's poison as its own line; no dice.
 */
export function postDamageCard(actor, { head, wt, total, parts, fx = [], poison = null, spent = "", speaker = null }) {
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
  }, { dice: true });
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
  if (!p) return ui.notifications.warn(`Не вдалося розібрати шкоду зброї «${c.name}». Виправ поле «Шкода» у Мотлосі.`);
  const r = L.rollDice(p);
  const wt = weaponDmgType(c);
  const label = p.low ? "менша з 2d6" : p.terms.map((t) => `${t.n}d${t.s}`).join("+");
  let parts = splitDiceParts([{ l: label, v: String(r.sum), t: wt }], c, p, wt, r.vals);
  if (p.flat) parts.push({ l: "Бонус зброї", v: String(p.flat), t: wt });
  const total = Math.max(0, r.sum + (p.flat || 0));
  const fx = damageEffects(L.weaponTraits(c, "", d), c, termTypes(c, p, wt));
  return postDamageCard(actor, { head: `Шкода: ${c.name} (${c.d})`, wt, total, parts, fx });
}

/**
 * «Кістка Долі» to chat (author, 2026-11-14), the character's (Удача) and the caravan's (Удача партії) alike:
 * a screen like the check's — the verdict, the total, «d10 + Удача», the die.
 */
export function postFateCard(actor, { v, mod, party = false }) {
  const total = v + mod;
  const ok = total >= 6;
  const who = party ? "персонажів" : "персонажа";
  return postChat({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="pust-chat pust-croll"><h4><i class="fa-solid fa-clover"></i> Кістка Долі${party ? " · Удача партії" : ""}</h4>`
      + `<div class="pust-cres pust-cfate ${ok ? "v2" : "v0"}"><b class="rvhead">${ok ? `На користь ${who}` : `Не на користь ${who}`}</b>`
      + `<div class="rverd"><b class="rtot">${total}</b><span class="rranges"><span class="${ok ? "" : "hit v0"}">≤5</span><span class="${ok ? "hit v2" : ""}">6+</span></span></div>`
      + `<p class="pust-cbreak"><span class="die d10 kept">${v}</span> · ${party ? "Удача партії" : "Удача"} ${sgn(mod)}</p></div></div>`,
  }, { dice: true });
}

/** The dice chat card: the check card's screen with the sum and every die in its shape (+ a flat bonus, if any) */
function postDiceCard(speaker, what, total, dice, flat = 0) {
  return postChat({
    speaker,
    content: `<div class="pust-chat pust-croll"><h4><i class="fa-solid fa-dice"></i> Кістки: ${esc(what)}</h4>`
      + `<div class="pust-cres pust-cpool"><div class="rverd"><b class="rtot">${total}</b><span class="rpool-sum">сума</span></div>`
      + `<p class="pust-cbreak">${dice}${flat ? ` · ${esc(sgn(flat))}` : ""}</p></div></div>`,
  }, { dice: true });
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
  await postDiceCard(speaker, expr, roll.total, dice, roll.total - sum);
  return roll;
}
