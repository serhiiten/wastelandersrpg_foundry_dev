/**
 * Battle zones («Зони») on «Бойова мапа» (author, 2026-11-14) — the HTML battle tracker's zone field on the canvas, built
 * on the map's sticker notes (module/canvas/map-notes.mjs): a Drawing flagged
 * `flags[system].battleZone = { name, color, aspects: [{t, inv}] }`, drawn by the system (a see-through field in the zone's
 * colour, a title strip, the aspects as chips with their free invokes), under the tokens. The GM moves a zone by its strip,
 * resizes it by its corner (whole cells; zones may overlap — author, 2026-11-14) and edits it on double-click in an inline editor: the
 * name (with a die: a name from the battle place's pool), the colour, the aspects (+, a die, −/+ free invokes, ×),
 * «Обрати всіх» (targets every token still standing in the zone), delete (asks twice). Players see the zones, read-only;
 * everyone has «Обрати всіх» as a button (crosshair + label) at the strip's right end (author, 2026-11-15); a second click
 * while exactly the zone's tokens are the targets takes them off.
 * Pure parts: module/rules/battle-zones.mjs, module/rules/battle.mjs.
 *
 * Wiring (wastelanders.mjs): `initBattleZones()` in `init` after `initMapNotes()`, `readyBattleZones()` in `ready`.
 */
import { ZONE, normalizeZone, placeNear, moveRect, resizeRect, nextZoneName, addAspect, removeAspect, stepInv } from "../rules/battle-zones.mjs";
import { randomZoneName, randomZoneAspect, ZONE_COLORS } from "../rules/battle.mjs";
import { MAP_NOTE } from "../rules/map-notes.mjs";
import { sharedGet } from "../helpers/scene-shared.mjs";
import { notify } from "../helpers/notify.mjs";

const sys = () => game.system.id;
const hex = (s) => parseInt(String(s).replace("#", ""), 16);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const TextClass = () => foundry.canvas?.containers?.PreciseText ?? PIXI.Text;
const COLORS = MAP_NOTE.colors;
const FONT = MAP_NOTE.fontFamily;

/** The normalized zone flag of a Drawing document, or null */
export function zoneOf(doc) {
  const f = doc?.getFlag?.(sys(), "battleZone");
  return f ? normalizeZone(f) : null;
}
const isGM = () => game.user.isGM;
const rectOf = (doc) => ({ id: doc.id, x: doc.x, y: doc.y, w: doc.shape.width, h: doc.shape.height });
/** Every zone of a scene as {id, x, y, w, h, doc} */
export const sceneZones = (scene = canvas?.scene) => (scene?.drawings ?? []).filter((d) => zoneOf(d)).map((d) => ({ ...rectOf(d), doc: d }));
const k = () => canvas.dimensions.size / 100;
const stripH = () => ZONE.stripH * canvas.dimensions.size;
/** «Обрати всіх» on the strip, for everyone (author, 2026-11-15: players had no way to target a zone): a crosshair button
 *  at the strip's right end; its box in the zone's own coordinates */
const TGT_LABEL = "Обрати всіх";
const tgtStyle = (K) => new PIXI.TextStyle({ fontFamily: FONT, fontSize: 17 * K, fontWeight: "800", fill: 0xf2ecd8, letterSpacing: 0.3 * K });
/** The plate fits its content: 9 px, the crosshair (17), 7 px, the label, 10 px; never wider than 60 % of the zone */
const tgtBox = (w) => {
  const K = k(), h = 30 * K;
  let lw = 95 * K;
  try { lw = (PIXI.CanvasTextMetrics ?? PIXI.TextMetrics).measureText(TGT_LABEL, tgtStyle(K)).width; } catch (_) { /* the estimate */ }
  const bw = Math.min(9 * K + 18 * K + 7 * K + lw + 11 * K, Math.max(h, w * 0.6));
  return { x: w - 12 * K - bw, y: (stripH() - h) / 2, s: h, w: bw };
};
/** The height each zone's strip was drawn with (it grows with the aspects' rows): the drag handle follows it */
const STRIP_H = new Map();

/** The zone a token stands in (its centre), or null; where zones overlap, the one drawn on top */
export function zoneOfToken(token, zones = sceneZones(token?.parent)) {
  const d = token?.document ?? token;
  if (!d) return null;
  const size = d.parent?.grid?.size ?? canvas.dimensions.size;
  const cx = d.x + (d.width * size) / 2, cy = d.y + (d.height * size) / 2;
  const hits = zones.filter((z) => cx >= z.x && cx < z.x + z.w && cy >= z.y && cy < z.y + z.h);
  return hits.sort((a, b) => (b.doc?.sort ?? 0) - (a.doc?.sort ?? 0))[0] ?? null;
}

/* ===================== Drawing ===================== */

export function initBattleZones() {
  const Base = CONFIG.Drawing.objectClass;
  CONFIG.Drawing.objectClass = class WastelandersZoneDrawing extends Base {
    #zone = null;
    get isBattleZone() { return !!zoneOf(this.document); }
    get hasText() { return this.isBattleZone ? false : super.hasText; }
    _getFillStyle() { const s = super._getFillStyle(); return this.isBattleZone ? { ...s, alpha: 0 } : s; }
    _getLineStyle() { const s = super._getLineStyle(); return this.isBattleZone ? { ...s, alpha: 0 } : s; }
    _refreshShape() { super._refreshShape(); this.#drawZone(); }
    _refreshState() {
      super._refreshState();
      if (this.isBattleZone && this.shape && !this.shape.destroyed) this.shape.alpha = 1;
    }
    _onUpdate(changed, options, userId) {
      super._onUpdate(changed, options, userId);
      if (this.isBattleZone && ("flags" in changed || "shape" in changed)) this.renderFlags.set({ refreshShape: true });
    }
    _onClickLeft2(event) { if (this.isBattleZone) return; return super._onClickLeft2(event); }

    #drawZone() {
      if (this.#zone && !this.#zone.destroyed) this.#zone.destroy({ children: true });
      this.#zone = null;
      const z = zoneOf(this.document);
      if (!z || !this.shape || this.shape.destroyed) return;
      const K = k(), w = this.document.shape.width, h = this.document.shape.height, sh0 = stripH();
      const col = COLORS[z.color] ?? COLORS.yellow, fill = hex(col.fill), line = hex(col.line), ink = hex(MAP_NOTE.ink);
      const T = TextClass();
      const box = new PIXI.Container();
      box.eventMode = "none";
      const pad = 12 * K;
      const tb = tgtBox(w);
      const right = tb.x - 8 * K; // where the strip's contents end: the «Обрати всіх» button is past it
      // the name (author, 2026-11-17, as «Огляд битви»): the first row with «Обрати всіх» at its right, wrapping when long
      const title = new T(z.name, new PIXI.TextStyle({ fontFamily: FONT, fontSize: 26 * K, fontWeight: "800", fill: ink, letterSpacing: 0.3 * K,
        wordWrap: true, breakWords: true, wordWrapWidth: Math.max(40 * K, right - pad) }));
      const probe = new T("Ag", new PIXI.TextStyle({ fontFamily: FONT, fontSize: 26 * K, fontWeight: "800", letterSpacing: 0.3 * K }));
      const lineH = probe.height; // one line's height, to keep the first line where it was
      probe.destroy();
      const th = Math.max(sh0, title.height + (sh0 - lineH)); // the name's row: one line as before, more when it wraps
      // the aspects: chips on rows of their own under the name, the whole width of the strip; the strip grows with them
      // (never past the zone)
      const chipH = 30 * K, gap = 6 * K, rowH = chipH + gap;
      const full = w - pad;
      const chips = [];
      let x = pad, row = 0;
      for (const a of z.aspects) {
        // italic leans past the width PIXI measures (author, 2026-11-14: «курсив зрізає закінчення»): the texture gets padding,
        // the chip room for the lean
        const lean = 6 * K;
        const text = new T(a.t, new PIXI.TextStyle({ fontFamily: FONT, fontSize: 19 * K, fontWeight: "700", fontStyle: "italic", fill: 0x241a0c, padding: Math.ceil(lean) }));
        const inv = a.inv > 0 ? new T(`+${a.inv}`, new PIXI.TextStyle({ fontFamily: FONT, fontSize: 18 * K, fontWeight: "800", fill: 0xf2ecd8 })) : null;
        const cw = Math.min(full - pad, text.width + lean + 18 * K + (inv ? inv.width + 14 * K : 0));
        if (x + cw > full && x > pad) { x = pad; row += 1; }
        chips.push({ text, inv, cw, x, row });
        x += cw + gap;
      }
      const rows = chips.length ? chips.at(-1).row + 1 : 0;
      const sh = Math.min(h, th + (rows ? rows * rowH + gap * 0.5 : 0));
      STRIP_H.set(this.document.id, sh);
      // the field: a see-through wash of the colour with a solid border
      const field = new PIXI.Graphics();
      field.lineStyle({ width: 4 * K, color: line, alpha: 0.95, alignment: 1 }).beginFill(fill, 0.13).drawRoundedRect(0, 0, w, h, 8 * K).endFill();
      // the strip: the colour, the name in ink
      const strip = new PIXI.Graphics();
      strip.beginFill(fill, 0.92).drawRoundedRect(0, 0, w, sh, 8 * K).drawRect(0, sh / 2, w, sh / 2).endFill();
      strip.lineStyle({ width: 2 * K, color: line, alpha: 0.9 }).moveTo(0, sh).lineTo(w, sh);
      box.addChild(field, strip);
      title.position.set(pad, (sh0 - lineH) / 2); // the first line level with «Обрати всіх»
      const tmask = new PIXI.Graphics();
      tmask.beginFill(0xffffff).drawRect(0, 0, right, th).endFill();
      box.addChild(tmask, title);
      title.mask = tmask;
      // the corner for resizing (GM)
      if (isGM()) {
        const c = new PIXI.Graphics(), s = 22 * K;
        c.beginFill(line, 0.95).drawPolygon([w - 4 * K, h - s, w - 4 * K, h - 4 * K, w - s, h - 4 * K]).endFill();
        box.addChild(c);
      }
      for (const { text, inv, cw, x: cx, row: cr } of chips) {
        const y = th + cr * rowH;
        if (y + chipH > sh - 2 * K) break; // the zone is too short for more rows
        const bg = new PIXI.Graphics();
        bg.beginFill(0x000000, 0.25).drawRoundedRect(cx, y + 1.5 * K, cw, chipH, 4 * K).endFill(); // a soft shadow on the strip
        bg.beginFill(0xe2ad3b, 1).drawRoundedRect(cx, y, cw, chipH, 4 * K).endFill();
        box.addChild(bg);
        const tm = new PIXI.Graphics();
        tm.beginFill(0xffffff).drawRect(cx, y, cw - (inv ? inv.width + 14 * K : 0) - 4 * K, chipH).endFill();
        text.position.set(cx + 9 * K, y + (chipH - text.height) / 2);
        box.addChild(tm, text);
        text.mask = tm;
        if (inv) {
          const ib = new PIXI.Graphics(), iw = inv.width + 10 * K;
          ib.beginFill(0x2f6b35, 1).drawRoundedRect(cx + cw - iw - 3 * K, y + 3 * K, iw, chipH - 6 * K, 3 * K).endFill();
          inv.position.set(cx + cw - iw + 2 * K, y + (chipH - inv.height) / 2);
          box.addChild(ib, inv);
        }
      }
      // «Обрати всіх» (everyone): a dark plate with a crosshair at the strip's right end
      const tbg = new PIXI.Graphics();
      tbg.lineStyle({ width: 2 * K, color: line, alpha: 0.95 }).beginFill(0x241a0c, 0.85).drawRoundedRect(tb.x, tb.y, tb.w, tb.s, 5 * K).endFill();
      const tg = new PIXI.Text("", new PIXI.TextStyle({ fontFamily: "Font Awesome 7 Pro, Font Awesome 6 Pro, Font Awesome 6 Free", fontWeight: "900", fontSize: 17 * K, fill: 0xf2ecd8, padding: 2 }));
      tg.anchor.set(0, 0.5);
      tg.position.set(tb.x + 9 * K, tb.y + tb.s / 2);
      const tl = new T(TGT_LABEL, tgtStyle(K));
      tl.anchor.set(0, 0.5);
      tl.position.set(tg.x + tg.width + 7 * K, tb.y + tb.s / 2);
      // a narrow zone: the label is cut at the plate's edge
      const tlm = new PIXI.Graphics();
      tlm.beginFill(0xffffff).drawRect(tb.x, tb.y, tb.w - 6 * K, tb.s).endFill();
      tl.mask = tlm;
      box.addChild(tbg, tg, tlm, tl);
      this.#zone = this.shape.addChild(box);
    }
  };
}

/* ===================== Pointer work (the GM; from any layer, like the stickers) ===================== */

const viewEl = () => canvas.app?.view;
function pointOf(ev) {
  const r = viewEl().getBoundingClientRect();
  return canvas.canvasCoordinatesFromClient({ x: ev.clientX - r.left, y: ev.clientY - r.top });
}
const tokenAt = (pt) => !!canvas.tokens?.placeables.some((t) => t.visible && t.bounds?.contains(pt.x, pt.y));
function gridOrigin() { try { return canvas.grid.getTopLeftPoint({ x: 0, y: 0 }); } catch { return { x: 0, y: 0 }; } }
const bounds = () => { const r = canvas.dimensions.sceneRect; return { x: r.x, y: r.y, w: r.width, h: r.height }; };

/** The topmost zone under the point and which part was hit: «strip», «corner», «body» */
function zoneAt(pt) {
  let best = null, bestKey = -Infinity;
  (canvas.drawings?.placeables ?? []).forEach((p, i) => {
    const doc = p.document, z = zoneOf(doc);
    if (!z || !p.visible) return;
    const r = rectOf(doc);
    if (pt.x < r.x || pt.x >= r.x + r.w || pt.y < r.y || pt.y >= r.y + r.h) return;
    const key = (doc.sort ?? 0) * 1e5 + i;
    if (key > bestKey) {
      bestKey = key;
      const c = 30 * k();
      const tb = tgtBox(r.w);
      const onTgt = pt.x >= r.x + tb.x && pt.x <= r.x + tb.x + tb.w && pt.y >= r.y + tb.y && pt.y <= r.y + tb.y + tb.s;
      const part = onTgt ? "target" : pt.x >= r.x + r.w - c && pt.y >= r.y + r.h - c ? "corner" : pt.y < r.y + (STRIP_H.get(doc.id) ?? stripH()) ? "strip" : "body";
      best = { doc, placeable: p, zone: z, rect: r, part };
    }
  });
  return best;
}

let drag = null;
function onPointerDown(ev) {
  if (ev.button !== 0 || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.metaKey) return;
  if (!canvas.ready || !canvas.scene) return;
  const pt = pointOf(ev);
  if (tokenAt(pt)) return;
  const hit = zoneAt(pt);
  // «Обрати всіх» on the strip: for everyone, players too
  if (hit?.part === "target") {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    selectZone(hit.doc);
    return;
  }
  if (!isGM()) return;
  if (!hit || hit.part === "body") return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  drag = { ...hit, px: ev.clientX, py: ev.clientY, moved: false, end: null };
  // a zone moved by its strip takes its tokens along (author, 2026-11-17): those whose centre is in it (the top zone where
  // zones overlap, as «Обрати всіх» counts them)
  if (hit.part !== "corner") {
    const zones = sceneZones();
    drag.tokens = canvas.tokens.placeables.filter((t) => zoneOfToken(t, zones)?.doc === hit.doc)
      .map((t) => ({ t, x: t.document.x, y: t.document.y, mx: t.mesh?.position.x, my: t.mesh?.position.y }));
  }
  window.addEventListener("pointermove", onDragMove, true);
  window.addEventListener("pointerup", onDragEnd, true);
  window.addEventListener("pointercancel", onDragCancel, true);
}

function onDragMove(ev) {
  if (!drag) return;
  const s = canvas.stage.worldTransform.a || 1;
  const dx = (ev.clientX - drag.px) / s, dy = (ev.clientY - drag.py) / s;
  if (!drag.moved && Math.hypot(ev.clientX - drag.px, ev.clientY - drag.py) < 4) return;
  drag.moved = true;
  const g = canvas.dimensions.size;
  drag.end = drag.part === "corner" ? resizeRect(drag.rect, dx, dy, g, bounds()) : moveRect(drag.rect, dx, dy, g, bounds(), gridOrigin());
  // the preview: the zone follows (moved) or grows (resized); zones may overlap (author, 2026-11-14)
  const shp = drag.placeable.shape;
  if (drag.part === "corner") {
    // grows from its top-left corner, which stays put (author, 2026-11-14: «картка стрибає»): the shape turns about its
    // centre, so the centre moves with the new size
    shp.pivot.set(drag.rect.w / 2, drag.rect.h / 2);
    shp.scale.set(drag.end.w / drag.rect.w, drag.end.h / drag.rect.h);
    shp.position.set(drag.end.x + drag.end.w / 2, drag.end.y + drag.end.h / 2);
  } else {
    shp.position.set(drag.end.x + drag.doc.shape.width / 2, drag.end.y + drag.doc.shape.height / 2);
    const mx = drag.end.x - drag.rect.x, my = drag.end.y - drag.rect.y;
    // the tokens follow in the preview: the placeable (bars, name, badges) and its picture, which lives on the primary layer
    for (const k of drag.tokens ?? []) {
      k.t.position.set(k.x + mx, k.y + my);
      if (k.t.mesh && k.mx != null) k.t.mesh.position.set(k.mx + mx, k.my + my);
    }
  }
  if (editor?.doc === drag.doc) layoutEditor();
}

function stopListeners() {
  window.removeEventListener("pointermove", onDragMove, true);
  window.removeEventListener("pointerup", onDragEnd, true);
  window.removeEventListener("pointercancel", onDragCancel, true);
}
function resetPreview(d) {
  for (const k of d?.tokens ?? []) if (!k.t.destroyed) k.t.renderFlags.set({ refreshPosition: true });
  if (!d?.placeable?.shape) return;
  d.placeable.shape.scale.set(1, 1);
  d.placeable.shape.tint = 0xffffff;
  d.placeable.renderFlags?.set({ refreshPosition: true, refreshShape: true });
}

async function onDragEnd() {
  const d = drag; drag = null;
  stopListeners();
  if (!d) return;
  const same = !d.moved || !d.end || (d.end.x === d.rect.x && d.end.y === d.rect.y && d.end.w === d.rect.w && d.end.h === d.rect.h);
  if (same) return resetPreview(d);
  // the preview stays until the new size / place is saved, so the zone doesn't flick back for a moment
  try {
    await d.doc.update(d.part === "corner" ? { shape: { width: d.end.w, height: d.end.h } } : { x: d.end.x, y: d.end.y });
    const mx = d.end.x - d.rect.x, my = d.end.y - d.rect.y;
    const moves = (d.tokens ?? []).filter((k) => !k.t.destroyed).map((k) => ({ _id: k.t.document.id, x: k.x + mx, y: k.y + my }));
    if (moves.length && (mx || my)) await canvas.scene.updateEmbeddedDocuments("Token", moves, { animate: false, pustZoneMove: true });
  } catch (err) { console.warn("Пустельники | zone not changed", err); }
  resetPreview(d);
}
function onDragCancel() { const d = drag; drag = null; stopListeners(); resetPreview(d); }

/* ===================== The inline editor ===================== */

let editor = null; // { doc, root, armTimer }
const zpath = (k2) => `flags.${sys()}.battleZone.${k2}`;
/** the battle's place, shared by every scene (helpers/scene-shared.mjs) */
const battlePlace = () => sharedGet("place") ?? "";

function editorHtml(z) {
  const sw = Object.entries(COLORS).map(([key, c]) => `<button type="button" class="pust-mn-sw${key === z.color ? " on" : ""}" data-act="color" data-color="${key}" style="--sw:${c.fill}; --swl:${c.line}" title="${esc(ZONE_COLORS[key] ?? c.label)}" aria-label="${esc(ZONE_COLORS[key] ?? c.label)}"></button>`).join("");
  const chips = z.aspects.map((a, i) => `<span class="pust-bz-chip"><span class="pust-bz-chip-t">${esc(a.t)}</span>`
    + `<span class="pust-bz-inv" title="Безкоштовні Посилення"><button type="button" data-act="inv" data-i="${i}" data-d="-1" aria-label="Мінус 1 безкоштовне Посилення" ${a.inv ? "" : "disabled"}>−</button><b>+${a.inv}</b><button type="button" data-act="inv" data-i="${i}" data-d="1" aria-label="Плюс 1 безкоштовне Посилення">+</button></span>`
    + `<button type="button" class="pust-bz-x" data-act="rmasp" data-i="${i}" title="Прибрати аспект «${esc(a.t)}»" aria-label="Прибрати аспект">×</button></span>`).join("");
  return `<div class="pust-mn-bar pust-bz-bar" role="toolbar" aria-label="Зона">
      <span class="pust-mn-sws">${sw}</span>
      <button type="button" class="pust-mn-btn" data-act="select" title="Зробити ціллю кожного, хто ще стоїть у цій зоні"><i class="fa-solid fa-crosshairs"></i><span>Обрати всіх</span></button>
      <button type="button" class="pust-mn-btn pust-mn-del" data-act="delete"><i class="fa-solid fa-trash"></i><span>Видалити</span></button>
    </div>
    <div class="pust-bz-paper">
      <div class="pust-bz-row"><input type="text" class="pust-bz-name" maxlength="60" value="${esc(z.name)}" aria-label="Назва зони" spellcheck="false">
        <button type="button" class="pust-bz-die" data-act="rndname" title="Випадкова назва${battlePlace() ? ` для місця «${esc(battlePlace())}»` : ""}" aria-label="Випадкова назва"><i class="fa-solid fa-dice"></i></button></div>
      <div class="pust-bz-chips">${chips || `<span class="pust-bz-none">Аспектів поки немає: 1–2 на зону (барикада, іржавий трактор…).</span>`}</div>
      <div class="pust-bz-row"><input type="text" class="pust-bz-asp" maxlength="100" placeholder="+ аспект зони, Enter" aria-label="Новий аспект зони" spellcheck="false">
        <button type="button" class="pust-bz-die" data-act="rndasp" title="Випадковий аспект${battlePlace() ? ` для місця «${esc(battlePlace())}»` : ""}" aria-label="Випадковий аспект"><i class="fa-solid fa-dice"></i></button></div>
    </div>`;
}

export function openZoneEditor(doc) {
  if (!doc || !isGM() || !canvas.ready) return;
  if (editor?.doc === doc) return;
  closeZoneEditor();
  if (!zoneOf(doc)) return;
  const root = document.createElement("div");
  root.className = "pust-mn-edit pust-bz-edit";
  document.body.appendChild(root);
  editor = { doc, root, armTimer: null };
  render();
  root.addEventListener("click", onBarClick);
  root.addEventListener("keydown", onKey);
  root.addEventListener("keyup", (e) => e.stopPropagation());
  root.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
  root.addEventListener("focusout", (e) => { if (e.target.matches(".pust-bz-name") && !root.contains(e.relatedTarget)) saveName(); });
  root.querySelector(".pust-bz-name")?.focus();
}

export function closeZoneEditor() {
  if (!editor) return;
  saveName();
  clearTimeout(editor.armTimer);
  editor.root.remove();
  editor = null;
}

function render() {
  if (!editor) return;
  const z = zoneOf(editor.doc);
  if (!z) return closeZoneEditor();
  const focused = document.activeElement?.closest?.(".pust-bz-edit") ? document.activeElement.className : null;
  const asp = editor.root.querySelector(".pust-bz-asp")?.value ?? "";
  // a name being typed survives a redraw by any other change (colour, aspects…; author, 2026-11-15) unless the name
  // itself changed meanwhile (the die, another GM)
  const nameIn = editor.root.querySelector(".pust-bz-name");
  const typed = nameIn && nameIn.value !== nameIn.dataset.orig && z.name === nameIn.dataset.orig ? nameIn.value : null;
  const col = COLORS[z.color];
  editor.root.style.setProperty("--fill", col.fill);
  editor.root.style.setProperty("--line", col.line);
  editor.root.innerHTML = editorHtml(z);
  editor.root.querySelector(".pust-bz-asp").value = asp;
  const ni = editor.root.querySelector(".pust-bz-name");
  ni.dataset.orig = z.name;
  if (typed !== null) ni.value = typed;
  if (focused?.includes("pust-bz-asp")) editor.root.querySelector(".pust-bz-asp").focus();
  else if (focused?.includes("pust-bz-name")) ni.focus();
  layoutEditor();
}

function saveName() {
  if (!editor) return;
  const input = editor.root.querySelector(".pust-bz-name");
  const z = zoneOf(editor.doc);
  if (!input || !z || !editor.doc.collection) return;
  const v = input.value.trim();
  if (v && v !== z.name) editor.doc.update({ [zpath("name")]: v }).catch(() => {});
}

function onKey(e) {
  e.stopPropagation(); // Foundry's hotkeys must not see the typing
  if (e.key === "Escape") { e.preventDefault(); return closeZoneEditor(); }
  if (e.key !== "Enter") return;
  e.preventDefault();
  if (e.target.matches(".pust-bz-name")) { saveName(); editor.root.querySelector(".pust-bz-asp")?.focus(); }
  if (e.target.matches(".pust-bz-asp")) {
    const t = e.target.value.trim();
    if (!t) return;
    e.target.value = "";
    const z = zoneOf(editor.doc);
    editor.doc.update({ [zpath("aspects")]: addAspect(z.aspects, t) });
  }
}

/** Every aspect used by the scene's zones (the pools don't repeat inside one battle) */
const usedAspects = () => sceneZones().flatMap((z) => zoneOf(z.doc).aspects.map((a) => a.t));
const usedNames = () => sceneZones().map((z) => zoneOf(z.doc).name);

async function onBarClick(ev) {
  const b = ev.target.closest("[data-act]");
  if (!b || !editor) return;
  const doc = editor.doc, z = zoneOf(doc);
  if (!z) return;
  const act = b.dataset.act;
  try {
    if (act === "color") await doc.update({ [zpath("color")]: b.dataset.color, fillColor: COLORS[b.dataset.color].fill, strokeColor: COLORS[b.dataset.color].line });
    else if (act === "rndname") {
      const n = randomZoneName(battlePlace(), usedNames());
      if (!n) return notify.info("Назви для цього місця скінчилися.");
      await doc.update({ [zpath("name")]: n });
    } else if (act === "rndasp") {
      const t = randomZoneAspect(battlePlace(), usedAspects());
      if (!t) return notify.info("Аспекти для цього місця скінчилися.");
      // like the tracker: the aspect lands in the field first, so it can be touched up; Enter adds it
      const inp = editor.root.querySelector(".pust-bz-asp");
      inp.value = t; inp.focus(); inp.select();
    } else if (act === "inv") await doc.update({ [zpath("aspects")]: stepInv(z.aspects, +b.dataset.i, +b.dataset.d) });
    else if (act === "rmasp") await doc.update({ [zpath("aspects")]: removeAspect(z.aspects, +b.dataset.i) });
    else if (act === "select") selectZone(doc);
    else if (act === "delete") {
      if (!b.classList.contains("armed")) {
        b.classList.add("armed");
        b.querySelector("span").textContent = "Точно видалити?";
        clearTimeout(editor.armTimer);
        editor.armTimer = setTimeout(() => { b.classList.remove("armed"); const s = b.querySelector("span"); if (s) s.textContent = "Видалити"; }, 3000);
        return;
      }
      closeZoneEditor();
      await doc.delete();
    }
  } catch (err) { console.warn("Пустельники | zone action failed", err); notify.warn("Не вдалося змінити зону."); }
}

/** «Обрати всіх»: every token still standing in the zone becomes a target (the tracker's zsel; author, 2026-11-15: damage
 *  and healing go to the targets only); with overlapping zones a token in both is in both */
export function selectZone(doc) {
  const zones = sceneZones();
  const z = zones.find((x) => x.id === doc.id);
  if (!z) return;
  const down = (t) => (Number(t.actor?.system?.hp?.value) <= 0) || (t.document.hidden && !isGM());
  const inZone = canvas.tokens.placeables.filter((t) => zoneOfToken(t, [z])?.id === z.id && !down(t));
  canvas.tokens.activate();
  // a second click when exactly these are the targets already takes them off (author, 2026-11-15)
  const now = new Set([...(game.user.targets ?? [])].map((t) => t.id));
  if (inZone.length && now.size === inZone.length && inZone.every((t) => now.has(t.id))) {
    canvas.tokens.setTargets([], { mode: "replace" });
    notify.info(`Цілі в зоні «${zoneOf(doc).name}» знято.`);
    return;
  }
  canvas.tokens.setTargets(inZone.map((t) => t.id), { mode: "replace" });
  notify.info(inZone.length ? `Цілі в зоні «${zoneOf(doc).name}»: ${inZone.length}` : `У зоні «${zoneOf(doc).name}» нікого, хто ще стоїть.`);
}

/** The editor over the zone, following pan and zoom; the bar above, or under the strip when there is no room */
function layoutEditor() {
  if (!editor || !canvas.ready) return;
  const doc = editor.doc;
  const st = canvas.stage, s = st.scale.x || 1;
  const r = viewEl().getBoundingClientRect();
  const x = drag?.doc === doc && drag.end ? drag.end.x : doc.x, y = drag?.doc === doc && drag.end ? drag.end.y : doc.y;
  const w = drag?.doc === doc && drag.end ? drag.end.w : doc.shape.width;
  const p = { x: (x - st.pivot.x) * s + st.position.x, y: (y - st.pivot.y) * s + st.position.y };
  const ew = Math.max(w * s, 320);
  editor.root.style.left = `${Math.min(Math.max(4, r.left + p.x), innerWidth - ew - 4)}px`;
  editor.root.style.top = `${r.top + p.y}px`;
  editor.root.style.width = `${ew}px`;
  editor.root.style.height = "auto";
  editor.root.classList.toggle("bar-below", r.top + p.y < 56);
  // kept wholly on screen by its real width (its frame and the bar may be wider than the width set)
  const real = Math.max(editor.root.offsetWidth, ...[...editor.root.children].map((e) => e.offsetWidth));
  const left = parseFloat(editor.root.style.left);
  if (left + real > innerWidth - 4) editor.root.style.left = `${Math.max(4, innerWidth - real - 4)}px`;
}

let demoZone = null; // the tour's example
/**
 * The tour's zone editor (author, 2026-11-16): the scene's own zone with the most aspects (the first of equals), the
 * view panned to it, its editor open and nothing changed. A scene with no zones gets an example that is never written
 * (an in-memory Drawing at the view's centre): a name and two aspects from the battle place's pools.
 */
export async function setZoneDemo(on) {
  if (!on) { if (editor && (editor.doc === demoZone || editor.tour)) closeZoneEditor(); demoZone = null; return null; }
  if (!isGM() || !canvas.ready || !canvas.scene) return null;
  const own = sceneZones().sort((a, b) => zoneOf(b.doc).aspects.length - zoneOf(a.doc).aspects.length)[0];
  if (own) {
    await canvas.animatePan({ x: own.x + own.w / 2, y: own.y + own.h / 2, duration: 250 });
    openZoneEditor(own.doc);
    if (editor) editor.tour = true;
    editor?.root.querySelector(".pust-bz-name")?.blur();
    return own.doc;
  }
  const g = canvas.dimensions.size, c = canvas.stage.pivot, col = COLORS[ZONE.color];
  const used = usedAspects();
  const a1 = randomZoneAspect(battlePlace(), used) ?? "Іржаві бочки з пальним";
  const a2 = randomZoneAspect(battlePlace(), [...used, a1]) ?? "Густий дим";
  demoZone = new CONFIG.Drawing.documentClass({
    x: Math.round(c.x - (ZONE.w * g) / 2), y: Math.round(c.y - (ZONE.h * g) / 2), shape: { type: "r", width: ZONE.w * g, height: ZONE.h * g },
    fillType: CONST.DRAWING_FILL_TYPES.SOLID, fillColor: col.fill, fillAlpha: 0.13, strokeWidth: 4, strokeColor: col.line, strokeAlpha: 1, text: "",
    flags: { [sys()]: { battleZone: { name: randomZoneName(battlePlace(), usedNames()) ?? "Зона 1", color: ZONE.color, aspects: [{ t: a1, inv: 1 }, { t: a2, inv: 0 }] } } },
  }, { parent: canvas.scene });
  openZoneEditor(demoZone);
  editor?.root.querySelector(".pust-bz-name")?.blur();
  return demoZone;
}

/* ===================== Double-click, creating, hooks ===================== */

function onDblClick(ev) {
  if (ev.button !== 0 || !isGM() || !canvas.ready || !canvas.scene) return;
  const pt = pointOf(ev);
  if (tokenAt(pt)) return;
  const hit = zoneAt(pt);
  if (!hit) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  if (hit.part === "target") return; // two quick clicks on «Обрати всіх» select and clear — no editor
  openZoneEditor(hit.doc);
}
// a press outside closes the editor, but not during a tour: the tour opens and closes it (author, 2026-11-16: a click on
// the lit editor closed it and left the step without its element)
const onDocPointerDown = (ev) => { if (editor && !editor.root.contains(ev.target) && !document.body.classList.contains("pust-touring")) closeZoneEditor(); };

/** «+ Зона»: a 6 × 5 zone on the free spot nearest the view's centre, named «Зона N», opened for editing */
export async function addBattleZone() {
  if (!isGM()) return;
  if (!canvas.ready || !canvas.scene) return notify.warn("Спершу відкрий сцену.");
  const g = canvas.dimensions.size;
  const zones = sceneZones();
  const c = canvas.stage.pivot;
  // a free spot near the view's centre when there is one, otherwise right at the centre (zones may overlap)
  const spot = placeNear(c.x, c.y, ZONE.w * g, ZONE.h * g, zones, bounds(), g, gridOrigin())
    ?? moveRect({ x: c.x - (ZONE.w * g) / 2, y: c.y - (ZONE.h * g) / 2, w: ZONE.w * g, h: ZONE.h * g }, 0, 0, g, bounds(), gridOrigin());
  const col = COLORS[ZONE.color];
  const [doc] = await canvas.scene.createEmbeddedDocuments("Drawing", [{
    x: spot.x, y: spot.y, shape: { type: "r", width: spot.w, height: spot.h },
    fillType: CONST.DRAWING_FILL_TYPES.SOLID, fillColor: col.fill, fillAlpha: 0.13, strokeWidth: 4, strokeColor: col.line, strokeAlpha: 1,
    text: "", hidden: false, sort: -100,
    flags: { [sys()]: { battleZone: { name: nextZoneName(zones.map((z) => zoneOf(z.doc).name)), color: ZONE.color, aspects: [] } } },
  }]);
  if (doc) openZoneEditor(doc);
  return doc;
}

const onCanvas = (fn) => (ev) => { if (ev.target === viewEl()) fn(ev); };
const downOnCanvas = onCanvas(onPointerDown);
const dblOnCanvas = onCanvas(onDblClick);
let listening = false;
function attach() {
  if (listening) return;
  window.addEventListener("pointerdown", downOnCanvas, true);
  window.addEventListener("dblclick", dblOnCanvas, true);
  listening = true;
}
function detach() {
  if (!listening) return;
  window.removeEventListener("pointerdown", downOnCanvas, true);
  window.removeEventListener("dblclick", dblOnCanvas, true);
  listening = false;
}

export function readyBattleZones() {
  Hooks.on("canvasReady", () => { closeZoneEditor(); attach(); });
  Hooks.on("canvasTearDown", () => { closeZoneEditor(); detach(); });
  Hooks.on("canvasPan", () => layoutEditor());
  Hooks.on("updateDrawing", (doc) => { if (editor?.doc === doc) render(); });
  Hooks.on("deleteDrawing", (doc) => { if (editor?.doc === doc) closeZoneEditor(); });
  Hooks.on("updateScene", (scene, changed) => { if (editor && scene.id === canvas.scene?.id && foundry.utils.hasProperty(changed, `flags.${sys()}`)) render(); });
  window.addEventListener("resize", layoutEditor);
  document.addEventListener("pointerdown", onDocPointerDown, true);
  if (canvas.ready) attach();
}

/**
 * The tour «Бій» (author, 2026-11-16): a see-through frame laid over a zone of the viewed scene (the one with most aspects),
 * or over its «Обрати всіх» button, so the tour can light it (it lights DOM elements only); the view is panned to the zone.
 * `part`: "zone" | "target"; null takes the frame away. Nothing is changed in the scene.
 */
let zoneFrame = null;
export async function setZoneFrame(part) {
  zoneFrame?.remove();
  zoneFrame = null;
  if (!part || !canvas?.ready) return null;
  const own = sceneZones().sort((a, b) => zoneOf(b.doc).aspects.length - zoneOf(a.doc).aspects.length)[0];
  if (!own) return null;
  // the whole zone in view, not closer than it is now
  const side = document.querySelector("#sidebar")?.getBoundingClientRect();
  const roomW = (side?.left || window.innerWidth) - 120, roomH = window.innerHeight - 120;
  const scale = Math.min(canvas.stage.scale.x, roomW / own.w, roomH / own.h);
  await canvas.animatePan({ x: own.x + own.w / 2, y: own.y + own.h / 2, scale, duration: 250 });
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const tb = tgtBox(own.w);
  const box = part === "target" ? { x: own.x + tb.x, y: own.y + tb.y, w: tb.w, h: tb.s } : { x: own.x, y: own.y, w: own.w, h: own.h };
  const t = canvas.stage.worldTransform, a = t.apply({ x: box.x, y: box.y }), b = t.apply({ x: box.x + box.w, y: box.y + box.h });
  const pad = part === "target" ? 3 : 0;
  zoneFrame = document.createElement("div");
  zoneFrame.className = `pust-zone-frame pust-zone-frame-${part}`;
  Object.assign(zoneFrame.style, { position: "fixed", zIndex: 1000,
    left: `${a.x - pad}px`, top: `${a.y - pad}px`, width: `${b.x - a.x + 2 * pad}px`, height: `${b.y - a.y + 2 * pad}px` });
  document.body.append(zoneFrame);
  return own.doc;
}
Hooks.on("canvasTearDown", () => { zoneFrame?.remove(); zoneFrame = null; });
