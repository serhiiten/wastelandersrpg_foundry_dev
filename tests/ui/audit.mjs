/**
 * Visual test of design and placement (author, 2026-11-14): runs INSIDE a live Foundry page (it measures the real
 * layout), never changes world data — it only opens and closes sheets and reads the DOM.
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
 *   – text is readable: contrast at least 3:1 against the nearest opaque background; nothing under 10 px.
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
    const floor = abovePlayers ? Math.min(innerHeight, R(document.querySelector("#players") ?? document.body).top || innerHeight) : innerHeight;
    for (const el of els) {
      if (!shown(el)) continue;
      const r = R(el);
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
}

/* ---------- scenarios ---------- */
const SCENARIOS = {
  /** The left panels of the map */
  async dock(a) {
    const dock = document.querySelector("#pust-mapdock");
    if (!dock) return a.skip("панелі", "немає #pust-mapdock");
    const map = dock.querySelector('[data-unit="map"]'), dice = dock.querySelector('[data-unit="dice"]');
    a.onScreen([...dock.querySelectorAll(".pust-md-unit, .pust-md-panel, .pust-md-travel")], { abovePlayers: true });
    a.noCut(dock);
    a.noRawKeys(dock);
    if (map && !map.classList.contains("folded")) {
      a.column([...map.querySelectorAll(":scope > .pust-md-panel")], { gap: 6, label: "панелі «Мапа Пустки»" });
      const btns = [...map.querySelectorAll(".pust-md-map [data-mapdock]")];
      if (btns.length) a.row(btns, { equalWidth: true, label: "кнопки «Мапи Пустки» в один ряд" });
    }
    if (map && dice && !map.classList.contains("folded") && !dice.classList.contains("folded")) {
      const pos = JSON.parse(localStorage.getItem("pustelnyky-mapdock-pos") || "{}");
      if (!pos.dice) a.ok("«Кістки» під «Мапою Пустки» з відступом 8 px", Math.abs(R(dice).top - R(map).bottom - 8) <= 1.5, `${Math.round(R(dice).top - R(map).bottom)} px`);
    }
    for (const u of dock.querySelectorAll(".pust-md-unit.folded > .pust-md-panel:not([hidden]), .pust-md-unit.folded .pust-md-dice")) if (!u.matches(".pust-md-ctr")) a.size(u, 168, 30, `згорнута «${u.querySelector("header span")?.innerText}»`);
    // «Битва» on the battle map: its rows line up, its two buttons are equal
    const battle = dock.querySelector(".pust-md-battle:not([hidden])");
    if (battle && !map.classList.contains("folded")) {
      a.column([...battle.querySelectorAll(".pust-md-bscene")], { label: "місце / небезпека" });
      for (const r of battle.querySelectorAll(".pust-md-bscene")) a.row([...r.querySelectorAll(".pust-md-bval, .pust-md-bdie")], { label: "рядок місця" });
      a.row([...battle.querySelectorAll(".pust-md-bbtns > button")], { equalWidth: true, label: "«Зона» / «Супротивник»" });
      a.oneLine([...battle.querySelectorAll(".pust-md-blabel")], "підписи рядків «Битви» в один рядок");
      a.column([...battle.querySelectorAll(".pust-md-blabel")], { label: "колонка підписів «Битви»", sameRight: true, gap: false });
      for (const r of battle.querySelectorAll(".pust-md-bround")) a.row([...r.querySelectorAll(":scope > button, :scope > .pust-md-bnum, :scope > .pust-md-n")], { label: "рядок кола / Долі" });
      a.row([...battle.querySelectorAll(".pust-md-bquick > button")], { equalWidth: true, label: "швидкі кістки" });
      a.row([...battle.querySelectorAll(".pust-md-bact > button")], { equalWidth: true, label: "«Завдати шкоди» / «Лікувати»" });
      a.readable(battle);
    }
    const ctr = dock.querySelector(".pust-md-ctr");
    if (ctr && shown(ctr) && !ctr.matches(":hover")) {
      const empty = ctr.classList.contains("pust-md-empty");
      a.ok(`«Лічильники» ${empty ? "порожні напівпрозорі" : "непрозорі"}`, empty ? parseFloat(getComputedStyle(ctr).opacity) < 0.6 : getComputedStyle(ctr).opacity === "1", getComputedStyle(ctr).opacity);
    }
    a.counters(dock);
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
      const actor = game.actors.find((x) => x.type === type);
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
    const actor = tok?.actor ?? game.actors.find((x) => x.type === "enemy");
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
    };
    check("перегляд");
    sheet.element.querySelectorAll("details[data-fold]").forEach((d) => { d.open = true; });
    await sleep(300);
    check("усе розгорнуто");
    const edit = sheet.element.querySelector('[data-action="editToggle"]');
    if (edit) { edit.click(); await sleep(900); check("редагування"); sheet.element.querySelector('[data-action="editToggle"]')?.click(); await sleep(600); }
    if (!was) await sheet.close();
  },

  /** A place card (if the world has a place) */
  async place(a) {
    const actor = game.actors.find((x) => x.type === "place");
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
