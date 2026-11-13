// Sheet actions written back to the actor, run with: node tests/sync.test.mjs
// For each character: read the actor with item ids, run HTML-sheet actions (drugs, rest, gear edits,
// improvements), plan the sync, apply it as Foundry would, read the actor again → must equal the
// changed state.
import * as R from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { actorToState, mergeSystem, planSync, stateToActor } from "../module/rules/character-adapter.mjs";

const clone = (o) => JSON.parse(JSON.stringify(o));
let seq = 0;
const newId = () => `id${String(++seq).padStart(14, "0")}`;
const canon = (v) =>
  Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).filter((k) => !k.startsWith("_")).sort().map((k) => [k, canon(v[k])]))
      : v;

/** Foundry stand-in: an actor with item ids */
function makeActor(st) {
  const a = clone(stateToActor(st));
  a.items.forEach((i) => (i._id = newId()));
  return a;
}

/** Apply a plan the way the Foundry layer does */
function apply(actor, plan) {
  const a = clone(actor);
  a.system = mergeSystem(a.system, plan.system);
  for (const u of plan.update) {
    const it = a.items.find((i) => i._id === u._id);
    if (u.name) it.name = u.name;
    it.sort = u.sort;
    it.system = clone(u.system); // { recursive: false }
  }
  a.items = a.items.filter((i) => !plan.delete.includes(i._id));
  for (const c of plan.create) a.items.push({ ...clone(c), _id: newId() });
  return a;
}

let failures = 0;
let ops = 0;
for (let i = 0; i < 500; i++) {
  R.setRandom(R.mulberry32(i + 1));
  const actor = makeActor(R.rollCharacter(null));
  const st = actorToState(actor, { withIds: true });
  const L = createLogic({ st, ui: { restMedic: true } });

  // a mix of sheet actions
  const drugs = Object.keys(R.DRUGS);
  st.other.push({ n: drugs[i % drugs.length], q: "2", note: "" });
  L.useItem(st.other.length - 1);
  if (i % 3 === 0) L.doRest();
  if (i % 4 === 0) L.endScene();
  if (st.weapons[0]) st.weapons[0].n += " (саморобна)";
  if (i % 5 === 0 && st.perks.length) st.perks.pop();
  if (i % 7 === 0 && st.armor.length) st.armor.shift();
  if (i % 2 === 0) st.weapons.push({ n: "Труба", d: "1d6", h: false, en: "", note: "знайдена" });
  st.imp.perk[0] = { on: true, t: "" };
  st.sit.push({ t: "Під прицілом", inv: 1 });
  st.xp = 15;

  const plan = planSync(actor, st);
  ops += plan.update.length + plan.create.length + plan.delete.length;
  const back = actorToState(apply(actor, plan));
  const a = JSON.stringify(canon(st));
  const b = JSON.stringify(canon(back));
  if (a !== b) {
    failures++;
    if (failures < 4) {
      const A = canon(st);
      const B = canon(back);
      const keys = Object.keys(A).filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
      console.log("FAIL", i, keys.map((k) => `${k}: ${JSON.stringify(A[k]).slice(0, 120)} → ${JSON.stringify(B[k]).slice(0, 120)}`).join("\n   "));
    }
  }
}
R.setRandom(null);
console.log(`characters 500, item operations ${ops}, mismatches ${failures}`);
console.log(failures ? "FAIL" : "OK");
process.exit(failures ? 1 : 0);
