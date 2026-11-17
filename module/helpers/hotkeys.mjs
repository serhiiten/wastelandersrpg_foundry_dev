/**
 * The system's hotkeys (author, 2026-11-17; feedback p10): Alt+Q / W / A / S, free in Foundry (its Q / W / A / S are
 * descend / move up / left / down without a modifier) and in Chrome, Edge and the NVIDIA / AMD overlays (Alt+E opens
 * Chrome's menu, Alt+R their overlays — so not those); everyone may rebind them in Controls Configuration.
 *   Alt+Q  «Термінал Доглядача» open / closed (GM)
 *   Alt+W  the next round of «Коло дій» (GM)
 *   Alt+A  «Шкода й лікування»: the panel on view unfolded, its field focused (GM)
 *   Alt+S  «Зробити перевірку»: a player's own panel; the GM's for the selected character's token
 *   Alt+X  «Огляд битви» folded / opened (GM, battle maps)
 * Registered in «init».
 */
import { notify } from "./notify.mjs";
export function registerHotkeys() {
  const sys = game.system.id;
  const reg = (id, name, hint, key, onDown, restricted = false) => game.keybindings.register(sys, id, {
    name, hint, restricted, editable: [{ key, modifiers: ["Alt"] }],
    onDown: () => { onDown(); return true; },
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL,
  });
  reg("terminal", "Термінал Доглядача", "Відкрити або закрити «Термінал Доглядача».", "KeyQ",
    () => import("../applications/terminal.mjs").then((m) => m.toggleTerminal()), true);
  reg("nextRound", "Наступне коло дій", "Почати нове коло дій: число в панелях «Битва» і «Сцена» зростає, у чат надходить нагадування.", "KeyW",
    () => import("../applications/battle-panel.mjs").then((m) => m.stepRound(1)), true);
  reg("damage", "Шкода й лікування", "Розгорнути панель «Сцена» чи «Битва» і перейти в поле «Шкода й лікування».", "KeyA",
    () => import("../applications/battle-panel.mjs").then((m) => m.focusDamage()), true);
  reg("overview", "Огляд битви", "Згорнути або розгорнути панель «Огляд битви» на бойовій мапі.", "KeyX",
    () => import("../applications/map-dock.mjs").then((m) => m.toggleOverview()), true);
  reg("check", "Зробити перевірку", "Гравець: відкрити або закрити «Зробити перевірку» свого персонажа. Доглядач: «Зробити перевірку» персонажа, чий токен виділено.", "KeyS",
    () => openCheck());
}

async function openCheck() {
  if (!game.user.isGM) {
    // as a press of the dock's own button (it lights while the panel is open)
    const b = document.querySelector("#pust-mapdock .pust-md-check");
    if (!b || b.hidden) return notify.warn("У тебе ще немає персонажа.");
    return b.click();
  }
  const m = await import("../applications/check-panel.mjs");
  const actor = canvas.tokens?.controlled.map((t) => t.actor).find((a) => a?.type === "character");
  if (!actor) return notify.warn("Виділи токен персонажа, щоб зробити перевірку за нього.");
  m.openCheckPanel(actor);
}
