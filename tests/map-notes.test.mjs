// Sticker notes' pure helpers (module/rules/map-notes.mjs). Run: node tests/map-notes.test.mjs
import { MAP_NOTE, chipText, clampToRect, dragEnd, foldGeometry, hitNote, normalizeNote, noteSize, onGrabStrip, onResizeGrip, placeNew, resizeEnd, snapCoord, unfoldGeometry } from "../module/rules/map-notes.mjs";

let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.log("FAIL " + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);

const S = 100, rect = { x: 200, y: 100, width: 2000, height: 1500 };
eq(snapCoord(249, S, 200), 200, "snap down"); eq(snapCoord(251, S, 200), 300, "snap up"); eq(snapCoord(0, S), 0, "snap zero");
eq(clampToRect(0, 0, 700, 500, rect), { x: 200, y: 100 }, "clamp top-left");
eq(clampToRect(5000, 5000, 700, 500, rect), { x: 1500, y: 1100 }, "clamp bottom-right");
eq(clampToRect(400, 300, 700, 500, rect), { x: 400, y: 300 }, "inside stays");
eq(clampToRect(900, 900, 3000, 3000, rect), { x: 200, y: 100 }, "bigger than the scene sticks to top-left");
// new at the view centre
const p = placeNew(1200, 850, 700, 500, S, rect);
eq(p, { x: 900, y: 600 }, "placeNew centre"); ok((p.x - rect.x) % S === 0 && (p.y - rect.y) % S === 0, "placeNew on the grid");
eq(placeNew(-999, -999, 700, 500, S, rect), { x: 200, y: 100 }, "placeNew clamps");
// drag: moves, snaps, clamps
eq(dragEnd({ x: 400, y: 300 }, 130, -20, 700, 500, S, rect), { x: 500, y: 300 }, "dragEnd snap");
eq(dragEnd({ x: 400, y: 300 }, 9999, 9999, 700, 500, S, rect), { x: 1500, y: 1100 }, "dragEnd clamp");
eq(dragEnd({ x: 400, y: 300 }, 3, 2, 700, 500, S, rect), { x: 400, y: 300 }, "a tiny move stays");
// fold / unfold
const fo = foldGeometry({}, { width: 700, height: 500 }, S);
eq(fo, { min: true, full: { w: 700, h: 500 }, w: 100, h: 100 }, "fold");
eq(unfoldGeometry({ full: fo.full }, 1900, 1500, S, rect), { min: false, w: 700, h: 500, x: 1500, y: 1100 }, "unfold clamps");
eq(unfoldGeometry({}, 300, 300, S, rect), { min: false, w: 300, h: 300, x: 300, y: 300 }, "unfold default 3x3");
// flag
eq(normalizeNote(undefined), { title: "", text: "", color: "yellow", min: false, locked: false, full: null, author: "" }, "normalize empty");
eq(normalizeNote({ color: "nope", min: 1, full: { w: 0, h: 5 } }).full, null, "bad full dropped");
eq(normalizeNote({ color: "blue", title: "a", text: "b", locked: true }).color, "blue", "colour kept");
ok(Object.keys(MAP_NOTE.colors).join() === "yellow,blue,green,red,purple", "five colours");
// hit and grab strip
const note = { x: 400, y: 300, w: 700, h: 500 };
ok(hitNote(400, 300, note) && !hitNote(1100, 300, note) && !hitNote(399, 300, note), "hit edges");
ok(onGrabStrip(500, 320, note, {}, S) && !onGrabStrip(500, 400, note, {}, S), "strip is the top 0.34 cell");
ok(onGrabStrip(450, 350, { x: 400, y: 300, w: 100, h: 100 }, { min: true }, S), "folded: all of it");
ok(!onGrabStrip(50, 50, note, {}, S), "outside");
// size (author, 2026-11-18: resized stickers keep the drawing's shape)
eq(noteSize({}, S), { w: 300, h: 300 }, "size without a shape: 3×3");
eq(noteSize({}, S, { width: 500, height: 200 }), { w: 500, h: 200 }, "size from the shape");
eq(noteSize({ min: true }, S, { width: 500, height: 200 }), { w: 100, h: 100 }, "folded: 1×1 whatever the shape");
// the resize grip: the bottom-right corner, never on a folded marker
const big = { x: 400, y: 300, w: 300, h: 300 };
ok(onResizeGrip(690, 590, big, {}, S) && !onResizeGrip(600, 590, big, {}, S) && !onResizeGrip(690, 590, big, { min: true }, S), "grip corner");
eq(resizeEnd(big, 130, -20, S, rect), { w: 400, h: 300 }, "resize snaps to cells");
eq(resizeEnd(big, -900, -900, S, rect), { w: 200, h: 200 }, "resize: 2×2 at least");
eq(resizeEnd(big, 99999, 99999, S, rect), { w: 1800, h: 1300 }, "resize: inside the scene");
// a two-line title's strip
ok(onGrabStrip(500, 350, big, {}, S, 60) && !onGrabStrip(500, 350, big, {}, S), "grab strip follows its height");
eq(normalizeNote({ author: "Оля" }).author, "Оля", "author kept"); eq(normalizeNote({}).author, "", "no author");
eq(chipText("  "), "Примітка", "chip default"); eq(chipText("12345678901234567890", 8), "1234567…", "chip cut");
if (failures) { console.log(`${failures} failures`); process.exit(1); }
console.log("map-notes: OK");
