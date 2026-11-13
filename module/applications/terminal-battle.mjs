/**
 * «Битви» → Foundry: create the generated enemies as actors, and optionally place their tokens on the
 * current scene and start a combat with them.
 *
 * Enemies come from the system's «opponents» compendium by name (the wiki's texts and pictures); one not
 * found there becomes an enemy actor built from the generator's own data. Actors go to the «Битви» folder
 * and are reused when an actor of the same name is already there. Tokens are unlinked and get personal
 * names: the travel battle's names (Горкі й Моркі…), the HTML tracker's name pools for humanoids, or «Ім'я 2».
 */
import { armorOf } from "./terminal-view.mjs";

const FOLDER = "Битви";
const norm = (s) => String(s || "").toLowerCase().replace(/[‐-―]/g, "-").replace(/[’ʼ']/g, "'").replace(/[^\p{L}\p{N}]/gu, "");

/** Battle generator name → the opponents compendium's (wiki's) name, where they differ */
export const OPPONENT_ALIASES = {
  "Бандит/мафіозі/рейдер/дикун": "Бандити, мафіозі, рейдери та дикуни",
  "Ватажок/Воєвода": "Ватажки бандитів, мафіозі, рейдерів, дикунів",
  "Мольфар/відун/дивний": "Мольфари, відуни, дивні",
  "Великий бос/Вождь племені": "Великий бос рейдерів/Бос кримінальної родини/Вождь племені",
  "Маленькі тварини/мутанти (дутні, щури, собаки, радтаргани)": "Маленькі тварини та мутанти (дутні, щури, собаки, радтаргани)",
  "Бойовий пес Легіону": "Бойовий пес",
  "Рядовий НКР": "Рядовий армії НКР",
  "Лейтенант НКР": "Лейтенант армії НКР",
  "Штурмовик НКР": "Штурмовик армії НКР",
  "Протектрон Братства": "Протектрон",
  "Протектрон Анклаву": "Протектрон",
  "Містер Сміливець Братства": "Містер Сміливець",
  "Містер Сміливець Анклаву": "Містер Сміливець",
  "Вертиберд Братства": "Вертиберд",
  "Вертиберд Анклаву": "Вертиберд",
  "Кіберпес Анклаву": "Кіберпес",
};
/** The compendium name to look for */
export const opponentName = (name) => OPPONENT_ALIASES[String(name).replace(/[‐-―]/g, "-")] || OPPONENT_ALIASES[name] || name;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

async function battleFolder() {
  return game.folders.find((f) => f.type === "Actor" && f.name === FOLDER && !f.folder)
    || Folder.implementation.create({ name: FOLDER, type: "Actor", color: "#9a4a20" });
}

let indexCache = null;
async function opponentIndex() {
  if (indexCache) return indexCache;
  const pack = game.packs.get(`${game.system.id}.opponents`);
  indexCache = pack ? [...(await pack.getIndex())].filter((e) => e.type === "enemy") : [];
  return indexCache;
}

/** Enemy actor data from the generator's own record (when the compendium has no such enemy) */
function enemyFromGenerator(T, e) {
  const B = T.battle.BT;
  const list = (title, items) => (items.length ? `<p><strong>${title}:</strong></p><ul>${items.map((x) => `<li>${x}</li>`).join("")}</ul>` : "");
  const attacks = B.splitAttacks(e.dmg).map((a) => { const q = B.attackParts(a); return `<strong>${esc(q.name)}</strong> ${esc(q.rest)}`; });
  const aspects = (e.aspects || []).flatMap((a) => String(a).split(/\s*;\s*/)).filter(Boolean).map(esc);
  const moves = (e.moves || []).map((m) => `<strong>${esc(m.n)}:</strong> ${esc(m.t)}`);
  const description = `<ul><li><strong>ОЗ:</strong> ${+e.hp || 0}</li><li><strong>Броня:</strong> ${esc(e.armor)}</li></ul>`
    + list("Атаки", attacks) + list("Аспекти", aspects) + list("Ходи", moves) + (e.notes ? `<p><strong>Примітка:</strong> ${esc(e.notes)}</p>` : "");
  return { name: e.name, type: "enemy", system: { hp: { value: +e.hp || 0, max: +e.hp || 0 }, armor: armorOf(e), description } };
}

/** The world actor for one generated enemy (reused from the «Битви» folder, or created) */
async function enemyActor(T, e, folder) {
  const have = game.actors.find((a) => a.type === "enemy" && a.folder?.id === folder.id && [norm(e.name), norm(opponentName(e.name))].includes(norm(a.name)));
  if (have) return have;
  const hit = (await opponentIndex()).find((x) => norm(x.name) === norm(opponentName(e.name)));
  let data;
  if (hit) {
    const doc = await fromUuid(hit.uuid);
    data = doc.toObject();
    delete data._id;
    foundry.utils.setProperty(data, "_stats.compendiumSource", hit.uuid);
  } else data = enemyFromGenerator(T, e);
  data.folder = folder.id;
  return Actor.implementation.create(data);
}

/** Personal names for count enemies of one record */
function personalNames(T, e, count, travelNames, used) {
  const given = (travelNames || []).find((x) => x.base === e.name)?.names || [];
  return Array.from({ length: count }, (_, i) => {
    let n = given[i] || T.battle.enemyName(e, used) || (count > 1 ? `${e.name} ${i + 1}` : e.name);
    used.add(n);
    return n;
  });
}

/** Free grid cells around the middle of the current view, in rings */
function spots(scene, n) {
  const g = scene.grid.size;
  const c = canvas?.ready && canvas.scene?.id === scene.id ? canvas.stage.pivot : { x: scene.width / 2, y: scene.height / 2 };
  const out = [];
  for (let r = 0; out.length < n && r < 50; r++) {
    for (let dy = -r; dy <= r && out.length < n; dy++) for (let dx = -r; dx <= r && out.length < n; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      out.push({ x: Math.round(c.x / g + dx) * g, y: Math.round(c.y / g + dy) * g });
    }
  }
  return out;
}

/**
 * @param T      createTerminal()
 * @param st     the terminal state (st.battle.state.last, st.battle.names)
 * @param mode   "actors" | "combat"
 */
export async function createBattle(T, st, mode = "actors") {
  if (!game.user.isGM) return ui.notifications.warn("Битву веде Доглядач.");
  const last = st.battle.state?.last;
  if (!last) return;
  const entries = last.allocations.flatMap((a) => a.entries).filter((e) => e.count > 0);
  const scene = mode === "combat" ? game.scenes.viewed : null;
  if (mode === "combat" && !scene) return ui.notifications.warn("Немає відкритої сцени: відкрий сцену, щоб розставити токени.");
  const folder = await battleFolder();
  const actors = [];
  for (const e of entries) actors.push({ e, count: e.count, actor: await enemyActor(T, e.enemy, folder) });
  if (mode !== "combat") {
    ui.notifications.info(`Супротивників створено в теці «${FOLDER}»: ${actors.map((x) => `${x.actor.name} × ${x.count}`).join(", ")}.`);
    return actors.map((x) => x.actor);
  }
  const used = new Set();
  const total = actors.reduce((n, x) => n + x.count, 0);
  const free = spots(scene, total);
  const tokens = [];
  for (const { e, count, actor } of actors) {
    for (const name of personalNames(T, e.enemy, count, st.battle.names, used)) {
      const td = await actor.getTokenDocument({ ...free.shift(), name, actorLink: false });
      tokens.push(td.toObject());
    }
  }
  const made = await scene.createEmbeddedDocuments("Token", tokens);
  const combat = game.combats.find((c) => c.scene?.id === scene.id && !c.started)
    || await Combat.implementation.create({ scene: scene.id, active: true });
  await combat.createEmbeddedDocuments("Combatant", made.map((t) => ({ tokenId: t.id, sceneId: scene.id, actorId: t.actorId })));
  if (!combat.started) await combat.startCombat();
  ui.notifications.info(`Бій почато: ${made.length} супротивників на сцені «${scene.name}».`);
  return made;
}
