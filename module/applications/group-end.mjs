/**
 * «Кінець сцени» / «Новий день» / «Кінець сесії» for the whole group (author, 2026-11-17; feedback p5): the GM's row at the
 * foot of the panels «Сцена» / «Битва». Every character assigned to a player (User Configuration → Player Character) gets
 * the sheet's own action, no sheet needs to be open; «Скинути ходи ворогів» also clears «використано» on every move of the
 * enemies on the viewed scene. One chat card for all: the general line, then a line for each character something
 * happened to. «Кінець сесії» asks once. Every one of them ends the scene, so the round goes back to 1 and the GM's Fate
 * tokens are set as «За гравцями» of the panel (`fate`; author, 2026-11-17); the card says the round, never the tokens.
 */
import { readState, runAction } from "./character-actions.mjs";
import { postChat } from "./chat.mjs";
import { sharedSet } from "../helpers/scene-shared.mjs";
import { GROUP_END, ownPart, resetMoves } from "../rules/group-end.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

/** the characters assigned to players, each once */
export function groupCharacters() {
  const out = new Map();
  for (const u of game.users) {
    const a = u.character;
    if (!u.isGM && a?.type === "character" && !out.has(a.id)) out.set(a.id, a);
  }
  return [...out.values()];
}

/** The group's session number (each character keeps its own; author, 2026-11-17): «3», or «2–3» when they differ */
export function groupSession() {
  const ns = groupCharacters().map((a) => { try { return Number(readState(a).chem?.session) || 1; } catch (_) { return 1; } });
  if (!ns.length) return { label: "—", list: [] };
  const lo = Math.min(...ns), hi = Math.max(...ns);
  return { label: lo === hi ? String(lo) : `${lo}–${hi}`, list: groupCharacters().map((a, i) => `${a.name}: ${ns[i]}`) };
}

/** The group's counters back to session 1, day 1, scene 1 (the sheet's «Скинути»; addictions' clocks too) */
export async function resetGroupCounters() {
  const chars = groupCharacters();
  if (!chars.length) return ui.notifications.warn("Жодного персонажа не призначено гравцям.");
  for (const a of chars) await runAction(a, (st, L) => L.chemAct("chem-reset", { dataset: {} }), { quiet: true });
  ui.notifications.info(`Відлік скинуто: сесія 1, день 1, сцена 1 (${chars.map((a) => a.name).join(", ")}).`);
}

/** the enemies of the viewed scene: a linked one once, an unlinked one by its token */
function sceneEnemies() {
  const seen = new Set(), out = [];
  for (const t of canvas?.scene?.tokens ?? []) {
    const a = t.actor;
    if (a?.type !== "enemy") continue;
    const key = t.actorLink ? a.id : t.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

export async function endForAll(kind, { moves = false, fate = null } = {}) {
  const def = GROUP_END[kind];
  if (!def || !game.user.isGM) return;
  const chars = groupCharacters();
  if (!chars.length && !moves) return ui.notifications.warn("Жодного персонажа не призначено гравцям. Признач їх у налаштуваннях гравців (Player Character).");
  if (kind === "session") {
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Кінець сесії" },
      content: `<p>Завершити сесію для ${chars.length ? chars.map((a) => `«${esc(a.name)}»`).join(", ") : "групи"}?</p><p>Спершу завершиться сцена; Жетони Долі відновляться, модифікації знову дадуть безкоштовне Посилення.</p>`,
    });
    if (!yes) return;
  }
  const rows = [];
  for (const a of chars) {
    try {
      const msg = await runAction(a, (st, L) => { L[def.fn](); return L.chem().last; }, { quiet: true });
      const own = ownPart(msg);
      if (own) rows.push({ name: a.name, text: own });
    } catch (err) {
      console.error(err);
      rows.push({ name: a.name, text: "Не вдалося застосувати: аркуш пошкоджений.", bad: true });
    }
  }
  const sharedUpd = { round: 1 };
  if (fate != null) sharedUpd.fate = Math.max(0, fate);
  await sharedSet(sharedUpd);
  let movesN = 0;
  if (moves) {
    for (const e of sceneEnemies()) {
      const next = resetMoves(e.system?.moves);
      if (!next) continue;
      await e.update({ "system.moves": next });
      movesN++;
    }
  }
  const who = chars.length ? `<p class="pust-end-who">${chars.map((a) => esc(a.name)).join(" · ")}</p>` : "";
  const list = rows.length ? `<ul>${rows.map((r) => `<li${r.bad ? ' class="bad"' : ""}><b>${esc(r.name)}</b> ${esc(r.text)}</li>`).join("")}</ul>` : "";
  const mv = moves ? `<p class="pust-end-mv"><i class="fa-solid fa-skull"></i> ${movesN ? `Ходи ворогів сцени скинуто: ${movesN}.` : "У ворогів сцени не було використаних ходів."}</p>` : "";
  await postChat({
    speaker: { alias: def.title },
    content: `<div class="pust-chat pust-endcard pust-end-${kind}"><div class="pust-end-hd"><i class="fa-solid ${def.icon}"></i><span>${def.title}</span></div>
      <div class="pust-end-body">${chars.length ? `<p>${def.gen}</p>` : ""}${who}${list}${mv}<p class="pust-end-mv"><i class="fa-solid fa-rotate"></i> Коло дій знову перше.</p></div></div>`,
  });
  ui.notifications.info(`${def.title}: ${chars.length} ${chars.length === 1 ? "персонаж" : chars.length < 5 && chars.length > 1 ? "персонажі" : "персонажів"}. Коло дій 1${fate != null ? `, жетонів Долі Доглядача: ${Math.max(0, fate)}` : ""}.`);
  return true;
}
