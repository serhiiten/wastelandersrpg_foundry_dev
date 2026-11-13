/**
 * What the character sheet shows, built from the HTML sheet's state (pure, testable in Node).
 *   buildView(st, d, L, ui) → plain object for templates/actor/character-v2.hbs
 * st: HTML sheet state, d: compute(st), L: createLogic(st), ui: sheet UI state (open pickers, search…)
 */
import {
  ARCH_ORDER, ATTRS, AKEYS, BUILTIN_CAT, DEF_LABEL, DEF_TYPES, ENERGY, ENERGY_ORDER, FEAT, FEATS, GUN_CLS, GUN_RANGE, GUN_ROF,
  IMPS, LVL, LVLDIE, PERK, PERKS, PRESETS, SKILLS, SPECIES, SPECIES_ORDER, catalogAll, countedFeats, countedPerks,
  drugOf, featElig, gunsOn, perkElig, presetLabel,
} from "../rules/core.mjs";

const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");
const CONS = [
  ["l", "Легкий"], ["m", "Середній"], ["m2", "Середній (Міцний)"], ["h", "Тяжкий"],
];
const ASPECTS = [["concept", "Концепція"], ["problem", "Проблема"], ["goal", "Мета"]];
/** The HTML sheet's «?» guide: 11 steps of character creation (text, tab to open) */
const GUIDE = [
  ["Обери архетип. Цей крок необов'язковий, але архетип допоможе тобі визначитися з образом персонажа й наступними кроками створення.", "build"],
  ["Обери вид. Вид визначає мінімальні та максимальні значення атрибутів, дає видові особливості, а також сам по собі є аспектом.", "build"],
  ["Розподіли пункти атрибутів. Початкове значення кожного з семи атрибутів — 0, і в тебе є 3 вільні пункти. Знизиш атрибут нижче 0 — отримаєш додатковий пункт. На старті атрибути не можуть бути нижчими за −1 і вищими за +2, а максимум будь-якого атрибута — +3, але вид може змінювати ці межі. Або розподіли набір: +2, +2, +1, 0, 0, −1, −1.", "build"],
  ["Обери дві навички на рівні учня, або три, якщо граєш за людину.", "build"],
  ["Обери два перки, або три, якщо граєш за людину.", "build"],
  ["Обери від нуля до двох особливостей. Не забувай про видові особливості.", "build"],
  ["Розрахуй очки здоров'я (ОЗ). На старті максимум ОЗ становить 15: +3 за кожну одиницю ВТР понад 0 і −3 за кожну нижче 0. Аркуш рахує ОЗ сам, разом із бонусами та штрафами від перків і особливостей.", "health"],
  ["Запиши жетони Долі (ЖД). На початку кожної ігрової сесії персонаж відновлює 2 + УДЧ жетонів Долі. Аркуш рахує це сам.", "health"],
  ["Дай персонажеві ім'я, зовнішність і аспекти. Кинь випадкові або вигадай самостійно.", "build"],
  ["Придбай спорядження. Кожен персонаж починає гру з 10 кришками на закупівлю та 3 одиницями Припасів. Крім того, один вид легкої зброї ти отримуєш безкоштовно.", "gear"],
  ["Кинь випадкову деталь персонажа.", "build"],
];
const TAB_NAME = { build: "Персонаж", health: "Здоров'я та Доля", gear: "Мотлох" };
const IMP_TARGET = { attr2: "attr", attr3: "attr", attr4: "attr", skill: "skill", skill2: "skill", skill3: "skill" };

export function buildView(st, d, L, ui = {}) {
  const c = L.chem();
  const free = !!d.free;

  /* ---------- who ---------- */
  const species = SPECIES_ORDER.map((k) => ({
    v: k, n: SPECIES[k].n, sel: st.species === k, disabled: k === "claw" && !st.set.claws && st.species !== "claw",
  }));
  const archetypes = [{ v: "", n: "— архетип —", sel: !st.arch }].concat(
    ARCH_ORDER.map((a) => ({ v: a, n: a, sel: st.arch === a, disabled: a === "Псионік" && !st.set.psi })),
  );

  /* ---------- attributes ---------- */
  const attrs = ATTRS.map((A) => {
    const k = A.k;
    const b = d.bounds[k];
    const now = L.effAttr(d, k);
    return {
      k, s: A.s, n: A.n,
      base: st.base[k], baseS: sgn(st.base[k]),
      eff: d.eff[k], effS: sgn(d.eff[k]),
      now, nowS: sgn(now), changed: now !== d.eff[k],
      bonus: d.bonus[k], imp: d.attrImp[k],
      range: `${sgn(b.min)} … ${sgn(b.start)} (макс. ${sgn(b.max)})`,
      canUp: free || (st.base[k] + 1 <= d.allowMax[k] && d.left > 0),
      canDown: free || st.base[k] - 1 >= d.allowMin[k],
      chemNote: L.chemAttrNote(k),
    };
  });

  /* ---------- skills ---------- */
  const sc = d.skillCheck;
  const skills = SKILLS.map((s) => {
    const lv = st.skills[s] || 0;
    return {
      s, lv, die: LVLDIE[lv] || "—", level: lv ? LVL[lv] : "—", cap: d.caps[s],
      dots: [1, 2, 3].map((j) => ({ j, on: lv >= j, label: LVL[j], over: j > d.caps[s] })),
    };
  });
  const skillBudget = {
    ok: sc.ok,
    text: `учень: ${sc.nN} (вільно ${sc.freeN}), підмайстер: ${sc.nJ} (вільно ${sc.freeJ}), майстер: ${sc.nM} (вільно ${sc.freeM})`
      + (d.sk.flex ? `, гнучких слотів: ${sc.freeFlex}` : ""),
  };

  /* ---------- perks & feats ---------- */
  const perks = st.perks.map((p, i) => {
    const ev = d.perkEval[i] || { ok: true, why: [] };
    const P = PERK[p.n];
    return {
      i, n: p.n, note: p.note || "", custom: !!p.custom, ok: ev.ok, why: (ev.why || []).join("; "),
      req: P?.rt || "", text: P?.d || p.d || "", erudite: p.n === "Ерудит",
      eruditeOptions: [{ v: "", n: "— навичка —", sel: !p.note }].concat(SKILLS.map((s) => ({ v: s, n: s, sel: p.note === s }))),
    };
  });
  const feats = st.feats.map((fn, i) => {
    const ev = d.featEval[i] || { ok: true, why: [] };
    const F = FEAT[fn];
    const custom = (st.customFeats || []).find((x) => x.n === fn);
    return { i, n: fn, note: st.featNotes?.[fn] || "", custom: !!custom, ok: ev.ok, why: (ev.why || []).join("; "), text: F?.d || custom?.d || "" };
  });
  const q = String(ui.q || "").toLowerCase();
  const match = (o) => !q || o.n.toLowerCase().includes(q) || String(o.d || "").toLowerCase().includes(q);
  let perkPicker = null;
  if (ui.pick === "perk") {
    const have = new Set(st.perks.map((p) => p.n));
    const groups = {};
    PERKS.filter((p) => !have.has(p.n) && (st.set.psi || !p.psi) && match(p)).forEach((p) => {
      const ev = perkElig(p, st, d, -1);
      if (!ui.showAll && !ev.ok && !free) return;
      (groups[p.c] ||= []).push({ n: p.n, ok: ev.ok, why: ev.why.join("; "), req: p.rt, text: p.d });
    });
    perkPicker = Object.entries(groups).map(([c, list]) => ({ c, list }));
  }
  let featPicker = null;
  if (ui.pick === "feat") {
    const have = new Set(st.feats);
    const groups = {};
    FEATS.filter((f) => !have.has(f.n) && (!f.sp || f.sp.includes(st.species)) && (st.set.psi || f.n !== "Псионік") && match(f)).forEach((f) => {
      const ev = featElig(f, st, d, -1);
      if (!ui.showAll && !ev.ok && !free) return;
      (groups[f.c] ||= []).push({ n: f.n, ok: ev.ok, why: ev.why.join("; "), text: f.d });
    });
    featPicker = Object.entries(groups).map(([c, list]) => ({ c, list }));
  }

  /* ---------- improvements ---------- */
  const targetOptions = (kind, cur) => [{ v: "", n: "— ціль —", sel: !cur }].concat(
    kind === "attr" ? ATTRS.map((A) => ({ v: A.k, n: A.n, sel: cur === A.k })) : SKILLS.map((s) => ({ v: s, n: s, sel: cur === s })),
  );
  const imps = IMPS.map((im) => ({
    k: im.k, label: `${im.ico} ${im.t}${im.sub ? ` (${im.sub})` : ""}`, cost: im.cost,
    slots: (st.imp[im.k] || []).map((x, i) => ({
      i, on: !!x.on, t: x.t || "", cost: d.xpCost.rows[im.k]?.[i] ?? im.cost,
      targets: IMP_TARGET[im.k] ? targetOptions(IMP_TARGET[im.k], x.t) : null,
      bad: !!x.on && IMP_TARGET[im.k] === "attr" && x.t && d.impVal[`${im.k}:${i}`] && !d.impVal[`${im.k}:${i}`].ok,
    })),
  }));

  /* ---------- health & fate ---------- */
  const hpMax = L.hpMaxNow(d);
  const fd = st.fdCur === "" || st.fdCur == null ? d.fd : parseInt(st.fdCur, 10) || 0;
  const cons = CONS.filter(([k]) => k !== "m2" || d.medSlots > 1).map(([k, label]) => ({
    k, label, v: st.cons?.[k] || "", treated: !!st.consT?.[k],
  }));
  const ovDef = st.defOv || {};
  const sit = (st.sit || []).map((a, i) => ({ i, t: a.t, inv: a.inv || 0 }));
  const quickAspects = L.QUICK_ASPECTS.filter((x) => !sit.some((a) => a.t === x[1]))
    .map(([k, t, why]) => ({ t, off: ovDef[k] === "yes", why }));
  const defenses = L.defenses(d).map(([cls, t]) => ({ cls, t }));

  /* ---------- chems & rest ---------- */
  const rest = L.restInfo(d);
  const chem = {
    session: c.session, day: c.dayNo, scene: c.sceneNo,
    effects: [...c.scene.map((e) => ({ ...e, when: "сцена" })), ...c.day.map((e) => ({ ...e, when: "день" }))]
      .map((e) => ({ id: e.id, drug: e.drug, t: e.t || "", when: e.when })),
    addictions: c.addictions.map((a, i) => ({ i, drug: a.drug, src: a.src || "", used: c.used.includes(a.drug), incurable: !!a.incurable })),
    unsatisfied: L.unsatAddictions().map((a) => a.drug),
    last: c.last || "", restLast: c.restLast || "", superDice: c.superDice || 0, ko: L.curHp(d) <= 0,
  };

  /* ---------- gear ---------- */
  const energyOptions = (cur) => ENERGY_ORDER.map((k) => ({ v: k, n: k ? ENERGY[k]?.n || k : "—", sel: (cur || "") === k }));
  const opts = (map, cur) => Object.entries(map).map(([v, n]) => ({ v, n, sel: (cur || "") === v }));
  const weapons = st.weapons.map((w, i) => ({
    i, n: w.n || "", d: w.d || "", h: !!w.h, en: w.en || "", note: w.note || "", hand: !!w.hand, fav: !!w.fav,
    auto: !!(w.auto || w.claw), energyOptions: energyOptions(w.en),
    guns: gunsOn(st), r: w.r || "", rof: w.rof || "", cls: w.cls || "",
    rangeOptions: opts(GUN_RANGE, w.r), rofOptions: opts(GUN_ROF, w.rof), clsOptions: opts(GUN_CLS, w.cls),
    mods: (w.mods || []).map((m, j) => ({ j, n: m.n || "", u: !!m.u })),
    builtin: w.auto === "builtin"
      ? Object.entries(BUILTIN_CAT).map(([v, c]) => ({ v, n: `${c.n} (${c.d})`, sel: (w.cat || "medium") === v }))
      : null,
  }));
  const favWeapon = d.allPerks.includes("Улюблена зброя")
    ? [{ v: "", n: "— не обрано —", sel: !st.weapons.some((w) => w.fav) }].concat(
      st.weapons.map((w, i) => ({ v: String(i), n: w.n || "без назви", sel: !!w.fav })).filter((o) => !st.weapons[+o.v]?.auto))
    : null;
  const armor = st.armor.map((a, i) => ({ i, n: a.n || "", v: a.v ?? "", h: !!a.h, w: a.w !== false, note: a.note || "" }));
  const other = st.other.map((o, i) => ({ i, n: o.n || "", q: o.q ?? "1", note: o.note || "", auto: !!o.auto, usable: !!drugOf(o.n) }));
  const cq = String(ui.catQ || "").toLowerCase();
  const catalog = ui.cat
    ? catalogAll(gunsOn(st)).filter((e) => !cq || e.n.toLowerCase().includes(cq) || String(e.g || "").toLowerCase().includes(cq))
      .slice(0, 80).map((e) => ({ id: e.id, n: e.n, g: e.g || "", d: e.d || "", price: e.price ?? "" }))
    : null;

  return {
    name: st.name || "", gender: st.gender, genders: [["m", "чол."], ["f", "жін."], ["n", "без статі"]].map(([v, n]) => ({ v, n, sel: st.gender === v })),
    species, speciesProps: SPECIES[st.species]?.props || [], archetypes, arch: st.arch || "",
    aspects: ASPECTS.map(([f, label], i) => ({ f, label, v: st[f] || "", i })), detail: st.detail || "",
    issues: d.issues.map(([lvl, msg]) => ({ lvl, msg })),
    chips: L.statusChips(d).map(([cls, t, tip]) => ({ cls, t, tip: tip || "" })),
    free,
    attrs, points: { left: d.left, total: d.points, spent: d.spent },
    skills, skillBudget,
    perks, perkSlots: d.perkSlots, perksCounted: countedPerks(st), freePerks: d.freePerks,
    feats, featsCounted: countedFeats(st),
    pick: ui.pick || "", q: ui.q || "", showAll: !!ui.showAll, perkPicker, featPicker,
    imps, xp: st.xp || 0, xpSpent: d.xpSpent, xpLeft: d.xpLeft, modelBonus: st.exp,
    hasModel: d.has("Експериментальна модель"),
    hp: L.curHp(d), hpMax, hpRed: d.hpRed, fd, fdMax: d.fd,
    armor: d.armorTotal + L.chemArmor(), psi: d.psiTotal + L.chemPsi(),
    cons, sit, quickAspects, defenses,
    supplies: parseInt(st.supplies, 10) || 0, supMax: d.supMax,
    supDots: Array.from({ length: d.supMax }, (_, j) => ({ n: j + 1, on: j < (parseInt(st.supplies, 10) || 0) })),
    caps: parseInt(st.caps, 10) || 0,
    chem, rest,
    weapons, favWeapon, armorList: armor, other, heavy: { n: d.heavyN, cap: d.heavyCap, over: d.heavyN > d.heavyCap },
    cat: !!ui.cat, catQ: ui.catQ || "", catalog,
    presets: PRESETS.map((p, i) => ({ i, n: presetLabel ? presetLabel(p) : p[1] })),
    bio: st.bio || "", others: st.others || "",
    set: { ...st.set },
    overrides: { hpMaxOv: st.hpMaxOv ?? "", fdOv: st.fdOv ?? "", armorOv: st.armorOv ?? "", psiArmorOv: st.psiArmorOv ?? "", supMax: st.supMax ?? "" },
    defTypes: Object.entries(DEF_TYPES).map(([k, T]) => ({
      k, n: T.n,
      options: [{ v: "", n: "за правилами", sel: !ovDef[k] }].concat(
        (T.bool ? [["yes", "так"], ["no", "ні"]] : T.opts.map((o) => [o, DEF_LABEL[o]])).map(([v, n]) => ({ v, n, sel: ovDef[k] === v })),
      ),
    })),
    loot: { yao: !!st.loot?.yao, egg: !!st.loot?.egg },
    guide: ui.guide ? GUIDE.map(([t, tab], i) => ({ n: i + 1, t, tab, tabName: TAB_NAME[tab] })) : null,
  };
}
