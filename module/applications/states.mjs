/**
 * The states enemies' moves put on characters and enemies (author, 2026-11-20; Fable's verdict, docs/decisions/battle.md
 * «Automate enemies' moves», stage 2): put them on (the aspect and `flags.<system>.states`), tick them at ▶ «Коло дій» (one
 * card a round), take them off at «Кінець сцени». The GM only. The table and the rules: module/rules/states.mjs.
 */
import { STATES, putState, tickStates, immuneTo, stunnedBefore, markStunned, stateWords } from "../rules/states.mjs";
import { targetProfile } from "../rules/target-profile.mjs";
import { dropCovers, isCoverText } from "../rules/cover.mjs";
import { applyDamage, statesOf, postSplit, applyCard } from "./apply-damage.mjs";
import { isPublicMode } from "./chat.mjs";
import { chatType } from "../rules/battle.mjs";
import { groupCharacters } from "./group-end.mjs";
import { sharedGet } from "../helpers/scene-shared.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sys = () => game.system.id;
const round = () => Math.max(1, Number(sharedGet("round")) || 1);

/** The chip of a card only the GMs see (apply-damage.mjs postSplit's) */
export const GM_CHIP = `<span class="pust-da-chip gm" title="Бачить лише Доглядач"><i class="fa-solid fa-eye-slash"></i>Доглядачу</span>`;

/**
 * A card whispered to the GMs (author, 2026-11-20: the hidden enemies' rows stay off the public cards), the way
 * apply-damage.mjs postSplit whispers its full card. @param {object} speaker @param {string} content
 */
export function whisperGM(speaker, content) {
  const CM = ChatMessage.implementation;
  return CM.create({ speaker, whisper: CM.getWhisperRecipients("GM").map((u) => u.id), content });
}

/** Is this token's row for the GMs only: a hidden token while the chat's mode is public (another mode posts as before) */
export const hiddenRow = (tok, pub = isPublicMode()) => pub && !!tok?.hidden;

/** A target by uuid: {tok, actor} (a token or an actor) */
async function docOf(uuid) {
  const d = await fromUuid(uuid);
  if (d?.documentName === "Actor") return { tok: null, actor: d };
  return { tok: d, actor: d?.actor ?? null };
}

/** The actor's aspects with a state's aspect added / removed: the update for its own list */
function aspectUpdate(actor, add = [], drop = []) {
  const texts = (x) => STATES[x]?.aspect;
  const adds = add.map(texts).filter(Boolean), drops = new Set(drop.map(texts).filter(Boolean));
  if (actor.type === "character") {
    const list = (actor.system.situational ?? []).map((a) => ({ name: a.name, invoked: a.invoked }));
    const next = list.filter((a) => !drops.has(a.name));
    for (const t of adds) if (!next.some((a) => a.name === t)) next.push({ name: t, invoked: 0 }); // no free invoke (author)
    return { "system.situational": next };
  }
  const list = (actor.system.aspects ?? []).map((a) => ({ t: a.t, inv: a.inv }));
  const next = list.filter((a) => !drops.has(a.t));
  for (const t of adds) if (!next.some((a) => a.t === t)) next.push({ t, inv: 0 });
  return { "system.aspects": next };
}

/**
 * Put states on targets.
 * @param {string[]} uuids tokens (or actors) @param {{key:string, dice?:string, left?:number, type?:string, ignoreArmor?:boolean}[]} list
 * @param {{by?:string, byName?:string, once?:boolean}} o `by` the attacker's token uuid; `once` — the stun «лише раз за сцену»
 * @returns {Promise<string[]>} the card's lines: «Волті: «Збитий з ніг»», «Волті не можна збити з ніг»
 */
export async function putStates(uuids, list, { by = "", byName = "", once = false } = {}) {
  const lines = [];
  if (!list?.length) return lines;
  for (const uuid of uuids) {
    const { tok, actor } = await docOf(uuid);
    if (!actor || !["character", "enemy"].includes(actor.type)) {
      if (actor) lines.push(`${tok?.name || actor.name}: ${list.map((s) => stateWords(s)).join(", ")} — вирішуй сам.`); // a caravan
      continue;
    }
    const name = tok?.name || actor.name;
    const prof = targetProfile(actor);
    let states = statesOf(actor);
    let onceFlag = actor.getFlag(sys(), "statesOnce") ?? {};
    const put = [], immune = [];
    for (const s of list) {
      if (immuneTo(s.key, prof)) { immune.push(s.key); continue; }
      if (s.key === "stunned" && once && stunnedBefore(onceFlag, by)) { immune.push("stunnedOnce"); continue; }
      states = putState(states, s.key, { ...s, by, byName, round: round() });
      if (s.key === "stunned" && once) onceFlag = markStunned(onceFlag, by);
      put.push(s.key);
    }
    if (put.length) {
      await actor.update({ ...aspectUpdate(actor, put), [`flags.${sys()}.states`]: states, ...(once ? { [`flags.${sys()}.statesOnce`]: onceFlag } : {}) });
      lines.push(`${name}: ${put.map((k) => stateWords(states.find((s) => s.key === k))).join(", ")}.`);
    }
    const IMM = { roar: "неживий, рев не діє", down: "не можна збити з ніг", stunned: "не можна приголомшити", disarmed: "не можна обеззброїти", poisoned: "невразливий до отрут", burning: "невразливий до вогню", bleeding: "неживий, не кровоточить", stunnedOnce: "цієї сцени вже приголомшено" };
    for (const k of immune) lines.push(`${name}: ${IMM[k] ?? "стан не діє"}.`);
  }
  return lines;
}

/** The scene's actors that may carry states: its tokens (a linked actor once) and the group's characters without a token */
function carriers(scene) {
  const seen = new Set(), out = [];
  for (const t of scene?.tokens ?? []) {
    const a = t.actor;
    if (!a || !["character", "enemy"].includes(a.type)) continue;
    const key = t.actorLink ? a.uuid : t.uuid;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ uuid: t.uuid, tok: t, actor: a });
  }
  for (const a of groupCharacters()) if (!seen.has(a.uuid)) { seen.add(a.uuid); out.push({ uuid: a.uuid, tok: null, actor: a }); }
  return out;
}

/** A grab's holder still stands on the scene with HP above 0 */
function holderOk(scene, uuid) {
  const t = uuid ? scene?.tokens.find((x) => x.uuid === uuid) : null;
  return !!t?.actor && Number(t.actor.system.hp?.value) > 0;
}

/**
 * ▶ «Коло дій» to round `r` (battle-panel.mjs stepRound): every state ticks once (rules/states.mjs tickStates), the damage
 * goes through applyDamage (no `lastHit`), one card for the round.
 */
export async function tickRound(r) {
  if (!game.user.isGM) return;
  const scene = canvas?.scene;
  const pub = isPublicMode();
  // a hidden token's rows go to the GMs in a whisper (author, 2026-11-20)
  const open = { rows: [], said: [] }, hid = { rows: [], said: [] };
  for (const { uuid, tok, actor } of carriers(scene)) {
    const { rows, said } = hiddenRow(tok, pub) ? hid : open;
    // «Прикритий: …» (П3 3.2) lasts its round: every cover goes at ▶ (one given now is the next round's only after it)
    if (actor.type === "character") {
      const c = dropCovers(actor.system.situational);
      if (c.gone.length) {
        await actor.update({ "system.situational": c.list });
        for (const t of c.gone) said.push(`${tok?.name || actor.name}: аспект «${t}» зник.`);
      }
    }
    const flag = actor.getFlag(sys(), "states");
    if (!Array.isArray(flag) || !flag.length) continue;
    const active = statesOf(actor);
    const t = tickStates(active, r, { holderOk: (by) => holderOk(scene, by) });
    const name = tok?.name || actor.name;
    // the flag keeps only the states in force: an aspect deleted by its player ends its state here too
    const changed = JSON.stringify(t.next) !== JSON.stringify(flag);
    if (changed || t.gone.length) await actor.update({ ...(t.gone.length ? aspectUpdate(actor, [], t.gone) : {}), [`flags.${sys()}.states`]: t.next });
    if (t.skip) said.push(`${name} приголомшений: пропускає цю дію.`);
    for (const h of t.hits) {
      if (Number(actor.system.hp?.value) <= 0) break;
      const roll = await new Roll(h.dice).evaluate({ allowInteractive: false });
      const head = `${STATES[h.key].aspect} (${h.dice} = ${roll.total})`;
      await applyDamage([uuid], { total: Math.max(0, roll.total), dice: roll.dice.reduce((n, d) => n + d.number, 0), type: chatType(h.type), ignoreArmor: !!h.ignoreArmor, ignoreN: 0 }, { head, noLastHit: true, collect: rows });
      // the row names the state: put it in the row's name line
      const last = rows.at(-1);
      if (last) { last.full = last.full.replace('<span class="pust-da-name">', `<span class="pust-da-name">${esc(head)} · `); last.short = last.short.replace('<span class="pust-da-name">', `<span class="pust-da-name">${esc(head)} · `); }
    }
    for (const k of t.gone) said.push(`${name}: аспект «${STATES[k].aspect}» зник.`);
  }
  const notes = (said) => said.map((l) => `<div class="pust-da-note">${esc(l)}</div>`).join("");
  if (open.rows.length || open.said.length) {
    const extra = notes(open.said);
    const card = (ls, gmNote = "") => applyCard({ icon: "fa-hourglass-half", title: `Стани: коло ${r}`, chips: gmNote, rows: [...ls, extra] });
    await postSplit("Стани", open.rows.length ? open.rows : [{ full: "", short: "" }], card);
  }
  if (hid.rows.length || hid.said.length) {
    await whisperGM({ alias: "Стани" }, applyCard({ icon: "fa-hourglass-half", title: `Стани: коло ${r}`, chips: GM_CHIP, rows: [...hid.rows.map((l) => l.full), notes(hid.said)] }));
  }
}

/**
 * «Кінець сцени» (and the day's, the session's): every state, the stun marks, the last kill and the allies' bonus are gone, and every standard
 * aspect (rules/states.mjs STATES: the states' and the quick ones, put on by a move or by hand) on characters and enemies;
 * the situational aspects typed by hand stay (author, 2026-11-20)
 */
export async function clearAllStates(scene = canvas?.scene) {
  if (!game.user.isGM) return [];
  const out = [];
  for (const { tok, actor } of carriers(scene)) {
    const f = actor.flags?.[sys()] ?? {};
    const states = Array.isArray(f.states) ? f.states : [];
    // every standard aspect goes too, the states' and the same words added by hand («Збитий з ніг» of the quick aspects…);
    // the other situational aspects stay (author, 2026-11-20)
    const texts = actor.type === "character" ? (actor.system.situational ?? []).map((x) => x.name) : (actor.system.aspects ?? []).map((x) => x.t);
    const drop = Object.keys(STATES).filter((k) => texts.includes(STATES[k].aspect));
    // «Прикритий: …» (П3 3.2) goes too
    const covers = actor.type === "character" ? texts.filter(isCoverText) : [];
    if (!states.length && !drop.length && !covers.length && !f.statesOnce && !f.lastKill && !f.buffs && !f.cover) continue;
    const upd = { ...(drop.length ? aspectUpdate(actor, [], drop) : {}) };
    if (covers.length) upd["system.situational"] = dropCovers(upd["system.situational"] ?? actor.system.situational).list;
    for (const k of ["states", "statesOnce", "lastKill", "buffs", "cover"]) if (f[k] !== undefined) upd[`flags.${sys()}.${k}`] = _del; // not «-=» (deprecated since Foundry 14)
    await actor.update(upd);
    if (drop.length || covers.length) out.push({ actor, name: tok?.name || actor.name, img: tok?.texture?.src || actor.img, gone: [...drop.map((k) => STATES[k].aspect), ...covers], hidden: !!tok?.hidden });
  }
  return out; // [{actor, name, img, gone: [aspect texts], hidden: a hidden token's}]
}

/**
 * The roar's −2 (rules/states.mjs `until: "check"`; author, 2026-11-20): the penalty of a character's next check, or null.
 * @returns {{n:number, aspect:string}|null}
 */
export function checkPenalty(actor) {
  const s = statesOf(actor).find((x) => STATES[x.key]?.until === "check");
  return s ? { n: STATES[s.key].check, aspect: STATES[s.key].aspect } : null;
}

/** After the check: the state and its aspect go (the roller owns the character, so it may write it; actor.mjs #sweepStates) */
export async function spendCheckStates(actor) {
  const keys = statesOf(actor).filter((x) => STATES[x.key]?.until === "check").map((x) => x.key);
  if (!keys.length) return false;
  const rest = (actor.getFlag(sys(), "states") ?? []).filter((x) => !keys.includes(x.key));
  await actor.update({ ...aspectUpdate(actor, [], keys), [`flags.${sys()}.states`]: rest });
  return true;
}
