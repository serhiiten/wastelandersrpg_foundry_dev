/**
 * «Кістки» of «Мапа Пустки» (the HTML terminal's map dice float, author 2026-11-14): for everyone, the Доглядач and the
 * players. N × d6 / d8 / d10 or a die of any size, and the caravan's Кістка Долі (1d10 + Удача партії of the selected
 * caravan token — or of the only caravan on the scene). Every roll goes to chat as the system's dice / fate card
 * (and so follows the chat's roll-mode menu). The panel itself is docked under «Мапа Пустки» (map-dock.mjs).
 */
import { postExprRoll, postFateCard } from "./check-panel.mjs";

const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

/** The caravan whose Удача партії the Кістка Долі uses: a selected caravan token, else the only caravan on the scene */
export function luckCaravan() {
  const sel = (canvas?.tokens?.controlled || []).map((t) => t.actor).find((a) => a?.type === "caravan");
  if (sel) return sel;
  const onScene = [...new Set((canvas?.scene?.tokens || []).map((t) => t.actor).filter((a) => a?.type === "caravan"))];
  return onScene.length === 1 ? onScene[0] : null;
}

/** The caravan line under the Fate button */
export function fateInfo() {
  const car = luckCaravan();
  return car ? { name: car.name, luck: sgn(parseInt(car.system.luck, 10) || 0) } : null;
}

/** Roll count × d sides to chat; returns { what, total, rolls[] } */
export async function rollDice(count, sides) {
  const expr = `${count}d${sides}`;
  const roll = await postExprRoll(expr, ChatMessage.getSpeaker());
  return { what: expr, total: roll.total, rolls: roll.dice.flatMap((d) => d.results.map((r) => r.result)) };
}

/** The caravan's Кістка Долі to chat; null (with a warning) when no caravan is selected */
export async function rollFate() {
  const car = luckCaravan();
  if (!car) {
    ui.notifications.warn("Обери на мапі токен каравану: Удача партії візьметься з нього.");
    return null;
  }
  const luck = parseInt(car.system.luck, 10) || 0;
  const r = await new Roll("1d10").evaluate();
  await postFateCard(car, { v: r.total, mod: luck, party: true });
  return { what: `Доля · ${car.name}`, total: r.total + luck, rolls: [r.total] };
}
