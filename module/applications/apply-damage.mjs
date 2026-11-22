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
import { afterHit, moveSpec, moveMarks, favFoeBonus } from "../rules/move-spec.mjs";
import { activeStates, withStates } from "../rules/states.mjs";
import { battleType } from "./enemy-attack.mjs";
import { postChat, isPublicMode } from "./chat.mjs";
import { askGM, answerGM } from "../helpers/gm-request.mjs";
import { notify } from "../helpers/notify.mjs";
import { rollDie } from "../helpers/dice.mjs";
import { deferSuperDice } from "./caravan-superdice.mjs";
import { cleanFx } from "../rules/attack-effects.mjs";
import { splitError, splitHit } from "../rules/damage-split.mjs";
import { blastPlan, directedHalf, DIRECTED } from "../rules/grenade-fail.mjs";

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
    // a hidden token's row only on the GM's card (author, 2026-11-20)
    lines.push({ full: targetRow({ ...row, showHp: true }), short: tok?.hidden ? "" : targetRow({ ...row, showHp: hpOpen(actor) }) });
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
export function applyCard({ heal = false, dt = "", icon, title, chips = "", rows }) {
  // a damage card's header in its damage type's chip colours (author, 2026-11-15; .dt-* in css/pust-check.css)
  return `<div class="pust-chat pust-dmgapply${heal ? " pust-healapply" : ""}${dt ? ` pust-da-typed dt-${dt}` : ""}"><div class="pust-da-hd"><i class="fa-solid ${icon}"></i><span class="pust-da-title">${title}</span>${chips}</div>`
    + `<div class="pust-da-list">${rows.join("")}</div></div>`;
}

/**
 * The summary to chat: in the public mode a short card for all and the full one whispered to the GMs; otherwise the full
 * card in the chat's mode (GM only, blind, self)
 */
export async function postSplit(alias, lines, card) {
  if (!lines.length) return;
  const full = lines.map((l) => l.full), short = lines.map((l) => l.short);
  if (!isPublicMode()) return postChat({ speaker: { alias }, content: card(full, "", true) });
  // rows with no short line are the GM's only (a hidden token's — author, 2026-11-20): no public card when none is left
  if (short.some(Boolean) || !full.some(Boolean)) await postChat({ speaker: { alias }, content: card(short) });
  // nothing more to tell the GM when the short card already says it all
  if (full.join("") === short.join("")) return;
  const CM = ChatMessage.implementation;
  await CM.create({ speaker: { alias }, whisper: CM.getWhisperRecipients("GM").map((u) => u.id), content: card(full, `<span class="pust-da-chip gm" title="Бачить лише Доглядач"><i class="fa-solid fa-eye-slash"></i>Доглядачу</span>`, true) });
}

/** The states in force on an actor (rules/states.mjs): the flag's records whose aspect is still on it */
export function statesOf(actor) {
  const flag = actor?.getFlag?.(game.system.id, "states");
  if (!Array.isArray(flag) || !flag.length) return [];
  const texts = actor.type === "character" ? (actor.system.situational ?? []).map((a) => a.name) : (actor.system.aspects ?? []).map((a) => a.t);
  return activeStates(flag, texts);
}

/** The hit's target profile with its states (the acid's −2 armour) */
const stateProfile = (actor) => withStates(profileOf(actor), statesOf(actor));

/**
 * The moves of an enemy that act when it falls (author, 2026-11-20: a hint on the damage card and a button): their names,
 * not yet used this scene. `when`: "down" or "kill".
 */
function triggerMoves(actor, when) {
  return (actor?.system?.moves ?? []).filter((m, i) => {
    const spec = moveSpec(m, actor.system, i);
    return spec.level === "trigger" && spec.button && spec.when === when && !moveMarks(m, spec).blocked;
  }).map((m) => m.n);
}

/**
 * The damage to the targets.
 * @param {object} [o] `source` — the attacker's token uuid («Розпад», «На прицілі»); `noLastHit` — a state's tick, not a hit
 *   undo may take back; `collect` — an array: the rows go there and no card is posted (the round's states card); `avoid` — a
 *   partial avoidance (10–14) of an enemy's hit, one more «½» (rules/dodge.mjs); `report` — an array: {uuid, hp0, hp, damage}
 *   a target; `split` — a character's attack split between its targets (A8; rules/damage-split.mjs): `{shares: {uuid: n},
 *   one, fxIgnore}`, each target its share, a share of 0 no hit at all (the effects still go to the named one)
 */
export async function applyDamage(tokenUuids, data, { partial = false, dodge = false, avoid = false, head = "", source = "", noLastHit = false, collect = null, report = null, split = null, half = [], halfWhy = "", notes = [] } = {}) {
  const lines = [];
  const halfSet = new Set(Array.isArray(half) ? half : []);
  const src = source ? await targetOf(source) : null;
  const killed = [], wounded = [], woundedHid = [];
  const type = battleType(data.type);
  const rollD6 = () => rollDie(6); // the electricity bonus; not Roll#evaluateSync, which Foundry 14 refuses for dice (helpers/dice.mjs)
  for (const uuid of tokenUuids) {
    const { tok, actor } = await targetOf(uuid);
    const prof = stateProfile(actor);
    if (!prof) continue;
    // A8: this target's share of a split hit; a share of 0 is no hit (Fable: a hit of 0 would clear an enemy's last hit)
    const own = split ? splitHit(data, split, uuid) : data;
    if (!own) continue;
    const hp0 = int(actor.system.hp?.value), max = int(actor.system.hp?.max, hp0);
    // one rule for every hit (module/rules/battle.mjs resolveHit): parts by type, Камікадзе once, nothing below 0
    const hit = { ...own, type, parts: Array.isArray(own.parts) ? own.parts.map((x) => ({ ...x, type: battleType(x.type) })) : undefined };
    // «На прицілі» (author, 2026-11-20): the one who aimed deals it +2
    const aimed = source && statesOf(actor).some((s) => s.key === "aimed" && s.by === source);
    if (aimed) { if (hit.parts) hit.parts.push({ total: 2, type, dice: 0 }); else hit.total = int(hit.total) + 2; }
    // «Улюблений ворог» (author, 2026-11-20): the attacker deals a mutant +N
    const fav = src?.actor?.type === "enemy" && prof.mutant ? favFoeBonus(src.actor.system) : 0;
    if (fav) { if (hit.parts) hit.parts.push({ total: fav, type, dice: 0 }); else hit.total = int(hit.total) + fav; }
    // «Спрямована дія» (П3 3.4, author 2026-11-22): the thrower and the allies take one more «½» named by the perk
    const r = resolveHit(prof, hp0, max, hit, { partial, dodge, avoid, rollD6, half: halfSet.has(uuid) ? halfWhy : "" });
    let hp = r.hp, moveNote = "";
    const steps = r.steps;
    if (actor.type === "enemy") {
      // an enemy's moves after the hit (move-spec.mjs afterHit; author, 2026-11-19): «лишається живим з N ОЗ», the bonus past
      // its HP threshold, and the hit kept for «Захисний протокол» / «І куди його бити?» (a hit of 0 clears it) — one update
      const ah = afterHit(actor.system, hp0, hp, head);
      hp = ah.hp; moveNote = ah.note;
      const upd = {};
      if (hp !== hp0) upd["system.hp.value"] = hp;
      if (ah.moves) upd["system.moves"] = ah.moves;
      const key = `flags.${game.system.id}.lastHit`;
      if (noLastHit) { /* a state's tick: undo doesn't take it back, the last hit's record stays */ }
      else if (hp < hp0) upd[key] = { before: hp0, after: hp, head: String(head || "") };
      else if (actor.getFlag(game.system.id, "lastHit")) upd[`flags.${game.system.id}.lastHit`] = _del; // not «-=» (deprecated since Foundry 14, gone in 16)
      if (Object.keys(upd).length) await actor.update(upd);
    } else if (hp !== hp0) await actor.update({ "system.hp.value": hp });
    if (report) report.push({ uuid, hp0, hp, damage: r.damage });
    const name = esc(tok?.name || actor.name);
    const gain = hp >= hp0 && !!r.heal;
    // the move that kept the enemy alive is named on the card for everyone (author, 2026-11-19)
    // the move that added to the hit is named for everyone (no HP in it), like the one that kept an enemy alive
    const note = [r.heal ? `лікує ${esc(r.heal)}` : "", moveNote ? esc(moveNote) : "", fav ? esc(`+${fav} від «Улюблений ворог»`) : ""].filter(Boolean).join("; ");
    const row = { name, delta: gain ? hp - hp0 : hp0 - hp, gain, hp0, hp, max, out: !!r.out && hp <= 0, note };
    // the GM's hint (author, 2026-11-20): an enemy just fallen has a move that acts now
    const fell = hp <= 0 && hp0 > 0;
    const gm = [];
    if (fell && actor.type === "enemy") for (const n of triggerMoves(actor, "down")) gm.push(`Має хід «${esc(n)}»: «Використати» на картці ворога.`);
    if (fell && tok) killed.push(tok.uuid);
    if (r.damage >= 1 && Array.isArray(data.onHit) && data.onHit.length) (tok?.hidden ? woundedHid : wounded).push(uuid);
    if (aimed) steps.push("+2 на прицілі");
    if (fav) steps.push(`+${fav} «Улюблений ворог»`);
    const gmNote = gm.join(" ");
    // the short row (everyone): no steps (armour, defences); HP only where everyone sees them
    lines.push({ full: targetRow({ ...row, note: [note, gmNote].filter(Boolean).join(" "), showHp: true, steps }), short: tok?.hidden ? "" : targetRow({ ...row, showHp: hpOpen(actor) }) });
  }
  // «Розпад» (author, 2026-11-20): the attacker brought a target down — its move works on the zone of that target now
  if (killed.length && src?.actor?.type === "enemy" && triggerMoves(src.actor, "kill").length) {
    await src.actor.setFlag(game.system.id, "lastKill", { target: killed[0], at: Date.now() });
    const n = triggerMoves(src.actor, "kill").join("», «");
    lines.push({ full: `<div class="pust-da-note">${esc(`${src.tok?.name || src.actor.name} має хід «${n}»: «Використати» на його картці.`)}</div>`, short: "" });
  }
  // «Підпал» / «Кровотеча» of the attack's note: the ones it dealt at least 1 damage after armour (author, 2026-11-20)
  // a hidden one's state line only on the GM's card (author, 2026-11-20)
  if (wounded.length || woundedHid.length) {
    const { putStates } = await import("./states.mjs");
    const by = { by: source, byName: src?.tok?.name || src?.actor?.name || "" };
    for (const [list, open] of [[wounded, true], [woundedHid, false]]) {
      if (!list.length) continue;
      for (const l of await putStates(list, data.onHit, by)) { const h = `<div class="pust-da-note">${esc(l)}</div>`; lines.push({ full: h, short: open ? h : "" }); }
    }
  }
  // the attack's chosen effects (A2; author, 2026-11-20): states on their target(s), whatever the armour let through; said lines
  for (const n of notes) { const h = `<div class="pust-da-note">${esc(n)}</div>`; lines.push({ full: h, short: h }); }
  lines.push(...await effectLines(tokenUuids, data, source));
  if (collect) { collect.push(...lines); return lines.length; }
  // the full card's header also says what the dice gave, before armour and defences (author, 2026-11-15)
  const rolled = Number.isFinite(Number(data.total)) ? `<span class="pust-dmg-rolled" title="Скільки випало на кістках (з модифікаторами), до броні й стійкостей">випало <b>${Math.max(0, int(data.total))}</b></span>` : "";
  const card = (ls, gmNote = "", full = false) => applyCard({
    dt: chatType(type), icon: "fa-burst", title: `Шкода${head ? `: ${esc(head)}` : ""}`,
    chips: (partial ? `<span class="pust-da-chip">частковий успіх</span>` : "") + (dodge ? `<span class="pust-da-chip">½ шкоди</span>` : "") + (avoid ? `<span class="pust-da-chip">уникнення: ½</span>` : "") + (split ? `<span class="pust-da-chip" title="Шкоду атаки розподілено між цілями">розподілено</span>` : "") + (halfSet.size && halfWhy ? `<span class="pust-da-chip" title="Тобі й союзникам лише половина шкоди, з округленням угору">${esc(halfWhy)}: ½ своїм</span>` : "") + (full ? rolled : "") + gmNote, rows: ls,
  });
  await postSplit("Шкода", lines, card);
  return lines.length;
}

/**
 * The chosen effects of a character's attack (A2; rules/attack-effects.mjs): `data.fx` — states (only «Збитий з ніг», «Притиснутий вогнем»,
 * «Приголомшений», «Без зброї», only on the request's own targets: cleanFx), `data.said` — the effects done by hand, one line
 * each. A hidden one's state line is the GM's only. @returns {Promise<{full:string, short:string}[]>}
 */
async function effectLines(uuids, data, source = "") {
  const out = [];
  for (const t of (Array.isArray(data.said) ? data.said : []).slice(0, 4)) { const h = `<div class="pust-da-note">${esc(`Ефект: ${t}`)}</div>`; out.push({ full: h, short: h }); }
  // «Прикриваєш спільника» (A2; П3 3.2, author 2026-11-22): the ally (a character) gets the aspect «Прикритий: <who>» with 1
  // free invoke for its next avoidance in this round (rules/cover.mjs); the same one covering again adds nothing
  if (data.cover) {
    const { tok, actor } = await targetOf(String(data.cover));
    if (actor?.type === "character") {
      const { addCover } = await import("../rules/cover.mjs");
      const src = source ? await targetOf(source) : null;
      const byName = src?.tok?.name || src?.actor?.name || "";
      const c = addCover(actor.system.situational, byName);
      if (c.added) await actor.update({ "system.situational": c.list });
      const who = tok?.name || actor.name;
      const h = `<div class="pust-da-note">${esc(c.added ? `${who}: аспект «${c.text}», Посилення до наступного уникнення шкоди в цьому колі дій.`
        : `${who}: «${c.text}» уже є, друге прикриття в цьому колі не додається.`)}</div>`;
      out.push({ full: h, short: tok?.hidden ? "" : h });
    }
  }
  const fx = cleanFx(data.fx, uuids);
  if (!fx.length) return out;
  const { putStates } = await import("./states.mjs");
  const src = source ? await targetOf(source) : null;
  const by = { by: source, byName: src?.tok?.name || src?.actor?.name || "" };
  for (const { key, on } of fx) {
    for (const uuid of on) {
      const { tok } = await targetOf(uuid);
      for (const l of await putStates([uuid], [{ key }], by)) { const h = `<div class="pust-da-note">${esc(l)}</div>`; out.push({ full: h, short: tok?.hidden ? "" : h }); }
    }
  }
  return out;
}

/**
 * An effect without damage (A2: 10–14, «завдай шкоди або обери ефект»): the states and said lines on a card of their own.
 * Not through applyDamage with 0 (Fable): that would clear an enemy's last hit («Захисний протокол»).
 */
export async function applyEffects(tokenUuids, data, { head = "", source = "" } = {}) {
  const lines = await effectLines(tokenUuids, data, source);
  if (!lines.length) return 0;
  const card = (ls, gmNote = "") => applyCard({ icon: "fa-bolt", title: `Ефект${head ? `: ${esc(head)}` : ""}`, chips: gmNote, rows: ls });
  await postSplit("Ефект", lines, card);
  return lines.length;
}

/** «Застосувати ефект без шкоди» of «Зробити перевірку»: to the targets, through the GM as the damage goes */
export async function sendEffects(data, { head = "", source = "" } = {}) {
  const targets = chosenTokens();
  if (!targets.length) { warnNoTargets(); return false; }
  if (game.user.isGM) { await applyEffects(targets, data, { head, source }); clearTargets(); return true; }
  if (!game.users.activeGM) { notify.warn("Ефект застосовує Доглядач, а його зараз немає в грі."); return false; }
  askGM({ op: "applyEffects", targets, data, head, source }, "Ефект");
  clearTargets();
  return true;
}

/**
 * «Завдати цілям» (author, 2026-11-14: a button in «Зробити перевірку» and on an enemy's attack, not in chat):
 * the damage goes to the targets; the GM applies it, a player's press goes to the active GM.
 * @param {{total:number, type:string, ignoreArmor?:boolean, ignoreN?:number, poison?:number}} data
 * @returns {Promise<boolean>} false when there was nobody to hit
 */
export async function sendDamage(data, { partial = false, dodge = false, head = "", source = "", half = null } = {}) {
  const targets = chosenTokens();
  if (!targets.length) {
    warnNoTargets();
    return false;
  }
  // «Спрямована дія» (П3 3.4): `half(targets)` → the targets that take ½ (the thrower and the allies among them)
  const halves = typeof half === "function" ? half(targets) : [];
  const hw = halves.length ? DIRECTED : "";
  if (game.user.isGM) { await applyDamage(targets, data, { partial, dodge, head, source, half: halves, halfWhy: hw }); clearTargets(); return true; }
  if (!game.users.activeGM) { notify.warn("Шкоду застосовує Доглядач, а його зараз немає в грі."); return false; }
  askGM({ op: "applyDamage", targets, data, partial, dodge, head, source, half: halves, halfWhy: hw }, "Шкода");
  // no «Запит надіслано Доглядачеві» notice (author, 2026-11-15): the chat card shows the result
  clearTargets();
  return true;
}

/** Split hits already applied, by the request's id (A8; Fable: a double press or a lost answer must not hit twice) */
const SPLIT_DONE = new Set();

/**
 * A character's attack split between its targets (A8; author, 2026-11-21): the targets fixed when the damage was rolled, not
 * the current T. A bad split applies nothing (an error to the player, never full damage to all); the same `id` twice is
 * applied once. @param {{shares: Record<string, number>, one?: string, fxIgnore?: boolean}} split
 * @returns {Promise<boolean>} true when applied (for a player: when the GM answered that it was)
 */
export async function sendSplitDamage(data, { targets = [], split, id = "", partial = false, head = "", source = "" } = {}) {
  const err = splitError(split?.shares, targets, data?.total);
  if (err) { notify.warn(`Розподіл шкоди: ${err}. Нічого не застосовано.`); return false; }
  if (game.user.isGM) { await applySplit(targets, data, { split, id, partial, head, source }); return true; }
  if (!game.users.activeGM) { notify.warn("Шкоду застосовує Доглядач, а його зараз немає в грі."); return false; }
  // no answer in time is not «nothing applied»: the GM's game may still apply it (reviewer, author 2026-11-21); a second
  // press is safe, the GM applies one id once
  return askGM({ op: "applySplit", targets, data, split, id, partial, head, source }, "Шкода",
    "Шкоду може бути застосовано, щойно його гра відгукнеться: перш ніж тиснути вдруге, глянь, чи з'явилася її картка в чаті (вдруге та сама шкода однаково не пройде).");
}

/** The GM's side of a split hit: checked again, applied once an id */
async function applySplit(targets, data, { split, id = "", partial = false, head = "", source = "" }) {
  const err = splitError(split?.shares, targets, data?.total);
  if (err) throw new Error(`Розподіл шкоди: ${err}. Нічого не застосовано.`);
  if (id && SPLIT_DONE.has(id)) return;
  if (id) SPLIT_DONE.add(id);
  await applyDamage(targets, data, { partial, head, source, split: { shares: split.shares, one: String(split.one || ""), fxIgnore: !!split.fxIgnore } });
}

/**
 * A grenade or explosive on a failure (П3 3.4, author 2026-11-22): it goes off in the thrower's zone — everyone with HP there
 * takes the damage at once, no avoidance (the author: one's own blast). No token on the viewed scene or no zone under it
 * (answer 1 а): only the thrower, and the card says the rest is the GM's. «Спрямована дія»: the thrower and the characters ½.
 * @param {object} data the rolled damage, as sendDamage's
 * @param {{actor:string, source?:string, head?:string, directed?:boolean}} o `actor` the thrower's uuid, `source` its token
 */
export async function sendBlast(data, { actor, source = "", head = "", directed = false } = {}) {
  const msg = { data, actor, source, head, directed };
  if (game.user.isGM) { await applyBlast({ ...msg, from: game.user.id }); return true; }
  if (!game.users.activeGM) { notify.warn("Шкоду застосовує Доглядач, а його зараз немає в грі."); return false; }
  return askGM({ op: "applyBlast", ...msg }, "Вибух");
}

/** The GM's side of sendBlast: the sender must own the thrower; the zone is the token's own scene's */
async function applyBlast(msg) {
  const actor = await fromUuid(String(msg.actor || ""));
  if (!actor || actor.documentName !== "Actor") throw new Error("Немає персонажа, чия граната вибухнула.");
  const user = game.users.get(msg.from);
  if (!user || !actor.testUserPermission(user, "OWNER")) throw new Error("Вибух може завдати лише власник персонажа.");
  const tok = msg.source ? await fromUuid(String(msg.source)) : null;
  const own = tok?.documentName === "Token" && tok.actor?.id === actor.id ? tok : null;
  const scene = own?.parent ?? null;
  let zone = null, zoneName = "", tokens = [];
  if (own && scene) {
    const Z = await import("../canvas/battle-zones.mjs");
    const zones = Z.sceneZones(scene);
    const z = Z.zoneOfToken(own, zones);
    zone = z?.id ?? null;
    zoneName = z?.doc ? Z.zoneOf(z.doc)?.name ?? "" : "";
    tokens = [...scene.tokens].map((t) => ({ uuid: t.uuid, key: t.actorLink && t.actor ? t.actor.uuid : t.uuid, type: t.actor?.type ?? "",
      zone: Z.zoneOfToken(t, zones)?.id ?? null, hp: t.actor?.system?.hp?.value !== undefined }));
  }
  const plan = blastPlan(tokens, { selfToken: own?.uuid ?? "", selfActor: actor.uuid, zone });
  const types = new Map(tokens.map((t) => [t.uuid, t.type]));
  const hit = plan.targets.map((u) => ({ uuid: u, type: u === actor.uuid ? actor.type : types.get(u) ?? "" }));
  const half = directedHalf(hit, plan.self, !!msg.directed);
  const who = own?.name || actor.name;
  const notes = [plan.alone
    ? `${who}: граната вибухнула у своїй зоні, але токена на бойовій мапі (чи зони під ним) немає, тож шкоди зазнає лише сам персонаж. Решті в зоні Доглядач завдає шкоду вручну.`
    : `Граната вибухнула в зоні${zoneName ? ` «${zoneName}»` : ""}: шкоди зазнали всі, хто в ній, без уникнення.`];
  await applyDamage(plan.targets, msg.data || {}, { head: String(msg.head || ""), source: own?.uuid ?? "", half, halfWhy: half.length ? DIRECTED : "", notes });
}

/** Wiring (wastelanders.mjs, ready): the GM's socket for the players' requests */
export function readyApplyDamage() {
  game.socket.on(SOCKET(), (msg) => {
    if (!activeGmHere()) return;
    if (msg?.op === "applySplit") return answerGM(msg, () => applySplit(msg.targets || [], msg.data || {}, { split: msg.split, id: String(msg.id || ""), partial: !!msg.partial, head: String(msg.head || ""), source: String(msg.source || "") }));
    if (msg?.op === "applyEffects") return answerGM(msg, () => applyEffects(msg.targets || [], msg.data || {}, { head: String(msg.head || ""), source: String(msg.source || "") }));
    if (msg?.op === "applyBlast") return answerGM(msg, () => applyBlast(msg));
    if (msg?.op === "applyDamage") answerGM(msg, () => applyDamage(msg.targets || [], msg.data || {}, { partial: !!msg.partial, dodge: !!msg.dodge, head: String(msg.head || ""), source: String(msg.source || ""),
      half: Array.isArray(msg.half) ? msg.half.map(String) : [], halfWhy: msg.halfWhy ? DIRECTED : "" }));
  });
}
