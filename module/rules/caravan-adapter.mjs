/**
 * Translation between a Foundry caravan actor and the HTML caravan sheet's state (S, its .json).
 *
 *   stateToCaravan(S)              → { name, system, items[] }   (items carry the engine's data)
 *   caravanToState(actor, opts)    → S                           ({ withIds } tags rows for planCaravanSync)
 *   planCaravanSync(actor, S)      → item operations + system to write a changed S back
 *
 * Upgrades become upgrade items (from the compendium by name) with active.value = how many times taken;
 * own upgrades, cargo and passengers become items too. Values Foundry has no field for travel in
 * system.engine (actor and items), so a .json round trip loses nothing.
 */
import { IMPS } from "./caravan.mjs";
import { createCaravanLogic } from "./caravan-logic.mjs";
import { UNNAMED } from "./character-adapter.mjs";

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
const int = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const itemName = (n) => (String(n ?? "").trim() ? n : UNNAMED);
/** the row's own text when Foundry only trimmed it; empty for an unnamed row */
const rowText = (orig, stored) => {
  if (stored === UNNAMED && !String(orig ?? "").trim()) return orig ?? "";
  return orig != null && String(orig).trim() === String(stored ?? "").trim() ? orig : stored ?? "";
};
const norm = (s) => String(s || "").toLowerCase().replace(/\s*\(.*\)\s*$/, "").replace(/[^\p{L}\p{N}]/gu, "");

/** Caravan sheet keys of the «filled in by hand» locks ↔ Foundry `locked` keys */
const LOCKS = { name: "name", karma: "karma", budget: "budget", meeting: "meeting", lastJob: "lastJob", wentWrong: "wentWrong", imps: "upgrades", rep: "reputation" };
const MAPPED = new Set(["companyName", "luck", "karma", "karmaAspect", "reputation", "budget", "tachka", "hpCurrent", "moveCurrent",
  "supplies", "imp", "cargo", "counters", "story", "notes", "longHaul", "hpMaxOverride", "armorOverride", "armorType", "customImps", "manual"]);

/** S → actor data. Derived values (max HP, armor, range) are filled in for Foundry. */
export function stateToCaravan(S0) {
  const L = createCaravanLogic({ S: null });
  const S = L.normalize(clone(S0));
  const D = L.derived(S);
  const system = {
    karmicAspect: S.karmaAspect || "",
    reputation: S.reputation || "",
    karma: Math.max(-100, Math.min(100, int(S.karma))), // Foundry keeps karma within −100…+100 (author, 2026-11-13)
    luck: int(S.luck),
    budget: int(S.budget),
    caps: Math.max(0, int(S.budget)),
    vehicle: S.tachka ? "tachka" : "brahmin",
    armor: D.armor,
    armorType: S.armorType || "",
    hp: { value: int(S.hpCurrent), max: D.maxHP },
    range: { value: int(S.moveCurrent), max: D.maxMove },
    supplies: Math.max(0, int(S.supplies)),
    longHaul: !!S.longHaul,
    hpMaxOverride: S.hpMaxOverride ?? null,
    armorOverride: S.armorOverride ?? null,
    story: { meeting: S.story.meeting || "", face: S.story.face || "", lastJob: S.story.lastJob || "", wentWrong: S.story.wentWrong || "" },
    locked: Object.fromEntries(Object.entries(LOCKS).map(([k, f]) => [f, !!S.manual?.[k]])),
    counters: (S.counters || []).map((c) => ({ name: c.name || "", size: int(c.size, 6), value: Math.max(0, int(c.value)) })),
    notes: S.notes || "",
    engine: {
      extra: Object.fromEntries(Object.entries(S).filter(([k]) => !MAPPED.has(k) && !k.startsWith("_"))),
      raw: { companyName: S.companyName, notes: S.notes, story: clone(S.story), reputation: S.reputation, counters: clone(S.counters) },
    },
  };
  const items = [];
  const push = (it, src) => {
    it.sort = (items.length + 1) * 100;
    if (src && "_fid" in src) it._id = src._fid;
    items.push(it);
  };
  IMPS.forEach((im) => {
    const n = int(S.imp?.[im.id]);
    if (n > 0) push({ type: "upgrade", name: im.name, system: { active: { value: n, max: im.max }, engine: { id: im.id } } }, S._impIds?.[im.id] != null ? { _fid: S._impIds[im.id] } : null);
  });
  (S.customImps || []).forEach((c) => {
    const { _fid, ...rest } = c;
    push({ type: "upgrade", name: itemName(c.name), system: { active: { value: 1, max: 1 }, engine: { custom: true, ...clone(rest) } } }, c);
  });
  (S.cargo || []).forEach((r) => {
    const { _fid, ...rest } = r;
    if (r.kind === "pass") push({ type: "passenger", name: itemName(r.name), system: { engine: clone(rest) } }, r);
    else push({ type: "cargo", name: itemName(r.name), system: { price: Math.max(0, int(r.price)), quantity: Math.max(0, int(r.qty, 1)), note: r.note || "", engine: clone(rest) } }, r);
  });
  return { name: S.companyName || "", system, items };
}

/** actor data → S (what the HTML caravan sheet would save) */
export function caravanToState(actor, { withIds = false } = {}) {
  const L = createCaravanLogic({ S: null });
  const s = actor.system || {};
  const eng = s.engine || {};
  const S = L.blankState();
  Object.assign(S, clone(eng.extra) || {});
  const raw = eng.raw || {};
  S.companyName = rowText(raw.companyName, actor.name || "");
  if (S.companyName === UNNAMED) S.companyName = "";
  S.luck = int(s.luck);
  S.karma = int(s.karma);
  S.karmaAspect = s.karmicAspect || L.aspectFor(S.karma);
  S.reputation = rowText(raw.reputation, s.reputation);
  S.budget = int(s.budget);
  S.tachka = s.vehicle === "tachka";
  S.hpCurrent = int(s.hp?.value);
  S.moveCurrent = int(s.range?.value);
  S.supplies = int(s.supplies);
  S.longHaul = !!s.longHaul;
  S.hpMaxOverride = s.hpMaxOverride ?? null;
  S.armorOverride = s.armorOverride ?? null;
  S.armorType = s.armorType || "";
  const st = s.story || {};
  S.story = Object.fromEntries(["meeting", "face", "lastJob", "wentWrong"].map((k) => [k, rowText(raw.story?.[k], st[k])]));
  S.notes = rowText(raw.notes, s.notes);
  S.manual = Object.fromEntries(Object.entries(LOCKS).map(([k, f]) => [k, !!s.locked?.[f]]));
  S.counters = (s.counters || []).map((c, i) => ({ name: rowText(raw.counters?.[i]?.name, c.name), size: int(c.size, 6), value: int(c.value) }));

  S.imp = L.blankImps();
  S.customImps = [];
  S.cargo = [];
  if (withIds) S._impIds = {};
  const items = [...(actor.items || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  for (const it of items) {
    const sys = it.system || {};
    const e = clone(sys.engine) || {};
    if (withIds && it._id) e._fid = it._id;
    if (it.type === "upgrade") {
      if (e.custom) {
        const { custom, ...rest } = e;
        S.customImps.push({ ...rest, name: rowText(rest.name, it.name), desc: rest.desc ?? "" });
        continue;
      }
      const im = IMPS.find((x) => x.id === e.id) || IMPS.find((x) => norm(x.name) === norm(it.name) || (x.alt && norm(x.alt) === norm(it.name)));
      if (!im) continue;
      S.imp[im.id] = Math.max(0, Math.min(im.max, int(sys.active?.value, 1)));
      if (withIds) S._impIds[im.id] = it._id;
    } else if (it.type === "cargo") {
      const price = int(e.price, NaN) === int(sys.price) || (String(e.price ?? "") === "" && !int(sys.price)) ? e.price : String(int(sys.price));
      const qty = int(e.qty, NaN) === int(sys.quantity, 1) ? e.qty : String(int(sys.quantity, 1));
      S.cargo.push({ ...e, name: rowText(e.name, it.name), kind: "cargo", price: price ?? "", qty: qty ?? "1", note: rowText(e.note, sys.note) });
    } else if (it.type === "passenger") {
      S.cargo.push({ kind: "pass", price: "", qty: "1", note: "", ...e, name: rowText(e.name, it.name) });
    }
  }
  return S;
}

/** Item types the caravan sheet manages */
export const CARAVAN_TYPES = ["upgrade", "cargo", "passenger"];

/**
 * What to change on a caravan actor so it matches S (read with caravanToState(actor, { withIds: true })).
 * @returns {{name, system, update[], create[], delete[]}} — update: items with their complete system data
 */
export function planCaravanSync(actor, S) {
  const data = stateToCaravan(S);
  const current = new Map((actor.items || []).map((i) => [i._id, i]));
  const keep = new Set();
  const update = [];
  const create = [];
  for (const it of data.items) {
    const cur = it._id && current.get(it._id);
    if (!cur) {
      delete it._id;
      create.push(it);
      continue;
    }
    keep.add(cur._id);
    const sys = { ...clone(cur.system), ...clone(it.system) };
    const rename = it.type !== "upgrade" || it.system.engine?.custom ? cur.name !== it.name : false;
    if (JSON.stringify(sys) !== JSON.stringify(cur.system) || rename || cur.sort !== it.sort) {
      update.push({ _id: cur._id, ...(rename ? { name: it.name } : {}), sort: it.sort, system: sys });
    }
  }
  const del = (actor.items || []).filter((i) => CARAVAN_TYPES.includes(i.type) && !keep.has(i._id)).map((i) => i._id);
  return { name: data.name, system: data.system, update, create, delete: del };
}
