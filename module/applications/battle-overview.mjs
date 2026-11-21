/**
 * «Огляд битви» (author, 2026-11-17; feedback p9): the GM's panel on battle maps, on the left under «Кістки» (map-dock.mjs
 * unit `ovw`). Every enemy, player character and caravan with a token on the scene, grouped by the zone it stands in
 * (zones in their order, then «Поза зонами»; enemies out of the fight last, crossed out):
 *   – a click on the name selects the token and pans the view to it;
 *   – the crosshair at the row's right makes the token a target or takes it off, the other targets stay;
 *   – enemies: category, HP − / + and armour, the book's and situational aspects with +N, attacks with their dice,
 *     charges and «Цілям» (the card's «Завдати цілям»), moves (author, 2026-11-19: a click uses the move — its effect and the chat card; on a used one ↺ takes the mark off;
 *     a passive move is a quiet chip), «Видимий /
 *     Прихований», the card;
 *   – characters and caravans: HP − / +, situational aspects, the sheet.
 * The header carries the targets' count, «Вибрати цілі» (the selected tokens become the targets) and «Зняти вибір»
 * (moved here from «Битва», author 2026-11-17).
 */
import { sceneZones, zoneOf, zoneOfToken, selectZone } from "../canvas/battle-zones.mjs";
import { MAP_NOTE } from "../rules/map-notes.mjs";
import { tokenAspects } from "../canvas/token.mjs";
import { CAT_COLOR, catIconHtml, hpLevel, typeClass, attackTip } from "../sheets/enemy-view.mjs";
import { diceLabel } from "../rules/battle.mjs";
import { moveSpec, moveMarks, limitLabel } from "../rules/move-spec.mjs";
import { notify } from "../helpers/notify.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const int = (v, d = 0) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);
const CAT_NAME = { statists: "статист", regular: "рядовий", elite: "елітний", boss: "бос" };
const KIND_ICON = { character: "fa-user", caravan: "fa-truck" };
let SEC = null;

/** The panel's section (its header comes from map-dock's header()) */
export const overviewSectionHtml = (header) => `<section class="pust-md-panel pust-md-ovw" hidden>${header("fa-list-check", "Огляд битви", "gm-battle:overview")}<div class="pust-md-body pust-ov"></div></section>`;

export function mountOverview(sec) {
  SEC = sec;
  const body = sec.querySelector(".pust-ov");
  body.addEventListener("click", onClick);
  // a double click on a name opens the card / sheet (author, 2026-11-17); the first click has selected the token already
  body.addEventListener("dblclick", (ev) => {
    const nm = ev.target.closest('[data-ov="pan"]');
    const doc = nm && canvas.scene?.tokens.get(nm.closest("[data-tok]")?.dataset.tok);
    if (doc?.actor) doc.actor.sheet.render(true);
  });
  redrawOverview();
}

const aspChips = (list) => list.map((a) => `<span class="pust-ov-asp"><span>${esc(a.t)}</span>${a.inv > 0 ? `<b title="Безкоштовні Посилення">+${a.inv}</b>` : ""}</span>`).join("");

/**
 * A move's chip (author, 2026-11-19; mockup А): a click uses it (`useMove`: the effect and the chat card), the tooltip says
 * what will happen; a used one is struck through with ↺ and its click takes the mark off; a passive move is a quiet chip.
 */
function moveChip(m, i, s) {
  const spec = moveSpec(m, s, i);
  const mk = moveMarks(m, spec);
  // a «лишається живим» move spent this scene (author, 2026-11-20): struck through, its click takes the mark off
  if (!spec.button && mk.used && spec.effects.some((e) => e.kind === "survive"))
    return `<button type="button" class="pust-ov-move used" data-ov="moveFree" data-i="${i}" data-pust-tip="${esc(`${m.t || m.n} Витрачено (${limitLabel(spec)}): удруге не врятує. Клік знімає позначку.`)}"><i class="fa-solid fa-rotate-left"></i>${esc(m.n)}</button>`;
  if (!spec.button) return `<span class="pust-ov-move quiet" data-pust-tip="${esc(`${m.t || m.n}${spec.hint ? ` ${spec.hint}` : ""}`)}">${esc(m.n)}</span>`;
  const tip = mk.blocked
    ? `${m.t} Використано (${limitLabel(spec)}): клік знімає позначку.`
    : `${m.t} Клік — «Використати». ${spec.hint}${mk.used ? " Позначено використаним, але хід діє знову." : ""}`;
  return `<button type="button" class="pust-ov-move${mk.used ? " used" : ""}" data-ov="${mk.blocked ? "moveFree" : "move"}" data-i="${i}" data-pust-tip="${esc(tip)}">${mk.blocked ? `<i class="fa-solid fa-rotate-left"></i>` : ""}${esc(m.n)}</button>`;
}

function enemyRow(t, a) {
  const s = a.system;
  const hp = int(s.hp?.value), max = int(s.hp?.max, hp);
  const lv = hpLevel(hp, max); // no state chip: the GM sees the HP (author, 2026-11-17)
  const cat = s.cat || "regular";
  const asps = [...(s.baseAspects ?? []), ...(s.aspects ?? [])].filter((x) => String(x?.t ?? "").trim()).map((x) => ({ t: String(x.t).trim(), inv: Math.max(0, int(x.inv)) }));
  const atks = (s.attacks ?? []).map((k, i) => {
    const pips = k.ammoMax > 0 ? `<span class="pust-ov-pips" title="Заряди: ${int(k.ammo)} з ${int(k.ammoMax)}">${Array.from({ length: Math.min(int(k.ammoMax), 12) }, (_, j) => `<i class="${j < int(k.ammo) ? "on" : ""}"></i>`).join("")}</span>` : "";
    return `<div class="pust-ov-atk"><span class="pust-ov-dice ${typeClass(k.type)}" title="${esc(attackTip(k))}"><b>${esc(k.name || "Атака")}</b> <span class="pust-ov-dn">${esc(diceLabel(k.dice))}</span></span>${pips}<button type="button" class="pust-ov-hit" data-ov="hit" data-i="${i}" title="Кинути атаку й завдати шкоди цілям (T), як «Завдати цілям» на картці" ${k.ammoMax > 0 && int(k.ammo) <= 0 ? "disabled" : ""}><i class="fa-solid fa-crosshairs"></i>Цілям</button></div>`;
  }).join("");
  const moves = (s.moves ?? []).map((m, i) => (String(m.n || "").trim() ? moveChip(m, i, s) : "")).join("");
  return `<div class="pust-ov-row${lv.dead ? " out" : ""}${t.hidden ? " hid" : ""}" data-tok="${t.id}">
    ${pic(t, `<span class="pust-ov-cat" style="--cc:${CAT_COLOR[cat] ?? "#6b6f6c"}" title="${CAT_NAME[cat] ?? ""}">${catIconHtml(cat)}</span>`)}
    <div class="pust-ov-main">
      <div class="pust-ov-name"><button type="button" class="pust-ov-nm" data-ov="pan" title="Виділити токен і показати його на мапі. Подвійний клік відкриває картку">${esc(t.name)}</button></div>
      <div class="pust-ov-hp"><button type="button" data-ov="hp" data-d="-1" aria-label="Мінус 1 ОЗ">−</button><span class="pust-ov-bar hp-${lv.level}"><i style="width:${lv.pct}%"></i></span><span class="pust-ov-num">${hp} / ${max}</span><button type="button" data-ov="hp" data-d="1" aria-label="Плюс 1 ОЗ">+</button><span class="pust-ov-arm" title="Броня${int(s.psiArmor) ? `, пси-броня ${int(s.psiArmor)}` : ""}"><i class="fa-solid fa-shield-halved"></i>${int(s.armor)}</span></div>
      ${asps.length ? `<div class="pust-ov-asps">${aspChips(asps)}</div>` : ""}
      ${atks}
      ${moves ? `<div class="pust-ov-moves">${moves}</div>` : ""}
    </div>
    <div class="pust-ov-side">${tgtBtn(t)}<button type="button" class="pust-ov-ib${s.reveal ? " on" : ""}" data-ov="reveal" title="${s.reveal ? "Видимий: гравці бачать токен і картку. Клік ховає" : "Прихований: гравці не бачать. Клік показує"}"><i class="fa-solid ${s.reveal ? "fa-eye" : "fa-eye-slash"}"></i></button><button type="button" class="pust-ov-ib" data-ov="sheet" title="Відкрити картку"><i class="fa-solid fa-id-card"></i></button></div>
  </div>`;
}

function partyRow(t, a) {
  const hp = int(a.system.hp?.value), max = int(a.system.hp?.max, hp);
  const lv = hpLevel(hp, max);
  const asps = tokenAspects(a);
  const player = a.type === "character" ? game.users.find((u) => !u.isGM && u.character?.id === a.id)?.name : "";
  return `<div class="pust-ov-row pust-ov-pc${lv.dead ? " out" : ""}" data-tok="${t.id}">
    ${pic(t, `<span class="pust-ov-cat pc"><i class="fa-solid ${KIND_ICON[a.type]}"></i></span>`)}
    <div class="pust-ov-main">
      <div class="pust-ov-name"><button type="button" class="pust-ov-nm" data-ov="pan" title="Виділити токен і показати його на мапі. Подвійний клік відкриває аркуш">${esc(t.name)}</button>${player ? `<small>${esc(player)}</small>` : ""}</div>
      <div class="pust-ov-hp"><button type="button" data-ov="hp" data-d="-1" aria-label="Мінус 1 ОЗ">−</button><span class="pust-ov-bar hp-${lv.level}"><i style="width:${lv.pct}%"></i></span><span class="pust-ov-num">${hp} / ${max}</span><button type="button" data-ov="hp" data-d="1" aria-label="Плюс 1 ОЗ">+</button></div>
      ${asps.length ? `<div class="pust-ov-asps">${aspChips(asps)}</div>` : ""}
    </div>
    <div class="pust-ov-side">${tgtBtn(t)}<button type="button" class="pust-ov-ib" data-ov="sheet" title="Відкрити аркуш"><i class="fa-solid fa-id-card"></i></button></div>
  </div>`;
}

/** Are exactly the zone's standing tokens the targets now (the strip's «Обрати всіх» then takes them off) */
function zoneTargeted(z, zones) {
  const down = (t) => Number(t.actor?.system?.hp?.value) <= 0;
  const inZone = canvas.tokens.placeables.filter((t) => zoneOfToken(t, zones)?.id === z.id && !down(t));
  const now = new Set([...game.user.targets].map((t) => t.id));
  return inZone.length > 0 && now.size === inZone.length && inZone.every((t) => now.has(t.id));
}

const pic = (t, badge) => `<div class="pust-ov-pic"><img src="${esc(t.texture?.src || t.actor?.img || "icons/svg/mystery-man.svg")}" alt="">${badge}</div>`;
const isTarget = (t) => game.user.targets.some((x) => x.id === t.id);
const tgtBtn = (t) => `<button type="button" class="pust-ov-ib pust-ov-tgt${isTarget(t) ? " on" : ""}" data-ov="target" aria-pressed="${isTarget(t)}" title="${isTarget(t) ? "Ціль. Клік знімає" : "Зробити ціллю (інші цілі лишаються)"}"><i class="fa-solid fa-bullseye"></i></button>`;

function bodyHtml() {
  const scene = canvas?.scene;
  const n = game.user.targets.size;
  const head = `<div class="pust-ov-tgts"><span class="pust-ov-tn" title="Шкода й лікування йдуть лише цілям (T)">${n ? `цілей: <b>${n}</b>` : "цілей немає"}</span>
    <button type="button" data-ov="tgtsel" title="Зробити виділені токени цілями (попередні цілі знімаються)"><i class="fa-solid fa-bullseye"></i><span>Вибрати цілі</span></button>
    <button type="button" data-ov="tgtclear" ${n ? "" : "disabled"} title="Зняти всі цілі"><i class="fa-solid fa-xmark"></i><span>Зняти вибір</span></button></div>`;
  if (!scene) return head;
  const zones = sceneZones(scene);
  const groups = new Map(zones.map((z) => [z.id, { z, party: [], foes: [], out: [] }]));
  const none = { z: null, party: [], foes: [], out: [] };
  for (const t of scene.tokens) {
    const a = t.actor;
    if (!a || !["enemy", "character", "caravan"].includes(a.type)) continue;
    const g = groups.get(zoneOfToken(t, zones)?.id) ?? none;
    if (a.type === "enemy") (int(a.system.hp?.value) <= 0 ? g.out : g.foes).push(t);
    else g.party.push(t);
  }
  const block = (g) => {
    if (!g.party.length && !g.foes.length && !g.out.length) return "";
    const zf = g.z ? zoneOf(g.z.doc) : null;
    // the zone's own colour, as its strip on the map (author, 2026-11-17); «Обрати всіх» as on the strip
    const col = zf ? (MAP_NOTE.colors[zf.color] ?? MAP_NOTE.colors.yellow) : null;
    const on = zf ? zoneTargeted(g.z, zones) : false;
    const zh = zf
      ? `<div class="pust-ov-zone" style="--zf:${col.fill};--zl:${col.line}" data-zone="${g.z.id}"><i class="fa-solid fa-vector-square"></i><b class="pust-ov-zn">${esc(zf.name)}</b><button type="button" class="pust-ov-ib pust-ov-ztgt${on ? " on" : ""}" data-ov="zone" aria-pressed="${on}" title="${on ? "Цілі цієї зони обрано. Клік знімає" : "Обрати цілями всіх, хто ще стоїть у зоні (попередні цілі знімаються)"}"><i class="fa-solid fa-bullseye"></i></button>${zf.aspects?.length ? `<div class="pust-ov-zasps">${aspChips(zf.aspects)}</div>` : ""}</div>`
      : `<div class="pust-ov-zone none"><i class="fa-solid fa-border-none"></i><b class="pust-ov-zn">Поза зонами</b></div>`;
    return zh + g.party.map((t) => partyRow(t, t.actor)).join("") + [...g.foes, ...g.out].map((t) => enemyRow(t, t.actor)).join("");
  };
  const list = [...groups.values(), none].map(block).join("");
  return head + (list || `<p class="pust-ov-empty">На сцені немає ні ворогів, ні персонажів гравців.</p>`);
}

export function redrawOverview() {
  if (!SEC?.isConnected || SEC.hidden) return;
  const body = SEC.querySelector(".pust-ov");
  const top = body.scrollTop;
  body.innerHTML = bodyHtml();
  body.scrollTop = top;
}

async function onClick(ev) {
  const b = ev.target.closest("[data-ov]");
  if (!b || !game.user.isGM) return;
  const act = b.dataset.ov;
  if (act === "tgtsel") {
    const ids = (canvas?.tokens?.controlled ?? []).map((t) => t.id);
    if (!ids.length) return notify.warn("Спершу виділи токени (клік, Shift+клік, рамка), а тоді зроби їх цілями.");
    return canvas.tokens.setTargets(ids, { mode: "replace" });
  }
  if (act === "tgtclear") return canvas.tokens.setTargets([], { mode: "replace" });
  if (act === "zone") {
    const doc = canvas.scene?.drawings.get(b.closest("[data-zone]")?.dataset.zone);
    return doc && selectZone(doc);
  }
  const row = b.closest("[data-tok]");
  const doc = row && canvas.scene?.tokens.get(row.dataset.tok);
  if (!doc) return;
  const actor = doc.actor;
  if (act === "pan") {
    const tok = doc.object;
    tok?.control({ releaseOthers: true });
    if (tok) canvas.animatePan({ x: tok.center.x, y: tok.center.y, duration: 250 });
    return;
  }
  if (act === "target") return canvas.tokens.setTargets([doc.id], { mode: isTarget(doc) ? "release" : "acquire" });
  if (act === "sheet") return actor?.sheet.render(true);
  if (!actor) return;
  const s = actor.system;
  // ОЗ −/+ for enemies, characters and caravans alike (author, 2026-11-17), as the damage writes them; within 0…max
  if (act === "hp") return actor.update({ "system.hp.value": Math.max(0, Math.min(int(s.hp?.max), int(s.hp?.value) + int(b.dataset.d))) });
  if (actor.type !== "enemy") return;
  if (act === "move" || act === "moveFree") {
    const { useMove, freeMove } = await import("./enemy-move.mjs");
    if (act === "moveFree") return freeMove(actor, int(b.dataset.i));
    b.disabled = true;
    try { await useMove(actor, int(b.dataset.i), { token: doc }); } finally { b.disabled = false; }
    return;
  }
  if (act === "reveal") {
    const open = !s.reveal;
    await actor.update({ "system.reveal": open, "ownership.default": open ? CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED : CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE });
    return actor.constructor.syncEnemyTokens?.(actor, open);
  }
  if (act === "hit") {
    if (!game.user.targets.size) return notify.warn("Спершу познач цілі (T або кнопкою з мішенню в рядку).");
    b.disabled = true;
    try {
      const { attackWithMenu } = await import("./enemy-move.mjs");
      await attackWithMenu(actor, int(b.dataset.i), { token: doc, anchor: b });
    } finally { b.disabled = false; }
  }
}

const later = foundry.utils.debounce(redrawOverview, 120);
for (const h of ["createToken", "deleteToken", "updateToken", "updateActor", "createDrawing", "deleteDrawing", "updateDrawing", "targetToken", "canvasReady"]) Hooks.on(h, later);
