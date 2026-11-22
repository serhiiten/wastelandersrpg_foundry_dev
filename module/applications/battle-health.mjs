/**
 * Battle and health in Foundry (author, 2026-11-21; Fable's verdict; docs/decisions/battle.md «Бій і здоров'я»).
 *   A5 — «Аспекти поруч» in «Зробити перевірку»: the free invokes of the zone the character stands in and of the targets (T);
 *        a press spends one (the GM writes what the player doesn't own) and the panel throws its +1d10. The scene's end
 *        takes the free invokes of the scene's enemies and zones (the characters': rules/battle-health.mjs sceneEndHealth).
 *   A6 — «Записати наслідок» of «Отримання наслідків»; A7 — «Медична допомога» / «Ремонт» heal the target (T),
 *        «Лікування наслідків» 9− / 10–14 takes 1d6 of the patient's max HP while the consequence lasts.
 * The pure rules: module/rules/battle-health.mjs. Who writes: the user what they own, the active GM the rest (one queue
 * a document on the GM's side, so two players never spend one invoke twice).
 */
import { activeGmHere } from "../helpers/main-window.mjs";
import { askGM, answerGM } from "../helpers/gm-request.mjs";
import { notify } from "../helpers/notify.mjs";
import { compute, drugOf } from "../rules/core.mjs";
import { chatType } from "../rules/battle.mjs";
import { consqPlan, writeConsq, medLimit, medFormula, nextMark, nearbyInvokes, spendOne, zeroInvokes, SLOT_NAME, healCost, payHeal, treatPlan, treatSlots, applyTreat, healLanded } from "../rules/battle-health.mjs";
import { waitDice } from "../helpers/dice-rolls.mjs";
import { isCoverText } from "../rules/cover.mjs";
import { postSupIfChanged, supSnap } from "./fate-card.mjs";
import { readState, runAction } from "./character-actions.mjs";
import { applyDamage, applyHeal } from "./apply-damage.mjs";
import { postChat } from "./chat.mjs";

const SOCKET = () => `system.${game.system.id}`;
const sys = () => game.system.id;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const int = (v, d = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : d; };

/** One queue a document on the writing side */
const QUEUE = new Map();
function queued(key, job) {
  const prev = QUEUE.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(job);
  QUEUE.set(key, next);
  next.finally(() => { if (QUEUE.get(key) === next) QUEUE.delete(key); });
  return next;
}

/** The user writes it, or else the active GM; null = nobody can (no GM in the game) */
const canWrite = (doc) => game.user.isGM || !!doc?.isOwner;

/* ======================== A5: «Аспекти поруч» ======================== */

/** The zone module is canvas code: loaded on demand (tests import this file without a canvas) */
async function zonesApi() { return import("../canvas/battle-zones.mjs"); }

/**
 * The aspects with free invokes near `actor`'s check: the zone its token stands in, the user's targets (T) — an enemy's
 * aspects (both lists), a character's situational ones, a place's. The actor itself is left out.
 */
export async function nearbyFor(actor) {
  const Z = await zonesApi();
  const scene = canvas?.scene;
  const sources = [];
  const own = (scene?.tokens ?? []).find((t) => t.actor?.id === actor.id);
  const zone = own ? Z.zoneOfToken(own) : null;
  if (zone?.doc) { const z = Z.zoneOf(zone.doc); sources.push({ uuid: zone.doc.uuid, list: "zone", where: `зона «${z.name}»`, aspects: z.aspects }); }
  for (const t of game.user.targets ?? []) {
    const d = t.document, a = d?.actor;
    if (!a || a.id === actor.id) continue;
    const where = d.name || a.name;
    if (a.type === "enemy") {
      sources.push({ uuid: d.uuid, list: "enemyBase", where, aspects: a.system.baseAspects ?? [] });
      sources.push({ uuid: d.uuid, list: "enemy", where, aspects: a.system.aspects ?? [] });
    } else if (a.type === "character") {
      sources.push({ uuid: d.uuid, list: "character", where, aspects: (a.system.situational ?? []).map((x) => ({ t: x.name, inv: isCoverText(x.name) ? 0 : x.invoked })) }); // «Прикритий: …» is the ally's avoidance only (П3 3.2; no chip, the indexes stay)
    } else if (a.type === "place") sources.push({ uuid: d.uuid, list: "place", where, aspects: a.system.aspects ?? [] });
  }
  return nearbyInvokes(sources);
}

/** The writing side: one invoke off the aspect, after checking it is still there with one left */
async function spendHere({ uuid, list, i, name }) {
  const doc = await fromUuid(uuid);
  if (!doc) throw new Error("Аспекту вже немає на сцені.");
  if (isCoverText(name)) throw new Error("Прикриття діє лише на уникнення шкоди.");
  return queued(uuid, async () => {
    if (list === "zone") {
      const Z = await zonesApi();
      const z = Z.zoneOf(doc);
      const next = spendOne(z?.aspects, i, name);
      if (!next) throw new Error(`На аспекті «${name}» уже немає безкоштовних Посилень.`);
      await doc.update({ [`flags.${sys()}.battleZone.aspects`]: next });
      return true;
    }
    const actor = doc.documentName === "Actor" ? doc : doc.actor;
    if (!actor) throw new Error("Аспекту вже немає на сцені.");
    if (list === "character") {
      const ok = await runAction(actor, (st) => {
        const next = spendOne(st.sit, i, name, { inv: "inv", nameKey: "t" });
        if (!next) return false;
        st.sit = next;
        return true;
      }, { quiet: true });
      if (!ok) throw new Error(`На аспекті «${name}» уже немає безкоштовних Посилень.`);
      return true;
    }
    const path = list === "enemyBase" ? "baseAspects" : "aspects";
    const next = spendOne(actor.system?.[path], i, name);
    if (!next) throw new Error(`На аспекті «${name}» уже немає безкоштовних Посилень.`);
    await actor.update({ [`system.${path}`]: next });
    return true;
  });
}

/**
 * Spend one free invoke of a nearby aspect: the user's own write, or the GM's.
 * @returns {Promise<boolean>} true once it is spent
 */
export async function spendNearby(item) {
  const doc = await fromUuid(item.uuid);
  const msg = { uuid: item.uuid, list: item.list, i: item.i, name: item.name };
  const own = item.list === "zone" ? game.user.isGM : canWrite(doc?.documentName === "Actor" ? doc : doc?.actor);
  if (own) {
    try { return await spendHere(msg); } catch (e) { notify.warn(e.message); return false; }
  }
  if (!game.users.activeGM) { notify.warn("Посилення чужого аспекту списує Доглядач, а його зараз немає в грі."); return false; }
  return askGM({ op: "spendInvoke", ...msg }, `Посилення «${item.name}»`, "Посилення не списано, кидка не було.");
}

/** The chips of «Аспекти поруч» for the panel's invoke row (`can`: an aspect may be invoked on this roll now) */
export function nearbyHtml(items, can) {
  if (!items?.length) return "";
  return `<div class="pust-near"><span class="rl">Аспекти поруч:</span>${items.map((x, k) => `<button type="button" class="btn sm modasp pust-near-b" data-near="${k}" ${can ? "" : "disabled"} title="${esc(x.where)}: безкоштовних Посилень ${x.inv}. Клік витрачає одне й кидає +1d10."><span class="pust-near-w">${esc(x.where)}</span> · <span class="rasp-name">${esc(x.name)}</span><span class="rinv">+${x.inv}</span></button>`).join("")}</div>`;
}

/* ======================== A5: the scene's end for enemies and zones ======================== */

/**
 * The free invokes of the viewed scene's enemies (both lists) and zones go (the GM, «Кінець сцени» / «Новий день» /
 * «Кінець сесії»). @returns {Promise<{name, img, items: string[], hidden: boolean}[]>} a row for each that had some
 */
export async function endSceneInvokes(scene = canvas?.scene) {
  if (!game.user.isGM || !scene) return [];
  const rows = [];
  const seen = new Set();
  for (const t of scene.tokens ?? []) {
    const a = t.actor;
    if (a?.type !== "enemy") continue;
    const key = t.actorLink ? a.id : t.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const b = zeroInvokes(a.system.baseAspects), s = zeroInvokes(a.system.aspects);
    if (!b.gone.length && !s.gone.length) continue;
    await a.update({ ...(b.gone.length ? { "system.baseAspects": b.next } : {}), ...(s.gone.length ? { "system.aspects": s.next } : {}) });
    rows.push({ name: t.name, img: t.texture?.src || a.img, hidden: !!t.hidden, items: [invokesText([...b.gone, ...s.gone])] });
  }
  const Z = await zonesApi();
  for (const z of Z.sceneZones(scene)) {
    const f = Z.zoneOf(z.doc);
    const r = zeroInvokes(f?.aspects);
    if (!r.gone.length) continue;
    await z.doc.update({ [`flags.${sys()}.battleZone.aspects`]: r.next });
    rows.push({ name: `Зона «${f.name}»`, img: "icons/svg/target.svg", hidden: !!z.doc.hidden, items: [invokesText(r.gone)] });
  }
  return rows;
}
const invokesText = (gone) => `Безкоштовні Посилення знято: ${gone.map((g) => `«${g.name}»`).join(", ")}.`;

/* ======================== A6: «Записати наслідок» ======================== */

/** What «Отримання наслідків» offers for the roll `last` of `actor` (null for another check) */
export function consqOffer(actor, last) {
  if (!last || last.type !== "consq") return null;
  const st = readState(actor);
  const plan = consqPlan(last.verdict, st.cons, compute(st).medSlots);
  return { plan, cons: st.cons };
}

/** The block under the verdict (mockup А, author 2026-11-21). `done`: what was written for this roll */
export function consqHtml(o, done = "") {
  if (!o) return "";
  const { plan, cons } = o;
  if (done) return `<div class="pust-hx done"><h4>Записати наслідок</h4><p class="rhint">${esc(done)}</p></div>`;
  if (plan.kind === "wake") {
    return `<div class="pust-hx"><h4>Без наслідків</h4><p class="rhint">Персонаж вибуває зі сцени, але наприкінці неї опритомнює з 1 ОЗ.</p>`
      + `<button type="button" class="btn rust" data-hx="wake"><i class="fa-solid fa-bed-pulse"></i>Опритомніти з 1 ОЗ у кінці сцени</button></div>`;
  }
  const slot = plan.kind === "doomed"
    ? `Слот ${SLOT_NAME[plan.want]} зайнятий, вільних важчих немає: <b>персонаж приречений</b> і наприкінці сцени помре.`
    : plan.k === plan.want || (plan.want === "m" && plan.k === "m2")
      ? `Слот: ${SLOT_NAME[plan.k]}.`
      : `Слот ${SLOT_NAME[plan.want]} зайнятий («${esc(String(cons?.[plan.want] ?? "").trim())}»): наслідок стає важчим — ${SLOT_NAME[plan.k]}.`;
  const field = plan.kind === "slot" ? `<label class="pust-hx-name">Назва <input type="text" data-hx-name placeholder="як персонаж зазнав шкоди"></label>` : "";
  const btn = plan.kind === "slot"
    ? `<button type="button" class="btn rust" data-hx="consq"><i class="fa-solid fa-pen"></i>Записати наслідок</button>`
    : `<button type="button" class="btn rust" data-hx="doomed"><i class="fa-solid fa-skull"></i>Записати: приречений</button>`;
  return `<div class="pust-hx"><h4>Записати наслідок</h4>${field}<p class="rhint">${slot}</p>${btn}</div>`;
}

/** The press: written on the roller's own character. @returns {Promise<string>} what was done, "" when refused */
export async function consqWrite(actor, last, kind, name) {
  const res = await runAction(actor, (st) => {
    const plan = consqPlan(last.verdict, st.cons, compute(st).medSlots);
    if ((kind === "wake") !== (plan.kind === "wake") || (kind === "doomed") !== (plan.kind === "doomed")) return { ok: false, msg: "Слоти наслідків змінилися: кинь перевірку ще раз." };
    return writeConsq(st, plan, name);
  }, { quiet: true });
  if (!res?.ok) { notify.warn(res?.msg || "Наслідок не записано."); return ""; }
  await postChat({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="pust-chat pust-hxcard"><h4><i class="fa-solid fa-heart-crack"></i> Отримання наслідків</h4><p>${esc(res.msg)}</p></div>` });
  return res.msg;
}

/* ======================== A7: «Медична допомога», «Ремонт», «Лікування наслідків» ======================== */

/** The one target (T) as {tok, actor}, or null with the reason said */
function patientOf() {
  const ts = [...(game.user.targets ?? [])].filter((t) => t?.document?.actor);
  if (ts.length !== 1) return null;
  return { tok: ts[0].document, actor: ts[0].document.actor };
}

/** A robot or another machine: the patient's body (a character: species robot without «Кіборг»; an enemy: «Неживий») */
async function isMachine(actor) {
  if (actor.type === "character") { const st = readState(actor); return st.species === "robot" && !(st.feats || []).includes("Кіборг"); }
  if (actor.type === "enemy") { const { targetProfile } = await import("../rules/target-profile.mjs"); return !!targetProfile(actor)?.nonliving; }
  return actor.type === "caravan";
}

/** The healer's state, readable (the user's own character) */
const healerOf = (actor) => { try { return readState(actor); } catch (_) { return null; } };
const TITLE = (type) => (type === "treat" ? "Лікування наслідків" : type === "repair" ? "Ремонт" : "Медична допомога");

/**
 * What the result offers for the target chosen now (П2, author 2026-11-22: the patient is chosen after the roll): the patient,
 * the formula, today's count, the consequences, what the healer can pay with; `why` — why the button stays locked
 * (null for another check)
 */
export async function medOffer(actor, last) {
  if (!last || !["med", "repair", "treat"].includes(last.type)) return null;
  const healer = healerOf(actor);
  const perks = healer ? compute(healer).allPerks : [];
  const p = patientOf();
  const repair = last.type === "repair";
  const o = { type: last.type, verdict: last.verdict, repair, perks, patient: null, why: "", free: !!last.free, cost: [] };
  if (!p) { o.why = "Познач ціллю (T) пацієнта: одного (себе теж — свій токен)."; return o; }
  o.patient = { uuid: p.tok.uuid, name: p.tok.name || p.actor.name, hp: int(p.actor.system?.hp?.value), max: int(p.actor.system?.hp?.max), type: p.actor.type };
  const machine = await isMachine(p.actor);
  o.machine = machine;
  if (last.type !== "treat") {
    if (machine && !repair) o.why = "Пацієнт — механізм: медицина на нього не діє. Потрібен ремонт (ІН + Техніка).";
    if (!machine && repair) o.why = "Ремонт лише для роботів і механізмів. Живих лікують медичною допомогою.";
    if (p.actor.type === "character") {
      try {
        const pst = readState(p.actor);
        o.limit = medLimit({ day: pst.chem?.dayNo || 1, mark: pst.medDay, perks, repair });
      } catch (_) { /* someone else's character the user can't read: the GM checks */ }
    }
    if (!o.why && o.limit && o.limit.left <= 0) o.why = `Сьогодні пацієнтові (${o.patient.name}) уже допомагали: більше не можна до нового дня.`;
    o.formula = medFormula(last.verdict, { perks, repair });
  } else {
    if (p.actor.type !== "character") o.why = "Слоти наслідків є лише в персонажів.";
    // a robot's consequences are repaired by the same check, not with «Медицина» (author, 2026-11-21): refused, a hint
    else if (last.skillName === "Медицина" && machine) o.why = "Пацієнт — механізм: медицина на нього не діє. Обери ІН + Техніка й кинь перевірку ще раз.";
    if (p.actor.type === "character") {
      try {
        const pst = readState(p.actor);
        o.slots = treatSlots(pst);
        o.light = !!String(pst.cons?.l ?? "").trim() && !pst.consT?.l;
      } catch (_) { o.slots = null; }
      if (!o.why && o.slots && !o.slots.length) {
        o.why = o.light
          ? "Легкий наслідок лікують медикаментом: «Мотлох» в аркуші пацієнта. Перевірка лише для середніх і тяжких."
          : "У пацієнта немає непролікованих середніх чи тяжких наслідків.";
      }
    }
  }
  if (!o.free) {
    o.cost = healer ? healCost(last.type, healer, { machine, drugOf }) : [];
    if (!o.why && !o.cost.length) {
      o.why = last.type === "treat"
        ? `Нема чим платити: потрібні 2 Припаси або ${machine ? "Хотфікс чи Критфікс" : "стимпак чи суперстимпак"}.`
        : "Нема чим платити: потрібна одиниця Припасів.";
    }
  }
  return o;
}

/**
 * Before the roll (П2): only the healer — something to pay with (the patient isn't known yet: any means counts); "" = may roll.
 * `free`: «Без Припасів» ticked.
 */
export function healGate(actor, type, free = false) {
  if (!["med", "repair", "treat"].includes(type) || free) return "";
  const st = healerOf(actor);
  if (!st || healCost(type, st, { drugOf }).length) return "";
  return type === "treat"
    ? "Лікування наслідків: потрібні 2 Припаси, стимпак чи суперстимпак (роботу — Хотфікс чи Критфікс). Якщо Доглядач дозволив без них, постав «Без Припасів»."
    : `${TITLE(type)}: потрібна одиниця Припасів, а їх немає. Якщо Доглядач дозволив без них, постав «Без Припасів».`;
}

/** The button's label for the verdict */
function treatLabel(v) {
  return v >= 3 ? "Пролікувати й +1d6 ОЗ" : v === 2 ? "Пролікувати" : v === 1 ? "Пролікувати, максимум ОЗ −1d6" : "Максимум ОЗ −1d6";
}

/**
 * The block under the verdict (mockup А). `done`: what was done for this roll; `busy`: a press is on its way; `sel`: the
 * choices kept through a rebuild ({slot, pay, name})
 */
export function medHtml(o, done = "", { busy = false, sel = {} } = {}) {
  if (!o) return "";
  const title = TITLE(o.type);
  if (done) return `<div class="pust-hx done"><h4>${title}</h4><p class="rhint">${esc(done)}</p></div>`;
  const lock = busy || !!o.why;
  const tip = esc(busy ? "Застосовується…" : o.why);
  const btn = (cls, k, icon, label) => `<button type="button" class="${cls}${lock ? " pust-locked" : ""}" data-hx="${k}"${lock ? ` aria-disabled="true" title="${tip}"` : ""}><i class="fa-solid ${icon}"></i>${label}</button>`;
  const who = o.patient
    ? `<p class="rhint">Пацієнт (T): <b>${esc(o.patient.name)}</b> · ${o.patient.hp}/${o.patient.max} ОЗ${o.limit ? ` · сьогодні ${o.limit.used} з ${o.limit.max}` : ""}</p>`
    : "";
  const why = o.why ? `<p class="rhint">${esc(o.why)}</p>` : "";
  const pay = o.free ? `<p class="rhint">Без Припасів: нічого не списується.</p>`
    : o.cost.length > 1 ? `<label class="pust-hx-name">Плата <select data-hx-pay>${o.cost.map((c) => `<option value="${esc(c.k)}" ${sel.pay === c.k ? "selected" : ""}>${esc(c.label)}</option>`).join("")}</select></label>`
      : o.cost.length ? `<p class="rhint">Плата: ${esc(o.cost[0].label)}.</p>` : "";
  if (o.type === "treat") {
    const slots = o.slots === null ? `<p class="rhint">Наслідки пацієнта бачить лише Доглядач і власник.</p>`
      : o.slots?.length ? `<label class="pust-hx-name">Наслідок <select data-hx-slot>${o.slots.map((s) => `<option value="${s.k}" ${sel.slot === s.k ? "selected" : ""}>${esc(s.label)}: «${esc(s.t)}»</option>`).join("")}</select></label>` : "";
    return `<div class="pust-hx"><h4>${title}</h4>${who}${why}${slots}${pay}${btn("btn rust", "treat", "fa-kit-medical", treatLabel(o.verdict))}</div>`;
  }
  if (o.verdict >= 1) return `<div class="pust-hx"><h4>${title}</h4>${who}${why}${pay}${btn("btn rust", "heal", "fa-kit-medical", `${o.repair ? "Ремонтувати" : "Лікувати"}: ${esc(o.formula)}`)}</div>`;
  const hurt = !o.patient || o.patient.hp >= 1 ? btn("btn", "hurt", "fa-droplet", "1d6 шкоди, що ігнорує броню") : "";
  const light = !o.patient || o.patient.type === "character"
    ? `<label class="pust-hx-name">Назва <input type="text" data-hx-name placeholder="легкий наслідок" value="${esc(sel.name || "")}"></label>${btn("btn", "light", "fa-heart-crack", "Легкий наслідок")}` : "";
  return `<div class="pust-hx"><h4>${title}</h4>${who}${why}<p class="rhint">Ти зробив тільки гірше. Пацієнт на свій вибір:</p>${light}${hurt}${pay}</div>`;
}

/** Requests the GM already applied (one request once, as A8's SPLIT_DONE) */
const MED_DONE = new Set();

/**
 * The patient's side (the user who owns it, or the active GM): checks, then (unless `dry`) the mark, the heal / damage /
 * consequence / max HP. Throws with the reason when refused. `dry` (П2, Fable): only the checks, before any dice are shown.
 */
async function onPatient({ uuid, kind, verdict = 0, amount = 0, head = "", repair = false, perks = [], slot = "", name = "", dry = false, id = "" }) {
  const doc = await fromUuid(uuid);
  const actor = doc?.documentName === "Actor" ? doc : doc?.actor;
  if (!actor) throw new Error("Пацієнта вже немає на сцені.");
  if (!dry && id && MED_DONE.has(id)) return true;
  const tokUuid = doc.documentName === "Actor" ? uuid : doc.uuid;
  return queued(actor.uuid, async () => {
    if (kind === "treat") {
      if (actor.type !== "character") throw new Error("Слоти наслідків є лише в персонажів.");
      const plan = treatPlan(verdict);
      if (dry) {
        const st = readState(actor);
        if (!String(st.cons?.[slot] ?? "").trim()) throw new Error("Цього наслідку в пацієнта вже немає.");
        if (plan.treated && st.consT?.[slot]) throw new Error("Цей наслідок уже проліковано.");
        return true;
      }
      let cons = "";
      const res = await runAction(actor, (st, L) => {
        cons = String(st.cons?.[slot] ?? "").trim();
        return applyTreat(st, L, slot, plan, plan.red ? amount : 0, { compute });
      }, { quiet: true });
      if (!res?.ok) throw new Error(res?.msg || "Наслідок не проліковано.");
      if (id) MED_DONE.add(id);
      const slotName = SLOT_NAME[slot][0].toUpperCase() + SLOT_NAME[slot].slice(1);
      const parts = [`${slotName} наслідок «${cons}» ${plan.treated ? "проліковано" : "не проліковано"}`];
      if (plan.red) parts.push(`максимум ОЗ −${amount}, поки наслідок не зникне`);
      if (res.doomed) parts.push("максимум ОЗ 0: приречений, наприкінці сцени персонаж помирає");
      await postChat({ speaker: { alias: head }, content: `<div class="pust-chat pust-hxcard"><h4><i class="fa-solid fa-kit-medical"></i> ${esc(head)}</h4><p>${esc(actor.name)}: ${esc(parts.join("; "))}.</p></div>` });
      if (plan.heal && amount > 0) await applyHeal([tokUuid], amount, { head });
      return true;
    }
    // the day's limit and the mark (characters only: an enemy's or a caravan's day isn't kept)
    if (actor.type === "character") {
      const check = (st) => {
        const lim = medLimit({ day: st.chem?.dayNo || 1, mark: st.medDay, perks, repair });
        if (lim.left <= 0) return "limit";
        if (kind === "light" && consqPlan(2, st.cons, compute(st).medSlots).kind === "slot" && !String(name).trim()) return "noname";
        return "";
      };
      const no = dry ? check(readState(actor)) : await runAction(actor, (st) => {
        const why = check(st);
        if (why) return why;
        st.medDay = nextMark({ day: st.chem?.dayNo || 1, mark: st.medDay });
        if (kind === "light") writeConsq(st, consqPlan(2, st.cons, compute(st).medSlots), name);
        return "";
      }, { quiet: true });
      if (no === "noname") throw new Error("Впиши назву наслідку.");
      if (no === "limit") throw new Error(`Сьогодні пацієнтові (${actor.name}) уже допомагали: більше не можна до нового дня.`);
    }
    if (dry) return true;
    if (id) MED_DONE.add(id);
    if (kind === "heal") await applyHeal([tokUuid], amount, { head });
    else if (kind === "hurt") await applyDamage([tokUuid], { total: amount, dice: 1, type: chatType("phys"), ignoreArmor: true, ignoreN: 0 }, { head });
    else if (kind === "light") await postChat({ speaker: { alias: head }, content: `<div class="pust-chat pust-hxcard"><h4><i class="fa-solid fa-heart-crack"></i> ${esc(head)}</h4><p>${esc(actor.name)} отримує легкий наслідок${String(name).trim() ? ` «${esc(String(name).trim())}»` : ""}.</p></div>` });
    return true;
  });
}

/** The patient's side run here or by the GM. @returns {Promise<boolean>} */
async function patientSide(patientActor, msg, title) {
  if (canWrite(patientActor)) {
    try { return await onPatient(msg); } catch (e) { notify.warn(e.message); return false; }
  }
  if (!game.users.activeGM) { notify.warn("Пацієнта лікує Доглядач, а його зараз немає в грі."); return false; }
  return askGM({ op: "medAid", ...msg }, title, "Нічого не витрачено.", { refusal: true });
}

/**
 * A press in the block (П2, Fable's order): the checks here → the patient's side checks dry → the dice to chat (after they
 * land) → the patient's side for real → `applied(line)` (the panel marks the roll at once) → the healer pays. Nothing is spent
 * and no dice are shown when refused.
 * @returns {Promise<string>} the line for the panel, "" when nothing was done
 */
export async function medPress(actor, last, kind, { slot = "", name = "", pay = "", applied = () => {} } = {}) {
  const o = await medOffer(actor, last);
  if (!o?.patient) { notify.warn("Познач ціллю (T) пацієнта: одного."); return ""; }
  if (o.why) { notify.warn(o.why); return ""; }
  if (o.type === "treat" && !slot) { notify.warn("Обери наслідок."); return ""; }
  const cost = o.free ? null : o.cost.find((c) => c.k === pay) || o.cost[0];
  const doc = await fromUuid(o.patient.uuid);
  const patientActor = doc?.actor ?? doc;
  const title = TITLE(o.type);
  const head = `${title} (${actor.name})`;
  const msg = { uuid: o.patient.uuid, kind, verdict: o.verdict, head, repair: o.repair, perks: o.perks, slot, name, id: foundry.utils.randomID() };
  if (!(await patientSide(patientActor, { ...msg, dry: true }, title))) return "";
  const plan = o.type === "treat" ? treatPlan(o.verdict) : null;
  const f = kind === "heal" ? o.formula : kind === "hurt" || (plan && (plan.red || plan.heal)) ? "1d6" : "";
  let amount = 0;
  if (f) {
    const roll = await new Roll(f).evaluate({ allowInteractive: false });
    amount = Math.max(0, roll.total);
    const what = kind === "heal" ? `${o.patient.name} відновлює` : kind === "hurt" ? `${o.patient.name} отримує шкоди, що ігнорує броню`
      : plan.red ? `максимум ОЗ ${o.patient.name} зменшується на` : `${o.patient.name} відновлює`;
    const m = await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${head}: ${what}` });
    await waitDice(m);
  }
  // what lands, not what was rolled: a heal is cut to the patient's maximum (author, 2026-11-22)
  const hpP = patientActor?.system?.hp;
  const landed = hpP && Number.isFinite(Number(hpP.max)) ? healLanded(hpP.value, hpP.max, amount) : amount;
  if (!(await patientSide(patientActor, { ...msg, amount }, title))) return "";
  const line = kind === "heal" ? `${o.patient.name}: +${landed} ОЗ (${f}).`
    : kind === "hurt" ? `${o.patient.name}: ${amount} шкоди, що ігнорує броню.`
      : kind === "light" ? `${o.patient.name}: легкий наслідок.`
        : `${o.patient.name}: ${plan.treated ? "проліковано" : "не проліковано"}${plan.red ? `, максимум ОЗ −${amount}` : ""}${plan.heal ? `, +${landed} ОЗ` : ""}.`;
  applied(line);
  if (!cost) return line;
  const supWas = supSnap(actor);
  let paid = "";
  await runAction(actor, (st) => { paid = payHeal(o.type, st, cost.k, { drugOf }); }, { quiet: true });
  await postSupIfChanged(actor, supWas);
  if (cost.k !== "sup" && paid) await postChat({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="pust-chat pust-hxcard"><h4><i class="fa-solid fa-kit-medical"></i> ${esc(title)}</h4><p>${esc(actor.name)} витрачає: ${esc(paid)}.</p></div>` });
  if (!paid) notify.warn(`${title}: плати вже не було, нічого не списано.`);
  return line;
}

/* ======================== the GM's socket ======================== */

export function readyBattleHealth() {
  game.socket.on(SOCKET(), async (msg) => {
    if (!activeGmHere()) return;
    if (msg?.op === "spendInvoke") await answerGM(msg, () => spendHere(msg));
    else if (msg?.op === "medAid") await answerGM(msg, () => onPatient(msg));
  });
}

/** The doomed (A6; author, 2026-11-21: a warning, the table decides): said before a return to the scene that the rules refuse */
export function warnDoomed(actor, what) {
  if (actor?.type !== "character") return false;
  let doomed = false;
  try { doomed = !!readState(actor).ko?.doomed; } catch (_) { return false; }
  if (doomed) notify.warn(`${actor.name} приречений: за правилами «${what}» на приречених не діє. Вирішує стіл.`);
  return doomed;
}
