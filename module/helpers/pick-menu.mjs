/**
 * A short list that opens under a button and gives back the row clicked (author, 2026-11-20, mockup А: the effects of
 * «Прицільний постріл» under «Завдати цілям»). One at a time; Esc, a click elsewhere or scrolling closes it with null.
 * @param {HTMLElement} anchor the button
 * @param {{k:string, label:string, off?:boolean, tip?:string}[]} items
 * @param {{title?:string}} [o]
 * @returns {Promise<object|null>} the item, or null
 */
let open = null;

export function pickMenu(anchor, items, { title = "" } = {}) {
  open?.(null);
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "wastelanders pust-pickmenu";
    box.setAttribute("role", "menu");
    box.innerHTML = (title ? `<div class="pust-pickmenu-hd">${foundry.utils.escapeHTML(title)}</div>` : "")
      + items.map((it, i) => `<button type="button" role="menuitem" data-i="${i}" ${it.off ? "disabled" : ""}${it.tip ? ` data-tooltip="${foundry.utils.escapeHTML(it.tip)}"` : ""}>${foundry.utils.escapeHTML(it.label)}</button>`).join("");
    document.body.append(box);
    // under the button, kept on screen
    const r = anchor?.getBoundingClientRect?.() ?? { left: innerWidth / 2, bottom: innerHeight / 2, right: innerWidth / 2 };
    const w = box.offsetWidth, h = box.offsetHeight;
    box.style.left = `${Math.max(6, Math.min(innerWidth - w - 6, r.right - w))}px`;
    box.style.top = `${r.bottom + h + 6 > innerHeight ? Math.max(6, r.top - h - 4) : r.bottom + 4}px`;
    const done = (v) => {
      if (open !== done) return;
      open = null;
      box.remove();
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("wheel", done0, true);
      resolve(v);
    };
    const done0 = () => done(null);
    const outside = (ev) => { if (!box.contains(ev.target)) done(null); };
    const key = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); done(null); } };
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-i]");
      if (b && !b.disabled) done(items[Number(b.dataset.i)]);
    });
    open = done;
    setTimeout(() => {
      document.addEventListener("pointerdown", outside, true);
      document.addEventListener("keydown", key, true);
      window.addEventListener("wheel", done0, true);
    }, 0);
    box.querySelector("button:not([disabled])")?.focus();
  });
}
