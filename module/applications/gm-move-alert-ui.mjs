/**
 * U4 (author, 2026-11-21): a check card whose result asks for the GM's move (`flags.<system>.check.move`, rules/gm-move-alert.mjs)
 *  - the active GM whispers the GMs a card «Зроби хід проти {name}» (`flags.<system>.gmMove`);
 *  - every GM's «Ходи Доглядача» plate (wastelanders.mjs) glows for 10 s; it goes out when the GM opens the moves' card
 *    (gm-moves.mjs toggleGmMoves), when a later card of the same roll needs no move (an aspect invoked), or after 10 s;
 *  - a later card of the same roll that needs no move: the active GM marks the whispered card done (struck through);
 *  - the card's «Твої ходи» (author, 2026-11-22) opens the moves' card under the plate, as a click on the plate does.
 * Nothing is kept beyond the whispered card itself (no list of debts). The hooks: registerGmMoveAlert, called in wastelanders.mjs.
 */
import { rollKey } from "../rules/gm-move-alert.mjs";
import { activeGmHere } from "../helpers/main-window.mjs";
import { openGmMoves } from "./gm-moves.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const GLOW_MS = 10000;
const ALIAS = "Ходи Доглядача";

/**
 * What the active GM does with a check card (pure): "send" a new card, "update" the open one of the same roll (a new
 * verdict that still asks for a move), "cancel" it (the result improved), or nothing (null).
 * @param {object|null} check  the card's `flags.<system>.check`
 * @param {boolean} hasOpen    a whispered card of this roll is there and not done
 */
export function moveAction(check, hasOpen) {
  if (!check || !rollKey(check)) return null;
  if (check.move) return hasOpen ? "update" : "send";
  return hasOpen ? "cancel" : null;
}

/** The whispered card's own record (its flag): the roll's key and what the card shows */
export const moveRecord = (check, done = null) => ({
  key: rollKey(check), name: check.name ?? "", typeName: check.typeName ?? "", verdictName: check.verdictName ?? "",
  total: check.total, text: String(check.text ?? ""), done: done ? { verdictName: done.verdictName ?? "" } : null,
});

/** The whispered card's HTML (pure): the system's card look (apply-damage.mjs applyCard), the fire icon */
export function gmMoveCardHtml(rec, chips = "") {
  const done = rec.done
    ? `<div class="pust-da-row pust-gmmove-ok"><div class="pust-da-main"><span class="pust-da-name">${esc(`${rec.name} покращує результат: ${rec.done.verdictName}. Хід не потрібен.`)}</span></div></div>`
    : "";
  return `<div class="pust-chat pust-dmgapply pust-gmmove${rec.done ? " done" : ""}"><div class="pust-da-hd"><i class="fa-solid fa-fire"></i><span class="pust-da-title">${esc(`Зроби хід проти ${rec.name}`)}</span>${chips}</div>`
    + `<div class="pust-da-list"><div class="pust-da-row pust-gmmove-was"><div class="pust-da-main"><span class="pust-da-name">${esc(`${rec.typeName}: ${rec.verdictName} (${rec.total})`)}</span></div>`
    + (rec.text ? `<div class="pust-da-note">${esc(rec.text)}</div>` : "") + `</div>${done}</div>`
    // «Твої ходи» (author, 2026-11-22, П5 5.2): opens the moves under the plate; a done card has none
    + (rec.done ? "" : `<div class="pust-gmmove-foot"><button type="button" class="pust-gmmove-open" data-pust-gmmoves="1" title="Відкрити ходи Доглядача під плашкою «Ходи»"><i class="fa-solid fa-fire"></i> Твої ходи</button></div>`)
    + `</div>`;
}

/* ---------------- the plate's glow (each GM's window) ---------------- */
const lit = new Set();
let timer = null;
const plates = () => document.querySelectorAll(".wastelanders-moves-open");

/** The glow out (the moves' card opened, or the time is up) */
export function quietGmMoveAlert() {
  clearTimeout(timer);
  timer = null;
  lit.clear();
  if (globalThis.document) plates().forEach((b) => b.classList.remove("pust-alert"));
}

function glow(key) {
  if (!game.user.isGM) return;
  lit.add(key);
  plates().forEach((b) => b.classList.add("pust-alert"));
  clearTimeout(timer);
  timer = setTimeout(quietGmMoveAlert, GLOW_MS);
}

/** A roll's move no longer needed: out, unless another roll's is still lit */
function unglow(key) {
  if (!lit.delete(key)) return;
  if (!lit.size) quietGmMoveAlert();
}

/* ---------------- the hooks ---------------- */
const sys = () => game.system.id;
const checkOf = (m) => m?.flags?.[sys()]?.check ?? null;
const recOf = (m) => m?.flags?.[sys()]?.gmMove ?? null;

/** The latest whispered card of this roll */
function openCard(key) {
  const list = game.messages?.contents ?? [];
  for (let i = list.length - 1; i >= 0; i--) if (recOf(list[i])?.key === key) return list[i];
  return null;
}

async function onCheck(message) {
  const check = checkOf(message);
  const key = rollKey(check);
  if (!check || !key) return;
  if (game.user.isGM && !check.move) unglow(key); // every GM's window: the improved result puts the glow out
  if (!activeGmHere()) return;
  const card = openCard(key);
  const act = moveAction(check, !!card && !recOf(card).done);
  if (!act) return;
  const { GM_CHIP } = await import("./states.mjs");
  if (act === "send") {
    const CM = ChatMessage.implementation;
    const rec = moveRecord(check);
    await CM.create({ speaker: { alias: ALIAS }, whisper: CM.getWhisperRecipients("GM").map((u) => u.id),
      content: gmMoveCardHtml(rec, GM_CHIP), flags: { [sys()]: { gmMove: rec } } });
    return;
  }
  const rec = act === "cancel" ? { ...recOf(card), done: { verdictName: check.verdictName ?? "" } } : moveRecord(check);
  await card.update({ content: gmMoveCardHtml(rec, GM_CHIP), [`flags.${sys()}.gmMove`]: rec });
}

/** «Твої ходи» on a whispered card (renderChatMessageHTML): the moves' card under the first plate; left open if it is */
function wireOpenButton(message, html) {
  const btn = html?.querySelector?.("[data-pust-gmmoves]");
  if (!btn || !recOf(message)) return;
  btn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const plate = document.querySelector(".wastelanders-moves-open");
    if (!plate) return ui.notifications.warn("Плашки «Ходи» зараз немає на екрані: ходи відкриваються з неї над сценою.");
    openGmMoves(plate);
  });
}

export function registerGmMoveAlert() {
  Hooks.on("renderChatMessageHTML", wireOpenButton);
  Hooks.on("createChatMessage", (message) => {
    const rec = recOf(message);
    if (rec?.key && !rec.done) return glow(rec.key);
    onCheck(message);
  });
  // the whispered card marked done (by the active GM): every GM's glow for that roll goes out
  Hooks.on("updateChatMessage", (message) => { const rec = recOf(message); if (rec?.key && rec.done) unglow(rec.key); });
}
