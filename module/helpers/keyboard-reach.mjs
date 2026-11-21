/**
 * Tab reaches every control of the system's windows (V6, author 2026-11-21): the sheet and terminal tabs, the rolls of
 * skills and attributes, pictures with an action are links or pictures without `href`, which the keyboard skips. Each gets
 * `tabindex="0"`, and Enter or Space on it does what a click does. The look of the focus is one rule in css/pust-ui.css.
 */

/** What the mouse presses but Tab doesn't reach: an action on something not focusable by itself, a tab without href */
export const REACH = "[data-action]:not(button, a[href], input, select, textarea, summary, [tabindex], [disabled]), nav.pust-tabs > a[data-tab]:not([href], [tabindex])";

/** Windows of the system (sheets, terminal, builders, cards): Foundry's own windows keep their own ways */
const OURS = ".wastelanders, .pust-sheet, [class*='pust-']";

/** Gives the controls under `root` a place in the Tab order; returns how many */
export function addTabStops(root) {
  if (!root?.querySelectorAll || !(root.matches?.(OURS) || root.querySelector?.(OURS))) return 0;
  let n = 0;
  for (const el of root.querySelectorAll(REACH)) {
    if (el.closest(".window-header")) continue;
    el.tabIndex = 0;
    el.dataset.pustKey = "";
    if (!el.getAttribute("role")) el.setAttribute("role", el.matches("nav.pust-tabs > a") ? "tab" : "button");
    n++;
  }
  return n;
}

/** Enter / Space on such an element clicks it (a real button does that by itself) */
export function keyToClick(ev) {
  if (ev.key !== "Enter" && ev.key !== " ") return false;
  const el = ev.target;
  if (!el?.matches?.("[data-pust-key]")) return false;
  ev.preventDefault();
  el.click();
  return true;
}

export function initKeyboardReach() {
  // AppV2 passes the element (often a <form>, whose [0] is its first field, not itself); AppV1 passes jQuery
  const rootOf = (app, html) => (html instanceof HTMLElement ? html : html?.[0] instanceof HTMLElement ? html[0] : app?.element?.[0] ?? app?.element);
  for (const h of ["renderApplicationV2", "renderApplication"]) Hooks.on(h, (app, html) => addTabStops(rootOf(app, html)));
  document.addEventListener("keydown", keyToClick);
}
