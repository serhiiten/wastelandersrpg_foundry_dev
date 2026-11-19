/**
 * «Кістки» of «Мапа Пустки» (the HTML terminal's map dice float, author 2026-11-14): for everyone, the Доглядач and the
 * players. N × d6 / d8 / d10 or a die of any size, and the Кістка Долі (author, 2026-11-15, as the HTML tracker's): one
 * for every selected token of a character (1d10 + УДЧ, chems counted) or a caravan (1d10 + Удача партії), each its own
 * card; nothing selected — the GM's list under the button (map-dock.mjs), a player's own character or targets. Every roll goes to chat as the system's dice / fate card
 * (and so follows the chat's roll-mode menu). The panel itself is docked under «Мапа Пустки» (map-dock.mjs).
 */
import { postExprRoll, postFateCard } from "./check-panel.mjs";
import { evaluate } from "./character-actions.mjs";
import { notify } from "../helpers/notify.mjs";

const sgn = (v) => (v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0");

/** The caravan whose Удача партії the Кістка Долі uses: a selected caravan token, else the only caravan on the scene */
export function luckCaravan() {
  const sel = (canvas?.tokens?.controlled || []).map((t) => t.actor).find((a) => a?.type === "caravan");
  if (sel) return sel;
  const onScene = [...new Set((canvas?.scene?.tokens || []).map((t) => t.actor).filter((a) => a?.type === "caravan"))];
  return onScene.length === 1 ? onScene[0] : null;
}

/**
 * Whose Кістка Долі is rolled. The GM: the selected characters and caravans (one each); nothing selected — the GM picks
 * them in a list under the button (fatePickList, map-dock.mjs; author, 2026-11-15: no helper tokens on «Мапа Пустки»).
 * A player (author, 2026-11-15): their targets' characters / caravans when they have any, else their own
 * Player Character.
 */
const fateKind = (a) => a && (a.type === "character" || a.type === "caravan");
export function fateActors() {
  if (!game.user.isGM) {
    const tgt = [...new Set([...(game.user.targets ?? [])].map((t) => t.actor).filter(fateKind))];
    if (tgt.length) return tgt;
    return game.user.character && fateKind(game.user.character) ? [game.user.character] : [];
  }
  return [...new Set((canvas?.tokens?.controlled || []).map((t) => t.actor).filter(fateKind))];
}

/**
 * The GM's list (author, 2026-11-15): the characters assigned to players (those whose player is online first), then
 * every caravan of the world; each with its luck. [{ id, name, kind, mod, what, player, online }]
 */
export function fatePickList() {
  const users = game.users.filter((u) => !u.isGM && fateKind(u.character) && u.character.type === "character")
    .sort((a, b) => (b.active - a.active) || a.character.name.localeCompare(b.character.name, "uk"));
  const seen = new Set(), out = [];
  for (const u of users) {
    const a = u.character;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push({ id: a.id, name: a.name, kind: "character", mod: sgn(fateMod(a)), what: "УДЧ", player: u.name, online: !!u.active });
  }
  for (const a of game.actors.filter((x) => x.type === "caravan").sort((x, y) => x.name.localeCompare(y.name, "uk"))) {
    out.push({ id: a.id, name: a.name, kind: "caravan", mod: sgn(fateMod(a)), what: "Удача партії", player: "", online: false });
  }
  return out;
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
    return { name: a.name, luck: sgn(fateMod(a)), what: a.type === "caravan" ? "Удача партії" : "УДЧ", n: 1, own: !game.user.isGM && a === game.user.character };
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
export async function rollFate(actors = null) {
  const list = actors ?? fateActors();
  if (!list.length) {
    notify.warn(game.user.isGM
      ? "Познач у списку під «Доля», за кого кинути Кістку Долі (або виділи їхні токени)."
      : "У тебе немає свого персонажа. Познач ціллю токен персонажа чи каравану, щоб кинути Кістку Долі за нього.");
    return null;
  }
  const out = [];
  for (const a of list) {
    const mod = fateMod(a);
    const r = await new Roll("1d10").evaluate();
    await postFateCard(a, { v: r.total, mod, party: a.type === "caravan", roll: r });
    out.push({ name: a.name, total: r.total + mod, die: r.total });
  }
  if (out.length === 1) return { what: `Доля · ${out[0].name}`, total: out[0].total, rolls: [out[0].die] };
  return { what: `Доля · ${out.map((o) => `${o.name} ${o.total}`).join(", ")}`, total: out.map((o) => o.total).join(" / "), rolls: [] };
}
