// Sticker notes' pure helpers (module/rules/map-notes.mjs). Run: node tests/map-notes.test.mjs
import { MAP_NOTE, chipText, legacyUpdate, clampToRect, dragEnd, foldGeometry, hitNote, normalizeNote, onGrabStrip, placeNew, snapCoord, splitLegacyText, unfoldGeometry } from "../module/rules/map-notes.mjs";

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
// legacy text
eq(splitLegacyText("Лігво\nперший рядок\nдругий"), { title: "Лігво", text: "перший рядок\nдругий" }, "split");
eq(splitLegacyText("Тільки заголовок"), { title: "Тільки заголовок", text: "" }, "title only");
eq(splitLegacyText("\r\n  Склад \r\n\r\nтекст  \r\n"), { title: "Склад", text: "текст" }, "crlf and blanks");
eq(splitLegacyText(""), { title: "", text: "" }, "empty"); eq(splitLegacyText(null), { title: "", text: "" }, "null");
// flag
eq(normalizeNote(undefined), { title: "", text: "", color: "yellow", min: false, locked: false, full: null }, "normalize empty");
eq(normalizeNote({ color: "nope", min: 1, full: { w: 0, h: 5 } }).full, null, "bad full dropped");
eq(normalizeNote({ color: "blue", title: "a", text: "b", locked: true }).color, "blue", "colour kept");
ok(Object.keys(MAP_NOTE.colors).join() === "yellow,blue,green,red,purple", "five colours");
// hit and grab strip
const note = { x: 400, y: 300, w: 700, h: 500 };
ok(hitNote(400, 300, note) && !hitNote(1100, 300, note) && !hitNote(399, 300, note), "hit edges");
ok(onGrabStrip(500, 320, note, {}, S) && !onGrabStrip(500, 400, note, {}, S), "strip is the top 0.34 cell");
ok(onGrabStrip(450, 350, { x: 400, y: 300, w: 100, h: 100 }, { min: true }, S), "folded: all of it");
ok(!onGrabStrip(50, 50, note, {}, S), "outside");
eq(chipText("  "), "Примітка", "chip default"); eq(chipText("12345678901234567890", 8), "1234567…", "chip cut");
// legacy conversion
eq(legacyUpdate({ _id: "a", text: "Лігво\nрядок", flag: { color: "blue" } }, "ws"),
  { _id: "a", text: "", "flags.ws.mapNote.title": "Лігво", "flags.ws.mapNote.text": "рядок" }, "legacy unfolded");
const lf = legacyUpdate({ _id: "b", text: "Лігво", flag: { min: true, full: { w: 700, h: 500, text: "Лігво\nдовгий текст", fontSize: 28 } } }, "ws");
eq(lf["flags.ws.mapNote.title"], "Лігво", "legacy folded title"); eq(lf["flags.ws.mapNote.text"], "довгий текст", "legacy folded body from full.text");
ok("flags.ws.mapNote.full.-=text" in lf && "flags.ws.mapNote.full.-=fontSize" in lf, "legacy folded drops old full fields");
eq(legacyUpdate({ _id: "c", text: "x", flag: { title: "done" } }, "ws"), null, "already converted");
eq(legacyUpdate({ _id: "d", text: "", flag: { color: "red" } }, "ws"), null, "nothing to convert");
eq(legacyUpdate({ _id: "e", text: "x" }, "ws"), null, "not a note");

if (failures) { console.log(`${failures} failures`); process.exit(1); }
console.log("map-notes: OK");
