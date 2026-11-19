/**
 * Round tokens on black (author, 2026-11-19): the HTML character sheet stores every portrait as a JPEG, so a round token
 * with a transparent background comes back from a .json as a disk on black and showed black corners on the scene. Here
 * a picture is recognised as such a disk; the Foundry side (applications/character-json.mjs) then crops it to the disk
 * and makes everything outside it transparent. Anything else stays as it is.
 * Pure: works on RGBA pixels, tested in tests/round-portrait.test.mjs.
 */

/** Darker than this in every channel (or nearly transparent) counts as background: JPEG noise around black stays below */
const DARK = 40;
const isBg = (px, i) => px[i + 3] < 32 || (px[i] < DARK && px[i + 1] < DARK && px[i + 2] < DARK);

/**
 * The disk of a round token on a black or transparent background, or null for any other picture.
 * @param {Uint8ClampedArray|Uint8Array|number[]} px  RGBA pixels, row by row
 * @returns {{cx:number, cy:number, r:number}|null}  centre and radius in pixels
 */
export function findRoundToken(px, w, h) {
  if (!(w >= 16 && h >= 16) || px.length < w * h * 4) return null;
  const bgAt = (x, y) => isBg(px, (y * w + x) * 4);
  // the picture's own corners are background
  if (![[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]].every(([x, y]) => bgAt(x, y))) return null;
  // the box of what is not background (a row / column counts with a few such pixels: stray JPEG noise doesn't)
  const rows = new Array(h).fill(0), cols = new Array(w).fill(0);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!bgAt(x, y)) { rows[y]++; cols[x]++; }
  const minRow = Math.max(2, Math.ceil(w * 0.005)), minCol = Math.max(2, Math.ceil(h * 0.005));
  const y0 = rows.findIndex((c) => c >= minRow), y1 = h - 1 - [...rows].reverse().findIndex((c) => c >= minRow);
  const x0 = cols.findIndex((c) => c >= minCol), x1 = w - 1 - [...cols].reverse().findIndex((c) => c >= minCol);
  if (y0 < 0 || x0 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (Math.min(bw, bh) < 12 || Math.abs(bw - bh) > 0.08 * Math.max(bw, bh)) return null; // a disk's box is a square
  const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2, r = (bw + bh) / 4;
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  // the disk is full to its edge: just inside the circle there is picture all the way round
  let full = 0;
  const N = 96;
  for (let k = 0; k < N; k++) {
    const a = (2 * Math.PI * k) / N;
    let hits = 0;
    for (const f of [0.84, 0.9, 0.95]) {
      const x = Math.floor(cx + Math.cos(a) * r * f), y = Math.floor(cy + Math.sin(a) * r * f);
      if (inside(x, y) && !bgAt(x, y)) hits++;
    }
    if (hits >= 2) full++;
  }
  if (full < N * 0.8) return null;
  // and outside it (the corners of its box) only background
  let out = 0, outBg = 0;
  const r2 = (r * 1.05) ** 2;
  for (let y = Math.max(0, Math.floor(cy - r)); y < Math.min(h, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(w, Math.ceil(cx + r)); x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) continue;
      out++;
      if (bgAt(x, y)) outBg++;
    }
  }
  if (!out || outBg < out * 0.97) return null;
  return { cx, cy, r };
}

/**
 * Where to cut the token: a square around the disk and the radius of the round mask in it. The mask sits a little
 * inside the disk's edge, so the soft dark seam JPEG leaves around it stays outside.
 */
export function roundCrop({ cx, cy, r }) {
  const size = Math.max(1, Math.round(r * 2));
  return { x: cx - size / 2, y: cy - size / 2, size, r: size / 2 - Math.max(1, size * 0.008) };
}
