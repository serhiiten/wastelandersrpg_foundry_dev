/**
 * Macros on the hotbar (author, 2026-11-17; feedback p11): what may be dragged there and what the macro does.
 *   an attribute / a skill (character sheet)   → «Зробити перевірку» opened with it
 *   a weapon's attack button (Мотлох)          → «Зробити перевірку» opened as an attack with that weapon
 *   a weapon's crosshair (Мотлох)              → just its damage to chat
 *   a ready check (the check panel's buttons)  → «Зробити перевірку» opened with it
 *   «Доля» («Кістки» panel)                    → Кістка Долі, as the button does
 *   «Удача партії» (caravan sheet)             → the caravan's Кістка Долі
 * A check macro only opens the panel set up (author's choice): aspects and modifiers are still to be chosen there.
 * Weapons and ready checks are found by name when the macro runs (their order on the sheet may change).
 */
import { readState } from "../applications/character-actions.mjs";
import { createLogic } from "../rules/logic.mjs";

const TYPE = "PustMacro";

/** Make `el` draggable to the hotbar with `data` (kind, actor, …) read at the drag's start */
export function hotbarDraggable(el, data) {
  if (!el || el.dataset.pustDrag) return;
  el.dataset.pustDrag = "1";
  el.draggable = true;
  el.addEventListener("dragstart", (ev) => {
    const d = typeof data === "function" ? data() : data;
    if (!d) return;
    ev.dataTransfer.setData("text/plain", JSON.stringify({ type: TYPE, ...d }));
    ev.stopPropagation();
  });
}

/** The macro's name and picture for each kind */
function look(d, actor) {
  const who = actor?.name ? `${actor.name}: ` : "";
  switch (d.kind) {
    case "attr": return { name: `${who}${d.label}`, img: actor?.img || "icons/svg/d20-black.svg" };
    case "skill": return { name: `${who}${d.label}`, img: actor?.img || "icons/svg/d20-black.svg" };
    case "attack": return { name: `${who}${d.label}`, img: "icons/svg/sword.svg" };
    case "damage": return { name: `${who}шкода: ${d.label}`, img: "icons/svg/explosion.svg" };
    case "preset": case "xpreset": return { name: `${who}${d.label}`, img: actor?.img || "icons/svg/d20-black.svg" };
    case "fate": return { name: "Кістка Долі", img: "icons/svg/d10-grey.svg" };
    case "luck": return { name: `${who}Удача партії`, img: "icons/svg/d10-grey.svg" };
    default: return { name: d.label || "Пустельники", img: "icons/svg/dice-target.svg" };
  }
}

/** «ready»: a drop of ours on the hotbar makes (or reuses) a script macro and puts it into that slot */
export function readyMacros() {
  Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data?.type !== TYPE) return;
    makeMacro(data, slot);
    return false;
  });
}

async function makeMacro(data, slot) {
  const { type, ...d } = data;
  const actor = d.actor ? await fromUuid(d.actor) : null;
  const { name, img } = look(d, actor);
  const command = `game.wastelanders.runMacro(${JSON.stringify(d)});`;
  let macro = game.macros.find((m) => m.command === command && m.isOwner);
  if (!macro) macro = await Macro.implementation.create({ name, type: "script", img, command, flags: { [game.system.id]: { macro: d.kind } } });
  if (macro) await game.user.assignHotbarMacro(macro, slot);
}

/** What a macro runs (game.wastelanders.runMacro) */
export async function runMacro(d = {}) {
  const actor = d.actor ? await fromUuid(d.actor) : null;
  if (d.actor && !actor) return ui.notifications.warn("Персонажа цього макросу більше немає у світі.");
  if (actor && !actor.isOwner) return ui.notifications.warn(`«${actor.name}» не твій персонаж.`);
  const panel = await import("../applications/check-panel.mjs");
  switch (d.kind) {
    case "attr": return panel.openCheckPanel(actor, { attr: d.attr });
    case "skill": return panel.openCheckPanel(actor, { skill: d.skill });
    case "attack": case "damage": {
      const i = readState(actor).weapons.findIndex((w) => String(w.n || "").trim() === d.label);
      if (i < 0) return ui.notifications.warn(`У «${actor.name}» більше немає зброї «${d.label}».`);
      return d.kind === "attack" ? panel.openCheckPanel(actor, { weapon: i }) : panel.rollWeaponDamage(actor, i);
    }
    case "preset": case "xpreset": {
      const st = readState(actor);
      const L = createLogic({ st, toast: () => {}, ui: {} });
      const list = d.kind === "preset" ? L.ROLL_PRESETS : L.extraPresets();
      const v = list.findIndex((p) => p.l === d.label);
      if (v < 0) return ui.notifications.warn(`У «${actor.name}» немає перевірки «${d.label}».`);
      return panel.openCheckPanel(actor, { r: d.kind, v });
    }
    case "fate": return (await import("../applications/map-dice.mjs")).rollFate();
    case "luck": return (await import("../applications/map-dice.mjs")).rollFate([actor]);
    default: return ui.notifications.warn("Невідомий макрос Пустельників.");
  }
}
