/**
 * Visual test of design and placement (author, 2026-11-14): runs INSIDE a live Foundry page (it measures the real
 * layout), never changes the world's data — it only opens and closes sheets and reads the DOM (the two builder scenarios make a temporary
 * item of their own and delete it).
 *
 *   const { runAudit } = await import(`/systems/${game.system.id}/tests/ui/audit.mjs?${Date.now()}`);
 *   await runAudit();               // every scenario; returns { failures, report } and logs a table
 *   await runAudit(["dock"]);       // only some
 *
 * The rules come from the author's decisions on the UI (CLAUDE.md, memory «UI symmetry check», «Number field style»):
 *   – nothing is cut: no text runs out of its box (buttons, labels, chips, names); no raw i18n keys on screen;
 *   – neighbours line up: buttons of one row share top and height; panels stacked in one column share left / right edges;
 *     gaps between stacked panels are equal (6 px inside a unit, 8 px between units);
 *   – everything stays on screen, and the left panels stay above Foundry's players list;
 *   – sizes the author fixed: folded panels 168 × 30, the place card's switches 132 px wide, the map panel one row of
 *     equal buttons, «Відкрити .json Пустельників» full width under Create Actor / Create Folder (those two equal);
 *   – every −/+ counter: the input is a dark screen (`pust-screen`), − reddish, + greenish;
 *   – text is readable: contrast at least 3:1 against the nearest opaque background; nothing under 10 px;
 *   – (author, 2026-11-15) at the window's narrowest width and at its usual one, on every tab: no element runs out of its
 *     visual block (the nearest ancestor with a border or a background), no two elements overlap, and no button lies on a
 *     border or a divider line (scenario `minWidth`; the rules `noSpill`, `noOverlap`, `buttonsClear` serve any scenario);
 *     and nothing presses against its block's frame: where a block has padding, the elements keep clear of its border
 *     (`noCrowd`; a «✕» glued to a card's edge, 2026-11-15).
 * Each scenario adds results { scenario, rule, ok, detail }.
 */
const PX = 1.01; // tolerance, px
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const R = (el) => el.getBoundingClientRect();
const name = (el) => {
  if (!el) return "?";
  const t = (el.getAttribute?.("aria-label") || el.title || el.innerText || el.value || el.className || el.tagName).toString().trim().replace(/\s+/g, " ");
  return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} «${t.slice(0, 40)}»`;
};
const shown = (el) => {
  if (!el?.isConnected) return false;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  if (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true })) return false; // e.g. inside a closed <details>
  const r = R(el);
  return r.width > 0 && r.height > 0;
};

class Audit {
  results = [];
  scenario = "";
  ok(rule, cond, detail = "") { this.results.push({ scenario: this.scenario, rule, ok: !!cond, detail }); return !!cond; }
  skip(rule, why) { this.results.push({ scenario: this.scenario, rule, ok: true, detail: `пропущено: ${why}`, skipped: true }); }

  /* ---------- generic rules ---------- */

  /** No text runs out of its box (inputs: their value; elements that ellipsize on purpose are allowed) */
  noCut(root, sel = "button, label, span, b, small, h1, h2, h3, h4, a, input[type=text], .pust-chip, li") {
    const bad = [];
    for (const el of root.querySelectorAll(sel)) {
      if (!shown(el) || el.closest(".pust-audit-skip")) continue;
      const cs = getComputedStyle(el);
      if (cs.textOverflow === "ellipsis" && el.title) continue; // shortened on purpose, the full text in the tooltip
      if (el.tagName === "INPUT" && document.activeElement === el) continue;
      if (el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "visible" && el.clientWidth > 0) bad.push(name(el));
      else if (el.tagName !== "INPUT" && cs.overflowX === "visible" && el.children.length === 0) {
        // a plain text box sticking out of its parent
        const p = el.parentElement, pr = p && R(p), r = R(el);
        if (p && getComputedStyle(p).overflowX !== "visible" && (r.right > pr.right + PX || r.left < pr.left - PX)) bad.push(name(el));
      }
    }
    return this.ok("текст не обрізано", !bad.length, bad.slice(0, 6).join("; "));
  }

  /** No raw i18n keys or [object Object] on screen */
  noRawKeys(root) {
    const t = root.innerText || "";
    const m = t.match(/\b(WASTELANDERS|TYPES|SETTINGS)\.[A-Za-z.]+|\[object Object\]|undefined|NaN/g);
    return this.ok("немає сирих ключів / undefined", !m, (m || []).slice(0, 4).join(", "));
  }

  /** Inside the window, and (for the left panels) above Foundry's players list */
  onScreen(els, { abovePlayers = false } = {}) {
    const bad = [];
    const pl = R(document.querySelector("#players") ?? document.body);
    for (const el of els) {
      if (!shown(el)) continue;
      const r = R(el);
      // the players list is a floor only for what stands over it (author, 2026-11-17: «Огляд битви» stands on the right)
      const floor = abovePlayers && r.left < pl.right && r.right > pl.left ? Math.min(innerHeight, pl.top || innerHeight) : innerHeight;
      if (r.left < -PX || r.top < -PX || r.right > innerWidth + PX || r.bottom > floor + PX) bad.push(`${name(el)} ${Math.round(r.left)},${Math.round(r.top)}–${Math.round(r.right)},${Math.round(r.bottom)}`);
    }
    return this.ok(abovePlayers ? "на екрані й над списком гравців" : "на екрані", !bad.length, bad.join("; "));
  }

  /** One row: same top and height; equal widths if asked */
  row(els, { equalWidth = false, label = "ряд" } = {}) {
    els = els.filter(shown);
    if (els.length < 2) return this.skip(label, "менше двох елементів");
    const rs = els.map(R), top = rs[0].top, h = rs[0].height, w = rs[0].width;
    const off = rs.map((r, i) => (Math.abs(r.top - top) > PX || Math.abs(r.height - h) > PX || (equalWidth && Math.abs(r.width - w) > PX) ? `${name(els[i])} ${Math.round(r.top)}/${Math.round(r.width)}×${Math.round(r.height)}` : null)).filter(Boolean);
    return this.ok(`${label}: однаковий верх і висота${equalWidth ? ", рівна ширина" : ""}`, !off.length, off.join("; "));
  }

  /** A column: shared left and right edges, equal gaps (expected gap optional) */
  column(els, { gap = null, label = "стовпчик", sameRight = true } = {}) {
    els = els.filter(shown);
    if (els.length < 2) return this.skip(label, "менше двох елементів");
    const rs = els.map(R);
    const edges = rs.filter((r) => Math.abs(r.left - rs[0].left) > PX || (sameRight && Math.abs(r.right - rs[0].right) > PX));
    this.ok(`${label}: спільні краї`, !edges.length, edges.map((r) => `${Math.round(r.left)}–${Math.round(r.right)}`).join("; "));
    if (gap === false) return true; // only the edges matter here (other rows stand in between)
    const gaps = rs.slice(1).map((r, i) => Math.round(r.top - rs[i].bottom));
    const want = gap ?? gaps[0];
    return this.ok(`${label}: відступи ${want} px`, gaps.every((g) => Math.abs(g - want) <= 1), `відступи: ${gaps.join(", ")}`);
  }

  /** Labels that must stay on one line (a wrapped label breaks the row's rhythm) */
  oneLine(els, label = "підписи в один рядок") {
    const bad = els.filter(shown).filter((el) => { const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.3; return R(el).height > lh * 1.5; });
    return this.ok(label, !bad.length, bad.map((el) => `${name(el)} ${Math.round(R(el).height)} px`).join("; "));
  }

  /** Exact size */
  size(el, w, h, label) {
    if (!shown(el)) return this.skip(label, "не видно");
    const r = R(el);
    return this.ok(`${label}: ${w ?? "*"} × ${h ?? "*"}`, (w == null || Math.abs(r.width - w) <= PX) && (h == null || Math.abs(r.height - h) <= PX), `${Math.round(r.width)} × ${Math.round(r.height)}`);
  }

  /** −/+ counters: dark screen input, − reddish, + greenish */
  counters(root) {
    const bad = [];
    for (const btn of root.querySelectorAll('button[data-d="-1"], button[data-d="1"]')) {
      if (!shown(btn)) continue;
      const box = btn.parentElement;
      const input = box?.querySelector("input");
      if (input && !input.classList.contains("pust-screen") && !input.closest("#pust-mapdock")) bad.push(`${name(input)} без pust-screen`);
      // the colour may sit in the text, the background or the first stop of a gradient
      const cs = getComputedStyle(btn);
      const rgb = (s) => (String(s).match(/rgba?\(([^)]+)\)/)?.[1].split(",").map(Number) ?? [0, 0, 0]);
      const tones = [rgb(cs.color), rgb(cs.backgroundColor), rgb(cs.backgroundImage)];
      const minus = btn.dataset.d === "-1";
      const reddish = tones.some(([r, g]) => r > g + 20);
      const greenish = tones.some(([r, g]) => g > r + 20);
      if (minus && !reddish && !btn.classList.contains("dn")) bad.push(`${name(btn)} − не червонястий`);
      if (!minus && !greenish && !btn.classList.contains("up")) bad.push(`${name(btn)} + не зеленуватий`);
    }
    return this.ok("лічильники −/+ у стилі системи", !bad.length, bad.slice(0, 5).join("; "));
  }

  /** Readable: contrast ≥ 3:1 with the nearest opaque background, font ≥ 10 px */
  readable(root, sel = "button, label, span, b, small, p, li, h3, h4, input") {
    const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
    // «rgb(…)» / «rgba(…)», or «color(srgb r g b / a)» (what color-mix() computes to) with 0…1 channels
    const rgba = (s) => {
      const n = (String(s).match(/[\d.]+/g) || [0, 0, 0, 0]).map(Number);
      if (/^color\(srgb/.test(s)) return [n[0] * 255, n[1] * 255, n[2] * 255, n[3] ?? 1];
      return n;
    };
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.backgroundImage && cs.backgroundImage !== "none") return null; // a gradient or texture: can't judge
        const c = rgba(cs.backgroundColor);
        if ((c[3] ?? 1) >= 0.9) return c;
      }
      return null;
    };
    const bad = [], small = [];
    for (const el of root.querySelectorAll(sel)) {
      if (!shown(el) || !(el.innerText || el.value || "").trim() || el.closest(".pust-audit-skip")) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.fontSize) < 10 - 0.01) small.push(`${name(el)} ${cs.fontSize}`);
      if (parseFloat(cs.opacity) < 0.6) continue;
      const bg = bgOf(el);
      if (!bg) continue;
      const fg = rgba(cs.color), a = lum(fg), b = lum(bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      if (ratio < 3) bad.push(`${name(el)} ${ratio.toFixed(1)}:1`);
    }
    this.ok("шрифт не менший за 10 px", !small.length, small.slice(0, 5).join("; "));
    return this.ok("контраст тексту ≥ 3:1", !bad.length, bad.slice(0, 6).join("; "));
  }

  /* ---------- layout rules (author, 2026-11-15): spills, overlaps, buttons on lines ---------- */

  /** No element runs out of its visual block — the nearest ancestor with a visible border or background (inside its border) */
  noSpill(root, label = "елементи не вилазять за свій блок") {
    const cs = styleCache();
    const bad = [];
    for (const el of layoutLeaves(root, cs)) {
      const r = boxOf(el);
      let block = null, scrolled = false;
      for (let e = el.parentElement; e && root.contains(e); e = e.parentElement) {
        const s = cs(e);
        if (/(auto|scroll)/.test(s.overflowX + " " + s.overflowY)) { scrolled = true; break; } // a scroller's content may run on
        if (s.display !== "contents" && !/^inline/.test(s.display) && isBlock(s)) { block = e; break; }
        if (e === root) break;
      }
      if (!block || scrolled) continue;
      const s = cs(block), b = R(block);
      const inner = { left: b.left + parseFloat(s.borderLeftWidth), right: b.right - parseFloat(s.borderRightWidth), top: b.top + parseFloat(s.borderTopWidth), bottom: b.bottom - parseFloat(s.borderBottomWidth) };
      const over = Math.max(inner.left - r.left, r.right - inner.right, inner.top - r.top, r.bottom - inner.bottom);
      if (over > PX) bad.push(`${name(el)} з ${name(block)} на ${Math.round(over)} px`);
    }
    return this.ok(label, !bad.length, bad.slice(0, 6).join("; "));
  }

  /** Nothing presses against its block's frame (author, 2026-11-15): on every side where the block has padding, its
   *  elements keep at least min(padding, 4) − 1 px from the border's inner edge */
  noCrowd(root, label = "елементи не тиснуться до меж блоку") {
    const cs = styleCache();
    const bad = [];
    for (const el of layoutLeaves(root, cs)) {
      const r = boxOf(el);
      let block = null, scrolled = false;
      for (let e = el.parentElement; e && root.contains(e); e = e.parentElement) {
        const s = cs(e);
        if (/(auto|scroll)/.test(s.overflowX + " " + s.overflowY)) { scrolled = true; break; }
        if (s.display !== "contents" && !/^inline/.test(s.display) && isBlock(s)) { block = e; break; }
        if (e === root) break;
      }
      if (!block || scrolled) continue;
      const s = cs(block), b = R(block);
      const sides = [
        ["ліво", parseFloat(s.paddingLeft), r.left - (b.left + parseFloat(s.borderLeftWidth))],
        ["право", parseFloat(s.paddingRight), (b.right - parseFloat(s.borderRightWidth)) - r.right],
        ["верх", parseFloat(s.paddingTop), r.top - (b.top + parseFloat(s.borderTopWidth))],
        ["низ", parseFloat(s.paddingBottom), (b.bottom - parseFloat(s.borderBottomWidth)) - r.bottom],
      ];
      for (const [side, pad, gap] of sides) {
        if (!(pad >= 2)) continue; // a block without padding there lets its content sit flush on purpose
        const need = Math.min(pad, 4) - 1;
        if (gap < need - 0.01) { bad.push(`${name(el)} у ${name(block)}: ${side} ${Math.max(0, Math.round(gap * 10) / 10)} px (поле ${Math.round(pad)} px)`); break; }
      }
    }
    return this.ok(label, !bad.length, bad.slice(0, 6).join("; "));
  }

  /** Glued pieces are one height (author, 2026-11-15: a green «У руках» chip stuck out under its name field): two framed
   *  neighbours that touch side by side — a chip and its field — share their top and bottom */
  gluedEven(root, label = "склеєні елементи однакової висоти") {
    const cs = styleCache();
    const framed = (el) => { const s = cs(el); return isBlock(s); };
    // decorative bars (aria-hidden: the portrait's HP bar, its fill under its label) are layers, not glued pairs (2026-11-16)
    const items = [...root.querySelectorAll("*")].filter((el) => shown(el) && !el.closest(".pust-audit-skip, .window-header, [aria-hidden=\"true\"]") && cs(el).display !== "contents" && framed(el));
    const bad = [];
    for (const A of items) {
      const B = A.nextElementSibling;
      if (!B || !shown(B) || !framed(B)) continue;
      const a = R(A), b = R(B);
      const touch = Math.abs(a.right - b.left) <= 1;
      const side = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > Math.min(a.height, b.height) * 0.5;
      if (!touch || !side) continue;
      const dt = Math.abs(a.top - b.top), db = Math.abs(a.bottom - b.bottom);
      if (dt > PX || db > PX) bad.push(`${name(A)} + ${name(B)}: верх ${Math.round(dt)} px, низ ${Math.round(db)} px`);
    }
    return this.ok(label, !bad.length, bad.slice(0, 6).join("; "));
  }

  /** No two elements overlap (controls, pictures and text; one inside the other doesn't count) */
  noOverlap(root, label = "елементи не налазять одне на одного") {
    const cs = styleCache();
    const items = layoutLeaves(root, cs).map((el) => ({ el, r: boxOf(el), sc: scrollerOf(el, cs) }));
    const bad = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i], B = items[j];
        if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
        if (A.sc !== B.sc) continue; // one scrolls under the other (a bar over a scrolling list)
        const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left);
        const h = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
        if (!(w > 1.5 && h > 1.5)) continue;
        // inline text that wraps (author, 2026-11-15: «Битва:» and the event after it in one paragraph): its box spans both
        // lines, its lines don't — compared line by line
        const lines = (el) => (cs(el).display === "inline" ? [...el.getClientRects()] : [el.getBoundingClientRect()]);
        if (cs(A.el).display === "inline" || cs(B.el).display === "inline") {
          const hit = lines(A.el).some((a) => lines(B.el).some((b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1.5 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1.5));
          if (!hit) continue;
        }
        bad.push(`${name(A.el)} × ${name(B.el)} (${Math.round(w)}×${Math.round(h)} px)`);
      }
    }
    return this.ok(label, !bad.length, bad.slice(0, 6).join("; "));
  }

  /** Nothing — buttons, fields, chips, text — lies on a border or a divider line of another element (its own block's frame
   *  included; author, 2026-11-15: «1d10 побічка» sat on its heading's bottom rule) */
  buttonsClear(root, label = "елементи не налазять на межі й лінії") {
    const cs = styleCache();
    const lines = [];
    for (const e of [root, ...root.querySelectorAll("*")]) {
      if (e.matches("button, input, select, textarea, option, a.button, [role=button], img, svg, svg *") || e.closest(".pust-audit-skip, .window-resizable-handle, .window-header")) continue;
      if (!shown(e)) continue;
      const s = cs(e);
      if (s.display === "contents") continue;
      const b = R(e);
      const sides = [["top", s.borderTopWidth, s.borderTopStyle, s.borderTopColor], ["bottom", s.borderBottomWidth, s.borderBottomStyle, s.borderBottomColor], ["left", s.borderLeftWidth, s.borderLeftStyle, s.borderLeftColor], ["right", s.borderRightWidth, s.borderRightStyle, s.borderRightColor]];
      const drawn = sides.filter(([, w, st, c]) => parseFloat(w) > 0 && st !== "none" && st !== "hidden" && alphaOf(c) >= 0.15);
      const rule = drawn.length > 0 && drawn.length <= 2; // a divider (one or two sides), not a frame — a chip glued to its field has three: it wants clear space around it
      for (const [side, w, st, c] of sides) {
        const bw = parseFloat(w);
        if (!(bw > 0) || st === "none" || st === "hidden" || alphaOf(c) < 0.15) continue;
        const L = side === "top" ? { left: b.left, right: b.right, top: b.top, bottom: b.top + bw }
          : side === "bottom" ? { left: b.left, right: b.right, top: b.bottom - bw, bottom: b.bottom }
          : side === "left" ? { left: b.left, right: b.left + bw, top: b.top, bottom: b.bottom }
          : { left: b.right - bw, right: b.right, top: b.top, bottom: b.bottom };
        lines.push({ e, side, L, rule });
      }
    }
    const bad = [];
    for (const btn of layoutLeaves(root, cs)) {
      if (btn.matches(".header-control")) continue;
      // the part of the element its scrolling / clipping ancestors let through
      const b0 = boxOf(btn);
      const r = { left: b0.left, right: b0.right, top: b0.top, bottom: b0.bottom };
      const scrollers = [];
      for (let e = btn.parentElement; e && root.contains(e); e = e.parentElement) {
        const s = cs(e);
        if (s.overflowX === "visible" && s.overflowY === "visible") continue;
        scrollers.push(e);
        const b = R(e), c = { left: b.left + e.clientLeft, top: b.top + e.clientTop, right: b.left + e.clientLeft + e.clientWidth, bottom: b.top + e.clientTop + e.clientHeight }; // inside its frame
        r.left = Math.max(r.left, c.left); r.right = Math.min(r.right, c.right); r.top = Math.max(r.top, c.top); r.bottom = Math.min(r.bottom, c.bottom);
      }
      if (r.right - r.left < 2 || r.bottom - r.top < 2) continue;
      const inner = { left: r.left + 1, right: r.right - 1, top: r.top + 1, bottom: r.bottom - 1 };
      const near = { left: r.left - 2, right: r.right + 2, top: r.top - 2, bottom: r.bottom + 2 }; // a divider wants 2 px clear
      const sc = scrollerOf(btn, cs);
      for (const { e, side, L, rule } of lines) {
        if (btn.contains(e)) continue;
        if (!e.contains(btn) && scrollerOf(e, cs) !== sc && e !== sc) continue; // they scroll apart
        const box = rule && !scrollers.includes(e) ? near : inner; // content scrolls up to a scroller's own frame
        if (e.contains(btn) && scrollers.some((sc) => e.contains(sc) && sc !== e)) continue; // content scrolls under that frame
        if (Math.min(box.right, L.right) - Math.max(box.left, L.left) > 0 && Math.min(box.bottom, L.bottom) - Math.max(box.top, L.top) > 0) {
          bad.push(`${name(btn)} ${rule ? "впритул до лінії" : "на межі"} (${side}) ${name(e)}`);
          break;
        }
      }
    }
    return this.ok(label, !bad.length, bad.slice(0, 6).join("; "));
  }

  /** The three layout rules and the text rule at once */
  layout(root, where = "") {
    const t = where ? ` (${where})` : "";
    this.noSpill(root, `елементи не вилазять за свій блок${t}`);
    this.noOverlap(root, `елементи не налазять одне на одного${t}`);
    this.buttonsClear(root, `елементи не налазять на межі й лінії${t}`);
    this.noCrowd(root, `елементи не тиснуться до меж блоку${t}`);
    this.gluedEven(root, `склеєні елементи однакової висоти${t}`);
    this.noCut(root, "button, label, span, b, small, h1, h2, h3, h4, a, .pust-chip, li");
  }
}

/* ---------- layout helpers ---------- */
/** The nearest ancestor that scrolls (overflow auto / scroll), or null */
const scrollerOf = (el, cs) => {
  for (let e = el.parentElement; e; e = e.parentElement) { const s = cs(e); if (/(auto|scroll)/.test(s.overflowX + " " + s.overflowY)) return e; }
  return null;
};
const styleCache = () => { const m = new Map(); return (el) => { let s = m.get(el); if (!s) { s = getComputedStyle(el); m.set(el, s); } return s; }; };
/** The alpha of a computed colour («rgb(…)», «rgba(…)», «color(srgb … / a)») */
const alphaOf = (c) => {
  c = String(c);
  if (/^color\(/.test(c)) { const a = c.split("/")[1]; return a == null ? 1 : parseFloat(a); }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return 0;
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return p.length > 3 ? p[3] : 1;
};
/** A visual block: a visible border on some side, a background colour or a background picture */
const isBlock = (s) => {
  const side = (w, st, c) => parseFloat(w) > 0 && st !== "none" && st !== "hidden" && alphaOf(c) >= 0.15;
  return side(s.borderTopWidth, s.borderTopStyle, s.borderTopColor) || side(s.borderBottomWidth, s.borderBottomStyle, s.borderBottomColor)
    || side(s.borderLeftWidth, s.borderLeftStyle, s.borderLeftColor) || side(s.borderRightWidth, s.borderRightStyle, s.borderRightColor)
    || alphaOf(s.backgroundColor) >= 0.3 || (s.backgroundImage && s.backgroundImage !== "none");
};
/** The elements the layout rules look at: controls, pictures, chips, and elements with text of their own */
const LEAF_CTL = "button, input:not([type=hidden]), select, textarea, img, svg, [role=button], .pust-chip";
const layoutLeaves = (root, cs) => {
  const out = [];
  for (const el of root.querySelectorAll("*")) {
    if (el.closest(".pust-audit-skip, .window-header, .window-resizable-handle, option, svg *") || !shown(el)) continue;
    const s = cs(el);
    if (s.position === "fixed" || parseFloat(s.opacity) === 0 || s.display === "contents") continue;
    const ctl = el.matches(LEAF_CTL);
    const ownText = !ctl && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!ctl && !ownText) continue;
    if (el.parentElement?.closest("button, select, textarea, [role=button], .pust-chip")) continue; // inside a control: counts with it
    out.push(el);
  }
  return out;
};
/** A control's box; for text, the box of its own text (an inline box may be wider than its words) */
const boxOf = (el) => {
  if (el.matches(LEAF_CTL)) return R(el);
  const rs = [];
  for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { const rg = document.createRange(); rg.selectNodeContents(n); rs.push(...rg.getClientRects()); }
  if (!rs.length) return R(el);
  return { left: Math.min(...rs.map((r) => r.left)), right: Math.max(...rs.map((r) => r.right)), top: Math.min(...rs.map((r) => r.top)), bottom: Math.max(...rs.map((r) => r.bottom)) };
};

/** The layout rules on one window at its narrowest width and at its usual one; the window keeps its place */
/** `globalThis.pustAuditActor = "<id>"` (2026-11-18): the sheets' scenarios take this actor when it is of their type */
function auditActor(type) {
  const x = game.actors.get(String(globalThis.pustAuditActor ?? ""));
  return x?.type === type && x.visible ? x : null;
}

async function layoutAt(a, app, label) {
  const pos = { ...app.position };
  for (const w of [100, app.options?.position?.width ?? 600]) {
    app.setPosition({ width: w }); await sleep(350);
    a.scenario = `${label}, ${Math.round(R(app.element).width)} px`;
    a.layout(app.element);
  }
  app.setPosition({ width: pos.width, left: pos.left, top: pos.top });
  await sleep(250);
}

/* ---------- scenarios ---------- */
const SCENARIOS = {
  /** The left panels of the map */
  async dock(a) {
    const dock = document.querySelector("#pust-mapdock");
    if (!dock) return a.skip("панелі", "немає #pust-mapdock");
    const map = dock.querySelector('[data-unit="map"]'), dice = dock.querySelector('[data-unit="dice"]'), ctrU = dock.querySelector('[data-unit="ctr"]');
    a.onScreen([...dock.querySelectorAll(".pust-md-unit, .pust-md-panel, .pust-md-travel")], { abovePlayers: true });
    a.noCut(dock);
    a.noRawKeys(dock);
    if (map && !map.classList.contains("folded")) {
      a.column([...map.querySelectorAll(":scope > .pust-md-panel")], { gap: 6, label: "панелі «Мапа Пустки»" });
      const btns = [...map.querySelectorAll(".pust-md-map [data-mapdock]")];
      if (btns.length) a.row(btns, { equalWidth: true, label: "кнопки «Мапи Пустки» в один ряд" });
    }
    // default places (author, 2026-11-14): «Мапа Пустки» on the left, «Лічильники» under it, «Кістки» under them (6 px);
    // «Битва» top right next to the sidebar, «Лічильники» and «Кістки» then on the left by themselves
    {
      const pos = JSON.parse(localStorage.getItem("pustelnyky-mapdock-pos") || "{}");
      const side = document.querySelector("#sidebar"), bar = document.querySelector("#scene-controls");
      const isBattle = map?.classList.contains("is-battle");
      const has = (u) => u && R(u).height > 0;
      if (isBattle && !pos.battle && side) a.ok("«Битва» праворуч, 8 px від бічної панелі", Math.abs(R(side).left - R(map).right - 8) <= 1.5, `${Math.round(R(side).left - R(map).right)} px`);
      if (!isBattle && has(map) && !pos.map && bar) a.ok("«Мапа Пустки» ліворуч, під кнопками шарів", Math.abs(R(map).left - R(bar).left) <= 1.5, `${Math.round(R(map).left)} / ${Math.round(R(bar).left)}`);
      const gmUser = game.user.isGM;
      for (const [u, k, n] of [[ctrU, "ctr", "«Лічильники»"], ...(gmUser ? [[dice, "dice", "«Кістки»"]] : [])]) if (has(u) && !pos[k] && bar) a.ok(`${n} ліворуч`, Math.abs(R(u).left - R(bar).left) <= 1.5, `${Math.round(R(u).left)} / ${Math.round(R(bar).left)}`);
      // players' «Кістки» (author, 2026-11-15): top right, 8 px from Foundry's sidebar, level with the layer buttons
      const sideBar = document.querySelector("#sidebar");
      if (!gmUser && has(dice) && !pos.dice && sideBar && bar) a.ok("«Кістки» гравця праворуч, 8 px від бічної панелі", Math.abs(R(sideBar).left - R(dice).right - 8) <= 1.5 && Math.abs(R(dice).top - R(bar).top) <= 1.5, `${Math.round(R(sideBar).left - R(dice).right)} px, верх ${Math.round(R(dice).top)} / ${Math.round(R(bar).top)}`);
      // players' «Обрати цілі» / «Зняти цілі» on a battle map: right of Foundry's buttons, not on them, not past «Зробити перевірку»
      const trow = dock.querySelector(".pust-md-trow:not([hidden])"), chk = dock.querySelector(".pust-md-check:not([hidden])");
      if (trow && bar) {
        const t = R(trow);
        const hits = [...document.querySelectorAll("#scene-controls li, #scene-navigation li")].filter((li) => { const r = R(li); return r.height && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top; });
        a.ok("«Обрати / Зняти цілі» не на кнопках Foundry", !hits.length, hits.map((h) => h.className).join(", "));
        if (chk) a.ok("«Обрати / Зняти цілі» не правіше «Зробити перевірку»", t.right <= R(chk).right + 1, `${Math.round(t.right)} / ${Math.round(R(chk).right)}`);
        a.row([...trow.querySelectorAll(":scope > button")], { equalWidth: true, label: "«Обрати цілі» / «Зняти цілі»" });
      }
      if (!isBattle && has(map) && has(ctrU) && !pos.map && !pos.ctr && !map.classList.contains("folded")) a.ok("«Лічильники» під «Мапою Пустки», 8 px", Math.abs(R(ctrU).top - R(map).bottom - 8) <= 1.5, `${Math.round(R(ctrU).top - R(map).bottom)} px`);
      if (gmUser && has(ctrU) && has(dice) && !pos.ctr && !pos.dice) a.ok("«Кістки» під «Лічильниками», 6 px", Math.abs(R(dice).top - R(ctrU).bottom - 6) <= 1.5, `${Math.round(R(dice).top - R(ctrU).bottom)} px`);
    }
    // folded panels: a 168 × 30 button each (author, 2026-11-14), «Лічильники» too now that they are a panel of their own
    for (const u of dock.querySelectorAll(".pust-md-unit.folded > .pust-md-panel:not([hidden])")) a.size(u, 168, 30, `згорнута «${u.querySelector("header span")?.innerText}»`);
    // three panels (author, 2026-11-14): «Лічильники» and «Кістки» apart; players' «Зробити перевірку» over «Лічильники», full width
    // players' «Лічильники» live under their Fate / Припаси rows, top right (author, 2026-11-16)
    if (game.user.isGM) a.ok("«Лічильники» й «Кістки» — окремі панелі", !dice?.querySelector(".pust-md-ctr") && !!ctrU?.querySelector(".pust-md-ctr"));
    else {
      a.ok("«Лічильники» гравця під рядками ЖД і Припасів", !!dice?.querySelector(":scope > .pust-md-ctr-pl") && !ctrU?.querySelector(".pust-md-ctr"));
      if (dice && !dice.classList.contains("folded")) a.column([...dice.querySelectorAll(":scope > .pust-md-fdrow, :scope > .pust-md-ctr-pl")].filter(shown), { gap: 6, label: "ЖД / Припаси / «Лічильники»" });
    }
    if (ctrU && !ctrU.classList.contains("folded")) a.column([...ctrU.querySelectorAll(":scope > .pust-md-check, :scope > .pust-md-panel")].filter(shown), { gap: 6, label: "«Зробити перевірку» / «Лічильники»" });
    // «Битва» on the battle map: its rows line up, its two buttons are equal
    const battle = dock.querySelector(".pust-md-battle:not([hidden])");
    if (battle && !map.classList.contains("folded")) {
      a.column([...battle.querySelectorAll(".pust-md-bscene")], { label: "місце / небезпека" });
      for (const r of battle.querySelectorAll(".pust-md-bscene")) a.row([...r.querySelectorAll(".pust-md-bval, .pust-md-bdie")], { label: "рядок місця" });
      a.row([...battle.querySelectorAll(".pust-md-bbtns > button")], { equalWidth: true, label: "«Зона» / «Супротивник»" });
      a.oneLine([...battle.querySelectorAll(".pust-md-blabel")], "підписи рядків «Битви» в один рядок");
      a.column([...battle.querySelectorAll(".pust-md-blabel")], { label: "колонка підписів «Битви»", sameRight: true, gap: false });
      for (const r of battle.querySelectorAll(".pust-md-bround")) a.row([...r.querySelectorAll(":scope > button, :scope > .pust-md-bnum, :scope > .pust-md-n")], { label: "рядок кола / Долі" });
      a.row([...battle.querySelectorAll(".pust-md-bquick > button:not(.pust-md-bmod)")], { equalWidth: true, label: "швидкі кістки" });
      a.row([...battle.querySelectorAll(".pust-md-bquick > button")], { label: "швидкі кістки з −1 / +1" });
      a.row([...battle.querySelectorAll(".pust-md-bact > button")], { equalWidth: true, label: "«Завдати шкоди» / «Лікувати»" });
      // the damage form in two columns: the type list and the second tick start where «Лікувати» does
      const col2 = R(battle.querySelector(".pust-md-bact > button:last-child")).left;
      a.ok("друга колонка форми шкоди рівна", [battle.querySelector(".pust-md-bdmg select"), battle.querySelector(".pust-md-bchk > label:last-child")].every((e) => e && Math.abs(R(e).left - col2) <= 1.5), `${Math.round(col2)}`);
      // the ticks (author, 2026-11-14): seen, not smaller than 16 px, centred on their words
      const ticks = [...battle.querySelectorAll(".pust-md-bchk input[type=checkbox]")];
      a.ok("галочки без значка Foundry поверх рамки", ticks.every((t) => getComputedStyle(t, "::before").content === "none"));
      a.ok("галочки «Битви» видимі (≥ 16 px)", ticks.every((t) => R(t).width >= 16 && R(t).height >= 16), ticks.map((t) => `${Math.round(R(t).width)}×${Math.round(R(t).height)}`).join(", "));
      a.ok("галочки по центру свого тексту", ticks.every((t) => { const l = t.closest("label"), rg = document.createRange(); rg.selectNodeContents(l); const tr = [...rg.getClientRects()].filter((r) => r.width > 20).pop() ?? R(l); return Math.abs((R(t).top + R(t).bottom) / 2 - (tr.top + tr.bottom) / 2) <= 2; }));
      a.readable(battle);
    }
    const ctr = dock.querySelector(".pust-md-ctr");
    // a folded panel is a small button at its own opacity (author, 2026-11-17: on a battle map «Лічильники» fold by themselves)
    if (ctr && shown(ctr) && !ctr.matches(":hover") && !ctr.closest(".pust-md-unit")?.classList.contains("folded")) {
      const empty = ctr.classList.contains("pust-md-empty");
      a.ok(`«Лічильники» ${empty ? "порожні напівпрозорі" : "непрозорі"}`, empty ? parseFloat(getComputedStyle(ctr).opacity) < 0.6 : getComputedStyle(ctr).opacity === "1", getComputedStyle(ctr).opacity);
    }
    a.counters(dock);
  },

  /** «Зробити перевірку» next to «Лічильники + Кістки» (players; opened here for the GM's own characters, nothing rolled) */
  async dockCheck(a) {
    const unit = document.querySelector('#pust-mapdock [data-unit="ctr"]');
    if (!unit) return a.skip("панель перевірки", "немає блоку «Лічильники»");
    const mod = await import(`/systems/${game.system.id}/module/applications/check-panel.mjs`);
    if (!game.actors.some((x) => x.type === "character" && x.isOwner)) return a.skip("панель перевірки", "немає своїх персонажів");
    const was = mod.dockCheckOpen();
    // the panel hangs under the button «Зробити перевірку» itself, as a press on it opens it (not under the whole unit)
    const anchor = unit.querySelector(".pust-md-check") ?? unit;
    if (!was) await mod.toggleDockCheck(anchor.getBoundingClientRect());
    await sleep(900);
    const el = document.getElementById("pust-check-dock");
    if (!el) return a.ok("панель перевірки відкривається", false);
    a.onScreen([el]);
    const u = R(anchor), p = R(el);
    // right under its anchor, left edges together (author, 2026-11-15), unless the sidebar pushes it left
    const side = document.querySelector("#sidebar")?.getBoundingClientRect();
    const pushed = side && u.left + p.width > side.left - 8;
    a.ok("під своєю кнопкою (6 px), ліві краї разом", Math.abs(p.top - u.bottom - 6) <= 1.5 && (pushed || Math.abs(p.left - u.left) <= 1.5), `згори ${Math.round(p.top - u.bottom)} px, зліва ${Math.round(p.left - u.left)} px`);
    const hd = el.querySelector(".pust-cd-hd");
    a.row([...hd.querySelectorAll(":scope > select, :scope > button")], { label: "заголовок панелі перевірки" });
    a.noCut(hd, "span, b, button");
    a.readable(hd, "span, b, select");
    // the ready-made checks' buttons tinted by their stripe (author, 2026-11-14): still readable
    a.readable(el, ".rpre button.chipb, .rpre button.chipb small");
    // the fast roll (author, 2026-11-18): «Кинути перевірку» in a strip stuck to the panel's bottom while the set-up scrolls,
    // nothing in it cut; the skills as buttons of one height
    const ro = el.querySelector(".pust-roller"), bar = ro?.querySelector(".pust-rgo-bar");
    a.ok("смуга «Кинути перевірку» є", !!bar);
    if (bar && !ro.classList.contains("pust-folded") && ro.scrollHeight > ro.clientHeight + 4) {
      ro.scrollTop = 0; await sleep(100);
      a.ok("смуга «Кинути перевірку» біля низу панелі, коли вміст прокручується", Math.abs(R(bar).bottom - R(ro).bottom) <= 1.5, `${Math.round(R(ro).bottom - R(bar).bottom)} px від низу`);
    }
    if (bar) { a.noCut(bar, "b, small, button"); a.readable(bar, "b, small, button"); }
    const sk = [...el.querySelectorAll(".pust-skchip")].filter(shown);
    if (sk.length) {
      a.ok("кнопки навичок однієї висоти", sk.every((b) => Math.abs(R(b).height - R(sk[0]).height) <= 1), sk.map((b) => Math.round(R(b).height)).join(", "));
      a.noCut(el, ".pust-skchip");
    }
    a.noRawKeys(el);
    if (!was) { await mod.toggleDockCheck(unit.getBoundingClientRect()); await sleep(400); }
  },

  /** The Actors directory's header buttons */
  async actorsHeader(a) {
    const h = document.querySelector("#actors .header-actions");
    if (!h || !shown(h)) { ui.sidebar?.changeTab?.("actors", "primary"); await sleep(400); }
    const hh = document.querySelector("#actors .header-actions");
    if (!hh || !shown(hh)) return a.skip("шапка акторів", "бокова панель згорнута");
    const create = hh.querySelector('[data-action="createEntry"]'), folder = hh.querySelector('[data-action="createFolder"]'), json = hh.querySelector(".wastelanders-json-open");
    a.row([create, folder], { equalWidth: true, label: "Create Actor / Create Folder" });
    if (json) {
      a.ok("«Відкрити .json Пустельників» на всю ширину під ними", Math.abs(R(json).left - R(create).left) <= PX && Math.abs(R(json).right - R(folder).right) <= PX && R(json).top > R(create).bottom, `${Math.round(R(json).left)}–${Math.round(R(json).right)}`);
      a.noCut(hh);
    }
  },

  /** Character and caravan sheets: the quick access block */
  async sheets(a) {
    for (const type of ["character", "caravan"]) {
      const actor = auditActor(type) ?? game.actors.find((x) => x.type === type && x.visible);
      if (!actor) { a.skip(type, "немає актора"); continue; }
      const was = actor.sheet.rendered;
      await actor.sheet.render({ force: true }); await sleep(1200);
      const el = actor.sheet.element;
      a.scenario = `аркуш: ${actor.name}`;
      a.onScreen([el]);
      a.noRawKeys(el);
      const q = el.querySelector(".pust-quickbar");
      if (q) {
        a.noCut(q, ".pust-qi > span, .pust-qlbl, button");
        a.ok("іконки біля назв блоків", q.querySelectorAll(".pust-qic").length >= (type === "character" ? 6 : 4), `${q.querySelectorAll(".pust-qic").length}`);
        a.counters(q);
        a.readable(q);
      }
      if (!was) await actor.sheet.close();
    }
  },

  /** «Бойова мапа»: the zone editor (if the viewed scene has zones) */
  async battleZones(a) {
    const Z = await import(`/systems/${game.system.id}/module/canvas/battle-zones.mjs`);
    const zones = Z.sceneZones();
    if (!zones.length) return a.skip("редактор зони", "на сцені немає зон");
    if (!game.user.isGM) return a.skip("редактор зони", "гравці бачать зони лише для читання");
    Z.openZoneEditor(zones.find((z) => Z.zoneOf(z.doc).aspects.length)?.doc ?? zones[0].doc);
    await sleep(400);
    const ed = document.querySelector(".pust-bz-edit");
    if (!ed) return a.ok("редактор зони відкривається", false);
    const bar = ed.querySelector(".pust-bz-bar"), paper = ed.querySelector(".pust-bz-paper");
    a.onScreen([bar, paper]);
    a.ok("панель над карткою, ліві краї спільні", Math.abs(R(bar).left - R(paper).left) <= 1.01 && R(bar).bottom <= R(paper).top + 1.01, `${Math.round(R(bar).left)} / ${Math.round(R(paper).left)}`);
    a.row([...bar.querySelectorAll(".pust-mn-btn")], { label: "кнопки панелі зони" });
    for (const row of ed.querySelectorAll(".pust-bz-row")) a.row([...row.children], { label: "рядок редактора" });
    a.noCut(ed, "button, .pust-bz-chip-t, .pust-mn-btn span, input");
    a.counters(ed);
    a.readable(ed, ".pust-bz-chip, .pust-mn-btn, input, .pust-bz-none");
    a.noRawKeys(ed);
    Z.closeZoneEditor();
  },

  /** The enemy sheet: as read, with every fold open, and in edit mode (the first enemy token on the viewed scene) */
  async enemySheet(a) {
    const tok = canvas.scene?.tokens.find((t) => t.actor?.type === "enemy");
    const actor = auditActor("enemy") ?? tok?.actor ?? game.actors.find((x) => x.type === "enemy" && x.visible);
    if (!actor) return a.skip("аркуш супротивника", "немає супротивників");
    const sheet = actor.sheet;
    const was = sheet.rendered;
    await sheet.render({ force: true }); await sleep(1200);
    const check = (label) => {
      const el = sheet.element;
      a.scenario = `аркуш ворога: ${label}`;
      a.onScreen([el]);
      a.noRawKeys(el);
      a.noCut(el, "button, label, h3, h4, summary, .pust-chip, span:not(.pust-place-sw), b, small");
      a.counters(el);
      a.readable(el);
      for (const row of el.querySelectorAll(".pust-en-atk-row, .pust-en-head-btns, .pust-en-quick")) a.row([...row.querySelectorAll(":scope > button")], { label: "кнопки в ряду" });
      // the bar under the name (author, 2026-11-15): category, «Видимий / Прихований», «Редагувати» in one row
      { const kids = [...el.querySelectorAll(".pust-en-bar > *:not(.pust-en-sp)")].filter(shown); const mid = (e) => (R(e).top + R(e).bottom) / 2; if (kids.length > 1) a.ok("смуга під назвою в один ряд", kids.every((k) => Math.abs(mid(k) - mid(kids[0])) <= 1.5), kids.map((k) => Math.round(mid(k))).join(" / ")); }
      // the attack row (author, 2026-11-14): dice chip, type and «Завдати цілям» on one line, centred
      // an attack with an extra part (author, 2026-11-19; `.wrap`): the chips on one line, «Завдати цілям» may go to the next
      // line, at the row's right edge
      for (const row of el.querySelectorAll(".pust-en-atkhd")) {
        const wrap = row.classList.contains("wrap");
        const kids = [...row.querySelectorAll(`:scope > .pust-en-dicechip, :scope > .pust-en-type${wrap ? "" : ", :scope > .pust-dmg-apply"}`)].filter(shown); const mid = (e) => (R(e).top + R(e).bottom) / 2;
        a.ok(wrap ? "рядок атаки з додатковою шкодою: чіпи по одній лінії" : "рядок атаки: чіп, тип і «Завдати цілям» по одній лінії", kids.every((k) => Math.abs(mid(k) - mid(kids[0])) <= 1.5), kids.map((k) => Math.round(mid(k))).join(" / "));
        const btn = wrap && [...row.querySelectorAll(":scope > .pust-dmg-apply")].find(shown);
        if (btn) a.ok("рядок атаки з додатковою шкодою: «Завдати цілям» біля правого краю", Math.abs(R(btn).right - R(row).right) <= 1.5 && (Math.abs(mid(btn) - mid(kids[0])) <= 1.5 || R(btn).top >= Math.max(...kids.map((k) => R(k).bottom)) - 1), `${Math.round(R(btn).right)} / ${Math.round(R(row).right)}`);
      }
    };
    check("перегляд");
    sheet.element.querySelectorAll("details[data-fold]").forEach((d) => { d.open = true; });
    await sleep(300);
    check("усе розгорнуто");
    const edit = sheet.element.querySelector('[data-action="editToggle"]');
    if (edit) { edit.click(); await sleep(900); check("редагування"); sheet.element.querySelector('[data-action="editToggle"]')?.click(); await sleep(600); }
    if (!was) await sheet.close();
  },

  /** «Зробити перевірку» open after a hit: the weapon chips and «Кинути й завдати» (author, 2026-11-17; nothing is rolled here) */
  async checkPanel(a) {
    const el = document.querySelector(".pust-roller .rdmg");
    if (!el) return a.skip("блок «Шкода» у перевірці", "відкрий «Зробити перевірку» й влуч атакою");
    el.scrollIntoView({ block: "nearest" }); // the panel scrolls inside: bring the block into view first
    await sleep(200);
    a.onScreen([el]);
    a.noCut(el, "button, span, b");
    a.readable(el, "button, span, b");
  },

  /** «Новий супротивник» (Create Actor → Супротивник, module/applications/enemy-create.mjs), when it is open */
  async enemyCreate(a) {
    const el = document.getElementById("pust-enemy-create");
    if (!el) return a.skip("форма нового супротивника", "відкрий Create Actor → Супротивник");
    a.onScreen([el]);
    a.noCut(el, "button, label, h3, span, b, small");
    a.noRawKeys(el);
    a.counters(el);
    a.readable(el);
  },

  /** «Конструктор виду»: a temporary world species item is made, its sheet opened (as made, then edited), and the item deleted */
  async speciesBuilder(a) {
    if (!game.user.isGM) return a.skip("конструктор виду", "лише Доглядач створює предмети");
    const item = await CONFIG.Item.documentClass.create({ name: "Аудит-вид", type: "species" }, { pustBuilder: true, renderSheet: false });
    try {
      await item.sheet.render({ force: true }); await sleep(900);
      const check = async (label) => {
        await layoutAt(a, item.sheet, `конструктор виду: ${label}`);
        const el = item.sheet.element;
        a.scenario = `конструктор виду: ${label}`;
        a.onScreen([el]);
        a.noRawKeys(el);
        a.noCut(el, "button, label, h3, summary, span:not(.pust-bld-num), b, small");
        a.counters(el);
        a.readable(el);
        for (const row of el.querySelectorAll(".pust-bld-attr:not(.pust-bld-head)")) a.row([...row.querySelectorAll(".pust-bld-num")], { label: "лічильники рядка атрибута" });
        const attrs = [...el.querySelectorAll(".pust-bld-attr:not(.pust-bld-head)")];
        for (const col of [1, 2, 3]) a.ok(`стовпець ${col} атрибутів вирівняно`, attrs.every((r) => Math.abs(R(r.children[col]).left - R(attrs[0].children[col]).left) <= 1.01), "");
      };
      await check("як створено");
      // a base with other limits, props added: the sheet re-renders and still fits
      await item.update({ "system.custom": { ...item.system.custom, base: "robot", hp: 3, armor: 1, def: { rad: "immune", poison: "half", psy: "normal" }, props: [...item.system.custom.props, "Довга властивість: дуже довгий текст, який має переноситися на кілька рядків і не вилазити за межі вікна конструктора."] } });
      await sleep(700);
      await check("змінено");
    } finally {
      await item.sheet.close();
      await item.delete();
    }
  },

  /** «Конструктор наркотика»: a temporary world drug item with a few effects and side effects (a broken one too), then deleted */
  async drugBuilder(a) {
    if (!game.user.isGM) return a.skip("конструктор наркотика", "лише Доглядач створює предмети");
    const item = await CONFIG.Item.documentClass.create({ name: "Аудит-наркотик", type: "drug" }, { pustBuilder: true, renderSheet: false });
    try {
      await item.sheet.render({ force: true }); await sleep(900);
      const check = async (label) => {
        await layoutAt(a, item.sheet, `конструктор наркотика: ${label}`);
        const el = item.sheet.element;
        a.scenario = `конструктор наркотика: ${label}`;
        a.onScreen([el]);
        a.noRawKeys(el);
        a.noCut(el, "button, label, h3, summary, span:not(.pust-bld-num), b, small, .pust-bld-sum, .pust-bld-err, .pust-bld-warn");
        a.counters(el);
        a.readable(el);
        a.ok("екран із ціною й шансом є", !!el.querySelector(".pust-bld-sum b"), "");
      };
      await check("порожній рецепт");
      await item.update({ "system.recipe": { name: item.name, note: "", effects: [{ k: "attr", attr: "SL" }, { k: "perkC", perk: "", price: 4, ch: 3 }, { k: "dmg" }], sides: [{ k: "attrScene", attr: "PV" }, { k: "loss1" }] } });
      await sleep(700);
      await check("рецепт із ефектами (є помилка: перк не обрано)");
      await item.update({ "system.recipe": { name: item.name, note: "", effects: [{ k: "armor" }, { k: "psi" }], sides: [{ k: "berserk" }] } });
      await sleep(700);
      await check("правильний рецепт");
    } finally {
      await item.sheet.close();
      await item.delete();
    }
  },

  /** A place card (if the world has a place) */
  async place(a) {
    const actor = game.actors.find((x) => x.type === "place" && x.visible);
    if (!actor) return a.skip("картка місця", "у світі немає місць");
    const was = actor.sheet.rendered;
    await actor.sheet.render({ force: true }); await sleep(900);
    const el = actor.sheet.element;
    a.onScreen([el]);
    for (const b of el.querySelectorAll(".pust-place-hd > button.pust-place-vis")) a.size(b, 132, null, `перемикач «${b.innerText.trim()}»`);
    a.row([...el.querySelectorAll(".pust-place-hd > button.pust-place-vis")], { equalWidth: true, label: "перемикачі місця" });
    a.noCut(el);
    a.noRawKeys(el);
    a.readable(el);
    if (!was) await actor.sheet.close();
  },

  /** Every window at its narrowest width and at its usual one, on every tab (author, 2026-11-15): nothing runs out of its
   *  block, nothing overlaps, no button on a border or a line, no text cut. Sheets of the world's first character, caravan,
   *  enemy (also in edit mode) and place, and the GM terminal; each window is put back where it was. */
  async minWidth(a) {
    const run = async (app, label, { tabs = "nav [data-tab]", edit = null } = {}) => {
      const was = app.rendered;
      if (!was) { await app.render({ force: true }); await sleep(1100); }
      const pos = { ...app.position };
      try {
        for (const w of [100, app.options?.position?.width ?? 900]) { // 100: the window's CSS minimum takes over
          app.setPosition({ width: w }); await sleep(350);
          const wReal = Math.round(R(app.element).width);
          const keys = [...app.element.querySelectorAll(tabs)].filter(shown).map((n) => n.dataset.tab);
          for (const k of keys.length ? keys : [null]) {
            if (k) { [...app.element.querySelectorAll(tabs)].find((n) => n.dataset.tab === k)?.click(); await sleep(350); }
            a.scenario = `${label}, ${wReal} px${k ? `, вкладка ${k}` : ""}`;
            a.layout(app.element);
          }
          if (keys.length) { app.element.querySelector(tabs)?.click(); await sleep(250); }
          const b = edit && app.element.querySelector(edit);
          if (b) {
            b.click(); await sleep(900);
            a.scenario = `${label}, ${wReal} px, редагування`;
            a.layout(app.element);
            app.element.querySelector(edit)?.click(); await sleep(600);
          }
        }
      } finally {
        app.setPosition({ width: pos.width, height: pos.height, left: pos.left, top: pos.top });
        if (!was) await app.close();
      }
    };
    for (const [type, label, opts] of [["character", "аркуш персонажа", {}], ["caravan", "аркуш каравану", {}], ["enemy", "картка ворога", { edit: '[data-action="editToggle"]' }], ["place", "картка місця", {}]]) {
      const actor = auditActor(type) ?? game.actors.find((x) => x.type === type && x.visible);
      if (!actor) { a.scenario = label; a.skip("найвужча ширина", "немає актора"); continue; }
      await run(actor.sheet, `${label} «${actor.name}»`, opts);
    }
    if (game.user.isGM) {
      const T = await import(`/systems/${game.system.id}/module/applications/terminal.mjs`);
      const open = !!foundry.applications.instances.get("pust-terminal")?.rendered;
      if (!open) { T.openTerminal(); await sleep(1300); }
      const app = foundry.applications.instances.get("pust-terminal");
      if (app) { await run(app, "термінал", { tabs: '[data-action="termTab"]' }); if (!open) await app.close(); }
    }
  },

  /**
   * The compact sheets (author, 2026-11-17 / 2026-11-18): the character's (with «Перки та особливості») and the caravan's
   * (mockup Б1) at 460 px, their narrowest and usual width; the user's choice of full / compact is put back after
   */
  async compactSheets(a) {
    for (const [type, label] of [["character", "компактний аркуш персонажа"], ["caravan", "компактний аркуш каравану"]]) {
      const actor = game.actors.find((x) => x.type === type && x.isOwner) ?? game.actors.find((x) => x.type === type && x.visible);
      if (!actor) { a.scenario = label; a.skip("компактний аркуш", "немає актора"); continue; }
      const app = actor.sheet, was = app.rendered, wasCompact = app.ui.compact;
      const pos = { ...app.position };
      try {
        app.ui.compact = true;
        await app.render({ force: true }); await sleep(1100);
        for (const w of [100, 460]) {
          app.setPosition({ width: w }); await sleep(350);
          a.scenario = `${label} «${actor.name}», ${Math.round(R(app.element).width)} px`;
          a.ok("ширина компакту 460 px", Math.abs(R(app.element).width - 460) <= 1, `${Math.round(R(app.element).width)} px`);
          a.layout(app.element);
        }
      } finally {
        app.ui.compact = wasCompact;
        if (was) { await app.render(); app.setPosition({ width: pos.width, height: pos.height, left: pos.left, top: pos.top }); } else await app.close();
      }
    }
  },

  /**
   * The tours (author, 2026-11-16): every tour this user may take is walked step by step: a step that names an element finds
   * it on screen after its preparation (else the step falls back to the middle — reported), and the step card stays wholly
   * on screen with no text cut. The tour is left and its windows closed at the end.
   */
  /** the same walk with the tours' examples (copies from «Швидкий старт» in memory) instead of the world's actors */
  async toursDemo(a) {
    const T = await import(`/systems/${game.system.id}/module/tours/pust-tour.mjs`);
    const before = game.actors.size;
    T.setForceDemo(true);
    try { await SCENARIOS.tours(a); } finally { T.setForceDemo(false); }
    a.ok("приклади не додають акторів у світ", game.actors.size === before, `${before} → ${game.actors.size}`);
    const left = [...foundry.applications.instances.values()].filter((app) => app.rendered && app.document?.documentName === "Actor" && !app.document.id);
    a.ok("вікна прикладів закриті після туру", !left.length, left.map((x) => x.title).join(", "));
  },

  /**
   * The tours forward and back (author, 2026-11-16: «приклади зникали коли треба і повертались коли треба (по кнопці назад)»):
   * on every step the windows it needs are open and no other window the tour opened is; the travel window, the counter
   * form and the example counters only on their own steps. `globalThis.pustAuditTours` limits it to some tours.
   */
  async toursBack(a) {
    const P = await import(`/systems/${game.system.id}/module/tours/pust-tour.mjs?${Date.now()}`);
    const { TOURS } = await import(`/systems/${game.system.id}/module/tours/tour-data.mjs?${Date.now()}`);
    const only = Array.isArray(globalThis.pustAuditTours) && globalThis.pustAuditTours.length ? globalThis.pustAuditTours : null;
    const kindOf = (app) => (app.id === "pust-terminal" ? "terminal" : ["pust-check-demo", "pust-check-dock"].includes(app.id) ? null : app.element?.classList?.contains("pust-check") ? "check" : app.document?.documentName === "Actor" ? app.document.type : null);
    const openKinds = () => new Set([...foundry.applications.instances.values()].filter((x) => x.rendered).map(kindOf).filter(Boolean));
    const transient = () => ({
      travel: !document.querySelector("#pust-mapdock .pust-md-tv")?.hidden && !!document.querySelector("#pust-mapdock .pust-md-tv"),
      counterForm: !!document.querySelector("#pust-mapdock .pust-gc-form"),
      noteDemo: !!document.querySelector(".pust-mn-edit:not(.pust-bz-edit)"), // the zone editor shares the class
      counterDemo: [...document.querySelectorAll("#pust-mapdock :is(input, textarea)")].some((i) => /^Приклад:/.test(i.value)) // the GM's names live in fields
        || /Приклад:/.test(document.querySelector("#pust-mapdock .pust-md-ctr:not(.pust-md-ctr-gm)")?.textContent ?? ""), // the players' panel shows text
      moveDemo: !!document.querySelector(".pust-cmove-demo"),
      zoneDemo: !!document.querySelector(".pust-bz-edit"),
      enemyForm: !!document.querySelector(".pust-md-battle .pust-md-bform"),
      targetDemo: !!document.querySelector(".pust-tgt-demo"),
      enemyCreate: !!document.getElementById("pust-enemy-create"),
      cargoDemo: !!document.querySelector(".pust-demo-cargo"),
      gearDemo: !!document.querySelector(".pust-demo-gear"),
      checkDemo: !!document.getElementById("pust-check-demo"),
      dockCheck: !!document.getElementById("pust-check-dock"),
      tokenDemo: !!document.querySelector(".pust-tok-demo:not(.pust-car-frame)"),
      caravanToken: !!document.querySelector(".pust-car-frame"),
      issuesDemo: !!document.querySelector(".pust-demo-issues"),
    });
    if (foundry.nue.Tour.tourInProgress) foundry.nue.Tour.activeTour.exit();
    for (const t of TOURS) {
      if (game.user.isGM && !t.gm) continue; // players' tours: walked in a player's run (their panels exist only there)
      if (only && !only.some((o) => o === t.id || o.startsWith(`${t.id}.`))) continue;
      const tour = game.tours.get(`${game.system.id}.${t.id}`);
      if (!tour) continue;
      const n = tour.steps.length;
      const order = [...Array(n).keys(), ...Array.from({ length: n - 1 }, (_, i) => n - 2 - i)]; // forward, then back to the first
      await tour.reset(); await tour.start();
      for (let pos = 0; pos < order.length; pos++) {
        const i = order[pos], step = tour.steps[i], dir = pos < n ? "вперед" : "назад";
        if (pos > 0) { if (dir === "назад") await tour.previous(); else await tour.next(); }
        await sleep(250);
        if (document.hidden) { a.skip(`${t.id}.${step.id} ${dir}`, "сторінка прихована"); continue; }
        const needs = P.needsOf(step), kinds = openKinds(), tr = transient();
        const prep = new Set([step.prepare ?? []].flat().map((p) => String(p).split(":")[0]));
        const missing = [...needs].filter((k) => !kinds.has(k));
        const extra = [...kinds].filter((k) => !needs.has(k));
        // a sheet with something of its own to warn about shows its real block: the example isn't put in then
        const realIssues = [...document.querySelectorAll(".pust-sheet .pust-issues:not(.pust-demo-issues)")].some((x) => x.offsetParent);
        const trBad = Object.entries(tr).filter(([k, on]) => on !== prep.has(k) && !(k === "issuesDemo" && realIssues)).map(([k, on]) => `${k} ${on ? "зайве" : "немає"}`);
        a.ok(`${t.id}.${step.id} (${dir}): потрібне відкрите, зайве закрите`, !missing.length && !extra.length && !trBad.length,
          [missing.length ? `немає: ${missing}` : "", extra.length ? `зайве: ${extra}` : "", trBad.join(", ")].filter(Boolean).join("; "));
      }
      tour.exit(); await tour.reset(); await sleep(300);
    }
  },

  async tours(a) {
    const { TOURS } = await import(`/systems/${game.system.id}/module/tours/tour-data.mjs?${Date.now()}`);
    if (foundry.nue.Tour.tourInProgress) foundry.nue.Tour.activeTour.exit();
    // only what changed (author, 2026-11-16): globalThis.pustAuditTours = ["gm-start.users", "gm-enemy"] limits the walk to those
    // tours / steps; without it every tour is walked (the full run, on the author's command)
    const only = Array.isArray(globalThis.pustAuditTours) && globalThis.pustAuditTours.length ? globalThis.pustAuditTours : null;
    const wantTour = (id) => !only || only.some((o) => o === id || o.startsWith(`${id}.`));
    const wantStep = (id, sid) => !only || only.includes(id) || only.includes(`${id}.${sid}`);
    for (const t of TOURS) {
      if (game.user.isGM && !t.gm) continue; // players' tours: walked in a player's run (their panels exist only there)
      if (!wantTour(t.id)) continue;
      document.body.classList.add("pust-touring"); // as start() does: no pause banner during a tour
      const tour = game.tours.get(`${game.system.id}.${t.id}`);
      if (!tour) { if (!t.gm || game.user.isGM) a.ok(`тур «${t.id}» зареєстровано`, false); continue; }
      const steps = tour.steps;
      for (let i = 0; i < steps.length; i++) {
        const src = steps[i], sel = src.selector;
        if (!wantStep(t.id, src.id)) continue;
        try { await tour.progress(i); } catch (err) { a.ok(`${t.id}.${src.id}: крок показано`, false, String(err).slice(0, 160)); continue; }
        await sleep(200);
        // a hidden page draws no tooltip and runs no animation frames: nothing it shows can be judged
        if (document.hidden) { a.skip(`${t.id}.${src.id}`, "сторінка прихована (вкладка не на виду) — прогнати ще раз"); continue; }
        // in the middle = the element wasn't found; «aside» = found, but the card had no room beside it
        const center = document.querySelector(".tour-center-step.pust-tour:not(.pust-tour-aside)");
        const card = center ?? document.querySelector(".pust-tour-aside") ?? document.querySelector("#tooltip.pust-tour.active, #tooltip.pust-tour");
        if (sel) a.ok(`${t.id}.${src.id}: елемент є на екрані`, !center, center ? `не знайдено ${sel}` : "");
        for (const app of foundry.applications.instances.values()) {
          if (app.rendered && app.document?.documentName === "Actor" && !app.document.id) a.ok(`${t.id}.${src.id}: приклад підписано «(приклад)»`, /\(приклад\)/.test(app.element?.querySelector(".window-title")?.textContent ?? ""), app.element?.querySelector(".window-title")?.textContent ?? "");
        }
        // during a tour every panel is opaque (author, 2026-11-16)
        const seeThrough = [...document.querySelectorAll("#pust-mapdock .pust-md-panel")].filter((p) => p.offsetParent && parseFloat(getComputedStyle(p).opacity) < 1);
        a.ok(`${t.id}.${src.id}: панелі непрозорі`, !seeThrough.length, seeThrough.map((p) => p.className).join("; "));
        if (card) {
          const r = card.getBoundingClientRect();
          a.ok(`${t.id}.${src.id}: картка видима й уся у вікні`, getComputedStyle(card).visibility !== "hidden" && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            `${Math.round(r.left)},${Math.round(r.top)} – ${Math.round(r.right)},${Math.round(r.bottom)} у ${innerWidth}×${innerHeight}`);
          a.noCut(card, "h3, button, span, b");
        } else a.ok(`${t.id}.${src.id}: картка кроку`, false);
        // the highlight (author, 2026-11-16): on the step's own element, at its size (Foundry adds HIGHLIGHT_PADDING, half on
        // each side), and that element is the one seen there — no window or panel over its middle
        if (sel && !center) {
          const parts = [...document.querySelectorAll(sel)].filter((el) => el.getClientRects().length);
          const target = tour.targetElement?.classList?.contains("pust-tour-proxy") ? tour.targetElement : parts[0]; // a `union` step lights a box over all its parts
          const fade = tour.fadeElement, pad = foundry.nue.Tour.HIGHLIGHT_PADDING / 2;
          if (target && fade) {
            const e = target.getBoundingClientRect(), f = fade.getBoundingClientRect();
            const off = Math.max(Math.abs(f.left + pad - e.left), Math.abs(f.top + pad - e.top), Math.abs(f.right - pad - e.right), Math.abs(f.bottom - pad - e.bottom));
            a.ok(`${t.id}.${src.id}: підсвітка на елементі й свого розміру`, off <= 2,
              `підсвітка ${Math.round(f.left + pad)},${Math.round(f.top + pad)} ${Math.round(f.width - 2 * pad)}×${Math.round(f.height - 2 * pad)}, елемент ${Math.round(e.left)},${Math.round(e.top)} ${Math.round(e.width)}×${Math.round(e.height)}`);
            const cx = Math.min(innerWidth - 1, Math.max(0, e.left + e.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, e.top + e.height / 2));
            const tour_ = (n) => n.closest?.(".tour-overlay, .tour-fadeout, #tooltip, .tour-center-step");
            // the card itself never covers its element
            // the element with whatever of it sticks out of its box (a sticker's toolbar sits above the sticker)
            const union = [...target.querySelectorAll("*")].map((x) => x.getBoundingClientRect()).filter((x) => x.width && x.height)
              .reduce((u, x) => ({ left: Math.min(u.left, x.left), top: Math.min(u.top, x.top), right: Math.max(u.right, x.right), bottom: Math.max(u.bottom, x.bottom) }), { left: e.left, top: e.top, right: e.right, bottom: e.bottom });
            const cr = card?.getBoundingClientRect();
            if (cr) a.ok(`${t.id}.${src.id}: картка не закриває елемент`, !(cr.left < union.right - 4 && cr.right > union.left + 4 && cr.top < union.bottom - 4 && cr.bottom > union.top + 4),
              `картка ${Math.round(cr.left)},${Math.round(cr.top)} – ${Math.round(cr.right)},${Math.round(cr.bottom)}`);
            const top = document.elementsFromPoint(cx, cy).find((n) => !tour_(n));
            // the game board lies under all the interface: seen at the middle, it's a see-through gap of the element (a unit of
            // panels with room between them), not something over it
            a.ok(`${t.id}.${src.id}: підсвічений елемент ніщо не закриває`, !!top && (top.id === "board" || [target, ...parts].some((p) => top === p || p.contains(top) || top.contains(p))),
              top ? `зверху ${top.tagName.toLowerCase()}.${String(top.className).split(" ")[0]}` : "нічого");
            a.ok(`${t.id}.${src.id}: підсвітка у вікні`, e.width > 0 && e.height > 0 && e.left >= -1 && e.top >= -1 && e.right <= innerWidth + 1 && e.bottom <= innerHeight + 1,
              `${Math.round(e.left)},${Math.round(e.top)} – ${Math.round(e.right)},${Math.round(e.bottom)}`);
          } else a.ok(`${t.id}.${src.id}: підсвітка є`, !!fade, target ? "" : "елемент зник після показу");
        }
      }
      tour.exit();
      await tour.reset();
      await sleep(300);
    }
  },
};

/** Run the scenarios (all, or the named ones); logs a table and returns { failures, report } */
export async function runAudit(only = null, { extra = {} } = {}) {
  const all = { ...SCENARIOS, ...extra };
  const a = new Audit();
  for (const [key, fn] of Object.entries(all)) {
    if (only && !only.includes(key)) continue;
    a.scenario = key;
    try { await fn(a); } catch (err) { a.ok("сценарій без помилок", false, String(err?.stack || err).slice(0, 300)); }
  }
  const failures = a.results.filter((r) => !r.ok);
  console.table(a.results.map((r) => ({ "": r.ok ? (r.skipped ? "–" : "✓") : "✗", сценарій: r.scenario, правило: r.rule, деталі: r.detail })));
  return { failures: failures.length, report: a.results };
}

/** For scenarios added by other modules of the audit (battle map, enemy sheet) */
export { Audit, SCENARIOS, R, shown, sleep };
