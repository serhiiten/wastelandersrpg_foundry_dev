/**
 * «Битва» — the left panel on «Бойова мапа» (author, 2026-11-14; the HTML battle tracker's header and add forms, without
 * its bottom panel). For the GM:
 *   – the battle's place and hazard (scene flags `battlePlace` / `battleHazard`), each with a die that rolls the
 *     inspiration tables anew (never the same twice; «Сховище» gets its number); the place picks the zones' name pools;
 *   – «+ Зона» (module/canvas/battle-zones.mjs) and «+ Супротивник»: faction → enemy (the «opponents» compendium) →
 *     how many → which zone; the actor goes to the Actors folder «Битви → <фракція>», unlinked tokens with personal
 *     names land on free cells of the zone;
 *   – «Коло й Доля» (author, 2026-11-14; the tracker's bottom bar): the round ◀ ▶ (the next one posts the tracker's
 *     reminder), the GM's Fate tokens − / + and «За гравцями» (as many as the player characters on the scene);
 *     scene flags `battleRound` / `battleFate`;
 *   – «Шкода й лікування» (the tracker's damage panel): a number or dice, the type, «Ігнорує броню», «Частковий успіх»,
 *     quick dice; «Завдати шкоди» / «Лікувати» go to the selected tokens (or the targets) through apply-damage.mjs —
 *     armour, defences, Камікадзе counted as in the tracker;
 *   – the count «У строю X з Y · Гравців N».
 * Players don't get this panel. map-dock.mjs shows it instead of «Мапа Пустки» while the battle map is viewed.
 */
import { createTerminal } from "../rules/terminal.mjs";
import { battleFolder, generatorRecord } from "./terminal-battle.mjs";
import { sceneZones, zoneOf, addBattleZone } from "../canvas/battle-zones.mjs";
import { applyDamage, applyHeal, chosenTokens } from "./apply-damage.mjs";
import { DMG_TYPES } from "../rules/battle.mjs";
import { chatType } from "./enemy-attack.mjs";
import { postChat } from "./chat.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sys = () => game.system.id;
let T = null;
const term = () => (T ??= createTerminal({ toast: () => {}, icon: () => "" }));
const ui_ = { open: false, faction: "", enemy: "", count: 1, zone: "", dmg: { expr: "", type: "phys", ignore: false, partial: false } };
const QUICK_DICE = ["1d6", "1d10", "2d6", "3d6"];
let section = null;

/* ---------------- the compendium ---------------- */
let packCache = null;
async function opponents() {
  if (packCache) return packCache;
  const pack = game.packs.get(`${sys()}.opponents`);
  if (!pack) return (packCache = { factions: [], byFaction: {} });
  const idx = await pack.getIndex({ fields: ["folder", "system.cat", "system.hp.max"] });
  const folders = pack.folders;
  const top = (id) => { let f = folders.get(id); while (f?.folder) f = folders.get(f.folder.id ?? f.folder); return f; };
  const byFaction = {};
  for (const e of idx) {
    if (e.type !== "enemy") continue;
    const f = top(e.folder);
    const key = f?.id ?? "_";
    (byFaction[key] ??= { name: f?.name ?? "Інші", list: [] }).list.push(e);
  }
  for (const v of Object.values(byFaction)) v.list.sort((a, b) => a.name.localeCompare(b.name, "uk"));
  const factions = Object.entries(byFaction).map(([id, v]) => ({ id, name: v.name })).sort((a, b) => a.name.localeCompare(b.name, "uk"));
  return (packCache = { factions, byFaction, pack });
}

/* ---------------- tokens into a zone ---------------- */

/** Free grid cells inside a zone (under its title strip and aspects), nearest the zone's middle first */
export function zoneCells(scene, zone, n) {
  const g = scene.grid.size;
  const taken = new Set(scene.tokens.map((t) => `${Math.round(t.x / g)}:${Math.round(t.y / g)}`));
  const cells = [];
  for (let y = zone.y + g; y + g <= zone.y + zone.h; y += g) for (let x = zone.x; x + g <= zone.x + zone.w; x += g) {
    if (!taken.has(`${Math.round(x / g)}:${Math.round(y / g)}`)) cells.push({ x, y });
  }
  const cx = zone.x + zone.w / 2, cy = zone.y + (zone.h + g) / 2;
  cells.sort((a, b) => Math.hypot(a.x + g / 2 - cx, a.y + g / 2 - cy) - Math.hypot(b.x + g / 2 - cx, b.y + g / 2 - cy));
  // a full zone: the rest stack on its last free cell's neighbourhood, inside the zone
  while (cells.length < n) cells.push({ x: zone.x + ((cells.length % Math.max(1, zone.w / g)) * g), y: zone.y + g });
  return cells.slice(0, n);
}


/** Personal names: the travel/tracker pools for humanoids, otherwise «Ім'я N» when there are several */
function namesFor(baseName, count, scene) {
  const rec = generatorRecord(term(), baseName) ?? { name: baseName };
  const used = new Set(scene.tokens.map((t) => t.name));
  const same = scene.tokens.filter((t) => t.name === baseName || t.name.startsWith(`${baseName} `)).length;
  const out = [];
  for (let i = 0; i < count; i++) {
    let n = term().battle.enemyName(rec, used);
    if (!n) n = count + same > 1 ? `${baseName} ${same + i + 1}` : baseName;
    used.add(n);
    out.push(n);
  }
  return out;
}

/** Put `count` unlinked tokens of `actor` into `zone` of `scene` */
export async function tokensIntoZone(scene, actor, count, zone) {
  const cells = zone ? zoneCells(scene, zone, count) : null;
  const names = namesFor(actor.name, count, scene);
  const g = scene.grid.size;
  const c = canvas.scene?.id === scene.id ? canvas.stage.pivot : { x: scene.width / 2, y: scene.height / 2 };
  const docs = [];
  for (let i = 0; i < count; i++) {
    const pos = cells?.[i] ?? { x: Math.round(c.x / g + i) * g, y: Math.round(c.y / g) * g };
    const td = await actor.getTokenDocument({ ...pos, name: names[i], actorLink: false });
    docs.push(td.toObject());
  }
  return scene.createEmbeddedDocuments("Token", docs);
}

/* ---------------- the panel ---------------- */

function countLine(scene) {
  const toks = scene?.tokens ?? [];
  const enemies = toks.filter((t) => t.actor?.type === "enemy");
  const up = enemies.filter((t) => Number(t.actor?.system?.hp?.value) > 0).length;
  const pcs = toks.filter((t) => t.actor?.type === "character").length;
  return `У строю <b>${up}</b> з <b>${enemies.length}</b> · Гравців <b>${pcs}</b>`;
}

async function bodyHtml() {
  const scene = canvas.scene;
  const place = scene?.getFlag(sys(), "battlePlace") ?? "", hazard = scene?.getFlag(sys(), "battleHazard") ?? "";
  const row = (kind, label, icon, val) => `<div class="pust-md-bscene" data-kind="${kind}">
      <span class="pust-md-blabel"><i class="fa-solid ${icon}"></i>${label}</span>
      <span class="pust-md-bval${val ? "" : " muted"}" title="${esc(val)}">${esc(val || "—")}</span>
      <button type="button" class="pust-md-bdie" data-battle="roll" data-kind="${kind}" title="Перекинути: ${label.toLowerCase()} з таблиць генератора натхнення" aria-label="Перекинути"><i class="fa-solid fa-dice"></i></button>
    </div>`;
  let form = "";
  if (ui_.open) {
    const { factions, byFaction } = await opponents();
    if (!ui_.faction || !byFaction[ui_.faction]) ui_.faction = factions[0]?.id ?? "";
    const list = byFaction[ui_.faction]?.list ?? [];
    if (!list.some((e) => e._id === ui_.enemy)) ui_.enemy = list[0]?._id ?? "";
    const zones = sceneZones();
    if (!zones.some((z) => z.id === ui_.zone)) ui_.zone = zones[0]?.id ?? "";
    const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel ? "selected" : ""}>${esc(l)}</option>`;
    form = `<div class="pust-md-bform">
      <label>Фракція<select data-battle-f="faction">${factions.map((f) => opt(f.id, f.name, f.id === ui_.faction)).join("")}</select></label>
      <label>Супротивник<select data-battle-f="enemy">${list.map((e) => opt(e._id, e.name, e._id === ui_.enemy)).join("")}</select></label>
      <div class="pust-md-bform-row">
        <label>Скільки<input type="number" class="pust-screen" data-battle-f="count" min="1" max="30" value="${ui_.count}"></label>
        <label>Зона<select data-battle-f="zone">${zones.length ? zones.map((z) => opt(z.id, zoneOf(z.doc).name, z.id === ui_.zone)).join("") : opt("", "Біля центру огляду", true)}</select></label>
      </div>
      <div class="pust-md-bform-btns"><button type="button" data-battle="cancel">Скасувати</button><button type="button" class="pust-md-bgo" data-battle="add"><i class="fa-solid fa-plus"></i><span>Додати</span></button></div>
    </div>`;
  }
  return `${row("place", "Місце", "fa-location-dot", place)}${row("hazard", "Небезпека", "fa-radiation", hazard)}
    <div class="pust-md-row pust-md-bbtns">
      <button type="button" data-battle="zone" title="Нова зона 6 × 5 клітинок біля центру огляду"><i class="fa-solid fa-vector-square"></i><span>Зона</span></button>
      <button type="button" data-battle="enemy" class="${ui_.open ? "on" : ""}" title="Додати супротивників із компендіуму в зону"><i class="fa-solid fa-skull"></i><span>Супротивник</span></button>
    </div>${form}
    ${roundHtml(scene)}
    ${damageHtml()}
    <p class="pust-md-bcount">${countLine(scene)}</p>`;
}

/** «Коло й Доля»: the round and the GM's Fate tokens of this scene */
function roundHtml(scene) {
  const round = Math.max(1, Number(scene?.getFlag(sys(), "battleRound")) || 1);
  const fate = Math.max(0, Number(scene?.getFlag(sys(), "battleFate")) || 0);
  const pcs = pcCount(scene);
  return `<div class="pust-md-bround">
      <span class="pust-md-blabel"><i class="fa-solid fa-rotate"></i>Коло дій</span>
      <button type="button" class="pust-md-barrow" data-battle="round" data-step="-1" ${round > 1 ? "" : "disabled"} title="Попереднє коло" aria-label="Попереднє коло"><i class="fa-solid fa-caret-left"></i></button>
      <span class="pust-md-bnum" title="Коло дій">${round}</span>
      <button type="button" class="pust-md-barrow pust-md-bnext" data-battle="round" data-step="1" title="Наступне коло: спершу діють гравці, потім Доглядач робить хід і переміщує одного НІПа" aria-label="Наступне коло"><i class="fa-solid fa-caret-right"></i></button>
    </div>
    <div class="pust-md-bround">
      <span class="pust-md-blabel" title="На кожну сцену Доглядач отримує стільки жетонів Долі, скільки персонажів гравців бере в ній участь"><i class="fa-solid fa-clover"></i>Жетони Долі</span>
      <span class="pust-md-n"><button type="button" data-battle="fate" data-d="-1" ${fate > 0 ? "" : "disabled"} title="Доглядач витрачає жетон Долі" aria-label="Витратити жетон Долі">−</button><input type="text" class="pust-screen" value="${fate}" readonly aria-label="Жетони Долі Доглядача"><button type="button" data-battle="fate" data-d="1" title="Додати жетон Долі" aria-label="Додати жетон Долі">+</button></span>
      <button type="button" class="pust-md-bset" data-battle="fateset" title="Виставити стільки жетонів, скільки персонажів гравців на сцені"><span>За гравцями</span><b>${pcs}</b></button>
    </div>`;
}

const pcCount = (scene) => (scene?.tokens ?? []).filter((t) => t.actor?.type === "character").length;

/** «Шкода й лікування»: what to deal and to whom (the selected tokens, or the targets) */
function damageHtml() {
  const d = ui_.dmg;
  const n = chosenTokens().length;
  const types = Object.entries(DMG_TYPES).map(([k, v]) => `<option value="${k}" ${k === d.type ? "selected" : ""}>${esc(v.n)}</option>`).join("");
  return `<div class="pust-md-bdmg">
      <div class="pust-md-bdmg-hd"><i class="fa-solid fa-burst"></i><span>Шкода й лікування</span><small title="Виділені токени, а коли нічого не виділено — цілі (T)">${n ? `виділено: ${n}` : "нікого не виділено"}</small></div>
      <div class="pust-md-row"><input type="text" class="pust-md-bexpr" data-battle-d="expr" value="${esc(d.expr)}" placeholder="5 або 2d6+1" aria-label="Шкода або лікування: число чи кістки" spellcheck="false">
        <select data-battle-d="type" aria-label="Тип шкоди">${types}</select></div>
      <div class="pust-md-row pust-md-bquick">${QUICK_DICE.map((q) => `<button type="button" data-battle="quick" data-q="${q}" title="Підставити ${q}">${q}</button>`).join("")}</div>
      <div class="pust-md-row pust-md-bchk">
        <label><input type="checkbox" data-battle-d="ignore" ${d.ignore ? "checked" : ""}> Ігнорує броню</label>
        <label title="Ті, хто за часткового успіху атаки отримує лише половину, отримають ½"><input type="checkbox" data-battle-d="partial" ${d.partial ? "checked" : ""}> Частковий успіх</label>
      </div>
      <div class="pust-md-row pust-md-bact">
        <button type="button" class="pust-md-bhit" data-battle="hit" ${n ? "" : "disabled"} title="Шкода виділеним: броня й стійкості кожного враховуються, як у трекері"><i class="fa-solid fa-burst"></i><span>Завдати шкоди</span></button>
        <button type="button" class="pust-md-bheal" data-battle="heal" ${n ? "" : "disabled"} title="Лікувати виділених (не вище максимуму ОЗ)"><i class="fa-solid fa-kit-medical"></i><span>Лікувати</span></button>
      </div>
    </div>`;
}

/** The amount typed: a number, or dice rolled now; null when it can't be read */
async function amountOf(expr) {
  const e = String(expr || "").trim().replace(/^d/i, "1d");
  if (!e) return null;
  if (/^\d+$/.test(e)) return { total: +e, label: e };
  try {
    const r = await new Roll(e).evaluate();
    return { total: Math.max(0, r.total), label: `${e} = ${r.total}` };
  } catch (_) { return null; }
}

/** The panel's section HTML (header with the fold button comes from map-dock's header()) */
export const battleSectionHtml = (header) => `<section class="pust-md-panel pust-md-battle" hidden>${header("fa-crosshairs", "Битва")}<div class="pust-md-body"></div></section>`;

export async function redrawBattlePanel() {
  if (!section || section.hidden) return;
  const body = section.querySelector(".pust-md-body");
  if (body.contains(document.activeElement) && document.activeElement.matches("input")) return; // not over typing
  body.innerHTML = await bodyHtml();
}

export function mountBattlePanel(sec) {
  section = sec;
  const body = sec.querySelector(".pust-md-body");
  body.addEventListener("click", onClick);
  body.addEventListener("input", (ev) => { if (ev.target.dataset.battleD === "expr") ui_.dmg.expr = ev.target.value; });
  body.addEventListener("change", (ev) => {
    const dk = ev.target.dataset.battleD;
    if (dk) { ui_.dmg[dk] = ev.target.type === "checkbox" ? ev.target.checked : ev.target.value; return; }
    const f = ev.target.dataset.battleF;
    if (!f) return;
    if (f === "count") ui_.count = Math.max(1, Math.min(30, parseInt(ev.target.value, 10) || 1));
    else ui_[f] = ev.target.value;
    if (f === "faction") { ui_.enemy = ""; redrawBattlePanel(); }
  });
  body.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target.dataset.battleF === "count") { ev.preventDefault(); ev.target.blur(); }
    if (ev.key === "Enter" && ev.target.dataset.battleD === "expr") { ev.preventDefault(); body.querySelector('[data-battle="hit"]')?.click(); }
    ev.stopPropagation(); // Foundry's hotkeys must not see the typing
  });
  redrawBattlePanel();
}

async function onClick(ev) {
  const b = ev.target.closest("[data-battle]");
  if (!b || !game.user.isGM) return;
  const act = b.dataset.battle, scene = canvas.scene;
  if (act === "zone") return addBattleZone();
  if (act === "enemy") { ui_.open = !ui_.open; return redrawBattlePanel(); }
  if (act === "cancel") { ui_.open = false; return redrawBattlePanel(); }
  if (act === "round" && scene) {
    const r = Math.max(1, (Number(scene.getFlag(sys(), "battleRound")) || 1) + Number(b.dataset.step));
    await scene.setFlag(sys(), "battleRound", r);
    if (Number(b.dataset.step) > 0) {
      await postChat({ speaker: { alias: "Коло дій" }, content: `<div class="pust-chat pust-round"><h4><i class="fa-solid fa-play"></i> Почалося коло дій ${r}</h4><p>Спершу діють гравці, потім Доглядач робить хід і переміщує одного НІПа.</p></div>` });
    }
    return;
  }
  if (act === "fate" && scene) return scene.setFlag(sys(), "battleFate", Math.max(0, (Number(scene.getFlag(sys(), "battleFate")) || 0) + Number(b.dataset.d)));
  if (act === "fateset" && scene) return scene.setFlag(sys(), "battleFate", pcCount(scene));
  if (act === "quick") { ui_.dmg.expr = b.dataset.q; return redrawBattlePanel(); }
  if (act === "hit" || act === "heal") {
    const who = chosenTokens();
    if (!who.length) return ui.notifications.warn("Спершу виділи токени (клік, Shift+клік, рамка або «Обрати всіх» у зоні) чи познач цілі (T).");
    const amt = await amountOf(ui_.dmg.expr);
    if (!amt) return ui.notifications.warn("Впиши число або кістки, наприклад 5 чи 2d6+1.");
    b.disabled = true;
    try {
      if (act === "heal") await applyHeal(who, amt.total, { head: amt.label });
      else {
        const type = ui_.dmg.type;
        await applyDamage(who, { total: amt.total, type: chatType(type), ignoreArmor: ui_.dmg.ignore, ignoreN: 0 }, { partial: ui_.dmg.partial, head: `${amt.label} · ${DMG_TYPES[type]?.n ?? type}` });
      }
    } finally { b.disabled = false; }
    return;
  }
  if (act === "roll" && scene) {
    const kind = b.dataset.kind, key = kind === "place" ? "battlePlace" : "battleHazard";
    const v = term().battle.sceneRoll(kind, scene.getFlag(sys(), key) ?? "");
    if (v) await scene.setFlag(sys(), key, v);
    return;
  }
  if (act === "add" && scene) {
    const { byFaction, pack } = await opponents();
    const entry = byFaction[ui_.faction]?.list.find((e) => e._id === ui_.enemy);
    if (!entry) return;
    b.disabled = true;
    try {
      const folder = await battleFolder(byFaction[ui_.faction].name, "");
      let actor = game.actors.find((a) => a.type === "enemy" && a.folder?.id === folder.id && a.name === entry.name);
      if (!actor) {
        const data = (await pack.getDocument(entry._id)).toObject();
        delete data._id;
        foundry.utils.setProperty(data, "_stats.compendiumSource", entry.uuid);
        data.folder = folder.id;
        actor = await Actor.implementation.create(data);
      }
      const zone = sceneZones().find((z) => z.id === ui_.zone) ?? null;
      const made = await tokensIntoZone(scene, actor, ui_.count, zone);
      ui.notifications.info(`${entry.name} × ${made.length}${zone ? ` → «${zoneOf(zone.doc).name}»` : ""}`);
    } finally { b.disabled = false; }
  }
}

// the count and the place / hazard follow the scene
const later = foundry.utils.debounce(() => redrawBattlePanel(), 150);
for (const h of ["createToken", "deleteToken", "updateToken", "updateActor", "createDrawing", "deleteDrawing", "updateDrawing", "controlToken", "targetToken"]) Hooks.on(h, later);
Hooks.on("updateScene", (scene) => { if (scene.id === canvas?.scene?.id) later(); });
