// Runs the real HTML electronic character sheet (pustelnyky-character-generator/src) in Node, without a
// browser: the page's scripts are loaded into a sandbox with stubbed DOM, storage and dice.
// Used by tests/parity.test.mjs to compare the HTML sheet with the Foundry sheet.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = new URL("../../pustelnyky-character-generator/src/", import.meta.url);
const FILES = ["gamedata.js", "engine.js", "sheet.js", "pdfform.js", "roller.js", "chem.js", "app.js"];

/** An object that accepts any property access / call (for DOM pieces the logic never really needs) */
function stub() {
  const fn = function () { return stub(); };
  return new Proxy(fn, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" ? undefined : k === "length" ? 0 : stub()),
    set: () => true,
    apply: () => stub(),
  });
}

/**
 * @param {object} opts  { random(): number in [0,1) — used for Math.random and crypto dice }
 * @returns sandbox API
 */
export function loadHtmlSheet({ random = Math.random } = {}) {
  const toasts = [];
  const ctx = {
    console,
    JSON, Object, Array, String, Number, Boolean, Date, Set, Map, RegExp, Error, TypeError, Symbol, Promise,
    parseInt, parseFloat, isNaN, isFinite, Uint32Array, Uint8Array, Proxy,
    Math: Object.assign(Object.create(Math), { random: () => ctx.__random() }),
    crypto: { getRandomValues: (a) => { for (let i = 0; i < a.length; i++) a[i] = Math.floor(ctx.__random() * 2 ** 32); return a; } },
    // delayed toasts («ОЗ не можуть бути вищими…») must still arrive: run timers at once (page timers are stubbed)
    setTimeout: (fn) => { try { if (typeof fn === "function") fn(); } catch { /* page-only timer */ } return 0; },
    clearTimeout: () => {}, requestAnimationFrame: () => 0,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    navigator: { clipboard: stub() },
    atob: (s) => Buffer.from(s, "base64").toString("binary"),
    document: stub(),
    window: null,
    __random: random,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  const code = FILES.map((f) => `// ===== ${f} =====\n${readFileSync(new URL(f, SRC), "utf8")}`).join("\n");
  vm.runInContext(code, ctx, { filename: "html-sheet.js" });
  vm.runInContext(`initData(${readFileSync(new URL("data.json", SRC), "utf8")});`, ctx);
  // page side effects off; toasts collected; confirmations («натисни ще раз») always pass
  vm.runInContext(`
    render = function(){}; persist = function(){}; renderRoller = function(){}; renderIssues = function(){};
    scheduleSheet = function(){}; autosizeAll = function(){}; closeMore = function(){}; closeQs = function(){};
    confirmStep = function(){ return true; };
    toast = function(m, k){ __toasts.push([k||'', String(m)]); };
  `, Object.assign(ctx, { __toasts: toasts }));

  const run = (src) => vm.runInContext(src, ctx);
  return {
    ctx, toasts,
    run,
    setRandom: (fn) => { ctx.__random = fn; },
    /** engine RNG (rollCharacter, names…) */
    setEngineRng: (fn) => { ctx.__rng = fn; run("RNG = __rng;"); },
    getState: () => JSON.parse(run("JSON.stringify(st)")),
    setState: (s) => { ctx.__st = JSON.parse(JSON.stringify(s)); run("st = mergeState(__st);"); },
    /** press a sheet button: data-act + dataset */
    act: (act, data = {}) => {
      ctx.__btn = { tagName: "BUTTON", dataset: { act, ...data }, classList: { contains: () => false, add() {}, remove() {}, toggle() {} }, closest() { return this; } };
      run("act({ target: { closest: () => __btn } });");
    },
    /** change a field: data-k path, value; num = data-num */
    change: (k, value, { num = false, type = "text" } = {}) => {
      ctx.__t = { id: "", dataset: { k, ...(num ? { num: "1" } : {}) }, type, value: typeof value === "boolean" ? "" : String(value), checked: !!value, tagName: "INPUT" };
      run("onChange({ target: __t });");
    },
    /** a select with data-act-change (fav, erudit) */
    actChange: (kind, value, data = {}) => {
      ctx.__t = { id: "", dataset: { actChange: kind, ...data }, value: String(value), tagName: "SELECT" };
      run("onChange({ target: __t });");
    },
    /** the check panel: R state and its functions */
    roller: (src) => run(src),
  };
}
