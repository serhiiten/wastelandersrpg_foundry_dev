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
import { compute } from "../rules/core.mjs";
import { chatType } from "../rules/battle.mjs";
import { consqPlan, writeConsq, medLimit, medFormula, nextMark, addConsRed, nearbyInvokes, spendOne, zeroInvokes, SLOT_NAME } from "../rules/battle-health.mjs";
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
      sources.push({ uuid: d.uuid, list: "character", where, aspects: (a.system.situational ?? []).map((x) => ({ t: x.name, inv: x.invoked })) });
    } else if (a.type === "place") sources.push({ uuid: d.uuid, list: "place", where, aspects: a.system.aspects ?? [] });
  }
  return nearbyInvokes(sources);
}

/** The writing side: one invoke off the aspect, after checking it is still there with one left */
async function spendHere({ uuid, list, i, name }) {
  const doc = await fromUuid(uuid);
  if (!doc) throw new Error("Аспекту вже немає на сцені.");
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

/** What the result offers: the patient, the formula, today's count (null for another check) */
export async function medOffer(actor, last) {
  if (!last || !["med", "repair", "treat"].includes(last.type)) return null;
  const healer = readState(actor);
  const perks = compute(healer).allPerks;
  const p = patientOf();
  const repair = last.type === "repair";
  const o = { type: last.type, verdict: last.verdict, repair, perks, patient: null, why: "" };
  if (!p) { o.why = "Познач ціллю (T) пацієнта: одного (себе теж — свій токен)."; return o; }
  o.patient = { uuid: p.tok.uuid, name: p.tok.name || p.actor.name, hp: int(p.actor.system?.hp?.value), max: int(p.actor.system?.hp?.max), type: p.actor.type };
  if (last.type !== "treat") {
    const machine = await isMachine(p.actor);
    if (machine && !repair) o.why = "Пацієнт — механізм: медицина на нього не діє. Потрібен ремонт (ІН + Техніка).";
    if (!machine && repair) o.why = "Ремонт лише для роботів і механізмів. Живих лікують медичною допомогою.";
    if (p.actor.type === "character") {
      try {
        const pst = readState(p.actor);
        o.limit = medLimit({ day: pst.chem?.dayNo || 1, mark: pst.medDay, perks, repair });
      } catch (_) { /* someone else's character the user can't read: the GM checks */ }
    }
    o.formula = medFormula(last.verdict, { perks, repair });
  } else if (p.actor.type === "character") {
    // a robot's consequences are repaired by the same check, not with «Медицина» (author, 2026-11-21): refused, a hint
    if (last.skillName === "Медицина" && await isMachine(p.actor)) o.why = "Пацієнт — механізм: медицина на нього не діє. Обери ІН + Техніка й кинь перевірку ще раз.";
    try {
      const pst = readState(p.actor);
      o.slots = ["l", "m", "m2", "h"].filter((k) => String(pst.cons?.[k] ?? "").trim()).map((k) => ({ k, label: SLOT_NAME[k], t: String(pst.cons[k]).trim() }));
    } catch (_) { o.slots = null; }
  }
  return o;
}

/**
 * Before «Медична допомога» / «Ремонт» is rolled (its Припас goes with the roll): the reason it can't help the one target
 * now — a machine and «Медицина» or the other way round, the day's limit used up — or "" (none or several targets: the
 * block says so after the roll)
 */
export async function medBlocked(actor, type) {
  if (!["med", "repair"].includes(type)) return "";
  const o = await medOffer(actor, { type, verdict: 1 });
  if (!o?.patient) return "";
  if (o.why) return o.why;
  return o.limit && o.limit.left <= 0 ? `Сьогодні пацієнтові (${o.patient.name}) уже допомагали: більше не можна до нового дня.` : "";
}

/** The block under the verdict (mockup А). `done`: what was done for this roll */
export function medHtml(o, done = "") {
  if (!o) return "";
  const title = o.type === "treat" ? "Лікування наслідків" : o.repair ? "Ремонт" : "Медична допомога";
  if (done) return `<div class="pust-hx done"><h4>${title}</h4><p class="rhint">${esc(done)}</p></div>`;
  if (o.type === "treat") {
    if (o.verdict >= 2) return "";
    const who = o.patient ? `<p class="rhint">Пацієнт (T): <b>${esc(o.patient.name)}</b></p>` : `<p class="rhint">${esc(o.why)}</p>`;
    if (!o.patient) return `<div class="pust-hx"><h4>${title}</h4>${who}</div>`;
    if (o.patient.type !== "character") return `<div class="pust-hx"><h4>${title}</h4>${who}<p class="rhint">Слоти наслідків є лише в персонажів.</p></div>`;
    if (o.why) return `<div class="pust-hx"><h4>${title}</h4>${who}<p class="rhint">${esc(o.why)}</p></div>`;
    const opts = o.slots === null ? `<p class="rhint">Наслідки пацієнта бачить лише Доглядач і власник.</p>`
      : !o.slots.length ? `<p class="rhint">У пацієнта немає наслідків.</p>`
        : `<label class="pust-hx-name">Наслідок <select data-hx-slot>${o.slots.map((s) => `<option value="${s.k}">${esc(s.label)}: «${esc(s.t)}»</option>`).join("")}</select></label>`
          + `<button type="button" class="btn rust" data-hx="red"><i class="fa-solid fa-heart-crack"></i>Максимум ОЗ −1d6</button>`;
    return `<div class="pust-hx"><h4>${title}</h4>${who}${opts}</div>`;
  }
  const who = o.patient
    ? `<p class="rhint">Пацієнт (T): <b>${esc(o.patient.name)}</b> · ${o.patient.hp}/${o.patient.max} ОЗ${o.limit ? ` · сьогодні ${o.limit.used} з ${o.limit.max}` : ""}</p>`
    : `<p class="rhint">${esc(o.why)}</p>`;
  if (!o.patient || o.why) return `<div class="pust-hx"><h4>${title}</h4>${who}${o.patient ? `<p class="rhint">${esc(o.why)}</p>` : ""}</div>`;
  if (o.limit && o.limit.left <= 0) return `<div class="pust-hx"><h4>${title}</h4>${who}<p class="rhint">Сьогодні цьому пацієнтові вже допомагали: більше не можна до нового дня.</p></div>`;
  if (o.verdict >= 1) return `<div class="pust-hx"><h4>${title}</h4>${who}<button type="button" class="btn rust" data-hx="heal"><i class="fa-solid fa-kit-medical"></i>${o.repair ? "Ремонтувати" : "Лікувати"}: ${esc(o.formula)}</button></div>`;
  const hurt = o.patient.hp >= 1 ? `<button type="button" class="btn" data-hx="hurt"><i class="fa-solid fa-droplet"></i>1d6 шкоди, що ігнорує броню</button>` : "";
  const light = o.patient.type === "character" ? `<label class="pust-hx-name">Назва <input type="text" data-hx-name placeholder="легкий наслідок"></label><button type="button" class="btn" data-hx="light"><i class="fa-solid fa-heart-crack"></i>Легкий наслідок</button>` : "";
  return `<div class="pust-hx"><h4>${title}</h4>${who}<p class="rhint">Ти зробив тільки гірше. Пацієнт на свій вибір:</p>${light}${hurt}</div>`;
}

/**
 * The patient's side (the user who owns it, or the active GM): the day's limit, the mark, then the heal / damage /
 * consequence / max HP. Throws with the reason when refused (the player then sees it in the GM's answer).
 */
async function onPatient({ uuid, kind, amount = 0, head = "", repair = false, perks = [], slot = "", name = "" }) {
  const doc = await fromUuid(uuid);
  const actor = doc?.documentName === "Actor" ? doc : doc?.actor;
  if (!actor) throw new Error("Пацієнта вже немає на сцені.");
  return queued(actor.uuid, async () => {
    if (kind === "red") {
      if (actor.type !== "character") throw new Error("Слоти наслідків є лише в персонажів.");
      const ok = await runAction(actor, (st, L) => {
        if (!String(st.cons?.[slot] ?? "").trim()) return false;
        addConsRed(st, slot, amount);
        // the current HP no higher than the new maximum
        const d = compute(st), max = L.hpMaxNow(d);
        if (L.curHp(d) > max) st.hpCur = String(Math.max(0, max));
        return true;
      }, { quiet: true });
      if (!ok) throw new Error("Цього наслідку в пацієнта вже немає.");
      await postChat({ speaker: { alias: head || "Лікування наслідків" }, content: `<div class="pust-chat pust-hxcard"><h4><i class="fa-solid fa-heart-crack"></i> ${esc(head || "Лікування наслідків")}</h4><p>${esc(actor.name)}: максимум ОЗ −${amount}, поки ${SLOT_NAME[slot]} наслідок не зникне.</p></div>` });
      return true;
    }
    // the day's limit and the mark (characters only: an enemy's or a caravan's day isn't kept)
    if (actor.type === "character") {
      const ok = await runAction(actor, (st) => {
        const day = st.chem?.dayNo || 1;
        const lim = medLimit({ day, mark: st.medDay, perks, repair });
        if (lim.left <= 0) return false;
        st.medDay = nextMark({ day, mark: st.medDay });
        if (kind === "light") {
          const plan = consqPlan(2, st.cons, compute(st).medSlots);
          if (plan.kind === "slot" && !String(name).trim()) return "noname";
          writeConsq(st, plan, name);
        }
        return true;
      }, { quiet: true });
      if (ok === "noname") throw new Error("Впиши назву наслідку.");
      if (!ok) throw new Error(`Сьогодні пацієнтові (${actor.name}) уже допомагали: більше не можна до нового дня.`);
    }
    const tokUuid = doc.documentName === "Actor" ? uuid : doc.uuid;
    if (kind === "heal") await applyHeal([tokUuid], amount, { head });
    else if (kind === "hurt") await applyDamage([tokUuid], { total: amount, dice: 1, type: chatType("phys"), ignoreArmor: true, ignoreN: 0 }, { head });
    else if (kind === "light") await postChat({ speaker: { alias: head }, content: `<div class="pust-chat pust-hxcard"><h4><i class="fa-solid fa-heart-crack"></i> ${esc(head)}</h4><p>${esc(actor.name)} отримує легкий наслідок${String(name).trim() ? ` «${esc(String(name).trim())}»` : ""}.</p></div>` });
    return true;
  });
}

/**
 * A press in the block: rolls what is to roll (the healer sees the dice), then the patient's side.
 * @returns {Promise<string>} the line for the panel, "" when nothing was done
 */
export async function medPress(actor, last, kind, { slot = "", name = "" } = {}) {
  const o = await medOffer(actor, last);
  if (!o?.patient) { notify.warn("Познач ціллю (T) пацієнта: одного."); return ""; }
  if (o.why && kind !== "red") { notify.warn(o.why); return ""; }
  const doc = await fromUuid(o.patient.uuid);
  const patientActor = doc?.actor ?? doc;
  const title = o.type === "treat" ? "Лікування наслідків" : o.repair ? "Ремонт" : "Медична допомога";
  const head = `${title} (${actor.name})`;
  let amount = 0, line = "";
  if (kind === "heal" || kind === "hurt" || kind === "red") {
    const f = kind === "heal" ? o.formula : "1d6";
    const roll = await new Roll(f).evaluate({ allowInteractive: false });
    amount = Math.max(0, roll.total);
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${head}: ${kind === "heal" ? `${o.patient.name} відновлює` : kind === "hurt" ? `${o.patient.name} отримує шкоди, що ігнорує броню` : `максимум ОЗ ${o.patient.name} зменшується на`}` });
    line = kind === "heal" ? `${o.patient.name}: +${amount} ОЗ (${f}).` : kind === "hurt" ? `${o.patient.name}: ${amount} шкоди, що ігнорує броню.` : `${o.patient.name}: максимум ОЗ −${amount}.`;
  } else if (kind === "light") line = `${o.patient.name}: легкий наслідок.`;
  const msg = { uuid: o.patient.uuid, kind, amount, head, repair: o.repair, perks: o.perks, slot, name };
  if (canWrite(patientActor)) {
    try { await onPatient(msg); } catch (e) { notify.warn(e.message); return ""; }
    return line;
  }
  if (!game.users.activeGM) { notify.warn("Пацієнта лікує Доглядач, а його зараз немає в грі."); return ""; }
  const ok = await askGM({ op: "medAid", ...msg }, title, "Пацієнта не лікувано.");
  return ok ? line : "";
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
