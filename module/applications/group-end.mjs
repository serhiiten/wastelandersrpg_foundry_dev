/**
 * «Кінець сцени» / «Новий день» / «Кінець сесії» for the whole group (author, 2026-11-17; feedback p5): the GM's row at the
 * foot of the panels «Сцена» / «Битва». Every character assigned to a player (User Configuration → Player Character) gets
 * the sheet's own action, no sheet needs to be open; «Скинути ходи ворогів» also clears «використано» on every move of the
 * enemies on the viewed scene. One chat card for all: the general line, then a line for each character something
 * happened to. «Кінець сесії» asks once. Every one of them ends the scene, so the round goes back to 1 and the GM's Fate
 * tokens are set as «За гравцями» of the panel (`fate`; author, 2026-11-17); the card says the round, never the tokens.
 */
import { readState, runAction } from "./character-actions.mjs";
import { fateNow } from "./fate-card.mjs";
import { postChat } from "./chat.mjs";
import { sharedSet } from "../helpers/scene-shared.mjs";
import { GROUP_END, ownPart, resetMoves } from "../rules/group-end.mjs";
import { backLine, chemReset, usedNames } from "../rules/perk-uses.mjs";
import { clearDefibs } from "./caravan-defib.mjs";
import { rollCaravanSuperDice } from "./caravan-superdice.mjs";
import { notify } from "../helpers/notify.mjs";
import { clearAllStates, hiddenRow, whisperGM } from "./states.mjs";
import { sceneEndHealth } from "../rules/battle-health.mjs";
import { compute } from "../rules/core.mjs";
import { endSceneInvokes } from "./battle-health.mjs";

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

/**
 * Whom «Кінець сцени» / «Новий день» / «Кінець сесії» take (author, 2026-11-20): the group's characters and every character
 * with a token on the viewed scene, assigned to a player or not; each once
 */
export function endCharacters() {
  const out = new Map(groupCharacters().map((a) => [a.uuid, a]));
  for (const t of canvas?.scene?.tokens ?? []) if (t.actor?.type === "character" && !out.has(t.actor.uuid)) out.set(t.actor.uuid, t.actor);
  return [...out.values()];
}

/** The group's session number (each character keeps its own; author, 2026-11-17): «3», or «2–3» when they differ */
export function groupSession() {
  const ns = groupCharacters().map((a) => { try { return Number(readState(a).chem?.session) || 1; } catch (_) { return 1; } });
  if (!ns.length) return { label: "—", list: [] };
  const lo = Math.min(...ns), hi = Math.max(...ns);
  return { label: lo === hi ? String(lo) : `${lo}–${hi}`, list: groupCharacters().map((a, i) => `${a.name}: ${ns[i]}`) };
}

/** The group's counters back to session 1, day 1, scene 1 (the sheet's «Скинути»; addictions' clocks, perks' marks too) */
export async function resetGroupCounters() {
  const chars = groupCharacters();
  if (!chars.length) return notify.warn("Жодного персонажа не призначено гравцям.");
  // the day's help mark too (A7); the session's failures of «Старанний учень» (A10)
  for (const a of chars) await runAction(a, (st, L) => { delete st.medDay; if (st.chem && "studFails" in st.chem) delete st.chem.studFails; return chemReset(st, L); }, { quiet: true });
  notify.info(`Відлік скинуто: сесія 1, день 1, сцена 1 (${chars.map((a) => a.name).join(", ")}).`);
}

/** The text split into sentences, one item each */
const sentences = (t) => String(t || "").split(/(?<=[.!?])\s+(?=[А-ЯІЇЄҐA-Z«(0-9])/).map((x) => x.trim()).filter(Boolean);

/**
 * The chat card (author, 2026-11-17: as handsome as the damage cards): a header in the kind's colours with chips («Коло дій 1»,
 * the enemies whose moves came back), the general line, then a row for every character: the portrait, the name, the change of
 * ОЗ as a big number and the Fate tokens restored on the right, its own events under them («без змін» when none).
 * `gm`: the hidden tokens' rows whispered to the GMs (author, 2026-11-20): the chip «Доглядачу», no general line
 */
function endCard(kind, def, rows, movesN, { gm = false } = {}) {
  const chips = [gm ? `<span class="pust-end-chip" title="Бачить лише Доглядач"><i class="fa-solid fa-eye-slash"></i>Доглядачу</span>`
    : `<span class="pust-end-chip" title="Нова сцена починається з першого кола дій"><i class="fa-solid fa-rotate"></i>Коло дій 1</span>`];
  if (movesN != null) chips.push(`<span class="pust-end-chip" title="Ворогів сцени, яким повернуто використані ходи"><i class="fa-solid fa-skull"></i>Ходи ворогів: ${movesN}</span>`);
  const row = (r) => {
    const marks = [];
    if (r.xp) marks.push(`<span class="pust-end-xp" title="Очки досвіду за сесію">+${r.xp} ОД</span>`); // A10
    if (r.hp) marks.push(`<span class="pust-end-hp ${r.hp > 0 ? "gain" : "lost"}" title="Зміна ОЗ, тепер ${r.hpNow}">${r.hp > 0 ? "+" : "−"}${Math.abs(r.hp)} ОЗ</span>`);
    if (r.fd != null && r.fd0 != null && r.fd > r.fd0) marks.push(`<span class="pust-end-fd" title="Жетони Долі відновлено"><i class="fa-solid fa-clover"></i>${r.fd}</span>`);
    const items = r.items.length ? `<ul>${r.items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : `<div class="pust-end-quiet">без змін</div>`;
    return `<div class="pust-end-row${r.bad ? " bad" : ""}"><div class="pust-end-main"><img src="${esc(r.img)}" alt=""><span class="pust-end-name">${esc(r.name)}</span>${marks.join("")}</div>${items}</div>`;
  };
  return `<div class="pust-chat pust-endcard pust-end-${kind}"><div class="pust-end-hd"><i class="fa-solid ${def.icon}"></i><span class="pust-end-title">${def.title}</span>${chips.join("")}</div>`
    + (rows.length ? `${gm ? "" : `<p class="pust-end-gen">${def.gen}</p>`}<div class="pust-end-list">${rows.map(row).join("")}</div>` : `<p class="pust-end-gen">Жодного персонажа не призначено гравцям.</p>`) + `</div>`;
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

/**
 * `xp` (A10): Map uuid → { n, why } from «Кінець сесії: ОД»; the ОД are added in the same write as the character's end of the
 * session (Fable's verdict, 2026-11-21: no ОД without the end, never twice). `asked`: that window was the confirmation.
 */
export async function endForAll(kind, { moves = false, fate = null, xp = null, asked = false } = {}) {
  const def = GROUP_END[kind];
  if (!def || !game.user.isGM) return;
  const chars = endCharacters();
  if (!chars.length && !moves) {
    if (kind !== "session") await clearDefibs(); // the caravans' marks end with the scene even with no characters assigned (a session asks first)
    return notify.warn("Жодного персонажа не призначено гравцям. Признач їх у налаштуваннях гравців (Player Character).");
  }
  if (kind === "session" && !asked) {
    const yes = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Кінець сесії" },
      content: `<p>Завершити сесію для ${chars.length ? chars.map((a) => `«${esc(a.name)}»`).join(", ") : "групи"}?</p><p>Спершу завершиться сцена; Жетони Долі відновляться, модифікації знову дадуть безкоштовне Посилення.</p>`,
    });
    if (!yes) return;
  }
  // a row for every character: what changed in ОЗ and Fate tokens (read from the character before and after), its own events
  const rows = [];
  for (const a of chars) {
    const hp0 = Number(a.system.hp?.value) || 0, fd0 = fateNow(a);
    const give = kind === "session" ? xp?.get(a.uuid) : null;
    try {
      // the perks' marks that this time clears are named too (playtest 2026-11-18, item 7: «Залізячник» came back, the card
      // said «без змін»)
      const { msg, back } = await runAction(a, (st, L) => {
        const was = usedNames(st);
        L[def.fn]();
        // the free invokes, 19+ of «Отримання наслідків», the doomed (author, 2026-11-21; rules/battle-health.mjs)
        sceneEndHealth(st, L, compute(st));
        if (give?.n > 0) st.xp = (Number(st.xp) || 0) + give.n; // A10
        return { msg: L.chem().last, back: backLine(was, st) };
      }, { quiet: true });
      const hp = Number(a.system.hp?.value) || 0;
      const items = sentences(ownPart(msg));
      if (back) items.push(back);
      if (give?.n > 0 && give.why) items.push(`ОД: ${give.why}`);
      rows.push({ uuid: a.uuid, name: a.name, img: a.img, items, hp: hp - hp0, hpNow: hp, fd0, fd: fateNow(a), xp: give?.n || 0 });
    } catch (err) {
      console.error(err);
      rows.push({ name: a.name, img: a.img, items: [`Не вдалося застосувати: аркуш пошкоджений.${give?.n ? " ОД не нараховано." : ""}`], bad: true, hp: 0, fd0, fd: fd0 });
    }
  }
  await clearDefibs(); // the caravans' «Дефібрилятор» marks end with the scene (author, 2026-11-18)
  // the caravans' deferred dice of «Критфікс» are rolled and taken now, a row each in the card (author, 2026-11-18)
  rows.push(...await rollCaravanSuperDice());
  const sharedUpd = { round: 1 };
  if (fate != null) sharedUpd.fate = Math.max(0, fate);
  await sharedSet(sharedUpd);
  let movesN = 0;
  if (moves) {
    for (const e of sceneEnemies()) {
      // the last hit's record for undo goes too (Fable's verdict, 2026-11-19: cleared by the scene's end)
      const hit = e.getFlag?.(game.system.id, "lastHit");
      if (hit) await e.unsetFlag(game.system.id, "lastHit");
      const next = resetMoves(e.system?.moves);
      if (!next) continue;
      await e.update({ "system.moves": next });
      movesN++;
    }
  }
  // the states put on by enemies' moves end with the scene, their aspects too (author, 2026-11-20)
  // the aspects taken off are said in the card (author, 2026-11-20): in a character's row, a row of their own for the others
  // a hidden token's own row goes to the GMs in a whisper (author, 2026-11-20)
  // the attacks still waiting for an avoidance are taken back, nothing dealt (A1; Fable: an old card mustn't hit next scene)
  await (await import("./pending-attack.mjs")).cancelOpenPending();
  const hidRows = [];
  for (const g of await clearAllStates()) {
    const item = `Аспекти зникли: ${g.gone.map((t) => `«${t}»`).join(", ")}.`;
    const r = rows.find((x) => x.uuid === g.actor.uuid);
    if (r) r.items.push(item);
    else (hiddenRow(g) ? hidRows : rows).push({ uuid: g.actor.uuid, name: g.name, img: g.img, items: [item], hp: 0 });
  }
  // the free invokes of the scene's enemies and zones (A5, author 2026-11-21): the aspects stay
  for (const g of await endSceneInvokes()) (g.hidden ? hidRows : rows).push({ name: g.name, img: g.img, items: g.items, hp: 0 });
  await postChat({ speaker: { alias: def.title }, content: endCard(kind, def, rows, moves ? movesN : null) });
  if (hidRows.length) await whisperGM({ alias: def.title }, endCard(kind, def, hidRows, null, { gm: true }));
  notify.info(`${def.title}: ${chars.length} ${chars.length === 1 ? "персонаж" : chars.length < 5 && chars.length > 1 ? "персонажі" : "персонажів"}. Коло дій 1${fate != null ? `, жетонів Долі Доглядача: ${Math.max(0, fate)}` : ""}.`);
  return true;
}
