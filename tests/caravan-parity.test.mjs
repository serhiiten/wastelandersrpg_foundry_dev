// Does the Foundry caravan sheet do everything the HTML electronic caravan sheet does, and the same way?
//  1. Inventory: every control of the HTML sheet (ids with listeners, delegated data-* buttons and fields)
//     must have its Foundry counterpart in templates/actor/caravan-v2.hbs (or a stated reason in SKIP).
//  2. Behaviour: the same presses and inputs, with the same dice, on the real HTML sheet (run in a sandbox)
//     and on a Foundry caravan actor (controller + adapter, saved and read back) must give the same caravan
//     and the same message.
// Run: node tests/caravan-parity.test.mjs
import { readFileSync } from "node:fs";
import { loadHtmlCaravan } from "./caravan-sandbox.mjs";
import { storeSystem } from "./schema-mock.mjs";
import { createCaravanLogic } from "../module/rules/caravan-logic.mjs";
import { createCaravanController } from "../module/rules/caravan-controller.mjs";
import { caravanToState, planCaravanSync, stateToCaravan } from "../module/rules/caravan-adapter.mjs";

const HBS = readFileSync(new URL("../templates/actor/caravan-v2.hbs", import.meta.url), "utf8");
let failures = 0;
const fail = (m) => {
  failures++;
  if (failures <= 12) console.log("FAIL", m);
};

/* ------------------------------------------------------------------ */
/*  1. Inventory                                                       */
/* ------------------------------------------------------------------ */

/** HTML control → what the Foundry template must contain */
const SAME = {
  // buttons by id
  vehBrahmin: 'data-act="veh" data-veh="0"', vehTachka: 'data-act="veh" data-veh="1"',
  foldImps: 'data-key="foldImps"', armorReset: 'data-act="armorReset"', hpMaxReset: 'data-act="hpMaxReset"',
  longHaul: 'data-act="longHaul"', addCustomImp: 'data-act="addCustomImp"', addCounter: 'data-act="addCounter"',
  addCargo: 'data-act="addCargo"', rollRep: 'data-act="rollRep"', luckPanel: 'data-act="rollFate"',
  rollName: 'data-act="rollName"', rollKarma: 'data-act="rollKarma"', rollBudget: 'data-act="rollBudget"',
  rollImps: 'data-act="rollImps"', btnClear: 'data-act="clear"', btnRandom: 'data-act="random"', btnQuick: 'data-act="quick"',
  toastUndo: 'data-action="undo"', btnJsonSave: 'data-action="jsonSave"', jsonFile: 'data-action="jsonOpen"',
  helpBtn: 'data-key="guide"', guideClose: 'data-key="guide"', guide: 'data-key="guide"',
  // fields by id
  companyName: 'data-k="companyName"', reputation: 'data-k="reputation"', storyMeeting: 'data-k="story.meeting"',
  storyFace: 'data-k="story.face"', storyLastJob: 'data-k="story.lastJob"', storyWentWrong: 'data-k="story.wentWrong"',
  notes: 'data-k="notes"', karma: 'data-k="karma"', budget: 'data-k="budget"', armorType: 'data-k="armorType"',
  luck: 'data-k="luck"', karmaAspect: 'data-k="karmaAspect"', hpMax: 'data-k="hpMax"', armorVal: 'data-k="armorVal"',
  hpCurrent: 'data-k="hpCurrent"',
  // delegated buttons and fields (data-*)
  "data-step": 'data-act="step"', "data-pip": 'data-act="pip"', "data-imp-btn": 'data-act="imp"', "data-seg": 'data-act="seg"',
  "data-cnt-del": 'data-act="cnt-del"', "data-cg-del": 'data-act="cg-del"', "data-roll": 'data-act="roll"',
  "data-cimp-del": 'data-act="cimp-del"', cntName: 'data-k="counters.{{i}}.name"', cntSize: 'data-k="counters.{{i}}.size"',
  cg: 'data-k="cargo.{{i}}.', cimpF: 'data-k="customImps.{{i}}.',
};
/** HTML controls Foundry leaves out on purpose */
const SKIP = {
  btnCopy: "текст аркуша — у Foundry експорту в текст немає (рішення автора)",
  btnTxt: "текст аркуша — у Foundry експорту в текст немає (рішення автора)",
  btnPdf: "PDF — у Foundry експорту в PDF немає (рішення автора)",
  themeBtn: "тема — у Foundry своя світла й темна тема",
};

const H = loadHtmlCaravan();
const controls = new Set([...H.listened("click"), ...H.listened("input"), ...H.listened("change")]);
for (const m of H.html.matchAll(/closest\("\[(data-[a-z-]+)\]"\)/g)) controls.add(m[1]);
for (const m of H.html.matchAll(/t\.dataset\.(\w+) !== undefined/g)) controls.add(m[1]);
let inventory = 0;
for (const c of controls) {
  inventory++;
  if (SKIP[c]) continue;
  const want = SAME[c];
  if (!want) fail(`inventory: HTML control «${c}» has no Foundry counterpart (add it to SAME or SKIP)`);
  else if (!HBS.includes(want)) fail(`inventory: «${c}» → template lacks ${want}`);
}

/* ------------------------------------------------------------------ */
/*  2. Behaviour                                                       */
/* ------------------------------------------------------------------ */

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
  return `${k}: HTML ${JSON.stringify(A[k])?.slice(0, 120)} / Foundry ${JSON.stringify(B[k])?.slice(0, 120)}`;
};
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let seq = 0;
const newId = () => `id${String(++seq).padStart(14, "0")}`;
const foundryStore = (data) => {
  const a = clone(data);
  a.name = String(a.name ?? "").trim();
  a.system = storeSystem("Actor", "caravan", a.system);
  a.items.forEach((it) => {
    it._id ??= newId();
    it.system = storeSystem("Item", it.type, it.system);
    it.name = String(it.name).trim();
  });
  return a;
};

/** One step for both sheets: [html(h), foundry(C)] */
const STEPS = {
  vehTachka: [(h) => h.click("vehTachka"), (C) => C.act("veh", { veh: "1" })],
  vehBrahmin: [(h) => h.click("vehBrahmin"), (C) => C.act("veh", { veh: "0" })],
  armorReset: [(h) => h.click("armorReset"), (C) => C.act("armorReset")],
  hpMaxReset: [(h) => h.click("hpMaxReset"), (C) => C.act("hpMaxReset")],
  longHaul: [(h) => h.click("longHaul"), (C) => C.act("longHaul")],
  addCustomImp: [(h) => h.click("addCustomImp"), (C) => C.act("addCustomImp")],
  addCounter: [(h) => h.click("addCounter"), (C) => C.act("addCounter")],
  addCargo: [(h) => h.click("addCargo"), (C) => C.act("addCargo")],
  rollRep: [(h) => h.click("rollRep"), (C) => C.act("rollRep")],
  rollFate: [(h) => h.click("luckPanel"), (C) => C.act("rollFate")],
  rollName: [(h) => h.click("rollName"), (C) => C.act("rollName")],
  rollKarma: [(h) => h.click("rollKarma"), (C) => C.act("rollKarma")],
  rollBudget: [(h) => h.click("rollBudget"), (C) => C.act("rollBudget")],
  rollImps: [(h) => h.click("rollImps"), (C) => C.act("rollImps")],
  clear: [(h) => h.click("btnClear", 2), (C) => C.act("clear")],
  random: [(h) => h.click("btnRandom", 2), (C) => C.act("random")],
  quick: [(h) => h.click("btnQuick", 2), (C) => C.act("quick")],
};
const field = (id, k, v) => [(h) => h.type(id, v), (C) => C.setField(k, v)];
const data = (ds, act, d, times = 1) => [(h) => h.clickData(ds, times), (C) => C.act(act, d)];
const rowField = (ds, k, v, tag) => [(h) => h.typeData(ds, v, tag), (C) => C.setField(k, v)];
Object.assign(STEPS, {
  name: field("companyName", "companyName", "Каравани «Ранок»"), nameClear: field("companyName", "companyName", " "),
  rep: field("reputation", "reputation", "Ті, що завжди повертаються"), meeting: field("storyMeeting", "story.meeting", "У барі «Аткінс»"),
  face: field("storyFace", "story.face", "Мо"), lastJob: field("storyLastJob", "story.lastJob", ""), wentWrong: field("storyWentWrong", "story.wentWrong", "Усе"),
  notes: field("notes", "notes", "Не довіряти Біллі"), karma: field("karma", "karma", "7"), karmaNeg: field("karma", "karma", "-12"), karmaEmpty: field("karma", "karma", ""),
  budget: field("budget", "budget", "42"), budgetNeg: field("budget", "budget", "-3"), armorType: field("armorType", "armorType", "енергетична"),
  armorTypeEmpty: field("armorType", "armorType", "  "), luck: field("luck", "luck", "2"), luckNeg: field("luck", "luck", "-1"),
  aspect: field("karmaAspect", "karmaAspect", "Темні особи"), hpMax: field("hpMax", "hpMax", "60"), hpMaxLow: field("hpMax", "hpMax", "0"),
  armorVal: field("armorVal", "armorVal", "5"), hpCurrent: field("hpCurrent", "hpCurrent", "7"), hpCurrentHigh: field("hpCurrent", "hpCurrent", "999"),
  karmaUp: data({ step: "karma", d: "1" }, "step", { step: "karma", d: "1" }), karmaDown: data({ step: "karma", d: "-1" }, "step", { step: "karma", d: "-1" }),
  hpDown: data({ step: "hpCurrent", d: "-1" }, "step", { step: "hpCurrent", d: "-1" }), hpUp: data({ step: "hpCurrent", d: "1" }, "step", { step: "hpCurrent", d: "1" }),
  budgetDown: data({ step: "budget", d: "-1" }, "step", { step: "budget", d: "-1" }),
  move3: data({ pip: "move", i: "3" }, "pip", { pip: "move", i: "3" }), move0: data({ pip: "move", i: "0" }, "pip", { pip: "move", i: "0" }),
  sup1: data({ pip: "sup", i: "1" }, "pip", { pip: "sup", i: "1" }),
  impStruct: data({ impBtn: "structure", k: "1" }, "imp", { id: "structure", k: "1" }), impChest: data({ impBtn: "chest", k: "0" }, "imp", { id: "chest", k: "0" }),
  impTrunk: data({ impBtn: "trunk", k: "0" }, "imp", { id: "trunk", k: "0" }), impBed: data({ impBtn: "bed", k: "0" }, "imp", { id: "bed", k: "0" }),
  impDefib: data({ impBtn: "defib", k: "0" }, "imp", { id: "defib", k: "0" }), impFeed: data({ impBtn: "feed", k: "1" }, "imp", { id: "feed", k: "1" }),
  seg: data({ seg: "0", k: "2" }, "seg", { seg: "0", k: "2" }),
  cntDel: data({ cntDel: "0" }, "cnt-del", { i: "0" }, 2), cgDel: data({ cgDel: "0" }, "cg-del", { i: "0" }, 2), cimpDel: data({ cimpDel: "0" }, "cimp-del", { i: "0" }, 2),
  rollMeeting: data({ roll: "meeting" }, "roll", { roll: "meeting" }), rollLastJob: data({ roll: "lastJob" }, "roll", { roll: "lastJob" }),
  rollWentWrong: data({ roll: "wentWrong" }, "roll", { roll: "wentWrong" }),
  cntName: rowField({ cntName: "0" }, "counters.0.name", "Наступ Легіону"), cntSize: rowField({ cntSize: "0" }, "counters.0.size", "4"),
  cgName: rowField({ cg: "0", f: "name" }, "cargo.0.name", "Ядер-Кола"), cgKind: rowField({ cg: "0", f: "kind" }, "cargo.0.kind", "pass"),
  cgPrice: rowField({ cg: "0", f: "price" }, "cargo.0.price", "12"), cgQty: rowField({ cg: "0", f: "qty" }, "cargo.0.qty", "3"),
  cgNote: rowField({ cg: "0", f: "note" }, "cargo.0.note", "до Прімма", "TEXTAREA"),
  cimpName: rowField({ cimpF: "name", cimpI: "0" }, "customImps.0.name", "Прапор"), cimpDesc: rowField({ cimpF: "desc", cimpI: "0" }, "customImps.0.desc", "Видно здалеку", "TEXTAREA"),
});
/** steps that need a row to exist first */
const NEEDS = {
  seg: "addCounter", cntDel: "addCounter", cntName: "addCounter", cntSize: "addCounter",
  cgDel: "addCargo", cgName: "addCargo", cgKind: "addCargo", cgPrice: "addCargo", cgQty: "addCargo", cgNote: "addCargo",
  cimpDel: "addCustomImp", cimpName: "addCustomImp", cimpDesc: "addCustomImp",
};

/** Foundry: one step on a caravan actor, saved the way saveCaravan does and read back */
function foundryStep(actor, fn, toasts) {
  const S = caravanToState(actor, { withIds: true });
  const toast = (m) => toasts.push(String(m));
  const L = createCaravanLogic({ S, toast });
  fn(createCaravanController(L, { toast }));
  const plan = planCaravanSync(actor, L.getS());
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
  return foundryStore(actor);
}

const names = Object.keys(STEPS);
const realRandom = Math.random;
let compared = 0;
const CASES = 120;
for (let c = 0; c < CASES; c++) {
  // a start caravan: the HTML sheet's own random caravan (or quick start / blank)
  H.setRandom(rng(1000 + c));
  if (c % 10 === 0) H.click("btnQuick", 2);
  else if (c % 10 === 1) H.click("btnClear", 2);
  else H.click("btnRandom", 2);
  if (c % 3 === 0) H.click("vehTachka");
  let actor = foundryStore(stateToCaravan(H.getState()));
  // a random path through the steps
  const pick = rng(c * 7 + 3);
  const path = [];
  for (let s = 0; s < 25; s++) {
    const n = names[Math.floor(pick() * names.length)];
    if (NEEDS[n]) path.push(NEEDS[n]);
    path.push(n);
  }
  for (const [s, n] of path.entries()) {
    const seed = c * 1000 + s;
    const [html, fnd] = STEPS[n];
    H.setRandom(rng(seed));
    const before = H.lastToast();
    html(H);
    const htmlToast = H.lastToast() !== before ? H.lastToast() : "";
    const toasts = [];
    Math.random = rng(seed);
    try {
      actor = foundryStep(actor, fnd, toasts);
    } catch (err) {
      fail(`case ${c}, step ${s} «${n}»: Foundry threw ${err.message}`);
      break;
    } finally {
      Math.random = realRandom;
    }
    compared++;
    const want = H.getState();
    const got = caravanToState(actor);
    if (!same(want, got)) {
      fail(`case ${c}, step ${s} «${n}»: ${firstDiff(want, got)}`);
      H.setState(got); // carry on from the same caravan
    }
    const fToast = toasts.at(-1) || "";
    if (htmlToast && htmlToast !== fToast) fail(`case ${c}, step ${s} «${n}»: message «${htmlToast}» / Foundry «${fToast}»`);
  }
}

console.log(`HTML-аркуш каравану: ${inventory} елементів у переліку (${Object.keys(SKIP).length} свідомо пропущено); кроків порівняно: ${compared}`);
console.log(failures ? `FAIL (${failures})` : "OK");
process.exit(failures ? 1 : 0);
