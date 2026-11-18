/**
 * The «Мапа Пустки» and «Кістки» panels (author, 2026-11-14), mirroring the HTML terminal's map bar and dice float:
 *  - each panel is dragged by its header and remembered in this browser (localStorage); a double-click on the header puts it
 *    back in its place: «Мапа Пустки» right under Foundry's layer buttons, «Лічильники» under it, «Кістки» under them; on
 *    the battle map «Битва» goes top right, next to Foundry's sidebar, and «Лічильники», «Кістки» take the left place
 *    (author, 2026-11-14); «Битва» has a remembered place of its own (key "battle");
 *  - the header's button folds a panel to a small button (its icon and name), a click on it opens the panel again;
 *  - half-transparent until the pointer is over a panel;
 *  - over «Мапа Пустки» (GM): an opaque «Подорож» button with the travel generator in a window that opens under it,
 *    over the panels (they don't move)
 *    (the terminal's generator; Удача партії from the selected caravan token, as in the terminal);
 *  - GM-only buttons are left out for players; «Кістки» are for everyone;
 *  - three units (author, 2026-11-14): «Мапа Пустки» / «Битва» (with «Подорож»), «Лічильники», «Кістки» — each dragged,
 *    folded and put back on its own; players get an opaque «Зробити перевірку» over «Лічильники» (in their unit), opening
 *    the check panel right next to that unit (check-panel.mjs
 *    openDockCheck: their Player Character, or a list of the characters they own).
 */
import { overviewSectionHtml, mountOverview, redrawOverview } from "./battle-overview.mjs";
import { travelToScene } from "../helpers/scene-shared.mjs";
import { addPlace } from "./map-tools.mjs";
import { fateActors, fateInfo, fatePickList, luckCaravan, rollDice, rollFate } from "./map-dice.mjs";
import { mountCounters } from "./game-counters.mjs";
import * as G from "../rules/game-counters.mjs";
import { postChat } from "./chat.mjs";
import { postTerminalRoll, toggleDockCheck, placeDockCheck, dockCheckOpen } from "./check-panel.mjs";
import { battleFromTravel, startTravelBattle } from "./terminal.mjs";
import { createTerminal } from "../rules/terminal.mjs";
import { LUCKS, prettyTravel, travelChat } from "./terminal-view.mjs";
import { battleSectionHtml, mountBattlePanel, redrawBattlePanel, travelDamage } from "./battle-panel.mjs";
import { isBattleScene } from "../helpers/default-scene.mjs";
import { evaluate, runAction } from "./character-actions.mjs";
import { compute } from "../rules/core.mjs";
import { fdOf, postFateChange, postSupChange } from "./fate-card.mjs";
import { notify } from "../helpers/notify.mjs";

const DOCK = "pust-mapdock";
const POS_KEY = "pustelnyky-mapdock-pos";   // { map: {x, y}, dice: {x, y} } in window pixels; absent = the default place
const FOLD_KEY = "pustelnyky-mapdock-fold"; // { map: bool, dice: bool }
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
// each user of the browser has places and folds of their own (author, 2026-11-15: the GM's dragged panels moved a player's
// in the same browser); a GM's old shared keys are read until they save anew
const userKey = (k) => `${k}-${game.user?.id ?? ""}`;
const load = (k) => {
  try {
    const own = localStorage.getItem(userKey(k));
    return JSON.parse(own ?? (game.user?.isGM ? localStorage.getItem(k) : null) ?? "{}") || {};
  } catch (_) { return {}; }
};
const save = (k, v) => { try { localStorage.setItem(userKey(k), JSON.stringify(v)); } catch (_) { /* no storage: not remembered */ } };

/* ---------------- «Мапа Пустки» ---------------- */
const btn = (act, icon, label, title) =>
  `<button type="button" data-mapdock="${act}" title="${title}"><i class="fa-solid ${icon}"></i><span>${label}</span></button>`;

/** The GM's «Мапа Пустки». Players have no such panel (author, 2026-11-18; playtest item 18, mockup А): their «Примітка» is a
 *  steel button in the row of «Обрати цілі» (`.pust-md-trow`, NOTE_TIP) */
function mapButtons() {
  if (!game.user.isGM) return "";
  const row1 = [
    btn("town", "fa-house-flag", "Поселення", "Додати поселення: зелений токен на вільній клітинці посередині огляду"),
    btn("danger", "fa-skull-crossbones", "Небезпека", "Додати небезпечне місце: червоний токен"),
    btn("poi", "fa-star", "Точка інтересу", "Додати точку інтересу: оранжевий токен"),
  ];
  const row2 = [btn("note", "fa-note-sticky", "Примітка", "Додати стікер на мапу й одразу писати на ньому (спершу схований від гравців)")];
  return [row1, row2].map((r) => `<div class="pust-md-row">${r.join("")}</div>`).join("");
}
/** Players' «Примітка» (through the GM when Foundry does not let them draw; author, 2026-11-18) */
const NOTE_TIP = "Додати стікер на мапу й одразу писати на ньому: його бачать усі, під ним стоїть твоє ім'я. Подвійний клік по стікеру знову відкриває його, розмір змінюється за правий нижній кут";

async function onMap(ev) {
  const b = ev.target.closest("[data-mapdock]");
  if (!b) return;
  const k = b.dataset.mapdock;
  if (k === "town" || k === "danger" || k === "poi") return addPlace(k);
  if (k === "note") {
    // the stickers live in module/canvas/map-notes.mjs (loaded lazily, so the panel works before they are there)
    const m = await import("../canvas/map-notes.mjs").catch(() => null);
    if (m?.addMapNote) return m.addMapNote();
    return notify.warn("Стікери ще не готові.");
  }
}

/* ---------------- players: the counters, read-only, always in sight (author, 2026-11-14) ---------------- */
/** the tours' example counters (game-counters.mjs setCountersDemo), shown in the players' panel only while the step is on */
let CTR_DEMO = null;
Hooks.on("pustCountersDemo", (demo) => { CTR_DEMO = demo; redrawCounters(); });
function countersHtml() {
  const sys = game.system.id;
  const glob = [...G.normalizeList(game.settings.get(sys, "gameCounters")), ...(CTR_DEMO ? [CTR_DEMO.game] : [])];
  const loc = [...G.normalizeLocalList(canvas?.scene?.getFlag(sys, "sceneCounters") || []), ...(CTR_DEMO ? [CTR_DEMO.scene] : [])];
  if (!glob.length && !loc.length) return "";
  // above 20 segments a solid bar (author, 2026-11-15), as in the GM's panel
  const lamps = (n, v) => (n > G.GC_LAMPS_MAX ? `<span class="pust-md-bar"><i style="width: ${Math.round((v / n) * 1000) / 10}%"></i></span>`
    : `<span class="pust-md-lamps">${Array.from({ length: n }, (_, k) => `<i class="${k < v ? "on" : ""}"></i>`).join("")}</span>`);
  const g = glob.map((c) => {
    const cur = G.currentLabel(c);
    return `<div class="pust-md-gc" style="--h:${G.ctHue(c.val, c.size)}"><div class="pust-md-gc-hd"><span>${esc(c.name)}</span><b>${c.val}<small>/${c.size}</small></b></div>${lamps(c.size, c.val)}${cur ? `<div class="pust-md-gc-cur">${esc(cur)}</div>` : ""}</div>`;
  }).join("");
  const l = loc.map((c) => {
    const st = G.localState(c);
    return `<div class="pust-md-lc ${st}" style="--h:${G.ctHue(c.val, c.die)}"><span class="pust-md-lc-die">${G.dieSvg(c.die, c.val, `dock${c.id}`)}</span><span class="pust-md-lc-name">${esc(c.name)}</span>${st ? `<small class="pust-md-lc-st">${st === "lost" ? "Загроза настала!" : "Проблему розв'язано"}</small>` : ""}</div>`;
  }).join("");
  return `<header title="Тягни, щоб пересунути; подвійний клік — на місце"><i class="fa-solid fa-hourglass-half"></i><span>Лічильники</span>${helpBtn("pl-panels:ctr", "Лічильники")}</header><div class="pust-md-body pust-md-plbody">${g ? `<div class="pust-md-csec">Гра</div>${g}` : ""}${l ? `<div class="pust-md-csec">Сцена</div>${l}` : ""}</div>`;
}

/** Players: redraw the counters panel (shown only while there are counters) */
function redrawCounters() {
  if (game.user.isGM) return; // the GM's panel is the editor in game-counters.mjs
  const box = document.querySelector(`#${DOCK} .pust-md-ctr`);
  if (!box) return;
  const html = countersHtml();
  box.hidden = !html;
  box.innerHTML = html;
  requestAnimationFrame(fitCounters);
}

/* ---------------- «Кістки» ---------------- */
const dice = { count: 1, sides: 20, last: null };

function diceHtml() {
  const f = fateInfo();
  const last = dice.last
    ? `${dice.last.rolls.length > 1 ? `<small>${dice.last.rolls.join(" + ")} =</small> ` : ""}<b>${dice.last.total}</b><small class="pust-md-what">${esc(dice.last.what)}</small>`
    : "";
  return `<div class="pust-md-row">
      <select data-mapdice="count" aria-label="Скільки кісток">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === dice.count ? "selected" : ""}>${n}×</option>`).join("")}</select>
      <button type="button" data-mapdice="6" title="Кинути d6">d6</button><button type="button" data-mapdice="8" title="Кинути d8">d8</button><button type="button" data-mapdice="10" title="Кинути d10">d10</button>
      <span class="pust-md-n">d<input type="number" min="2" max="1000" value="${dice.sides}" data-mapdice="sides" aria-label="Кількість граней"><button type="button" data-mapdice="n" title="Кинути кістку з указаною кількістю граней"><i class="fa-solid fa-dice"></i></button></span>
    </div>
    <div class="pust-md-row">
      <output class="pust-md-out" aria-live="polite">${last}</output>
      <button type="button" class="pust-md-fate" draggable="true" data-mapdice="fate" title="${f ? (f.n > 1 ? `Кістка Долі за кожного ${game.user.isGM ? "вибраного" : "з цілей"}: ${esc(f.name)}` : `Кістка Долі: 1d10 + ${f.what} «${esc(f.name)}» (${f.luck})${f.own ? ". За іншого — познач його токен ціллю" : ""}`) : (game.user.isGM ? "Кістка Долі: обери у списку, за кого кинути (або виділи токени на мапі)" : "Кістка Долі: познач ціллю токен персонажа чи каравану")}"><i class="fa-solid fa-clover"></i><span>Доля${f ? ` ${f.luck}` : ""}</span></button>
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
  // the GM with nothing selected: the list of whom to roll for (author, 2026-11-15)
  if (k === "fate" && game.user.isGM && !fateActors().length) return toggleFatePick(b);
  const r = k === "fate" ? await rollFate() : await rollDice(dice.count, k === "n" ? dice.sides : +k);
  if (r) { dice.last = r; redrawDice(); }
}

/* ---------------- the GM's Кістка Долі list ---------------- */
/**
 * Nothing selected, the GM's «Доля» opens a list under it (author, 2026-11-15): the players' characters (online first) and
 * the caravans, each with its luck and a tick; «Кинути (N)» rolls for the ticked ones, a name rolls for that one alone.
 * The ticks are remembered (FATE_KEY). Closed by ×, Esc, a click elsewhere, a roll, or a scene change.
 */
const FATE_KEY = "pustelnyky-fate-pick";
let fatePick = null; // { el, onDown, onKey }

function closeFatePick() {
  if (!fatePick) return;
  fatePick.el.remove();
  document.removeEventListener("pointerdown", fatePick.onDown, true);
  document.removeEventListener("keydown", fatePick.onKey, true);
  fatePick = null;
}

function fatePickHtml(list, ticked) {
  const row = (x) => `<li class="pust-fp-row"><input type="checkbox" data-fp-tick="${x.id}" ${ticked.has(x.id) ? "checked" : ""} aria-label="Кинути за «${esc(x.name)}»">
      <button type="button" class="pust-fp-name" data-fp-one="${x.id}" title="Кинути лише за «${esc(x.name)}»">${x.kind === "caravan" ? '<i class="fa-solid fa-truck" aria-hidden="true"></i>' : `<i class="fa-solid fa-user" aria-hidden="true"></i><span class="pust-fp-dot${x.online ? " on" : ""}" title="${x.online ? "Гравець у грі" : "Гравець не в грі"}"></span>`}<span>${esc(x.name)}</span>${x.player ? `<small>${esc(x.player)}</small>` : ""}</button>
      <span class="pust-fp-mod" title="${x.what}">${x.mod}</span></li>`;
  const chars = list.filter((x) => x.kind === "character"), cars = list.filter((x) => x.kind === "caravan");
  const n = list.filter((x) => ticked.has(x.id)).length;
  return `<header><i class="fa-solid fa-clover"></i><span>Кістка Долі</span><button type="button" class="pust-fp-x" data-fp-close title="Закрити" aria-label="Закрити"><i class="fa-solid fa-xmark"></i></button></header>
    ${list.length ? `<div class="pust-fp-list">${chars.length ? `<h5>Персонажі гравців</h5><ul>${chars.map(row).join("")}</ul>` : ""}${cars.length ? `<h5>Каравани</h5><ul>${cars.map(row).join("")}</ul>` : ""}</div>
    <footer><button type="button" class="pust-fp-all" data-fp-all>${n === list.length ? "Зняти всі" : "Позначити всіх"}</button>
      <button type="button" class="pust-fp-go" data-fp-go ${n ? "" : "disabled"}><i class="fa-solid fa-clover"></i>Кинути${n ? ` (${n})` : ""}</button></footer>`
    : `<p class="pust-fp-empty">Немає ні персонажів, призначених гравцям, ні караванів. Признач гравцям персонажів у їхніх налаштуваннях або виділи токени на мапі.</p>`}`;
}

function toggleFatePick(btn) {
  if (fatePick) return closeFatePick();
  const el = document.createElement("div");
  el.className = "pust-fatepick";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Кістка Долі: за кого кинути");
  const list = fatePickList();
  const ids = new Set(list.map((x) => x.id));
  const ticked = new Set((load(FATE_KEY).ids ?? []).filter((id) => ids.has(id)));
  const draw = () => { el.innerHTML = fatePickHtml(list, ticked); };
  draw();
  document.body.append(el);
  // under the button, its right edge with the button's; above it when there is no room below
  // the list scrolls inside (many players or caravans); the window never runs off the screen
  const r = btn.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
  // the floor: the screen's edge, or Foundry's players list / hotbar where they lie under it
  let floor = window.innerHeight - 8;
  for (const sel of ["#players", "#hotbar"]) {
    const f = document.querySelector(sel)?.getBoundingClientRect();
    if (f?.height && f.left < left + w && f.right > left) floor = Math.min(floor, f.top - 8);
  }
  const below = floor - (r.bottom + 6), above = r.top - 6 - 8;
  const down = h <= below || below >= above;
  const room = Math.max(120, down ? below : above);
  el.style.maxHeight = `${Math.floor(room)}px`;
  const hh = Math.min(h, room);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(down ? r.bottom + 6 : Math.max(8, r.top - 6 - hh))}px`;
  const remember = () => save(FATE_KEY, { ids: [...ticked] });
  const roll = async (actors) => {
    closeFatePick();
    const res = await rollFate(actors);
    if (res) { dice.last = res; redrawDice(); }
  };
  el.addEventListener("change", (ev) => {
    const id = ev.target.dataset.fpTick;
    if (!id) return;
    if (ev.target.checked) ticked.add(id); else ticked.delete(id);
    remember();
    draw();
  });
  el.addEventListener("click", (ev) => {
    const t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.fpClose !== undefined) return closeFatePick();
    if (t.dataset.fpAll !== undefined) {
      if (ticked.size === list.length) ticked.clear(); else list.forEach((x) => ticked.add(x.id));
      remember();
      return draw();
    }
    if (t.dataset.fpOne) return roll([game.actors.get(t.dataset.fpOne)].filter(Boolean));
    if (t.dataset.fpGo !== undefined) return roll(list.filter((x) => ticked.has(x.id)).map((x) => game.actors.get(x.id)).filter(Boolean));
  });
  const onDown = (ev) => { if (!el.contains(ev.target) && !btn.contains(ev.target)) closeFatePick(); };
  const onKey = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); closeFatePick(); } };
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  fatePick = { el, onDown, onKey };
}
Hooks.on("canvasTearDown", closeFatePick);

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
    // a hazard's damage die says where it goes (author, 2026-11-16)
    box.querySelectorAll(".pust-md-tvout button.die[data-dice]").forEach((b) => { if (travelDamage(b)) { b.title = "Перенести в «Шкода й лікування» панелі"; b.classList.add("pust-die-dmg"); } });
  }
  sideTravel();
}

/** The tours (author, 2026-11-16): the travel window opened with an event in it, or closed */
export function setTravelOpen(on) {
  tv.open = !!on;
  if (on && !tv.main) {
    T ??= createTerminal({ toast: (m) => notify.info(m) });
    Object.assign(tv, T.travel.generate(tv.type, tv.luck));
  }
  redrawTravel();
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
      + `<button type="button" class="pust-md-go pust-tvb-fight" data-tv="fight" data-i="${i}" title="Перейти на бойову мапу, активувати її (гравці теж перейдуть) і розставити супротивників цієї битви по зонах"><i class="fa-solid fa-flag"></i><span>Почати бій</span></button>`
      + `<small>${rnd ? "Склад супротивників кинеться за правилами генератора битв." : "Кількість супротивників кинеться за описом битви."} Місце піде у вкладку «Битви».</small>`;
    sec.append(btns);
  });
}

/** «Інші види»: the random battle of the i-th battle section gets other kinds of enemies (the terminal's #travelKinds) */
function travelKinds(i) {
  T ??= createTerminal({ toast: (m) => notify.info(m) });
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
  if (die) {
    // a hazard's damage («3d6 шкоди») goes into «Сцена» / «Битва», lit there (author, 2026-11-16); other dice roll to chat
    const { travelDamage, fillDamage } = await import("./battle-panel.mjs");
    const dmg = travelDamage(die);
    return dmg ? fillDamage(dmg) : postTerminalRoll(die.dataset.dice);
  }
  const b = ev.target.closest("[data-tv]");
  if (!b) return;
  const k = b.dataset.tv;
  if (k === "close") { tv.open = false; return redrawTravel(); }
  if (k === "type") tv.type = b.dataset.v;
  if (k === "luck") tv.luck = Number(b.dataset.v);
  if (k === "gen") {
    T ??= createTerminal({ toast: (m) => notify.info(m) });
    Object.assign(tv, T.travel.generate(tv.type, tv.luck));
    travelToScene(tv.main, tv.additional); // its place and hazard into «Сцена» / «Битва» (author, 2026-11-16)
  }
  if (k === "kinds") travelKinds(+b.dataset.i);
  if (k === "battle") return battleFromTravel({ type: tv.type, luck: tv.luck, main: tv.main, additional: tv.additional }, +b.dataset.i);
  if (k === "fight") { tv.open = false; redrawTravel(); return startTravelBattle({ type: tv.type, luck: tv.luck, main: tv.main, additional: tv.additional }, +b.dataset.i); }
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
  const left = { x: b.left, y: last.bottom + 12 };
  const el = document.querySelector(`#${DOCK} [data-unit="map"]`);
  const battle = !!el?.classList.contains("is-battle");
  if (unit === "map") {
    if (!battle) return left;
    // «Битва»: top right, next to the sidebar (its tabs when it is folded)
    const side = document.querySelector("#sidebar")?.getBoundingClientRect();
    return { x: (side?.left || window.innerWidth) - 8 - (el?.offsetWidth || 340), y: b.top };
  }
  // «Лічильники»: under the default place of «Мапа Пустки» (its height as it is now: folded or open), wherever it was
  // dragged; on the left by themselves while «Битва» is on the right
  // players have no «Мапа Пустки» panel (an empty unit): their panels start right under the layer buttons
  const mh = el ? el.getBoundingClientRect().height : 140;
  const ctr = battle || !mh ? left : { x: left.x, y: left.y + mh + 8 };
  if (unit === "ctr") return game.user.isGM ? ctr : { x: ctr.x, y: Math.max(ctr.y, targetsFloor()) };
  // the GM's «Битва» off the battle map (author, 2026-11-16): where «Битва» stands on the battle map
  if (unit === "dmg") {
    const side = document.querySelector("#sidebar")?.getBoundingClientRect();
    const d = document.querySelector(`#${DOCK} [data-unit="dmg"]`);
    return { x: (side?.left || window.innerWidth) - 8 - (d?.offsetWidth || 340), y: b.top };
  }
  // players' «Кістки» (author, 2026-11-15): top right, next to Foundry's sidebar (its tabs when folded), on every scene
  if (!game.user.isGM) {
    const side = document.querySelector("#sidebar")?.getBoundingClientRect();
    const d = document.querySelector(`#${DOCK} [data-unit="dice"]`);
    return { x: (side?.left || window.innerWidth) - 8 - (d?.offsetWidth || 340), y: b.top };
  }
  // «Кістки»: under the default place of «Лічильники» (6 px, as when they were one unit); right there when it is empty
  const c = document.querySelector(`#${DOCK} [data-unit="ctr"]`);
  const ch = c ? c.getBoundingClientRect().height : 0;
  const dice = { x: ctr.x, y: ctr.y + (ch > 0 ? ch + 6 : 0) };
  if (unit !== "ovw") return dice;
  // «Огляд битви» (author, 2026-11-17): under «Битва», wherever it stands, 6 px, its left edge with hers
  const m = el?.getBoundingClientRect();
  if (battle && m?.height) return { x: parseFloat(el.style.left) || m.left, y: (parseFloat(el.style.top) || m.top) + m.height + 6 };
  const d = document.querySelector(`#${DOCK} [data-unit="dice"]`);
  return { x: dice.x, y: dice.y + (d ? d.getBoundingClientRect().height + 6 : 0) };
}

/** «Огляд битви» scrolls inside, down to Foundry's players list / hotbar / the screen's edge */
function fitOverview() {
  const unit = document.querySelector(`#${DOCK} [data-unit="ovw"]`);
  const body = unit?.querySelector(".pust-ov");
  if (!body || unit.hidden || unit.classList.contains("folded")) return;
  const u = unit.getBoundingClientRect();
  let floor = window.innerHeight - 8;
  // the chat's message field too: it floats bottom right while the sidebar is folded (author, 2026-11-17: the list ran under it)
  for (const sel of ["#players", "#hotbar", "#chat-message"]) {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (r?.height && r.left < u.right && r.right > u.left) floor = Math.min(floor, r.top - 8);
  }
  const rest = unit.offsetHeight - body.offsetHeight;
  // never taller than the «Битва» panel (author, 2026-11-17)
  const battle = document.querySelector(`#${DOCK} [data-unit="map"] .pust-md-battle:not([hidden])`);
  const cap = battle?.offsetHeight ? battle.offsetHeight - rest : Infinity;
  const mh = `${Math.max(140, Math.floor(Math.min(floor - u.top - rest, cap)))}px`;
  if (body.style.maxHeight !== mh) body.style.maxHeight = mh;
}

/** The remembered place's key: «Битва» has its own (it shares its unit with «Мапа Пустки») */
const posKey = (unit) => (unit === "map" && document.querySelector(`#${DOCK} [data-unit="map"]`)?.classList.contains("is-battle") ? "battle" : unit);

function place(unit) {
  const el = document.querySelector(`#${DOCK} [data-unit="${unit}"]`);
  if (!el) return;
  const pos = load(POS_KEY)[posKey(unit)] || defaultPlace(unit);
  // kept on screen: at least the header stays reachable
  const w = el.offsetWidth || 340, h = 30;
  const x = Math.max(0, Math.min(window.innerWidth - w, pos.x)); // the whole width on screen (a place saved in a wider window)
  const y = Math.max(0, Math.min(window.innerHeight - h, pos.y));
  el.style.left = `${Math.round(x)}px`;
  el.style.top = `${Math.round(y)}px`;
}

/** The counters' list scrolls inside its panel, so «Лічильники» and «Кістки» under them (in their own place) stay above
 *  Foundry's players list (author, 2026-11-14: long game counters must not push «Кістки» off the screen) */
function fitCounters() {
  const ctr = document.querySelector(`#${DOCK} .pust-md-ctr`);
  const unit = ctr?.closest(".pust-md-unit"); // players': inside «Кістки», top right (author, 2026-11-16)
  const body = ctr?.querySelector(":scope > .pust-md-body");
  if (!body || ctr.hidden || body.hidden || unit.classList.contains("folded")) return;
  // Foundry's players list and hotbar, where they are under the panel
  const u = unit.getBoundingClientRect();
  let floor = window.innerHeight - 8;
  // the chat's message field and its pop-up messages too: the players' panel sits top right, over them while the sidebar
  // is folded (stress test, 2026-11-17: many counters ran under the chat, cut, with no scroll)
  for (const sel of ["#players", "#hotbar", "#chat-message", "#chat-notifications"]) {
    const r = document.querySelector(sel)?.getBoundingClientRect();
    if (r?.height && r.top > u.top && r.left < u.right && r.right > u.left) floor = Math.min(floor, r.top - 8);
  }
  const dice = document.querySelector(`#${DOCK} [data-unit="dice"]`);
  // only while «Кістки» follow «Лічильники» (the GM's; players' are top right)
  const diceH = dice && game.user.isGM && !load(POS_KEY).dice ? dice.offsetHeight + 6 : 0;
  const rest = unit.offsetHeight - body.offsetHeight; // the unit without the list
  const room = floor - unit.getBoundingClientRect().top - rest - diceH;
  const mh = `${Math.max(120, Math.floor(room))}px`;
  if (body.style.maxHeight !== mh) body.style.maxHeight = mh;
}

/** The players' check panel keeps under its button */
function sideCheck() {
  const b = document.querySelector(`#${DOCK} .pust-md-check`);
  if (b && dockCheckOpen()) placeDockCheck(b.getBoundingClientRect());
}

/**
 * Players' «Обрати цілі» / «Зняти цілі» (author, 2026-11-15): right of Foundry's left buttons, level with their last row,
 * up to the right edge of «Зробити перевірку» (its default place); battle maps only. Off them the row holds «Примітка»
 * (author, 2026-11-18)
 */
function placeTargets() {
  const row = document.querySelector(`#${DOCK} .pust-md-trow`);
  if (!row || row.hidden) return;
  const bar = document.querySelector("#scene-controls")?.getBoundingClientRect();
  const lis = document.querySelectorAll("#scene-controls-layers > li, #scene-controls-tools > li");
  if (!bar || !lis.length) return;
  const bottom = Math.max(...[...lis].map((li) => li.getBoundingClientRect().bottom).filter((v) => v > 0));
  const unit = document.querySelector(`#${DOCK} [data-unit="ctr"]`);
  const right = defaultPlace("ctr").x + (unit?.offsetWidth || 340);
  const left = bar.right + 8, width = Math.max(120, right - left);
  // under Foundry's scene list where it reaches this far (a player sees the viewed and the active scene there)
  let top = bottom - row.offsetHeight;
  for (const li of document.querySelectorAll("#scene-navigation li")) {
    const r = li.getBoundingClientRect();
    if (r.height && r.right > left && r.left < left + width) top = Math.max(top, r.bottom + 6);
  }
  row.style.left = `${Math.round(left)}px`;
  row.style.width = `${Math.round(width)}px`;
  row.style.top = `${Math.round(top)}px`;
}

/** Players on a battle map: «Зробити перевірку» stays under «Обрати цілі» / «Зняти цілі» when the scene list pushed them down */
function targetsFloor() {
  const row = document.querySelector(`#${DOCK} .pust-md-trow`);
  if (!row || row.hidden || !row.style.top) return 0;
  return parseFloat(row.style.top) + row.offsetHeight + 6;
}

function placeAll() {
  placeTargets();
  place("map");
  place("ctr");
  fitCounters();
  place("dice");
  place("ovw");
  fitOverview();
  place("dmg");
  sideTravel();
  sideCheck();
}

/** Alt+X (helpers/hotkeys.mjs; author, 2026-11-17): «Огляд битви» folded / opened; only on a battle map */
export function toggleOverview() {
  const u = document.querySelector(`#${DOCK} [data-unit="ovw"]`);
  if (!u || u.hidden) return notify.warn("«Огляд битви» є лише на бойовій мапі.");
  setFold("ovw", !u.classList.contains("folded"));
}

/** Open a folded unit (battle-panel.mjs: a travel event's damage put into «Сцена») */
export function unfoldUnit(unit) { setFold(unit, false); }

/** On a battle map «Лічильники» and «Кістки» fold by themselves (author, 2026-11-17): the GM's choice there lasts while the
 *  battle map is viewed and leaves the remembered one (for the other scenes) as it was */
const battleFold = (unit) => game.user.isGM && (unit === "ctr" || unit === "dice")
  && !!document.querySelector(`#${DOCK} [data-unit="map"]`)?.classList.contains("is-battle");

function setFold(unit, folded) {
  if (!battleFold(unit)) {
    const f = load(FOLD_KEY);
    f[unit] = folded;
    save(FOLD_KEY, f);
  }
  document.querySelector(`#${DOCK} [data-unit="${unit}"]`)?.classList.toggle("folded", folded);
  requestAnimationFrame(placeAll); // «Кістки» in their own place follow the height of «Мапа Пустки»
}

/** Drag a panel by its header; a click without moving folds / unfolds it (folded: a click opens it) */
const HANDLE = ":is(.pust-md-map, .pust-md-battle, .pust-md-ctr, .pust-md-dice, .pust-md-ovw) > header";

function bindDrag(unitEl) {
  const unit = unitEl.dataset.unit;
  // the header is found at the press: the players' «Лічильники» draw theirs anew with every change
  unitEl.addEventListener("pointerdown", (ev) => {
    const handle = ev.target.closest(HANDLE);
    if (!handle || !unitEl.contains(handle)) return;
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
      if (unit === "ctr") { sideCheck(); if (!load(POS_KEY).dice) place("dice"); }
    };
    const up = (e) => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      unitEl.classList.remove("dragging");
      if (start.moved) {
        const pos = load(POS_KEY);
        pos[posKey(unit)] = { x: parseFloat(unitEl.style.left), y: parseFloat(unitEl.style.top) };
        save(POS_KEY, pos);
        place(unit);
        placeAll();
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
  unitEl.addEventListener("dblclick", (ev) => {
    if (!ev.target.closest(HANDLE) || ev.target.closest("button")) return;
    const pos = load(POS_KEY);
    delete pos[posKey(unit)];
    save(POS_KEY, pos);
    placeAll();
  });
}

const FOLD_BTN = `<button type="button" class="pust-md-fold" title="Згорнути до кнопки / розгорнути"><i class="fa-solid fa-chevron-up"></i></button>`;
/** «?» in a panel's header (author, 2026-11-17; feedback p3): opens «Довідка Foundry» on the tour page that explains it */
const helpBtn = (help, name) => (help ? `<button type="button" class="pust-md-help" data-help="${help}" title="Довідка: «${name}»" aria-label="Довідка про панель «${name}»"><i class="fa-solid fa-question"></i></button>` : "");
const header = (icon, name, help = "") => `<header title="Тягни, щоб пересунути; подвійний клік — на місце"><i class="fa-solid ${icon}"></i><span>${name}</span>
  ${helpBtn(help, name)}${FOLD_BTN}</header>`;

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
        ${mapButtons() ? `<section class="pust-md-panel pust-md-map">${header("fa-map-location-dot", "Мапа Пустки", gm ? "gm-map:scene" : "pl-panels:note")}<div class="pust-md-body">${mapButtons()}</div></section>` : ""}
        ${gm ? battleSectionHtml((icon, name) => header(icon, name, "gm-battle:scene")) : ""}
      </div>
      <div class="pust-md-unit${fold.ctr ? " folded" : ""}" data-unit="ctr">
        ${gm ? "" : `<div class="pust-md-prow"><button type="button" class="pust-md-check" data-mapdock="check" hidden title="Відкрити перевірку для твого персонажа."><i class="fa-solid fa-dice-d20"></i><span>Зробити перевірку</span></button></div>`}
        ${gm ? `<section class="pust-md-panel pust-md-ctr pust-md-ctr-gm"><header title="Тягни, щоб пересунути; подвійний клік — на місце"><i class="fa-solid fa-hourglass-half"></i><span>Лічильники</span><button type="button" class="pust-md-add" data-gc="newForm" title="Новий лічильник" aria-label="Новий лічильник"><i class="fa-solid fa-plus"></i></button>${helpBtn("gm-map:counters", "Лічильники")}${FOLD_BTN}</header><div class="pust-md-body pust-gc" hidden></div></section>` : ""}
      </div>
      <div class="pust-md-unit${fold.dice ? " folded" : ""}" data-unit="dice">
        <section class="pust-md-panel pust-md-dice">${header("fa-dice", "Кістки", gm ? "gm-map:dice" : "pl-panels:dice")}<div class="pust-md-body">${diceHtml()}</div></section>
        ${gm ? "" : `<div class="pust-md-fdrow" hidden><button type="button" class="pust-md-fdspend" data-mapdock="fd-spend"><i class="fa-solid fa-clover"></i><span>Витратити ЖД</span><b class="pust-md-fdn">0</b></button><button type="button" class="pust-md-fdgain" data-mapdock="fd-gain"><i class="fa-solid fa-plus"></i><span>Отримати ЖД</span></button></div>
        <div class="pust-md-fdrow pust-md-suprow" hidden><button type="button" class="pust-md-fdspend pust-md-supspend" data-mapdock="sup-spend"><i class="fa-solid fa-backpack"></i><span>Витратити Припас</span><b class="pust-md-fdn pust-md-supn">0</b></button><button type="button" class="pust-md-fdgain pust-md-supgain" data-mapdock="sup-gain"><i class="fa-solid fa-plus"></i><span>Отримати Припас</span></button></div>
        <div class="pust-md-fdrow pust-md-carrow" hidden><button type="button" class="pust-md-car" aria-haspopup="true"><i class="fa-solid fa-truck"></i><span>Караван</span></button></div><section class="pust-md-panel pust-md-carpick" hidden></section><section class="pust-md-panel pust-md-ctr pust-md-ctr-pl" hidden></section>`}
      </div>
      ${gm ? `<div class="pust-md-unit${fold.ovw ? " folded" : ""}" data-unit="ovw" hidden>${overviewSectionHtml(header)}</div>` : ""}
      ${gm ? `<div class="pust-md-unit${fold.dmg ? " folded" : ""}" data-unit="dmg"><section class="pust-md-panel pust-md-battle pust-md-blite" hidden>${header("fa-clapperboard", "Сцена", "gm-map:scenepanel")}<div class="pust-md-body"></div></section></div>` : ""}
      ${gm ? "" : `<div class="pust-md-trow" hidden><button type="button" class="pust-md-note" data-mapdock="note" title="${NOTE_TIP}"><i class="fa-solid fa-note-sticky"></i><span>Примітка</span></button><button type="button" class="pust-md-target" data-mapdock="target" aria-pressed="false"><i class="fa-solid fa-crosshairs"></i><span>Обрати цілі</span></button><button type="button" class="pust-md-untarget" data-mapdock="untarget" disabled title="Зняти всі твої цілі (позначаються T над токеном, Shift+T — додати ще)"><span class="pust-untgt-ico" aria-hidden="true"><i class="fa-solid fa-crosshairs"></i><i class="fa-solid fa-xmark"></i></span><span>Зняти цілі</span></button></div>`}`;
    document.querySelector("#interface")?.append(dock) ?? document.body.append(dock);
    dock.addEventListener("click", (ev) => {
      const b = ev.target.closest(".pust-md-help");
      if (!b) return;
      ev.stopPropagation();
      b.blur(); // a focused button keeps the panel opaque
      const [tour, step] = b.dataset.help.split(":");
      import("../tours/tours.mjs").then((m) => m.openHelp(tour, step));
    });
    const mapUnit = dock.querySelector('[data-unit="map"]');
    const ctrUnit = dock.querySelector('[data-unit="ctr"]');
    const diceUnit = dock.querySelector('[data-unit="dice"]');
    mapUnit.querySelector(".pust-md-map .pust-md-body")?.addEventListener("click", onMap);
    dock.querySelector(".pust-md-note")?.addEventListener("click", onMap); // players' «Примітка» in the targets' row
    if (gm) mountBattlePanel(mapUnit.querySelector(".pust-md-battle"));
    // off the battle map the GM's «Битва» is «lite», top right (author, 2026-11-16: damage to the characters on «Мапа Пустки»)
    if (gm) mountBattlePanel(dock.querySelector('[data-unit="dmg"] .pust-md-battle'), { lite: true });
    if (gm) mountOverview(dock.querySelector('[data-unit="ovw"] .pust-md-ovw')); // «Огляд битви» (author, 2026-11-17)
    syncSceneKind();
    // the counters: the GM edits them right in the panel (game-counters.mjs), players read them (redrawCounters)
    if (gm) mountCounters(ctrUnit.querySelector(".pust-md-ctr")).then(() => requestAnimationFrame(placeAll));
    else redrawCounters();
    mapUnit.querySelector(".pust-md-travel")?.addEventListener("click", () => { tv.open = !tv.open; redrawTravel(); });
    // players: «Зняти цілі» (author, 2026-11-15) — damage goes to the targets only
    dock.querySelector(".pust-md-untarget")?.addEventListener("click", () => canvas?.tokens?.setTargets([], { mode: "replace" }));
    // «Обрати цілі» (author, 2026-11-15): Foundry's own targeting tool on / off — a click on a token makes it the target
    dock.querySelector(".pust-md-target")?.addEventListener("click", () => {
      const on = game.activeTool === "target";
      ui.controls?.activate?.({ control: "tokens", tool: on ? "select" : "target" });
      setTimeout(syncTargetTool, 150);
    });
    syncUntarget();
    syncPlayerTargets();
    // players' Fate tokens under «Кістки» (author, 2026-11-15)
    dock.querySelector(".pust-md-fdspend:not(.pust-md-supspend)")?.addEventListener("click", () => stepFd(-1));
    dock.querySelector(".pust-md-fdgain:not(.pust-md-supgain)")?.addEventListener("click", () => stepFd(1));
    dock.querySelector(".pust-md-supspend")?.addEventListener("click", () => stepSup(-1));
    dock.querySelector(".pust-md-supgain")?.addEventListener("click", () => stepSup(1));
    dock.querySelector(".pust-md-car")?.addEventListener("click", onCaravanButton);
    dock.querySelector(".pust-md-carpick")?.addEventListener("click", onCaravanPick);
    syncFdRow();
    const chk = ctrUnit.querySelector(".pust-md-check");
    if (chk) {
      syncCheckButton();
      chk.addEventListener("click", async () => {
        await toggleDockCheck(chk.getBoundingClientRect()); // opens under the button
        chk.classList.toggle("on", dockCheckOpen());
      });
    }
    mapUnit.querySelector(".pust-md-tv")?.addEventListener("click", onTravel);
    const d = dock.querySelector('[data-unit="dice"] .pust-md-body');
    d.addEventListener("click", onDice);
    // «Доля» may be dragged to the hotbar (helpers/macros.mjs; author, 2026-11-17); the body is redrawn, so the drag is caught here
    d.addEventListener("dragstart", (ev) => {
      if (!ev.target.closest?.(".pust-md-fate")) return;
      ev.dataTransfer.setData("text/plain", JSON.stringify({ type: "PustMacro", kind: "fate", label: "Кістка Долі" }));
    });
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
    // «Лічильники» and «Кістки» in their own places follow every change of the height of the panels over them
    if (window.ResizeObserver) {
      new ResizeObserver(() => requestAnimationFrame(placeAll)).observe(mapUnit);
      new ResizeObserver(() => requestAnimationFrame(() => { fitCounters(); place("dice"); place("ovw"); fitOverview(); sideCheck(); })).observe(ctrUnit);
      new ResizeObserver(() => requestAnimationFrame(() => { place("ovw"); fitOverview(); })).observe(dock.querySelector('[data-unit="dice"]'));
    }
    window.addEventListener("resize", foundry.utils.debounce(placeAll, 100));
    // «Битва» keeps to the sidebar while it folds and opens (author, 2026-11-14): the sidebar animates, so its size is
    // watched (every step of the animation and its end), not only the fold event
    const side = document.querySelector("#sidebar");
    if (side && window.ResizeObserver) new ResizeObserver(() => requestAnimationFrame(placeAll)).observe(side);
    side?.addEventListener("transitionend", () => requestAnimationFrame(placeAll));
  }
  requestAnimationFrame(placeAll);
}

/* ---------------- players' Fate tokens (author, 2026-11-15) ---------------- */
/**
 * Under the players' «Кістки», on every scene: «Витратити ЖД» (−1, with the count of the player's Жетони Долі; off and
 * half-transparent at 0) and «Отримати ЖД» (+1). The count is their Player Character's, as the sheet's counter (`fdCur`,
 * blank = the maximum).
 */
/** The tour's example character (author, 2026-11-17): a player without a character of his own sees the panel's rows and
 *  «Зробити перевірку» for it while the tour shows them; their buttons do nothing (pust-tour.mjs dockDemo) */
let DOCK_DEMO = null;
export function setDockDemo(actor) {
  DOCK_DEMO = actor ?? null;
  syncFdRow();
  syncCheckButton();
  requestAnimationFrame(placeAll);
}
const rowActor = () => game.user.character ?? DOCK_DEMO;
const isRowActor = (a) => !!a && a.type === "character" && (a.isOwner || a === DOCK_DEMO);

function syncFdRow() {
  syncSupRow();
  syncCarRow();
  const row = document.querySelector(`#${DOCK} .pust-md-fdrow:not(.pust-md-suprow)`);
  if (!row) return;
  const a = rowActor();
  row.hidden = !isRowActor(a);
  if (row.hidden) return;
  let n = 0;
  try { const { st, d } = evaluate(a); n = fdOf(st, d); } catch (_) { /* a broken sheet: 0 */ }
  const spend = row.querySelector(".pust-md-fdspend");
  row.querySelector(".pust-md-fdn").textContent = String(n);
  spend.disabled = n <= 0;
  spend.title = ""; // no tooltips on these four: self-evident (author, 2026-11-17)
  row.querySelector(".pust-md-fdgain").title = "";
}
async function stepFd(dd) {
  if (!game.user.character && DOCK_DEMO) return; // the tour's example: nothing to change
  const a = game.user.character;
  if (!a || a.type !== "character") return notify.warn("У тебе немає свого персонажа.");
  const res = await runAction(a, (st) => {
    const cur = fdOf(st, compute(st));
    if (dd < 0 && cur <= 0) return null;
    st.fdCur = String(Math.max(0, cur + dd));
    return { was: cur, now: Math.max(0, cur + dd) };
  }, { quiet: true });
  syncFdRow();
  // a line in chat, so the GM sees it (author, 2026-11-15; fate-card.mjs)
  if (res) await postFateChange(a, res.was, res.now);
}
for (const h of ["updateActor", "updateUser", "createActor", "deleteActor"]) Hooks.on(h, foundry.utils.debounce(syncFdRow, 120));

/* ---------------- players' «Караван» (author, 2026-11-18): their caravans' sheets, at least Observer ---------------- */
/** the caravans this player may look at, by name */
const myCaravans = () => game.actors.filter((a) => a.type === "caravan" && a.testUserPermission(game.user, "OBSERVER"))
  .sort((a, b) => a.name.localeCompare(b.name, "uk"));
const sheetOpen = (a) => !!a?.sheet?.rendered;
function toggleSheet(a) {
  if (sheetOpen(a)) return a.sheet.close();
  return a.sheet.render({ force: true });
}
function syncCarRow() {
  const row = document.querySelector(`#${DOCK} .pust-md-carrow`);
  if (!row) return;
  const cars = myCaravans();
  row.hidden = !cars.length;
  const b = row.querySelector(".pust-md-car");
  b.classList.toggle("on", cars.some(sheetOpen));
  b.title = cars.length > 1 ? "Відкрити чи закрити аркуш одного з твоїх караванів" : "Відкрити чи закрити аркуш каравану";
  const pick = document.querySelector(`#${DOCK} .pust-md-carpick`);
  if (pick && !pick.hidden) {
    if (cars.length > 1) pick.innerHTML = carPickHtml(cars);
    else closeCarPick();
  }
}
const carPickHtml = (cars) => `<div class="pust-md-body">${cars.map((a) => `<button type="button" class="pust-md-carone${sheetOpen(a) ? " on" : ""}" data-car="${a.id}" title="${sheetOpen(a) ? "Закрити" : "Відкрити"} аркуш «${esc(a.name)}»"><i class="fa-solid fa-truck"></i><span>${esc(a.name)}</span>${sheetOpen(a) ? "<small>відкрито</small>" : ""}</button>`).join("")}</div>`;
function closeCarPick() {
  const pick = document.querySelector(`#${DOCK} .pust-md-carpick`);
  if (pick) pick.hidden = true;
  document.querySelector(`#${DOCK} .pust-md-car`)?.setAttribute("aria-expanded", "false");
  document.removeEventListener("pointerdown", carPickOutside, true);
  document.removeEventListener("keydown", carPickEsc, true);
}
function carPickOutside(ev) { if (!ev.target.closest?.(".pust-md-carpick, .pust-md-car")) closeCarPick(); }
function carPickEsc(ev) { if (ev.key === "Escape") { ev.stopPropagation(); closeCarPick(); } }
/** one caravan: its sheet opens or closes; several: a list under the button to pick from */
function onCaravanButton() {
  const cars = myCaravans();
  if (!cars.length) return notify.warn("У тебе немає доступу до жодного каравану.");
  if (cars.length === 1) { closeCarPick(); return toggleSheet(cars[0]); }
  const pick = document.querySelector(`#${DOCK} .pust-md-carpick`);
  if (!pick.hidden) return closeCarPick();
  pick.innerHTML = carPickHtml(cars);
  pick.hidden = false;
  document.querySelector(`#${DOCK} .pust-md-car`)?.setAttribute("aria-expanded", "true");
  document.addEventListener("pointerdown", carPickOutside, true);
  document.addEventListener("keydown", carPickEsc, true);
  requestAnimationFrame(placeAll);
}
async function onCaravanPick(ev) {
  const b = ev.target.closest("[data-car]");
  if (!b) return;
  closeCarPick();
  const a = game.actors.get(b.dataset.car);
  if (a) await toggleSheet(a);
}
// the button's «on» follows the caravans' sheets opening and closing
for (const h of ["renderActorSheetV2", "renderApplicationV2", "closeApplicationV2"]) {
  Hooks.on(h, (app) => { if (app?.document?.type === "caravan") requestAnimationFrame(syncCarRow); });
}

/**
 * The same for Припаси (author, 2026-11-15): «Витратити Припас» with the count (off and half-transparent at 0),
 * «Отримати Припас» (off at the maximum — more is over the limit); a chat card each (fate-card.mjs postSupChange).
 */
function syncSupRow() {
  const row = document.querySelector(`#${DOCK} .pust-md-suprow`);
  if (!row) return;
  const a = rowActor();
  row.hidden = !isRowActor(a);
  if (row.hidden) return;
  let n = 0, max = 0;
  try { const { st, d } = evaluate(a); n = parseInt(st.supplies, 10) || 0; max = d.supMax; } catch (_) { /* a broken sheet */ }
  const spend = row.querySelector(".pust-md-supspend"), gain = row.querySelector(".pust-md-supgain");
  row.querySelector(".pust-md-supn").textContent = String(n);
  spend.disabled = n <= 0;
  gain.disabled = n >= max;
  spend.title = "";
  gain.title = "";
}
async function stepSup(dd) {
  if (!game.user.character && DOCK_DEMO) return; // the tour's example
  const a = game.user.character;
  if (!a || a.type !== "character") return notify.warn("У тебе немає свого персонажа.");
  const res = await runAction(a, (st) => {
    const cur = parseInt(st.supplies, 10) || 0, max = compute(st).supMax;
    const now = Math.max(0, Math.min(Math.max(cur, max), cur + dd));
    if (now === cur || (dd > 0 && cur >= max)) return null;
    st.supplies = now;
    return { was: cur, now };
  }, { quiet: true });
  syncSupRow();
  if (res) await postSupChange(a, res.was, res.now);
}

/** Players: «Зробити перевірку» only while they own a character */
function syncCheckButton() {
  const b = document.querySelector(`#${DOCK} .pust-md-check`);
  if (!b) return;
  b.hidden = !game.actors.some((a) => a.type === "character" && a.isOwner) && !DOCK_DEMO;
  b.classList.toggle("on", dockCheckOpen());
}
for (const h of ["createActor", "deleteActor", "updateActor", "updateUser"]) Hooks.on(h, foundry.utils.debounce(syncCheckButton, 150));

/** Players: «Зняти цілі» is on while they have targets; its tooltip counts them */
function syncUntarget() {
  const b = document.querySelector(`#${DOCK} .pust-md-untarget`);
  if (!b) return;
  const n = game.user.targets?.size ?? 0;
  b.disabled = !n;
  b.title = n ? `Зняти всі твої цілі (зараз: ${n})` : "Цілей немає. Познач ціль: T над токеном, Shift+T — додати ще";
}
Hooks.on("targetToken", (user) => { if (user?.isSelf) syncUntarget(); });
Hooks.on("canvasReady", () => { syncUntarget(); syncPlayerTargets(); });

/** Players: «Обрати цілі» / «Зняти цілі» over «Зробити перевірку», on battle maps only (author, 2026-11-15); on the other
 *  scenes the same row holds «Примітка» alone, the size of «Обрати цілі» (author, 2026-11-18; playtest item 18) */
function syncPlayerTargets() {
  const row = document.querySelector(`#${DOCK} .pust-md-trow`);
  if (!row) return;
  const battle = isBattleScene(canvas?.scene);
  row.hidden = !canvas?.scene;
  row.classList.toggle("is-battle", battle);
  for (const b of row.querySelectorAll(".pust-md-target, .pust-md-untarget")) b.hidden = !battle;
  const note = row.querySelector(".pust-md-note");
  if (note) note.hidden = battle;
  syncTargetTool();
  requestAnimationFrame(placeTargets);
}

/** «Обрати цілі» is pressed while Foundry's targeting tool is on (tokens can't be dragged then) */
function syncTargetTool() {
  const b = document.querySelector(`#${DOCK} .pust-md-target`);
  if (!b) return;
  const on = game.activeTool === "target";
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", String(on));
  b.title = on
    ? "Обирання цілей: клік по токену — ціль, Shift+клік — ще одна. Натисни ще раз, щоб знову рухати токени"
    : "Обирати цілі кліком по токену (Shift+клік — ще одна). Поки це ввімкнено, токени не перетягуються";
}
// Foundry changes tools without a hook: its buttons' aria-pressed is watched instead
Hooks.on("renderSceneControls", (app, el) => {
  setTimeout(syncTargetTool, 50);
  const root = el?.closest?.("#scene-controls") ?? el ?? document.querySelector("#scene-controls");
  if (!root || root._pustToolWatch || !window.MutationObserver) return;
  root._pustToolWatch = new MutationObserver(() => syncTargetTool());
  root._pustToolWatch.observe(root, { subtree: true, attributes: true, attributeFilter: ["aria-pressed"] });
});

// «Битва» in its own place keeps to the sidebar as it folds and opens (also watched by size, see renderMapDock)
Hooks.on("collapseSidebar", () => requestAnimationFrame(placeAll));

// the Fate button and the travel luck follow the selected caravan
Hooks.on("controlToken", foundry.utils.debounce(() => { redrawDice(); if (tv.open) redrawTravel(); }, 100));
// players' Fate follows their targets (map-dice.mjs fateActors)
Hooks.on("targetToken", foundry.utils.debounce((user) => { if (user?.isSelf && !game.user.isGM) redrawDice(); }, 100));
Hooks.on("updateUser", (user, ch) => { if (user.isSelf && "character" in ch) redrawDice(); });

// players' counters follow the GM's changes: the game's (a world setting) and the viewed scene's (a scene flag)
// createSetting too: the world's very first game counter creates the setting's document, and only that fires (playtest
// 2026-11-18: a player saw the new counter only after F5)
const onCountersSetting = (setting) => { if (setting.key === `${game.system.id}.gameCounters`) redrawCounters(); };
Hooks.on("updateSetting", onCountersSetting);
Hooks.on("createSetting", onCountersSetting);
Hooks.on("updateScene", (scene, changed) => {
  if (scene.id !== canvas?.scene?.id) return;
  redrawCounters();
  // the scene's type switched in its settings (author, 2026-11-15): the panels follow at once
  if (foundry.utils.hasProperty(changed, `flags.${game.system.id}.battleScene`) || foundry.utils.hasProperty(changed, `flags.${game.system.id}.-=battleScene`)) syncSceneKind();
});
Hooks.on("canvasReady", () => { redrawCounters(); syncSceneKind(); });

/**
 * The panels follow the viewed scene (author, 2026-11-14): on «Бойова мапа» the GM gets «Битва» instead of «Мапа Пустки»
 * and «Подорож»; «Лічильники» and «Кістки» stay on both.
 */
function syncSceneKind() {
  syncPlayerTargets();
  const unit = document.querySelector(`#${DOCK} [data-unit="map"]`);
  if (!game.user.isGM) requestAnimationFrame(placeAll); // players' row: «Примітка» or the targets
  if (!unit || !game.user.isGM) return;
  const battle = isBattleScene(canvas?.scene);
  const was = unit.classList.contains("is-battle");
  unit.classList.toggle("is-battle", battle);
  // entering a battle map: «Кістки» folded, «Лічильники» too unless there are game counters; leaving it: as remembered
  if (battle !== was) {
    const f = load(FOLD_KEY);
    const hasGame = (game.settings.get(game.system.id, "gameCounters") ?? []).length > 0;
    document.querySelector(`#${DOCK} [data-unit="dice"]`)?.classList.toggle("folded", battle ? true : !!f.dice);
    document.querySelector(`#${DOCK} [data-unit="ctr"]`)?.classList.toggle("folded", battle ? !hasGame : !!f.ctr);
  }
  for (const el of unit.querySelectorAll(".pust-md-map, .pust-md-travel")) el.hidden = battle;
  if (battle && tv.open) { tv.open = false; redrawTravel(); }
  const b = unit.querySelector(".pust-md-battle");
  if (b) b.hidden = !battle;
  const lite = document.querySelector(`#${DOCK} [data-unit="dmg"]`);
  if (lite) { lite.hidden = battle; lite.querySelector(".pust-md-battle").hidden = battle; }
  const ovw = document.querySelector(`#${DOCK} [data-unit="ovw"]`);
  if (ovw) { ovw.hidden = !battle; ovw.querySelector(".pust-md-ovw").hidden = !battle; redrawOverview(); if (battle) { place("ovw"); fitOverview(); } }
  redrawBattlePanel();
  requestAnimationFrame(placeAll);
}
