// The HTML sheet's handlers (controller.mjs) on generated characters, run with: node tests/controller.test.mjs
// Every button / field type is used; nothing may throw, the state must still compute, and the result
// must survive being written to an actor and read back.
import * as R from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { createController } from "../module/rules/controller.mjs";
import { actorToState, mergeSystem, planSync, stateToActor } from "../module/rules/character-adapter.mjs";

const clone = (o) => JSON.parse(JSON.stringify(o));
const canon = (v) =>
  Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).filter((k) => !k.startsWith("_")).sort().map((k) => [k, canon(v[k])]))
      : v;
let seq = 0;
const newId = () => `id${String(++seq).padStart(14, "0")}`;

let errors = 0;
let actions = 0;
let refused = 0;
let mismatches = 0;
const catalog = R.catalogAll(true);

for (let i = 0; i < 300; i++) {
  R.setRandom(R.mulberry32(i + 1));
  const actor = clone(stateToActor(R.rollCharacter(null)));
  actor.items.forEach((it) => (it._id = newId()));
  const st = actorToState(actor, { withIds: true });
  const L = createLogic({ st });
  const C = createController(st, L, {});
  const run = (fn) => {
    actions++;
    if (fn() === false) refused++;
  };
  try {
    run(() => C.act("roll-name"));
    run(() => C.act("roll-asp", { i: String(i % 3) }));
    run(() => C.act("roll-detail"));
    run(() => C.act("attr", { k: R.AKEYS[i % 7], d: "1" }));
    run(() => C.act("attr", { k: R.AKEYS[(i + 3) % 7], d: "-1" }));
    run(() => C.act("skill", { s: R.SKILLS[i % 10], l: "1" }));
    const perk = R.PERKS[i % R.PERKS.length];
    run(() => C.act("perk-add", { n: perk.n }));
    if (st.perks.length) run(() => C.act("perk-del", { i: "0" }));
    run(() => C.act("feat-add", { n: R.FEATS[i % R.FEATS.length].n }));
    run(() => C.act("imp", { k: "perk", i: "0" }));
    run(() => C.act("imp", { k: "attr2", i: "0" }));
    run(() => C.setField("imp.attr2.0.t", R.AKEYS[i % 7]));
    run(() => C.act("row-add", { l: "weapons" }));
    run(() => C.setField(`weapons.${st.weapons.length - 1}.n`, "Труба"));
    run(() => C.setField(`weapons.${st.weapons.length - 1}.hand`, true));
    run(() => C.act("cat-add", { id: catalog[i % catalog.length].id }));
    run(() => C.act("preset", { i: String(i % R.PRESETS.length) }));
    run(() => C.act("step", { k: "hpCur", d: "-3" }));
    run(() => C.act("step", { k: "fdCur", d: "-1" }));
    run(() => C.act("step", { k: "supplies", d: "1" }));
    run(() => C.act("step", { k: "caps", d: "5" }));
    run(() => C.act("sit-add", { t: "Поранена нога" }));
    run(() => C.act("sit-inv", { i: "0", d: "1" }));
    run(() => C.setField("cons.l", "Подряпина"));
    run(() => C.setField("hpCur", "999"));
    run(() => C.setField("supplies", "1", { num: true }));
    if (i % 10 === 0) run(() => C.setField("species", R.SPECIES_ORDER[i % 5]));
    if (i % 15 === 0) run(() => C.setField("arch", "Псионік"));
    const drugIdx = st.other.findIndex((o) => R.drugOf(o.n));
    if (drugIdx >= 0) run(() => C.act("chem-use", { i: String(drugIdx) }));
    run(() => C.act("chem-scene"));
    run(() => C.act("rest"));
    run(() => C.act("addiction-add", { name: "Джет" }));
    if (i % 20 === 0) run(() => C.act("random"));
    if (i % 50 === 0) run(() => C.act("new"));
    R.syncAuto(st);
    L.chemKO();
    R.compute(st);

    // write back and read again
    const plan = planSync(actor, st);
    const a = clone(actor);
    a.system = mergeSystem(a.system, plan.system);
    a.name = plan.name;
    for (const u of plan.update) {
      const it = a.items.find((x) => x._id === u._id);
      if (u.name) it.name = u.name;
      it.sort = u.sort;
      it.system = clone(u.system);
    }
    a.items = a.items.filter((x) => !plan.delete.includes(x._id));
    for (const c of plan.create) a.items.push({ ...clone(c), _id: newId() });
    if (JSON.stringify(canon(st)) !== JSON.stringify(canon(actorToState(a)))) mismatches++;
  } catch (err) {
    errors++;
    if (errors < 6) console.log("FAIL", i, err.message, (err.stack || "").split("\n")[1]);
  }
}
R.setRandom(null);
console.log(`characters 300, actions ${actions} (refused by the rules: ${refused}), errors ${errors}, save mismatches ${mismatches}`);
console.log(errors || mismatches ? "FAIL" : "OK");
process.exit(errors || mismatches ? 1 : 0);
