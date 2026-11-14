/**
 * The «Мапа Пустки» and «Кістки» panels (author, 2026-11-14), mirroring the HTML terminal's map bar and dice float:
 *  - each panel is dragged by its header and remembered in this browser (localStorage); a double-click on the header puts it
 *    back in its place (right under Foundry's layer buttons, «Кістки» under «Мапа Пустки»);
 *  - the header's button folds a panel to a small button (its icon and name), a click on it opens the panel again;
 *  - half-transparent until the pointer is over a panel;
 *  - over «Мапа Пустки» (GM): an opaque «Подорож» button with the travel generator in a window that opens under it,
 *    over the panels (they don't move)
 *    (the terminal's generator; Удача партії from the selected caravan token, as in the terminal);
 *  - GM-only buttons are left out for players; «Кістки» are for everyone.
 */
import { addPlace } from "./map-tools.mjs";
import { fateInfo, luckCaravan, rollDice, rollFate } from "./map-dice.mjs";
import { openGameCounters } from "./game-counters.mjs";
import * as G from "../rules/game-counters.mjs";
import { postChat } from "./chat.mjs";
import { postTerminalRoll } from "./check-panel.mjs";
import { battleFromTravel } from "./terminal.mjs";
import { createTerminal } from "../rules/terminal.mjs";
import { LUCKS, prettyTravel, travelChat } from "./terminal-view.mjs";

const DOCK = "pust-mapdock";
const POS_KEY = "pustelnyky-mapdock-pos";   // { map: {x, y}, dice: {x, y} } in window pixels; absent = the default place
const FOLD_KEY = "pustelnyky-mapdock-fold"; // { map: bool, dice: bool }
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const load = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (_) { return {}; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* no storage: not remembered */ } };

/* ---------------- «Мапа Пустки» ---------------- */
const btn = (act, icon, label, title) =>
  `<button type="button" data-mapdock="${act}" title="${title}"><i class="fa-solid ${icon}"></i><span>${label}</span></button>`;

function mapButtons() {
  const gm = game.user.isGM;
  const canNote = gm || game.user.can("DRAWING_CREATE");
  const row1 = gm ? [
    btn("town", "fa-house-flag", "Поселення", "Додати поселення: зелений токен на вільній клітинці посередині огляду"),
    btn("danger", "fa-skull-crossbones", "Небезпека", "Додати небезпечне місце: червоний токен"),
    btn("poi", "fa-star", "Точка інтересу", "Додати точку інтересу: оранжевий токен"),
  ] : [];
  const row2 = [
    ...(canNote ? [btn("note", "fa-note-sticky", "Примітка", "Додати стікер на мапу й одразу писати на ньому (спершу схований від гравців)")] : []),
    ...(gm ? [btn("counters", "fa-hourglass-half", "Лічильники", "Лічильники гри й сцени: загрози й плани кампанії")] : []),
  ];
  return [row1, row2].filter((r) => r.length).map((r) => `<div class="pust-md-row">${r.join("")}</div>`).join("");
}

async function onMap(ev) {
  const b = ev.target.closest("[data-mapdock]");
  if (!b) return;
  const k = b.dataset.mapdock;
  if (k === "town" || k === "danger" || k === "poi") return addPlace(k);
  if (k === "counters") return openGameCounters();
  if (k === "note") {
    // the stickers live in module/canvas/map-notes.mjs (loaded lazily, so the panel works before they are there)
    const m = await import("../canvas/map-notes.mjs").catch(() => null);
    if (m?.addMapNote) return m.addMapNote();
    return ui.notifications.warn("Стікери ще не готові.");
  }
}

/* ---------------- players: the counters, read-only, always in sight (author, 2026-11-14) ---------------- */
function countersHtml() {
  const sys = game.system.id;
  const glob = G.normalizeList(game.settings.get(sys, "gameCounters"));
  const loc = G.normalizeLocalList(canvas?.scene?.getFlag(sys, "sceneCounters") || []);
  if (!glob.length && !loc.length) return "";
  const lamps = (n, v) => `<span class="pust-md-lamps">${Array.from({ length: n }, (_, k) => `<i class="${k < v ? "on" : ""}"></i>`).join("")}</span>`;
  const g = glob.map((c) => {
    const cur = G.currentLabel(c);
    return `<div class="pust-md-gc" style="--h:${G.ctHue(c.val, c.size)}"><div class="pust-md-gc-hd"><span>${esc(c.name)}</span><b>${c.val}<small>/${c.size}</small></b></div>${lamps(c.size, c.val)}${cur ? `<div class="pust-md-gc-cur">${esc(cur)}</div>` : ""}</div>`;
  }).join("");
  const l = loc.map((c) => {
    const st = G.localState(c);
    return `<div class="pust-md-lc ${st}" style="--h:${G.ctHue(c.val, c.die)}"><span class="pust-md-lc-die">${G.dieSvg(c.die, c.val, `dock${c.id}`)}</span><span class="pust-md-lc-name">${esc(c.name)}</span>${st ? `<small class="pust-md-lc-st">${st === "lost" ? "Загроза настала!" : "Проблему розв'язано"}</small>` : ""}</div>`;
  }).join("");
  return `<header><i class="fa-solid fa-hourglass-half"></i><span>Лічильники</span></header><div class="pust-md-body">${g ? `<div class="pust-md-csec">Гра</div>${g}` : ""}${l ? `<div class="pust-md-csec">Сцена</div>${l}` : ""}</div>`;
}

/** Players: redraw the counters panel (shown only while there are counters) */
function redrawCounters() {
  const box = document.querySelector(`#${DOCK} .pust-md-ctr`);
  if (!box) return;
  const html = countersHtml();
  box.hidden = !html;
  box.innerHTML = html;
}

/* ---------------- «Кістки» ---------------- */
const dice = { count: 1, sides: 20, last: null };

function diceHtml() {
  const f = fateInfo();
  const last = dice.last
    ? `${dice.last.rolls.length > 1 ? `<small>${dice.last.rolls.join(" + ")} =</small> ` : ""}<b>${dice.last.total}</b><small class="pust-md-what">${esc(dice.last.what)}</small>`
    : `<small>Результат — тут і в чаті</small>`;
  return `<div class="pust-md-row">
      <select data-mapdice="count" aria-label="Скільки кісток">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === dice.count ? "selected" : ""}>${n}×</option>`).join("")}</select>
      <button type="button" data-mapdice="6" title="Кинути d6">d6</button><button type="button" data-mapdice="8" title="Кинути d8">d8</button><button type="button" data-mapdice="10" title="Кинути d10">d10</button>
      <span class="pust-md-n">d<input type="number" min="2" max="1000" value="${dice.sides}" data-mapdice="sides" aria-label="Кількість граней"><button type="button" data-mapdice="n" title="Кинути кістку з указаною кількістю граней"><i class="fa-solid fa-dice"></i></button></span>
    </div>
    <div class="pust-md-row">
      <output class="pust-md-out" aria-live="polite">${last}</output>
      <button type="button" class="pust-md-fate" data-mapdice="fate" title="${f ? `Кістка Долі: 1d10 + Удача партії каравану «${esc(f.name)}» (${f.luck})` : "Кістка Долі каравану: обери на мапі токен каравану"}"><i class="fa-solid fa-clover"></i><span>Доля${f ? ` ${f.luck}` : ""}</span></button>
    </div>`;
}

function redrawDice() {
  const box = document.querySelector(`#${DOCK} [data-unit="dice"] .pust-md-body`);
  if (box) box.innerHTML = diceHtml();
}

async function onDice(ev) {
  const b = ev.target.closest("[data-mapdice]");
  if (!b || b.tagName === "SELECT" || b.tagName === "INPUT") return;
  const k = b.dataset.mapdice;
  const field = document.querySelector(`#${DOCK} [data-mapdice="sides"]`);
  if (field) dice.sides = Math.max(2, Math.min(1000, parseInt(field.value, 10) || 20));
  const r = k === "fate" ? await rollFate() : await rollDice(dice.count, k === "n" ? dice.sides : +k);
  if (r) { dice.last = r; redrawDice(); }
}

/* ---------------- «Подорож» (GM): the travel generator beside «Мапа Пустки» ---------------- */
let T = null;
const tv = { open: false, type: "travel", luck: 0, luckFrom: "", main: "", additional: "" };

function travelLuck() {
  const car = luckCaravan();
  if (!car) { tv.luckFrom = ""; return null; }
  const l = parseInt(car.system.luck, 10) || 0;
  const v = Math.max(-2, Math.min(2, l));
  const from = `${car.id}:${l}`;
  if (tv.luckFrom !== from) { tv.luck = v; tv.luckFrom = from; } // a hand-picked luck stays until the caravan changes
  return { name: car.name, luck: l > 0 ? `+${l}` : l < 0 ? `−${-l}` : "0", clipped: v !== l };
}

function travelHtml() {
  const car = travelLuck();
  const seg = (items) => `<span class="pust-md-seg">${items}</span>`;
  const types = seg([["travel", "Подорож"], ["badEncounter", "Погана зустріч"]]
    .map(([v, n]) => `<button type="button" class="${tv.type === v ? "on" : ""}" data-tv="type" data-v="${v}">${n}</button>`).join(""));
  const off = tv.type === "badEncounter";
  const lucks = seg(LUCKS.map((n) => `<button type="button" class="${n === Number(tv.luck) ? "on" : ""}" data-tv="luck" data-v="${n}" ${off ? "disabled" : ""}>${n > 0 ? `+${n}` : n}</button>`).join(""));
  const html = prettyTravel((tv.main || "") + (tv.additional || ""));
  return `<header><i class="fa-solid fa-route"></i><span>Подорож Пусткою</span><button type="button" class="pust-md-x" data-tv="close" title="Закрити"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="pust-md-body">
      <div class="pust-md-tvgrid"><span>Тип події</span>${types}<span>Удача партії</span>${lucks}</div>
      <small class="pust-md-luckcar"><i class="fa-solid fa-truck"></i> ${car ? `з каравану «${esc(car.name)}»: ${car.luck}${car.clipped ? " (тут від −2 до +2)" : ""}` : "обери на мапі токен каравану — Удача візьметься з нього"}</small>
      <div class="pust-md-row"><button type="button" class="pust-md-go" data-tv="gen"><i class="fa-solid fa-dice"></i><span>Згенерувати подію</span></button>
        <button type="button" data-tv="chat" ${html ? "" : "disabled"} title="Надіслати подію в чат"><i class="fa-solid fa-comment"></i><span>В чат</span></button></div>
      ${html ? `<div class="pust-md-tvout pust-travel-html">${html}</div>` : ""}
    </div>`;
}

function redrawTravel() {
  const box = document.querySelector(`#${DOCK} .pust-md-tv`);
  if (!box) return;
  box.hidden = !tv.open;
  document.querySelector(`#${DOCK} [data-mapdock="travel"]`)?.classList.toggle("on", tv.open);
  if (tv.open) {
    box.innerHTML = travelHtml();
    travelBattleButtons(box);
  }
  sideTravel();
}

/** Under each battle of the event, as in the terminal: «Інші види» (a random battle) and «Створити битву» → the terminal's «Битви» */
function travelBattleButtons(box) {
  box.querySelectorAll(".pust-md-tvout .battle-encounter").forEach((sec, i) => {
    const span = sec.querySelector(".tvb");
    if (!span) return;
    const rnd = span.classList.contains("tvb-rnd");
    const btns = document.createElement("div");
    btns.className = "pust-tvb-actions";
    btns.innerHTML = (rnd ? `<button type="button" data-tv="kinds" data-i="${i}" title="Перекинути випадкову битву: інші види супротивників"><i class="fa-solid fa-rotate"></i><span>Інші види</span></button>` : "")
      + `<button type="button" class="pust-md-go" data-tv="battle" data-i="${i}" title="Відкрити Термінал Доглядача з цією битвою на вкладці «Битви»"><i class="fa-solid fa-skull"></i><span>Створити битву</span></button>`
      + `<small>${rnd ? "Склад супротивників кинеться за правилами генератора битв." : "Кількість супротивників кинеться за описом битви."} Місце піде у вкладку «Битви».</small>`;
    sec.append(btns);
  });
}

/** «Інші види»: the random battle of the i-th battle section gets other kinds of enemies (the terminal's #travelKinds) */
function travelKinds(i) {
  T ??= createTerminal({ toast: (m) => ui.notifications.info(m) });
  const div = document.createElement("div");
  div.innerHTML = tv.additional || "";
  const span = div.querySelectorAll(".battle-encounter")[i]?.querySelector(".tvb-rnd");
  if (!span) return;
  const ks = T.travel.kindsRoll((span.dataset.kinds || "").split(",").filter(Boolean));
  span.dataset.kinds = ks.join(",");
  span.innerHTML = T.travel.randomText(ks);
  tv.additional = div.innerHTML;
}

/** The travel window opens under its button, over the panels (author, 2026-11-14); «Кістки» in their own place keep to «Мапа Пустки» */
function sideTravel() {
  requestAnimationFrame(() => place("dice"));
}

async function onTravel(ev) {
  const die = ev.target.closest("button.die[data-dice]");
  if (die) return postTerminalRoll(die.dataset.dice);
  const b = ev.target.closest("[data-tv]");
  if (!b) return;
  const k = b.dataset.tv;
  if (k === "close") { tv.open = false; return redrawTravel(); }
  if (k === "type") tv.type = b.dataset.v;
  if (k === "luck") tv.luck = Number(b.dataset.v);
  if (k === "gen") {
    T ??= createTerminal({ toast: (m) => ui.notifications.info(m) });
    Object.assign(tv, T.travel.generate(tv.type, tv.luck));
  }
  if (k === "kinds") travelKinds(+b.dataset.i);
  if (k === "battle") return battleFromTravel({ type: tv.type, luck: tv.luck, main: tv.main, additional: tv.additional }, +b.dataset.i);
  if (k === "chat") {
    const content = travelChat({ travel: tv });
    if (content) await postChat({ content, speaker: ChatMessage.getSpeaker({ alias: "Термінал Доглядача" }) });
    return;
  }
  redrawTravel();
}

/* ---------------- dragging, folding, places ---------------- */
function defaultPlace(unit) {
  const col = document.querySelector("#ui-left-column-1");
  const bar = document.querySelector("#scene-controls");
  const lis = document.querySelectorAll("#scene-controls-layers > li");
  if (!col || !bar || !lis.length) return { x: 16, y: 340 };
  const last = lis[lis.length - 1].getBoundingClientRect();
  const b = bar.getBoundingClientRect();
  const map = { x: b.left, y: last.bottom + 12 };
  if (unit === "map") return map;
  // «Кістки»: under the default place of «Мапа Пустки» (its height as it is now: folded or open), wherever it was dragged
  const m = document.querySelector(`#${DOCK} [data-unit="map"]`);
  return { x: map.x, y: map.y + (m ? m.getBoundingClientRect().height : 140) + 8 };
}

function place(unit) {
  const el = document.querySelector(`#${DOCK} [data-unit="${unit}"]`);
  if (!el) return;
  const pos = load(POS_KEY)[unit] || defaultPlace(unit);
  // kept on screen: at least the header stays reachable
  const w = el.offsetWidth || 340, h = 30;
  const x = Math.max(0, Math.min(window.innerWidth - Math.min(w, 120), pos.x));
  const y = Math.max(0, Math.min(window.innerHeight - h, pos.y));
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}

function placeAll() {
  place("map");
  place("dice");
  sideTravel();
}

function setFold(unit, folded) {
  const f = load(FOLD_KEY);
  f[unit] = folded;
  save(FOLD_KEY, f);
  document.querySelector(`#${DOCK} [data-unit="${unit}"]`)?.classList.toggle("folded", folded);
  if (unit === "map" && folded) { tv.open = false; redrawTravel(); }
  requestAnimationFrame(placeAll); // «Кістки» in their own place follow the height of «Мапа Пустки»
}

/** Drag a panel by its header; a click without moving folds / unfolds it (folded: a click opens it) */
function bindDrag(unitEl) {
  const unit = unitEl.dataset.unit;
  const handle = unitEl.querySelector(".pust-md-map > header, .pust-md-dice > header") || unitEl.querySelector(".pust-md-panel > header");
  if (!handle) return;
  handle.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0 || ev.target.closest("button:not(.pust-md-fold)")) return;
    const r = unitEl.getBoundingClientRect();
    // the press decides fold or drag: once captured, the release's target is the header, not the button
    const start = { x: ev.clientX, y: ev.clientY, left: r.left, top: r.top, moved: false, fold: !!ev.target.closest(".pust-md-fold") };
    handle.setPointerCapture(ev.pointerId);
    const move = (e) => {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!start.moved && Math.hypot(dx, dy) < 4) return;
      start.moved = true;
      unitEl.classList.add("dragging");
      unitEl.style.left = `${Math.round(start.left + dx)}px`;
      unitEl.style.top = `${Math.round(start.top + dy)}px`;
    };
    const up = (e) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      unitEl.classList.remove("dragging");
      if (start.moved) {
        const pos = load(POS_KEY);
        pos[unit] = { x: parseFloat(unitEl.style.left), y: parseFloat(unitEl.style.top) };
        save(POS_KEY, pos);
        place(unit);
        if (unit === "map") { place("dice"); sideTravel(); }
      } else if (e.type === "pointerup") {
        // a click: on the fold button, or anywhere on a folded panel's button
        if (unitEl.classList.contains("folded") || start.fold) setFold(unit, !unitEl.classList.contains("folded"));
      }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
    ev.preventDefault();
  });
  // a double-click on the header: back to its place
  handle.addEventListener("dblclick", (ev) => {
    if (ev.target.closest("button")) return;
    const pos = load(POS_KEY);
    delete pos[unit];
    save(POS_KEY, pos);
    placeAll();
  });
}

const header = (icon, name) => `<header title="Тягни, щоб пересунути; подвійний клік — на місце"><i class="fa-solid ${icon}"></i><span>${name}</span>
  <button type="button" class="pust-md-fold" title="Згорнути до кнопки / розгорнути"><i class="fa-solid fa-chevron-up"></i></button></header>`;

/** Build (once) and place the panels; called whenever the scene controls render */
export function renderMapDock() {
  if (!document.querySelector("#scene-controls")) return;
  let dock = document.getElementById(DOCK);
  if (!dock) {
    const gm = game.user.isGM;
    const fold = load(FOLD_KEY);
    dock = document.createElement("div");
    dock.id = DOCK;
    dock.innerHTML = `
      <div class="pust-md-unit${fold.map ? " folded" : ""}" data-unit="map">
        ${gm ? `<button type="button" class="pust-md-travel" data-mapdock="travel" title="Генератор подорожей поруч із мапою; Удача партії — з обраного каравану"><i class="fa-solid fa-route"></i><span>Подорож</span></button>` : ""}
        ${gm ? `<section class="pust-md-tv" hidden></section>` : ""}
        ${gm ? "" : `<section class="pust-md-panel pust-md-ctr" hidden></section>`}
        ${mapButtons() ? `<section class="pust-md-panel pust-md-map">${header("fa-map-location-dot", "Мапа Пустки")}<div class="pust-md-body">${mapButtons()}</div></section>` : ""}
        ${gm ? `<section class="pust-md-panel pust-md-ctr" hidden title="Відкрити «Лічильники гри»"></section>` : ""}
      </div>
      <div class="pust-md-unit${fold.dice ? " folded" : ""}" data-unit="dice">
        <section class="pust-md-panel pust-md-dice">${header("fa-dice", "Кістки")}<div class="pust-md-body">${diceHtml()}</div></section>
      </div>`;
    document.querySelector("#interface")?.append(dock) ?? document.body.append(dock);
    const mapUnit = dock.querySelector('[data-unit="map"]');
    mapUnit.querySelector(".pust-md-map .pust-md-body")?.addEventListener("click", onMap);
    redrawCounters();
    // the GM's counters panel opens the counters window
    if (gm) mapUnit.querySelector(".pust-md-ctr")?.addEventListener("click", () => openGameCounters());
    mapUnit.querySelector(".pust-md-travel")?.addEventListener("click", () => { tv.open = !tv.open; redrawTravel(); });
    mapUnit.querySelector(".pust-md-tv")?.addEventListener("click", onTravel);
    const d = dock.querySelector('[data-unit="dice"] .pust-md-body');
    d.addEventListener("click", onDice);
    d.addEventListener("change", (ev) => {
      const t = ev.target;
      if (t.dataset.mapdice === "count") dice.count = +t.value || 1;
      if (t.dataset.mapdice === "sides") dice.sides = Math.max(2, Math.min(1000, parseInt(t.value, 10) || 20));
    });
    d.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter" || ev.target.dataset.mapdice !== "sides") return;
      ev.preventDefault();
      dice.sides = Math.max(2, Math.min(1000, parseInt(ev.target.value, 10) || 20));
      rollDice(dice.count, dice.sides).then((r) => { dice.last = r; redrawDice(); });
    });
    dock.querySelectorAll(".pust-md-unit").forEach(bindDrag);
    // «Кістки» in their own place follow every change of the height of «Мапа Пустки» (travel window, folding)
    if (window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(() => place("dice"))).observe(mapUnit);
    window.addEventListener("resize", foundry.utils.debounce(placeAll, 100));
  }
  requestAnimationFrame(placeAll);
}

// the Fate button and the travel luck follow the selected caravan
Hooks.on("controlToken", foundry.utils.debounce(() => { redrawDice(); if (tv.open) redrawTravel(); }, 100));

// players' counters follow the GM's changes: the game's (a world setting) and the viewed scene's (a scene flag)
Hooks.on("updateSetting", (setting) => { if (setting.key === `${game.system.id}.gameCounters`) redrawCounters(); });
Hooks.on("updateScene", (scene) => { if (scene.id === canvas?.scene?.id) redrawCounters(); });
Hooks.on("canvasReady", () => redrawCounters());
