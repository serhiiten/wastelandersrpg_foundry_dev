/**
 * «Кістки» of «Мапа Пустки» (the HTML terminal's map dice float, author 2026-11-14): for everyone, the Доглядач and the
 * players. N × d6 / d8 / d10 or a die of any size, and the Кістка Долі (author, 2026-11-15, as the HTML tracker's): one
 * for every selected token of a character (1d10 + УДЧ, chems counted) or a caravan (1d10 + Удача партії), each its own
 * card; nothing selected — the only caravan on the scene, as before. Every roll goes to chat as the system's dice / fate card
 * (and so follows the chat's roll-mode menu). The panel itself is docked under «Мапа Пустки» (map-dock.mjs).
 */
import { postExprRoll, postFateCard } from "./check-panel.mjs";
import { evaluate } from "./character-actions.mjs";

const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

/** The caravan whose Удача партії the Кістка Долі uses: a selected caravan token, else the only caravan on the scene */
export function luckCaravan() {
  const sel = (canvas?.tokens?.controlled || []).map((t) => t.actor).find((a) => a?.type === "caravan");
  if (sel) return sel;
  const onScene = [...new Set((canvas?.scene?.tokens || []).map((t) => t.actor).filter((a) => a?.type === "caravan"))];
  return onScene.length === 1 ? onScene[0] : null;
}

/** Whose Кістка Долі is rolled: the selected characters and caravans (one each), else the caravan of luckCaravan() */
export function fateActors() {
  const sel = [...new Set((canvas?.tokens?.controlled || []).map((t) => t.actor).filter((a) => a && (a.type === "character" || a.type === "caravan")))];
  if (sel.length) return sel;
  const car = luckCaravan();
  return car ? [car] : [];
}

/** The luck a Кістка Долі adds: a character's УДЧ (with chems), a caravan's Удача партії */
function fateMod(actor) {
  if (actor.type === "caravan") return parseInt(actor.system.luck, 10) || 0;
  try { return +evaluate(actor).d.eff.UDCH || 0; } catch (_) { return 0; }
}

/** The line on the Fate button and its tooltip: one actor — its luck; several — how many */
export function fateInfo() {
  const list = fateActors();
  if (!list.length) return null;
  if (list.length === 1) {
    const a = list[0];
    return { name: a.name, luck: sgn(fateMod(a)), what: a.type === "caravan" ? "Удача партії" : "УДЧ", n: 1 };
  }
  return { name: list.map((a) => a.name).join(", "), luck: `×${list.length}`, n: list.length };
}

/** Roll count × d sides to chat; returns { what, total, rolls[] } */
export async function rollDice(count, sides) {
  const expr = `${count}d${sides}`;
  const roll = await postExprRoll(expr, ChatMessage.getSpeaker());
  return { what: expr, total: roll.total, rolls: roll.dice.flatMap((d) => d.results.map((r) => r.result)) };
}

/** Кістка Долі to chat for every selected character / caravan (a card each); null (with a warning) when there's nobody */
export async function rollFate() {
  const list = fateActors();
  if (!list.length) {
    ui.notifications.warn("Обери на мапі токени персонажів або каравану: Кістка Долі кидається за кожного.");
    return null;
  }
  const out = [];
  for (const a of list) {
    const mod = fateMod(a);
    const r = await new Roll("1d10").evaluate();
    await postFateCard(a, { v: r.total, mod, party: a.type === "caravan" });
    out.push({ name: a.name, total: r.total + mod, die: r.total });
  }
  if (out.length === 1) return { what: `Доля · ${out[0].name}`, total: out[0].total, rolls: [out[0].die] };
  return { what: `Доля · ${out.map((o) => `${o.name} ${o.total}`).join(", ")}`, total: out.map((o) => o.total).join(" / "), rolls: [] };
}
