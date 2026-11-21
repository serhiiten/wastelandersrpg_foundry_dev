// «Застосувати» of the perks in the HTML character sheet and in Foundry (row 3.2 of the backport, author 2026-11-19).
// The sheet's perks.js is the source of module/rules/perk-uses.mjs (tools/port_rules.py); this test runs the real page
// (tests/html-sandbox.mjs) next to Foundry's controller and checks that they stay one rule:
//   1. the uses' data are the same, except Foundry's words about the target (T) in two texts (PERKS_PATCHES);
//   2. the pure helpers give the same answers;
//   3. every use pressed on both sheets with the same dice gives the same result lines and the same state;
//   4. the marks come off the same way («Кінець сцени» / «Новий день» / «Кінець сесії», «Скинути лічильники», one click);
//   5. the buttons that are off refuse with the same words.
// Run: node tests/perk-uses-html.test.mjs
import * as R from "../module/rules/core.mjs";
import { createLogic } from "../module/rules/logic.mjs";
import { createController } from "../module/rules/controller.mjs";
import { PERK_USES, usesFor, strangerOutcome, maxDamage } from "../module/rules/perk-uses.mjs";
import { loadHtmlSheet } from "./html-sandbox.mjs";

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const J = (x) => JSON.stringify(x);
const clone = (o) => JSON.parse(JSON.stringify(o));
const canon = (v) =>
  Array.isArray(v) ? v.map(canon)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).filter((k) => !k.startsWith("_")).sort().map((k) => [k, canon(v[k])]))
      : v;

// one dice stream for both sides: Math.random, crypto (the page's rnd and logic.mjs), the page's sandbox
let seed = 1;
const stream = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const realRandom = Math.random, realNow = Date.now;
Math.random = () => stream();
Date.now = () => 1700000000000;
globalThis.crypto.getRandomValues = (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(stream() * 2 ** 32); return a; };
const rngFoundry = (n) => 1 + (Math.floor(stream() * 2 ** 32) % n); // = the page's rnd(n) on the same stream

const page = loadHtmlSheet({ random: () => stream() });
page.setEngineRng(() => stream());
R.setRandom(() => stream());

/* 1. data */
const HTML_TAIL = {
  "touch-heal": [" ОЗ цілі зміни в її аркуші (себе — полем ОЗ).", " Ціль — позначена T (себе теж: познач свій токен)."],
  "touch-back": [" ОЗ цілі зміни в її аркуші.", " Ціль — позначена T."],
};
const pageUses = JSON.parse(page.run("JSON.stringify(PERK_USES)"));
ok(pageUses.length === PERK_USES.length && PERK_USES.length === 38, `38 uses on both sides (${pageUses.length} | ${PERK_USES.length})`);
for (const f of PERK_USES) {
  const h = pageUses.find((u) => u.id === f.id);
  if (!h) { ok(false, `«${f.id}» is in the page`); continue; }
  const tail = HTML_TAIL[f.id];
  const hs = tail ? h.short.replace(tail[0], tail[1]) : h.short;
  ok(!tail || h.short.endsWith(tail[0]), `«${f.id}»: the page's text ends with its own words about the target`);
  ok(J(canon({ ...h, short: hs })) === J(canon(f)), `«${f.id}»: the same use (${J(h).slice(0, 120)} | ${J(f).slice(0, 120)})`);
}
ok(J(pageUses.map((u) => u.id)) === J(PERK_USES.map((u) => u.id)), "the same order");

/* 2. helpers */
for (const cat of ["", "statists", "regular", "elite", "boss"]) {
  for (let total = -2; total <= 16; total++) {
    const h = JSON.parse(page.run(`JSON.stringify(strangerOutcome(${total}, ${J(cat)}))`));
    ok(J(h) === J(strangerOutcome(total, cat)), `strangerOutcome(${total}, «${cat}»)`);
  }
}
for (const f of ["2d6", "1d10+2", "d8", "3к6-1", "7", "", "2d6kl1", "крутий ніж"]) {
  ok(J(page.run(`maxDamage(${J(f)})`)) === J(maxDamage(f)), `maxDamage(«${f}»)`);
}

/* 3–5. behaviour */
const HAS = Object.fromEntries(PERK_USES.map((u) => [u.id, u]));
/** a random character with the use's perk or feat, a gun in hand, Припаси 2 */
function stateFor(id, c, extra = {}) {
  seed = 900 + c;
  const st = clone(R.rollCharacter(null));
  const u = HAS[id];
  if (u.feat) { if (!st.feats.includes(u.perk)) st.feats.push(u.perk); }
  else if (!st.perks.some((p) => p.n === u.perk)) st.perks.push({ n: u.perk, note: "" });
  st.supplies = 2;
  st.fdCur = "";
  if (id === "speed") st.feats = st.feats.filter((f) => f !== "Вибивайло" && f !== "Точність"); // they switch it off (below)
  if (!st.weapons.length) st.weapons.push({ n: "Пістолет 10 мм", d: "2d6", h: false, en: "", note: "", hand: true });
  else st.weapons[0].hand = true;
  Object.assign(st, extra.st || {});
  if (extra.chem) st.chem = Object.assign(st.chem || {}, extra.chem);
  // the page's mergeState is what both start from
  page.setState(st);
  return page.getState();
}

/** the same steps on both sheets; returns { h, f } with the state, the toasts and the last result */
function both(st0, steps, s) {
  page.setState(st0);
  page.toasts.length = 0;
  page.run("chemSeq = 0; ui.pkRes = {};");
  seed = s;
  for (const [a, d] of steps) page.act(a, d || {});
  page.run("chem();"); // what the page's render() does
  const h = { st: canon(page.getState()), toasts: page.toasts.map((t) => t[1]), res: JSON.parse(page.run("JSON.stringify(ui.pkRes)")) };

  const st = clone(st0);
  const toasts = [];
  const L = createLogic({ st, toast: (m) => toasts.push(String(m)), ui: {} });
  const C = createController(st, L, { toast: (m) => toasts.push(String(m)), rng: rngFoundry });
  seed = s;
  let last = {};
  for (const [a, d] of steps) {
    C.act(a, d || {});
    const r = C.lastPerk();
    if (a === "perk-use" && r && r.name) last[d.id] = r.lines;
  }
  L.chem(); // what the page's render() does: the chem counters' defaults (dayNo, sceneNo…)
  return { h, f: { st: canon(st), toasts, res: last } };
}

const diff = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => J(a[k]) !== J(b[k]));

for (const u of PERK_USES) {
  if (u.show) continue; // «Друге дихання»: only its mark («0 ОЗ»)
  for (let c = 0; c < 4; c++) {
    const extra = u.id === "cannibal" && c % 2 ? { chem: { addictions: [{ drug: "Людська плоть", incurable: false, since: 1, lastUse: 1 }] } } : {};
    const st0 = stateFor(u.id, c, extra);
    const { h, f } = both(st0, [["perk-use", { id: u.id }]], 4000 + c * 31);
    const keys = diff(h.st, f.st);
    ok(!keys.length, `«${u.id}» #${c}: the same state (${keys.join(",")}: ${J(h.st[keys[0]])?.slice(0, 120)} | ${J(f.st[keys[0]])?.slice(0, 120)})`);
    ok(J(h.res[u.id]?.lines) === J(f.res[u.id]), `«${u.id}» #${c}: the same result lines (${J(h.res[u.id]?.lines)} | ${J(f.res[u.id])})`);
    if (u.per && !u.engine) ok(!!h.st.chem?.perkUse?.[u.id], `«${u.id}» #${c}: marked on the page`);
    if (!u.per && !u.engine) ok(!h.st.chem?.perkUse?.[u.id], `«${u.id}» #${c}: no mark`);
  }
}

// the marks: pressed, then the time buttons, «Скинути лічильники», one click; the same state after each and the same uses back
const SEQ = [
  [["perk-use", { id: "chemist" }], ["chem-scene"]],
  [["perk-use", { id: "touch-back" }], ["chem-scene"], ["chem-session"]],
  [["perk-use", { id: "cannibal" }], ["chem-scene"], ["chem-day"]],
  [["perk-use", { id: "message" }], ["chem-day"]],
  [["perk-use", { id: "rage" }], ["chem-scene"], ["chem-session"]],
  [["perk-use", { id: "chemist" }], ["perk-use", { id: "touch-heal" }], ["perk-free", { id: "chemist" }]],
  [["perk-use", { id: "touch-back" }], ["perk-use", { id: "rage" }], ["ko-wind"], ["chem-reset"]],
  [["perk-use", { id: "chemist" }], ["perk-use", { id: "chemist" }]], // used: refused
];
const ALL = ["Хімік", "Цілющий дотик", "Канібал", "Послання", "Лють ботана", "Друге дихання"];
for (const [i, steps] of SEQ.entries()) {
  for (let k = 1; k <= steps.length; k++) {
    seed = 77 + i;
    const st = clone(R.rollCharacter(null));
    for (const n of ALL) if (!st.perks.some((p) => p.n === n)) st.perks.push({ n, note: "" });
    st.supplies = 3;
    page.setState(st);
    const st0 = page.getState();
    const { h, f } = both(st0, steps.slice(0, k), 6000 + i);
    const keys = diff(h.st, f.st);
    ok(!keys.length, `marks ${i}, step ${k} (${steps[k - 1][0]}): the same state (${keys.join(",")}: ${J(h.st[keys[0]])?.slice(0, 120)} | ${J(f.st[keys[0]])?.slice(0, 120)})`);
    const hu = J(usesFor(h.st).filter((u) => u.used).map((u) => u.id)), fu = J(usesFor(f.st).filter((u) => u.used).map((u) => u.id));
    ok(hu === fu, `marks ${i}, step ${k}: the same uses marked (${hu} | ${fu})`);
    const pageUsed = page.run("JSON.stringify(usesFor(st, compute(st)).filter(u=>u.used).map(u=>u.id))");
    ok(pageUsed === hu, `marks ${i}, step ${k}: the page's own usesFor agrees (${pageUsed} | ${hu})`);
  }
}
// after «Скинути лічильники» nothing is marked, «Друге дихання» too
{
  seed = 5;
  const st = clone(R.rollCharacter(null));
  for (const n of ALL) if (!st.perks.some((p) => p.n === n)) st.perks.push({ n, note: "" });
  st.supplies = 3;
  page.setState(st);
  const { h } = both(page.getState(), [["perk-use", { id: "chemist" }], ["perk-use", { id: "cannibal" }], ["ko-wind"], ["chem-reset"]], 31);
  ok(J(h.st.chem.perkUse) === "{}" && !h.st.chem.swSession, `«Скинути лічильники» clears the marks and «Друге дихання» (${J(h.st.chem.perkUse)}, ${h.st.chem.swSession})`);
  ok(J(h.res) === "{}", "«Скинути лічильники» clears the results on the cards");
}

// off: the same refusal
const OFF = [
  ["chemist", { st: { supplies: 0 } }, "Немає Припасів."],
  ["cursed", { st: { fdCur: "0" } }, "Жетонів Долі не лишилося."],
  ["speed", { st: { feats: ["Вибивайло"] } }, "Не діє з особливостями «Вибивайло» чи «Точність»."],
];
for (const [id, extra, msg] of OFF) {
  const st0 = stateFor(id, 1, extra);
  const { h, f } = both(st0, [["perk-use", { id }]], 99);
  ok(h.toasts.includes(msg) && f.toasts.includes(msg), `«${id}» off: «${msg}» on both (${J(h.toasts)} | ${J(f.toasts)})`);
  ok(!h.st.chem?.perkUse?.[id] && !h.res[id], `«${id}» off: no mark, no result on the card`);
}
// the result on the card: shown while marked, gone after «Кінець сцени» (a scene use) and after one click
{
  const st0 = stateFor("chemist", 2);
  page.setState(st0);
  page.run("ui.pkRes = {};");
  page.act("perk-use", { id: "chemist" });
  ok(page.run("!!pkResNow('chemist')"), "the result shows on the card");
  page.act("chem-scene");
  ok(page.run("!pkResNow('chemist')"), "«Кінець сцени»: the result goes with the mark");
  page.act("perk-use", { id: "forager" });
  ok(page.run("!pkResNow('forager')"), "«Здобувач» is not the character's here");
  page.run("st.perks.push({n:'Здобувач', note:''});");
  page.act("perk-use", { id: "forager" });
  ok(page.run("!!pkResNow('forager')"), "a use without a mark («Здобувач») shows its result in the scene");
  page.act("chem-scene");
  ok(page.run("!pkResNow('forager')"), "… and not after «Кінець сцени»");
}

Math.random = realRandom;
Date.now = realNow;
R.setRandom(null);
console.log(`perk-uses-html: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
