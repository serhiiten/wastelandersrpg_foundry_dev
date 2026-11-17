/**
 * «?» in a window's header (author, 2026-11-17; feedback p3, as the panels' «?»): the terminal, the enemy card, the
 * character and caravan sheets. It opens «Довідка Foundry» (tours.mjs openHelp) on the tour page of the user's side, at the
 * step of the tab now open.
 */

/**
 * Put the button into `app`'s header once (call from _onRender).
 * @param {ApplicationV2} app
 * @param {() => [string, string]} target  [tour id, step id], read at the click
 */
export function addHelpButton(app, target) {
  const header = app.window?.header ?? app.element?.querySelector(".window-header");
  if (!header || header.querySelector(".pust-help-hd")) return;
  const b = document.createElement("button");
  b.type = "button";
  b.className = "header-control icon fa-solid fa-question pust-help-hd";
  b.dataset.tooltip = "Довідка";
  b.setAttribute("aria-label", "Довідка про це вікно");
  b.addEventListener("pointerdown", (ev) => ev.stopPropagation()); // no window drag
  b.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    b.blur();
    const [tour, step] = target();
    import("./tours.mjs").then((m) => m.openHelp(tour, step));
  });
  const close = header.querySelector('[data-action="close"]');
  if (close) close.before(b); else header.append(b);
}
