// Відповідність HTML-аркуша й аркуша Foundry. Run: node tests/parity.test.mjs  (or with --verbose)
//
// 1. Перелік функцій. Every button (data-act), field (data-k), check-panel control (data-r), special
//    select (data-act-change) and form state (data-ui) of the HTML sheet must be either found in the
//    Foundry sheet / check panel, or listed in SKIP with a reason. Anything new in the HTML sheet that
//    this file does not know about fails the test.
// 2. Поведінка. The real HTML sheet (run in a sandbox, tests/html-sandbox.mjs) and the Foundry code
//    (controller + logic, through the actor round trip) perform the same actions on the same characters
//    with the same dice; the resulting states and messages must match.
import { readFileSync } from "node:fs";
import * as R from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { createController } from "../module/rules/controller.mjs";
import { actorToState, mergeSystem, planSync, stateToActor } from "../module/rules/character-adapter.mjs";
import { loadHtmlSheet } from "./html-sandbox.mjs";

const VERBOSE = process.argv.includes("--verbose");
const failures = [];
const fail = (msg) => failures.push(msg);

/* ================================================================== */
/*  1. Перелік функцій                                                 */
/* ================================================================== */

const HTML_SRC = new URL("../../pustelnyky-character-generator/src/", import.meta.url);
const html = ["app.js", "chem.js", "roller.js", "gamedata.js", "template.html"].map((f) => readFileSync(new URL(f, HTML_SRC), "utf8")).join("\n");
const foundry = [
  "../templates/actor/character-v2.hbs", "../templates/actor/parts/pust-picker.hbs", "../templates/actor/parts/pust-ko.hbs", "../templates/apps/check-panel.hbs",
  "../module/sheets/character-sheet-v2.mjs", "../module/sheets/character-view.mjs", "../module/applications/check-panel.mjs",
].map((f) => readFileSync(new URL(f, import.meta.url), "utf8")).join("\n");
// the check panel's content is drawn by the HTML sheet's own renderer, ported into logic.mjs
const foundryPanel = readFileSync(new URL("../module/rules/logic.mjs", import.meta.url), "utf8");

// dynamic parts → N: '+i+' in the HTML sheet, {{i}} / {{../k}} in Handlebars
const normHtml = (s) => s.replace(/'\s*\+[^+]*\+\s*'/g, "N").replace(/\.\d+(?=\.|$)/g, ".N");
const normHbs = (s) => s.replace(/\{\{[^}]*\}\}/g, "N").replace(/\.\d+(?=\.|$)/g, ".N");
const grab = (text, re, norm) => new Set([...text.matchAll(re)].map((m) => norm(m[1])));

// HTML features, by kind
const H = {
  act: grab(html, /data-act="([^"]+)"/g, normHtml),
  k: grab(html, /data-k="([^"]+)"/g, normHtml),
  r: grab(html, /data-r="([^"]+)"/g, normHtml),
  change: grab(html, /data-act-change="([^"]+)"/g, normHtml),
  ui: grab(html, /data-ui="([^"]+)"/g, normHtml),
};
// actions hidden behind a dynamic data-act (N, N-add, N-del): read from the handlers' case lists
const caseNames = (fnStart) => {
  const i = html.indexOf(fnStart);
  const body = html.slice(i, html.indexOf("\n}\n", i));
  return [...body.matchAll(/case '([a-z0-9-]+)'/g)].map((m) => m[1]);
};
caseNames("function act(e)").forEach((a) => H.act.add(a));
caseNames("function chemAct(a, b)").forEach((a) => H.act.add(a));
["N", "N-add", "N-del"].forEach((x) => H.act.delete(x));
H.k.delete("N"); // set.N etc. are listed with their real keys below
for (const k of ["claws", "psi", "pa", "free", "hand", "guns"]) H.k.add(`set.${k}`);
H.k.delete("set.N");
// check panel: buttons are data-r too; its handler's case list names them all
caseNames("document.addEventListener('click', e=>{\n  const b=e.target.closest('[data-r]')").forEach((a) => H.r.add(a));
H.r.delete("N");

// Foundry features
const F = {
  act: grab(foundry, /data-act="([^"]+)"/g, normHbs),
  k: grab(foundry, /data-k="([^"]+)"/g, normHbs),
  r: new Set([...grab(foundry, /data-r="([^"]+)"/g, normHbs), ...grab(foundry, /data-action="([^"]+)"/g, normHbs)]),
  change: grab(foundry, /data-change="([^"]+)"/g, normHbs),
  ui: new Set([...grab(foundry, /data-ui="([^"]+)"/g, normHbs), ...grab(foundry, /data-ui-rest="([^"]+)"/g, normHbs)]),
};
F.act.add("perk-add").add("feat-add"); // the picker's data-act="{{kind}}-add"
F.act.delete("N-add");
// the check panel: its content and controls are the HTML renderer and handlers themselves
if (/function rollerClick\(b\)/.test(foundryPanel) && /function rollerChange\(t\)/.test(foundryPanel)
  && /L\.renderRoller\(\)/.test(foundry) && /L\.rollerClick\(/.test(foundry) && /L\.rollerChange\(/.test(foundry)) {
  grab(foundryPanel, /data-r="([^"]+)"/g, normHtml).forEach((x) => F.r.add(x));
  const i = foundryPanel.indexOf("function rollerClick(b)");
  [...foundryPanel.slice(i, foundryPanel.indexOf("\n  }\n", i)).matchAll(/case '([a-z0-9-]+)'/g)].forEach((m) => F.r.add(m[1]));
  grab(foundryPanel, /data-k="([^"]+)"/g, normHtml).forEach((x) => F.k.add(x)); // e.g. data-k="sav" on «Савант» XP
}
for (const m of foundry.matchAll(/data-k="set\.([a-z]+)"/g)) F.k.add(`set.${m[1]}`);

/**
 * HTML feature → Foundry evidence. A string names the Foundry feature that does the same
 * (same kind unless prefixed "act:", "k:", "r:", "change:", "ui:", "action:"). SKIP: not in Foundry, why.
 */
const SAME = {
  // the Foundry sheet's own buttons doing what the HTML sheet's button does
  "act:sit-add": "action:sitAdd",
  "act:chem-add-new": "action:addictionAdd",
  "act:custom-open": "action:customForm",
  "act:custom-cancel": "action:customForm",
  "act:custom-save": "action:customSave",
  "act:pick": "action:pick",
  "act:cat-toggle": "action:uiToggle",
  "act:guide": "action:uiToggle",
  "act:guide-go": "action:pustTab",
  "act:qs": "action:quickStart",
  "act:qs-load": "action:quickStart",
  "act:json": "action:jsonSave",
  "act:open": "action:jsonOpen",
  "act:consq-roll": "action:checkPanel",
  "k:supplies": "act:sup-set", // Припаси are set by lamps (Мотлох and the quick panel), no number field
  "act:dismiss": "SKIP",
  "ui:restN": "ui:restMedic",
  "ui:restQr": "ui:restQr",
  // the same field under a template loop: loot.yao / loot.egg; weapon and armor mods
  "k:loot.N": "k:loot.yao",
  "k:N.N.mods.N.n": "k:armor.N.mods.N.n",
  "k:N.N.mods.N.u": "k:armor.N.mods.N.u",
};
const SKIP = {
  "act:pdf": "PDF не потрібен у Foundry (рішення автора)",
  "act:txt": "текстовий експорт не потрібен у Foundry (рішення автора)",
  "act:copy": "текстовий експорт не потрібен у Foundry (рішення автора)",
  "act:theme": "тема — налаштування Foundry",
  "act:tab": "вкладки аркуша Foundry (pustTab)",
  "act:fold": "згортання блоків — немає в аркуші Foundry, блоки на вкладках",
  "act:fold-all": "згортання блоків — немає в аркуші Foundry, блоки на вкладках",
  "act:more": "меню «Ще» сторінки",
  "act:close-modal": "модальне вікно сторінки",
  "act:dismiss": "банер «Це приклад персонажа» сторінки",
  "act:portrait-del": "портрет — зображення актора; Foundry має власний вибір зображення",
  "k:set.hand": "рукописний шрифт — лише для PDF, а PDF у Foundry не потрібен",
  "ui:q": "пошук у списку — є (data-ui=q)",
  "ui:cat": "каталог відкрито/закрито — uiToggle cat",
};

function covered(kind, feature) {
  const id = `${kind}:${feature}`;
  if (SKIP[id]) return true;
  const same = SAME[id];
  if (same === "SKIP") return true;
  if (same) {
    const [k2, f2] = same.split(":");
    if (k2 === "action") return new RegExp(`data-action="${f2}"|${f2}:`).test(foundry);
    return F[k2]?.has(f2);
  }
  return F[kind]?.has(feature);
}

const missing = [];
for (const kind of ["act", "k", "r", "change", "ui"]) {
  for (const feature of [...H[kind]].sort()) if (!covered(kind, feature)) missing.push(`${kind}:${feature}`);
}
if (missing.length) fail(`Перелік: у Foundry немає ${missing.length} функцій HTML-аркуша:\n    ${missing.join("\n    ")}`);

/* ================================================================== */
/*  2. Поведінка                                                       */
/* ================================================================== */

// one shared, resettable dice stream for both sides (engine RNG, Math.random, crypto dice)
let seed = 1;
const stream = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const realRandom = Math.random;
const realNow = Date.now;
Date.now = () => 1700000000000; // chem effect ids carry the time
Math.random = () => stream();
globalThis.crypto.getRandomValues = (a) => {
  for (let i = 0; i < a.length; i++) a[i] = Math.floor(stream() * 2 ** 32);
  return a;
};

const sheet = loadHtmlSheet({ random: () => stream() });
sheet.setEngineRng(() => stream());
R.setRandom(() => stream());

const clone = (o) => JSON.parse(JSON.stringify(o));
const canon = (v) =>
  Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).filter((k) => !k.startsWith("_")).sort().map((k) => [k, canon(v[k])]))
      : v;
let idSeq = 0;
const newId = () => `id${String(++idSeq).padStart(14, "0")}`;

/** Names the wiki changed: the Foundry rules use the wiki's, the HTML sheet its own (tools/port_rules.py) */
const RENAMES = { "В кожному порту": "У кожному порту", "Загадковий незнайомець (або незнайомка)": "Загадковий незнайомець" };
const renameState = (st, map) => JSON.parse(Object.entries(map).reduce(
  (t, [a, b]) => t.split(JSON.stringify(a)).join(JSON.stringify(b)), JSON.stringify(st)));
const toHtml = (st) => renameState(st, RENAMES);
const fromHtml = (st) => renameState(st, Object.fromEntries(Object.entries(RENAMES).map(([a, b]) => [b, a])));

/** Run an action on the HTML sheet; returns { st, toasts } */
function onHtml(st0, step, s) {
  sheet.setState(toHtml(st0));
  sheet.toasts.length = 0;
  sheet.run("chemSeq = 0;");
  seed = s;
  step.html(sheet);
  sheet.run("syncAuto(st); if(typeof chemKO==='function') chemKO();"); // what the page's render() does
  return { st: fromHtml(sheet.getState()), toasts: sheet.toasts.map((t) => fromHtml(t[1])) };
}

/** Run the same action in Foundry: actor round trip, controller / logic, save, read back */
function onFoundry(st0, step, s) {
  const actor = clone(stateToActor(st0));
  actor.items.forEach((it) => (it._id = newId()));
  const st = actorToState(actor, { withIds: true });
  const toasts = [];
  const toast = (m) => toasts.push(String(m));
  const L = createLogic({ st, toast, ui: step.ui || {} });
  const C = createController(st, L, { toast });
  seed = s;
  step.foundry(C, L, st);
  R.syncAuto(st);
  L.chemKO();
  const plan = planSync(actor, st);
  const a = clone(actor);
  a.name = plan.name;
  a.system = mergeSystem(a.system, plan.system);
  for (const u of plan.update) {
    const it = a.items.find((x) => x._id === u._id);
    if (u.name) it.name = u.name;
    it.sort = u.sort;
    it.system = clone(u.system);
  }
  a.items = a.items.filter((x) => !plan.delete.includes(x._id));
  for (const c of plan.create) a.items.push({ ...clone(c), _id: newId() });
  // what Foundry itself refuses: items must have a name
  for (const it of [...plan.create, ...plan.update]) {
    if ("name" in it && !String(it.name ?? "").trim()) throw new Error(`Foundry не створить предмет без назви (${it.type || "оновлення"})`);
  }
  return { st: actorToState(a), toasts };
}

/** Steps: what to press, on both sheets. html(H) uses the sandbox API; foundry(C, L, st) the Foundry code. */
const act = (name, data = {}) => ({ name: `${name} ${JSON.stringify(data)}`, html: (S) => S.act(name, data), foundry: (C) => C.act(name, data) });
const field = (k, v, opts = {}) => {
  const o = typeof v === "boolean" ? { type: "checkbox", ...opts } : opts;
  return { name: `поле ${k}=${JSON.stringify(v)}`, html: (S) => S.change(k, v, o), foundry: (C) => C.setField(k, v, o) };
};

// Manual bonuses and defences change only in «Вільний режим» in Foundry (author, 2026-11-14): compared in free mode
const FREE = { type: "checkbox" };
// «Новий день» and «Кінець сесії» end the scene first in Foundry (author, 2026-11-14): compared with the HTML sheet
// pressing «Кінець сцени» before them; the log line and the toasts say more, so they are left out
const afterScene = (name) => ({
  name: `${name} (з кінцем сцени)`,
  html: (S) => { S.act("chem-scene", {}); return S.act(name, {}); },
  foundry: (C) => C.act(name, {}),
  fix: (X) => { if (X.chem) delete X.chem.last; },
  skipToasts: true,
});
const inFree = (step) => ({
  name: step.name + " (вільний режим)",
  html: (S) => { S.change("set.free", true, FREE); return step.html(S); },
  foundry: (C) => { C.setField("set.free", true, FREE); return step.foundry(C); },
});

function stepsFor(st) {
  const steps = [
    act("gender", { v: "f" }), act("roll-name"), act("roll-asp", { i: "1" }), act("roll-detail"), act("roll-species"),
    act("roll-perks"), act("roll-feats"), act("roll-gear"), act("apply-arch"),
    act("attr", { k: "SL", d: "1" }), act("attr", { k: "VTR", d: "-1" }), { ...act("skill", { s: "Атлетика", l: "1" }), skipToasts: true }, // Foundry's refusal says where new skills come from
    act("perk-add", { n: R.PERKS[st.name.length % R.PERKS.length].n }), act("perk-del", { i: "0" }),
    act("feat-add", { n: R.FEATS[st.name.length % R.FEATS.length].n }), act("feat-del", { i: "0" }),
    act("imp", { k: "perk", i: "0" }), act("imp", { k: "skill2", i: "0" }),
    act("row-add", { l: "weapons" }), act("row-add", { l: "armor" }), act("row-add", { l: "other" }), act("row-del", { l: "weapons", i: "0" }),
    act("cat-add", { id: R.catalogAll(false)[st.name.length % 40].id }),
    act("step", { k: "hpCur", d: "-3" }), act("step", { k: "hpCur", d: "1" }), act("step", { k: "fdCur", d: "-1" }),
    act("step", { k: "hpRed", d: "1" }), act("step", { k: "caps", d: "5" }), act("step", { k: "xp", d: "1" }),
    act("step", { k: "supplies", d: "1" }), act("sup-set", { n: "1" }),
    act("sit-quick", { t: "Збитий з ніг" }), inFree(act("def-reset")), inFree(act("ov-reset", { k: "hpMaxOv" })),
    act("chem-scene"), afterScene("chem-day"), afterScene("chem-session"), act("rest"), act("rage"), act("ko-fate"), act("ko-wind"), act("ko-quick"), act("chem-reset"),
    act("random"), act("new"),
    field("species", "ghoul"), field("arch", "Псионік"), field("exp", "point"), field("set.free", true), field("set.psi", false),
    field("cons.l", "Подряпина"), field("consT.l", true), field("hpCur", "99"), field("supplies", "9", { num: true }),
    field("loot.yao", true), inFree(field("defOv.rad", "immune")), inFree(field("hpMaxOv", "3")),
    {
      name: "sit-add",
      html: (S) => S.run("sitAdd('Під прицілом')"),
      foundry: (C) => C.act("sit-add", { t: "Під прицілом" }),
    },
  ];
  st.other.forEach((o, i) => { if (R.drugOf(o.n)) steps.push(act("chem-use", { i: String(i) })); });
  st.weapons.forEach((w, i) => {
    steps.push(field(`weapons.${i}.hand`, !w.hand), field(`weapons.${i}.h`, !w.h, { type: "checkbox" }), field(`weapons.${i}.n`, "Труба"));
  });
  st.armor.forEach((a, i) => steps.push(field(`armor.${i}.w`, !(a.w !== false), { type: "checkbox" })));
  return steps;
}

let compared = 0;
const diffs = {};
for (let c = 0; c < 60; c++) {
  sheet.setEngineRng(() => stream());
  R.setRandom(() => stream());
  seed = 1000 + c;
  const st0 = clone(R.rollCharacter(null));
  for (const step of stepsFor(st0)) {
    const s = 5000 + c * 97;
    let h;
    let f;
    try {
      h = onHtml(st0, step, s);
    } catch (err) {
      diffs[`${step.name}: HTML впав: ${err.message}`] ||= c;
      continue;
    }
    try {
      f = onFoundry(st0, step, s);
    } catch (err) {
      diffs[`${step.name}: Foundry впав: ${err.message}`] ||= c;
      continue;
    }
    compared++;
    const A = canon(h.st);
    const B = canon(f.st);
    if (step.fix) { step.fix(A); step.fix(B); }
    const keys = [...new Set([...Object.keys(A), ...Object.keys(B)])].filter((k) => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
    if (keys.length) {
      const k = keys[0];
      diffs[`${step.name.split(" ")[0]} → ${keys.join(",")}`] ||= `персонаж ${c}: ${k}: HTML ${JSON.stringify(A[k])?.slice(0, 140)} | Foundry ${JSON.stringify(B[k])?.slice(0, 140)}`;
    }
    if (!step.skipToasts && JSON.stringify(h.toasts) !== JSON.stringify(f.toasts)) {
      diffs[`${step.name.split(" ")[0]} → повідомлення`] ||= `HTML ${JSON.stringify(h.toasts).slice(0, 160)} | Foundry ${JSON.stringify(f.toasts).slice(0, 160)}`;
    }
  }
}
Math.random = realRandom;
Date.now = realNow;
R.setRandom(null);
const diffList = Object.entries(diffs);
if (diffList.length) {
  fail(`Поведінка: ${diffList.length} розбіжностей (з ${compared} порівнянь):\n    ${diffList.map(([k, v]) => `${k}\n        ${v}`).join("\n    ")}`);
}

/* ================================================================== */

const total = [...Object.values(H)].reduce((s, x) => s + x.size, 0);
console.log(`HTML-аркуш: ${total} функцій у переліку; дій порівняно: ${compared}`);
if (failures.length) {
  console.log(failures.join("\n\n"));
  console.log("FAIL");
  process.exit(1);
}
console.log("OK");
