/**
 * Конструктор виду (author, 2026-11-15): a custom species on the base of one of the five, made as a world item of the type
 * «species» (`system.custom`, shape: speciesDefaults in rules/designer.mjs). A character takes it from its species list or by
 * dragging the item onto the sheet (character-sheet-v2.mjs); the character then carries its own copy (st.speciesX).
 *
 * Decisions: the attribute limits are −2…4 with min ≤ start ≤ max (changing one pushes the neighbours along). «Параметри» are
 * the species' OWN values (author, 2026-11-15), filled from the base (speciesNative in core: a mutant +5 ОЗ, a robot armour 2
 * and immunities, a ghoul's radiation heals, a human +1 perk / +1 skill…) and replacing the base's: ОЗ of the species
 * −5…+10, natural armour 0…5, perks / skills at the start 0…2; the radiation defence is normal / ½ / immune / heals, poison
 * and psychic normal / ½ / immune.
 * An official species (from a compendium) has no `custom`: the sheet shows its description only.
 */
import { AKEYS, ASHORT, SPECIES, SPECIES_ORDER } from "../rules/core.mjs";
import { speciesDefaults, speciesShort } from "../rules/designer.mjs";
import { BuilderSheet, clamp, esc, int } from "./builder-base.mjs";

const ATTR_NAMES = { SL: "Сила", SPR: "Сприйняття", VTR: "Витривалість", PV: "Привабливість", IN: "Інтелект", VP: "Вправність", UDCH: "Удача" };
const B_MIN = -2;
const B_MAX = 4;
const LIMITS = { hp: [-5, 10], armor: [0, 5], perk: [0, 2], skill: [0, 2] };
const DEF_ROWS = [
  { k: "rad", n: "Радіація", options: [["normal", "звичайна"], ["half", "½ шкоди"], ["immune", "імунітет"], ["heal", "лікує"]] },
  { k: "poison", n: "Отрути", options: [["normal", "звичайна"], ["half", "½ шкоди"], ["immune", "імунітет"]] },
  { k: "psy", n: "Психічна шкода", options: [["normal", "звичайна"], ["half", "½ шкоди"], ["immune", "імунітет"]] },
];
const COUNTERS = [
  { f: "hp", n: "ОЗ виду", icon: "fa-heart-pulse", hint: "Додається до максимуму ОЗ (супермутант і Пазур +5; −5…+10)" },
  { f: "armor", n: "Природна броня", icon: "fa-shield-halved", hint: "Фізична броня виду (робот 2, Пазур 1; 0…5)" },
  { f: "perk", n: "Додаткові перки на старті", icon: "fa-star", hint: "Скільки додаткових перків персонаж отримує на старті (людина 1; 0…2)" },
  { f: "skill", n: "Додаткові навички учня на старті", icon: "fa-graduation-cap", hint: "Скільки додаткових навичок на рівні учня персонаж отримує на старті (людина 1; 0…2)" },
];

/** A property «Назва: опис» as its two fields (author, 2026-11-15), the way the character sheet splits it; and back */
const PROP_RE = /^([^:.]{2,60}):\s*([\s\S]*)$/;
export function splitProp(p) {
  const s = String(p ?? "").trim();
  const m = s.match(PROP_RE);
  return m ? { n: m[1].trim(), d: m[2].trim() } : { n: "", d: s };
}
export function joinProp(n, d) {
  const a = String(n ?? "").replace(/\s+/g, " ").trim().replace(/:+$/, ""), b = String(d ?? "").replace(/\s+/g, " ").trim();
  return a && b ? `${a}: ${b}` : a ? `${a}:` : b; // a name alone keeps its colon, so it stays the name
}

/** The item's custom species with every field present (an older or hand-edited one is filled from the base) */
function normalize(custom, name) {
  const base = SPECIES[custom?.base] ? custom.base : "human";
  const d = speciesDefaults(base);
  const c = foundry.utils.deepClone(custom ?? {});
  const out = {
    n: name || c.n || "",
    base,
    b: {},
    hp: clamp(int(c.hp), ...LIMITS.hp),
    armor: clamp(int(c.armor), ...LIMITS.armor),
    def: { rad: c.def?.rad ?? "normal", poison: c.def?.poison ?? "normal", psy: c.def?.psy ?? "normal" },
    perk: clamp(int(c.perk), ...LIMITS.perk),
    skill: clamp(int(c.skill), ...LIMITS.skill),
    props: Array.isArray(c.props) ? c.props.map((p) => String(p ?? "")) : d.props,
    short: "",
  };
  AKEYS.forEach((k) => {
    const r = Array.isArray(c.b?.[k]) && c.b[k].length === 3 ? c.b[k].map((v) => clamp(int(v), B_MIN, B_MAX)) : d.b[k];
    out.b[k] = fixBounds(r);
  });
  return out;
}

/** min ≤ start ≤ max */
function fixBounds([min, start, max]) {
  const s = clamp(start, min, Math.max(min, max));
  return [min, s, Math.max(max, s)];
}

/** Set one bound (i: 0 min, 1 start, 2 max) and push the others along so min ≤ start ≤ max */
export function setBound(range, i, value) {
  const r = range.slice();
  r[i] = clamp(int(value), B_MIN, B_MAX);
  if (i === 0) { r[1] = Math.max(r[1], r[0]); r[2] = Math.max(r[2], r[1]); }
  else if (i === 1) { r[0] = Math.min(r[0], r[1]); r[2] = Math.max(r[2], r[1]); }
  else { r[1] = Math.min(r[1], r[2]); r[0] = Math.min(r[0], r[1]); }
  return r;
}

const descriptionHtml = (x) => {
  const props = x.props.filter((p) => String(p).trim());
  return `<p><b>${esc(x.n)}</b> — власний вид на основі: ${esc(SPECIES[x.base].n.toLowerCase())}.</p><p>${esc(speciesShort(x))}</p>`
    + (props.length ? `<ul>${props.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>` : "");
};

export class WastelandersSpeciesBuilder extends BuilderSheet {
  static DEFAULT_OPTIONS = {
    actions: {
      bnd: WastelandersSpeciesBuilder.#onBound,
      bndReset: WastelandersSpeciesBuilder.#onBoundReset,
      cnt: WastelandersSpeciesBuilder.#onCounter,
      propAdd: WastelandersSpeciesBuilder.#onPropAdd,
      propRm: WastelandersSpeciesBuilder.#onPropRm,
      propsBase: WastelandersSpeciesBuilder.#onPropsBase,
    },
  };

  static PARTS = {
    sheet: { template: "systems/wastelanders-dev/templates/item/species-builder.hbs", scrollable: [".pust-bld-body"] },
  };

  get builderData() { return this.document.system.custom ?? null; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!context.hasBuilder) return context;
    const x = normalize(this.builderData, this.document.name);
    const base = SPECIES[x.base];
    context.bases = SPECIES_ORDER.map((k) => ({ v: k, n: SPECIES[k].n, sel: k === x.base }));
    context.attrs = AKEYS.map((k) => {
      const r = x.b[k];
      const rb = base.b[k];
      return {
        k, s: ASHORT[k], n: ATTR_NAMES[k] ?? k, changed: r.some((v, i) => v !== rb[i]), base: rb.join(" / "),
        cells: [["мін", 0], ["старт", 1], ["макс", 2]].map(([label, i]) => ({ label, i, v: r[i] })),
      };
    });
    context.counters = COUNTERS.map((c) => ({ ...c, v: x[c.f], lo: LIMITS[c.f][0], hi: LIMITS[c.f][1] }));
    context.defs = DEF_ROWS.map((r) => ({ k: r.k, n: r.n, options: r.options.map(([v, n]) => ({ v, n, sel: x.def[r.k] === v })) }));
    context.props = x.props.map((t, i) => ({ i, ...splitProp(t) }));
    context.short = speciesShort(x);
    context.baseName = base.n;
    return context;
  }

  /** The working copy, changed by `fn` and saved (a new `name` too; the description is rebuilt) */
  async #edit(fn, name = null) {
    const x = normalize(this.builderData, this.document.name);
    fn(x);
    if (name != null) x.n = name;
    const update = { "system.custom": x, "system.description": descriptionHtml(x) };
    if (name != null) update.name = name;
    await this.document.update(update);
  }

  _onField(f, value, el) {
    if (f === "name") {
      const name = String(value).trim() || this.document.name;
      return this.#edit(() => {}, name);
    }
    if (f === "base") return this.#changeBase(value);
    if (f.startsWith("b:")) {
      const [, k, i] = f.split(":");
      return this.#edit((x) => { x.b[k] = setBound(x.b[k], +i, value); });
    }
    if (f in LIMITS) return this.#edit((x) => { x[f] = clamp(int(value), ...LIMITS[f]); });
    if (f.startsWith("def:")) {
      const k = f.slice(4);
      return this.#edit((x) => { x.def[k] = value; });
    }
    if (f.startsWith("pn:") || f.startsWith("pd:")) {
      const i = +f.slice(3);
      return this.#edit((x) => {
        const cur = splitProp(x.props[i]);
        x.props[i] = f.startsWith("pn:") ? joinProp(value, cur.d) : joinProp(cur.n, value);
        x.props = x.props.filter((p, k) => p || k !== i);
      });
    }
    return undefined;
  }

  _bind(root) {
    super._bind(root);
    root.querySelectorAll("input[name='propNewN'], textarea[name='propNewD']").forEach((el) => el.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || ev.shiftKey) return;
      ev.preventDefault();
      this.#addProp();
    }));
  }

  /** A new base: asks whether the limits and the properties are taken from it too */
  async #changeBase(value) {
    const x = normalize(this.builderData, this.document.name);
    if (!SPECIES[value] || value === x.base) return;
    const reload = await this.confirm("Нова основа", `Підставити межі атрибутів, параметри й властивості виду «${SPECIES[value].n}»? «Лишити мої» змінить лише основу, твої значення й тексти лишаться.`, "Підставити", "Лишити мої");
    if (reload === null) return this.render(); // closed: the old base stays
    const d = speciesDefaults(value);
    return this.#edit((c) => {
      c.base = value;
      if (reload) { c.b = d.b; c.props = d.props; c.hp = d.hp; c.armor = d.armor; c.perk = d.perk; c.skill = d.skill; c.def = d.def; }
    });
  }

  async #addProp() {
    const n = this.element.querySelector("input[name='propNewN']")?.value;
    const d = this.element.querySelector("textarea[name='propNewD']")?.value;
    const t = joinProp(n, d);
    if (!t) return;
    await this.#edit((x) => { x.props.push(t); });
  }

  static #onBound(event, target) {
    const { k, i, d } = target.dataset;
    return this.#edit((x) => { x.b[k] = setBound(x.b[k], +i, x.b[k][+i] + int(d)); });
  }

  static #onBoundReset(event, target) {
    const k = target.dataset.k;
    return this.#edit((x) => { x.b[k] = speciesDefaults(x.base).b[k]; });
  }

  static #onCounter(event, target) {
    const { f, d } = target.dataset;
    return this.#edit((x) => { x[f] = clamp(x[f] + int(d), ...LIMITS[f]); });
  }

  static #onPropAdd() {
    return this.#addProp();
  }

  static #onPropRm(event, target) {
    const i = +target.dataset.i;
    return this.#edit((x) => { x.props = x.props.filter((_, k) => k !== i); });
  }

  static async #onPropsBase() {
    const ok = await this.confirm("Властивості основи", "Замінити список властивостей властивостями основи?", "Підставити", "Скасувати");
    if (!ok) return;
    await this.#edit((x) => { x.props = speciesDefaults(x.base).props; });
  }
}
