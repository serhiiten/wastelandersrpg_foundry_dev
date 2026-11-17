/**
 * «На ціль» (author, 2026-11-15): «Вжити» of a gear row, but on the user's ONE target (T).
 * Order: check (nothing is changed) → the user's dose is spent → the effect lands on the target. A refusal found by the check
 * (the target's rules say no, nothing to heal, a machine / living mismatch) spends nothing and says why.
 *   – a player character: the target's own rules engine takes a copy of the dose (effect, daily limits, addiction, super-stimpak
 *     dice, species), by `useCopyOn`; the booster's attribute is the user's choice in the row;
 *   – enemy / caravan: only healing, through `applyHeal` (apply-damage.mjs: HP flash, «unconscious», the chat card);
 *   – who writes: the user spends their own dose; the target's side is written by the user when they own it, else by the
 *     active GM over the system socket (a player can't update someone else's actor).
 * Pure decisions: module/rules/chem-target.mjs.
 */
import { activeGmHere } from "../helpers/main-window.mjs";
import { DRUGS, OFFICIAL_DRUGS, boosterAttr, drugOf, registerCustomDrugs } from "../rules/core.mjs";
import { createLogic } from "../rules/logic.mjs";
import { ROBOT_FOLDER, isMachineName, planHeal, spendDose, useCopyOn } from "../rules/chem-target.mjs";
import { applyHeal, clearTargets } from "./apply-damage.mjs";
import { readState, runAction } from "./character-actions.mjs";
import { postChat } from "./chat.mjs";
import { askGM, answerGM } from "../helpers/gm-request.mjs";
import { notify } from "../helpers/notify.mjs";

const SOCKET = () => `system.${game.system.id}`;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const warn = (m) => notify.warn(m);

/** Is this enemy a machine: a machine word in the name, or its compendium source sits in the folder «Роботи» */
export async function enemyIsMachine(actor, tokenName = "") {
  if (isMachineName(actor?.name) || isMachineName(tokenName)) return true;
  const src = actor?._stats?.compendiumSource;
  if (!src) return false;
  try {
    const { collection, id } = foundry.utils.parseUuid(src);
    const pack = collection?.index ? collection : game.packs.get(String(collection?.collection ?? collection));
    if (!pack) return false;
    const idx = await pack.getIndex({ fields: ["folder", "name"] });
    const e = idx.get(id);
    if (!e) return false;
    if (isMachineName(e.name)) return true;
    let f = e.folder ? pack.folders.get(e.folder?.id ?? e.folder) : null;
    while (f?.folder) f = pack.folders.get(f.folder.id ?? f.folder);
    return f?.name === ROBOT_FOLDER;
  } catch (err) {
    return false;
  }
}

/** Runs the dose on a state with a toast collector; returns what the engine said. Nothing is saved here */
function dryRun(actor, row) {
  const st = readState(actor);
  const msgs = [];
  const L = createLogic({ st, toast: (m) => m && msgs.push(m) });
  const ok = useCopyOn(st, L, row);
  return { ok, msgs, last: st.chem?.last || "" };
}

/** The card for a character's dose: who gave what to whom and what the target's rules made of it */
function pcCard(giver, key, target, last) {
  let text = String(last || "").startsWith(key + ". ") ? String(last).slice(key.length + 2) : String(last || "");
  // the engine's line about the row it used up speaks of the dose's copy, not of anyone's gear
  text = text.replace(/\s*Це була остання[^.]*\./g, "").trim();
  return `<div class="pust-chat pust-dmgapply pust-healapply"><div class="pust-da-hd"><i class="fa-solid fa-syringe"></i><span class="pust-da-title">${esc(key)}: ${esc(giver)} → ${esc(target)}</span></div><div class="pust-da-text">${esc(text)}</div></div>`;
}

/** The target's side for a player character (whoever writes it: the user or the GM) */
async function applyOnPc(targetUuid, row, giver, def) {
  const actor = await fromUuid(targetUuid);
  if (!actor || actor.type !== "character") return false;
  if (def && !OFFICIAL_DRUGS.has(row.n)) { const k = drugOf(row.n); if (k) DRUGS[k] = def; }
  const res = await runAction(actor, (st, L) => {
    registerCustomDrugs(st);
    const ok = useCopyOn(st, L, row);
    return { ok, last: st.chem?.last || "" };
  }, { quiet: true });
  if (!res?.ok) { warn(`«${row.n}»: ${actor.name} не прийняв дозу.`); return false; }
  await postChat({ speaker: { alias: "Хімія" }, content: pcCard(giver, drugOf(row.n) || row.n, actor.name, res.last) });
  return true;
}

/** Wiring (wastelanders.mjs, ready): the GM's socket for the players' requests */
export function readyChemTarget() {
  game.socket.on(SOCKET(), async (msg) => {
    if (!activeGmHere()) return;
    if (msg?.op === "chemOnPc") await answerGM(msg, () => applyOnPc(String(msg.target), msg.row || {}, String(msg.giver || ""), msg.def));
    else if (msg?.op === "chemHeal") await answerGM(msg, () => applyHeal([String(msg.token)], Number(msg.amount) || 0, { head: String(msg.head || "") }));
  });
}

/**
 * The «На ціль» button of the gear row `i` of `giverActor`.
 * @returns {Promise<boolean>} true when the dose went to the target
 */
export async function useOnTarget(giverActor, i) {
  const targets = [...(game.user.targets ?? [])].filter((t) => t?.document);
  if (targets.length !== 1) { warn("Познач ціллю (T) рівно одного — того, на кого застосувати."); return false; }
  const tok = targets[0].document;
  const target = tok.actor;
  if (!target) { warn("У цілі немає персонажа чи супротивника."); return false; }

  const gst = readState(giverActor);
  registerCustomDrugs(gst);
  const o = gst.other[i];
  const key = o && drugOf(o.n);
  const D = key && DRUGS[key];
  if (!D) { warn("Це не медикамент."); return false; }
  const q = parseInt(o.q, 10);
  if (!Number.isNaN(q) && q <= 0) { warn("Цієї речі не лишилося."); return false; }
  const row = { n: o.n };
  if (D.booster) {
    const attr = boosterAttr(o);
    if (!attr) { warn("Обери в рядку, який атрибут підсилює бустер."); return false; }
    row.attr = attr;
  }
  const canWrite = game.user.isGM || target.isOwner;
  if (!canWrite && !game.users.activeGM) { warn("Дозу на чужу ціль застосовує Доглядач, а його зараз немає в грі."); return false; }
  const giver = giverActor.name;
  const def = OFFICIAL_DRUGS.has(key) ? undefined : JSON.parse(JSON.stringify(D));

  // 1) the check: nothing is spent while the target's rules refuse
  let healPlan = null;
  if (target.type === "character") {
    const r = dryRun(target, row);
    if (!r.ok) { warn(r.msgs[0] || `«${key}» на ${target.name} не діє.`); return false; }
  } else if (target.type === "enemy" || target.type === "caravan") {
    const machine = target.type === "enemy" ? await enemyIsMachine(target, tok.name) : true;
    healPlan = planHeal(key, D, {
      kind: target.type, machine, vehicle: target.system?.vehicle,
      hp: target.system?.hp?.value, max: target.system?.hp?.max,
    }, (s) => new Roll(`1d${s}`).evaluateSync().total);
    if (!healPlan.ok) { warn(healPlan.reason); return false; }
  } else { warn("На цю ціль нічого не подіє."); return false; }

  // 2) the user's dose
  const spent = await runAction(giverActor, (st) => { registerCustomDrugs(st); return spendDose(st, i); }, { quiet: true });
  if (spent === "empty") { warn("Цієї речі не лишилося."); return false; }

  // 3) the target's side
  if (target.type === "character") {
    if (canWrite) await applyOnPc(target.uuid, row, giver, def);
    else askGM({ op: "chemOnPc", target: target.uuid, row, giver, def }, "Доза на ціль", "Дозу витрачено, але на ціль вона не подіяла.");
  } else {
    const head = `${healPlan.label} (${giver})`;
    if (canWrite) await applyHeal([tok.uuid], healPlan.amount, { head });
    else askGM({ op: "chemHeal", token: tok.uuid, amount: healPlan.amount, head }, "Доза на ціль", "Дозу витрачено, але на ціль вона не подіяла.");
  }
  clearTargets();
  return true;
}
