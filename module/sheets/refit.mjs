/** Wrapping fields measure their height only once laid out: refit them a frame after render and whenever the window's
 *  width changes (author, 2026-11-15: a field opened in a narrow window kept one line; widening didn't shrink it back) */
export function refitOnResize(app, fits) {
  const box = app.element.querySelector(".window-content") || app.element;
  // the scroll a re-render had (author, 2026-11-15): kept as it was — the browser's scroll anchoring moved it a few px
  // each time the fields refit (changing a weapon's type crept the sheet down)
  const keep = app._pustScroll;
  app._pustScroll = null;
  if (keep != null) box.scrollTop = keep;
  requestAnimationFrame(() => {
    fits.forEach((f) => f(true));
    if (keep != null) box.scrollTop = keep;
  });
  app._pustRO?.disconnect();
  let lastW = Math.round(box.clientWidth);
  app._pustRO = new ResizeObserver(() => {
    const w = Math.round(box.clientWidth);
    if (w === lastW) return;
    lastW = w;
    fits.forEach((f) => f(true));
  });
  app._pustRO.observe(box);
}

/** Call in the sheet's _preRender: the scroll to keep through the re-render (refitOnResize puts it back) */
export function rememberScroll(app) {
  const wc = app.element?.querySelector?.(".window-content");
  app._pustScroll = wc ? wc.scrollTop : null;
}

/** The note editors' heights the user set by the corner (author, 2026-11-15): kept while the sheet is open, through its
 *  re-renders (a save re-renders it) */
export function keepNoteSizes(app, root) {
  app._pustNoteH ||= {};
  app._pustNoteRO?.disconnect();
  app._pustNoteRO = new ResizeObserver((entries) => {
    for (const e of entries) {
      const k = e.target.closest("prose-mirror[data-note]")?.dataset.note;
      if (k && e.target.dataset.sized) app._pustNoteH[k] = Math.round(e.target.getBoundingClientRect().height);
    }
  });
  root.querySelectorAll("prose-mirror[data-note]").forEach((el) => {
    const area = el.querySelector(".editor-content");
    if (!area) return;
    const h = app._pustNoteH[el.dataset.note];
    if (h) area.style.height = `${h}px`;
    requestAnimationFrame(() => { area.dataset.sized = "1"; app._pustNoteRO.observe(area); });
  });
}

/** Note editors (author, 2026-11-15): `save(el)` runs half a second after any change of the text — typing, a table, a
 *  link, a format from the toolbar (a MutationObserver on the editor, since the toolbar's commands send no input event) —
 *  and when the editor is left; read-only sheets get a disabled editor */
export function watchNotes(app, root, save, editable = true) {
  for (const o of app._pustNoteMO || []) o.disconnect();
  app._pustNoteMO = [];
  app._pustNoteTimer ||= {};
  root.querySelectorAll("prose-mirror[data-note]").forEach((el) => {
    if (!editable) { el.setAttribute("disabled", ""); return; }
    const k = el.dataset.note;
    const later = () => { clearTimeout(app._pustNoteTimer[k]); app._pustNoteTimer[k] = setTimeout(() => save(el), 500); };
    // the whole element: its editor is built after the sheet renders (a custom element), so it may not be there yet;
    // a change of the menu only costs a compare (save() writes nothing when the text is the same)
    const mo = new MutationObserver(later);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    app._pustNoteMO.push(mo);
    el.addEventListener("focusout", () => setTimeout(() => save(el), 0));
  });
}
