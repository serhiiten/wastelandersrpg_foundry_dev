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
import { cargoHurtAt, caravanToState, planCaravanSync, rowKey, stateToCaravan } from "../module/rules/caravan-adapter.mjs";

const HBS = readFileSync(new URL("../templates/actor/caravan-v2.hbs", import.meta.url), "utf8");
/** «Списати N(к) з бюджету?» is Foundry's DialogV2, not the template */
const SPEND = readFileSync(new URL("../module/applications/spend-ask.mjs", import.meta.url), "utf8");
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
  foldImps: 'data-key="foldImps"',
  addCustomImp: 'data-act="addCustomImp"', addCounter: 'data-act="addCounter"',
  addCargo: 'data-act="addCargo"', rollRep: 'data-act="rollRep"', luckPanel: 'data-act="rollFate"',
  rollName: 'data-act="rollName"', rollKarma: 'data-act="rollKarma"', rollBudget: 'data-act="rollBudget"',
  rollImps: 'data-act="rollImps"', btnClear: 'data-act="clear"', btnRandom: 'data-act="random"',
  toastUndo: 'data-action="undo"', btnJsonSave: 'data-action="jsonSave"', jsonFile: 'data-action="jsonOpen"',
  helpBtn: 'data-key="guide"', guideClose: 'data-key="guide"', guide: 'data-key="guide"',
  // fields by id
  companyName: 'data-k="companyName"', reputation: 'data-k="reputation"', storyMeeting: 'data-k="story.meeting"',
  storyFace: 'data-k="story.face"', storyLastJob: 'data-k="story.lastJob"', storyWentWrong: 'data-k="story.wentWrong"',
  notes: 'data-note="notes"' /* «Примітки» in Foundry's editor (prose-mirror; author, 2026-11-15) */, karma: 'data-k="karma"', budget: 'data-k="budget"',
  luck: 'data-k="luck"', karmaAspect: 'data-k="karmaAspect"',
  hpCurrent: 'data-k="hpCurrent"',
  // stage 3 of the backport (2026-11-19): «Налаштування» (bonuses, defences), the paid services, the brahmins' choice
  hpBonus: 'data-k="{{k}}"', armorBonus: 'data-k="{{k}}"', psiArmor: 'data-k="{{k}}"', defReset: 'data-act="def-reset"',
  "data-ov-reset": 'data-act="ov-reset"', def: 'data-k="defOv.{{k}}"',
  "data-def-reset": 'data-k="defOv.{{k}}"' /* Foundry: the select's «за правилами» */,
  btnRefill: 'data-act="refill"', btnRepair: 'data-act="repair"',
  "data-brah": 'data-action="brahminBonus"', pathfinder: 'data-action="pathfinder"',
  // row 3.2 (2026-11-19): «Турель» (its damage and type in «Налаштування», the dice button) and «Дефібрилятор»'s mark
  turretDice: 'data-tf="dice"', turretType: 'data-tf="type"', "data-turret-roll": 'data-action="turretRoll"', "data-defib": 'data-action="defib"',
  // delegated buttons and fields (data-*)
  "data-step": 'data-act="step"', "data-pip": 'data-act="pip"', "data-imp-btn": 'data-act="imp"', "data-seg": 'data-act="seg"',
  "data-cnt-del": 'data-act="cnt-del"', "data-cg-del": 'data-act="cg-del"', "data-roll": 'data-act="roll"',
  "data-cimp-del": 'data-act="cimp-del"', cntName: 'data-k="counters.{{i}}.name"', cntSize: 'data-k="counters.{{i}}.size"',
  cg: 'data-k="cargo.{{i}}.', cimpF: 'data-k="customImps.{{i}}.',
  // stage 6в of the backport (2026-11-25): «Купити / Продати / Плата за проїзд» of a cargo row, «Продати все» (A3)
  "data-cg-buy": 'data-action="cargoBuy" data-i="{{i}}"', "data-cg-sell": 'data-action="cargoSell" data-i="{{i}}" data-key="{{key}}"',
  cargoSellAll: 'data-action="cargoSell" data-all="1"',
  // «Списати N(к) з бюджету?» (A3, A13): its three ways out, in spend-ask.mjs
  spendPay: { in: SPEND, text: 'action: "pay", label: "Так, списати"' }, spendFree: { in: SPEND, text: 'action: "free", label: "Ні, без списання"' },
  spendClose: { in: SPEND, text: "rejectClose: false" },
  // HTML backport 5.1 (2026-11-25): «Повний / Компактний» (only the view: a variable and the device's storage, not S), and the
  // compact sheet's service icons, which press the full sheet's «Відремонтувати» / «Поповнити» (btnRepair / btnRefill above)
  "data-cmp-view": 'data-action="compactToggle"', "data-cmp-svc": 'data-act="repair"',
};
/** HTML controls Foundry leaves out on purpose */
const SKIP = {
  // author, 2026-11-16: no «Лічильники» tab on the caravan sheet (the panel «Лічильники» does it); a .json's counters stay in the data
  addCounter: "вкладку «Лічильники» прибрано: лічильники — у панелі «Лічильники»", "data-seg": "вкладку «Лічильники» прибрано", "data-cnt-del": "вкладку «Лічильники» прибрано", cntName: "вкладку «Лічильники» прибрано", cntSize: "вкладку «Лічильники» прибрано",
  btnCopy: "текст аркуша — у Foundry експорту в текст немає (рішення автора)",
  btnTxt: "текст аркуша — у Foundry експорту в текст немає (рішення автора)",
  btnPdf: "PDF — у Foundry експорту в PDF немає (рішення автора)",
  themeBtn: "тема — у Foundry своя світла й темна тема",
  btnQuick: "«Швидкий старт» — караван «Останній Шанс» у пригоді «Швидкий старт» (рішення автора, 2026-11-16)",
  // author, 2026-11-14: max HP and armour are the rules' value + a bonus, edited in «Налаштування → Захист» (tests/caravan.test.mjs)
  hpMax: "максимум ОЗ не редагується: надбавка в «Налаштування → Захист»",
  armorVal: "броня не редагується: надбавка в «Налаштування → Захист»",
  armorType: "тип броні завжди «фізична», не редагується",
  armorReset: "скидання надбавок — «Повернути все до стандартних значень» в «Налаштування → Захист»",
  hpMaxReset: "скидання надбавок — «Повернути все до стандартних значень» в «Налаштування → Захист»",
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
  else if (typeof want === "object" ? !want.in.includes(want.text) : !HBS.includes(want)) fail(`inventory: «${c}» → Foundry lacks ${want.text ?? want}`);
}

/* ------------------------------------------------------------------ */
/*  2. Behaviour                                                       */
/* ------------------------------------------------------------------ */

const clone = (o) => JSON.parse(JSON.stringify(o));
// «unpaid» (a cargo row not bought yet, A3) is in the shared normalize() since stage 6в (2026-11-25): compared like any key
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

/** The HTML sheet's «Списати N(к) з бюджету?» answered: pay "1" «Так, списати» (off when the budget is short), "0" «Ні, без
 *  списання»; then × (a no-op once it is closed). Foundry's sheet asks the same and passes pay to the controller */
function answer(h, press, pay) {
  press();
  h.click(pay === "1" ? "spendPay" : "spendFree");
  h.click("spendClose");
}
/** One step for both sheets: [html(h), foundry(C)] */
const STEPS = {
  vehTachka: [(h) => h.click("vehTachka"), (C) => C.act("veh", { veh: "1" })],
  vehBrahmin: [(h) => h.click("vehBrahmin"), (C) => C.act("veh", { veh: "0" })],
  // past the two starting improvements the sheets ask «Списати 25(к) з бюджету?» (A13): free here, paid in impPay / cimpPay
  addCustomImp: [(h) => answer(h, () => h.click("addCustomImp"), "0"), (C) => C.act("addCustomImp", { pay: "0" })],
  cimpPay: [(h) => answer(h, () => h.click("addCustomImp"), "1"), (C) => C.act("addCustomImp", { pay: "1" })],
  addCounter: [(h) => h.click("addCounter"), (C) => C.act("addCounter")],
  addCargo: [(h) => h.click("addCargo"), (C) => C.act("addCargo")],
  rollRep: [(h) => h.click("rollRep"), (C) => C.act("rollRep")],
  rollFate: [(h) => h.click("luckPanel"), (C) => C.act("rollFate")],
  rollName: [(h) => h.click("rollName"), (C) => C.act("rollName")],
  // Foundry (author, 2026-11-14): the karma die is never locked (the sheet asks twice), so the HTML side rolls with the lock off
  rollKarma: [(h) => { const st = h.getState(); st.manual = { ...st.manual, karma: false }; h.setState(st); h.click("rollKarma"); }, (C) => C.act("rollKarma")],
  rollBudget: [(h) => h.click("rollBudget"), (C) => C.act("rollBudget")],
  rollImps: [(h) => h.click("rollImps"), (C) => C.act("rollImps")],
  clear: [(h) => h.click("btnClear", 2), (C) => C.act("clear")],
  // Foundry (author, 2026-11-14): «Випадковий караван» rolls everything anew, typed fields and custom improvements too —
  // so the HTML side rolls with no manual locks and no custom improvements
  random: [(h) => { const st = h.getState(); Object.keys(st.manual || {}).forEach((k) => { st.manual[k] = false; }); st.customImps = []; h.setState(st); h.click("btnRandom", 2); }, (C) => C.act("random")],
};
const field = (id, k, v) => [(h) => h.type(id, v), (C) => C.setField(k, v)];
/** an improvement's level, answering the question when the sheet asks one (free by default) */
const imp = (id, k, pay = "0") => [(h) => answer(h, () => h.clickData({ impBtn: id, k }), pay), (C) => C.act("imp", { id, k, pay })];
let sellKey = "-";
const data = (ds, act, d, times = 1) => [(h) => h.clickData(ds, times), (C) => C.act(act, d)];
const rowField = (ds, k, v, tag) => [(h) => h.typeData(ds, v, tag), (C) => C.setField(k, v)];
/** a delegated element of the page with its own properties (checkboxes, the defence selects) */
const fireDoc = (h, type, dataset, props) => {
  const t = { dataset: { ...dataset }, tagName: "INPUT", closest: () => null, matches: () => false, classList: { contains: () => false }, ...props };
  (h.docListeners[type] || []).forEach((fn) => fn({ target: t, currentTarget: t, preventDefault() {}, stopPropagation() {} }));
};
/** a defence select: the HTML sheet's dropdown fires «change»; Foundry's select writes defOv.<type> */
const defField = (k, v) => [(h) => fireDoc(h, "change", { def: k }, { tagName: "SELECT", value: v }), (C) => C.setField(`defOv.${k}`, v)];
/** a cargo row's «Далека» / «Пошк.» tick */
const tick = (f, on) => [(h) => fireDoc(h, "input", { cg: "0", f }, { type: "checkbox", checked: on, value: "on" }), (C) => C.setField(`cargo.0.${f}`, on)];
Object.assign(STEPS, {
  name: field("companyName", "companyName", "Каравани «Ранок»"), nameClear: field("companyName", "companyName", " "),
  rep: field("reputation", "reputation", "Ті, що завжди повертаються"), meeting: field("storyMeeting", "story.meeting", "У барі «Аткінс»"),
  face: field("storyFace", "story.face", "Мо"), lastJob: field("storyLastJob", "story.lastJob", ""), wentWrong: field("storyWentWrong", "story.wentWrong", "Усе"),
  notes: field("notes", "notes", "Не довіряти Біллі"), karma: field("karma", "karma", "7"), karmaNeg: field("karma", "karma", "-12"), karmaEmpty: field("karma", "karma", ""),
  budget: field("budget", "budget", "42"), budgetNeg: field("budget", "budget", "-3"), luck: field("luck", "luck", "2"), luckNeg: field("luck", "luck", "-1"),
  aspect: field("karmaAspect", "karmaAspect", "Темні особи"), 
  hpCurrent: field("hpCurrent", "hpCurrent", "7"), hpCurrentHigh: field("hpCurrent", "hpCurrent", "999"),
  karmaUp: data({ step: "karma", d: "1" }, "step", { step: "karma", d: "1" }), karmaDown: data({ step: "karma", d: "-1" }, "step", { step: "karma", d: "-1" }),
  hpDown: data({ step: "hpCurrent", d: "-1" }, "step", { step: "hpCurrent", d: "-1" }), hpUp: data({ step: "hpCurrent", d: "1" }, "step", { step: "hpCurrent", d: "1" }),
  budgetDown: data({ step: "budget", d: "-1" }, "step", { step: "budget", d: "-1" }),
  move3: data({ pip: "move", i: "3" }, "pip", { pip: "move", i: "3" }), move0: data({ pip: "move", i: "0" }, "pip", { pip: "move", i: "0" }),
  sup1: data({ pip: "sup", i: "1" }, "pip", { pip: "sup", i: "1" }),
  impStruct: imp("structure", "1"), impChest: imp("chest", "0"), impTrunk: imp("trunk", "0"), impBed: imp("bed", "0"),
  impDefib: imp("defib", "0"), impFeed: imp("feed", "1"), impArmorPay: imp("armor", "0", "1"), impCabinPay: imp("cabin", "0", "1"),
  // stage 6в (A3): «Купити за N(к)» paid or free, «Продати» of row 0 (the key the button carries), «Продати все»
  cgBuyPay: [(h) => answer(h, () => h.clickData({ cgBuy: "0" }), "1"), (C) => C.act("cg-buy", { i: "0", pay: "1" })],
  cgBuyFree: [(h) => answer(h, () => h.clickData({ cgBuy: "0" }), "0"), (C) => C.act("cg-buy", { i: "0", pay: "0" })],
  cgSell: [(h) => { const r = h.getState().cargo[0]; sellKey = r ? rowKey(r) : "-"; h.clickData({ cgSell: "0", key: sellKey }); }, (C) => C.act("cg-sell", { i: "0", key: sellKey })],
  cgSellStale: [(h) => h.clickData({ cgSell: "0", key: "cargo|нема|1|1|0|0" }), (C) => C.act("cg-sell", { i: "0", key: "cargo|нема|1|1|0|0" })],
  cgSellAll: [(h) => h.click("cargoSellAll"), (C) => C.act("cg-sell", { all: "1" })],
  seg: data({ seg: "0", k: "2" }, "seg", { seg: "0", k: "2" }),
  cntDel: data({ cntDel: "0" }, "cnt-del", { i: "0" }, 2), cgDel: data({ cgDel: "0" }, "cg-del", { i: "0" }, 2), cimpDel: data({ cimpDel: "0" }, "cimp-del", { i: "0" }, 2),
  rollMeeting: data({ roll: "meeting" }, "roll", { roll: "meeting" }), rollLastJob: data({ roll: "lastJob" }, "roll", { roll: "lastJob" }),
  rollWentWrong: data({ roll: "wentWrong" }, "roll", { roll: "wentWrong" }),
  cntName: rowField({ cntName: "0" }, "counters.0.name", "Наступ Легіону"), cntSize: rowField({ cntSize: "0" }, "counters.0.size", "4"),
  cgName: rowField({ cg: "0", f: "name" }, "cargo.0.name", "Ядер-Кола"), cgKind: rowField({ cg: "0", f: "kind" }, "cargo.0.kind", "pass"),
  cgPrice: rowField({ cg: "0", f: "price" }, "cargo.0.price", "12"), cgQty: rowField({ cg: "0", f: "qty" }, "cargo.0.qty", "3"),
  cgNote: rowField({ cg: "0", f: "note" }, "cargo.0.note", "до Прімма", "TEXTAREA"),
  // stage 3: bonuses (steppers, typed, ↺ one), defences (select, ↺ one), everything back (asks twice), paid services, row ticks
  hpBonusUp: data({ step: "hpBonus", d: "1" }, "step", { step: "hpBonus", d: "1" }), hpBonusDown: data({ step: "hpBonus", d: "-1" }, "step", { step: "hpBonus", d: "-1" }),
  armorBonusDown: data({ step: "armorBonus", d: "-1" }, "step", { step: "armorBonus", d: "-1" }), psiUp: data({ step: "psiArmor", d: "1" }, "step", { step: "psiArmor", d: "1" }),
  psiDown: data({ step: "psiArmor", d: "-1" }, "step", { step: "psiArmor", d: "-1" }),
  hpBonusTyped: field("hpBonus", "hpBonus", "-30"), hpBonusBig: field("hpBonus", "hpBonus", "12"), armorBonusTyped: field("armorBonus", "armorBonus", "3"),
  psiTyped: field("psiArmor", "psiArmor", "-4"), hpBonusText: field("hpBonus", "hpBonus", "abc"),
  hpBonusReset: data({ ovReset: "hpBonus" }, "ov-reset", { k: "hpBonus" }), armorBonusReset: data({ ovReset: "armorBonus" }, "ov-reset", { k: "armorBonus" }),
  defRad: defField("rad", "immune"), defPhys: defField("phys", "half"), defNormal: defField("psy", "normal"), defRule: defField("fire", ""),
  defRadReset: [(h) => h.clickData({ defReset: "rad" }), (C) => C.setField("defOv.rad", "")], defAll: [(h) => h.click("defReset", 2), (C) => C.act("def-reset")],
  refill: [(h) => h.click("btnRefill"), (C) => C.act("refill")], repair: [(h) => h.click("btnRepair"), (C) => C.act("repair")],
  cgFar: tick("far", true), cgFarOff: tick("far", false), cgHurt: tick("hurt", true), cgHurtOff: tick("hurt", false),
  cimpName: rowField({ cimpF: "name", cimpI: "0" }, "customImps.0.name", "Прапор"), cimpDesc: rowField({ cimpF: "desc", cimpI: "0" }, "customImps.0.desc", "Видно здалеку", "TEXTAREA"),
});
/** steps that need a row to exist first */
const NEEDS = {
  seg: "addCounter", cntDel: "addCounter", cntName: "addCounter", cntSize: "addCounter",
  cgDel: "addCargo", cgBuyPay: "cgPrice", cgBuyFree: "cgPrice", cgSell: "addCargo", cgFar: "addCargo", cgFarOff: "addCargo", cgHurt: "addCargo", cgHurtOff: "addCargo", cgName: "addCargo", cgKind: "addCargo", cgPrice: "addCargo", cgQty: "addCargo", cgNote: "addCargo",
  cimpDel: "addCustomImp", cimpName: "addCustomImp", cimpDesc: "addCustomImp",
};

/** Foundry: one step on a caravan actor, saved the way saveCaravan does and read back */
let lastResult; // what the Foundry action returned (cg-sell: the plan for the chat card)
function foundryStep(actor, fn, toasts) {
  const wasHurt = cargoHurtAt(actor.system.hp?.value, actor.system.hp?.max);
  const S = caravanToState(actor, { withIds: true });
  const toast = (m) => toasts.push(String(m));
  const L = createCaravanLogic({ S, toast });
  lastResult = fn(createCaravanController(L, { toast }));
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
  const out = foundryStore(actor);
  // WastelandersActor._onUpdate (module/documents/actor.mjs): the caravan has just taken more than half its HP of damage —
  // every cargo item carried now is damaged; its warning comes after the sheet's own message (the HTML sheet shows the last)
  if (!wasHurt && cargoHurtAt(out.system.hp?.value, out.system.hp?.max)) {
    const ups = out.items.filter((i) => i.type === "cargo" && !i.system.engine?.hurt);
    ups.forEach((i) => { i.system.engine = { ...i.system.engine, hurt: true }; });
    if (ups.length) toasts.unshift("Караван отримав понад половину ОЗ шкоди — вантаж пошкоджено");
  }
  return out;
}

const names = Object.keys(STEPS);
const KARMA_QUIET = new Set(["rollKarma", "random", "clear", "rollFate"]);
const int = (v) => parseInt(v, 10) || 0;
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
    const withNeeds = (x) => { if (NEEDS[x]) withNeeds(NEEDS[x]); path.push(x); }; // «Купити» needs a price, a price a row
    withNeeds(n);
  }
  for (const [s, n] of path.entries()) {
    const seed = c * 1000 + s;
    const [html, fnd] = STEPS[n];
    H.setRandom(rng(seed));
    const before = H.lastToast();
    H.clearToast();
    const kWas = caravanToState(actor);
    html(H);
    const htmlToast = H.lastToast();
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
    const got = caravanToState(actor); // the same state since stage 3 of the backport: bonuses, defences, rows' ticks
    if (!same(want, got)) {
      fail(`case ${c}, step ${s} «${n}»: ${firstDiff(want, got)}`);
      H.setState(got); // carry on from the same caravan
    }
    // where Foundry posts a chat card the HTML sheet shows a message (stage 6в): a sale (cg-sell's plan) and every change of the
    // karma by hand (A14; not the d6, «Випадковий караван», «Очистити» — KARMA_QUIET of caravan-sheet-v2.mjs)
    let fToast = toasts.at(-1) || "";
    let card = false;
    if (lastResult && lastResult.rows) { fToast = H.api.saleToast(lastResult); card = true; }
    else if (!KARMA_QUIET.has(n) && int(kWas.karma) !== int(got.karma)) {
      fToast = H.api.karmaToast(want.companyName, int(kWas.karma), int(got.karma), kWas.karmaAspect || "", got.karmaAspect || "");
      card = true;
    }
    if ((htmlToast || card) && htmlToast !== fToast) fail(`case ${c}, step ${s} «${n}»: message «${htmlToast}» / Foundry «${fToast}»`);
    void before;
  }
}

console.log(`HTML-аркуш каравану: ${inventory} елементів у переліку (${Object.keys(SKIP).length} свідомо пропущено); кроків порівняно: ${compared}`);
console.log(failures ? `FAIL (${failures})` : "OK");
process.exit(failures ? 1 : 0);
