// Caravans: HTML sheet state ↔ Foundry actor, and the caravan sheet's handlers written back.
// Run: node tests/caravan.test.mjs
import { QUICK_START } from "../module/rules/caravan.mjs";
import { storeSystem } from "./schema-mock.mjs";
import { createCaravanLogic } from "../module/rules/caravan-logic.mjs";
import { createCaravanController } from "../module/rules/caravan-controller.mjs";
import { caravanHtmlState, caravanToState, planCaravanSync, stateToCaravan } from "../module/rules/caravan-adapter.mjs";
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
  // an HTML sheet's file: absolute max HP / armour (become bonuses), or Foundry's own bonuses and defences
  if (i % 8 === 0) { S.hpMaxOverride = 50; S.armorOverride = 4; S.armorType = "енергетична"; }
  if (i % 8 === 4) { S.hpBonus = i % 16 === 4 ? 7 : -3; S.armorBonus = i % 16 === 4 ? -1 : 2; S.defOv = { phys: "half", psy: "immune", rad: "bogus" }; }
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
  ["act", "longHaul"], ["act", "pip", { pip: "move", i: "3" }], ["act", "step", { step: "karma", d: "5" }], ["field", "hpBonus", "12"],
  ["act", "step", { step: "hpBonus", d: "-1" }], ["act", "ov-reset", { k: "hpBonus" }], ["field", "armorBonus", "-2"], ["act", "step", { step: "armorBonus", d: "3" }],
  ["field", "defOv.phys", "half"], ["field", "defOv.rad", "immune"], ["act", "def-reset"], ["act", "roll", { roll: "meeting" }], ["act", "rollRep"],
  ["act", "rollName"], ["act", "rollKarma"], ["act", "rollBudget"], ["act", "rollImps"], ["act", "cg-del", { i: "0" }],
  ["act", "cnt-del", { i: "0" }], ["act", "cimp-del", { i: "0" }], ["field", "story.face", "Мо"], ["field", "notes", "Тест"],
  ["act", "random"], ["act", "clear"],
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

/* ---- 3. «Налаштування → Захист»: bonuses, defences, migration, .json, reset (author, 2026-11-14) ---- */
{
  const eq = (got, want, what) => { if (JSON.stringify(got) !== JSON.stringify(want)) fail(`${what}: ${JSON.stringify(got)} instead of ${JSON.stringify(want)}`); };
  const LB = createCaravanLogic({ S: null });
  const blank = (over = {}) => ({ ...LB.blankState(), ...over });
  const store = (S) => foundryStore(stateToCaravan(S));

  // bonuses → derived max HP and armour (brahmins 25 / 1; at least 1 HP and 0 armour)
  const D = (S) => createCaravanLogic({ S }).derived(S);
  eq([D(blank()).maxHP, D(blank()).armor], [25, 1], "no bonuses");
  eq([D(blank({ hpBonus: 7, armorBonus: 2 })).maxHP, D(blank({ hpBonus: 7, armorBonus: 2 })).armor], [32, 3], "bonuses");
  eq([D(blank({ hpBonus: -99, armorBonus: -9 })).maxHP, D(blank({ hpBonus: -99, armorBonus: -9 })).armor], [1, 0], "bonus floors");
  const tk = blank({ tachka: true, hpBonus: 5, armorBonus: -1, imp: { ...LB.blankImps(), structure: 1, armor: 1 } });
  eq([D(tk).maxHP, D(tk).armor], [35 + 10 + 5, 2 + 2 - 1], "tachka + upgrades + bonuses");
  // the actor's final values (the damage code reads system.armor and system.defOv)
  const a1 = store(blank({ hpBonus: 7, armorBonus: 2, defOv: { phys: "half", psy: "immune" } }));
  eq([a1.system.hp.max, a1.system.armor, a1.system.hpBonus, a1.system.armorBonus], [32, 3, 7, 2], "actor values");
  eq(a1.system.defOv, { phys: "half", energy: "", fire: "", rad: "", poison: "", psy: "immune" }, "actor defOv");
  eq(["hpMaxOverride" in a1.system, "armorOverride" in a1.system], [false, false], "no absolute overrides on the actor");
  // the current HP follows a changed max when it was full
  { const S = blank(); const L = createCaravanLogic({ S }); const C = createCaravanController(L); C.setField("hpBonus", "10");
    eq([L.getS().hpBonus, L.getS().hpCurrent], [10, 35], "hp follows max up"); C.setField("hpBonus", "-30"); eq([L.getS().hpCurrent, D(L.getS()).maxHP], [1, 1], "hp clamped"); }

  // .json: Foundry → HTML sheet (absolute numbers, defences only when set) and back
  const S2 = LB.normalize(blank({ hpBonus: 7, armorBonus: 2, defOv: { rad: "immune" } }));
  const html = caravanHtmlState(S2);
  eq([html.hpMaxOverride, html.armorOverride, "hpBonus" in html, "armorBonus" in html, html.defOv], [32, 3, false, false, { phys: "", energy: "", fire: "", rad: "immune", poison: "", psy: "" }], "export");
  const back = LB.normalize(JSON.parse(JSON.stringify(html)));
  eq([back.hpBonus, back.armorBonus, back.defOv, "hpMaxOverride" in back], [7, 2, S2.defOv, false], "import");
  const plain = caravanHtmlState(blank());
  eq([plain.hpMaxOverride, plain.armorOverride, "defOv" in plain], [null, null, false], "export without bonuses");
  // an HTML sheet's own file (absolute override, no Foundry keys)
  const htmlFile = { ...blank(), hpMaxOverride: 50, armorOverride: 0 };
  delete htmlFile.hpBonus; delete htmlFile.armorBonus; delete htmlFile.defOv;
  const fromHtml = LB.normalize(htmlFile);
  eq([fromHtml.hpBonus, fromHtml.armorBonus], [25, -1], "HTML file import");
  eq([JSON.stringify(caravanHtmlState(fromHtml).hpMaxOverride), caravanHtmlState(fromHtml).armorOverride], ["50", 0], "HTML file round trip");

  // «Повернути все до стандартних значень» clears both bonuses and every defence
  { const L = createCaravanLogic({ S: blank({ hpBonus: 9, armorBonus: 3, hpCurrent: 34, defOv: { phys: "half", fire: "immune", psy: "half" } }) });
    createCaravanController(L).act("def-reset");
    const s = L.getS();
    eq([s.hpBonus, s.armorBonus, s.defOv, s.hpCurrent], [0, 0, { phys: "", energy: "", fire: "", rad: "", poison: "", psy: "" }, 25], "reset all"); }
  // one bonus' ↺ and bad input
  { const L = createCaravanLogic({ S: blank({ hpBonus: 4, armorBonus: 2 }) }); const C = createCaravanController(L);
    C.act("ov-reset", { k: "armorBonus" }); eq([L.getS().hpBonus, L.getS().armorBonus], [4, 0], "reset one");
    C.setField("defOv.phys", "normal"); C.setField("defOv.rad", "immune"); eq([L.getS().defOv.phys, L.getS().defOv.rad], ["", "immune"], "defence select"); }
}

console.log(`round trips ${cases.length}, actions ${60 * ACTIONS.length}, item operations ${ops}, failures ${failures}`);
console.log(failures ? "FAIL" : "OK");
process.exit(failures ? 1 : 0);
