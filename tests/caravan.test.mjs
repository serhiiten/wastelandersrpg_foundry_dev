// Caravans: HTML sheet state ↔ Foundry actor, and the caravan sheet's handlers written back.
// Run: node tests/caravan.test.mjs
import { QUICK_START } from "../module/rules/caravan.mjs";
import { storeSystem } from "./schema-mock.mjs";
import { createCaravanLogic } from "../module/rules/caravan-logic.mjs";
import { createCaravanController } from "../module/rules/caravan-controller.mjs";
import { caravanToState, planCaravanSync, stateToCaravan } from "../module/rules/caravan-adapter.mjs";
import { buildCaravanView } from "../module/sheets/caravan-view.mjs";

const clone = (o) => JSON.parse(JSON.stringify(o));
const canon = (v) =>
  Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).filter((k) => !k.startsWith("_")).sort().map((k) => [k, canon(v[k])]))
      : v;
const same = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));
const firstDiff = (a, b) => {
  const A = canon(a);
  const B = canon(b);
  const k = Object.keys({ ...A, ...B }).find((x) => JSON.stringify(A[x]) !== JSON.stringify(B[x]));
  return `${k}: ${JSON.stringify(A[k])?.slice(0, 140)} → ${JSON.stringify(B[k])?.slice(0, 140)}`;
};
let seq = 0;
const newId = () => `id${String(++seq).padStart(14, "0")}`;
// Foundry trims text fields and needs item names
const foundryStore = (data) => {
  const a = clone(data);
  a.name = String(a.name ?? "").trim();
  a.system = storeSystem("Actor", "caravan", a.system);
  a.items.forEach((it) => {
    it._id ??= newId();
    it.system = storeSystem("Item", it.type, it.system);
    it.name = String(it.name).trim();
    if (!it.name) throw new Error(`Foundry не створить предмет без назви (${it.type})`);
  });
  return a;
};

/** a random caravan with rows of every kind */
function randomCaravan(i) {
  const L = createCaravanLogic({ S: null });
  L.setS(L.blankState());
  if (i % 2) L.getS().tachka = true;
  L.generateRandom();
  const S = L.getS();
  S.cargo.push({ name: "Вода", kind: "cargo", price: String(i % 7), qty: String(1 + (i % 3)), note: i % 3 ? "" : " з криниці" });
  if (i % 3 === 0) S.cargo.push({ name: "Лікар Мо", kind: "pass", price: "", qty: "1", note: "до Нью-Вегасу" });
  if (i % 4 === 0) S.cargo.push({ name: "", kind: "cargo", price: "", qty: "1", note: "" });
  if (i % 5 === 0) S.counters.push({ name: "Погоня", size: 8, value: 3 });
  if (i % 6 === 0) S.customImps.push({ name: "Сигналізація", desc: "Гучна." });
  if (i % 7 === 0) S.customImps.push({ name: "", desc: "" });
  if (i % 8 === 0) { S.hpMaxOverride = 50; S.armorOverride = 4; S.armorType = "енергетична"; }
  S.supplies = Math.min(S.supplies + (i % 2), L.derived().supCap);
  return S;
}

let failures = 0;
const fail = (m) => {
  failures++;
  if (failures < 8) console.log("FAIL", m);
};

// 1. round trip
const L0 = createCaravanLogic({ S: null });
const cases = [L0.normalize(clone(QUICK_START)), ...Array.from({ length: 400 }, (_, i) => randomCaravan(i))];
for (const [i, S] of cases.entries()) {
  try {
    const back = caravanToState(foundryStore(stateToCaravan(S)));
    const want = L0.normalize(clone(S));
    if (!same(want, back)) fail(`round trip #${i}: ${firstDiff(want, back)}`);
    // the sheet's view builds for every caravan, folded or not, with the guide
    const VL = createCaravanLogic({ S: back });
    const v = buildCaravanView(back, VL, { guide: i % 2 === 0, foldImps: i % 3 === 0 });
    if (v.imps.length !== 13 || v.name !== back.companyName || v.maxHP !== VL.derived().maxHP) fail(`view #${i}`);
  } catch (err) {
    fail(`round trip #${i}: ${err.message}`);
  }
}

// karma beyond −100…+100 is kept at the edge instead of the update being refused
for (const k of [500, -999]) {
  try {
    const back = caravanToState(foundryStore(stateToCaravan({ ...L0.blankState(), karma: k })));
    if (back.karma !== Math.sign(k) * 100) fail(`karma ${k} → ${back.karma}`);
  } catch (err) {
    fail(`karma ${k}: ${err.message}`);
  }
}

// 2. handlers on the actor, written back
const ACTIONS = [
  ["act", "veh", { veh: "1" }], ["act", "imp", { id: "structure", k: "0" }], ["act", "imp", { id: "chest", k: "1" }],
  ["act", "addCargo"], ["field", "cargo.0.name", "Набої"], ["field", "cargo.0.price", "3"], ["act", "addCounter"],
  ["field", "counters.0.name", "Буря"], ["act", "seg", { seg: "0", k: "2" }], ["act", "addCustomImp"], ["field", "customImps.0.name", "Прапор"],
  ["act", "longHaul"], ["act", "pip", { pip: "move", i: "3" }], ["act", "step", { step: "karma", d: "5" }], ["field", "hpMax", "60"],
  ["act", "hpMaxReset"], ["field", "armorVal", "5"], ["act", "armorReset"], ["act", "roll", { roll: "meeting" }], ["act", "rollRep"],
  ["act", "rollName"], ["act", "rollKarma"], ["act", "rollBudget"], ["act", "rollImps"], ["act", "cg-del", { i: "0" }],
  ["act", "cnt-del", { i: "0" }], ["act", "cimp-del", { i: "0" }], ["field", "story.face", "Мо"], ["field", "notes", "Тест"],
  ["act", "random"], ["act", "quick"], ["act", "clear"],
];
let ops = 0;
for (let i = 0; i < 60; i++) {
  const actor = foundryStore(stateToCaravan(randomCaravan(i)));
  for (const [kind, a, data] of ACTIONS) {
    try {
      const S = caravanToState(actor, { withIds: true });
      const L = createCaravanLogic({ S });
      const C = createCaravanController(L);
      if (kind === "act") C.act(a, data);
      else C.setField(a, data);
      const plan = planCaravanSync(actor, L.getS());
      ops += plan.update.length + plan.create.length + plan.delete.length;
      actor.name = plan.name;
      Object.assign(actor.system, clone(plan.system));
      for (const u of plan.update) {
        const it = actor.items.find((x) => x._id === u._id);
        if (u.name) it.name = u.name;
        it.sort = u.sort;
        it.system = clone(u.system);
      }
      actor.items = actor.items.filter((x) => !plan.delete.includes(x._id));
      for (const c of plan.create) actor.items.push(clone(c));
      Object.assign(actor, foundryStore(actor));
      const back = caravanToState(actor);
      const want = L.normalize(clone(L.getS()));
      if (!same(want, back)) fail(`${a} on caravan ${i}: ${firstDiff(want, back)}`);
    } catch (err) {
      fail(`${a} on caravan ${i}: ${err.message}`);
    }
  }
}

console.log(`round trips ${cases.length}, actions ${60 * ACTIONS.length}, item operations ${ops}, failures ${failures}`);
console.log(failures ? "FAIL" : "OK");
process.exit(failures ? 1 : 0);
