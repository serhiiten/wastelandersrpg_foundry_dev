/** Wrapping fields measure their height only once laid out: refit them a frame after render and whenever the window's
 *  width changes (author, 2026-11-15: a field opened in a narrow window kept one line; widening didn't shrink it back) */
export function refitOnResize(app, fits) {
  requestAnimationFrame(() => fits.forEach((f) => f(true)));
  app._pustRO?.disconnect();
  const box = app.element.querySelector(".window-content") || app.element;
  let lastW = Math.round(box.clientWidth);
  app._pustRO = new ResizeObserver(() => {
    const w = Math.round(box.clientWidth);
    if (w === lastW) return;
    lastW = w;
    fits.forEach((f) => f(true));
  });
  app._pustRO.observe(box);
}
