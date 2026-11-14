/**
 * Sticker notes («Примітки») of «Мапа Пустки»: the pure maths and data, no Foundry objects (module/canvas/map-notes.mjs draws and edits them).
 * Mirrors the HTML terminal's map.js (MAP_NOTE, fold/min). Test: tests/map-notes.test.mjs
 */

/** 3×3 cells (author, 2026-11-14; the HTML map has 7×5), folded 1×1; the colours come from the terminal's `.zc-*` zones */
export const MAP_NOTE = {
  w: 3, h: 3, color: "yellow",
  colors: {
    yellow: { label: "Жовтий", fill: "#f6df73", line: "#b8952a" },
    blue: { label: "Синій", fill: "#aed3ee", line: "#4f86b0" },
    green: { label: "Зелений", fill: "#bddf9c", line: "#5f9440" },
    red: { label: "Червоний", fill: "#f3b0a1", line: "#b65645" },
    purple: { label: "Фіолетовий", fill: "#d4c0ec", line: "#8565b0" },
  },
  fontFamily: "Roboto Condensed",
  ink: "#2a261c",
  /** the title strip's height, in cells (the strip is where a sticker is grabbed) */
  stripH: 0.34,
};

export const NOTE_DEFAULT_TITLE = "Примітка";

/** A note's flag with every field filled in */
export function normalizeNote(flag) {
  const f = flag && typeof flag === "object" ? flag : {};
  const color = MAP_NOTE.colors[f.color] ? f.color : MAP_NOTE.color;
  const full = f.full && Number(f.full.w) > 0 && Number(f.full.h) > 0 ? { w: Number(f.full.w), h: Number(f.full.h) } : null;
  return { title: String(f.title ?? ""), text: String(f.text ?? ""), color, min: !!f.min, locked: !!f.locked, full };
}

/** Round a coordinate to the grid (`origin` — where the grid starts) */
export function snapCoord(v, size, origin = 0) {
  return origin + Math.round((v - origin) / size) * size;
}

/** Keep a w×h box with its top-left at (x, y) inside the rectangle {x, y, width, height}; a box larger than the rectangle sticks to its top-left */
export function clampToRect(x, y, w, h, rect) {
  const mx = Math.max(rect.x, rect.x + rect.width - w);
  const my = Math.max(rect.y, rect.y + rect.height - h);
  return { x: Math.max(rect.x, Math.min(x, mx)), y: Math.max(rect.y, Math.min(y, my)) };
}

/** The top-left of a new w×h note centred on (cx, cy), snapped to the grid (`origin` {x, y}) and clamped into the scene rectangle */
export function placeNew(cx, cy, w, h, size, rect, origin = { x: rect.x, y: rect.y }) {
  const x = snapCoord(cx - w / 2, size, origin.x), y = snapCoord(cy - h / 2, size, origin.y);
  return clampToRect(x, y, w, h, rect);
}

/** A dragged note's end point: the start plus the pointer's move, snapped to the grid and clamped */
export function dragEnd(start, dx, dy, w, h, size, rect, origin = { x: rect.x, y: rect.y }) {
  return clampToRect(snapCoord(start.x + dx, size, origin.x), snapCoord(start.y + dy, size, origin.y), w, h, rect);
}

/** The note's size in pixels: 3×3 cells or, folded, 1×1 */
export function noteSize(flag, size) {
  return flag?.min ? { w: size, h: size } : { w: MAP_NOTE.w * size, h: MAP_NOTE.h * size };
}

/** Folding: the new flag part (min, full) and the new size; the full size is kept to unfold to */
export function foldGeometry(flag, shape, size) {
  return { min: true, full: { w: shape.width, h: shape.height }, w: size, h: size };
}

/** Unfolding: the size to go back to (kept, else 3×3 cells) and the top-left clamped so the note stays inside the scene */
export function unfoldGeometry(flag, x, y, size, rect) {
  const f = flag?.full;
  const w = f?.w > 0 ? f.w : MAP_NOTE.w * size, h = f?.h > 0 ? f.h : MAP_NOTE.h * size;
  return { min: false, w, h, ...clampToRect(x, y, w, h, rect) };
}

/** An old note kept its words in Foundry's own text: the first line is the title, the rest the body */
export function splitLegacyText(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const first = lines.findIndex((l) => l.trim() !== "");
  if (first < 0) return { title: "", text: "" };
  return { title: lines[first].trim(), text: lines.slice(first + 1).join("\n").replace(/^\n+/, "").replace(/\s+$/, "") };
}

/** Is a point inside a note's rectangle */
export function hitNote(px, py, note) {
  return px >= note.x && px < note.x + note.w && py >= note.y && py < note.y + note.h;
}

/** Is a point on the grab strip: the whole of a folded marker, else the title strip at the top */
export function onGrabStrip(px, py, note, flag, size) {
  if (!hitNote(px, py, note)) return false;
  return !!flag?.min || py < note.y + MAP_NOTE.stripH * size;
}

/** Cut a title to a chip's length */
export function chipText(title, max = 18) {
  const t = String(title ?? "").trim() || NOTE_DEFAULT_TITLE;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * The update that moves an old note's words from Foundry's text into the flag (or null when there is nothing to do):
 * `drawing` = { _id, text, flag }. An old folded note kept its full text in `flag.full.text` (its own text was only the label).
 */
export function legacyUpdate(drawing, systemId) {
  const flag = drawing.flag;
  if (!flag || flag.title !== undefined || flag.text !== undefined) return null;
  const src = flag.min && flag.full && flag.full.text ? flag.full.text : drawing.text;
  const hasOld = !!String(drawing.text ?? "").trim() || !!(flag.full && "text" in flag.full);
  if (!hasOld) return null;
  const { title, text } = splitLegacyText(src);
  const p = `flags.${systemId}.mapNote`;
  const u = { _id: drawing._id, text: "", [`${p}.title`]: title, [`${p}.text`]: text };
  if (flag.full && "text" in flag.full) u[`${p}.full.-=text`] = null;
  if (flag.full && "fontSize" in flag.full) u[`${p}.full.-=fontSize`] = null;
  return u;
}
