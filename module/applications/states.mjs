/**
 * The states enemies' moves put on characters and enemies (author, 2026-11-20; Fable's verdict, docs/decisions/battle.md
 * «Automate enemies' moves», stage 2): put them on (the aspect and `flags.<system>.states`), tick them at ▶ «Коло дій» (one
 * card a round), take them off at «Кінець сцени». The GM only. The table and the rules: module/rules/states.mjs.
 */
import { STATES, putState, tickStates, immuneTo, stunnedBefore, markStunned, stateWords } from "../rules/states.mjs";
import { targetProfile } from "../rules/target-profile.mjs";
import { applyDamage, statesOf, postSplit, applyCard } from "./apply-damage.mjs";
import { chatType } from "../rules/battle.mjs";
import { groupCharacters } from "./group-end.mjs";
import { sharedGet } from "../helpers/scene-shared.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sys = () => game.system.id;
const round = () => Math.max(1, Number(sharedGet("round")) || 1);

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
    const IMM = { down: "не можна збити з ніг", stunned: "не можна приголомшити", disarmed: "не можна обеззброїти", poisoned: "невразливий до отрут", burning: "невразливий до вогню", bleeding: "неживий, не кровоточить", stunnedOnce: "цієї сцени вже приголомшено" };
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
  const rows = [], said = [];
  for (const { uuid, tok, actor } of carriers(scene)) {
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
  if (!rows.length && !said.length) return;
  const extra = said.map((l) => `<div class="pust-da-note">${esc(l)}</div>`).join("");
  const card = (ls, gmNote = "") => applyCard({ icon: "fa-hourglass-half", title: `Стани: коло ${r}`, chips: gmNote, rows: [...ls, extra] });
  if (rows.length) await postSplit("Стани", rows, card);
  else await postSplit("Стани", [{ full: "", short: "" }], card);
}

/** «Кінець сцени» (and the day's, the session's): every state, its aspect, the stun marks and the last kill are gone */
export async function clearAllStates(scene = canvas?.scene) {
  if (!game.user.isGM) return 0;
  let n = 0;
  for (const { actor } of carriers(scene)) {
    const f = actor.flags?.[sys()] ?? {};
    const states = Array.isArray(f.states) ? f.states : [];
    if (!states.length && !f.statesOnce && !f.lastKill) continue;
    const upd = { ...(states.length ? aspectUpdate(actor, [], states.map((s) => s.key)) : {}) };
    for (const k of ["states", "statesOnce", "lastKill"]) if (f[k] !== undefined) upd[`flags.${sys()}.-=${k}`] = null;
    await actor.update(upd);
    if (states.length) n++;
  }
  return n;
}


