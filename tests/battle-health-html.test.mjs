// The HTML character sheet's copy of the battle and health rules (HTML backport 6.1–6.4, 2026-11-25): «Ремонт», П2 medicine
// (consRed), «Записати наслідок», the scene's end. The sheet keeps a hand-written copy of module/rules/battle-health.mjs (and of the
// standard aspects of rules/states.mjs, the cover prefix of rules/cover.mjs) between the marks «battle-health» of its app.js; this
// binds the copy to Foundry's modules on grids of inputs, and checks the sheet's check types against Foundry's logicFor.
// Run: node tests/battle-health-html.test.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import * as F from "../module/rules/battle-health.mjs";
import { STATE_ASPECTS } from "../module/rules/states.mjs";
import { COVER_PREFIX } from "../module/rules/cover.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { blankState, compute as computeF } from "../module/rules/core.mjs";
import { actorToState, stateToActor } from "../module/rules/character-adapter.mjs";
import { joinPrices, splitPrices } from "../module/rules/prices.mjs";
import { loadHtmlSheet } from "./html-sandbox.mjs";
import { needSiblings } from "./sibling.mjs";

let failures = 0, checks = 0;
const ok = (c, m) => { checks++; if (!c) { failures++; if (failures <= 15) console.log("FAIL", m); } };
const J = (v) => JSON.stringify(v);
const clone = (o) => (o === undefined ? undefined : JSON.parse(J(o)));

needSiblings(["pustelnyky-character-generator/src/app.js"]);
const src = readFileSync(new URL("../../pustelnyky-character-generator/src/app.js", import.meta.url), "utf8");
const A = src.indexOf("/* == battle-health: копія == */"), B = src.indexOf("/* == battle-health: кінець копії == */");
if (A < 0 || B < A) throw new Error("app.js: the marks «battle-health» not found");
const NAMES = ["zeroInvokes", "invokesLine", "SLOT_NAME", "consqPlan", "sceneEndHealth", "writeConsq", "MED_DICE", "medLimit", "medFormula",
  "healLanded", "nextMark", "addConsRed", "pruneConsRed", "addRepair", "TREAT_MEANS", "healCost", "payHeal", "treatPlan", "treatSlots",
  "applyTreat", "STATE_ASPECTS", "COVER_PREFIX"];
const H = vm.runInNewContext(src.slice(A, B) + `\n({ ${NAMES.join(", ")} })`, {});

/** Both sides on clones of the same input: results and the mutated inputs equal */
function same(name, args, { mut = [] } = {}) {
  const a = clone(args), b = clone(args);
  let ra, rb, ea = "", eb = "";
  try { ra = F[name](...a); } catch (e) { ea = e.message; }
  try { rb = H[name](...b); } catch (e) { eb = e.message; }
  ok(J(ra) === J(rb) && !!ea === !!eb, `${name}(${J(args).slice(0, 120)}) = ${J(rb)?.slice(0, 120)} ${eb}, Foundry ${J(ra)?.slice(0, 120)} ${ea}`);
  for (const i of mut) ok(J(a[i]) === J(b[i]), `${name}: argument ${i} after: HTML ${J(b[i])?.slice(0, 140)}, Foundry ${J(a[i])?.slice(0, 140)}`);
}

// constants
for (const k of ["SLOT_NAME", "MED_DICE", "TREAT_MEANS"]) ok(J(H[k]) === J(F[k]), `${k}: HTML ${J(H[k])}, Foundry ${J(F[k])}`);
ok(J(H.STATE_ASPECTS) === J(STATE_ASPECTS), `STATE_ASPECTS: HTML ${J(H.STATE_ASPECTS)}, Foundry ${J(STATE_ASPECTS)}`);
ok(H.COVER_PREFIX === COVER_PREFIX, `COVER_PREFIX: HTML ${J(H.COVER_PREFIX)}, Foundry ${J(COVER_PREFIX)}`);

// A5: zeroInvokes, invokesLine
const lists = [undefined, null, [], [{ t: "Засідка", inv: 2 }, { t: " Пил ", inv: "1" }, { t: "Купи", inv: 0 }, { t: "x", inv: -1 }, { t: "y" }, null],
  [{ name: "A", invoked: 3 }, { name: "B", invoked: 0 }]];
for (const l of lists) { same("zeroInvokes", [l]); same("zeroInvokes", [l, { inv: "invoked", name: "name" }]); }
for (const g of [undefined, [], [{ name: "Засідка", n: 2 }], [{ name: "A", n: 1, where: "зона" }, { name: "B", n: 1 }]]) same("invokesLine", [g]);

// A6: consqPlan, writeConsq on every combination of taken slots
const SLOTS = ["l", "m", "m2", "h"];
for (let mask = 0; mask < 16; mask++) {
  const cons = Object.fromEntries(SLOTS.map((k, i) => [k, mask & (1 << i) ? `н${k}` : i === 2 ? " " : ""]));
  for (const v of [-1, 0, 1, 2, 3, 4]) for (const ms of [undefined, 1, 2]) {
    same("consqPlan", [v, cons, ms]);
    const plan = F.consqPlan(v, cons, ms);
    for (const name of ["", "  ", "Перелом"]) same("writeConsq", [{ cons: { ...cons }, consT: { l: true }, ko: mask & 1 ? { wake: true } : undefined }, plan, name], { mut: [0] });
  }
}
same("consqPlan", [1, undefined]); same("consqPlan", [0, null, 2]);
same("writeConsq", [{}, { kind: "slot", k: "m" }, "Опік"], { mut: [0] });

// A6 / A5 at the scene's end: the engine's L stubbed the same on both sides
for (const sit of lists) for (const ko of [undefined, null, 7, {}, { wake: true }, { doomed: true }, { wake: true, doomed: true }]) for (const hp of [0, 3]) for (const last of ["", "Кінець сцени."]) {
  const st = { sit, ko, hpCur: String(hp) };
  const run = (fn) => { const s = clone(st), c = { last }; const lines = fn(s, { curHp: () => hp, chem: () => c }, {}); return J([lines, s, c]); };
  ok(run(F.sceneEndHealth) === run(H.sceneEndHealth), `sceneEndHealth(${J(st)}, last ${J(last)}): HTML ${run(H.sceneEndHealth)}, Foundry ${run(F.sceneEndHealth)}`);
}

// A7: limits, formulas, marks, landed heal
const PERKS = [[], ["Медик"], ["Мастак-ремонтник"], ["Медик", "Мастак-ремонтник"]];
for (const perks of PERKS) for (const repair of [false, true, undefined]) {
  for (const v of [-1, 0, 1, 2, 3, 4, "2"]) same("medFormula", [v, { perks, repair }]);
  same("medFormula", [2]);
  for (const day of [1, 2, "3", undefined]) for (const mark of [undefined, null, { day: 1, n: 1 }, { day: 2, n: 2 }, { day: "1", n: "3" }, { day: 3, n: 0 }]) {
    same("medLimit", [{ day, mark, perks, repair }]);
    same("nextMark", [{ day, mark }]);
  }
}
same("medLimit", [{ day: 1 }]);
for (const hp of [-2, 0, 5, 9, 12, "4"]) for (const max of [0, 9, "10"]) for (const amt of [-3, 0, 4, 7, "6", undefined]) same("healLanded", [hp, max, amt]);

// consRed: add and prune
const reds = [undefined, null, 5, {}, { m: 3 }, { m: "2", h: 4 }, { l: 1, m2: 2 }];
const consSets = [{ l: "", m: "", m2: "", h: "" }, { l: "a", m: "Перелом", m2: "", h: "" }, { l: "", m: " ", m2: "x", h: "Опік" }, undefined];
for (const consRed of reds) for (const cons of consSets) for (const hpRed of [undefined, 0, 2, 7, "5"]) {
  same("pruneConsRed", [{ consRed, cons, hpRed }], { mut: [0] });
  for (const [k, n] of [["m", 3], ["h", "2"], ["m", -1], ["m2", undefined]]) same("addConsRed", [{ consRed, cons, hpRed }, k, n], { mut: [0] });
}

// «Ремонт» on the check types: Foundry's addRepair and the copy on the same shapes
for (const P of [undefined, [], [{ l: "x", t: "gen" }], [{ l: "Медична допомога", t: "med", g: "other" }, { l: "Лікування наслідків", t: "treat", g: "other" }], [{ l: "Ремонт", t: "repair", g: "other" }]]) {
  for (const T of [undefined, {}, { med: { n: "Медична допомога", d: ["a", "b", "c", "d"] } }, { med: { d: [] }, repair: { n: "свій" } }]) {
    const a = { CHECK_TYPES: clone(T), ROLL_PRESETS: clone(P) }, b = { CHECK_TYPES: clone(T), ROLL_PRESETS: clone(P) };
    F.addRepair(a); H.addRepair(b);
    ok(J(a) === J(b), `addRepair(${J({ T, P }).slice(0, 100)}): HTML ${J(b).slice(0, 160)}, Foundry ${J(a).slice(0, 160)}`);
  }
}
same("addRepair", [null]);

// П2: what pays, the payment, the plan, the slots
const drugOf = (n) => ({ "Стимпак": "Стимпак", "стимпак": "Стимпак", "Суперстимпак": "Суперстимпак", "Хотфікс": "Хотфікс", "Критфікс": "Критфікс" })[String(n ?? "").trim()] || "";
const others = [[], [{ n: "Стимпак", q: "1" }], [{ n: "стимпак", q: "" }, { n: "Хотфікс", q: "2" }], [{ n: "Суперстимпак", q: "0" }, { n: "Критфікс", q: "x" }], [null, { n: "Пиво", q: "3" }]];
for (const type of ["med", "repair", "treat", "gen", undefined]) for (const sup of [undefined, 0, 1, 2, 3, "2", -1]) for (const other of others) {
  for (const machine of [undefined, null, false, true]) {
    const a = F.healCost(type, clone({ supplies: sup, other }), { machine, drugOf }), b = H.healCost(type, clone({ supplies: sup, other }), { machine, drugOf });
    ok(J(a) === J(b), `healCost(${type}, ${sup}, ${J(other)}, ${machine}): HTML ${J(b)}, Foundry ${J(a)}`);
  }
  for (const k of ["sup", "Стимпак", "Хотфікс", "Суперстимпак", "Критфікс", "Ніщо"]) {
    const sa = clone({ supplies: sup, other }), sb = clone({ supplies: sup, other });
    const a = F.payHeal(type, sa, k, { drugOf }), b = H.payHeal(type, sb, k, { drugOf });
    ok(J([a, sa]) === J([b, sb]), `payHeal(${type}, ${sup}, ${J(other)}, ${k}): HTML ${J([b, sb])}, Foundry ${J([a, sa])}`);
  }
}
same("healCost", [undefined, undefined]); same("healCost", ["treat", {}]);
for (const v of [-1, 0, 1, 2, 3, 4, "1", undefined]) same("treatPlan", [v]);
for (const cons of consSets) for (const consT of [undefined, {}, { m: true }, { h: true, m2: true }]) same("treatSlots", [{ cons, consT }]);
same("treatSlots", [undefined]);

// applyTreat: the patient's engine stubbed the same way (max = 12 − hpRed)
const Lp = { hpMaxNow: (d) => d.max, curHp: (d) => d.cur };
const compute = (s) => ({ max: 12 - (parseInt(s.hpRed, 10) || 0), cur: Math.min(parseInt(s.hpCur, 10) || 0, 12 - (parseInt(s.hpRed, 10) || 0)) });
for (const cons of consSets.slice(1, 3)) for (const consT of [undefined, { m: true }]) for (const slot of ["m", "h", "m2", "l"]) for (const v of [0, 1, 2, 3]) for (const n of [0, 3, 12]) for (const hpCur of ["10", "2"]) for (const hpRed of [0, 6]) {
  const st = { cons, consT, hpCur, hpRed, ko: hpRed ? { wake: true } : undefined }, plan = F.treatPlan(v);
  const sa = clone(st), sb = clone(st);
  const a = F.applyTreat(sa, Lp, slot, plan, n, { compute }), b = H.applyTreat(sb, Lp, slot, plan, n, { compute });
  ok(J([a, sa]) === J([b, sb]), `applyTreat(${J(st)}, ${slot}, v${v}, ${n}): HTML ${J([b, sb])}, Foundry ${J([a, sa])}`);
}

// the sheet itself: «Ремонт» right after «Медична допомога», its type as Foundry's logicFor (createLogic + addRepair) makes it
const sheet = loadHtmlSheet();
const L = F.addRepair(createLogic({ st: blankState(), toast: () => {} }));
const hp = JSON.parse(sheet.run("JSON.stringify({ P: ROLL_PRESETS, T: CHECK_TYPES.repair, med: CHECK_TYPES.repair && CHECK_TYPES.repair.d === CHECK_TYPES.med.d })"));
ok(J(hp.P) === J(L.ROLL_PRESETS), `ROLL_PRESETS: HTML ${J(hp.P.map((p) => p.l))}, Foundry ${J(L.ROLL_PRESETS.map((p) => p.l))}`);
ok(J(hp.T) === J(L.CHECK_TYPES.repair), `CHECK_TYPES.repair: HTML ${J(hp.T).slice(0, 120)}, Foundry ${J(L.CHECK_TYPES.repair).slice(0, 120)}`);
ok(hp.med, "«Ремонт» має ті самі результати, що й «Медична допомога» (той самий масив)");

// the sheet's own scene end: the standard aspects and covers go, the typed ones stay (6.4)
sheet.run("st=mergeState(blankState()); st.sit=[{t:'Засідка',inv:2},{t:'Збитий з ніг',inv:0},{t:'Прикритий: Вася',inv:1},{t:'Купи брухту',inv:0},{t:'Без зброї',inv:0}];");
sheet.act("chem-scene");
const after = JSON.parse(sheet.run("JSON.stringify({ sit: st.sit, last: chem().last })"));
ok(J(after.sit) === J([{ t: "Засідка", inv: 0 }, { t: "Купи брухту", inv: 0 }]), `кінець сцени: лишилися написані вручну, без Посилень ${J(after.sit)}`);
ok(after.last.endsWith("Безкоштовні Посилення знято: «Засідка», «Прикритий: Вася». Аспекти зникли: «Збитий з ніг», «Без зброї», «Прикритий: Вася»."), `кінець сцени: рядки ${after.last}`);

// .json Foundry → HTML → .json: consRed, ko, medDay and hpRed survive, and both count the same max HP (0.3, 0.9)
{
  const st = blankState();
  Object.assign(st, { name: "Тест", species: "human", hpCur: "9", cons: { l: "", m: "Перелом", m2: "", h: "Опік" }, consRed: { m: 3, h: 2 }, hpRed: 6, ko: { wake: true }, medDay: { day: 2, n: 1 } });
  const data = stateToActor(clone(st));
  const sent = joinPrices(splitPrices(actorToState(clone({ name: data.name, type: "character", img: data.img, system: data.system, items: data.items }))));
  ok(J([sent.consRed, sent.hpRed, sent.ko, sent.medDay]) === J([st.consRed, st.hpRed, st.ko, st.medDay]), `Foundry's export carries consRed, hpRed, ko, medDay: ${J([sent.consRed, sent.hpRed, sent.ko, sent.medDay])}`);
  sheet.setState(sent);
  sheet.run("syncAuto(st); adoptSources(); pruneConsRed(st);"); // what the page's render() does
  const back = sheet.getState();
  for (const k of ["consRed", "hpRed", "ko", "medDay", "cons", "hpCur"]) ok(J(back[k]) === J(sent[k]), `HTML keeps ${k}: ${J(back[k])}, file ${J(sent[k])}`);
  const hm = JSON.parse(sheet.run("JSON.stringify([compute(st).hp, hpMaxNow(compute(st))])"));
  const fd = computeF(clone(sent));
  ok(hm[0] === fd.hp, `max HP with consRed: HTML ${hm[0]}, Foundry ${fd.hp}`);
  const old = clone(sent); delete old.consRed; delete old.ko; delete old.medDay; old.hpRed = 0;
  sheet.setState(old); sheet.run("syncAuto(st); adoptSources(); pruneConsRed(st);");
  const b2 = sheet.getState();
  ok(!("consRed" in b2) && !("ko" in b2) && b2.hpRed === 0 && J(b2.cons) === J(old.cons), `an older file without consRed opens as it was: ${J({ consRed: b2.consRed, hpRed: b2.hpRed })}`);
}

console.log(failures ? `battle-health-html: ${failures} of ${checks} failed` : `battle-health-html OK (${checks} checks)`);
if (failures) process.exit(1);
