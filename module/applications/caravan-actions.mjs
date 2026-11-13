/**
 * Run the HTML caravan sheet's rules on a Foundry caravan actor.
 *   readCaravan(actor) → S (with item ids);  runCaravanAction(actor, (C, L) => …);  saveCaravan(actor, S)
 */
import { caravanToState, planCaravanSync } from "../rules/caravan-adapter.mjs";
import { createCaravanLogic } from "../rules/caravan-logic.mjs";
import { createCaravanController } from "../rules/caravan-controller.mjs";
import { UNNAMED } from "../rules/character-adapter.mjs";
import { resolveItem } from "./character-json.mjs";

/** System values a caravan update replaces outright */
const REPLACE_WHOLE = ["counters", "story", "locked", "engine"];

export function readCaravan(actor) {
  return caravanToState(actor.toObject(), { withIds: true });
}

const notify = (msg) => globalThis.ui?.notifications?.info?.(msg);

/** Rules + handlers for an actor's caravan state */
export function caravanLogicFor(S, { quiet = false } = {}) {
  const toast = (m) => !quiet && notify(m);
  const L = createCaravanLogic({ S, toast });
  return { L, C: createCaravanController(L, { toast }) };
}

const queues = new Map();
function enqueue(actor, job) {
  const next = (queues.get(actor.uuid) || Promise.resolve()).catch(() => {}).then(job);
  queues.set(actor.uuid, next);
  return next;
}

/** Write a caravan state back: items in place, removed or created (upgrades from the compendium) */
export function saveCaravan(actor, S) {
  return enqueue(actor, async () => {
    const plan = planCaravanSync(actor.toObject(), S);
    if (plan.delete.length) await actor.deleteEmbeddedDocuments("Item", plan.delete, { render: false });
    if (plan.update.length) await actor.updateEmbeddedDocuments("Item", plan.update, { recursive: false, render: false });
    if (plan.create.length) {
      const data = [];
      for (const it of plan.create) data.push(it.type === "upgrade" && !it.system.engine?.custom ? await resolveItem(it, { system: {} }) : it);
      await actor.createEmbeddedDocuments("Item", data, { render: false });
    }
    const system = foundry.utils.mergeObject(actor.system.toObject(), plan.system, { inplace: false });
    for (const k of REPLACE_WHOLE) if (k in plan.system) system[k] = plan.system[k];
    await actor.update({ name: plan.name || UNNAMED, system }, { recursive: false });
  });
}

/** Run a caravan handler and save: fn(C, L) */
export async function runCaravanAction(actor, fn, opts = {}) {
  const S = readCaravan(actor);
  const { L, C } = caravanLogicFor(S, opts);
  const result = await fn(C, L);
  await saveCaravan(actor, L.getS());
  return result;
}
