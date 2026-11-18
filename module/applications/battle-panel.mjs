/**
 * «Битва» — the left panel on «Бойова мапа» (author, 2026-11-14; the HTML battle tracker's header and add forms, without
 * its bottom panel). For the GM:
 *   – the battle's place and hazard (shared by every scene — helpers/scene-shared.mjs; author, 2026-11-16), each with a die that rolls the
 *     inspiration tables anew (never the same twice; «Сховище» gets its number); the place picks the zones' name pools;
 *   – «+ Зона» (module/canvas/battle-zones.mjs) and «+ Супротивник»: faction → enemy (the «opponents» compendium) →
 *     how many → which zone; the actor goes to the Actors folder «Битви → <фракція>», unlinked tokens (the kind's name,
 *     «Ім'я N»; no personal names — author, 2026-11-14) land on free cells of the zone;
 *   – «Коло й Доля» (author, 2026-11-14; the tracker's bottom bar): the round ◀ ▶ (the next one posts the tracker's
 *     reminder), the GM's Fate tokens − / + and «За гравцями» (as many as the player characters on the scene);
 *     shared by every scene too (helpers/scene-shared.mjs);
 *   – «Шкода й лікування» (the tracker's damage panel): a number or dice, the type, «Ігнорує броню», «½ шкоди» (author, 2026-11-16: was «Частковий успіх», which halved only the rare targets with «½ за часткового успіху атаки»),
 *     quick dice; «Завдати шкоди» / «Лікувати» go to the targets through apply-damage.mjs —
 *     armour, defences, Камікадзе counted as in the tracker;
 *   – the count «У строю X з Y · Гравців N».
 * Players don't get this panel. map-dock.mjs shows it instead of «Мапа Пустки» while the battle map is viewed.
 * Off the battle map (author, 2026-11-16) the GM has it too, top right, «lite»: no zones, enemies or round; its damage and
 * healing go to the players' characters and caravans ticked in a list (as the GM's «Доля» list) — they may have no token on
 * the scene. The fields keep their values from scene to scene; the ticks are cleared when the scene changes.
 */
import { variantTextures } from "../helpers/token-variants.mjs";
import { tokenLevel } from "../helpers/token-level.mjs";
import { createTerminal } from "../rules/terminal.mjs";
import { battleFolder, asKind, OPPONENT_ALIASES } from "./terminal-battle.mjs";
import { pickKind } from "../rules/enemy-kinds.mjs";
import { sceneZones, zoneOf, addBattleZone } from "../canvas/battle-zones.mjs";
import { applyDamage, applyHeal, chosenTokens, warnNoTargets, clearTargets } from "./apply-damage.mjs";
import { fatePickList } from "./map-dice.mjs";
import { sharedGet, sharedSet } from "../helpers/scene-shared.mjs";
import { findBattleScene, findMapScene, isBattleScene } from "../helpers/default-scene.mjs";
import { AUTO, SAND, SAND_NAME, BATTLE_BACKGROUNDS, wantedBg, bgThumb, bgName, bgKeyOfSrc } from "../rules/battle-backgrounds.mjs";
import { bgChoice, bgNow, setBgChoice } from "../helpers/battle-background.mjs";
import { DMG_TYPES, bumpExpr } from "../rules/battle.mjs";
import { chatType } from "./enemy-attack.mjs";
import { postChat } from "./chat.mjs";
import { endForAll, groupSession, resetGroupCounters } from "./group-end.mjs";
import { notify } from "../helpers/notify.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const sys = () => game.system.id;
let T = null;
const term = () => (T ??= createTerminal({ toast: () => {}, icon: () => "" }));
const ui_ = { open: false, faction: "", enemy: "", count: 1, zone: "", dmg: { expr: "", type: "phys", ignore: false, dodge: false }, moves: false };
const QUICK_DICE = ["1d6", "1d10", "2d6", "3d6"];
/** the panel's sections: the battle map's one and the «lite» one (sec → lite) */
const sections = new Map();
/** «lite»: the ticked actors (ids), cleared when the scene changes */
const picks = new Set();

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


/**
 * Token names: the kind's name, «Ім'я N» when there are several. No personal names rolled (author, 2026-11-14): the GM
 * rolls one from the enemy's card when it matters.
 */
function namesFor(baseName, count, scene) {
  const same = scene.tokens.filter((t) => t.name === baseName || t.name.startsWith(`${baseName} `)).length;
  return Array.from({ length: count }, (_, i) => (count + same > 1 ? `${baseName} ${same + i + 1}` : baseName));
}

/** Put `count` unlinked tokens of `actor` into `zone` of `scene` */
export async function tokensIntoZone(scene, actor, count, zone) {
  const cells = zone ? zoneCells(scene, zone, count) : null;
  const names = namesFor(actor.name, count, scene);
  const g = scene.grid.size;
  const c = canvas.scene?.id === scene.id ? canvas.stage.pivot : { x: scene.width / 2, y: scene.height / 2 };
  const docs = [];
  const tex = variantTextures(scene, actor, count); // different faces of one kind (token-variants.mjs)
  for (let i = 0; i < count; i++) {
    const pos = cells?.[i] ?? { x: Math.round(c.x / g + i) * g, y: Math.round(c.y / g) * g };
    const td = await actor.getTokenDocument({ ...pos, name: names[i], actorLink: false, ...tokenLevel(scene), ...(tex ? { texture: { src: tex[i] } } : {}) });
    docs.push(td.toObject());
  }
  return scene.createEmbeddedDocuments("Token", docs, { pustTokens: true });
}

/* ---------------- the panel ---------------- */

function countLine(scene) {
  const toks = scene?.tokens ?? [];
  const enemies = toks.filter((t) => t.actor?.type === "enemy");
  const up = enemies.filter((t) => Number(t.actor?.system?.hp?.value) > 0).length;
  const pcs = toks.filter((t) => t.actor?.type === "character").length;
  return `У строю <b>${up}</b> з <b>${enemies.length}</b> · Гравців <b>${pcs}</b>`;
}

async function bodyHtml(lite = false) {
  const scene = canvas.scene;
  const place = sharedGet("place") ?? "", hazard = sharedGet("hazard") ?? "";
  const row = (kind, label, icon, val, extra = "") => `<div class="pust-md-bscene" data-kind="${kind}">
      <span class="pust-md-blabel"><i class="fa-solid ${icon}"></i>${label}</span>
      <span class="pust-md-bval${val ? "" : " muted"}" title="${esc(val)}">${esc(val || "—")}</span>
      <button type="button" class="pust-md-bdie" data-battle="roll" data-kind="${kind}" title="Перекинути: ${label.toLowerCase()} з таблиць генератора натхнення" aria-label="Перекинути"><i class="fa-solid fa-dice"></i></button>${extra}
    </div>`;
  let form = "";
  if (ui_.open && !lite) {
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
  // the place, the hazard and the zone / enemy buttons in one block (the tour lights them together; author, 2026-11-16)
  if (lite) return `<div class="pust-md-bsetup">${row("place", "Місце", "fa-location-dot", place)}${row("hazard", "Небезпека", "fa-radiation", hazard)}</div>
    ${roundHtml(scene, true)}
    ${damageHtml(true)}
    ${endHtml()}
    <button type="button" class="pust-md-bgoto" data-battle="goto" title="Відкрити й активувати бойову мапу: гравці перейдуть туди теж"><i class="fa-solid fa-crosshairs"></i><span>Перейти на бойову мапу</span></button>`;
  return `<div class="pust-md-bsetup">${row("place", "Місце", "fa-location-dot", place, bgButton(scene))}${row("hazard", "Небезпека", "fa-radiation", hazard)}
    <div class="pust-md-row pust-md-bbtns">
      <button type="button" data-battle="zone" title="Нова зона 6 × 5 клітинок біля центру огляду"><i class="fa-solid fa-vector-square"></i><span>Зона</span></button>
      <button type="button" data-battle="enemy" class="${ui_.open ? "on" : ""}" title="Додати супротивників із компендіуму в зону"><i class="fa-solid fa-skull"></i><span>Супротивник</span></button>
    </div></div>${form}
    ${roundHtml(scene)}
    ${damageHtml()}
    <p class="pust-md-bcount">${countLine(scene)}</p>
    ${endHtml()}
    <button type="button" class="pust-md-bgoto" data-battle="goto" title="Відкрити й активувати «Мапу Пустки»: гравці перейдуть туди теж"><i class="fa-solid fa-map-location-dot"></i><span>Перейти на Мапу Пустки</span></button>`;
}

/**
 * The round and the GM's Fate tokens change at once on a click (author, 2026-11-15: each click used to wait for the
 * server and redraw the whole panel — slow, and a click before the answer read the old number and got lost): the value
 * lives here until it is written, the shown number and buttons are set directly, and the scene flag is written once a
 * quarter of a second after the last click
 */
const pend = { battleRound: null, battleFate: null };
const SHARED = { battleRound: "round", battleFate: "fate" };
const flagNow = (scene, k, def) => (pend[k] != null ? pend[k] : (Number(sharedGet(SHARED[k])) || def));
const writePending = foundry.utils.debounce(async () => {
  const upd = {};
  for (const k of ["battleRound", "battleFate"]) if (pend[k] != null) upd[SHARED[k]] = pend[k];
  const sent = { battleRound: pend.battleRound, battleFate: pend.battleFate };
  if (Object.keys(upd).length) await sharedSet(upd);
  // clicked again while writing: keep the newer value for the next write
  for (const k of ["battleRound", "battleFate"]) if (pend[k] === sent[k]) pend[k] = null;
}, 250);
function showRoundFate(body, round, fate) {
  const n = body?.querySelector(".pust-md-bnum");
  if (n) n.textContent = String(round);
  const prev = body?.querySelector('[data-battle="round"][data-step="-1"]');
  if (prev) prev.disabled = round <= 1;
  const f = body?.querySelector('[data-battle="fate"][data-d="-1"]')?.parentElement;
  if (f) { f.querySelector("input").value = String(fate); f.querySelector('[data-d="-1"]').disabled = fate <= 0; }
}

/**
 * The round one step on (or back): the number shown at once in every panel, written a moment later; the next one posts
 * the tracker's reminder (the «Битва» panel's ◀ ▶ and the hotkey Alt+W; author, 2026-11-17)
 */
export function stepRound(step) {
  if (!game.user.isGM) return;
  const r0 = Math.max(1, flagNow(canvas.scene, "battleRound", 1));
  const r = Math.max(1, r0 + step);
  if (r === r0) return;
  pend.battleRound = r;
  for (const [sec] of sections) if (sec.isConnected) showRoundFate(sec.querySelector(".pust-md-body"), r, Math.max(0, flagNow(canvas.scene, "battleFate", 0)));
  writePending();
  if (step > 0) {
    postChat({ speaker: { alias: "Коло дій" }, content: `<div class="pust-chat pust-round"><div class="pust-round-hd"><i class="fa-solid fa-rotate"></i><span>Почалося коло дій</span><b>${r}</b></div><p>Спершу діють гравці, потім Доглядач робить хід і переміщує одного НІПа.</p></div>` });
  }
}

/** The hotkey Alt+A (author, 2026-11-17): the panel on view («Сцена» or «Битва») unfolded, its damage field focused */
export async function focusDamage() {
  if (!game.user.isGM) return;
  for (const [sec] of sections) {
    if (!sec.isConnected || sec.hidden) continue;
    const unit = sec.closest(".pust-md-unit");
    if (unit?.classList.contains("folded")) { (await import("./map-dock.mjs")).unfoldUnit(unit.dataset.unit); await new Promise((r) => setTimeout(r, 60)); }
    const f = sec.querySelector('[data-battle-d="expr"]');
    if (f) { f.focus(); f.select(); return; }
  }
}

/** «Коло й Доля»: the round and the GM's Fate tokens of this scene */
function roundHtml(scene, lite = false) {
  const round = Math.max(1, flagNow(scene, "battleRound", 1));
  const fate = Math.max(0, flagNow(scene, "battleFate", 0));
  const pcs = lite ? litePcCount() : pcCount(scene);
  // both rows in one block (the tour lights them together; author, 2026-11-16)
  const roundRow = lite ? "" : `<div class="pust-md-bround">
      <span class="pust-md-blabel"><i class="fa-solid fa-rotate"></i>Коло дій</span>
      <button type="button" class="pust-md-barrow" data-battle="round" data-step="-1" ${round > 1 ? "" : "disabled"} title="Попереднє коло" aria-label="Попереднє коло"><i class="fa-solid fa-caret-left"></i></button>
      <span class="pust-md-bnum" title="Коло дій">${round}</span>
      <button type="button" class="pust-md-barrow pust-md-bnext" data-battle="round" data-step="1" title="Наступне коло: спершу діють гравці, потім Доглядач робить хід і переміщує одного НІПа" aria-label="Наступне коло"><i class="fa-solid fa-caret-right"></i></button>
    </div>`;
  return `<div class="pust-md-brf">${roundRow}
    <div class="pust-md-bround">
      <span class="pust-md-blabel" title="На кожну сцену Доглядач отримує стільки жетонів Долі, скільки персонажів гравців бере в ній участь"><i class="fa-solid fa-clover"></i>Жетони Долі</span>
      <span class="pust-md-n"><button type="button" data-battle="fate" data-d="-1" ${fate > 0 ? "" : "disabled"} title="Доглядач витрачає жетон Долі" aria-label="Витратити жетон Долі">−</button><input type="text" class="pust-screen" value="${fate}" readonly aria-label="Жетони Долі Доглядача"><button type="button" data-battle="fate" data-d="1" title="Додати жетон Долі" aria-label="Додати жетон Долі">+</button></span>
      <button type="button" class="pust-md-bset" data-battle="fateset" title="${lite ? "Виставити стільки жетонів, скільки персонажів гравців, які зараз у грі" : "Виставити стільки жетонів, скільки персонажів гравців на сцені"}"><span>За гравцями</span><b>${pcs}</b></button>
    </div></div>`;
}

const pcCount = (scene) => (scene?.tokens ?? []).filter((t) => t.actor?.type === "character").length;
/** «lite»: the players' characters whose players are in the game */
const litePcCount = () => fatePickList().filter((x) => x.kind === "character" && x.online).length;
/** «lite»: the ticked actors' uuids (gone ones dropped) */
const pickedUuids = () => [...picks].map((id) => game.actors.get(id)?.uuid).filter(Boolean);

/** «Шкода й лікування»: what to deal and to whom (the targets) */
function damageHtml(lite = false) {
  const d = ui_.dmg;
  const n = lite ? pickedUuids().length : chosenTokens().length;
  const types = Object.entries(DMG_TYPES).map(([k, v]) => `<option value="${k}" ${k === d.type ? "selected" : ""}>${esc(v.n)}</option>`).join("");
  return `<div class="pust-md-bdmg">
      <div class="pust-md-bdmg-hd"><i class="fa-solid fa-burst"></i><span>Шкода й лікування</span>${lite ? `<small title="Шкода й лікування йдуть персонажам і караванам, позначеним у списку «Вибрати цілі»">${n ? `цілей: ${n}` : "цілей немає"}</small>` : ""}</div>
      ${lite ? `<div class="pust-md-row pust-md-btgt">
        <button type="button" data-battle="pick" title="Позначити персонажів гравців і каравани, яким іде шкода чи лікування"><i class="fa-solid fa-bullseye"></i><span>Вибрати цілі</span></button>
      </div>` : ""}
      <div class="pust-md-row"><input type="text" class="pust-md-bexpr" data-battle-d="expr" value="${esc(d.expr)}" placeholder="5 або 2d6+1" aria-label="Шкода або лікування: число чи кістки" spellcheck="false">
        <select data-battle-d="type" aria-label="Тип шкоди">${types}</select></div>
      <div class="pust-md-row pust-md-bquick">${QUICK_DICE.map((q) => `<button type="button" data-battle="quick" data-q="${q}" title="Підставити ${q}">${q}</button>`).join("")}<button type="button" class="pust-md-bmod" data-battle="mod" data-mod="-1" title="Модифікатор −1">−1</button><button type="button" class="pust-md-bmod" data-battle="mod" data-mod="1" title="Модифікатор +1">+1</button></div>
      <div class="pust-md-row pust-md-bchk">
        <label><input type="checkbox" data-battle-d="ignore" ${d.ignore ? "checked" : ""}> Ігнорує броню</label>
        <label title="Половина шкоди з округленням угору, до броні: часткове уникнення (10–14), власний вибух, «Погонич»…"><input type="checkbox" data-battle-d="dodge" ${d.dodge ? "checked" : ""}> ½ шкоди</label>
      </div>
      <div class="pust-md-row pust-md-bact">
        <button type="button" class="pust-md-bhit" data-battle="hit" ${n ? "" : "disabled"} title="Шкода цілям: броня й стійкості кожного враховуються, як у трекері"><i class="fa-solid fa-burst"></i><span>Завдати шкоди</span></button>
        <button type="button" class="pust-md-bheal" data-battle="heal" ${n ? "" : "disabled"} title="Лікувати цілі (не вище максимуму ОЗ)"><i class="fa-solid fa-kit-medical"></i><span>Лікувати</span></button>
      </div>
    </div>`;
}

/**
 * «Кінець сцени» / «Новий день» / «Кінець сесії» for every character assigned to a player (author, 2026-11-17; group-end.mjs),
 * «Скинути ходи ворогів» clears every used move of the scene's enemies too
 */
function endHtml() {
  const who = "усіх персонажів, призначених гравцям";
  const sess = groupSession();
  return `<div class="pust-md-bend">
      <div class="pust-md-row pust-md-bendbtns">
        <button type="button" data-battle="end" data-kind="scene" title="Завершити сцену для ${who}: хімія й ефекти сцени, лють, бухло, кістки суперстимпака, пролікований легкий наслідок"><i class="fa-solid fa-flag-checkered"></i><span>Кінець сцени</span></button>
        <button type="button" data-battle="end" data-kind="day" title="Новий день для ${who}: спершу кінець сцени, потім ліміти стимпаків і цілющого порошку, відпочинок, хімія на день"><i class="fa-solid fa-sun"></i><span>Новий день</span></button>
        <button type="button" data-battle="end" data-kind="session" title="Завершити сесію для ${who}: спершу кінець сцени, потім Жетони Долі, модифікації, залежності, проліковані наслідки, штрафи до кінця сесії"><i class="fa-solid fa-moon"></i><span>Кінець сесії</span></button>
      </div>
      <div class="pust-md-bendft">
        <label class="pust-md-bendmv" title="Разом із кінцем сцени зняти «використано» з усіх ходів ворогів на цій сцені (зокрема «раз за сцену» і «Психо»)"><input type="checkbox" data-battle-d="moves" ${ui_.moves ? "checked" : ""}> Скинути ходи ворогів сцени</label>
        <span class="pust-md-bsess" title="${esc(sess.list.length ? `Номер сесії персонажів гравців: ${sess.list.join(", ")}` : "Жодного персонажа не призначено гравцям")}">Сесія <b>${esc(sess.label)}</b></span>
        <button type="button" class="pust-md-bsreset" data-battle="sessreset" title="Скинути відлік усім персонажам гравців: сесія 1, день 1, сцена 1. Натисни двічі" aria-label="Скинути відлік сесій, днів і сцен"><i class="fa-solid fa-clock-rotate-left"></i></button>
      </div>
    </div>`;
}

/** The amount typed: a number, or dice rolled now; null when it can't be read */
async function amountOf(expr) {
  // any minus on dice may be typed; the result is never below 0 (author, 2026-11-14), the label shows what is applied
  const e = String(expr || "").trim().replace(/^d/i, "1d");
  if (!e) return null;
  if (/^\d+$/.test(e)) return { total: +e, label: e };
  try {
    const r = await new Roll(e).evaluate();
    const total = Math.max(0, r.total);
    return { total, dice: r.dice.reduce((n, d) => n + d.number, 0), label: `${e} = ${r.total}${r.total < 0 ? " → 0" : ""}` };
  } catch (_) { return null; }
}

/** The panel's section HTML (header with the fold button comes from map-dock's header()) */
export const battleSectionHtml = (header) => `<section class="pust-md-panel pust-md-battle" hidden>${header("fa-crosshairs", "Битва")}<div class="pust-md-body"></div></section>`;

export async function redrawBattlePanel() {
  for (const [sec, lite] of sections) {
    if (!sec.isConnected || sec.hidden) continue;
    const body = sec.querySelector(".pust-md-body");
    if (body.contains(document.activeElement) && document.activeElement.matches("input")) continue; // not over typing
    body.innerHTML = await bodyHtml(lite);
  }
}

/** The tour opens and closes the «Супротивник» form (author, 2026-11-16) */
export async function setEnemyFormOpen(on) {
  ui_.open = !!on;
  await redrawBattlePanel();
}

export function mountBattlePanel(sec, { lite = false } = {}) {
  sections.set(sec, lite);
  const body = sec.querySelector(".pust-md-body");
  body.addEventListener("click", (ev) => onClick(ev, lite, body));
  body.addEventListener("input", (ev) => { if (ev.target.dataset.battleD === "expr") ui_.dmg.expr = ev.target.value; });
  body.addEventListener("change", (ev) => {
    const dk = ev.target.dataset.battleD;
    if (dk === "moves") { ui_.moves = ev.target.checked; return; }
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

async function onClick(ev, lite = false, body = null) {
  const b = ev.target.closest("[data-battle]");
  if (!b || !game.user.isGM) return;
  const act = b.dataset.battle, scene = canvas.scene;
  if (act === "zone") return addBattleZone();
  if (act === "enemy") { ui_.open = !ui_.open; return redrawBattlePanel(); }
  if (act === "cancel") { ui_.open = false; return redrawBattlePanel(); }
  if (act === "round" && scene) return stepRound(Number(b.dataset.step));
  if (act === "fate" && scene) {
    const cur = Math.max(0, flagNow(scene, "battleFate", 0));
    const next = Math.max(0, cur + Number(b.dataset.d));
    if (next === cur) return;
    pend.battleFate = next;
    showRoundFate(body, Math.max(1, flagNow(scene, "battleRound", 1)), next);
    writePending();
    // the GM spending a Fate token: a chat card like the players' but in the GM's colours (author, 2026-11-15)
    if (next < cur) {
      postChat({ speaker: { alias: "Доглядач" }, content: `<div class="pust-chat pust-fdcard pust-gmfd"><i class="fa-solid fa-clover"></i><span><b>Доглядач</b> витрачає жетон Долі</span></div>` }); // no count: the GM's tokens stay hidden from the players
    }
    return;
  }
  if (act === "fateset" && scene) {
    pend.battleFate = lite ? litePcCount() : pcCount(scene);
    showRoundFate(body, Math.max(1, flagNow(scene, "battleRound", 1)), pend.battleFate);
    return writePending();
  }
  if (act === "quick") { ui_.dmg.expr = b.dataset.q; return redrawBattlePanel(); }
  // the tracker's «−1» / «+1» (author, 2026-11-14): the number or the dice's modifier one up or down
  if (act === "mod") { ui_.dmg.expr = bumpExpr(ui_.dmg.expr, Number(b.dataset.mod)); return redrawBattlePanel(); }
  // targets (author, 2026-11-15): the selected tokens become the targets; or all targets cleared
  if (act === "tgtsel") {
    const ids = (canvas?.tokens?.controlled ?? []).map((t) => t.id);
    if (!ids.length) return notify.warn("Спершу виділи токени (клік, Shift+клік, рамка), а тоді зроби їх цілями.");
    canvas.tokens.setTargets(ids, { mode: "replace" });
    return;
  }
  if (act === "tgtclear") { canvas.tokens.setTargets([], { mode: "replace" }); return; }
  if (act === "pick") return togglePick(b);
  if (act === "bgpick" && scene) return toggleBgPick(b, scene);
  if (act === "goto") return gotoScene(lite);
  if (act === "sessreset") {
    // asks twice, as every destructive button (author, 2026-11-17)
    if (!b.classList.contains("armed")) {
      b.classList.add("armed");
      notify.info("Натисни ще раз, щоб скинути відлік сесій, днів і сцен.");
      setTimeout(() => b.classList.remove("armed"), 3000);
      return;
    }
    b.classList.remove("armed");
    b.disabled = true;
    try { await resetGroupCounters(); } finally { b.disabled = false; redrawBattlePanel(); }
    return;
  }
  if (act === "end") {
    b.disabled = true;
    try {
      // a new scene starts: round 1, the GM's Fate tokens as «За гравцями» of this panel (author, 2026-11-17)
      const fate = lite ? litePcCount() : pcCount(scene);
      const done = await endForAll(b.dataset.kind, { moves: ui_.moves, fate });
      if (done) { pend.battleRound = null; pend.battleFate = null; redrawBattlePanel(); }
    } finally { b.disabled = false; }
    return;
  }
  if (act === "hit" || act === "heal") {
    const who = lite ? pickedUuids() : chosenTokens();
    if (!who.length) return lite ? notify.warn("Спершу познач цілі в списку «Вибрати цілі».") : warnNoTargets();
    const amt = await amountOf(ui_.dmg.expr);
    if (!amt) return notify.warn("Впиши число або кістки, наприклад 5 чи 2d6+1.");
    b.disabled = true;
    try {
      if (act === "heal") await applyHeal(who, amt.total, { head: amt.label });
      else {
        const type = ui_.dmg.type;
        await applyDamage(who, { total: amt.total, dice: amt.dice || 0, type: chatType(type), ignoreArmor: ui_.dmg.ignore, ignoreN: 0 }, { dodge: ui_.dmg.dodge, head: `${amt.label} · ${DMG_TYPES[type]?.n ?? type}` });
      }
      if (lite) { picks.clear(); closePick(); redrawBattlePanel(); } else clearTargets();
    } finally { b.disabled = false; }
    return;
  }
  if (act === "roll" && scene) {
    const kind = b.dataset.kind;
    const v = term().battle.sceneRoll(kind, sharedGet(kind) ?? "");
    if (v) await sharedSet({ [kind]: v });
    return;
  }
  if (act === "add" && scene) {
    const { byFaction, pack } = await opponents();
    const entry = byFaction[ui_.faction]?.list.find((e) => e._id === ui_.enemy);
    if (!entry) return;
    b.disabled = true;
    try {
      const folder = await battleFolder(byFaction[ui_.faction].name, "");
      // a group enemy comes as one concrete kind, the whole batch (author, 2026-11-16)
      const kind = pickKind(entry.name, OPPONENT_ALIASES);
      const name = kind?.name ?? entry.name;
      let actor = game.actors.find((a) => a.type === "enemy" && a.folder?.id === folder.id && a.name === name);
      if (!actor) {
        const data = (await pack.getDocument(entry._id)).toObject();
        delete data._id;
        foundry.utils.setProperty(data, "_stats.compendiumSource", entry.uuid);
        data.folder = folder.id;
        if (kind) asKind(data, kind.name);
        foundry.utils.setProperty(data, "flags.pust.battleMade", true); // made for this battle: goes with its last token (wastelanders.mjs mapBound)
        actor = await Actor.implementation.create(data);
      }
      const zone = sceneZones().find((z) => z.id === ui_.zone) ?? null;
      const made = await tokensIntoZone(scene, actor, ui_.count, zone);
      notify.info(`${name} × ${made.length}${zone ? ` → «${zoneOf(zone.doc).name}»` : ""}`);
    } finally { b.disabled = false; }
  }
}

// the count and the place / hazard follow the scene
const later = foundry.utils.debounce(() => redrawBattlePanel(), 150);
for (const h of ["createToken", "deleteToken", "updateToken", "updateActor", "createDrawing", "deleteDrawing", "updateDrawing", "controlToken", "targetToken"]) Hooks.on(h, later);
Hooks.on("updateScene", (scene) => { if (scene.id === canvas?.scene?.id) later(); });

/* ---------------- «lite»: the targets' list (author, 2026-11-16) ---------------- */
/**
 * «Вибрати цілі» off the battle map: a list under the button, as the GM's «Доля» list — the players' characters (online
 * first, a green dot) and every caravan, each with its ОЗ and a tick; the ticks are the targets at once. «Позначити всіх» /
 * «Зняти всі»; × / Esc / a click elsewhere closes it. The ticks are cleared when the scene changes.
 */
let pickEl = null;
function closePick() {
  if (!pickEl) return;
  pickEl.el.remove();
  document.removeEventListener("pointerdown", pickEl.onDown, true);
  document.removeEventListener("keydown", pickEl.onKey, true);
  pickEl = null;
}

function pickHtml(list) {
  const hp = (a) => { const v = a?.system?.hp ?? {}; return `${Number(v.value) || 0}/${Number(v.max) || 0}`; };
  const row = (x) => `<li class="pust-fp-row"><input type="checkbox" data-pk-tick="${x.id}" ${picks.has(x.id) ? "checked" : ""} aria-label="Ціль «${esc(x.name)}»">
      <button type="button" class="pust-fp-name" data-pk-one="${x.id}" title="Позначити чи зняти «${esc(x.name)}»">${x.kind === "caravan" ? '<i class="fa-solid fa-truck" aria-hidden="true"></i>' : `<i class="fa-solid fa-user" aria-hidden="true"></i><span class="pust-fp-dot${x.online ? " on" : ""}" title="${x.online ? "Гравець у грі" : "Гравець не в грі"}"></span>`}<span>${esc(x.name)}</span>${x.player ? `<small>${esc(x.player)}</small>` : ""}</button>
      <span class="pust-fp-mod" title="Очки здоров'я">${hp(game.actors.get(x.id))}</span></li>`;
  const chars = list.filter((x) => x.kind === "character"), cars = list.filter((x) => x.kind === "caravan");
  const n = list.filter((x) => picks.has(x.id)).length;
  return `<header><i class="fa-solid fa-bullseye"></i><span>Цілі шкоди й лікування</span><button type="button" class="pust-fp-x" data-pk-close title="Закрити" aria-label="Закрити"><i class="fa-solid fa-xmark"></i></button></header>
    ${list.length ? `<div class="pust-fp-list">${chars.length ? `<h5>Персонажі гравців</h5><ul>${chars.map(row).join("")}</ul>` : ""}${cars.length ? `<h5>Каравани</h5><ul>${cars.map(row).join("")}</ul>` : ""}</div>
    <footer><button type="button" class="pust-fp-all" data-pk-all>${n === list.length ? "Зняти всі" : "Позначити всіх"}</button>
      <button type="button" class="pust-fp-go" data-pk-close><i class="fa-solid fa-check"></i>Готово${n ? ` (${n})` : ""}</button></footer>`
    : `<p class="pust-fp-empty">Немає ні персонажів, призначених гравцям, ні караванів. Признач гравцям персонажів у їхніх налаштуваннях.</p>`}`;
}

/** A pop-up under its button, its right edge with the button's; above it when there is no room below; scrolls inside */
function placePop(el, btn) {
  const r = btn.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  const left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w));
  let floor = window.innerHeight - 8;
  for (const sel of ["#players", "#hotbar"]) {
    const f = document.querySelector(sel)?.getBoundingClientRect();
    if (f?.height && f.left < left + w && f.right > left) floor = Math.min(floor, f.top - 8);
  }
  const below = floor - (r.bottom + 6), above = r.top - 6 - 8;
  const down = h <= below || below >= above;
  const room = Math.max(120, down ? below : above);
  el.style.maxHeight = `${Math.floor(room)}px`;
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(down ? r.bottom + 6 : Math.max(8, r.top - 6 - Math.min(h, room)))}px`;
}

function togglePick(btn) {
  if (pickEl) return closePick();
  const el = document.createElement("div");
  el.className = "pust-fatepick pust-tgtpick";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Цілі шкоди й лікування");
  const list = fatePickList();
  const draw = () => { el.innerHTML = pickHtml(list); };
  const changed = () => { draw(); redrawBattlePanel(); };
  draw();
  document.body.append(el);
  placePop(el, btn);
  el.addEventListener("change", (ev) => {
    const id = ev.target.dataset.pkTick;
    if (!id) return;
    if (ev.target.checked) picks.add(id); else picks.delete(id);
    changed();
  });
  el.addEventListener("click", (ev) => {
    const t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.pkClose !== undefined) return closePick();
    if (t.dataset.pkAll !== undefined) {
      if (list.every((x) => picks.has(x.id))) list.forEach((x) => picks.delete(x.id)); else list.forEach((x) => picks.add(x.id));
      return changed();
    }
    const one = t.dataset.pkOne;
    if (one) { if (picks.has(one)) picks.delete(one); else picks.add(one); changed(); }
  });
  const onDown = (ev) => { if (!el.contains(ev.target) && !btn.contains(ev.target)) closePick(); };
  const onKey = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); closePick(); } };
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  pickEl = { el, onDown, onKey };
}

/* ---------------- the battle scene's background (author, 2026-11-18) ---------------- */
/** Beside «Місце»: the scene's picture in small, a click opens the list (full panel only: «Сцена» has no battle scene) */
function bgButton(scene) {
  if (!scene || !isBattleScene(scene)) return "";
  const choice = bgChoice(scene), now = bgNow(scene);
  // the picture the scene really shows (a place chosen before it had a background keeps the old one until it changes)
  const key = bgKeyOfSrc(now) ?? (now ? null : SAND);
  const img = key ? bgThumb(sys(), key) : now;
  const what = !key ? "власна картинка сцени" : choice === AUTO ? `авто за місцем: ${bgName(key)}` : bgName(key);
  return `<button type="button" class="pust-md-bbg" data-battle="bgpick" title="Фон сцени (${esc(what)}). Вибрати інший" aria-label="Фон сцени" aria-haspopup="listbox"><img src="${esc(img)}" alt=""></button>`;
}

/** The list: «Авто за місцем», «Стандартний (пісок)», the 36 places — a row of a thumbnail and a name; the current one lit */
function toggleBgPick(btn, scene) {
  if (pickEl) return closePick();
  const el = document.createElement("div");
  el.className = "pust-fatepick pust-bgpick";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Фон сцени");
  const choice = bgChoice(scene);
  const auto = wantedBg(AUTO, sharedGet("place"));
  const item = (val, name, thumb, note = "") => `<li><button type="button" class="pust-bg-row${val === choice ? " on" : ""}" data-bg="${val}" role="option" aria-selected="${val === choice}">
      ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : `<span class="pust-bg-auto"><i class="fa-solid fa-wand-magic-sparkles"></i></span>`}
      <span>${esc(name)}</span>${note ? `<small>${esc(note)}</small>` : ""}</button></li>`;
  el.innerHTML = `<header><span>Фон сцени</span><button type="button" class="pust-fp-x" data-pk-close title="Закрити" aria-label="Закрити"><i class="fa-solid fa-xmark"></i></button></header>
    <div class="pust-fp-list"><ul role="listbox">
      ${item(AUTO, "Авто за місцем", "", bgName(auto))}
      ${item(SAND, SAND_NAME, bgThumb(sys(), SAND))}
      ${BATTLE_BACKGROUNDS.map((b) => item(b.key, b.name, bgThumb(sys(), b.key))).join("")}
    </ul></div>`;
  document.body.append(el);
  placePop(el, btn);
  el.querySelector(".pust-bg-row.on")?.scrollIntoView({ block: "center" });
  el.addEventListener("click", async (ev) => {
    const t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.pkClose !== undefined) return closePick();
    const v = t.dataset.bg;
    if (!v) return;
    closePick();
    await setBgChoice(scene, v);
    redrawBattlePanel();
  });
  const onDown = (ev) => { if (!el.contains(ev.target) && !btn.contains(ev.target)) closePick(); };
  const onKey = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); closePick(); } };
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  pickEl = { el, onDown, onKey };
}
// a new scene: the ticks are cleared (the fields keep their values)
Hooks.on("canvasTearDown", () => { closePick(); picks.clear(); });
Hooks.on("canvasReady", () => redrawBattlePanel());

/* ---------------- moving between the maps (author, 2026-11-16) ---------------- */
/** the battle map the GM was on last (this browser), else the world's «Бойова мапа», else any battle scene */
const LAST_BATTLE = "pustelnyky-last-battle";
// a scene a tour showed doesn't count (author, 2026-11-16: «Почати бій» went to a quick-start scene the tours had opened)
Hooks.on("canvasReady", (c) => { if (game.user.isGM && isBattleScene(c?.scene) && !document.body.classList.contains("pust-touring")) { try { localStorage.setItem(LAST_BATTLE, c.scene.id); } catch (_) { /* not kept */ } } });
export function battleScene() {
  let id = null;
  try { id = localStorage.getItem(LAST_BATTLE); } catch (_) { /* none */ }
  const last = id ? game.scenes.get(id) : null;
  if (last && isBattleScene(last)) return last;
  return game.scenes.find((x) => isBattleScene(x) && x.name === "Бойова мапа") ?? findBattleScene();
}
/** «Перейти на бойову мапу» / «Перейти на Мапу Пустки»: the scene is activated, so the players come along */
async function gotoScene(toBattle) {
  const scene = toBattle ? battleScene() : findMapScene();
  if (!scene) return notify.warn(toBattle ? "У світі немає бойової мапи. Створи сцену типу «Битва»." : "У світі немає «Мапи Пустки».");
  // an active scene isn't activated again by Foundry (author, 2026-11-17: after the battle tour, which only views a battle
  // map, «Перейти на Мапу Пустки» did nothing — the map was still the active scene): then it is just viewed
  if (scene.active) await scene.view();
  else await scene.activate();
}

/* ---------------- a travel event's damage into the panel (author, 2026-11-16) ---------------- */
/**
 * A die of a travel result followed by «шкоди» («3d6 шкоди», «1d6 шкоди вогнем») is the damage a hazard deals: its dice, and
 * the type the words name, go into «Шкода й лікування»; null for any other die («2d6 кротощурів» is rolled to chat as before)
 */
export function travelDamage(btn) {
  const expr = btn?.dataset?.dice;
  if (!expr) return null;
  let after = "";
  for (let n = btn.nextSibling; n && after.length < 80; n = n.nextSibling) after += n.textContent ?? "";
  after = after.trim().toLowerCase();
  if (!/^шкод/.test(after)) return null;
  const words = after.split(/[.;)]/)[0];
  const type = /радіац/.test(words) ? "rad" : /отру/.test(words) ? "poison" : /вогн/.test(words) ? "fire"
    : /електри/.test(words) ? "electric" : /психічн/.test(words) ? "psychic" : "phys";
  return { expr, type, ignore: /ігнорує броню/.test(words) };
}

/** The damage into the panel on view («Сцена» or «Битва»): its fields set, the panel unfolded, the fields lit for a moment */
export async function fillDamage({ expr, type = "phys", ignore = false }) {
  ui_.dmg.expr = expr;
  ui_.dmg.type = type;
  ui_.dmg.ignore = !!ignore;
  for (const [sec] of sections) {
    if (!sec.isConnected || sec.hidden) continue;
    const unit = sec.closest(".pust-md-unit");
    if (unit?.classList.contains("folded")) (await import("./map-dock.mjs")).unfoldUnit(unit.dataset.unit);
  }
  await redrawBattlePanel();
  // and a notice on top (author, 2026-11-16)
  const shown = [...sections].find(([sec]) => sec.isConnected && !sec.hidden);
  const panel = shown ? (shown[1] ? "«Сцена»" : "«Битва»") : "«Битва»";
  const tname = (DMG_TYPES[type]?.n ?? "").split(" (")[0].toLowerCase();
  notify.info(`Шкоду ${expr} (${tname}${ignore ? ", ігнорує броню" : ""}) перенесено в «Шкода й лікування» панелі ${panel}. Вибери цілі й натисни «Завдати шкоди».`);
  for (const [sec] of sections) {
    if (!sec.isConnected || sec.hidden) continue;
    // the panel opaque while its fields glow (it is half-transparent until hovered)
    sec.classList.add("pust-md-lit");
    clearTimeout(sec._lit);
    sec._lit = setTimeout(() => sec.classList.remove("pust-md-lit"), 3000);
    for (const el of sec.querySelectorAll('[data-battle-d="expr"], [data-battle-d="type"]')) {
      el.classList.remove("pust-flash");
      void el.offsetWidth; // restart the animation
      el.classList.add("pust-flash");
    }
  }
}
