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
import { actorToState, mergeSystem, planSync } from "../rules/character-adapter.mjs";
import { compute } from "../rules/core.mjs";
import { createLogic } from "../rules/logic.mjs";
import { resolveItem } from "./character-json.mjs";

/** Read an actor as HTML sheet state, with item ids so changes can be written back */
export function readState(actor) {
  return actorToState(actor.toObject(), { withIds: true });
}

/** Rules logic bound to a state; toasts become notifications */
export function logicFor(st, { ui = {}, quiet = false } = {}) {
  const toast = (msg, kind) => {
    if (quiet || !msg) return;
    if (kind === "bad") ui_notify("warn", msg);
    else ui_notify("info", msg);
  };
  return createLogic({ st, toast, ui });
}

function ui_notify(level, msg) {
  globalThis.ui?.notifications?.[level]?.(msg);
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
  return enqueue(actor, async () => {
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
    await actor.update({ system }, { recursive: false });
  });
}

/**
 * Run sheet logic on an actor and save the result.
 * @param {Actor} actor
 * @param {(st:object, L:object) => any} fn  changes `st` (directly or through L)
 * @param {object} [opts]  { ui: form choices for the logic (rest options…), quiet: no notifications }
 * @returns {Promise<any>} what fn returned
 */
export async function runAction(actor, fn, opts = {}) {
  const st = readState(actor);
  const L = logicFor(st, opts);
  const result = await fn(st, L);
  await saveState(actor, st);
  return result;
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
