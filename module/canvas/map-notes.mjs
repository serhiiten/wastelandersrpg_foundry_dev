/**
 * Sticker notes («Примітки») of «Мапа Пустки» (author, 2026-11-14): a Drawing flagged
 * `flags[system.id].mapNote = { title, text, color, min, locked }` that the system draws itself (paper, title strip, wrapped text,
 * under the tokens) and that is written on directly on the map: double-click opens an inline editor over the sticker, the title
 * strip drags it — from any layer, unless a token is under the pointer. Foundry's own Drawing `text` stays empty.
 * Mirrors the HTML terminal's map notes (map.js: MAP_NOTE, mapNoteHtml, fold/min).
 *
 * Players make stickers too (author, 2026-11-18): visible to all, signed with the player's name (flag `author`), and any
 * player edits any sticker players see (the GM's too); what Foundry does not let a player write goes through the active GM (`noteWrite`, socket
 * op `mapNote`). A sticker is resized by its bottom-right corner (whole cells, 2×2 at least).
 *
 * Wiring (module/wastelanders.mjs): `initMapNotes()` once in `init` (registers the placeable class), `readyMapNotes()` once in `ready`.
 */
import {
  MAP_NOTE, NOTE_DEFAULT_TITLE, chipText, dragEnd, foldGeometry, normalizeNote, noteSize, onGrabStrip, onResizeGrip, placeNew,
  resizeEnd, unfoldGeometry,
} from "../rules/map-notes.mjs";
import { notify } from "../helpers/notify.mjs";
import { askGM, answerGM } from "../helpers/gm-request.mjs";
import { activeGmHere } from "../helpers/main-window.mjs";

export { MAP_NOTE };

const sys = () => game.system.id;
const warn = (m) => notify.warn(m);
const hex = (s) => parseInt(String(s).replace("#", ""), 16);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const flagPath = (k) => `flags.${sys()}.mapNote.${k}`;
const TextClass = () => foundry.canvas?.containers?.PreciseText ?? PIXI.Text;

/** The normalized note flag of a Drawing document, or null for an ordinary drawing */
function noteOf(doc) {
  const f = doc?.getFlag?.(sys(), "mapNote");
  return f ? normalizeNote(f) : null;
}
/** Foundry lets this user write the drawing itself (the GM, the drawing's author) */
const canWrite = (doc) => !!doc && doc.canUserModify(game.user, "update");
/** any sticker players see (author, 2026-11-18: «усі правлять», the GM's too): any player may edit it, through the GM when it
 *  is not their own; a hidden one stays the GM's */
const isSharedNote = (doc) => !!noteOf(doc) && !doc.hidden;
const canEdit = (doc) => canWrite(doc) || (!game.user.isGM && isSharedNote(doc) && !!game.users.activeGM);
const NO_GM = "Чужі примітки змінює Доглядач, а його зараз немає в грі.";
/** a sticker's size: the corner being dragged, else its shape */
const sizeOf = (doc, flag, p = doc?.object) => noteSize(flag, canvas.dimensions.size, p?.pustResize ?? doc.shape);
/** the title strip's height in px (two lines are taller; the placeable knows after drawing) */
const stripOf = (doc) => doc?.object?.pustStrip ?? MAP_NOTE.stripH * canvas.dimensions.size;

/** Write a sticker: directly when Foundry lets this user, else through the active GM */
async function noteWrite(doc, data) {
  if (canWrite(doc)) return doc.update(data);
  if (!game.users.activeGM) { warn(NO_GM); return null; }
  return askGM({ op: "mapNote", act: "update", scene: doc.parent.id, id: doc.id, data }, "Примітка", "Зміну не збережено.");
}
async function noteDelete(doc) {
  if (canWrite(doc)) return doc.delete();
  if (!game.users.activeGM) { warn(NO_GM); return null; }
  askGM({ op: "mapNote", act: "delete", scene: doc.parent.id, id: doc.id }, "Примітка", "Примітку не видалено.");
  return null;
}
const scaleK = () => canvas.dimensions.size / 108;

/* ===================== Drawing on the canvas ===================== */

/** Replace the Drawing placeable class: ordinary drawings behave as before, flagged ones are drawn as stickers */
export function initMapNotes() {
  const Base = CONFIG.Drawing.objectClass;
  CONFIG.Drawing.objectClass = class WastelandersDrawing extends Base {
    /** the sticker's container inside the drawing's shape (paper, strip, texts) */
    #note = null;

    get isMapNote() { return !!noteOf(this.document); }

    /** a sticker never shows Foundry's own text (an old note's text is moved into the flag on load) */
    get hasText() { return this.isMapNote ? false : super.hasText; }

    /** the Foundry shape of a sticker is invisible: the paper is drawn by `#drawNote` */
    _getFillStyle() {
      const s = super._getFillStyle();
      return this.isMapNote ? { ...s, alpha: 0 } : s;
    }

    _getLineStyle() {
      const s = super._getLineStyle();
      return this.isMapNote ? { ...s, alpha: 0 } : s;
    }

    _refreshShape() {
      super._refreshShape();
      this.#drawNote();
    }

    /** every sticker has the same light see-through (author, 2026-11-14: as the hidden ones had; Foundry dims hidden drawings
     *  to 0.5), so hidden or not is told by the strip's chip «Видима» / «Прихована» */
    _refreshState() {
      super._refreshState();
      if (this.isMapNote && this.shape && !this.shape.destroyed) this.shape.alpha = 0.9;
    }

    _onUpdate(changed, options, userId) {
      super._onUpdate(changed, options, userId);
      if (this.isMapNote && ("flags" in changed || "hidden" in changed || "locked" in changed)) this.renderFlags.set({ refreshShape: true });
    }

    /** a sticker has no Foundry config on double-click: it is written on directly */
    _onClickLeft2(event) {
      if (this.isMapNote) return;
      return super._onClickLeft2(event);
    }

    #drawNote() {
      if (this.#note && !this.#note.destroyed) this.#note.destroy({ children: true });
      this.#note = null;
      const flag = noteOf(this.document);
      if (!flag || !this.shape || this.shape.destroyed) return;
      const size = canvas.dimensions.size, k = scaleK();
      const { w, h } = sizeOf(this.document, flag, this);
      this.pustStrip = MAP_NOTE.stripH * size;
      const col = MAP_NOTE.colors[flag.color];
      const fill = hex(col.fill), line = hex(col.line), ink = hex(MAP_NOTE.ink);
      const T = TextClass();
      const box = new PIXI.Container();
      box.eventMode = "none";

      const shadow = new PIXI.Graphics();
      shadow.beginFill(0x000000, 0.3).drawRoundedRect(4 * k, 6 * k, w, h, 5 * k).endFill();
      const paper = new PIXI.Graphics();
      paper.lineStyle({ width: 3 * k, color: line, alpha: 1, alignment: 1 }).beginFill(fill, 1).drawRoundedRect(0, 0, w, h, 5 * k).endFill();
      box.addChild(shadow, paper);

      const pad = 10 * k;
      if (flag.min) {
        // a 1×1 marker: a tag icon, the title as a chip under it
        const tag = new PIXI.Graphics();
        const cx = w / 2, cy = h / 2, r = size * 0.26;
        tag.beginFill(line, 1).drawPolygon([cx - r, cy - r * 0.9, cx + r * 0.2, cy - r * 0.9, cx + r * 1.05, cy, cx + r * 0.2, cy + r * 0.9, cx - r, cy + r * 0.9]).endFill();
        tag.beginHole().drawCircle(cx - r * 0.45, cy, r * 0.2).endHole();
        box.addChild(tag);
        const chip = new T(chipText(flag.title), new PIXI.TextStyle({ fontFamily: MAP_NOTE.fontFamily, fontSize: 18 * k, fontWeight: "700", fill: 0xf2ecd8 }));
        const bg = new PIXI.Graphics();
        const cw = chip.width + 14 * k, ch = chip.height + 6 * k;
        bg.beginFill(ink, 0.88).lineStyle({ width: 1.5 * k, color: line }).drawRoundedRect((w - cw) / 2, h + 5 * k, cw, ch, 4 * k).endFill();
        chip.anchor.set(0.5, 0);
        chip.position.set(w / 2, h + 5 * k + 3 * k);
        box.addChild(bg, chip);
      } else {
        // the GM's chip at the strip's right end (author, 2026-11-14): «Видима» while players see the sticker, «Прихована» while not
        let hidW = 0, chipParts = null;
        if (game.user.isGM) {
          const hidden = !!this.document.hidden;
          const hid = new T(hidden ? "Прихована" : "Видима", new PIXI.TextStyle({ fontFamily: MAP_NOTE.fontFamily, fontSize: 15 * k, fontWeight: "800", fill: hidden ? 0xf2ecd8 : 0x0e1a10, letterSpacing: 0.5 * k }));
          const cw = hid.width + 12 * k, ch = hid.height + 4 * k;
          const cx = w - pad - (flag.locked ? 30 * k : 0) - cw, cy = (MAP_NOTE.stripH * size - ch) / 2;
          const bg = new PIXI.Graphics();
          bg.beginFill(hidden ? ink : 0x3dff47, hidden ? 0.85 : 0.9).drawRoundedRect(cx, cy, cw, ch, 3 * k).endFill();
          hid.position.set(cx + 6 * k, cy + 2 * k);
          chipParts = [bg, hid];
          hidW = cw + 8 * k;
        }
        // a long title wraps to a second line and the strip grows (author, 2026-11-18: it was cut at the chip); more is cut with «…»
        const empty = !flag.title.trim();
        const tStyle = new PIXI.TextStyle({
          fontFamily: MAP_NOTE.fontFamily, fontSize: 24 * k, fontWeight: "800", fill: ink, lineHeight: 24 * k * 1.2,
          wordWrap: true, wordWrapWidth: Math.max(10, w - 2 * pad - (flag.locked ? 30 * k - pad : 0) - hidW), breakWords: true,
        });
        let lines = PIXI.TextMetrics.measureText(empty ? NOTE_DEFAULT_TITLE : flag.title, tStyle).lines.map((l) => l.trimEnd());
        if (lines.length > 2) {
          let second = `${lines[1]}…`;
          while (second.length > 1 && PIXI.TextMetrics.measureText(second, tStyle).width > tStyle.wordWrapWidth) second = `${second.slice(0, -2)}…`;
          lines = [lines[0], second];
        }
        const stripH = (lines.length > 1 ? MAP_NOTE.stripH2 : MAP_NOTE.stripH) * size;
        this.pustStrip = stripH;
        const strip = new PIXI.Graphics();
        strip.beginFill(line, 0.3).drawRect(1.5 * k, 1.5 * k, w - 3 * k, stripH - 1.5 * k).endFill();
        strip.lineStyle({ width: 1.5 * k, color: line, alpha: 0.8 }).moveTo(0, stripH).lineTo(w, stripH);
        box.addChild(strip);
        if (chipParts) box.addChild(...chipParts);

        const title = new T(lines.join("\n"), new PIXI.TextStyle({ ...tStyle, wordWrap: false }));
        title.alpha = empty ? 0.45 : 1;
        title.position.set(pad, (stripH - title.height) / 2);
        box.addChild(title);

        if (flag.locked) {
          const lk = new PIXI.Graphics(), lx = w - 22 * k, ly = stripH / 2;
          lk.lineStyle({ width: 2 * k, color: ink, alpha: 0.7 }).arc(lx + 6 * k, ly - 3 * k, 4.5 * k, Math.PI, 0);
          lk.lineStyle(0).beginFill(ink, 0.7).drawRoundedRect(lx, ly - 3 * k, 12 * k, 10 * k, 2 * k).endFill();
          box.addChild(lk);
        }

        // the player who made it, small, bottom right (author, 2026-11-18)
        let authH = 0;
        if (flag.author) {
          const au = new T(`— ${flag.author}`, new PIXI.TextStyle({ fontFamily: MAP_NOTE.fontFamily, fontSize: 16 * k, fontStyle: "italic", fill: ink }));
          au.alpha = 0.7;
          au.anchor.set(1, 1);
          au.position.set(w - pad - MAP_NOTE.grip * size * 0.6, h - 5 * k);
          box.addChild(au);
          authH = au.height + 4 * k;
        }

        if (flag.text) {
          const body = new T(flag.text, new PIXI.TextStyle({
            fontFamily: MAP_NOTE.fontFamily, fontSize: 22 * k, fill: ink, wordWrap: true, wordWrapWidth: Math.max(10, w - 2 * pad),
            lineHeight: 22 * k * 1.2, breakWords: true,
          }));
          body.position.set(pad, stripH + 8 * k);
          const bmask = new PIXI.Graphics();
          bmask.beginFill(0xffffff).drawRect(0, stripH + 2 * k, w, Math.max(0, h - stripH - 2 * k - 3 * k - authH)).endFill();
          box.addChild(bmask, body);
          body.mask = bmask;
        }

        // the resize grip, bottom right, for whoever may change the sticker (author, 2026-11-18)
        if (!flag.locked && canEdit(this.document)) {
          const g = new PIXI.Graphics(), gs = MAP_NOTE.grip * size;
          g.lineStyle({ width: 2 * k, color: line, alpha: 0.9 });
          for (const f of [0.35, 0.65, 0.95]) g.moveTo(w - 4 * k - gs * f, h - 4 * k).lineTo(w - 4 * k, h - 4 * k - gs * f);
          box.addChild(g);
        }
      }
      this.#note = this.shape.addChild(box);
    }
  };
}

/* ===================== Helpers for the pointer work ===================== */

const viewEl = () => canvas.app?.view;

/** A pointer event's place on the canvas (scene pixels) */
function pointOf(ev) {
  const r = viewEl().getBoundingClientRect();
  return canvas.canvasCoordinatesFromClient({ x: ev.clientX - r.left, y: ev.clientY - r.top });
}

/** Is a token under the point — then the token's own interactions stay untouched */
function tokenAt(pt) {
  return !!canvas.tokens?.placeables.some((t) => t.visible && t.bounds?.contains(pt.x, pt.y));
}

/** The topmost visible sticker under the point: { doc, placeable, flag, rect } */
function noteAt(pt) {
  const size = canvas.dimensions.size;
  let best = null, bestKey = -Infinity;
  (canvas.drawings?.placeables ?? []).forEach((p, i) => {
    const doc = p.document, flag = noteOf(doc);
    if (!flag || !p.visible) return;
    const { w, h } = sizeOf(doc, flag, p);
    const rect = { x: doc.x, y: doc.y, w, h };
    if (pt.x < rect.x || pt.x >= rect.x + w || pt.y < rect.y || pt.y >= rect.y + h) return;
    const key = (doc.sort ?? 0) * 1e5 + i;
    if (key > bestKey) { bestKey = key; best = { doc, placeable: p, flag, rect }; }
  });
  return best;
}

/** Grid snapping origin: any grid line works, snapping is modular */
function gridOrigin() {
  try { return canvas.grid.getTopLeftPoint({ x: 0, y: 0 }); } catch { return { x: 0, y: 0 }; }
}
const sceneRect = () => canvas.dimensions.sceneRect;

/* ===================== Drag from any layer ===================== */

let drag = null;

function onPointerDown(ev) {
  if (ev.button !== 0 || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.metaKey) return;
  if (!canvas.ready || !canvas.scene) return;
  const pt = pointOf(ev);
  if (tokenAt(pt)) return;
  const hit = noteAt(pt);
  if (!hit || !canEdit(hit.doc) || hit.flag.locked) return;
  const size = canvas.dimensions.size;
  const resize = onResizeGrip(pt.x, pt.y, hit.rect, hit.flag, size);
  if (!resize && !onGrabStrip(pt.x, pt.y, { ...hit.rect }, hit.flag, size, stripOf(hit.doc))) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  drag = { ...hit, resize, px: ev.clientX, py: ev.clientY, start: { x: hit.doc.x, y: hit.doc.y }, moved: false, end: null };
  window.addEventListener("pointermove", onDragMove, true);
  window.addEventListener("pointerup", onDragEnd, true);
  window.addEventListener("pointercancel", onDragCancel, true);
}

function dragScale() { return canvas.stage.worldTransform.a || 1; }

function onDragMove(ev) {
  if (!drag) return;
  const s = dragScale();
  const dx = (ev.clientX - drag.px) / s, dy = (ev.clientY - drag.py) / s;
  if (!drag.moved && Math.hypot(ev.clientX - drag.px, ev.clientY - drag.py) < 4) return;
  drag.moved = true;
  if (drag.resize) {
    drag.end = resizeEnd(drag.rect, dx, dy, canvas.dimensions.size, sceneRect());
    const r = drag.placeable.pustResize;
    if (!r || r.width !== drag.end.w || r.height !== drag.end.h) {
      drag.placeable.pustResize = { width: drag.end.w, height: drag.end.h };
      drag.placeable.renderFlags.set({ refreshShape: true });
      if (editor?.doc === drag.doc) layoutEditor();
    }
    return;
  }
  const { w, h } = drag.rect;
  drag.end = dragEnd(drag.start, dx, dy, w, h, canvas.dimensions.size, sceneRect(), gridOrigin());
  drag.placeable.shape?.position.set(drag.end.x + drag.doc.shape.width / 2, drag.end.y + drag.doc.shape.height / 2);
  if (editor?.doc === drag.doc) layoutEditor();
}

function stopDragListeners() {
  window.removeEventListener("pointermove", onDragMove, true);
  window.removeEventListener("pointerup", onDragEnd, true);
  window.removeEventListener("pointercancel", onDragCancel, true);
}

async function onDragEnd() {
  const d = drag; drag = null;
  stopDragListeners();
  if (!d) return;
  if (d.resize) {
    const done = () => { delete d.placeable.pustResize; d.placeable.renderFlags?.set({ refreshShape: true }); };
    if (!d.moved || !d.end || (d.end.w === d.rect.w && d.end.h === d.rect.h)) return done();
    const own = canWrite(d.doc);
    try { await noteWrite(d.doc, { shape: { width: d.end.w, height: d.end.h } }); }
    catch (err) { console.warn("Пустельники | note not resized", err); }
    // through the GM the new size arrives a moment later: keep the dragged one in sight until then
    if (own) done(); else setTimeout(done, 1500);
    return;
  }
  if (!d.moved || !d.end || (d.end.x === d.start.x && d.end.y === d.start.y)) {
    d.placeable.renderFlags?.set({ refreshPosition: true });
    return;
  }
  try { await noteWrite(d.doc, { x: d.end.x, y: d.end.y }); }
  catch (err) { console.warn("Пустельники | note not moved", err); d.placeable.renderFlags?.set({ refreshPosition: true }); }
}

function onDragCancel() {
  const d = drag; drag = null;
  stopDragListeners();
  if (d?.placeable) delete d.placeable.pustResize;
  d?.placeable.renderFlags?.set({ refreshPosition: true, refreshShape: true });
}

/* ===================== The inline editor ===================== */

let editor = null; // { doc, root, title, body, timer, armTimer }

const swatches = () => Object.entries(MAP_NOTE.colors).map(([k, c]) =>
  `<button type="button" class="pust-mn-sw" data-act="color" data-color="${k}" style="--sw:${c.fill}; --swl:${c.line}" title="${esc(c.label)}" aria-label="${esc(c.label)}"></button>`).join("");

function editorHtml() {
  const gm = game.user.isGM;
  return `<div class="pust-mn-bar" role="toolbar" aria-label="Примітка">
      <span class="pust-mn-sws">${swatches()}</span>
      ${gm ? `<button type="button" class="pust-mn-btn" data-act="hide"><i class="fa-solid fa-eye-slash"></i><span></span></button>` : ""}
      <button type="button" class="pust-mn-btn" data-act="fold"><i class="fa-solid fa-compress"></i><span></span></button>
      <button type="button" class="pust-mn-btn" data-act="lock"><i class="fa-solid fa-lock"></i><span></span></button>
      <button type="button" class="pust-mn-btn pust-mn-del" data-act="delete"><i class="fa-solid fa-trash"></i><span>Видалити</span></button>
    </div>
    <div class="pust-mn-paper">
      <input type="text" class="pust-mn-title" maxlength="80" placeholder="${NOTE_DEFAULT_TITLE}" aria-label="Заголовок примітки" spellcheck="false">
      <textarea class="pust-mn-body" aria-label="Текст примітки" spellcheck="false"></textarea>
    </div>`;
}

/** Open the inline editor over a sticker; `focus` is «title» (with its text selected) or «body» */
export function openNoteEditor(doc, focus = "body") {
  if (!doc || !canEdit(doc) || !canvas.ready) return;
  if (editor?.doc === doc) { (focus === "title" ? editor.title : editor.body).focus(); return; }
  closeNoteEditor();
  const flag = noteOf(doc);
  if (!flag) return;
  const root = document.createElement("div");
  root.className = "pust-mn-edit";
  root.innerHTML = editorHtml();
  document.body.appendChild(root);
  const title = root.querySelector(".pust-mn-title"), body = root.querySelector(".pust-mn-body");
  title.value = flag.title; body.value = flag.text;
  // `base`: what the fields held when last in step with the sticker; only what was typed since is written (playtest check,
  // 2026-11-18: two players in one sticker — each closing editor wrote back the field it never touched, the other's text was lost)
  editor = { doc, root, title, body, timer: null, armTimer: null, base: { title: flag.title, text: flag.text } };

  const queue = () => { clearTimeout(editor.timer); editor.timer = setTimeout(flushEditor, 400); };
  title.addEventListener("input", queue);
  body.addEventListener("input", queue);
  title.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); flushEditor(); body.focus(); } });
  root.addEventListener("keydown", (e) => {
    e.stopPropagation(); // Foundry's hotkeys must not see the typing
    if (e.key === "Escape") { e.preventDefault(); closeNoteEditor(); }
  });
  root.addEventListener("keyup", (e) => e.stopPropagation());
  root.addEventListener("focusout", (e) => { if (!root.contains(e.relatedTarget)) flushEditor(); });
  root.addEventListener("click", onBarClick);
  root.addEventListener("wheel", (e) => e.stopPropagation(), { passive: true });
  syncEditor();
  layoutEditor();
  (focus === "title" ? title : body).focus();
  if (focus === "title") title.select();
}

export function closeNoteEditor() {
  if (!editor) return;
  const e = editor;
  flushEditor();
  clearTimeout(e.timer); clearTimeout(e.armTimer);
  editor = null;
  e.root.remove();
}

/** Save what is typed, if it differs from the flag */
function flushEditor() {
  if (!editor) return;
  const { doc, title, body } = editor;
  clearTimeout(editor.timer);
  const flag = noteOf(doc);
  if (!flag || !canEdit(doc) || !doc.collection) return;
  const upd = {}, base = editor.base;
  if (title.value !== base.title && title.value !== flag.title) upd[flagPath("title")] = title.value;
  if (body.value !== base.text && body.value !== flag.text) upd[flagPath("text")] = body.value;
  base.title = title.value; base.text = body.value;
  if (!Object.keys(upd).length) return;
  // what is sent and not yet back: syncEditor must not put the older text into these fields meanwhile (a write through
  // the GM takes a while)
  const ed = editor, pend = (ed.sent ??= {}), mine = {};
  if (flagPath("title") in upd) pend.title = mine.title = title.value;
  if (flagPath("text") in upd) pend.text = mine.text = body.value;
  const settle = (ok) => {
    for (const k of Object.keys(mine)) {
      if (pend[k] === mine[k]) delete pend[k];
      // not saved (no GM, the GM's side failed or did not answer): the typed text stays and is sent again on the next save
      if (!ok && editor === ed && ed.base[k] === mine[k]) ed.base[k] = undefined;
    }
  };
  noteWrite(doc, upd).then((r) => settle(r !== null && r !== false), (err) => { settle(false); console.warn("Пустельники | note not saved", err); });
}

/** The bar's labels and the colours follow the note's state */
function syncEditor() {
  if (!editor) return;
  const { doc, root } = editor;
  const flag = noteOf(doc);
  if (!flag) return closeNoteEditor();
  // someone else changed a field this editor has not touched: show theirs
  const { title, body, base } = editor;
  const pend = (editor.sent ??= {});
  if (pend.title !== undefined && flag.title === pend.title) delete pend.title;
  if (pend.text !== undefined && flag.text === pend.text) delete pend.text;
  if (pend.title === undefined && title.value === base.title && flag.title !== base.title) title.value = base.title = flag.title;
  if (pend.text === undefined && body.value === base.text && flag.text !== base.text) body.value = base.text = flag.text;
  const col = MAP_NOTE.colors[flag.color];
  root.style.setProperty("--fill", col.fill);
  root.style.setProperty("--line", col.line);
  root.classList.toggle("is-min", flag.min);
  root.classList.toggle("is-hidden", !!doc.hidden);
  root.classList.toggle("is-locked", flag.locked);
  root.querySelectorAll(".pust-mn-sw").forEach((b) => b.classList.toggle("on", b.dataset.color === flag.color));
  const label = (act, icon, text, tip) => {
    const b = root.querySelector(`[data-act="${act}"]`);
    if (!b) return;
    b.querySelector("i").className = `fa-solid ${icon}`;
    b.querySelector("span").textContent = text;
    b.title = tip;
  };
  label("hide", doc.hidden ? "fa-eye" : "fa-eye-slash", doc.hidden ? "Показати гравцям" : "Сховати від гравців",
    doc.hidden ? "Зараз примітку бачить лише Доглядач" : "Зараз примітку бачать гравці");
  label("fold", flag.min ? "fa-expand" : "fa-compress", flag.min ? "Розгорнути" : "Згорнути до позначки", "Згорнути до клітинки з заголовком або розгорнути назад");
  label("lock", flag.locked ? "fa-lock-open" : "fa-lock", flag.locked ? "Відкріпити" : "Закріпити", "Закріплену примітку не можна перетягувати");
}

/** Put the editor exactly over the sticker, following pan and zoom */
function layoutEditor() {
  if (!editor || !canvas.ready) return;
  const { doc, root } = editor;
  const flag = noteOf(doc);
  if (!flag) return;
  const size = canvas.dimensions.size;
  // from the stage's pivot, scale and position, which pan() sets at once (its worldTransform follows only on the next render)
  const st = canvas.stage;
  const s = st.scale.x || 1;
  const r = viewEl().getBoundingClientRect();
  const { w, h } = sizeOf(doc, flag);
  const cx = drag?.doc === doc && drag.end ? drag.end.x : doc.x, cy = drag?.doc === doc && drag.end ? drag.end.y : doc.y;
  const p = { x: (cx - st.pivot.x) * s + st.position.x, y: (cy - st.pivot.y) * s + st.position.y };
  const k = s * scaleK();
  const pw = flag.min ? Math.max(w * s, 240) : w * s;
  root.style.setProperty("--k", String(k));
  root.style.left = `${r.left + p.x}px`;
  root.style.top = `${r.top + p.y}px`;
  root.style.width = `${pw}px`;
  root.style.height = flag.min ? "auto" : `${h * s}px`;
  root.style.setProperty("--strip", `${(flag.min ? MAP_NOTE.stripH * size : stripOf(doc)) * s}px`);
  // the bar sits above the sticker, or under it when there is no room over it
  root.classList.toggle("bar-below", r.top + p.y < 56);
}

/* ----- the toolbar ----- */

async function onBarClick(ev) {
  const b = ev.target.closest("[data-act]");
  if (!b || !editor) return;
  const { doc } = editor;
  const flag = noteOf(doc);
  if (!flag) return;
  const act = b.dataset.act;
  flushEditor();
  try {
    if (act === "color") {
      const c = MAP_NOTE.colors[b.dataset.color];
      await noteWrite(doc, { [flagPath("color")]: b.dataset.color, fillColor: c.fill, strokeColor: c.line });
    } else if (act === "hide" && game.user.isGM) {
      await doc.update({ hidden: !doc.hidden });
    } else if (act === "lock") {
      await noteWrite(doc, { [flagPath("locked")]: !flag.locked, locked: !flag.locked });
    } else if (act === "fold") {
      await toggleFold(doc, flag);
    } else if (act === "delete") {
      if (!b.classList.contains("armed")) {
        b.classList.add("armed");
        b.querySelector("span").textContent = "Точно видалити?";
        clearTimeout(editor.armTimer);
        editor.armTimer = setTimeout(() => { b.classList.remove("armed"); b.querySelector("span").textContent = "Видалити"; }, 3000);
        return;
      }
      closeNoteEditor();
      await noteDelete(doc);
    }
  } catch (err) { console.warn("Пустельники | note action failed", err); warn("Не вдалося змінити примітку."); }
}

/** Fold to a 1×1 marker (the full size is remembered) or unfold back, staying inside the scene */
async function toggleFold(doc, flag) {
  const size = canvas.dimensions.size;
  if (!flag.min) {
    const g = foldGeometry(flag, doc.shape, size);
    await noteWrite(doc, { [flagPath("min")]: true, [flagPath("full")]: g.full, shape: { width: g.w, height: g.h } });
  } else {
    const g = unfoldGeometry(flag, doc.x, doc.y, size, sceneRect());
    await noteWrite(doc, { [flagPath("min")]: false, x: g.x, y: g.y, shape: { width: g.w, height: g.h } });
  }
}

/* ===================== Opening the editor: double-click ===================== */

function onDblClick(ev) {
  if (ev.button !== 0 || !canvas.ready || !canvas.scene) return;
  const pt = pointOf(ev);
  if (tokenAt(pt)) return;
  const hit = noteAt(pt);
  if (!hit || !canEdit(hit.doc)) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  openNoteEditor(hit.doc, pt.y < hit.rect.y + stripOf(hit.doc) ? "title" : "body");
}

/** A press outside the editor closes it, but not during a tour: the tour opens and closes it (author, 2026-11-16) */
function onDocPointerDown(ev) {
  if (editor && !editor.root.contains(ev.target) && !document.body.classList.contains("pust-touring")) closeNoteEditor();
}

/*
 * Listened for on the WINDOW in the capture phase, i.e. before anything on the canvas element: PIXI listens on the canvas
 * element in its capture phase too and was there first, so a listener on the element itself came after it — Foundry then
 * saw the press and started its selection frame while a sticker was dragged (author, 2026-11-14). Only presses on the canvas.
 */
const onCanvas = (fn) => (ev) => { if (ev.target === viewEl()) fn(ev); };
const downOnCanvas = onCanvas((ev) => onPointerDown(ev));
const dblOnCanvas = onCanvas((ev) => onDblClick(ev));
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

/* ===================== Creating ===================== */

/**
 * «Примітка»: a 3×3 sticker at the view's centre, snapped and inside the scene; opens for typing. The GM's starts hidden from
 * players; a player's is seen by all and signed (author, 2026-11-18), made through the GM when Foundry does not let players draw.
 */
export async function addMapNote() {
  if (!canvas.ready || !canvas.scene) return warn("Спершу відкрий сцену.");
  const gm = game.user.isGM, direct = gm || game.user.can("DRAWING_CREATE");
  if (!direct && !game.users.activeGM) return warn("Примітку гравця записує Доглядач, а його зараз немає в грі.");
  const size = canvas.dimensions.size;
  const { w, h } = noteSize({ min: false }, size);
  const c = canvas.stage.pivot;
  const pos = placeNew(c.x, c.y, w, h, size, sceneRect(), gridOrigin());
  const col = MAP_NOTE.colors[MAP_NOTE.color];
  const data = {
    x: pos.x, y: pos.y, shape: { type: "r", width: w, height: h },
    fillType: CONST.DRAWING_FILL_TYPES.SOLID, fillColor: col.fill, fillAlpha: 0.9,
    strokeWidth: 4, strokeColor: col.line, strokeAlpha: 1,
    text: "", hidden: gm,
    flags: { [sys()]: { mapNote: { title: NOTE_DEFAULT_TITLE, text: "", color: MAP_NOTE.color, min: false, locked: false, author: gm ? "" : game.user.name } } },
  };
  if (direct) {
    const [doc] = await canvas.scene.createEmbeddedDocuments("Drawing", [data]);
    if (doc) openNoteEditor(doc, "title");
    return doc;
  }
  // through the GM: the id is chosen here, so the editor opens on the sticker as soon as it arrives
  const id = foundry.utils.randomID();
  const sceneId = canvas.scene.id;
  const arrived = new Promise((resolve) => {
    const hook = Hooks.on("createDrawing", (doc) => { if (doc.id === id) { Hooks.off("createDrawing", hook); resolve(doc); } });
    setTimeout(() => { Hooks.off("createDrawing", hook); resolve(null); }, 7000);
  });
  askGM({ op: "mapNote", act: "create", scene: sceneId, data: { ...data, _id: id } }, "Примітка", "Примітку не створено.");
  const doc = await arrived;
  if (doc && canvas.scene?.id === sceneId) openNoteEditor(doc, "title");
  return doc;
}

/* ===================== The GM's side of the players' requests ===================== */

/** What a player may change on a sticker through the GM: its place, size, colours, lock and the sticker's own flag */
const NOTE_KEYS = /^(x|y|locked|fillColor|strokeColor|shape\.(width|height)|flags\.[^.]+\.mapNote\.(title|text|color|min|locked|full(\.(w|h))?))$/;

async function applyNoteRequest(msg) {
  const scene = game.scenes.get(String(msg.scene));
  const user = game.users.get(String(msg.from));
  if (!scene || !user) throw new Error("Немає такої сцени чи гравця.");
  if (msg.act === "create") {
    const d = msg.data && typeof msg.data === "object" ? msg.data : {};
    const flag = normalizeNote(d.flags?.[sys()]?.mapNote);
    const col = MAP_NOTE.colors[flag.color];
    return scene.createEmbeddedDocuments("Drawing", [{
      _id: String(d._id || foundry.utils.randomID()), author: user.id,
      x: Number(d.x) || 0, y: Number(d.y) || 0, shape: { type: "r", width: Number(d.shape?.width) || 300, height: Number(d.shape?.height) || 300 },
      fillType: CONST.DRAWING_FILL_TYPES.SOLID, fillColor: col.fill, fillAlpha: 0.9, strokeWidth: 4, strokeColor: col.line, strokeAlpha: 1,
      text: "", hidden: false,
      flags: { [sys()]: { mapNote: { ...flag, author: user.name } } },
    }], { keepId: true });
  }
  const doc = scene.drawings.get(String(msg.id));
  if (!doc || !isSharedNote(doc)) throw new Error("Цю примітку гравці не бачать.");
  if (msg.act === "delete") return doc.delete();
  if (msg.act !== "update") throw new Error("Невідома дія з приміткою.");
  const flat = foundry.utils.flattenObject(msg.data || {});
  const upd = Object.fromEntries(Object.entries(flat).filter(([k]) => NOTE_KEYS.test(k) && (!k.startsWith("flags.") || k.startsWith(`flags.${sys()}.`))));
  if (!Object.keys(upd).length) return null;
  return doc.update(upd);
}

/**
 * The tours' example (author, 2026-11-16): a sticker that lives only in memory (never written, players never see it), with
 * its editor opened over the middle of the view; the editor saves nothing for it (flushEditor needs a stored document).
 */
let demoNote = null;
export function setNoteDemo(on) {
  if (!on) { if (demoNote && editor?.doc === demoNote) closeNoteEditor(); demoNote = null; return null; }
  if (!canvas.ready || !canvas.scene) return null;
  const size = canvas.dimensions.size;
  const { w, h } = noteSize({ min: false }, size);
  const c = canvas.stage.pivot;
  const col = MAP_NOTE.colors[MAP_NOTE.color];
  demoNote = new CONFIG.Drawing.documentClass({
    x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), shape: { type: "r", width: w, height: h },
    fillType: CONST.DRAWING_FILL_TYPES.SOLID, fillColor: col.fill, fillAlpha: 0.9, strokeWidth: 4, strokeColor: col.line, strokeAlpha: 1,
    text: "", hidden: true,
    flags: { [sys()]: { mapNote: { title: "Приклад: схованка", text: "Під кам'яною брилою на узбіччі закопано ящик із припасами.", color: MAP_NOTE.color, min: false, locked: false } } },
  }, { parent: canvas.scene });
  openNoteEditor(demoNote, "body");
  editor?.body?.blur();
  return demoNote;
}

/** Once, in `ready`: the listeners and the hooks */
export function readyMapNotes() {
  // the GM writes what players may not (author, 2026-11-18: players' stickers, edited by any player)
  game.socket.on(`system.${game.system.id}`, (msg) => {
    if (msg?.op !== "mapNote" || !activeGmHere()) return;
    answerGM(msg, () => applyNoteRequest(msg));
  });
  Hooks.on("canvasReady", () => { closeNoteEditor(); attach(); canvas.drawings?.placeables.forEach((p) => p.renderFlags.set({ refreshShape: true })); });
  Hooks.on("canvasTearDown", () => { closeNoteEditor(); detach(); });
  Hooks.on("canvasPan", () => layoutEditor());
  Hooks.on("updateDrawing", (doc) => { if (editor?.doc === doc) { syncEditor(); layoutEditor(); } });
  Hooks.on("deleteDrawing", (doc) => { if (editor?.doc === doc) closeNoteEditor(); });
  window.addEventListener("resize", layoutEditor);
  document.addEventListener("pointerdown", onDocPointerDown, true);
  if (canvas.ready) attach();
  // the label font may arrive after the first draw: draw the stickers again when it has
  document.fonts?.load(`800 24px "${MAP_NOTE.fontFamily}"`).then(() => {
    if (canvas.ready) canvas.drawings?.placeables.forEach((p) => p.renderFlags.set({ refreshShape: true }));
  }).catch(() => {});
}
