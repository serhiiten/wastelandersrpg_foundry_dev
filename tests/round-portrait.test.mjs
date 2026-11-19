// Round tokens on black (author, 2026-11-19): a disk on black / transparent is found; any other picture is left alone
import { findRoundToken, roundCrop } from "../module/rules/round-portrait.mjs";

let n = 0;
const ok = (c, m) => { n++; if (!c) { console.error("FAIL", m); process.exit(1); } };

/** A w × h picture: paint(x, y) → [r, g, b, a] */
const img = (w, h, paint) => {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set(paint(x, y), (y * w + x) * 4);
  return px;
};
let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
/** Picture-like colours (never near black), with noise */
const colour = (x, y) => [60 + ((x * 7 + y * 3) % 150), 80 + ((x * 2 + y * 5) % 120), 70 + Math.floor(rnd() * 90), 255];
/** JPEG-like black: a little noise */
const black = () => [Math.floor(rnd() * 22), Math.floor(rnd() * 22), Math.floor(rnd() * 22), 255];
const clear = () => [0, 0, 0, 0];
const disk = (cx, cy, r, bg = black, ink = colour) => (x, y) => ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r ? ink(x, y) : bg(x, y));
const near = (a, b, d = 2) => Math.abs(a - b) <= d;

// 1. a round token on black filling the picture (the HTML sheet's JPEG of a round PNG)
{
  const f = findRoundToken(img(200, 200, disk(100, 100, 99)), 200, 200);
  ok(f && near(f.cx, 100) && near(f.cy, 100) && near(f.r, 99), `round on black: ${JSON.stringify(f)}`);
  const c = roundCrop(f);
  ok(near(c.size, 198) && near(c.x, 1) && near(c.y, 1) && c.r < c.size / 2 && c.r > c.size / 2 - 4, `crop ${JSON.stringify(c)}`);
}
// 2. a small disk off-centre on a wide black field (black frame round the token)
{
  const f = findRoundToken(img(300, 220, disk(120, 100, 60)), 300, 220);
  ok(f && near(f.cx, 120) && near(f.cy, 100) && near(f.r, 60), `disk in a black frame: ${JSON.stringify(f)}`);
}
// 3. a round token on a transparent background
ok(findRoundToken(img(128, 128, disk(64, 64, 62, clear)), 128, 128), "round on transparent");
// 4. a round token with a black ring round it: the disk inside the ring is found
{
  const ring = (x, y) => { const d = Math.hypot(x + 0.5 - 100, y + 0.5 - 100); return d <= 80 ? colour(x, y) : black(); };
  const f = findRoundToken(img(200, 200, ring), 200, 200);
  ok(f && near(f.r, 80), `black ring: ${JSON.stringify(f)}`);
}
// 5. a square picture with no black: left alone
ok(!findRoundToken(img(160, 200, colour), 160, 200), "square photo");
// 6. a square picture inside black edges: its corners aren't black, left alone
ok(!findRoundToken(img(200, 200, (x, y) => (x > 20 && x < 180 && y > 20 && y < 180 ? colour(x, y) : black())), 200, 200), "square in black edges");
// 7. a letterboxed picture (black bars above and below): not a square, left alone
ok(!findRoundToken(img(200, 200, (x, y) => (y > 40 && y < 160 ? colour(x, y) : black())), 200, 200), "letterbox");
// 8. a figure on black (a cross): not a full disk, left alone
ok(!findRoundToken(img(200, 200, (x, y) => (Math.abs(x - 100) < 15 || Math.abs(y - 100) < 15) && x > 5 && x < 195 && y > 5 && y < 195 ? colour(x, y) : black()), 200, 200), "cross on black");
// 9. a dark portrait whose disk is half black at its edge: not sure it's a disk, left alone
ok(!findRoundToken(img(200, 200, disk(100, 100, 95, black, (x, y) => (x < 100 ? colour(x, y) : black()))), 200, 200), "half-dark disk");
// 10. an oval: left alone
ok(!findRoundToken(img(240, 200, (x, y) => (((x + 0.5 - 120) / 110) ** 2 + ((y + 0.5 - 100) / 80) ** 2 <= 1 ? colour(x, y) : black())), 240, 200), "oval");
// 11. all black, too small, short data
ok(!findRoundToken(img(64, 64, black), 64, 64), "all black");
ok(!findRoundToken(img(10, 10, disk(5, 5, 5)), 10, 10), "too small");
ok(!findRoundToken(new Uint8ClampedArray(16), 100, 100), "short data");
// 12. a rounded-corner square (a common frame): its corners are black but the box's diagonal is full → not a disk
{
  const R = 30;
  const rr = (x, y) => { const dx = Math.max(0, Math.abs(x + 0.5 - 100) - (90 - R)), dy = Math.max(0, Math.abs(y + 0.5 - 100) - (90 - R)); return dx * dx + dy * dy <= R * R ? colour(x, y) : black(); };
  ok(!findRoundToken(img(200, 200, rr), 200, 200), "rounded square");
}
console.log(`round-portrait OK (${n} checks)`);
