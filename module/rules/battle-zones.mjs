/**
 * Battle zones on «Бойова мапа» (author, 2026-11-14) — pure geometry and data, no Foundry globals.
 * A zone is a Drawing flagged `flags[system].battleZone = { name, color, aspects: [{t, inv}] }`, a rectangle on the grid
 * (x, y, shape.width, shape.height in scene pixels). Zones may overlap (author, 2026-11-14; the tracker forbade it); a new
 * zone still prefers a free spot. A token belongs to the zone its centre is in (the top one where they overlap). The look and the pointer work: module/canvas/battle-zones.mjs.
 */
import { zoneFree, ZONE_COLORS } from "./battle.mjs";

/** Sizes in cells; the colours are the stickers' (map-notes MAP_NOTE.colors), keys as the tracker's */
export const ZONE = { w: 6, h: 5, minW: 3, minH: 3, stripH: 0.5, color: "yellow" };
export { ZONE_COLORS };

/** A zone flag brought into shape */
export function normalizeZone(f = {}) {
  return {
    name: String(f.name ?? "").trim() || "Зона",
    color: ZONE_COLORS[f.color] ? f.color : ZONE.color,
    aspects: (Array.isArray(f.aspects) ? f.aspects : []).map((a) => (a && typeof a === "object" ? { t: String(a.t ?? ""), inv: Math.max(0, Math.round(+a.inv || 0)) } : { t: String(a ?? ""), inv: 0 })).filter((a) => a.t.trim()),
  };
}

const snap = (v, g, o = 0) => Math.round((v - o) / g) * g + o;

/** A free w × h spot nearest to (cx, cy), on the grid, inside bounds; null when the scene is full */
export function placeNear(cx, cy, w, h, zones, bounds, g, origin = { x: 0, y: 0 }) {
  const x0 = snap(cx - w / 2, g, origin.x), y0 = snap(cy - h / 2, g, origin.y);
  // every grid position of the scene, nearest first — measured in the zone's own size, so the zone right beside comes
  // before the one above; the same row is preferred a little, then right before left
  const spots = [];
  for (let y = snap(bounds.y, g, origin.y); y + h <= bounds.y + bounds.h; y += g) {
    for (let x = snap(bounds.x, g, origin.x); x + w <= bounds.x + bounds.w; x += g) {
      const cost = Math.hypot((x - x0) / w, ((y - y0) / h) * 1.15) + (x < x0 ? 1e-3 : 0);
      spots.push([cost, x, y]);
    }
  }
  spots.sort((a, b) => a[0] - b[0]);
  for (const [, x, y] of spots) {
    const rect = { x, y, w, h };
    if (zoneFree(rect, zones, undefined, bounds)) return rect;
  }
  return null;
}

/** Moved by (dx, dy): snapped, kept inside bounds */
export function moveRect(rect, dx, dy, g, bounds, origin = { x: 0, y: 0 }) {
  const x = Math.min(Math.max(snap(rect.x + dx, g, origin.x), bounds.x), bounds.x + bounds.w - rect.w);
  const y = Math.min(Math.max(snap(rect.y + dy, g, origin.y), bounds.y), bounds.y + bounds.h - rect.h);
  return { x, y, w: rect.w, h: rect.h };
}

/** Resized from its bottom-right corner by (dx, dy): whole cells, at least minW × minH, inside bounds */
export function resizeRect(rect, dx, dy, g, bounds) {
  const w = Math.max(ZONE.minW * g, Math.min(snap(rect.w + dx, g), bounds.x + bounds.w - rect.x));
  const h = Math.max(ZONE.minH * g, Math.min(snap(rect.h + dy, g), bounds.y + bounds.h - rect.y));
  return { x: rect.x, y: rect.y, w, h };
}

/** «Зона N»: the first number no zone uses yet */
export function nextZoneName(names) {
  const used = new Set(names);
  for (let n = 1; ; n++) if (!used.has(`Зона ${n}`)) return `Зона ${n}`;
}

/** Aspect list helpers (the tracker's zaddasp / zrmasp / inv) */
export const addAspect = (list, t) => (String(t || "").trim() ? [...list, { t: String(t).trim(), inv: 0 }] : list);
export const removeAspect = (list, i) => list.filter((_, k) => k !== i);
export const stepInv = (list, i, d) => list.map((a, k) => (k === i ? { ...a, inv: Math.max(0, a.inv + d) } : a));
