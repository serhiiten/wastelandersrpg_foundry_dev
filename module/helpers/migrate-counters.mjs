/**
 * The original system's «counter» actor type is gone (author, 2026-11-14): its progress clocks live on as game counters
 * in the panel under «Мапа Пустки» (world setting `gameCounters`). Foundry keeps such actors as invalid documents, with
 * their raw source in `game.actors._source`; the first active Gamemaster turns each into a game counter (name, steps,
 * value, step descriptions), deletes the actor and its tokens, and whispers the actors' own descriptions to the GMs.
 * A counter that doesn't fit under the limit of GC_MAX stays as it is and moves on a later load, once there is room.
 */
import * as G from "../rules/game-counters.mjs";

const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));
const plain = (html) => { const d = document.createElement("div"); d.innerHTML = String(html ?? ""); return d.textContent.trim(); };

export async function migrateCounterActors() {
  if (!game.user.isGM || !game.users.activeGM?.isSelf) return;
  const sources = (game.actors._source ?? []).filter((d) => d?.type === "counter" && game.actors.invalidDocumentIds.has(d._id));
  if (!sources.length) return;

  const sys = game.system.id;
  let list = G.normalizeList(game.settings.get(sys, "gameCounters"));
  const scenes = game.scenes.map((sc) => sc.getFlag(sys, "sceneCounters")?.length || 0);
  const done = [], notes = [], left = [];
  for (const src of sources) {
    const r = G.isFullTotal(Math.max(0, ...scenes), list.length) ? null : G.addCounter(list, G.fromCounterActor(src));
    if (!r) { left.push(src.name); continue; }
    list = r.list;
    done.push(src._id);
    const note = plain(src.system?.description);
    notes.push(`<li><b>${esc(r.counter.name)}</b>: ${r.counter.val} з ${r.counter.size}${note ? ` — ${esc(note)}` : ""}</li>`);
  }
  if (!done.length) return ui.notifications.warn(`Старі лічильники-актори не вмістилися в панель (${G.LC_FULL_TEXT}).`);

  await game.settings.set(sys, "gameCounters", list);
  for (const scene of game.scenes) {
    const ids = scene.tokens.filter((t) => done.includes(t.actorId)).map((t) => t.id);
    if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
  }
  await Actor.implementation.deleteDocuments(done);

  const content = `<div class="pust-chat pust-tcard pust-chat-gcounter"><h3><i class="fa-solid fa-hourglass-half"></i><span>Лічильники гри</span></h3>`
    + `<div class="tscreen"><p>Старі лічильники-актори тепер у панелі «Лічильники» під «Мапою Пустки»:</p><ul>${notes.join("")}</ul>`
    + (left.length ? `<p>Не вмістилися (межа ${G.GC_MAX}), перенесуться під час наступного завантаження, коли звільниться місце: ${left.map(esc).join(", ")}.</p>` : "")
    + `</div></div>`;
  // a note for the GMs only, whatever the chat mode (postChat would follow the mode menu)
  await ChatMessage.implementation.create({ content, speaker: { alias: "Термінал Доглядача" }, whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id) });
}
