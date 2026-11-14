/**
 * «Завдати виділеним» (author, 2026-11-14) — in «Зробити перевірку» (a partial success halves it for those who take ½),
 * on an enemy's attack and in the «Битва» panel: the damage goes to the selected tokens through the battle tracker's rules (module/rules/battle.mjs
 * computeDamage: armour, half / immune / heal, laser–plasma–gauss, «ігнорує N», electricity +1d6, ½ on a partial
 * success, Камікадзе +2). Enemies use their card's defence (module/rules/enemy-model.mjs), characters the rules engine's
 * (armour, psychic armour, species / perks / chems, manual defences), caravans their armour. The GM applies at once;
 * a player's press goes to the active GM through the system socket.
 * The summary (author, 2026-11-14): in the public chat mode everyone gets a short card — who was hit, −N / +N ОЗ, «вибуває»,
 * and the HP «до → після» only of characters and caravans (players see those bars anyway) — and the GMs get the full one
 * whispered (enemies' HP, armour, defences, every step). In the other modes the full card follows the mode as before.
 */
import { resolveHit } from "../rules/battle.mjs";
import { targetProfile as profileOf } from "../rules/target-profile.mjs";
import { battleType } from "./enemy-attack.mjs";
import { postChat, isPublicMode } from "./chat.mjs";

const SOCKET = () => `system.${game.system.id}`;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const int = (v, d = 0) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? n : d; };

/** Apply one card's damage to tokens (GM side); returns the summary lines */
/**
 * The tokens a damage goes to (author, 2026-11-14): the GM's selected tokens (the tracker's «Обрати ціллю»), or the targets
 * when none are selected; a player's targets (players can't select others' tokens)
 */
export function chosenTokens() {
  const sel = game.user.isGM ? (canvas?.tokens?.controlled ?? []) : [];
  const list = sel.length ? sel : [...game.user.targets];
  return list.map((t) => t.document.uuid);
}

/** Heal tokens by `amount` up to their maximum (the tracker's trHealCore); returns the summary lines */
export async function applyHeal(tokenUuids, amount, { head = "" } = {}) {
  const lines = [];
  for (const uuid of tokenUuids) {
    const tok = await fromUuid(uuid);
    const actor = tok?.actor;
    if (!actor || !actor.system?.hp) continue;
    const hp0 = int(actor.system.hp.value), max = int(actor.system.hp.max, hp0);
    const hp = Math.min(max, hp0 + Math.max(0, int(amount))); // never below 0 (the general rule)
    if (hp !== hp0) await actor.update({ "system.hp.value": hp });
    const name = esc(tok.name || actor.name);
    lines.push({
      full: `<li><b>${name}</b>: +${hp - hp0} ОЗ · ОЗ ${hp0} → ${hp}</li>`,
      short: `<li><b>${name}</b>: +${hp - hp0} ОЗ${hpOpen(actor) ? ` · ОЗ ${hp0} → ${hp}` : ""}</li>`,
    });
  }
  const card = (ls, gmNote = "") => `<div class="pust-chat pust-dmgapply pust-healapply"><h4><i class="fa-solid fa-kit-medical"></i> Лікування${head ? `: ${esc(head)}` : ""}${gmNote}</h4><ul>${ls.join("")}</ul></div>`;
  await postSplit("Лікування", lines, card);
  return lines.length;
}

/** HP everyone may see: characters' and caravans' (their bars are open to all), not enemies' */
const hpOpen = (actor) => actor?.type === "character" || actor?.type === "caravan";

/**
 * The summary to chat: in the public mode a short card for all and the full one whispered to the GMs; otherwise the full
 * card in the chat's mode (GM only, blind, self)
 */
async function postSplit(alias, lines, card) {
  if (!lines.length) return;
  const full = lines.map((l) => l.full), short = lines.map((l) => l.short);
  if (!isPublicMode()) return postChat({ speaker: { alias }, content: card(full) });
  await postChat({ speaker: { alias }, content: card(short) });
  // nothing more to tell the GM when the short card already says it all
  if (full.join("") === short.join("")) return;
  const CM = ChatMessage.implementation;
  await CM.create({ speaker: { alias }, whisper: CM.getWhisperRecipients("GM").map((u) => u.id), content: card(full, ` <small class="pust-gmonly" title="Бачить лише Доглядач">· розпис для Доглядача</small>`) });
}

export async function applyDamage(tokenUuids, data, { partial = false, head = "" } = {}) {
  const lines = [];
  const type = battleType(data.type);
  const rollD6 = () => new Roll("1d6").evaluateSync().total;
  for (const uuid of tokenUuids) {
    const tok = await fromUuid(uuid);
    const actor = tok?.actor;
    const prof = profileOf(actor);
    if (!prof) continue;
    const hp0 = int(actor.system.hp?.value), max = int(actor.system.hp?.max, hp0);
    // one rule for every hit (module/rules/battle.mjs resolveHit): parts by type, Камікадзе once, nothing below 0
    const hit = { ...data, type, parts: Array.isArray(data.parts) ? data.parts.map((x) => ({ ...x, type: battleType(x.type) })) : undefined };
    const r = resolveHit(prof, hp0, max, hit, { partial, rollD6 });
    const hp = r.hp, steps = r.steps;
    if (hp !== hp0) await actor.update({ "system.hp.value": hp });
    const name = esc(tok.name || actor.name);
    const out = r.out ? " · <b>вибуває</b>" : "";
    const delta = hp >= hp0 && r.heal ? `+${hp - hp0} ОЗ` : `−${hp0 - hp} ОЗ`;
    lines.push({
      full: `<li><b>${name}</b>: ${delta}${r.heal ? ` (лікує ${r.heal})` : ""} · ОЗ ${hp0} → ${hp}${out}${steps.length ? `<br><small>${esc(steps.join(" · "))}</small>` : ""}</li>`,
      // the short line: no steps (armour, defences); HP only where everyone sees them
      short: `<li><b>${name}</b>: ${delta}${hpOpen(actor) ? ` · ОЗ ${hp0} → ${hp}` : ""}${out}</li>`,
    });
  }
  const card = (ls, gmNote = "") => `<div class="pust-chat pust-dmgapply"><h4><i class="fa-solid fa-burst"></i> Шкода${head ? `: ${esc(head)}` : " застосована"}${partial ? " (частковий успіх)" : ""}${gmNote}</h4><ul>${ls.join("")}</ul></div>`;
  await postSplit("Шкода", lines, card);
  return lines.length;
}

/**
 * «Завдати виділеним» (author, 2026-11-14: a button in «Зробити перевірку» and on an enemy's attack, not in chat):
 * the damage goes to the selected tokens (or the targets); the GM applies it, a player's press goes to the active GM.
 * @param {{total:number, type:string, ignoreArmor?:boolean, ignoreN?:number, poison?:number}} data
 * @returns {Promise<boolean>} false when there was nobody to hit
 */
export async function sendDamage(data, { partial = false, head = "" } = {}) {
  const targets = chosenTokens();
  if (!targets.length) {
    ui.notifications.warn(game.user.isGM ? "Спершу виділи токени (клік, Shift+клік, рамка або «Обрати всіх» у зоні) чи познач цілі (T)." : "Спершу познач цілі (T над токеном).");
    return false;
  }
  if (game.user.isGM) { await applyDamage(targets, data, { partial, head }); return true; }
  if (!game.users.activeGM) { ui.notifications.warn("Шкоду застосовує Доглядач, а його зараз немає в грі."); return false; }
  game.socket.emit(SOCKET(), { op: "applyDamage", targets, data, partial, head, from: game.user.id });
  ui.notifications.info("Запит надіслано Доглядачеві.");
  return true;
}

/** Wiring (wastelanders.mjs, ready): the GM's socket for the players' requests */
export function readyApplyDamage() {
  game.socket.on(SOCKET(), (msg) => {
    if (!game.users.activeGM?.isSelf) return;
    if (msg?.op === "applyDamage") applyDamage(msg.targets || [], msg.data || {}, { partial: !!msg.partial, head: String(msg.head || "") });
  });
}
