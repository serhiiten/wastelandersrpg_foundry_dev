/**
 * Sticker notes («Примітки») of «Мапа Пустки» (author, 2026-11-14): a Drawing flagged
 * `flags[system.id].mapNote = { title, text, color, min, locked }` that the system draws itself (paper, title strip, wrapped text,
 * under the tokens) and that is written on directly on the map: double-click opens an inline editor over the sticker, the title
 * strip drags it — from any layer, unless a token is under the pointer. Foundry's own Drawing `text` stays empty.
 * Mirrors the HTML terminal's map notes (map.js: MAP_NOTE, mapNoteHtml, fold/min).
 *
 * Wiring (module/wastelanders.mjs): `initMapNotes()` once in `init` (registers the placeable class), `readyMapNotes()` once in `ready`.
 */
import {
  MAP_NOTE, NOTE_DEFAULT_TITLE, chipText, dragEnd, foldGeometry, legacyUpdate, normalizeNote, noteSize, onGrabStrip, placeNew, splitLegacyText, unfoldGeometry,
} from "../rules/map-notes.mjs";

export { MAP_NOTE };

const sys = () => game.system.id;
const warn = (m) => ui.notifications.warn(m);
const hex = (s) => parseInt(String(s).replace("#", ""), 16);
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const flagPath = (k) => `flags.${sys()}.mapNote.${k}`;
const TextClass = () => foundry.canvas?.containers?.PreciseText ?? PIXI.Text;

/** The normalized note flag of a Drawing document, or null for an ordinary drawing */
function noteOf(doc) {
  const f = doc?.getFlag?.(sys(), "mapNote");
  return f ? normalizeNote(f) : null;
}
const canEdit = (doc) => !!doc && doc.canUserModify(game.user, "update");
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
      // an old note not yet converted shows its Foundry text as title and body
      if (!flag.title && !flag.text && this.document.text) Object.assign(flag, splitLegacyText(this.document.text));
      const size = canvas.dimensions.size, k = scaleK();
      const { w, h } = noteSize(flag, size);
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
        const stripH = MAP_NOTE.stripH * size;
        const strip = new PIXI.Graphics();
        strip.beginFill(line, 0.3).drawRect(1.5 * k, 1.5 * k, w - 3 * k, stripH - 1.5 * k).endFill();
        strip.lineStyle({ width: 1.5 * k, color: line, alpha: 0.8 }).moveTo(0, stripH).lineTo(w, stripH);
        box.addChild(strip);

        const empty = !flag.title.trim();
        const title = new T(empty ? NOTE_DEFAULT_TITLE : flag.title, new PIXI.TextStyle({
          fontFamily: MAP_NOTE.fontFamily, fontSize: 24 * k, fontWeight: "800", fill: ink, wordWrap: false, lineHeight: 24 * k * 1.2,
        }));
        title.alpha = empty ? 0.45 : 1;
        title.position.set(pad, (stripH - title.height) / 2);
        // the GM's chip at the strip's right end (author, 2026-11-14): «Видима» while players see the sticker, «Прихована» while not
        let hidW = 0;
        if (game.user.isGM) {
          const hidden = !!this.document.hidden;
          const hid = new T(hidden ? "Прихована" : "Видима", new PIXI.TextStyle({ fontFamily: MAP_NOTE.fontFamily, fontSize: 15 * k, fontWeight: "800", fill: hidden ? 0xf2ecd8 : 0x0e1a10, letterSpacing: 0.5 * k }));
          const cw = hid.width + 12 * k, ch = hid.height + 4 * k;
          const cx = w - pad - (flag.locked ? 30 * k : 0) - cw, cy = (stripH - ch) / 2;
          const bg = new PIXI.Graphics();
          bg.beginFill(hidden ? ink : 0x3dff47, hidden ? 0.85 : 0.9).drawRoundedRect(cx, cy, cw, ch, 3 * k).endFill();
          hid.position.set(cx + 6 * k, cy + 2 * k);
          box.addChild(bg, hid);
          hidW = cw + 8 * k;
        }
        const tmask = new PIXI.Graphics();
        tmask.beginFill(0xffffff).drawRect(0, 0, w - pad - (flag.locked ? 30 * k : pad) - hidW, stripH).endFill();
        box.addChild(tmask, title);
        title.mask = tmask;

        if (flag.locked) {
          const lk = new PIXI.Graphics(), lx = w - 22 * k, ly = stripH / 2;
          lk.lineStyle({ width: 2 * k, color: ink, alpha: 0.7 }).arc(lx + 6 * k, ly - 3 * k, 4.5 * k, Math.PI, 0);
          lk.lineStyle(0).beginFill(ink, 0.7).drawRoundedRect(lx, ly - 3 * k, 12 * k, 10 * k, 2 * k).endFill();
          box.addChild(lk);
        }

        if (flag.text) {
          const body = new T(flag.text, new PIXI.TextStyle({
            fontFamily: MAP_NOTE.fontFamily, fontSize: 22 * k, fill: ink, wordWrap: true, wordWrapWidth: Math.max(10, w - 2 * pad),
            lineHeight: 22 * k * 1.2, breakWords: true,
          }));
          body.position.set(pad, stripH + 8 * k);
          const bmask = new PIXI.Graphics();
          bmask.beginFill(0xffffff).drawRect(0, stripH + 2 * k, w, h - stripH - 2 * k - 3 * k).endFill();
          box.addChild(bmask, body);
          body.mask = bmask;
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
    const { w, h } = noteSize(flag, size);
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
  if (!onGrabStrip(pt.x, pt.y, { ...hit.rect }, hit.flag, canvas.dimensions.size)) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  drag = { ...hit, px: ev.clientX, py: ev.clientY, start: { x: hit.doc.x, y: hit.doc.y }, moved: false, end: null };
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
  if (!d.moved || !d.end || (d.end.x === d.start.x && d.end.y === d.start.y)) {
    d.placeable.renderFlags?.set({ refreshPosition: true });
    return;
  }
  try { await d.doc.update({ x: d.end.x, y: d.end.y }); }
  catch (err) { console.warn("Пустельники | note not moved", err); d.placeable.renderFlags?.set({ refreshPosition: true }); }
}

function onDragCancel() {
  const d = drag; drag = null;
  stopDragListeners();
  d?.placeable.renderFlags?.set({ refreshPosition: true });
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
  editor = { doc, root, title, body, timer: null, armTimer: null };

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
  const upd = {};
  if (title.value !== flag.title) upd[flagPath("title")] = title.value;
  if (body.value !== flag.text) upd[flagPath("text")] = body.value;
  if (Object.keys(upd).length) doc.update(upd).catch((err) => console.warn("Пустельники | note not saved", err));
}

/** The bar's labels and the colours follow the note's state */
function syncEditor() {
  if (!editor) return;
  const { doc, root } = editor;
  const flag = noteOf(doc);
  if (!flag) return closeNoteEditor();
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
  const { w, h } = noteSize(flag, size);
  const cx = drag?.doc === doc && drag.end ? drag.end.x : doc.x, cy = drag?.doc === doc && drag.end ? drag.end.y : doc.y;
  const p = { x: (cx - st.pivot.x) * s + st.position.x, y: (cy - st.pivot.y) * s + st.position.y };
  const k = s * scaleK();
  const pw = flag.min ? Math.max(w * s, 240) : w * s;
  root.style.setProperty("--k", String(k));
  root.style.left = `${r.left + p.x}px`;
  root.style.top = `${r.top + p.y}px`;
  root.style.width = `${pw}px`;
  root.style.height = flag.min ? "auto" : `${h * s}px`;
  root.style.setProperty("--strip", `${MAP_NOTE.stripH * size * s}px`);
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
      await doc.update({ [flagPath("color")]: b.dataset.color, fillColor: c.fill, strokeColor: c.line });
    } else if (act === "hide" && game.user.isGM) {
      await doc.update({ hidden: !doc.hidden });
    } else if (act === "lock") {
      await doc.update({ [flagPath("locked")]: !flag.locked, locked: !flag.locked });
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
      await doc.delete();
    }
  } catch (err) { console.warn("Пустельники | note action failed", err); warn("Не вдалося змінити примітку."); }
}

/** Fold to a 1×1 marker (the full size is remembered) or unfold back, staying inside the scene */
async function toggleFold(doc, flag) {
  const size = canvas.dimensions.size;
  if (!flag.min) {
    const g = foldGeometry(flag, doc.shape, size);
    await doc.update({ [flagPath("min")]: true, [flagPath("full")]: g.full, shape: { width: g.w, height: g.h } });
  } else {
    const g = unfoldGeometry(flag, doc.x, doc.y, size, sceneRect());
    await doc.update({ [flagPath("min")]: false, x: g.x, y: g.y, shape: { width: g.w, height: g.h } });
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
  openNoteEditor(hit.doc, pt.y < hit.rect.y + MAP_NOTE.stripH * canvas.dimensions.size ? "title" : "body");
}

/** A press outside the editor closes it */
function onDocPointerDown(ev) {
  if (editor && !editor.root.contains(ev.target)) closeNoteEditor();
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

/** «Примітка»: a 3×3 sticker at the view's centre, snapped and inside the scene; hidden from players when the GM makes it; opens for typing */
export async function addMapNote() {
  if (!canvas.ready || !canvas.scene) return warn("Спершу відкрий сцену.");
  if (!game.user.isGM && !game.user.can("DRAWING_CREATE")) return warn("Тобі не дозволено створювати малюнки й примітки.");
  const size = canvas.dimensions.size;
  const { w, h } = noteSize({ min: false }, size);
  const c = canvas.stage.pivot;
  const pos = placeNew(c.x, c.y, w, h, size, sceneRect(), gridOrigin());
  const col = MAP_NOTE.colors[MAP_NOTE.color];
  const [doc] = await canvas.scene.createEmbeddedDocuments("Drawing", [{
    x: pos.x, y: pos.y, shape: { type: "r", width: w, height: h },
    fillType: CONST.DRAWING_FILL_TYPES.SOLID, fillColor: col.fill, fillAlpha: 0.9,
    strokeWidth: 4, strokeColor: col.line, strokeAlpha: 1,
    text: "", hidden: game.user.isGM,
    flags: { [sys()]: { mapNote: { title: NOTE_DEFAULT_TITLE, text: "", color: MAP_NOTE.color, min: false, locked: false } } },
  }]);
  if (doc) openNoteEditor(doc, "title");
  return doc;
}

/* ===================== Old notes (made with Foundry's own text) ===================== */

/** The GM's client, once: the words of an old note go from Foundry's text into the flag */
async function migrateLegacy() {
  if (!game.users.activeGM?.isSelf) return;
  for (const scene of game.scenes) {
    const updates = [];
    for (const d of scene.drawings) {
      const u = legacyUpdate({ _id: d.id, text: d.text, flag: d.getFlag(sys(), "mapNote") }, sys());
      if (u) updates.push(u);
    }
    if (updates.length) await scene.updateEmbeddedDocuments("Drawing", updates).catch((err) => console.warn("Пустельники | notes not converted", err));
  }
}

/** Once, in `ready`: the listeners, the hooks, the old notes */
export function readyMapNotes() {
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
  migrateLegacy();
}
