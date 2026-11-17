/**
 * Конструктор наркотика (author, 2026-11-15): a designer drug by the rules of «Guns. Lots of Guns» (the wiki's «Дизайнерські
 * наркотики»), made as a world item of the type «drug» (`system.recipe`, shape: Recipe in rules/designer.mjs). Only the recipe is
 * built here (brewing isn't); the price of making and the addiction chance are counted by recipeTotals. A character takes the drug
 * from the «Дизайнерські» section of the gear catalogue or by dragging the item onto the sheet (character-sheet-v2.mjs).
 * An official drug (from a compendium) has no `recipe`: the sheet shows its description only.
 */
import { AKEYS, ASHORT, DRUGS } from "../rules/core.mjs";
import {
  EFFECT, EFFECTS, SIDE, SIDES, addEffect, addSide, designerPerks, recipeDescription, recipeTotals, rollSide,
} from "../rules/designer.mjs";
import { BuilderSheet, clamp, esc, int, sgn } from "./builder-base.mjs";
import { notify } from "../helpers/notify.mjs";

const ATTRS = AKEYS.filter((k) => k !== "UDCH");
const ATTR_NAMES = { SL: "Сила", SPR: "Сприйняття", VTR: "Витривалість", PV: "Привабливість", IN: "Інтелект", VP: "Вправність" };
const rng = (v) => (Array.isArray(v) ? v : [v, v]);
const mid = (r) => Math.round((r[0] + r[1]) / 2);
const span = (v) => (Array.isArray(v) ? `${v[0]}–${v[1]}` : sgn(v));

/** The item's recipe with every field present */
function normalize(recipe, name) {
  const r = foundry.utils.deepClone(recipe ?? {});
  return { name: name || r.name || "", note: String(r.note ?? ""), effects: Array.isArray(r.effects) ? r.effects : [], sides: Array.isArray(r.sides) ? r.sides : [] };
}

/** An attribute not taken yet by a row of this kind (`list` is the recipe's effects or sides, `k` the row) */
const freeAttr = (list, k) => ATTRS.find((a) => !list.some((e) => e.k === k && e.attr === a));

export class WastelandersDrugBuilder extends BuilderSheet {
  static DEFAULT_OPTIONS = {
    position: { width: 640, height: "auto" },
    actions: {
      eff: WastelandersDrugBuilder.#onToggle,
      effAdd: WastelandersDrugBuilder.#onMultiAdd,
      effRm: WastelandersDrugBuilder.#onRemove,
      pc: WastelandersDrugBuilder.#onPerkCounter,
      rollSide: WastelandersDrugBuilder.#onRollSide,
    },
  };

  static PARTS = {
    sheet: { template: "systems/wastelanders-dev/templates/item/drug-builder.hbs", scrollable: [".pust-bld-body"] },
  };

  get builderData() { return this.document.system.recipe ?? null; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!context.hasBuilder) return context;
    const r = normalize(this.builderData, this.document.name);
    const T = recipeTotals(r);
    const attrOptions = (list, e) => ATTRS.map((a) => ({ v: a, n: `${ATTR_NAMES[a]} (${ASHORT[a]})`, sel: e.attr === a }));
    const rows = (defs, list, src) => defs.map((def) => {
      const entries = list.map((e, i) => ({ e, i })).filter(({ e }) => e.k === def.k).map(({ e, i }) => {
        const out = { i, src, attr: !!def.attr, perk: !!def.perk, bad: false };
        if (def.attr) out.attrOptions = [{ v: "", n: "— обери атрибут —", sel: !e.attr }].concat(attrOptions(list, e));
        if (def.perk) {
          const pr = rng(def.price), cr = rng(def.ch);
          out.perkOptions = [{ v: "", n: "— обери перк —", sel: !e.perk }].concat(designerPerks(def.perk).map((p) => ({ v: p, n: p, sel: e.perk === p })));
          out.price = e.price ?? mid(pr);
          out.ch = e.ch ?? mid(cr);
          out.priceRange = `${pr[0]}–${pr[1]}`;
          out.chRange = `${cr[0]}–${cr[1]}`;
        }
        return out;
      });
      const side = src === "s";
      return {
        k: def.k, n: def.n, src, multi: !!def.attr, on: entries.length > 0, entries, canAdd: !!def.attr && entries.length < (def.max || 3),
        cost: side ? `ціна ${sgn(def.price)} · шанс ${sgn(def.ch)}` : `ціна ${span(def.price)} · шанс ${span(def.ch)}`,
      };
    });
    context.effects = rows(EFFECTS, r.effects, "e");
    context.sides = rows(SIDES, r.sides, "s");
    context.note = r.note;
    context.totals = { price: T.price, ch: T.ch, errors: T.errors, warnings: T.warnings.slice(), ok: !T.errors.length };
    if (DRUGS[r.name]) context.totals.warnings.push(`Назва «${r.name}» збігається з назвою справжньої хімії: персонаж не зможе додати такий наркотик. Дай йому іншу назву.`);
    context.preview = recipeDescription(r);
    return context;
  }

  /** The working copy, changed by `fn` (which may return a new recipe), saved with the description, the price and the chance */
  async #edit(fn, name = null) {
    let r = normalize(this.builderData, this.document.name);
    r = fn(r) || r;
    if (name != null) r.name = name;
    else r.name = this.document.name;
    const T = recipeTotals(r);
    const update = {
      "system.recipe": r,
      "system.description": `<p>${esc(recipeDescription(r))}</p>`,
      "system.price": T.price,
      "system.addiction": T.ch,
    };
    if (name != null) update.name = name;
    await this.document.update(update);
  }

  _onField(f, value) {
    if (f === "name") {
      const name = String(value).trim() || this.document.name;
      return this.#edit(() => {}, name);
    }
    if (f === "note") return this.#edit((r) => { r.note = String(value).trim(); });
    const [what, a, b] = f.split(":");
    if (what === "attr") {
      const list = a === "e" ? "effects" : "sides";
      return this.#edit((r) => { const e = r[list][+b]; if (e) e.attr = value || undefined; });
    }
    if (what === "perk") return this.#edit((r) => { const e = r.effects[+a]; if (e) e.perk = value || undefined; });
    if (what === "price" || what === "ch") {
      return this.#edit((r) => {
        const e = r.effects[+a];
        const def = e && EFFECT[e.k];
        if (!def) return;
        const range = rng(def[what]);
        e[what] = clamp(int(value, mid(range)), range[0], range[1]);
      });
    }
    return undefined;
  }

  /* ---------- actions ---------- */

  static #onToggle(event, target) {
    const { src, k } = target.dataset;
    const list = src === "e" ? "effects" : "sides";
    return this.#edit((r) => {
      if (r[list].some((e) => e.k === k)) { r[list] = r[list].filter((e) => e.k !== k); return r; }
      const def = (src === "e" ? EFFECT : SIDE)[k];
      const eff = { k };
      if (def?.perk) Object.assign(eff, { perk: "", price: mid(rng(def.price)), ch: mid(rng(def.ch)) });
      return (src === "e" ? addEffect : addSide)(r, eff);
    });
  }

  /** «+ атрибут» of a row that takes up to three different attributes */
  static #onMultiAdd(event, target) {
    const { src, k } = target.dataset;
    const list = src === "e" ? "effects" : "sides";
    return this.#edit((r) => {
      const def = (src === "e" ? EFFECT : SIDE)[k];
      if (r[list].filter((e) => e.k === k).length >= (def?.max || 3)) return r;
      return (src === "e" ? addEffect : addSide)(r, { k, attr: freeAttr(r[list], k) });
    });
  }

  static #onRemove(event, target) {
    const { src } = target.dataset;
    const i = +target.dataset.i;
    const list = src === "e" ? "effects" : "sides";
    return this.#edit((r) => { r[list] = r[list].filter((_, n) => n !== i); });
  }

  static #onPerkCounter(event, target) {
    const { f, d } = target.dataset;
    const i = +target.dataset.i;
    return this.#edit((r) => {
      const e = r.effects[i];
      const def = e && EFFECT[e.k];
      if (!def) return;
      const range = rng(def[f]);
      e[f] = clamp((e[f] ?? mid(range)) + int(d), range[0], range[1]);
    });
  }

  /** «1d10 побічка» for a dirty brew: the table's side effect is added (a penalty to an attribute asks which attribute) */
  static async #onRollSide() {
    const roll = await new Roll("1d10").evaluate();
    const n = roll.total;
    const side = rollSide(n);
    const def = side && SIDE[side.k];
    if (!def) return;
    const note = `1d10 = ${n}: ${def.n}.`;
    const r0 = normalize(this.builderData, this.document.name);
    if (def.attr) {
      const free = ATTRS.filter((a) => !r0.sides.some((e) => e.k === side.k && e.attr === a));
      if (!free.length) return notify.info(`${note} Усі атрибути вже зайняті.`);
      const attr = await foundry.applications.api.DialogV2.prompt({
        window: { title: `Побічка: ${n}` },
        content: `<p>${esc(note)}</p><label>Який атрибут?<select name="attr">${free.map((a) => `<option value="${a}">${esc(ATTR_NAMES[a])} (${ASHORT[a]})</option>`).join("")}</select></label>`,
        ok: { label: "Додати", callback: (ev, button) => button.form.elements.attr.value },
        rejectClose: false, modal: true,
      });
      if (!attr) return;
      side.attr = attr;
    } else if (!def.group && r0.sides.some((e) => e.k === side.k)) {
      return notify.info(`${note} Така побічка в рецепті вже є.`);
    }
    notify.info(note);
    await this.#edit((r) => addSide(r, side));
  }
}
