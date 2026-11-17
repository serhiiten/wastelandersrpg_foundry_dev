/**
 * «Битви» → Foundry: «Додати теку в Актори» puts the generated enemies into a folder of the Actors
 * directory («Битви» → «Звірі · Важка»); «Розмістити» also places their tokens on the current scene.
 * No combat is started: the GM does that in Foundry when ready.
 *
 * Enemies come from the system's «opponents» compendium by name (the wiki's texts and pictures); one not
 * found there becomes an enemy actor built from the generator's own data. An actor already in the battle's
 * folder is reused, so pressing both buttons does not make doubles. Tokens are unlinked and get personal
 * names: the travel battle's names (Горкі й Моркі…) or «Ім'я 2»; personal names are rolled by the GM on the card.
 */
import { variantTextures } from "../helpers/token-variants.mjs";
import { tokenLevel } from "../helpers/token-level.mjs";
import { enemyFromRecord } from "../rules/battle.mjs";
import { toSystem } from "../rules/enemy-model.mjs";
import { kindTokens } from "../rules/enemy-kinds.mjs";
import { notify } from "../helpers/notify.mjs";

/** Actor data of a group enemy made one concrete kind (author, 2026-11-16): its name, its token as picture and token */
export function asKind(data, kind) {
  const tok = kindTokens(kind)[0];
  data.name = kind;
  foundry.utils.setProperty(data, "prototypeToken.name", kind);
  if (tok) {
    const src = `systems/${game.system.id}/assets/tokens/${tok}`;
    data.img = src;
    foundry.utils.setProperty(data, "prototypeToken.texture.src", src);
  }
  return data;
}

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
/** The battle generator's record of an enemy by its own or its compendium name (they differ: «Бандит/мафіозі/…» ↔
 *  «Бандити, мафіозі, …»); T = createTerminal() */
export function generatorRecord(T, name) {
  const BT = T.battle.BT;
  for (const fk of Object.keys(BT.DB)) for (const c of BT.ORDER) for (const e of BT.DB[fk][c] || []) {
    if (e.name === name || opponentName(e.name) === name) return e;
  }
  return null;
}

/** The compendium name to look for */
export const opponentName = (name) => OPPONENT_ALIASES[String(name).replace(/[‐-―]/g, "-")] || OPPONENT_ALIASES[name] || name;
const esc = (s) => foundry.utils.escapeHTML(String(s ?? ""));

const DIFF = { easy: "Легка", medium: "Середня", hard: "Важка", deadly: "Смертельна" };

/** The battle's folder in the Actors directory: «Битви» → «<види> · <складність>» */
export async function battleFolder(title, diff) {
  const Folder_ = Folder.implementation;
  const parent = game.folders.find((f) => f.type === "Actor" && f.name === FOLDER && !f.folder)
    || await Folder_.create({ name: FOLDER, type: "Actor", color: "#9a4a20" });
  const name = [title, DIFF[diff]].filter(Boolean).join(" · ") || "Битва";
  return game.folders.find((f) => f.type === "Actor" && f.name === name && f.folder?.id === parent.id)
    || Folder_.create({ name, type: "Actor", folder: parent.id });
}

let indexCache = null;
async function opponentIndex() {
  if (indexCache) return indexCache;
  const pack = game.packs.get(`${game.system.id}.opponents`);
  indexCache = pack ? [...(await pack.getIndex({ fields: ["prototypeToken.texture.src"] }))].filter((e) => e.type === "enemy") : [];
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
  // the tracker's card as data (module/rules/enemy-model.mjs); the description stays for reading
  return { name: e.name, type: "enemy", system: toSystem(enemyFromRecord(e), { description }) };
}

/** The world actor for one generated enemy (reused from the «Битви» folder, or created) */
async function enemyActor(T, e, folder) {
  const have = game.actors.find((a) => a.type === "enemy" && a.folder?.id === folder.id && [norm(e.name), norm(opponentName(e.name))].includes(norm(a.name)));
  if (have) return have;
  const hit = (await opponentIndex()).find((x) => norm(x.name) === norm(opponentName(e.group || e.name)));
  let data;
  if (hit) {
    const doc = await fromUuid(hit.uuid);
    data = doc.toObject();
    delete data._id;
    foundry.utils.setProperty(data, "_stats.compendiumSource", hit.uuid);
  } else data = enemyFromGenerator(T, e);
  if (e.group) asKind(data, e.name); // «Щур», not «Маленькі тварини…»
  data.folder = folder.id;
  foundry.utils.setProperty(data, "flags.pust.battleMade", true); // made for this battle: goes with its last token (wastelanders.mjs mapBound)
  return Actor.implementation.create(data);
}

/** The token picture of a generated enemy (the «Битви» chips; author, 2026-11-16): the world actor's in «Битви», else the
 *  compendium's, else Foundry's blank one */
export async function generatedEnemyImg(name, group = "") {
  const keys = [norm(name), norm(opponentName(name))];
  const parent = game.folders.find((f) => f.type === "Actor" && f.name === FOLDER && !f.folder);
  const inBattles = (a) => { let f = a.folder; while (f) { if (f.id === parent?.id) return true; f = f.folder; } return false; };
  const have = parent && game.actors.find((a) => a.type === "enemy" && inBattles(a) && keys.includes(norm(a.name)));
  if (have) return have.prototypeToken?.texture?.src || have.img;
  const tok = kindTokens(name)[0];
  if (tok) return `systems/${game.system.id}/assets/tokens/${tok}`;
  const hit = (await opponentIndex()).find((x) => norm(x.name) === norm(opponentName(group || name)));
  return hit?.prototypeToken?.texture?.src || hit?.img || "icons/svg/mystery-man.svg";
}

/**
 * A chip of the generated battle dropped on the scene (author, 2026-11-16): the enemy's actor in the battle's folder
 * («Битви → …», made or reused, a group as its concrete kind) and one unlinked token at the drop point, a face of its
 * kind, named after it («Ім'я N» when the scene already has some of them).
 */
export async function dropGeneratedEnemy(T, st, name, point) {
  if (!game.user.isGM) return notify.warn("Битву веде Доглядач.");
  const last = st.battle.state?.last;
  const entry = last?.allocations.flatMap((a) => a.entries).find((x) => x.enemy?.name === name);
  const scene = canvas?.scene;
  if (!entry || !scene) return;
  const folder = await battleFolder(T.battle.BT.kindName(last.factionKey), st.battle.state.difficulty);
  const actor = await enemyActor(T, entry.enemy, folder);
  const same = scene.tokens.filter((t) => t.name === actor.name || t.name.startsWith(`${actor.name} `)).length;
  const [tex] = variantTextures(scene, actor, 1) ?? [];
  const td = await actor.getTokenDocument({ name: same ? `${actor.name} ${same + 1}` : actor.name, actorLink: false, ...tokenLevel(scene), ...(tex ? { texture: { src: tex } } : {}) });
  const g = scene.grid.size;
  const at = canvas.grid.getSnappedPoint({ x: point.x - (td.width * g) / 2, y: point.y - (td.height * g) / 2 }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_CORNER, resolution: 1 });
  return scene.createEmbeddedDocuments("Token", [{ ...td.toObject(), x: at.x, y: at.y }], { pustTokens: true });
}

/**
 * A chip of the generated battle clicked (author, 2026-11-16): its enemy's card — the world actor already made for this
 * battle («Битви» folder) when there is one, else the «opponents» compendium's card, else a card built from the
 * generator's own data and kept in memory (nothing is added to the world).
 */
export async function openGeneratedEnemy(T, st, name) {
  const last = st.battle.state?.last;
  const entry = last?.allocations.flatMap((a) => a.entries).find((x) => x.enemy?.name === name);
  if (!entry) return;
  const e = entry.enemy, keys = [norm(e.name), norm(opponentName(e.name))];
  const parent = game.folders.find((f) => f.type === "Actor" && f.name === FOLDER && !f.folder);
  const inBattles = (a) => { let f = a.folder; while (f) { if (f.id === parent?.id) return true; f = f.folder; } return false; };
  const have = parent && game.actors.find((a) => a.type === "enemy" && inBattles(a) && keys.includes(norm(a.name)));
  const hit = !have && (await opponentIndex()).find((x) => norm(x.name) === norm(opponentName(e.group || e.name)));
  let actor = have || (hit ? await fromUuid(hit.uuid) : new Actor.implementation(asKind(enemyFromGenerator(T, e), e.name)));
  // a group made one kind: the compendium's card under the kind's name and picture, in memory
  if (hit && e.group) { const data = actor.toObject(); delete data._id; actor = new Actor.implementation(asKind(data, e.name)); }
  if (!actor) return;
  actor.sheet.openFold?.("details"); // «Деталі» open (author, 2026-11-16)
  return actor.sheet.render(true);
}

/**
 * Token names for count enemies of one record: the names the travel event already gave them, else the kind's name
 * («Ім'я N» when there are several). No personal names rolled (author, 2026-11-14): the GM rolls one from the card.
 */
function personalNames(T, e, count, travelNames, used) {
  const given = (travelNames || []).find((x) => x.base === e.name || (e.group && x.base === e.group))?.names || [];
  return Array.from({ length: count }, (_, i) => {
    let n = given[i] || (count > 1 ? `${e.name} ${i + 1}` : e.name);
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
 * @param mode   "folder" — actors into the battle's folder; "place" — the same, plus tokens on the current scene
 */
export async function createBattle(T, st, mode = "folder") {
  if (!game.user.isGM) return notify.warn("Битву веде Доглядач.");
  const last = st.battle.state?.last;
  if (!last) return;
  const entries = last.allocations.flatMap((a) => a.entries).filter((e) => e.count > 0);
  const scene = mode === "place" ? game.scenes.viewed : null;
  if (mode === "place" && !scene) return notify.warn("Немає відкритої сцени: відкрий сцену, щоб розмістити токени.");
  const folder = await battleFolder(T.battle.BT.kindName(last.factionKey), st.battle.state.difficulty);
  const actors = [];
  for (const e of entries) actors.push({ e, count: e.count, actor: await enemyActor(T, e.enemy, folder) });
  const where = `«${FOLDER} → ${folder.name}»`;
  if (mode !== "place") {
    notify.info(`В Актори додано теку ${where}: ${actors.map((x) => `${x.actor.name} × ${x.count}`).join(", ")}. Перетягни їх на сцену або натисни «Розмістити на сцені».`);
    return actors.map((x) => x.actor);
  }
  const used = new Set();
  const total = actors.reduce((n, x) => n + x.count, 0);
  // «Бойова мапа» with zones (author, 2026-11-14): each kind of enemy into the next zone in turn, on free cells under its
  // strip; the battle's place and hazard go onto the scene too. Elsewhere: around the view's centre, as before.
  const { isBattleScene } = await import("../helpers/default-scene.mjs");
  const zones = isBattleScene(scene) ? (await import("../canvas/battle-zones.mjs")).sceneZones(scene) : [];
  const { zoneCells } = zones.length ? await import("./battle-panel.mjs") : {};
  if (isBattleScene(scene)) {
    const S = T.battle.BT.BT_SCENE ?? {};
    // shared by every scene (helpers/scene-shared.mjs; author, 2026-11-16)
    const upd = {};
    if (S.place) upd.place = S.place;
    if (S.hazard) upd.hazard = S.hazard;
    if (Object.keys(upd).length) await (await import("../helpers/scene-shared.mjs")).sharedSet(upd);
  }
  const free = zones.length ? null : spots(scene, total);
  const tokens = [];
  let zi = 0;
  const seen = { tokens: [...scene.tokens].map((t) => ({ texture: { src: t.texture.src } })) };
  for (const { e, count, actor } of actors) {
    // different faces of one kind (token-variants.mjs), counting the ones given earlier in this same battle
    const tex = variantTextures(seen, actor, count);
    let ti = 0;
    // as many cells as this kind needs plus the ones earlier kinds took here (author, 2026-11-16: two kinds shared a cell)
    const cells = zones.length ? zoneCells(scene, zones[zi++ % zones.length], count + tokens.length) : null;
    // cells already given to an earlier kind in this same battle are taken now
    if (cells) for (const t of tokens) { const k = cells.findIndex((c) => c.x === t.x && c.y === t.y); if (k >= 0) cells.splice(k, 1); }
    for (const name of personalNames(T, e.enemy, count, st.battle.names, used)) {
      const pos = cells ? (cells.shift() ?? { x: zones[0].x, y: zones[0].y + scene.grid.size }) : free.shift();
      const td = await actor.getTokenDocument({ ...pos, name, actorLink: false, ...tokenLevel(scene), ...(tex ? { texture: { src: tex[ti++] } } : {}) });
      tokens.push(td.toObject());
      seen.tokens.push({ texture: { src: td.texture.src } });
    }
  }
  const made = await scene.createEmbeddedDocuments("Token", tokens, { pustTokens: true });
  notify.info(`Токени на сцені «${scene.name}»: ${made.length}. Супротивники — в Акторах, у теці ${where}. Бій почни, коли будеш готовий.`);
  return made;
}
