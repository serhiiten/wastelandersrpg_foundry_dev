/**
 * «Уникнення шкоди» bound to an enemy's attack (A1; author, 2026-11-20, Asking, mockup А; Fable's verdict; the rules and the
 * record: module/rules/dodge.mjs). An enemy's hit on a player's character waits on the attack's own card: a row a target,
 * «Уникнути ВП» and «Повністю» (the full damage without a roll) for its owner, «Без уникнення» (a tick a row) and «Усім без уникнення» / «Скасувати» for the
 * GM. The avoidance is rolled in «Зробити перевірку»; 15+ closes the row by itself, 9− and 10–14 are applied with a button
 * there (an aspect may be invoked first). The damage then goes through applyDamage as before (its usual «Шкода» card); the
 * menu's states (збити з ніг, приголомшити…) land only with the damage. Only the GM writes the record; the players' answers
 * come over the socket, one at a time a card.
 */
import { applyDamage } from "./apply-damage.mjs";
import { putStates } from "./states.mjs";
import { activeGmHere } from "../helpers/main-window.mjs";
import { askGM, answerGM } from "../helpers/gm-request.mjs";
import { notify } from "../helpers/notify.mjs";
import { sharedGet } from "../helpers/scene-shared.mjs";
import { pendRows, answerRow, statesLand, rowText, rowDeal, openRows, rowClosed, dodgeAttr, ATTR_SHORT } from "../rules/dodge.mjs";

const SOCKET = () => `system.${game.system.id}`;
const sys = () => game.system.id;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const FLAG = "pend";

/** The record of a message, or null */
export const pendOf = (msg) => msg?.flags?.[sys()]?.[FLAG] ?? null;

/** A target by uuid: {tok, actor} */
async function docOf(uuid) {
  const d = await fromUuid(uuid);
  if (d?.documentName === "Actor") return { tok: null, actor: d };
  return { tok: d, actor: d?.actor ?? null };
}

/**
 * The targets that wait (a player's character whose token isn't hidden — Fable: a hidden one is hit at once, as before) and
 * the rest. @param {string[]} uuids @returns {Promise<{wait:{uuid,actor,name}[], now:string[]}>}
 */
export async function splitWaiting(uuids) {
  const wait = [], now = [];
  for (const uuid of uuids ?? []) {
    const { tok, actor } = await docOf(uuid);
    if (actor?.type === "character" && actor.hasPlayerOwner && !tok?.hidden) wait.push({ uuid, actor: actor.uuid, name: tok?.name || actor.name });
    else now.push(uuid);
  }
  return { wait, now };
}

/**
 * The GM posts the record of the waiting targets onto the attack's card (`msg`, its damage card), or onto a card of its own
 * when that one isn't public (the players must see the buttons) or there is none.
 * @param {ChatMessage|null} msg
 * @param {{hits:{data:object, head:string}[], targets:{uuid,actor,name,hits?:number[]}[], half?:boolean, source?:string,
 *   srcName?:string, states?:{key:string}[], once?:boolean}} o
 */
export async function postPending(msg, { hits, targets, half = false, source = "", srcName = "", states = [], once = false }) {
  if (!game.user.isGM || !targets?.length || !hits?.length) return null;
  const type = hits[0]?.data?.type ?? "phys";
  const pend = {
    v: 1, hits: hits.map((h) => ({ data: h.data, head: String(h.head ?? "") })), half: !!half, source, srcName,
    states: (states ?? []).filter((s) => s?.key), once: !!once, // only the GM writes it: a move's states keep their dice / rounds
    attr: dodgeAttr(type), round: Math.max(1, Number(sharedGet("round")) || 1), rows: pendRows(targets),
  };
  const open = msg && !msg.blind && !(msg.whisper?.length);
  if (open) { await msg.setFlag(sys(), FLAG, pend); return msg; }
  // always public, whatever the chat's mode: the players answer on it (the damage's number stays on the GM's own card)
  return ChatMessage.implementation.create({
    speaker: { alias: srcName || "Атака" },
    content: `<div class="pust-chat pust-pend-own"><div class="pust-da-hd"><i class="fa-solid fa-person-running"></i><span class="pust-da-title">${esc(hits[0].head)}</span></div></div>`,
    flags: { [sys()]: { [FLAG]: pend } },
  });
}

/* ---------- the GM's side ---------- */

const QUEUE = new Map(); // message id → the promise of its last answer: answers to one card go one at a time

/**
 * An answer to a row (the GM). `from` the user who asked (a player must own the row's actor; the GM may do anything).
 * @param {string} msgId @param {string} rowId @param {{op:string, verdict?:number}} a @param {string} [from]
 */
export function resolvePend(msgId, rowId, a, from = game.user.id) {
  const prev = QUEUE.get(msgId) ?? Promise.resolve();
  const next = prev.then(() => resolveNow(msgId, rowId, a, from)).catch((e) => console.error(e));
  QUEUE.set(msgId, next);
  next.finally(() => { if (QUEUE.get(msgId) === next) QUEUE.delete(msgId); });
  return next;
}

async function resolveNow(msgId, rowId, a, from) {
  const msg = game.messages.get(msgId);
  const pend = pendOf(msg);
  const row = pend?.rows?.[rowId];
  if (!row) return false;
  const user = game.users.get(from);
  const actor = row.actor ? await fromUuid(row.actor) : null;
  const gmAsks = !!user?.isGM;
  // a player answers only for their own character, and only with a player's answers
  if (!gmAsks && (!user || !actor?.testUserPermission(user, "OWNER") || !["rolled", "apply", "take"].includes(a?.op))) return false;
  const r = answerRow(row, a);
  if (!r) return false;
  // the row first, so a second press finds it closed
  await msg.update({ [`flags.${sys()}.${FLAG}.rows.${rowId}`]: r.row });
  if (!r.deal) return true;
  await dealRow(pend, r.row, r.deal, msg, rowId);
  return true;
}

/** The row's damage (its hits one after another; a later part skips a target already down) and the menu's states */
async function dealRow(pend, row, deal, msg, rowId) {
  const half = deal === "half";
  for (const [k, i] of (row.hits ?? [0]).entries()) {
    const hit = pend.hits[i];
    if (!hit) continue;
    if (k > 0) { const { actor } = await docOf(row.uuid); if (Number(actor?.system?.hp?.value) <= 0) break; }
    await applyDamage([row.uuid], hit.data, { head: hit.head, source: pend.source, dodge: !!pend.half, avoid: half });
  }
  if (statesLand(deal) && pend.states?.length) {
    const lines = await putStates([row.uuid], pend.states, { by: pend.source, byName: pend.srcName, once: !!pend.once });
    if (lines.length) await msg.update({ [`flags.${sys()}.${FLAG}.rows.${rowId}.note`]: lines.join(" ") });
  }
}

/** Every open row of a card at once: the GM's «Усім без уникнення» (op gm) and «Скасувати» (op cancel) */
export async function resolveAll(msgId, op) {
  const pend = pendOf(game.messages.get(msgId));
  for (const [id] of openRows(pend)) await resolvePend(msgId, id, { op });
}

/** The cards with rows still open (the newest first) */
export function openCards() {
  return [...game.messages].filter((m) => openRows(pendOf(m)).length).reverse();
}

/** «Кінець сцени» (and «Новий день», «Кінець сесії»): the rows still open are taken back, nothing dealt (Fable) */
export async function cancelOpenPending() {
  if (!game.user.isGM) return 0;
  let n = 0;
  for (const m of openCards()) { n += openRows(pendOf(m)).length; await resolveAll(m.id, "cancel"); }
  return n;
}

/** ▶ «Коло дій»: the GM is reminded of the attacks still waiting (nothing applied by itself) */
export function remindPending() {
  if (!game.user.isGM) return;
  const names = openCards().flatMap((m) => openRows(pendOf(m)).map(([, r]) => r.name));
  if (names.length) notify.warn(`Атаки чекають на уникнення (${names.length}): ${[...new Set(names)].join(", ")}. «Без уникнення» на картці атаки застосує повну шкоду.`);
}

/* ---------- everyone's side ---------- */

/** Ask the GM (or do it, as the GM) */
export async function answerPending(msgId, rowId, a) {
  if (game.user.isGM) return resolvePend(msgId, rowId, a);
  if (!game.users.activeGM) { notify.warn("Уникнення застосовує Доглядач, а його зараз немає в грі."); return false; }
  return askGM({ op: "resolvePend", msg: msgId, row: rowId, a }, "Уникнення");
}

/** The open row of an actor (the newest card), for «Зробити перевірку» opened on an avoidance by itself */
export function openRowOf(actorUuid) {
  for (const m of openCards()) {
    const hit = openRows(pendOf(m)).find(([, r]) => r.actor === actorUuid);
    if (hit) return { msg: m.id, row: hit[0] };
  }
  return null;
}

/** The rows on the card (renderChatMessageHTML): each viewer gets the buttons that are theirs */
export function renderPending(message, html) {
  const pend = pendOf(message);
  if (!pend?.rows) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const content = root?.querySelector(".message-content");
  if (!content) return;
  const a = ATTR_SHORT[pend.attr] ?? "ВП";
  const gm = game.user.isGM;
  const rows = Object.entries(pend.rows).map(([id, r]) => {
    const actor = r.actor ? fromUuidSync(r.actor) : null;
    const mine = !!actor?.isOwner;
    const open = !rowClosed(r);
    const btns = [];
    if (open && mine && r.status === "wait") {
      btns.push(`<button type="button" class="pust-pend-b dodge" data-pend="dodge" data-row="${id}" title="Відкрити «Зробити перевірку» на уникненні ${a}"><i class="fa-solid fa-person-running"></i>Уникнути ${a}</button>`);
      // «Повністю» (author, 2026-11-20: was «Прийняти»; red): the full damage without rolling
      btns.push(`<button type="button" class="pust-pend-b full" data-pend="take" data-row="${id}" title="Отримати повну шкоду без кидка уникнення">Повністю</button>`);
    }
    if (open && mine && r.status === "rolled") {
      btns.push(`<button type="button" class="pust-pend-b dodge" data-pend="apply" data-row="${id}">${esc(rowDeal(pend, r).label)}</button>`);
    }
    if (open && gm) btns.push(`<label class="pust-pend-gm" title="Уникати не можна (відповідь на невдачу чи частковий успіх атаки гравця): повна шкода одразу"><input type="checkbox" data-pend="gm" data-row="${id}"> Без уникнення</label>`);
    return `<div class="pust-pend-row st-${r.status}"><span class="pust-pend-name">${esc(r.name)}</span><span class="pust-pend-st">${esc(rowText(r, pend.attr))}</span>`
      + (btns.length ? `<span class="pust-pend-btns">${btns.join("")}</span>` : "")
      + (r.note ? `<span class="pust-pend-note">${esc(r.note)}</span>` : "") + `</div>`;
  });
  const anyOpen = openRows(pend).length > 0;
  const foot = gm && anyOpen ? `<div class="pust-pend-foot"><button type="button" class="pust-pend-b" data-pend="all">Усім без уникнення</button><button type="button" class="pust-pend-b ghost" data-pend="cancel" title="Нікому не завдавати цієї шкоди">Скасувати</button></div>` : "";
  const box = document.createElement("div");
  box.className = "pust-pend";
  box.innerHTML = `<div class="pust-pend-hd"><i class="fa-solid fa-shield-halved"></i>Уникнення шкоди: ${a}${pend.half ? " · ½ шкоди з ефекту" : ""}</div>${rows.join("")}${foot}`;
  (content.querySelector(".pust-chat") ?? content).appendChild(box);
  box.addEventListener("click", (ev) => onClick(ev, message, pend));
  box.addEventListener("change", (ev) => {
    const t = ev.target.closest('input[data-pend="gm"]');
    if (t?.checked) { t.disabled = true; resolvePend(message.id, t.dataset.row, { op: "gm" }); }
  });
}

async function onClick(ev, message, pend) {
  const b = ev.target.closest("button[data-pend]");
  if (!b || b.disabled) return;
  ev.preventDefault();
  const act = b.dataset.pend, id = b.dataset.row;
  if (act === "all" || act === "cancel") { b.disabled = true; return resolveAll(message.id, act === "all" ? "gm" : "cancel"); }
  const row = pend.rows?.[id];
  if (!row) return;
  if (act === "dodge") {
    const actor = row.actor ? await fromUuid(row.actor) : null;
    if (!actor) return;
    const { openCheckPanel } = await import("./check-panel.mjs");
    openCheckPanel(actor, { type: "dodge", attr: pend.attr }, { btn: b }).bindPend({ msg: message.id, row: id });
    return;
  }
  b.disabled = true;
  await answerPending(message.id, id, { op: act });
}

/** Wiring (wastelanders.mjs, ready): the GM's socket */
export function readyPending() {
  // (the card's rows: renderChatMessageHTML is hooked at load in wastelanders.mjs — the chat log renders before «ready»)
  game.socket.on(SOCKET(), (msg) => {
    if (msg?.op !== "resolvePend" || !activeGmHere()) return;
    answerGM(msg, () => resolvePend(String(msg.msg || ""), String(msg.row || ""), msg.a || {}, String(msg.from || "")));
  });
}

