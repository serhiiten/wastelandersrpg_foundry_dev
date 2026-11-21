/**
 * Run the HTML electronic sheet's rules on a Foundry character.
 *
 *   const st = readState(actor)                       → the HTML sheet's state for this actor
 *   await runAction(actor, (st, L) => L.doRest())     → run sheet logic, then save the result
 *   await saveState(actor, st)                        → write a changed state back (items by id)
 *
 * `L` is createLogic() bound to the state: drugs, rest, defenses, checks and damage from the HTML sheet.
 * Messages the HTML sheet shows as toasts go to Foundry notifications.
 */
import { addRepair, pruneConsRed } from "../rules/battle-health.mjs";
import { actorToState, mergeSystem, planSync } from "../rules/character-adapter.mjs";
import { compute, syncAuto } from "../rules/core.mjs";
import { createLogic } from "../rules/logic.mjs";
import { splitPrices, syncAddictionNotes, syncFavNotes, syncSharpNotes } from "../rules/prices.mjs";
import { adoptGrants } from "../rules/skill-sources.mjs";
import { resolveItem } from "./character-json.mjs";
import { notify } from "../helpers/notify.mjs";

/** Read an actor as HTML sheet state, with item ids so changes can be written back */
export function readState(actor) {
  // Foundry only: the price of gear lives in its own field («Вартість»), not at the start of the note
  const st = splitPrices(actorToState(actor.toObject(), { withIds: true }));
  if (!st.set?.free) adoptGrants(st, compute(st)); // older sheets: a skill-granting perk / feat names the skill it gave
  return st;
}

/** Rules logic bound to a state; toasts become notifications, unless the caller hands its own sink (U7: the sheet decides
 *  where its messages go, sheet-channels.mjs) */
export function logicFor(st, { ui = {}, quiet = false, toast: sink = null } = {}) {
  const toast = sink ? (msg, kind) => { if (!quiet && msg) sink(msg, kind); } : (msg, kind) => {
    if (quiet || !msg) return;
    if (kind === "bad") ui_notify("warn", msg);
    else ui_notify("info", msg);
  };
  return addRepair(createLogic({ st, toast, ui })); // «Ремонт» beside «Медична допомога» (author, 2026-11-21)
}

function ui_notify(level, msg) {
  notify[level]?.(msg);
}

/** Serialise saves per actor, so quick clicks don't interleave */
const queues = new Map();
function enqueue(actor, job) {
  const prev = queues.get(actor.uuid) || Promise.resolve();
  const next = prev.catch(() => {}).then(job);
  queues.set(actor.uuid, next);
  return next;
}

/** Write a changed state back to the actor: items updated in place, removed, or created from compendiums */
export function saveState(actor, st) {
  return enqueue(actor, () => writeState(actor, st));
}

/** The write itself (inside the actor's queue) */
async function writeState(actor, st) {
  const plan = planSync(actor.toObject(), st);
  if (plan.delete.length) await actor.deleteEmbeddedDocuments("Item", plan.delete, { render: false });
  if (plan.update.length) await actor.updateEmbeddedDocuments("Item", plan.update, { recursive: false, render: false });
  if (plan.create.length) {
    const data = [];
    const actorData = { system: plan.system };
    for (const it of plan.create) data.push(await resolveItem(it, actorData));
    // the species first: it brings its species properties
    const species = data.filter((i) => i.type === "species");
    const rest = data.filter((i) => i.type !== "species");
    if (species.length) await actor.createEmbeddedDocuments("Item", species, { render: false });
    if (rest.length) await actor.createEmbeddedDocuments("Item", rest, { render: false });
  }
  const system = mergeSystem(actor.system.toObject(), plan.system);
  await actor.update({ ...(plan.name && plan.name !== actor.name ? { name: plan.name } : {}), system }, { recursive: false });
}

/**
 * What the HTML sheet does on every redraw: automatic items (claws, psi strike, built-in weapon,
 * Vault gear, feat addictions, hands) and the knock-out check of chems.
 */
export function normalize(st, L) {
  syncAuto(st);
  L.chemKO();
  splitPrices(st); // gear just added (catalogue, starting gear) has its price in the note
  syncFavNotes(st); // «особлива, улюблена» follows the favourite weapon
  syncSharpNotes(st); // «гостра» lives in the weapon's note (Guns; author, 2026-11-15)
  syncAddictionNotes(st); // a chem's addiction chance is always in its note
  pruneConsRed(st); // a consequence gone takes its loss of max HP with it (A7; rules/battle-health.mjs)
  if (!st.set?.free) adoptGrants(st, compute(st)); // a skill-granting perk / feat names the skill it raised
}

/**
 * Run sheet logic on an actor and save the result.
 * @param {Actor} actor
 * @param {(st:object, L:object) => any} fn  changes `st` (directly or through L)
 * @param {object} [opts]  { ui: form choices for the logic (rest options…), quiet: no notifications }
 * @returns {Promise<any>} what fn returned
 */
export function runAction(actor, fn, opts = {}) {
  // read, change and write in one turn of the actor's queue (stress test, 2026-11-17): reading before the queue let two
  // quick presses both start from the same old state, so the second wrote over the first (4 × «−» took 3 HP)
  return enqueue(actor, async () => {
    const st = readState(actor);
    const L = logicFor(st, opts);
    const result = await fn(st, L);
    normalize(st, L);
    await writeState(actor, st);
    return result;
  });
}

/**
 * Everything the sheet shows that the rules calculate (attributes in play, limits, budgets, defenses,
 * chems, issues…). Pure read: nothing is saved.
 */
export function evaluate(actor) {
  const st = readState(actor);
  const d = compute(st);
  const L = logicFor(st, { quiet: true });
  return { st, d, L };
}
