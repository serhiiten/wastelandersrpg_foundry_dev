/**
 * The base of the two item builders (species-builder.mjs, drug-builder.mjs): an AppV2 item sheet in the system's style.
 * The GM / owner builds, everyone else reads; an official item (from a compendium) has no builder data and shows its
 * description only. Every change is saved at once with `document.update` (no form submit).
 */
const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

export const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
export const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : "0");

export class BuilderSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["wastelanders", "pust-sheet", "pust-builder-sheet"],
    position: { width: 600, height: "auto" },
    window: { resizable: true },
    form: { submitOnChange: false, closeOnSubmit: false },
  };

  get title() {
    return this.document.name || game.i18n.localize(`TYPES.Item.${this.document.type}`);
  }

  /** The builder's data on the item, or null for an official item (the description view) */
  get builderData() { return null; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.editable = this.isEditable;
    context.name = this.document.name;
    context.hasBuilder = !!this.builderData;
    if (!context.hasBuilder) {
      context.description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.document.system.description ?? "", {
        relativeTo: this.document, rollData: this.document.getRollData?.() ?? {},
      });
      context.type = game.i18n.localize(`TYPES.Item.${this.document.type}`);
    }
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    // text fields grow with their text
    const fit = (ta) => { ta.style.height = "auto"; ta.style.height = `${ta.scrollHeight + 2}px`; };
    root.querySelectorAll("textarea").forEach((ta) => { requestAnimationFrame(() => fit(ta)); ta.addEventListener("input", () => fit(ta)); });
    if (!this.isEditable) root.querySelectorAll("input, select, textarea, button[data-action]").forEach((el) => { if (!el.closest(".window-header")) el.disabled = true; }); // not the frame's header
    else this._bind(root);
    this.#keepOnScreen();
  }

  /** The editable sheet's listeners (the subclass): fields with `data-f` call `_onField(name, value, el)` on change */
  _bind(root) {
    root.querySelectorAll("[data-f]").forEach((el) => el.addEventListener("change", (ev) => this._onField(el.dataset.f, ev.currentTarget.type === "checkbox" ? ev.currentTarget.checked : ev.currentTarget.value, el)));
  }

  /** @abstract */
  _onField() {}

  /** The window stays on the screen (its body scrolls inside, see css/pust-builder.css) */
  #keepOnScreen() {
    requestAnimationFrame(() => {
      const el = this.element;
      if (!el || !this.rendered) return;
      const r = el.getBoundingClientRect();
      const top = clamp(r.top, 0, Math.max(0, window.innerHeight - r.height));
      const left = clamp(r.left, 0, Math.max(0, window.innerWidth - r.width));
      if (Math.abs(top - r.top) > 1 || Math.abs(left - r.left) > 1) this.setPosition({ top, left });
    });
  }

  /** Two-click confirmation through a dialog; true when the user agrees */
  async confirm(title, text, yes = "Так", no = "Ні") {
    return foundry.applications.api.DialogV2.confirm({
      window: { title }, content: `<p>${esc(text)}</p>`, rejectClose: false, modal: true,
      yes: { label: yes }, no: { label: no },
    });
  }
}
