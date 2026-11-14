/**
 * Картка супротивника (author, 2026-11-14): the battle tracker's enemy card (tracker.js unitCard) as an actor sheet
 * on ApplicationV2. The data: module/data/enemy-data.mjs; the rules: module/rules/enemy-model.mjs and battle.mjs; the
 * view model: enemy-view.mjs (pure, tested). Every action saves with `document.update` (no form submit).
 * Players who may only see the card (LIMITED, once the GM switched it to «Відкрите») get it read-only.
 */
import { generatorRecord } from "../applications/terminal-battle.mjs";
import {
  CAT_GUIDE, CAT_LABEL, DICE_RE, QUICK_ASPECTS, psyMoveIdx, buildAttackPresets, buildMovePresets, atkType, atkIgnoreN, atkIgnores, atkAmmoEx, moveHeal, zoneOfPoint,
} from "../rules/battle.mjs";
import { CATS, resetToBook, takeDamage } from "../rules/enemy-model.mjs";
import { createTerminal } from "../rules/terminal.mjs";
import { postChat } from "../applications/chat.mjs";
import { rollEnemyAttack } from "../applications/enemy-attack.mjs";
import { enemyView, typeOptions } from "./enemy-view.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

let terminal = null;
const T = () => (terminal ??= createTerminal({ toast: () => {}, icon: () => "" }));
const CONFIRM_MS = 3000;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
const clone = (list) => (list ?? []).map((x) => ({ ...x }));

/** A number or a dice expression («5», «2d6+1», «к6») rolled with Foundry's Roll; null when it is not one */
function rollExpr(raw) {
  const t = String(raw ?? "").trim().replace(/\s+/g, "").replace(/к/gi, "d");
  if (!t) return null;
  const expr = t.replace(/(^|[+\-])d/gi, "$11d");
  if (!/^[+\-]?(\d*d\d+|\d+)([+\-](\d*d\d+|\d+))*$/i.test(expr) || !Roll.validate(expr)) return null;
  const roll = new Roll(expr);
  roll.evaluateSync({ allowInteractive: false });
  const dice = roll.dice.reduce((a, d) => a + d.number, 0);
  return { total: Math.max(0, roll.total), dice, text: dice ? `${expr} = ${roll.total}` : String(roll.total), expr };
}

export class WastelandersEnemySheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wastelanders", "pust-sheet", "pust-en-sheet"],
    position: { width: 460, height: "auto" },
    window: { resizable: true },
    viewPermission: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
    form: { submitOnChange: false, closeOnSubmit: false },
    actions: {
      pickImg: WastelandersEnemySheet.#onPickImg,
      rndName: WastelandersEnemySheet.#onRndName,
      revealToggle: WastelandersEnemySheet.#onReveal,
      editToggle: WastelandersEnemySheet.#onEditToggle,
      hpStep: WastelandersEnemySheet.#onHpStep,
      applyDmg: WastelandersEnemySheet.#onApplyDmg,
      applyHeal: WastelandersEnemySheet.#onApplyHeal,
      quickAsp: WastelandersEnemySheet.#onQuickAsp,
      inv: WastelandersEnemySheet.#onInv,
      aspRm: WastelandersEnemySheet.#onAspRm,
      rollAtk: WastelandersEnemySheet.#onRollAtk,
      pip: WastelandersEnemySheet.#onPip,
      addAtk: WastelandersEnemySheet.#onAddAtk,
      rmAtk: WastelandersEnemySheet.#onRmAtk,
      addMove: WastelandersEnemySheet.#onAddMove,
      rmMove: WastelandersEnemySheet.#onRmMove,
      resetBook: WastelandersEnemySheet.#onResetBook,
    },
  };

  static PARTS = {
    sheet: { template: "systems/wastelanders-dev/templates/actor/enemy.hbs", scrollable: [".pust-en-body"] },
  };

  /** Fold states and the edit mode: kept for the life of the window only */
  #ui = { edit: false, details: false, defence: false, desc: false };
  #attackPresets = null;
  #movePresets = null;
  #focus = null;

  get title() {
    return this.document.name || game.i18n.localize("TYPES.Actor.enemy");
  }

  #presets() {
    if (!this.#attackPresets) {
      const db = T().battle.BT.DB;
      this.#attackPresets = buildAttackPresets(db);
      this.#movePresets = buildMovePresets(db);
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const doc = this.document;
    const s = doc.system;
    const editable = this.isEditable;
    const gm = game.user.isGM;
    const edit = this.#ui.edit && editable;
    const v = enemyView(s, { editable, gm });
    Object.assign(context, {
      v, editable, gm, edit, ui: this.#ui, name: doc.name, img: doc.img, differs: v.differs,
      notes: s.notes, dmgTypes: typeOptions("phys"),
      cats: CATS.map((k) => ({ k, l: CAT_LABEL[k], sel: k === v.cat })), catGuide: CAT_GUIDE[v.cat]?.txt ?? "",
    });
    // a random name only for kinds with a name pool (humanoids)
    // the kind's name: a token's own actor carries its personal name, the base actor the kind's
    const base = doc.getFlag(game.system.id, "baseName") || (doc.isToken ? doc.token?.baseActor?.name : null) || doc.name;
    context.canName = editable && !!T().battle.enemyName(generatorRecord(T(), base) ?? { name: base }, new Set());
    if (edit) {
      this.#presets();
      context.atkPresets = this.#attackPresets.map(([g, list], gi) => ({ g, items: list.map((a, k) => ({ v: `${gi}:${k}`, n: a.n, d: a.d })) }));
      context.movePresets = this.#movePresets.map((m, i) => ({ i, n: m.n }));
    }
    context.descHtml = s.description
      ? await foundry.applications.ux.TextEditor.implementation.enrichHTML(s.description, { secrets: doc.isOwner })
      : "";
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    const fit = (ta) => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight + 2}px`; };
    root.querySelectorAll("textarea").forEach((ta) => { requestAnimationFrame(() => fit(ta)); ta.addEventListener("input", () => fit(ta)); });
    // a fold opened makes the card taller: Foundry places the window again, so it stays on the screen (the UI audit caught it going off)
    root.querySelectorAll("details[data-fold]").forEach((d) => d.addEventListener("toggle", () => { this.#ui[d.dataset.fold] = d.open; requestAnimationFrame(() => this.rendered && this.setPosition({ height: "auto" })); }));
    if (this.#focus) { root.querySelector(`input[name='${this.#focus}']`)?.focus(); this.#focus = null; }
    if (!this.isEditable) {
      root.querySelectorAll("input, select, textarea, button[data-action]").forEach((el) => { if (!el.closest("summary")) el.disabled = true; });
      return;
    }
    const on = (sel, ev, fn) => root.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, (e) => fn(e.currentTarget, e)));
    on("input[name='name']", "change", (el) => { const v = el.value.trim(); return v ? this.document.update({ name: v }) : this.render(); });
    on("input[name='hpCur']", "change", (el) => this.#setHp(int(el.value, this.document.system.hp.value)));
    on("input[name='hpMax']", "change", (el) => {
      const max = Math.max(0, int(el.value, this.document.system.hp.max));
      return this.document.update({ "system.hp.max": max, "system.hp.value": Math.min(this.document.system.hp.value, max) });
    });
    on("input[name='aspin']", "keydown", async (el, e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const t = el.value.trim();
      if (!t) return;
      this.#focus = "aspin";
      await this.document.update({ "system.aspects": [...clone(this.document.system.aspects), { t, inv: 0 }] });
    });
    on("input[name='baseIn']", "keydown", async (el, e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const t = el.value.trim();
      if (!t) return;
      this.#focus = "baseIn";
      await this.document.update({ "system.baseAspects": [...clone(this.document.system.baseAspects), { t, inv: 0 }] });
    });
    on("input[name='dmgAmount'], input[name='healAmount']", "keydown", (el, e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      el.name === "dmgAmount" ? WastelandersEnemySheet.#onApplyDmg.call(this) : WastelandersEnemySheet.#onApplyHeal.call(this);
    });
    on("textarea[name='notes']", "change", (el) => this.document.update({ "system.notes": el.value }));
    on("select[name='cat']", "change", (el) => this.document.update({ "system.cat": el.value }));
    on("[data-used]", "change", (el) => this.#setUsed(int(el.dataset.used), el.checked));
    on("[data-af]", "change", (el) => this.#editAttack(int(el.dataset.i), el.dataset.af, el.value));
    on("[data-bf]", "change", (el) => {
      const list = clone(this.document.system.baseAspects);
      const i = int(el.dataset.bf);
      if (list[i]) list[i].t = el.value.trim();
      return this.document.update({ "system.baseAspects": list });
    });
    on("[data-mf]", "change", (el) => {
      const list = clone(this.document.system.moves);
      const i = int(el.dataset.i);
      if (list[i]) list[i][el.dataset.mf] = el.value;
      return this.document.update({ "system.moves": list });
    });
    on("[data-df]", "change", (el) => this.#setDefence(el));
    on("select[name='atkPreset']", "change", (el) => this.#addPreset(el.value));
    on("select[name='movePreset']", "change", (el) => {
      const m = this.#movePresets?.[int(el.value, -1)];
      if (m) return this.document.update({ "system.moves": [...clone(this.document.system.moves), { n: m.n, t: m.t, used: false }] });
    });
  }

  /* ---------- HP ---------- */

  async #setHp(value) {
    const s = this.document.system;
    return this.document.update({ "system.hp.value": Math.max(0, Math.min(s.hp.max, value)) });
  }

  static async #onHpStep(event, target) {
    await this.#setHp(this.document.system.hp.value + int(target.dataset.d));
  }

  /** «Завдати»: computeDamage on the card's own defence, HP down, a short line to chat */
  static async #onApplyDmg() {
    const root = this.element;
    const r = rollExpr(root.querySelector("[name='dmgAmount']").value);
    if (!r) return ui.notifications.warn("Шкода: число або кістки, наприклад 5 чи 2d6+1.");
    const type = root.querySelector("[name='dmgType']").value;
    const ignoreArmor = root.querySelector("[name='dmgIgnore']").checked;
    const partial = root.querySelector("[name='dmgPartial']").checked;
    const s = this.document.system;
    const res = takeDamage(s, r.total, type, {
      ignoreArmor, partial, dice: r.dice, rollD6: () => new Roll("1d6").evaluateSync({ allowInteractive: false }).total,
    });
    const was = s.hp.value;
    const now = res.heal ? Math.min(s.hp.max, was + res.heal) : Math.max(0, was - res.final);
    await this.document.update({ "system.hp.value": now });
    const head = res.heal ? `лікується радіацією: +${now - was} ОЗ` : `отримує ${res.final} шкоди`;
    const steps = res.steps.length ? `<p>${esc(r.text)} · ${res.steps.map(esc).join(" · ")}</p>` : `<p>${esc(r.text)}</p>`;
    await postChat({
      content: `<div class="pust-chat"><h4>${esc(this.document.name)} ${head}</h4>${steps}<p>ОЗ: ${was} → ${now} з ${s.hp.max}${now <= 0 ? " — виведений з бою" : ""}</p></div>`,
      speaker: ChatMessage.getSpeaker({ actor: this.document, token: this.token }),
    });
    root.querySelector("[name='dmgAmount']").value = "";
  }

  static async #onApplyHeal() {
    const root = this.element;
    const r = rollExpr(root.querySelector("[name='healAmount']").value);
    if (!r) return ui.notifications.warn("Лікування: число або кістки, наприклад 4 чи 1d6+2.");
    const s = this.document.system;
    const was = s.hp.value;
    const now = Math.min(s.hp.max, was + r.total);
    await this.document.update({ "system.hp.value": now });
    await postChat({
      content: `<div class="pust-chat"><h4>${esc(this.document.name)} лікується: +${now - was} ОЗ</h4><p>${esc(r.text)} · ОЗ: ${was} → ${now} з ${s.hp.max}</p></div>`,
      speaker: ChatMessage.getSpeaker({ actor: this.document, token: this.token }),
    });
    root.querySelector("[name='healAmount']").value = "";
  }

  /* ---------- aspects ---------- */

  static async #onQuickAsp(event, target) {
    const label = QUICK_ASPECTS.find(([k]) => k === target.dataset.k)?.[1];
    if (target.disabled || !label) return;
    const list = clone(this.document.system.aspects);
    if (list.some((a) => a.t === label)) return;
    list.push({ t: label, inv: 0 });
    await this.document.update({ "system.aspects": list });
  }

  static async #onInv(event, target) {
    const path = target.dataset.s === "b" ? "baseAspects" : "aspects";
    const list = clone(this.document.system[path]);
    const i = int(target.dataset.i);
    if (!list[i]) return;
    list[i].inv = Math.max(0, list[i].inv + int(target.dataset.d));
    await this.document.update({ [`system.${path}`]: list });
  }

  static async #onAspRm(event, target) {
    const path = target.dataset.s === "b" ? "baseAspects" : "aspects";
    const i = int(target.dataset.i);
    await this.document.update({ [`system.${path}`]: clone(this.document.system[path]).filter((_, k) => k !== i) });
  }

  /* ---------- attacks ---------- */

  static async #onRollAtk(event, target) {
    await rollEnemyAttack(this.document, int(target.dataset.i), { token: this.token });
  }

  /** A pip is an ammo charge: a click sets the ammo to it; the last lit pip clicked again spends it */
  static async #onPip(event, target) {
    const list = clone(this.document.system.attacks);
    const a = list[int(target.dataset.i)];
    if (!a) return;
    const n = int(target.dataset.n);
    a.ammo = n === a.ammo ? n - 1 : n;
    await this.document.update({ "system.attacks": list });
  }

  async #editAttack(i, f, raw) {
    const list = clone(this.document.system.attacks);
    const a = list[i];
    if (!a) return;
    const val = String(raw).trim();
    if (f === "dice") {
      if (!DICE_RE.test(val)) { ui.notifications.warn("Шкода атаки: кістки на кшталт 1d10, 2d6+1 чи 3d6-1."); return this.render(); }
      a.dice = val;
    } else if (f === "ammoMax") {
      a.ammoMax = Math.max(0, int(val));
      a.ammo = a.ammoMax;
    } else if (f === "type") a.type = val;
    else {
      a[f] = raw;
      a.ignoreN = atkIgnoreN(`${a.name} ${a.note}`);
      a.ignoreArmor = atkIgnores(a.note);
    }
    await this.document.update({ "system.attacks": list });
  }

  static async #onAddAtk() {
    await this.document.update({ "system.attacks": [...clone(this.document.system.attacks), { name: "Нова атака", dice: "1d6", type: "phys", note: "", ammoMax: 0, ammo: 0, ignoreN: 0, ignoreArmor: false }] });
  }

  async #addPreset(value) {
    const [g, k] = String(value).split(":").map((x) => int(x, -1));
    const p = this.#attackPresets?.[g]?.[1]?.[k];
    if (!p) return;
    const text = `${p.n} ${p.note}`;
    const ammo = atkAmmoEx(text);
    await this.document.update({
      "system.attacks": [...clone(this.document.system.attacks), {
        name: p.n, dice: p.d, type: atkType(text), note: p.note, ammoMax: ammo, ammo, ignoreN: atkIgnoreN(text), ignoreArmor: atkIgnores(p.note),
      }],
    });
  }

  static async #onRmAtk(event, target) {
    const i = int(target.dataset.i);
    await this.document.update({ "system.attacks": clone(this.document.system.attacks).filter((_, k) => k !== i) });
  }

  /* ---------- moves ---------- */

  static async #onAddMove() {
    await this.document.update({ "system.moves": [...clone(this.document.system.moves), { n: "Новий хід", t: "", used: false }] });
  }

  static async #onRmMove(event, target) {
    const i = int(target.dataset.i);
    await this.document.update({ "system.moves": clone(this.document.system.moves).filter((_, k) => k !== i) });
  }

  /** «використано»: a healing move heals this enemy (and, when it heals the group, the others of its battle zone) */
  async #setUsed(i, checked) {
    const doc = this.document;
    const moves = clone(doc.system.moves);
    const mv = moves[i];
    if (!mv) return;
    mv.used = checked;
    const upd = { "system.moves": moves };
    const lines = [];
    const h = checked ? moveHeal(mv.t) : null;
    if (h) {
      const heal = (actor, name) => {
        const r = rollExpr(h.expr);
        const hp = actor.system.hp;
        const now = Math.min(hp.max, hp.value + (r?.total ?? 0));
        return { now, line: now > hp.value ? `${esc(name)} +${now - hp.value}${r?.dice ? ` (${esc(r.text)})` : ""}` : "" };
      };
      if (!(h.group && h.others)) {
        const own = heal(doc, doc.name);
        upd["system.hp.value"] = own.now;
        if (own.line) lines.push(own.line);
      }
      if (h.group) {
        for (const t of this.#zoneMates()) {
          const res = heal(t.actor, t.name);
          if (res.now > t.actor.system.hp.value) await t.actor.update({ "system.hp.value": res.now });
          if (res.line) lines.push(res.line);
        }
      }
    }
    await doc.update(upd);
    if (h) {
      await postChat({
        content: `<div class="pust-chat"><h4>${esc(doc.name)} використовує «${esc(mv.n)}»</h4><p>${lines.length ? lines.join(", ") : "ОЗ уже повні"}</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor: doc, token: this.token }),
      });
    } else if (i === psyMoveIdx(doc.system)) {
      await postChat({
        content: `<div class="pust-chat"><h4>${esc(doc.name)}</h4><p>${checked ? "Діє Психо: +2 шкоди атаками до кінця сцени" : "Психо більше не діє"}</p></div>`,
        speaker: ChatMessage.getSpeaker({ actor: doc, token: this.token }),
      });
    }
  }

  /** The other living enemies in this token's battle zone (zones are Drawings flagged `battleZone`) */
  #zoneMates() {
    const scene = this.token?.parent ?? canvas.scene;
    const tok = this.token ?? scene?.tokens.find((t) => t.actorId === this.document.id);
    if (!scene || !tok) return [];
    const sys = game.system.id;
    const zones = scene.drawings.filter((d) => d.flags?.[sys]?.battleZone)
      .map((d) => ({ id: d.id, x: d.x, y: d.y, w: d.shape.width, h: d.shape.height }));
    const size = scene.grid.size;
    const centre = (t) => t.object?.center ?? { x: t.x + (t.width * size) / 2, y: t.y + (t.height * size) / 2 };
    const c = centre(tok);
    const zone = zoneOfPoint(zones, c.x, c.y);
    if (!zone) return [];
    return scene.tokens.filter((t) => {
      if (!t.actor || t.actor.type !== "enemy" || t.actor === this.document || t.id === tok.id || t.actor.system.hp.value <= 0) return false;
      const p = centre(t);
      return zoneOfPoint(zones, p.x, p.y)?.id === zone.id;
    });
  }

  /* ---------- defence ---------- */

  async #setDefence(el) {
    if (!game.user.isGM) return;
    const f = el.dataset.df;
    const path = f === "armor" ? "system.armor" : f === "psyArmor" ? "system.psiArmor"
      : ["phys", "energy", "fire", "rad", "poison", "psy"].includes(f) ? `system.def.${f}` : `system.flags.${f}`;
    const value = el.type === "checkbox" ? el.checked : el.tagName === "SELECT" ? el.value : Math.max(0, int(el.value));
    await this.document.update({ [path]: value });
  }

  /* ---------- header ---------- */

  static async #onPickImg() {
    const Picker = foundry.applications.apps.FilePicker.implementation;
    await new Picker({ type: "image", current: this.document.img, callback: (path) => this.document.update({ img: path }) }).browse();
  }

  static async #onRndName() {
    const sys = game.system.id;
    const doc = this.document;
    const base = doc.getFlag(sys, "baseName") || (doc.isToken ? doc.token?.baseActor?.name : null) || doc.name;
    const used = new Set([...game.actors.filter((a) => a.type === "enemy").map((a) => a.name), ...(canvas.scene?.tokens.map((t) => t.name) ?? [])]);
    const n = T().battle.enemyName(generatorRecord(T(), base) ?? { name: base }, used);
    if (!n) return ui.notifications.info("Для цього супротивника немає пулу особистих імен.");
    const upd = { name: n };
    if (!this.document.getFlag(sys, "baseName")) upd[`flags.${sys}.baseName`] = base;
    await this.document.update(upd);
    // an unlinked token: its nameplate follows
    if (doc.isToken && doc.token) await doc.token.update({ name: n });
  }

  /** «Відкрите / Приховане»: players may open a read-only card only while it is open */
  static async #onReveal() {
    if (!game.user.isGM) return;
    const open = !this.document.system.reveal;
    await this.document.update({
      "system.reveal": open,
      "ownership.default": open ? CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE,
    });
  }

  static async #onEditToggle() {
    this.#ui.edit = !this.#ui.edit;
    if (this.#ui.edit) this.#ui.details = true;
    await this.render();
  }

  /** «Як у книзі»: asks twice (the first press arms the button for 3 s) */
  static async #onResetBook(event, target) {
    if (!target.classList.contains("armed")) {
      target.classList.add("armed");
      target.title = "Натисни ще раз, щоб підтвердити";
      ui.notifications.info("Натисни ще раз, щоб підтвердити.");
      setTimeout(() => target.classList.remove("armed"), CONFIRM_MS);
      return;
    }
    const upd = resetToBook(this.document.system);
    if (upd) await this.document.update({ system: upd });
  }
}
