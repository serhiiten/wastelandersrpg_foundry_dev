/**
 * Where the GM's «Кінець сцени» / «Новий день» / «Кінець сесії» stand (author, 2026-11-21): in the top row right of «Термінал»
 * and «Ходи» when they fit there; in a second row under the plates only when in the top row they would run over a panel on
 * the right («Сцена» / «Битва», the sidebar). Pure: rectangles in, "top" / "below" out (tests/end-row-place.test.mjs).
 */

/** do two boxes {left, top, right, bottom} share more than a hairline */
export const crosses = (a, b, px = 1) => a.left < b.right - px && a.right > b.left + px && a.top < b.bottom - px && a.bottom > b.top + px;

/**
 * @param {{right:number, top:number, bottom:number}} plates  the two plates together (their right edge, their row)
 * @param {{width:number, height:number}} row  the buttons' size, the strip under them included (it shows on hover)
 * @param {Array<{left:number, top:number, right:number, bottom:number}>} panels  what must stay clear
 * @param {number} gap  between «Ходи» and the first button
 * @returns {"top"|"below"}
 */
export function endRowPlace(plates, row, panels, gap = 8) {
  const left = plates.right + gap;
  const top = plates.top + Math.max(0, (plates.bottom - plates.top - row.btnHeight) / 2 || 0);
  const box = { left, top, right: left + row.width, bottom: top + row.height };
  return panels.some((p) => p && p.right > p.left && p.bottom > p.top && crosses(box, p)) ? "below" : "top";
}
