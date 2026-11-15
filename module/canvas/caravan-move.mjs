/**
 * A caravan moved on a map (author, 2026-11-15): before the move, a small question over the token — «Витратити запас
 * ходу автоматично?». «Так»: the cells it goes take its range (1 cell a unit, «Тачка» 3 cells a unit; caravan-range.mjs)
 * and it moves; not enough range — it stays, with a warning. «Ні»: it just moves. The caravan's switch «Витрачати
 * автоматично» (flag `autoRange`, the sheet's «Запас ходу») spends without asking. Battle scenes are left alone.
 * The move is held back (preUpdateToken → false) and made again with the option `pustRange` once answered.
 */
import { brahminSaving, rangeCost } from "../rules/caravan-range.mjs";
import { isBattleScene } from "../helpers/default-scene.mjs";
import { runCaravanAction } from "../applications/caravan-actions.mjs";

let ask = null; // { el, done } of the question shown

/** Cells from the token's place to `to`, through the drag's waypoints when Foundry passes them */
function cellsMoved(scene, token, to, options) {
  const pts = [{ x: token.x, y: token.y }];
  const wps = options?.movement?.[token.id]?.waypoints;
  if (Array.isArray(wps)) for (const w of wps) if (Number.isFinite(w?.x) && Number.isFinite(w?.y)) pts.push({ x: w.x, y: w.y });
  const last = pts[pts.length - 1];
  if (last.x !== to.x || last.y !== to.y) pts.push(to);
  try {
    const r = scene.grid.measurePath(pts);
    if (Number.isFinite(r?.spaces)) return Math.round(r.spaces);
    return Math.round((r?.distance ?? 0) / (scene.grid.distance || 1));
  } catch (_) {
    const g = scene.grid.size || 100;
    return Math.max(Math.abs(to.x - token.x), Math.abs(to.y - token.y)) / g;
  }
}

function closeAsk() {
  if (!ask) return;
  ask.el.remove();
  document.removeEventListener("keydown", ask.onKey, true);
  ask = null;
}

/** The question over the token: resolves "yes" | "no" | null (closed) */
function askOver(token, text, sub) {
  closeAsk();
  return new Promise((resolve) => {
    const el = document.createElement("div");
    el.className = "pust-cmove";
    el.innerHTML = `<p class="pust-cmove-q">${text}</p><p class="pust-cmove-sub">${sub}</p>
      <div class="pust-cmove-btns"><button type="button" data-a="yes"><i class="fa-solid fa-check"></i> Так</button>
      <button type="button" data-a="no">Ні, просто перемістити</button>
      <button type="button" data-a="x" class="pust-cmove-x" title="Скасувати переміщення" aria-label="Скасувати переміщення">×</button></div>`;
    document.body.append(el);
    const obj = token.object;
    const w = obj?.w ?? token.width * (token.parent?.grid.size ?? 100);
    const p = canvas.clientCoordinatesFromCanvas({ x: token.x + w / 2, y: token.y });
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(window.innerWidth - r.width - 8, p.x - r.width / 2))}px`;
    el.style.top = `${Math.max(8, p.y - r.height - 10)}px`;
    const finish = (v) => { closeAsk(); resolve(v); };
    el.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-a]");
      if (b) finish(b.dataset.a === "x" ? null : b.dataset.a);
    });
    const onKey = (ev) => { if (ev.key === "Escape") { ev.stopPropagation(); finish(null); } };
    document.addEventListener("keydown", onKey, true);
    ask = { el, onKey };
    el.querySelector("[data-a='yes']").focus();
  });
}

const notEnough = (actor, cost, have) =>
  ui.notifications.warn(`«${actor.name}»: на цей шлях треба ${cost} од. запасу ходу, а є ${have}. Караван лишається на місці.`);

export function initCaravanMove() {
  Hooks.on("preUpdateToken", (token, changes, options, userId) => {
    if (options?.pustRange || userId !== game.user.id) return;
    if (!("x" in changes) && !("y" in changes)) return;
    const actor = token.actor, scene = token.parent;
    if (actor?.type !== "caravan" || !scene || isBattleScene(scene)) return;
    const to = { x: changes.x ?? token.x, y: changes.y ?? token.y };
    const cells = cellsMoved(scene, token, to, options);
    if (!cells) return;
    const tachka = actor.system.vehicle === "tachka";
    // «Породисті браміни» / «Паливний регулятор» set to save range on this trip (the sheet's choice)
    const sys = game.system.id;
    const saving = brahminSaving((parseInt(actor.system.rules?.S?.imp?.brahmins, 10) || 0) > 0
      && actor.getFlag(sys, "brahminBonus") !== "time", !!actor.getFlag(sys, "pathfinder"));
    const cost = rangeCost(cells, tachka, saving);
    const have = Number(actor.system.range?.value) || 0;
    if (actor.getFlag(sys, "autoRange")) {
      if (cost > have) { notEnough(actor, cost, have); return false; }
      runCaravanAction(actor, (C) => C.act("spendRange", { n: cost }));
      return;
    }
    const move = { x: to.x, y: to.y };
    const notes = [tachka && "тачка: 3 клітини за одиницю", saving && `${tachka ? "регулятор" : "браміни"}: −${saving === 0.5 ? "½" : "¼"}`].filter(Boolean);
    const sub = `${cells} кл. → ${cost} од.${notes.length ? ` (${notes.join("; ")})` : ""} · є ${have}`;
    askOver(token, "Витратити запас ходу автоматично?", sub).then(async (a) => {
      if (!a) return;
      if (a === "yes") {
        if (cost > have) return notEnough(actor, cost, have);
        await runCaravanAction(actor, (C) => C.act("spendRange", { n: cost }));
      }
      await token.update(move, { pustRange: true });
    });
    return false;
  });
  Hooks.on("canvasTearDown", closeAsk);
}
