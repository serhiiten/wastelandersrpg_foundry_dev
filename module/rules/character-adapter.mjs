/**
 * Translation between a Foundry character actor and the HTML electronic sheet's state (`st`).
 *
 * The rules engine (core.mjs) works on `st`, the same object the HTML sheet saves as .json.
 * Foundry keeps the character as an actor with items (perks, feats, gear stay real items).
 * These functions are pure: they take and return plain objects (actor.toObject() shape), so they
 * run in Foundry and in Node tests alike.
 *
 *   stateToActor(st)   → { name, img, system, items[] }  (items carry the engine's names)
 *   actorToState(actor) → st                              (what the HTML sheet would save)
 *
 * Values the HTML sheet stores that Foundry has no field for travel in `system.engine`
 * (actor and items), so a .json round trip loses nothing.
 */
import { AKEYS, SKILLS, SPECIES, PERK, FEAT, IMPS, blankState, compute, drugOf } from "./core.mjs";

/** HTML attribute key ↔ Foundry attribute key */
export const ATTR = {
  SL: "strength", SPR: "perception", VTR: "endurance", PV: "attractiveness",
  IN: "intelligence", VP: "dexterity", UDCH: "luck",
};
/** HTML skill name ↔ Foundry skill key */
export const SKILL = {
  "Атлетика": "athletics", "Крадіж": "thievery", "Стрільба": "marksmanship", "Герць": "dueling",
  "Медицина": "medicine", "Техніка": "mechanics", "Знання": "knowledge", "Виживання": "survival",
  "Маніпуляція": "manipulation", "Примус": "intimidation",
};
/** HTML skill level (0–3) ↔ Foundry skill die (0, 6, 8, 10) */
const LEVEL_DIE = [0, 6, 8, 10];
// m, f, and n for genderless characters (supermutants, robots)
const GENDERS = ["m", "f", "n"];
const CONS = { l: "light", m: "moderate", m2: "secondModerate", h: "heavy" };
const OPTIONS = { claws: "smartDeathclaws", psi: "psionics", pa: "powerArmorPerk", free: "freeMode", hand: "handwriting", guns: "guns" };

// Top-level `st` keys this adapter maps; everything else is kept in system.engine.extra
const MAPPED = new Set(["name", "portrait", "arch", "species", "gender", "concept", "problem", "goal", "detail",
  "base", "exp", "skills", "perks", "feats", "customFeats", "featNotes", "noHand", "chem", "hpCur", "fdCur",
  "cons", "consT", "hpRed", "sit", "hpMaxOv", "fdOv", "armorOv", "psiArmorOv", "defOv", "loot", "supMax", "xp",
  "imp", "weapons", "armor", "other", "supplies", "caps", "bio", "others", "set"]);

const int = (v, d = 0) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : d;
};
const blankNum = (n) => (n ? String(n) : "");
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

/** Engine name of a perk/feat item: stored name, else the item name, else without its «(…)» suffix. */
function engineName(item, table) {
  const stored = item.system?.engine?.n;
  if (stored) return stored;
  if (table[item.name]) return item.name;
  const base = item.name.replace(/\s*\([^)]*\)\s*$/, "");
  return table[base] ? base : null;
}

/* ------------------------------------------------------------------ */
/*  HTML state → Foundry actor                                         */
/* ------------------------------------------------------------------ */

/**
 * @param {object} st  HTML sheet state (as loaded from its .json)
 * @returns {{name:string, img:string|null, system:object, items:object[]}}
 */
export function stateToActor(st) {
  st = Object.assign(blankState(), clone(st));
  const d = compute(st);
  const system = {
    archetype: st.arch || "",
    concept: st.concept || "",
    problem: st.problem || "",
    goal: st.goal || "",
    detail: st.detail || "",
    gender: GENDERS.includes(st.gender) ? st.gender : "m",
    situational: (st.sit || []).map((a) => ({ name: a.t, invoked: int(a.inv) })),
    baseAttributes: Object.fromEntries(AKEYS.map((k) => [ATTR[k], int(st.base[k])])),
    attributes: Object.fromEntries(AKEYS.map((k) => [ATTR[k], d.eff[k]])),
    skills: Object.fromEntries(SKILLS.map((s) => [SKILL[s], LEVEL_DIE[int(st.skills[s])] ?? 0])),
    modelBonus: ["perk", "skill", "point"].includes(st.exp) ? st.exp : "perk",
    hp: {
      value: st.hpCur === "" || st.hpCur == null ? d.hp : int(st.hpCur),
      max: d.hp,
      bonus: int(st.hpMaxOv),
      reduction: int(st.hpRed),
    },
    fate: {
      value: st.fdCur === "" || st.fdCur == null ? d.fd : int(st.fdCur),
      recover: d.fd,
      bonus: int(st.fdOv),
    },
    armor: { bonus: int(st.armorOv), psiBonus: int(st.psiArmorOv) },
    consequences: {
      ...Object.fromEntries(Object.entries(CONS).map(([k, f]) => [f, st.cons?.[k] || ""])),
      treated: Object.fromEntries(Object.entries(CONS).map(([k, f]) => [f, !!st.consT?.[k]])),
    },
    defenseOverrides: Object.fromEntries(Object.entries(st.defOv || {}).filter(([, v]) => v)),
    chem: clone(st.chem) || {},
    loot: { yaoGuai: !!st.loot?.yao, egg: !!st.loot?.egg },
    noHand: !!st.noHand,
    supplies: {
      value: int(st.supplies),
      max: d.supMax,
      manualMax: st.supMax === "" || st.supMax == null ? null : int(st.supMax),
    },
    caps: int(st.caps),
    exp: { value: int(st.xp) },
    improvements: Object.fromEntries(IMPS.map((im) => [im.k, (st.imp?.[im.k] || []).map((x) => ({ on: !!x.on, target: x.t || "" }))])),
    options: Object.fromEntries(Object.entries(OPTIONS).map(([k, f]) => [f, !!st.set?.[k]])),
    description: st.bio || "",
    others: st.others || "",
    engine: {
      extra: Object.fromEntries(Object.entries(st).filter(([k]) => !MAPPED.has(k))),
      // keep exact empty-vs-number forms of the HTML fields
      hpCur: st.hpCur ?? "",
      fdCur: st.fdCur ?? "",
      set: clone(st.set),
    },
  };

  const items = [];
  const push = (type, name, sys, engine) => items.push({ type, name, system: { ...sys, engine }, sort: (items.length + 1) * 100 });

  items.push({ type: "species", name: (SPECIES[st.species] || SPECIES.human).n, system: {}, sort: 0 });

  st.perks.forEach((p) => {
    const { n, note, ...rest } = p;
    push("perk", n, { note: note || "" }, { n, ...rest });
  });
  st.feats.forEach((fn) => {
    const custom = (st.customFeats || []).find((c) => c.n === fn);
    push("feat", fn, { note: st.featNotes?.[fn] || "" }, custom ? { n: fn, custom: clone(custom) } : { n: fn });
  });
  st.weapons.forEach((w) =>
    push("weapon", w.n || "", {
      damage: w.d || "",
      heavy: !!w.h,
      note: w.note || "",
      inHand: !!w.hand,
      energy: w.en || "",
      range: w.r || "",
      fireRate: w.rof || "",
      weaponClass: w.cls || "",
      mods: (w.mods || []).map((m) => ({ name: m.n || "", used: !!m.u })),
    }, clone(w)),
  );
  st.armor.forEach((a) =>
    push("armor", a.n || "", { protection: Math.max(0, int(a.v)), heavy: !!a.h, equipped: a.w !== false, note: a.note || "" }, clone(a)),
  );
  st.other.forEach((o) =>
    push(drugOf(o.n) ? "drug" : "tool", o.n || "", { quantity: Math.max(0, int(o.q, 1)), note: o.note || "" }, clone(o)),
  );
  return { name: st.name || "", img: st.portrait || null, system, items };
}

/* ------------------------------------------------------------------ */
/*  Foundry actor → HTML state                                         */
/* ------------------------------------------------------------------ */

/**
 * @param {object} actor  plain actor data: { name, img, system, items[] }
 * @param {object} [opts]
 * @param {string|null} [opts.portrait]  portrait as a data: URI (the Foundry layer reads the image file)
 * @returns {object} HTML sheet state
 */
export function actorToState(actor, { portrait = null } = {}) {
  const s = actor.system || {};
  const eng = s.engine || {};
  const st = blankState();
  Object.assign(st, clone(eng.extra) || {});
  const items = [...(actor.items || [])].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  st.name = actor.name || "";
  st.portrait = portrait ?? (actor.img?.startsWith("data:") ? actor.img : null);
  st.arch = s.archetype || "";
  const sp = items.find((i) => i.type === "species");
  st.species = Object.keys(SPECIES).find((k) => SPECIES[k].n === sp?.name) || "human";
  st.gender = GENDERS.includes(s.gender) ? s.gender : "m";
  st.concept = s.concept || "";
  st.problem = s.problem || "";
  st.goal = s.goal || "";
  st.detail = s.detail || "";
  st.base = Object.fromEntries(AKEYS.map((k) => [k, int(s.baseAttributes?.[ATTR[k]])]));
  st.exp = s.modelBonus || "perk";
  st.skills = Object.fromEntries(SKILLS.map((n) => [n, Math.max(0, LEVEL_DIE.indexOf(int(s.skills?.[SKILL[n]])))]));

  st.perks = [];
  st.feats = [];
  st.customFeats = [];
  st.featNotes = {};
  st.weapons = [];
  st.armor = [];
  st.other = [];
  for (const it of items) {
    const sys = it.system || {};
    const e = clone(sys.engine) || {};
    if (it.type === "perk") {
      const n = engineName(it, PERK) ?? it.name;
      const { n: _n, ...rest } = e;
      const p = { n, note: sys.note || "", ...rest };
      if (!PERK[n] && !p.custom) p.custom = true;
      st.perks.push(p);
    } else if (it.type === "feat") {
      if (e.custom) {
        st.customFeats.push(e.custom);
        st.feats.push(e.custom.n);
      } else {
        const n = engineName(it, FEAT);
        if (!n) continue; // species properties come with the species, not as feats
        st.feats.push(n);
      }
      const fn = st.feats[st.feats.length - 1];
      if (sys.note) st.featNotes[fn] = sys.note;
    } else if (it.type === "weapon") {
      const w = Object.assign(e, { n: it.name, d: sys.damage || "", h: !!sys.heavy, en: sys.energy || "", note: sys.note || "" });
      if (sys.inHand || "hand" in e) w.hand = !!sys.inHand;
      if (sys.range || "r" in e) w.r = sys.range || "";
      if (sys.fireRate || "rof" in e) w.rof = sys.fireRate || "";
      if (sys.weaponClass || "cls" in e) w.cls = sys.weaponClass || "";
      if ((sys.mods || []).length || "mods" in e) w.mods = (sys.mods || []).map((m) => ({ n: m.name || "", u: !!m.used }));
      st.weapons.push(w);
    } else if (it.type === "armor") {
      const v = int(e.v, NaN) === int(sys.protection) ? e.v : String(int(sys.protection));
      st.armor.push(Object.assign(e, { n: it.name, v, h: !!sys.heavy, w: !!sys.equipped, note: sys.note || "" }));
    } else if (it.type === "tool" || it.type === "drug") {
      const q = int(e.q, NaN) === int(sys.quantity, 1) ? e.q : String(int(sys.quantity, 1));
      st.other.push(Object.assign(e, { n: it.name, q, note: sys.note || "" }));
    }
  }

  const d = compute(st);
  st.hpCur = eng.hpCur === "" && int(s.hp?.value) === d.hp ? "" : String(int(s.hp?.value, d.hp));
  st.fdCur = eng.fdCur === "" && int(s.fate?.value) === d.fd ? "" : String(int(s.fate?.value, d.fd));
  st.cons = Object.fromEntries(Object.entries(CONS).map(([k, f]) => [k, s.consequences?.[f] || ""]));
  st.consT = Object.fromEntries(Object.entries(CONS).map(([k, f]) => [k, !!s.consequences?.treated?.[f]]));
  st.hpRed = int(s.hp?.reduction);
  st.sit = (s.situational || []).map((a) => ({ t: a.name, inv: int(a.invoked) }));
  st.hpMaxOv = blankNum(int(s.hp?.bonus));
  st.fdOv = blankNum(int(s.fate?.bonus));
  st.armorOv = blankNum(int(s.armor?.bonus));
  st.psiArmorOv = blankNum(int(s.armor?.psiBonus));
  st.defOv = Object.fromEntries(Object.entries(s.defenseOverrides || {}).filter(([, v]) => v));
  st.loot = { yao: !!s.loot?.yaoGuai, egg: !!s.loot?.egg };
  st.noHand = !!s.noHand;
  st.chem = Object.assign(st.chem, clone(s.chem) || {});
  st.supMax = s.supplies?.manualMax == null ? "" : int(s.supplies.manualMax);
  st.supplies = int(s.supplies?.value);
  st.caps = int(s.caps);
  st.xp = int(s.exp?.value);
  IMPS.forEach((im) => {
    const src = s.improvements?.[im.k] || [];
    st.imp[im.k] = st.imp[im.k].map((x, i) => ({ on: !!src[i]?.on, t: src[i]?.target || "" }));
  });
  st.bio = s.description || "";
  st.others = s.others || "";
  st.set = clone(eng.set) || st.set;
  for (const [k, f] of Object.entries(OPTIONS)) {
    if (k in st.set || s.options?.[f]) st.set[k] = !!s.options?.[f];   // add a key only when it is on
  }
  return st;
}
