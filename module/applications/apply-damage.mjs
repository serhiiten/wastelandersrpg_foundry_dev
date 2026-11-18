/**
 * «Завдати цілям» (author, 2026-11-14) — in «Зробити перевірку» (a partial success halves it for those who take ½),
 * on an enemy's attack and in the «Битва» panel: the damage goes to the targets through the battle tracker's rules (module/rules/battle.mjs
 * computeDamage: armour, half / immune / heal, laser–plasma–gauss, «ігнорує N», electricity +1d6, ½ on a partial
 * success, Камікадзе +2). Enemies use their card's defence (module/rules/enemy-model.mjs), characters the rules engine's
 * (armour, psychic armour, species / perks / chems, manual defences), caravans their armour. The GM applies at once;
 * a player's press goes to the active GM through the system socket.
 * The summary (author, 2026-11-14): in the public chat mode everyone gets a short card — who was hit, −N / +N ОЗ, «вибуває»,
 * and the HP «до → після» only of characters and caravans (players see those bars anyway) — and the GMs get the full one
 * whispered (enemies' HP, armour, defences, every step). In the other modes the full card follows the mode as before.
 */
import { activeGmHere } from "../helpers/main-window.mjs";
import { chatType, resolveHit } from "../rules/battle.mjs";
import { targetProfile as profileOf } from "../rules/target-profile.mjs";
import { battleType } from "./enemy-attack.mjs";
import { postChat, isPublicMode } from "./chat.mjs";
import { askGM, answerGM } from "../helpers/gm-request.mjs";
import { notify } from "../helpers/notify.mjs";
import { rollDie } from "../helpers/dice.mjs";
import { deferSuperDice } from "./caravan-superdice.mjs";

const SOCKET = () => `system.${game.system.id}`;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

/** Apply one card's damage to tokens (GM side); returns the summary lines */
/**
 * The tokens a damage or a healing goes to (author, 2026-11-15): only the user's targets (T), never the selection
 */
export function chosenTokens() {
  return [...(game.user.targets ?? [])].filter((t) => t?.document).map((t) => t.document.uuid);
}

/** After every damage or healing the user's targets are cleared (author, 2026-11-15) */
export function clearTargets() {
  if (game.user.targets?.size) canvas?.tokens?.setTargets([], { mode: "replace" });
}

/** Nobody targeted: the hint where targets come from */
export function warnNoTargets() {
  notify.warn(game.user.isGM
    ? "Спершу познач цілі: T над токеном, «Вибрати цілі» в панелі «Битва» або «Обрати всіх» у зоні."
    : "Спершу познач цілі (T над токеном).");
}

/** Heal tokens by `amount` up to their maximum (the tracker's trHealCore); returns the summary lines */
/**
 * A target by its uuid: a token (its actor, its name) or an actor itself (author, 2026-11-16: the «Битва» panel off the battle
 * map deals damage to the players' characters and caravans picked from a list — they may have no token on the scene)
 */
async function targetOf(uuid) {
  const doc = await fromUuid(uuid);
  if (doc?.documentName === "Actor") return { tok: null, actor: doc };
  return { tok: doc, actor: doc?.actor ?? null };
}

export async function applyHeal(tokenUuids, amount, { head = "", defer = 0 } = {}) {
  const lines = [];
  for (const uuid of tokenUuids) {
    const { tok, actor } = await targetOf(uuid);
    if (!actor || !actor.system?.hp) continue;
    const hp0 = int(actor.system.hp.value), max = int(actor.system.hp.max, hp0);
    const hp = Math.min(max, hp0 + Math.max(0, int(amount))); // never below 0 (the general rule)
    if (hp !== hp0) await actor.update({ "system.hp.value": hp });
    const name = esc(tok?.name || actor.name);
    // Суперстимпак / Критфікс on a target (author, 2026-11-18): a caravan keeps the deferred die and the GM's group
    // «Кінець сцени» rolls it (caravan-defib.mjs); an enemy's the GM rolls himself
    let note = "";
    if (defer > 0) {
      note = actor.type === "caravan"
        ? esc(`Відкладено 1d6 шкоди на кінець сцени (усього кісток: ${await deferSuperDice(actor, defer)}). Система кине їх сама на «Кінець сцени» Доглядача.`)
        : esc("Наприкінці сцени — 1d6 шкоди, ігноруючи броню: кидає Доглядач.");
    }
    const row = { name, delta: hp - hp0, gain: true, hp0, hp, max, note };
    lines.push({ full: targetRow({ ...row, showHp: true }), short: targetRow({ ...row, showHp: hpOpen(actor) }) });
  }
  const card = (ls, gmNote = "") => applyCard({ heal: true, icon: "fa-kit-medical", title: `Лікування${head ? `: ${esc(head)}` : ""}`, chips: gmNote, rows: ls });
  await postSplit("Лікування", lines, card);
  return lines.length;
}

/** HP everyone may see: characters' and caravans' (their bars are open to all), not enemies' */
const hpOpen = (actor) => actor?.type === "character" || actor?.type === "caravan";

/**
 * One target's row of a damage / healing card (author, 2026-11-15: the cards made handsome): the name, the change as a big
 * number on the right, «вибуває», and — where HP may be shown — a small HP bar «до → після» (the lost part in red, the
 * gained part in green); the GM's version adds the steps (armour, defences) in small type.
 */
function targetRow({ name, delta, gain, hp0, hp, max, showHp, out = false, note = "", steps = [] }) {
  const pct = (v) => Math.max(0, Math.min(100, max > 0 ? (v / max) * 100 : 0));
  const lo = Math.min(hp0, hp), hi = Math.max(hp0, hp);
  const bar = showHp && max > 0
    ? `<div class="pust-da-hp"><span class="pust-da-bar"><i class="now" style="width:${pct(lo).toFixed(1)}%"></i><i class="${gain ? "gain" : "lost"}" style="left:${pct(lo).toFixed(1)}%;width:${(pct(hi) - pct(lo)).toFixed(1)}%"></i></span><span class="pust-da-hpn">ОЗ ${hp0} → <b>${hp}</b> / ${max}</span></div>`
    : "";
  return `<div class="pust-da-row${out ? " out" : ""}"><div class="pust-da-main"><span class="pust-da-name">${name}</span>`
    + `${out ? `<span class="pust-da-out"><i class="fa-solid fa-skull"></i>вибуває</span>` : ""}`
    + `<span class="pust-da-delta ${gain ? "gain" : delta === 0 ? "zero" : "lost"}">${gain ? "+" : delta === 0 ? "" : "−"}${delta}</span></div>`
    + bar + (note ? `<div class="pust-da-note">${note}</div>` : "")
    + (steps.length ? `<div class="pust-da-steps">${esc(steps.join(" · "))}</div>` : "") + `</div>`;
}

/** The card's frame: a header (icon, title, chips) and the rows */
function applyCard({ heal = false, dt = "", icon, title, chips = "", rows }) {
  // a damage card's header in its damage type's chip colours (author, 2026-11-15; .dt-* in css/pust-check.css)
  return `<div class="pust-chat pust-dmgapply${heal ? " pust-healapply" : ""}${dt ? ` pust-da-typed dt-${dt}` : ""}"><div class="pust-da-hd"><i class="fa-solid ${icon}"></i><span class="pust-da-title">${title}</span>${chips}</div>`
    + `<div class="pust-da-list">${rows.join("")}</div></div>`;
}

/**
 * The summary to chat: in the public mode a short card for all and the full one whispered to the GMs; otherwise the full
 * card in the chat's mode (GM only, blind, self)
 */
async function postSplit(alias, lines, card) {
  if (!lines.length) return;
  const full = lines.map((l) => l.full), short = lines.map((l) => l.short);
  if (!isPublicMode()) return postChat({ speaker: { alias }, content: card(full, "", true) });
  await postChat({ speaker: { alias }, content: card(short) });
  // nothing more to tell the GM when the short card already says it all
  if (full.join("") === short.join("")) return;
  const CM = ChatMessage.implementation;
  await CM.create({ speaker: { alias }, whisper: CM.getWhisperRecipients("GM").map((u) => u.id), content: card(full, `<span class="pust-da-chip gm" title="Бачить лише Доглядач"><i class="fa-solid fa-eye-slash"></i>Доглядачу</span>`, true) });
}

export async function applyDamage(tokenUuids, data, { partial = false, dodge = false, head = "" } = {}) {
  const lines = [];
  const type = battleType(data.type);
  const rollD6 = () => rollDie(6); // the electricity bonus; not Roll#evaluateSync, which Foundry 14 refuses for dice (helpers/dice.mjs)
  for (const uuid of tokenUuids) {
    const { tok, actor } = await targetOf(uuid);
    const prof = profileOf(actor);
    if (!prof) continue;
    const hp0 = int(actor.system.hp?.value), max = int(actor.system.hp?.max, hp0);
    // one rule for every hit (module/rules/battle.mjs resolveHit): parts by type, Камікадзе once, nothing below 0
    const hit = { ...data, type, parts: Array.isArray(data.parts) ? data.parts.map((x) => ({ ...x, type: battleType(x.type) })) : undefined };
    const r = resolveHit(prof, hp0, max, hit, { partial, dodge, rollD6 });
    const hp = r.hp, steps = r.steps;
    if (hp !== hp0) await actor.update({ "system.hp.value": hp });
    const name = esc(tok?.name || actor.name);
    const gain = hp >= hp0 && !!r.heal;
    const row = { name, delta: gain ? hp - hp0 : hp0 - hp, gain, hp0, hp, max, out: !!r.out, note: r.heal ? `лікує ${esc(r.heal)}` : "" };
    // the short row (everyone): no steps (armour, defences); HP only where everyone sees them
    lines.push({ full: targetRow({ ...row, showHp: true, steps }), short: targetRow({ ...row, showHp: hpOpen(actor) }) });
  }
  // the full card's header also says what the dice gave, before armour and defences (author, 2026-11-15)
  const rolled = Number.isFinite(Number(data.total)) ? `<span class="pust-dmg-rolled" title="Скільки випало на кістках (з модифікаторами), до броні й стійкостей">випало <b>${Math.max(0, int(data.total))}</b></span>` : "";
  const card = (ls, gmNote = "", full = false) => applyCard({
    dt: chatType(type), icon: "fa-burst", title: `Шкода${head ? `: ${esc(head)}` : ""}`,
    chips: (partial ? `<span class="pust-da-chip">частковий успіх</span>` : "") + (dodge ? `<span class="pust-da-chip">½ шкоди</span>` : "") + (full ? rolled : "") + gmNote, rows: ls,
  });
  await postSplit("Шкода", lines, card);
  return lines.length;
}

/**
 * «Завдати цілям» (author, 2026-11-14: a button in «Зробити перевірку» and on an enemy's attack, not in chat):
 * the damage goes to the targets; the GM applies it, a player's press goes to the active GM.
 * @param {{total:number, type:string, ignoreArmor?:boolean, ignoreN?:number, poison?:number}} data
 * @returns {Promise<boolean>} false when there was nobody to hit
 */
export async function sendDamage(data, { partial = false, head = "" } = {}) {
  const targets = chosenTokens();
  if (!targets.length) {
    warnNoTargets();
    return false;
  }
  if (game.user.isGM) { await applyDamage(targets, data, { partial, head }); clearTargets(); return true; }
  if (!game.users.activeGM) { notify.warn("Шкоду застосовує Доглядач, а його зараз немає в грі."); return false; }
  askGM({ op: "applyDamage", targets, data, partial, head }, "Шкода");
  // no «Запит надіслано Доглядачеві» notice (author, 2026-11-15): the chat card shows the result
  clearTargets();
  return true;
}

/** Wiring (wastelanders.mjs, ready): the GM's socket for the players' requests */
export function readyApplyDamage() {
  game.socket.on(SOCKET(), (msg) => {
    if (!activeGmHere()) return;
    if (msg?.op === "applyDamage") answerGM(msg, () => applyDamage(msg.targets || [], msg.data || {}, { partial: !!msg.partial, head: String(msg.head || "") }));
  });
}
