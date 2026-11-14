// Runs the real HTML caravan sheet (pustelnyky-caravan/src/caravan.src.html) in Node, without a browser:
// its inline script runs in a sandbox with a fake DOM that records the event listeners, so the test
// can press its buttons and type into its fields. Used by tests/caravan-parity.test.mjs.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = new URL("../../pustelnyky-caravan/src/caravan.src.html", import.meta.url);

/** The page's main inline script (the IIFE), with S exposed for the test */
function pageScript() {
  const html = readFileSync(SRC, "utf8");
  const start = html.indexOf("<script>\n(function () {");
  if (start < 0) throw new Error("caravan sheet: main script not found");
  let code = html.slice(start + "<script>".length, html.indexOf("</script>", start));
  const end = code.lastIndexOf("})();");
  code = code.slice(0, end) +
    "globalThis.__cv = { getS: () => S, setS: (v) => { S = v; }, derived, normalize, clampAfter, salePrices, LOCK_KEYS, IMPS };\n" +
    code.slice(end);
  return { code, html };
}

/** Accepts any property access or call (DOM pieces the rules never need) */
function stub() {
  const fn = function () { return stub(); };
  return new Proxy(fn, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => "" : k === "then" || typeof k === "symbol" ? undefined : k === "length" ? 0 : stub()),
    set: () => true,
    apply: () => stub(),
  });
}

/** A DOM element that keeps what the script needs (value, dataset, classes, listeners) and swallows the rest */
function makeEl(id, registry) {
  const listeners = {};
  const classes = new Set();
  const own = {
    id, value: "", textContent: "", innerHTML: "", hidden: false, disabled: false, checked: false, open: false,
    tagName: "DIV", isConnected: true, offsetWidth: 0, scrollHeight: 0,
    dataset: {}, style: stub(), _listeners: listeners,
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c), toggle: (c, on) => ((on ?? !classes.has(c)) ? classes.add(c) : classes.delete(c)),
    },
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    removeEventListener() {}, setAttribute() {}, getAttribute: () => null, removeAttribute() {},
    focus() {}, blur() {}, scrollIntoView() {}, select() {}, remove() {}, append() {}, appendChild: (x) => x,
    insertAdjacentHTML() {}, contains: () => false, matches: () => false,
    closest: () => null, querySelector: () => makeEl("", registry), querySelectorAll: () => [],
    getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
    children: [], childNodes: [],
    click() { (listeners.click || []).forEach((fn) => fn({ target: el, currentTarget: el, preventDefault() {}, stopPropagation() {} })); },
  };
  const el = new Proxy(own, {
    get: (t, k) => (k in t ? t[k] : typeof k === "symbol" ? undefined : stub()),
    set: (t, k, v) => ((t[k] = v), true),
  });
  if (id) own.parentElement = makeEl("", registry);
  return el;
}

/**
 * @param {object} opts  { random(): number in [0,1) — the page's Math.random }
 */
export function loadHtmlCaravan({ random = Math.random } = {}) {
  const { code, html } = pageScript();
  const els = new Map();
  const byId = (id) => {
    if (!els.has(id)) els.set(id, makeEl(id, els));
    return els.get(id);
  };
  byId("vehBrahmin").dataset.veh = "0";
  byId("vehTachka").dataset.veh = "1";
  const docListeners = {};
  const toasts = [];
  const document = {
    getElementById: byId,
    querySelector: () => makeEl("", els),
    querySelectorAll: (sel) => (sel === ".veh-opt" ? [byId("vehBrahmin"), byId("vehTachka")] : []),
    createElement: () => makeEl("", els),
    addEventListener: (type, fn) => (docListeners[type] ||= []).push(fn),
    removeEventListener() {},
    documentElement: makeEl("", els), body: makeEl("", els), activeElement: null,
    execCommand: () => false, fonts: { ready: Promise.resolve() },
  };
  const ctx = {
    console, JSON, Object, Array, String, Number, Boolean, Date, Set, Map, WeakMap, RegExp, Error, TypeError, Symbol, Promise,
    parseInt, parseFloat, isNaN, isFinite, Uint8Array, Uint32Array, Proxy, Blob: class {}, URL: { createObjectURL: () => "", revokeObjectURL() {} },
    Math: Object.assign(Object.create(Math), { random: () => ctx.__random() }),
    setTimeout: () => 0, clearTimeout() {}, requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    ResizeObserver: class { observe() {} disconnect() {} },
    FileReader: class {}, atob: (s) => Buffer.from(s, "base64").toString("binary"),
    document, __random: random,
    addEventListener() {}, removeEventListener() {},
    PDFLib: undefined, fontkit: undefined,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(code, ctx, { filename: "caravan.src.html" });
  const api = ctx.__cv;
  // toasts: read the text the page writes into #toastText
  const toastText = byId("toastText");

  const fire = (target, type, list) => (list || []).forEach((fn) => fn({ target, currentTarget: target, key: "", preventDefault() {}, stopPropagation() {} }));
  /** an element found by closest("[data-…]") in the page's delegated handlers */
  const delegated = (dataset, extra = {}) => {
    const classes = new Set();
    const t = {
      dataset: { ...dataset }, disabled: false, tagName: "BUTTON", isConnected: true, style: {}, textContent: "", innerHTML: "", title: "",
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle() {} },
      setAttribute() {}, getAttribute: () => null, matches: () => true, ...extra,
    };
    t.closest = (sel) => {
      const m = /^\[data-([a-z-]+)\]$/.exec(sel);
      if (!m) return null;
      const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return key in t.dataset ? t : null;
    };
    return t;
  };

  return {
    html, els, docListeners, api,
    getState: () => JSON.parse(JSON.stringify(api.getS())),
    setState: (s) => api.setS(api.normalize(JSON.parse(JSON.stringify(s)))),
    setRandom: (fn) => { ctx.__random = fn; },
    lastToast: () => toastText.textContent,
    /** ids that got a listener of this type */
    listened: (type) => [...els.values()].filter((e) => e._listeners[type]?.length).map((e) => e.id).filter(Boolean),
    /** click a button by id (confirmTwice buttons: twice) */
    click: (id, times = 1) => { for (let i = 0; i < times; i++) fire(byId(id), "click", byId(id)._listeners.click); },
    /** type into a field by id: input + change, like a player */
    type: (id, value) => {
      const el = byId(id);
      el.value = String(value);
      fire(el, "input", el._listeners.input);
      fire(el, "change", el._listeners.change);
      fire(el, "blur", el._listeners.blur);
    },
    /** a delegated button (data-step, data-pip, data-imp-btn, data-seg, data-roll, data-*-del); deletes need two clicks */
    clickData: (dataset, times = 1) => {
      const t = delegated(dataset);
      for (let i = 0; i < times; i++) fire(t, "click", docListeners.click);
    },
    /** a delegated field (cargo rows, counter names and sizes, custom upgrades) */
    typeData: (dataset, value, tagName = "INPUT") => {
      const t = delegated(dataset, { tagName, value: String(value) });
      fire(t, "input", docListeners.input);
      fire(t, "change", docListeners.change);
    },
  };
}
